import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CONFLICTING_PRESET_IDS,
  EXCLUDED_COMPONENTS,
  SAFE_HOST_PLUGINS,
  SAFE_MODE_IDS,
  SAFE_PRESET_PLUGINS,
  UPSTREAM_ONLY_MODE_IDS,
  planProfile,
  patchMcpStudioClient,
  patchInstalledStageGate,
  patchStageGateIntent,
  resolveSuiteRoot,
  sanitizeModeText,
  UPSTREAM_ARCHIVE,
  UPSTREAM_COMMIT,
} from '../scripts/configure-redteam-suite.mjs'

describe('redteam suite safe integration', () => {
  it('pins the reviewed upstream revision and exposes all safe specialist modes', () => {
    expect(UPSTREAM_COMMIT).toMatch(/^[0-9a-f]{40}$/)
    expect(UPSTREAM_ARCHIVE).toContain(UPSTREAM_COMMIT)
    expect(UPSTREAM_ARCHIVE).toMatch(/^https:\/\/github.com\/SeaOf0\/dsh-redteam-model\/archive\//)
    expect(SAFE_MODE_IDS).toEqual([
      'asset-mapping',
      'attack-defense',
      'binary-analysis',
      'cloud-security',
      'code-audit',
      'ctf-solver',
      'incident-response',
      'pentest',
      'redteam',
    ])
    expect(EXCLUDED_COMPONENTS).toContain('mode:av-evasion')
  })

  it('deploys upstream pentest/redteam because this package owns bughunt instead', () => {
    // This package's own preset id is `bughunt` (挖洞模式), so the upstream
    // `pentest` (渗透测试) and `redteam` (安全研究员) ids are free.
    expect(SAFE_MODE_IDS).toContain('pentest')
    expect(SAFE_MODE_IDS).toContain('redteam')
    expect(CONFLICTING_PRESET_IDS).toEqual([])
    expect(UPSTREAM_ONLY_MODE_IDS).toEqual(['av-evasion'])
    expect(UPSTREAM_ONLY_MODE_IDS).not.toContain('pentest')
    expect(UPSTREAM_ONLY_MODE_IDS).not.toContain('redteam')
  })

  it('ships every declared safe component in the pinned upstream package', () => {
    let root
    try {
      root = resolveSuiteRoot()
    } catch {
      // The collection is no longer a package.json dependency (pnpm 12
      // blockExoticSubdeps). Local/dev trees may still have it cached.
      return
    }
    for (const mode of SAFE_MODE_IDS) {
      const agent = path.join(root, 'modes', mode, 'agent.cordis.yml')
      expect(existsSync(agent), mode).toBe(true)
      expect(sanitizeModeText(readFileSync(agent, 'utf8')), mode).not.toContain('dsh-refusal-guard')
    }
    for (const plugin of [...SAFE_HOST_PLUGINS, ...SAFE_PRESET_PLUGINS]) {
      expect(existsSync(path.join(root, 'plugins', plugin, 'package.json')), plugin).toBe(true)
    }
  })

  it('adds safe plugins once and keeps preset-only tools off the host plane', () => {
    const suiteRoot = path.join('C:', 'suite')
    const profile = planProfile({
      dependencies: {
        '@dsh-external/dsh-refusal-guard': 'link:old',
        '@dsh-external/dsh-webshell-mgr': 'link:old',
      },
      dsh: { profile: { bundles: [
        '@deepseek-ai/dsh-base',
        '@dsh-external/dsh-refusal-guard',
        '@dsh-external/dsh-scanner-tools',
      ] } },
    }, suiteRoot)

    for (const plugin of [...SAFE_HOST_PLUGINS, ...SAFE_PRESET_PLUGINS]) {
      expect(profile.dependencies[`@dsh-external/${plugin}`]).toContain(`/plugins/${plugin}`)
    }
    for (const plugin of SAFE_HOST_PLUGINS) {
      expect(profile.dsh.profile.bundles.filter((name: string) => name === `@dsh-external/${plugin}`)).toHaveLength(1)
    }
    for (const plugin of SAFE_PRESET_PLUGINS) {
      expect(profile.dsh.profile.bundles).not.toContain(`@dsh-external/${plugin}`)
    }
    expect(profile.dependencies).not.toHaveProperty('@dsh-external/dsh-refusal-guard')
    expect(profile.dependencies).not.toHaveProperty('@dsh-external/dsh-webshell-mgr')
  })

  it('replaces anti-refusal prompt text with explicit authorization controls', () => {
    const source = '      Expression discipline (x): bypass. dsh-refusal-guard will retry.\n      keep: true\n'
    const result = sanitizeModeText(source)
    expect(result).not.toContain('dsh-refusal-guard')
    expect(result).toContain('explicit authorization and target scope')
    expect(result).toContain('      keep: true')
  })

  it('patches the MCP Studio route once and preserves its original client', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dsh-suite-'))
    const directory = path.join(root, 'plugins', 'dsh-mcp-studio', 'lib')
    mkdirSync(directory, { recursive: true })
    const file = path.join(directory, 'client.js')
    writeFileSync(file, 'const apiChannel = "/api" + STUDIO_CHANNEL;\n')

    expect(patchMcpStudioClient(root).changed).toBe(true)
    expect(patchMcpStudioClient(root).changed).toBe(false)
    expect(readFileSync(file, 'utf8')).toContain('const apiChannel = STUDIO_CHANNEL;')
    expect(readFileSync(`${file}.before-dsh-pentest-suite.bak`, 'utf8')).toContain('"/api" + STUDIO_CHANNEL')
  })

  it('returns the operation_intent promise so DSH can serialize the tool output', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dsh-suite-'))
    const directory = path.join(root, 'plugins', 'dsh-stage-gate', 'lib')
    mkdirSync(directory, { recursive: true })
    const file = path.join(directory, 'index.js')
    writeFileSync(file, 'ctx.tools.register(defineTool({\n\t\tname: "operation_intent",\n\t\texecute(args, exec) {\n\t\t\t(async () => {\n\t\t\t\treturn { ok: true }\n\t\t\t})()\n\t\t}\n}))\n')

    expect(patchStageGateIntent(root).changed).toBe(true)
    expect(patchStageGateIntent(root).changed).toBe(false)
    expect(readFileSync(file, 'utf8')).toContain('return (async () => {')
    expect(readFileSync(`${file}.before-dsh-pentest-suite.bak`, 'utf8')).toContain('\t\t\t(async () => {')
  })

  it('patches a live profile copy of dsh-stage-gate', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'dsh-home-'))
    const pkg = path.join(home, 'profiles', 'web', 'node_modules', '@dsh-external', 'dsh-stage-gate', 'lib')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(path.join(pkg, 'index.js'), '\t\texecute(args, exec) {\n\t\t\t(async () => {\n\t\t\t\treturn { ok: true }\n\t\t\t})()\n\t\t}\n')
    expect(patchInstalledStageGate(home).changed).toBe(true)
    expect(readFileSync(path.join(pkg, 'index.js'), 'utf8')).toContain('return (async () => {')
  })
})
