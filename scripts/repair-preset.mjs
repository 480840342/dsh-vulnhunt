import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { dshHome, hostCandidates } from './repair-composer.mjs'

const PACKAGE = '@deepseek-ai/dsh-client-ui-agent-preset'

export function patchPreset(source) {
  const before = '\n\t\t\t\t\t\tshownLabel,'
  const after = '\n\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", { translate: "no", children: shownLabel }),'
  if (source.includes(after)) return source
  if (source.split(before).length !== 2) throw new Error('Unrecognized agent preset UI; no files changed')
  return source.replace(before, after)
    .replace('className: AgentPresetSeat_module_css_default.seat,', 'className: AgentPresetSeat_module_css_default.seat,\n\t\t\t\t\ttranslate: "no",')
    .replace('className: AgentPresetSeat_module_css_default.item,', 'className: AgentPresetSeat_module_css_default.item,\n\t\t\t\t\t\t\ttranslate: "no",')
}

export function locateAgentPreset(explicitHost) {
  if (explicitHost) {
    try {
      const meta = JSON.parse(readFileSync(join(explicitHost, 'package.json'), 'utf8'))
      if (meta.name === PACKAGE) return explicitHost
    } catch { /* treat as a DSH host root */ }
    const require = createRequire(join(explicitHost, 'package.json'))
    return dirname(require.resolve(`${PACKAGE}/package.json`))
  }
  const home = dshHome()
  for (const tree of [
    join(home, 'profiles', 'web', 'node_modules'),
    join(home, 'profiles', 'node_modules'),
  ]) {
    const direct = join(tree, PACKAGE, 'package.json')
    if (existsSync(direct)) return dirname(direct)
  }
  const errors = []
  for (const host of hostCandidates(home)) {
    try {
      const require = createRequire(join(host, 'package.json'))
      return dirname(require.resolve(`${PACKAGE}/package.json`))
    } catch (error) {
      errors.push(`${host}: ${error.message}`)
    }
  }
  throw new Error(`Cannot find ${PACKAGE}. DSH_HOME=${home}${errors.length ? `; ${errors.join('; ')}` : ''}`)
}

export function repairPreset(host) {
  const directory = locateAgentPreset(host)
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
