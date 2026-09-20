#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

export const UPSTREAM_COMMIT = 'e549e0f2fa515cce5f71842088f75333e7e997e7'

/**
 * Specialist modes deployed from the upstream collection.
 *
 * This package's own preset is `bughunt` (挖洞模式), so the upstream `pentest`
 * (渗透测试模式) and `redteam` (安全研究员) ids are free and are deployed
 * here. `av-evasion` stays excluded on the safety whitelist.
 */
export const SAFE_MODE_IDS = Object.freeze([
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

/** Upstream modes deliberately left out of this suite. */
export const UPSTREAM_ONLY_MODE_IDS = Object.freeze([
  'av-evasion',
])

export const SAFE_HOST_PLUGINS = Object.freeze([
  'dsh-attack-atlas',
  'dsh-auto-advance',
  'dsh-campaign-memory',
  'dsh-hunter',
  'dsh-mcp-studio',
  'dsh-mode-group',
  'dsh-product-subagents',
  'dsh-redteam-results',
  'dsh-route-boost',
  'dsh-sec-enforce',
  'dsh-session-pulse',
  'dsh-stage-gate',
  'dsh-trace-vault',
])

export const SAFE_PRESET_PLUGINS = Object.freeze([
  'dsh-scanner-tools',
  'dsh-semgrep-audit',
])

export const EXCLUDED_COMPONENTS = Object.freeze([
  'mode:av-evasion',
  'plugin:dsh-refusal-guard',
  'plugin:dsh-webshell-mgr',
])

/**
 * Preset ids this suite must never write into DSH_HOME.
 *
 * Empty: this package's own preset is `bughunt`, so upstream `pentest` /
 * `redteam` are owned by the suite and should stay. Kept as a named list so
 * a future colliding id can be purged on upgrade without rewriting the
 * installer.
 */
export const CONFLICTING_PRESET_IDS = Object.freeze([])

const MANAGER_PACKAGE = '@dsh-external/dsh-redteam-model'
const MARKER_NAME = '.dsh-pentest-suite.json'
const MARKER_OWNER = '@howmp/dsh-pentest'
const SAFE_EXPRESSION = 'Expression discipline: operate only within the explicit authorization and target scope recorded for this task. Prefer read-only, rate-limited and reversible validation; request confirmation before invasive or disruptive actions, preserve evidence, and stop when scope or safety is uncertain.'
const MCP_STUDIO_OLD_CHANNEL = 'const apiChannel = "/api" + STUDIO_CHANNEL;'
const MCP_STUDIO_FIXED_CHANNEL = 'const apiChannel = STUDIO_CHANNEL;'

function packageName(plugin) {
  return `@dsh-external/${plugin}`
}

function dshHome() {
  const configured = process.env.DSH_HOME?.trim()
  if (!configured || configured === '~') return configured === '~' ? homedir() : path.join(homedir(), '.dsh')
  if (configured.startsWith('~/') || configured.startsWith('~\\')) return path.resolve(homedir(), configured.slice(2))
  return path.resolve(configured)
}

function activeProfile(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--profile')
  const value = index >= 0 ? argv[index + 1] : undefined
  return value && !value.startsWith('-') ? value : 'web'
}

export function resolveSuiteRoot() {
  return path.dirname(require.resolve(`${MANAGER_PACKAGE}/package.json`))
}

function linkSpec(directory) {
  return `link:${directory.replaceAll('\\', '/')}`
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function planProfile(input, suiteRoot) {
  const profile = cloneJson(input ?? {})
  profile.name ??= 'dsh-profile-web'
  profile.private ??= true
  profile.dependencies ??= {}
  profile.dsh ??= {}
  profile.dsh.profile ??= {}
  profile.dsh.profile.bundles ??= []

  const blockedPackages = new Set([
    MANAGER_PACKAGE,
    packageName('dsh-refusal-guard'),
    packageName('dsh-webshell-mgr'),
  ])
  for (const blocked of blockedPackages) delete profile.dependencies[blocked]

  const safePlugins = [...SAFE_HOST_PLUGINS, ...SAFE_PRESET_PLUGINS]
  for (const plugin of safePlugins) {
    profile.dependencies[packageName(plugin)] = linkSpec(path.join(suiteRoot, 'plugins', plugin))
  }

  const bundles = profile.dsh.profile.bundles.filter(name => !blockedPackages.has(name))
  const presetOnly = new Set(SAFE_PRESET_PLUGINS.map(packageName))
  const normalized = bundles.filter(name => !presetOnly.has(name))
  for (const plugin of SAFE_HOST_PLUGINS) {
    const name = packageName(plugin)
    if (!normalized.includes(name)) normalized.push(name)
  }
  profile.dsh.profile.bundles = [...new Set(normalized)]
  return profile
}

export function sanitizeModeText(source) {
  return source.split(/(?<=\n)/u).map((line) => {
    if (!line.includes('Expression discipline') || !line.includes('dsh-refusal-guard')) return line
    const indent = /^\s*/u.exec(line)?.[0] ?? ''
    const newline = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : ''
    return `${indent}${SAFE_EXPRESSION}${newline}`
  }).join('')
}

export function patchMcpStudioClient(suiteRoot) {
  const file = path.join(suiteRoot, 'plugins', 'dsh-mcp-studio', 'lib', 'client.js')
  const source = readFileSync(file, 'utf8')
  if (source.includes(MCP_STUDIO_FIXED_CHANNEL)) return { file, changed: false }
  if (!source.includes(MCP_STUDIO_OLD_CHANNEL)) {
    throw new Error(`unsupported MCP Studio client layout; no files changed: ${file}`)
  }
  const backupFile = `${file}.before-dsh-pentest-suite.bak`
  if (!existsSync(backupFile)) copyFileSync(file, backupFile)
  writeFileSync(file, source.replace(MCP_STUDIO_OLD_CHANNEL, MCP_STUDIO_FIXED_CHANNEL), 'utf8')
  return { file, changed: true, backupFile }
}

function readJson(file, fallback = undefined) {
  if (!existsSync(file)) return fallback
  return JSON.parse(readFileSync(file, 'utf8'))
}

function atomicWriteJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}

function snapshot(file) {
  return existsSync(file) ? { file, existed: true, body: readFileSync(file) } : { file, existed: false }
}

function restore(item) {
  if (!item.existed) {
    rmSync(item.file, { force: true })
    return
  }
  writeFileSync(item.file, item.body)
}

function backup(file) {
  if (!existsSync(file)) return undefined
  const destination = `${file}.before-dsh-pentest-suite-${Date.now()}.bak`
  copyFileSync(file, destination)
  return destination
}

function runPnpm(profileDir, quiet = false) {
  const pnpmArgs = ['-y', 'pnpm', 'install', '--prefer-offline', '--no-frozen-lockfile', '--config.minimumReleaseAge=0']
  const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npx ${pnpmArgs.join(' ')}`]
    : pnpmArgs
  const result = spawnSync(executable, args, {
    cwd: profileDir,
    env: { ...process.env, CI: 'true' },
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = quiet ? `${result.stderr ?? ''}\n${result.stdout ?? ''}`.trim().slice(-2000) : `exit code ${result.status}`
    throw new Error(`pnpm install failed: ${detail}`)
  }
}

function isSameLink(destination, source) {
  try {
    return path.resolve(readlinkSync(destination)) === path.resolve(source)
  } catch {
    return false
  }
}

function ensureDirectoryLink(source, destination) {
  if (!existsSync(source)) return false
  if (isSameLink(destination, source)) return false
  if (existsSync(destination)) {
    const info = lstatSync(destination)
    if (!info.isSymbolicLink()) return false
    rmSync(destination, { force: true, recursive: true })
  }
  mkdirSync(path.dirname(destination), { recursive: true })
  symlinkSync(source, destination, process.platform === 'win32' ? 'junction' : 'dir')
  return true
}

function linkRuntimePeers(suiteRoot, home) {
  const runtime = path.join(home, 'profiles', 'node_modules', '@deepseek-ai')
  if (!existsSync(runtime)) throw new Error(`DSH runtime packages not found: ${runtime}`)
  const localDeepseek = path.join(suiteRoot, 'plugins', 'node_modules', '@deepseek-ai')
  const localExternal = path.join(suiteRoot, 'plugins', 'node_modules', '@dsh-external')
  let deepseek = 0
  let external = 0
  for (const entry of readDirectoryNames(runtime)) {
    if (ensureDirectoryLink(path.join(runtime, entry), path.join(localDeepseek, entry))) deepseek += 1
  }
  for (const plugin of [...SAFE_HOST_PLUGINS, ...SAFE_PRESET_PLUGINS]) {
    if (ensureDirectoryLink(path.join(suiteRoot, 'plugins', plugin), path.join(localExternal, plugin))) external += 1
  }
  return { deepseek, external }
}

function readDirectoryNames(directory) {
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(entry => entry.name)
    : []
}

function preparePresetsRoot(home) {
  const root = path.join(home, '.agent-presets')
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true })
    return root
  }
  const info = lstatSync(root)
  if (!info.isSymbolicLink()) {
    if (!info.isDirectory()) throw new Error(`agent presets path is not a directory: ${root}`)
    return root
  }
  const destination = `${root}.before-dsh-pentest-suite-${Date.now()}.bak`
  renameSync(root, destination)
  mkdirSync(root, { recursive: true })
  return root
}

/**
 * Remove preset directories that would collide with this package's own
 * `pentest` preset, or that belong to the upstream collection's own install.
 * Only directories this suite previously deployed (tracked in the marker) or
 * that are unowned leftovers of an upstream link are touched; unowned
 * user-created presets are never deleted, only reported.
 */
function purgeConflictingPresets(presetsRoot, marker) {
  const removed = []
  const kept = []
  for (const id of CONFLICTING_PRESET_IDS) {
    const destination = path.join(presetsRoot, id)
    if (!existsSync(destination)) continue
    let owned = marker.modes?.[id] !== undefined
    if (!owned) {
      // A leftover from an upstream `.agent-presets` link looks like a symlink
      // pointing at the collection's own `modes/pentest` etc.
      try {
        const target = readlinkSync(destination)
        if (target.includes(`${path.sep}modes${path.sep}${id}`)) owned = true
      } catch { /* real directory, unowned */ }
    }
    if (!owned) {
      kept.push(id)
      continue
    }
    const backupPath = `${destination}.dsh-pentest-removed-${Date.now()}`
    renameSync(destination, backupPath)
    removed.push({ id, backupPath })
    if (marker.modes !== undefined) delete marker.modes[id]
  }
  return { removed, kept }
}

function deploySafeModes(suiteRoot, home) {
  const presetsRoot = preparePresetsRoot(home)
  const markerFile = path.join(presetsRoot, MARKER_NAME)
  const marker = readJson(markerFile, { schemaVersion: 1, owner: MARKER_OWNER, upstreamCommit: UPSTREAM_COMMIT, modes: {} })
  if (marker.owner !== MARKER_OWNER || typeof marker.modes !== 'object' || marker.modes === null) {
    throw new Error(`unrecognized suite marker: ${markerFile}`)
  }

  const purge = purgeConflictingPresets(presetsRoot, marker)

  const copied = []
  const skipped = []
  for (const id of SAFE_MODE_IDS) {
    const source = path.join(suiteRoot, 'modes', id)
    const destination = path.join(presetsRoot, id)
    if (!existsSync(source)) throw new Error(`upstream mode missing: ${id}`)
    if (existsSync(destination) && marker.modes[id] === undefined) {
      skipped.push(`${id} (existing unowned preset)`)
      continue
    }
    const currentAgent = path.join(destination, 'agent.cordis.yml')
    if (
      marker.modes[id]?.upstreamCommit === UPSTREAM_COMMIT
      && marker.modes[id]?.sanitized === true
      && existsSync(currentAgent)
      && !readFileSync(currentAgent, 'utf8').includes('dsh-refusal-guard')
    ) {
      skipped.push(`${id} (unchanged)`)
      continue
    }

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const staging = path.join(presetsRoot, `.${id}.dsh-pentest.tmp-${suffix}`)
    const old = `${destination}.dsh-pentest.old-${suffix}`
    cpSync(source, staging, { recursive: true })
    const agentFile = path.join(staging, 'agent.cordis.yml')
    const sanitized = sanitizeModeText(readFileSync(agentFile, 'utf8'))
    if (sanitized.includes('dsh-refusal-guard')) {
      rmSync(staging, { recursive: true, force: true })
      throw new Error(`unsafe refusal-guard instruction remained in mode ${id}`)
    }
    writeFileSync(agentFile, sanitized, 'utf8')

    if (existsSync(destination)) renameSync(destination, old)
    try {
      renameSync(staging, destination)
      rmSync(old, { recursive: true, force: true })
    } catch (error) {
      rmSync(staging, { recursive: true, force: true })
      if (!existsSync(destination) && existsSync(old)) renameSync(old, destination)
      throw error
    }
    marker.modes[id] = { upstreamCommit: UPSTREAM_COMMIT, deployedAt: Date.now(), sanitized: true }
    copied.push(id)
  }
  marker.upstreamCommit = UPSTREAM_COMMIT
  atomicWriteJson(markerFile, marker)
  return { copied, skipped, presetsRoot, purge }
}

function suiteStatus(profileFile, suiteRoot, home) {
  const profile = readJson(profileFile, {})
  const dependencies = profile.dependencies ?? {}
  const bundles = new Set(profile.dsh?.profile?.bundles ?? [])
  const pluginStatus = [...SAFE_HOST_PLUGINS, ...SAFE_PRESET_PLUGINS].map((plugin) => {
    const name = packageName(plugin)
    const expected = linkSpec(path.join(suiteRoot, 'plugins', plugin))
    return {
      plugin,
      dependency: dependencies[name] === expected,
      bundled: SAFE_HOST_PLUGINS.includes(plugin) ? bundles.has(name) : !bundles.has(name),
    }
  })
  const presetsRoot = path.join(home, '.agent-presets')
  const modes = SAFE_MODE_IDS.map((id) => {
    const agent = path.join(presetsRoot, id, 'agent.cordis.yml')
    const ready = existsSync(agent) && !readFileSync(agent, 'utf8').includes('dsh-refusal-guard')
    return { id, ready }
  })
  // Coexistence precondition: no duplicated `pentest` row and no leftover
  // upstream `redteam` row inside the shared preset root.
  const conflicts = CONFLICTING_PRESET_IDS
    .filter(id => existsSync(path.join(presetsRoot, id, 'preset.yml')))
  const mcpStudioClient = path.join(suiteRoot, 'plugins', 'dsh-mcp-studio', 'lib', 'client.js')
  const mcpStudioTransportReady = existsSync(mcpStudioClient)
    && readFileSync(mcpStudioClient, 'utf8').includes(MCP_STUDIO_FIXED_CHANNEL)
  return {
    ready: pluginStatus.every(item => item.dependency && item.bundled)
      && modes.every(item => item.ready)
      && conflicts.length === 0
      && mcpStudioTransportReady,
    upstreamCommit: UPSTREAM_COMMIT,
    plugins: pluginStatus,
    modes,
    conflicts,
    mcpStudioTransportReady,
    excluded: EXCLUDED_COMPONENTS,
  }
}

export function installSuite({ profile = 'web', suiteRoot = resolveSuiteRoot(), home = dshHome() } = {}) {
  const profileDir = path.join(home, 'profiles', profile)
  const profileFile = path.join(profileDir, 'package.json')
  const lockFile = path.join(profileDir, 'pnpm-lock.yaml')
  mkdirSync(profileDir, { recursive: true })
  const snapshots = [snapshot(profileFile), snapshot(lockFile)]
  const backups = [backup(profileFile), backup(lockFile)].filter(Boolean)
  try {
    const current = readJson(profileFile, {})
    atomicWriteJson(profileFile, planProfile(current, suiteRoot))
    runPnpm(profileDir)
    const freshSuiteRoot = resolveSuiteRoot()
    const mcpStudioPatch = patchMcpStudioClient(freshSuiteRoot)
    const peerLinks = linkRuntimePeers(freshSuiteRoot, home)
    const modeDeployment = deploySafeModes(freshSuiteRoot, home)
    return {
      ...suiteStatus(profileFile, freshSuiteRoot, home),
      profile,
      profileFile,
      backups,
      mcpStudioPatch,
      peerLinks,
      modeDeployment,
    }
  } catch (error) {
    for (const item of snapshots) restore(item)
    try { runPnpm(profileDir, true) } catch { /* preserve the original failure */ }
    throw error
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const profile = activeProfile(argv)
  const home = dshHome()
  const suiteRoot = resolveSuiteRoot()
  const profileFile = path.join(home, 'profiles', profile, 'package.json')
  const result = argv.includes('--status')
    ? suiteStatus(profileFile, suiteRoot, home)
    : installSuite({ profile, suiteRoot, home })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ready) process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[dsh-pentest-suite] ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exitCode = 1
  })
}
