import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { globalHost } from './repair-composer.mjs'

export function patchPreset(source) {
  const before = '\n\t\t\t\t\t\tshownLabel,'
  const after = '\n\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", { translate: "no", children: shownLabel }),'
  if (source.includes(after)) return source
  if (source.split(before).length !== 2) throw new Error('Unrecognized agent preset UI; no files changed')
  return source.replace(before, after)
    .replace('className: AgentPresetSeat_module_css_default.seat,', 'className: AgentPresetSeat_module_css_default.seat,\n\t\t\t\t\ttranslate: "no",')
    .replace('className: AgentPresetSeat_module_css_default.item,', 'className: AgentPresetSeat_module_css_default.item,\n\t\t\t\t\t\t\ttranslate: "no",')
}

export function repairPreset(host = globalHost()) {
  const require = createRequire(join(host, 'package.json'))
  const directory = dirname(require.resolve('@deepseek-ai/dsh-client-ui-agent-preset/package.json'))
  const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  if (!['0.1.0-rc.6', '0.1.0-rc.8'].includes(metadata.version)) return { changed: false, unsupported: metadata.version }
  const file = join(directory, 'lib/client.js')
  const original = readFileSync(file, 'utf8')
  const patched = patchPreset(original)
  if (patched !== original) {
    if (!existsSync(`${file}.pentest-preset.bak`)) writeFileSync(`${file}.pentest-preset.bak`, original, { flag: 'wx' })
    writeFileSync(file, patched)
  }
  return { changed: patched !== original }
}
