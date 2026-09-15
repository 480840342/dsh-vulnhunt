#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const PACKAGE = '@deepseek-ai/dsh-client-ui-conversation'
const SUPPORTED = new Set(['0.1.0-rc.6', '0.1.0-rc.8'])

function replaceOnce(source, before, after) {
  if (source.includes(after) && !source.includes(before)) return source
  if (source.split(before).length !== 2) throw new Error('Unrecognized composer code; no files changed')
  return source.replace(before, after)
}

export function patchComposer(source, version) {
  if (!SUPPORTED.has(version)) throw new Error(`Unsupported conversation component ${version}; no files changed`)
  let code = source
  const styles = [
    ['.uV2eYG_scroll{', 'min-height:32px;'],
    ['.uV2eYG_grow{', 'min-height:32px;'],
  ]
  for (const [selector, property] of styles) {
    if (!code.includes(selector + property)) code = replaceOnce(code, selector, selector + property)
  }
  code = replaceOnce(code,
    '.uV2eYG_backdrop{color:var(--dsw-alias-label-primary);',
    '.uV2eYG_backdrop{color:#0000;')
  const fixedInput = '.uV2eYG_input{resize:none;color:var(--dsw-alias-label-primary);-webkit-text-fill-color:var(--dsw-alias-label-primary);width:100%;height:100%;min-height:32px;'
  if (!code.includes(fixedInput)) {
    const oldInput = '.uV2eYG_input{resize:none;color:#0000;'
      + (code.includes(oldInputPrefix()) ? '-webkit-text-fill-color:transparent;' : '')
      + 'width:100%;height:100%;'
    code = replaceOnce(code, oldInput, fixedInput)
  }
  // A wrapper remains owned by React even if a translator replaces its text child.
  code = replaceOnce(code,
    'if (upTo > cursor) backdrop.push(draft.slice(cursor, upTo));',
    'if (upTo > cursor) backdrop.push((0, react_jsx_runtime.jsx)("span", { children: draft.slice(cursor, upTo) }, `plain-${cursor}`));')
  const card = '"data-composer-card": true,'
  if (!/"data-composer-card": true,\s*translate: "no",/.test(code)) {
    code = replaceOnce(code, card, card + '\n\t\t\t\t\t\ttranslate: "no",')
  }
  const composing = 'const composing = composingRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;'
  const guard = 'if (!composing && (e.key === "Backspace" || e.key === "Delete") && draft === "")'
  if (!code.includes(guard)) {
    code = replaceOnce(code, composing, composing + '\n\t\t\t\t' + guard + ' {\n\t\t\t\t\te.preventDefault();\n\t\t\t\t\te.stopPropagation();\n\t\t\t\t\treturn;\n\t\t\t\t}')
  }
  return code
}

function oldInputPrefix() {
  return '.uV2eYG_input{resize:none;color:#0000;-webkit-text-fill-color:transparent;'
}

export function repairPackage(directory, { check = false } = {}) {
  const root = realpathSync(directory)
  const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (metadata.name !== PACKAGE) throw new Error(`Expected ${PACKAGE} at ${root}`)
  const file = join(root, 'lib/client.js')
  const source = readFileSync(file, 'utf8')
  // Normalize the earlier local-only span patch before recognizing the shipped patch.
  const normalized = source.replace(/\/\/ Keep React-owned elements stable when translation extensions replace text nodes\.\s*if \(upTo > cursor\) backdrop\.push\(\(0, react_jsx_runtime\.jsx\)\("span", \{\s*children: draft\.slice\(cursor, upTo\)\s*\}, `plain-\$\{cursor\}`\)\);/,
    'if (upTo > cursor) backdrop.push((0, react_jsx_runtime.jsx)("span", { children: draft.slice(cursor, upTo) }, `plain-${cursor}`));')
  const patched = patchComposer(normalized, metadata.version)
  const changed = patched !== normalized
  if (changed && !check) {
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 16)
    const backup = `${file}.pentest-${hash}.bak`
    if (!existsSync(backup)) writeFileSync(backup, source, { flag: 'wx' })
    writeFileSync(file, patched)
  }
  return { file, version: metadata.version, changed, check }
}

export function findConversation(hostRoot) {
  const require = createRequire(join(resolve(hostRoot), 'package.json'))
  return dirname(require.resolve(`${PACKAGE}/package.json`))
}

export function globalHost() {
  // Avoid a shell invocation: Windows npm.cmd needs cmd.exe, npm's JS entry does not.
  const npmCandidates = [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')]
  if (process.env.npm_execpath) npmCandidates.unshift(process.env.npm_execpath)
  for (const pathEntry of (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    npmCandidates.push(join(pathEntry, 'node_modules/npm/bin/npm-cli.js'))
  }
  const npm = npmCandidates.find(existsSync)
  if (!npm) throw new Error('Cannot locate npm. Pass --host-root /path/to/@deepseek-ai/dsh')
  const globalRoot = execFileSync(process.execPath, [npm, 'root', '-g'], { encoding: 'utf8', windowsHide: true }).trim()
  return join(globalRoot, '@deepseek-ai/dsh')
}

function main() {
  const { values } = parseArgs({ options: {
    'host-root': { type: 'string' },
    'package-dir': { type: 'string' },
    check: { type: 'boolean', default: false },
  } })
  const directory = values['package-dir'] ?? findConversation(values['host-root'] ?? globalHost())
  const result = repairPackage(directory, { check: values.check })
  console.log(JSON.stringify(result))
  if (result.check && result.changed) process.exitCode = 2
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main() } catch (error) {
    console.error(`Composer repair failed: ${error.message}`)
    process.exitCode = 1
  }
}
