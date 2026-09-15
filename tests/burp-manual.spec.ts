import { describe, expect, it, vi } from 'vitest'
import { apply } from '../scripts/burp-mcp.mjs'
import { migrateBurp } from '../scripts/configure-burp-mcp.mjs'
import { patchPreset } from '../scripts/repair-preset.mjs'

describe('manual Burp integration', () => {
  it('registers menu commands without loading a bridge or connecting at startup', async () => {
    const commands = new Map<string, any>()
    const plugin = vi.fn()
    apply({ effect: vi.fn(), plugin, commands: { register: (entry: any) => commands.set(entry.name, entry) } })
    expect([...commands.keys()]).toEqual(['burp-connect', 'burp-disconnect'])
    expect(plugin).not.toHaveBeenCalled()
    expect(await commands.get('burp-disconnect').handler()).toMatchObject({ kind: 'success' })
  })
  it('preserves other servers and executable YAML values during migration', () => {
    const result = migrateBurp("- insert:\n  - id: old-burp\n    name: '@deepseek-ai/dsh-mcp-client'\n    config:\n      serverName: burp\n  - id: other\n    name: other\n    config:\n      path: !!js dshHomePath('other')\n")
    expect(result.source).toContain("dshHomePath('other')")
    expect(result.source).toContain('id: other')
    expect(result.source).not.toContain('old-burp')
  })
  it('protects the selected preset text with a React-owned non-translated span', () => {
    const source = '\n\t\t\t\t\t\tshownLabel,\nclassName: AgentPresetSeat_module_css_default.seat,'
    const patched = patchPreset(source)
    expect(patched).toContain('translate: "no", children: shownLabel')
    expect(patchPreset(patched)).toBe(patched)
    expect(() => patchPreset('unknown version')).toThrow()
  })
})
