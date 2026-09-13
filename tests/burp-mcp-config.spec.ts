import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { configureBurpMcp, renderBurpPatch } from '../scripts/configure-burp-mcp.mjs'

const roots: string[] = []
function fixture(source = '') {
  const root = mkdtempSync(join(tmpdir(), 'dsh-burp-mcp-'))
  roots.push(root)
  const file = join(root, 'cordis.patch.yml')
  writeFileSync(file, source)
  return file
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('Burp MCP profile configuration', () => {
  it('renders a portable stdio-to-SSE bridge with reconnect and non-fatal startup', () => {
    const patch = renderBurpPatch({
      url: 'http://127.0.0.1:9876/',
      bridge: 'D:/tools/burp/node_modules/mcp-remote/dist/proxy.js',
      node: 'C:/Program Files/nodejs/node.exe',
    })
    expect(patch).toContain("name: '@deepseek-ai/dsh-mcp-client'")
    expect(patch).toContain('serverName: burp')
    expect(patch).toContain("- 'sse-only'")
    expect(patch).toContain("cwd: 'D:/tools/burp'")
    expect(patch).toContain('failOnStartupError: false')
    expect(patch).toContain('maxAttempts: 1000')
  })

  it('writes an idempotent marked block and preserves the original config', () => {
    const file = fixture('# existing profile patch\n')
    const first = configureBurpMcp({ config: file, url: 'http://127.0.0.1:9876/', bridge: process.execPath, node: process.execPath })
    expect(first.changed).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('# BEGIN dsh-pentest burp-mcp')
    expect(readdirSync(join(file, '..')).some(name => name === 'cordis.patch.yml.before-dsh-pentest-burp-mcp')).toBe(true)
    expect(configureBurpMcp({ config: file, url: 'http://127.0.0.1:9876/', bridge: process.execPath, node: process.execPath }).changed).toBe(false)
  })

  it('preserves a pre-existing unmarked burp registration without duplicating it', () => {
    const file = fixture("- insert:\n    - id: mcp-burp\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: burp\n")
    const result = configureBurpMcp({ config: file, bridge: process.execPath, node: process.execPath })
    expect(result).toMatchObject({ changed: false, existing: true, enabled: true })
    expect(readFileSync(file, 'utf8').match(/serverName: burp/g)).toHaveLength(1)
  })

  it('supports read-only checks and disabling a managed block', () => {
    const file = fixture('base:\n')
    configureBurpMcp({ config: file, bridge: process.execPath, node: process.execPath })
    const check = configureBurpMcp({ config: file, bridge: process.execPath, node: process.execPath, check: true })
    expect(check.changed).toBe(false)
    const disabled = configureBurpMcp({ config: file, disable: true })
    expect(disabled.changed).toBe(true)
    expect(readFileSync(file, 'utf8')).not.toContain('serverName: burp')
    expect(existsSync(`${file}.before-dsh-pentest-burp-mcp`)).toBe(true)
  })

  it('rejects malformed URLs before writing', () => {
    const file = fixture('base:\n')
    expect(() => configureBurpMcp({ config: file, url: '127.0.0.1:9876', bridge: process.execPath, node: process.execPath })).toThrow()
    expect(readFileSync(file, 'utf8')).toBe('base:\n')
  })
})
