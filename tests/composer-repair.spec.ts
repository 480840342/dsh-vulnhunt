import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findConversation, patchComposer, repairPackage } from '../scripts/repair-composer.mjs'

const original = `
.uV2eYG_scroll{max-height:var(--dsh-composer-text-max-height);overflow-y:auto}
.uV2eYG_grow{position:relative}
.uV2eYG_backdrop{color:var(--dsw-alias-label-primary);pointer-events:none}
.uV2eYG_input{resize:none;color:#0000;width:100%;height:100%;}
if (upTo > cursor) backdrop.push(draft.slice(cursor, upTo));
"data-composer-card": true,
const composing = composingRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
`
const directories: string[] = []
function fixture(version = '0.1.0-rc.6', source = original) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-composer-'))
  directories.push(root)
  mkdirSync(join(root, 'lib'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-client-ui-conversation', version }))
  writeFileSync(join(root, 'lib/client.js'), source)
  return root
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('portable composer repair', () => {
  it.each(['0.1.0-rc.6', '0.1.0-rc.8'])('repairs %s once and preserves the exact original backup', version => {
    const source = version.endsWith('8') ? original.replace('color:#0000;width:', 'color:#0000;-webkit-text-fill-color:transparent;width:') : original
    const root = fixture(version, source)
    expect(repairPackage(root).changed).toBe(true)
    const backup = readdirSync(join(root, 'lib')).find(name => name.endsWith('.bak'))!
    expect(readFileSync(join(root, 'lib', backup), 'utf8')).toBe(source)
    expect(repairPackage(root).changed).toBe(false)
    expect(readdirSync(join(root, 'lib'))).toHaveLength(2)
  })

  it('check mode reports missing repairs without changing or backing up the file', () => {
    const root = fixture()
    expect(repairPackage(root, { check: true }).changed).toBe(true)
    expect(readFileSync(join(root, 'lib/client.js'), 'utf8')).toBe(original)
    expect(readdirSync(join(root, 'lib'))).toEqual(['client.js'])
  })

  it('refuses unknown versions and changed code without partially writing', () => {
    for (const [version, source] of [['0.2.0', original], ['0.1.0-rc.6', original.replace('backdrop.push(draft.slice(cursor, upTo))', 'upstreamChanged()')]]) {
      const root = fixture(version, source)
      expect(() => repairPackage(root)).toThrow()
      expect(readFileSync(join(root, 'lib/client.js'), 'utf8')).toBe(source)
      expect(readdirSync(join(root, 'lib'))).toEqual(['client.js'])
    }
  })

  it('resolves the conversation dependency relative to the selected DSH host', () => {
    const root = fixture()
    const dependency = join(root, 'node_modules/@deepseek-ai/dsh-client-ui-conversation')
    mkdirSync(dependency, { recursive: true })
    writeFileSync(join(dependency, 'package.json'), '{"name":"@deepseek-ai/dsh-client-ui-conversation"}')
    expect(findConversation(root)).toBe(dependency)
  })

  it('locates the conversation package from DSH_HOME profile node_modules', async () => {
    const { locateConversation } = await import('../scripts/repair-composer.mjs')
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    directories.push(home)
    const dependency = join(home, 'profiles/web/node_modules/@deepseek-ai/dsh-client-ui-conversation')
    mkdirSync(dependency, { recursive: true })
    writeFileSync(join(dependency, 'package.json'), '{"name":"@deepseek-ai/dsh-client-ui-conversation"}')
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      expect(locateConversation()).toBe(dependency)
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })

  it('retains the composition guard and leaves unrelated host code intact', () => {
    const patched = patchComposer(original + '\nconst unrelated = 42;', '0.1.0-rc.6')
    expect(patched).toContain('if (!composing && (e.key === "Backspace" || e.key === "Delete") && draft === "")')
    expect(patched).toContain('const unrelated = 42;')
  })
})
