/**
 * The pentest bundle package: the patch layer parses and names the rows it
 * composes, the inert node half mounts, and the invariant companion
 * registers over a real Context (covered by the vitest-wide invariant host).
 * @module
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { apply as nodeApply } from '../lib/index.js'

const PATCH_PATH = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const PACKAGE_PATH = fileURLToPath(new URL('../package.json', import.meta.url))
const BUGHUNT_PRESET_PATH = fileURLToPath(new URL('../preset/pentest/agent.cordis.yml', import.meta.url))
const REDTEAM_PRESET_PATH = fileURLToPath(new URL('../preset/redteam/agent.cordis.yml', import.meta.url))
const BUGHUNT_META_PATH = fileURLToPath(new URL('../preset/pentest/preset.yml', import.meta.url))
const REDTEAM_META_PATH = fileURLToPath(new URL('../preset/redteam/preset.yml', import.meta.url))

/** The loader's `!!js` scalar: parse as its raw expression string. */
const jsExprTag = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data: unknown) => typeof data === 'string',
  construct: (data: unknown) => data,
})
const patchSchema = yaml.JSON_SCHEMA.extend(jsExprTag)

describe('pentest bundle', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('the patch layer declares the UI and storage rows, and the route override', () => {
    const patch = yaml.load(readFileSync(PATCH_PATH, 'utf8'), { schema: patchSchema }) as Array<Record<string, unknown>>
    const insert = patch.find(entry => entry.insert !== undefined)
    expect(insert).toBeDefined()
    const rows = (insert!['insert'] as Array<{ id: string; name: string }>).map(row => ({ id: row.id, name: row.name }))
    // Every row resolves to a subpath of the self-contained bundle package,
    // so a single tarball installs the whole mode.
    expect(rows).toEqual([
      { id: 'ui-pentest', name: '@howmp/dsh-pentest/ui-pentest' },
      { id: 'storage-sqlite', name: '@howmp/dsh-pentest/storage-sqlite' },
    ])
    const sqlite = insert!['insert'].find((row: { id: string }) => row.id === 'storage-sqlite') as { config?: { path?: string } }
    expect(sqlite.config).toEqual({ path: "dshHomePath('storages', 'pentest-sessions.db')" })
    const override = patch.find(entry => entry.id === 'storage-domain') as { config: { backend: string; routes: Record<string, string> } }
    expect(override.config).toMatchObject({ backend: 'json', routes: { pentest: 'sqlite' } })
    const presetRoot = patch.find(entry => {
      const inserted = entry.insert as Array<{ id: string; name: string }> | undefined
      return inserted?.some(row => row.id === 'pentest-preset-root')
    })
    expect(presetRoot).toBeDefined()
    expect((presetRoot!.insert as Array<{ id: string; name: string }>)).toEqual([
      { id: 'pentest-preset-root', name: '@howmp/dsh-pentest/preset-root' },
    ])
    const burp = patch.find(entry => {
      const inserted = entry.insert as Array<{ id: string; name: string }> | undefined
      return inserted?.some(row => row.id === 'burp-mcp')
    })
    expect((burp!.insert as Array<{ id: string; name: string }>)).toEqual([
      { id: 'burp-mcp', name: '@howmp/dsh-pentest/burp-mcp' },
    ])
  })

  it('declares the sqlite backend runtime import contract', () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8')) as {
      dependencies?: Record<string, string>
      exports?: Record<string, string>
      files?: string[]
      bin?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    expect(manifest.dependencies?.['@deepseek-ai/schemastery']).toBe('3.18.1')
    expect(manifest.peerDependencies?.['@deepseek-ai/dsh-storage']).toBe('0.1.0-rc.6')
    expect(manifest.peerDependencies?.['@deepseek-ai/dsh-storage-domain']).toBe('0.1.0-rc.6')
    expect(manifest.peerDependencies?.['@deepseek-ai/dsh-tools']).toBe('0.1.0-rc.6')
    expect(manifest.exports?.['./ui-pentest/client']).toBe('./lib/ui-pentest.client.js')
    expect(manifest.exports?.['./burp-mcp']).toBe('./scripts/burp-mcp.mjs')
    expect(manifest.files).toContain('preset/**')
    expect(manifest.files).toContain('scripts/configure-redteam-suite.mjs')
    expect(manifest.bin?.['dsh-pentest-suite']).toBe('./scripts/configure-redteam-suite.mjs')
    expect(manifest.peerDependenciesMeta).toBeUndefined()
  })

  it('ships distinct bug-hunting and red-team presets over the shared plugin', () => {
    const metadata = [BUGHUNT_META_PATH, REDTEAM_META_PATH]
      .map(path => yaml.load(readFileSync(path, 'utf8')) as { name: string })
    expect(metadata.map(item => item.name)).toEqual(['挖洞模式', '红队模式'])

    const modes = [BUGHUNT_PRESET_PATH, REDTEAM_PRESET_PATH].map((path) => {
      const rows = yaml.load(readFileSync(path, 'utf8'), { schema: patchSchema }) as Array<{
        id: string
        name: string
        config?: { mode?: string }
      }>
      return rows.find(row => row.id === 'pentest' && row.name === '@howmp/dsh-pentest/pentest')?.config?.mode
    })
    expect(modes).toEqual(['bughunt', 'redteam'])
  })
})
