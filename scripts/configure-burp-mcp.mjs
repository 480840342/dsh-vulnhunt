#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const START = '# BEGIN dsh-pentest burp-mcp'
const END = '# END dsh-pentest burp-mcp'
const SERVER_ID = 'dsh-pentest-mcp-burp'

function yamlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function findNode() {
  return process.env.DSH_BURP_MCP_NODE ?? process.execPath
}

function findBridge() {
  const candidates = [
    process.env.DSH_BURP_MCP_BRIDGE,
    'D:/burp-mcp/node_modules/mcp-remote/dist/proxy.js',
  ].filter(Boolean).map(value => resolve(value))
  return candidates.find(existsSync)
}

function profilePatchPath({ dshHome, profile, config }) {
  if (config) return resolve(config)
  const home = resolve(dshHome ?? process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.cwd(), '.dsh'))
  return join(home, 'profiles', profile, 'cordis.patch.yml')
}

export function renderBurpPatch({ url, bridge, node }) {
  const normalizedBridge = resolve(bridge).replaceAll('\\', '/')
  const marker = '/node_modules/'
  const cwd = normalizedBridge.includes(marker) ? normalizedBridge.slice(0, normalizedBridge.indexOf(marker)) : dirname(bridge)
  return `${START}\n- insert:\n    - id: ${SERVER_ID}\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        transport: stdio\n        serverName: burp\n        command: ${yamlString(node)}\n        args:\n          - ${yamlString(bridge)}\n          - ${yamlString(url)}\n          - '--transport'\n          - 'sse-only'\n        cwd: ${yamlString(cwd)}\n        toolCallTimeoutMs: 60000\n        failOnStartupError: false\n        reconnect:\n          enabled: true\n          initialDelayMs: 1000\n          maxDelayMs: 30000\n          maxAttempts: 1000\n${END}`
}

function removeBlock(source) {
  const expression = new RegExp(`\\n?${START}\\n[\\s\\S]*?${END}\\n?`, 'g')
  return source.replace(expression, '\n').replace(/\n{3,}/g, '\n\n')
}

export function configureBurpMcp({ config, dshHome, profile = 'web', url = process.env.DSH_BURP_MCP_URL ?? 'http://127.0.0.1:9876/', bridge = findBridge(), node = findNode(), disable = false, check = false }) {
  const file = profilePatchPath({ dshHome, profile, config })
  const original = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const existingBurp = /name:\s*['"]@deepseek-ai\/dsh-mcp-client['"][\s\S]{0,900}?serverName:\s*burp\b/.test(original)
  if (!disable && existingBurp && !original.includes(START)) {
    return { file, enabled: true, changed: false, existing: true, serverId: 'burp', url }
  }
  let next = removeBlock(original)
  if (!disable) {
    if (!bridge) throw new Error('Burp MCP bridge not found. Pass --bridge-proxy or set DSH_BURP_MCP_BRIDGE.')
    if (!/^https?:\/\//.test(url)) throw new Error(`Burp MCP URL must use http:// or https://: ${url}`)
    next = `${next.trimEnd()}\n\n${renderBurpPatch({ url, bridge: resolve(bridge), node: resolve(node) })}\n`
  }
  const changed = next !== original
  if (changed && !check) {
    mkdirSync(dirname(file), { recursive: true })
    const backup = `${file}.before-dsh-pentest-burp-mcp`
    if (!existsSync(backup) && existsSync(file)) writeFileSync(backup, original, { flag: 'wx' })
    writeFileSync(file, next)
  }
  return { file, enabled: !disable, changed, serverId: disable ? undefined : SERVER_ID, url: disable ? undefined : url }
}

function main() {
  const { values } = parseArgs({ options: {
    config: { type: 'string' },
    'dsh-home': { type: 'string' },
    profile: { type: 'string', default: 'web' },
    url: { type: 'string' },
    'bridge-proxy': { type: 'string' },
    node: { type: 'string' },
    disable: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
  } })
  const result = configureBurpMcp({
    config: values.config,
    dshHome: values['dsh-home'],
    profile: values.profile,
    url: values.url,
    bridge: values['bridge-proxy'],
    node: values.node,
    disable: values.disable,
    check: values.check,
  })
  console.log(JSON.stringify(result))
  if (values.check && result.changed) process.exitCode = 2
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main() } catch (error) {
    console.error(`Burp MCP configuration failed: ${error.message}`)
    process.exitCode = 1
  }
}
