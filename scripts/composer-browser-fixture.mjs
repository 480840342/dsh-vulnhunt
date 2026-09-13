// Build a browser fixture from the real upstream InputBar, with network services stubbed.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { rolldown } from 'rolldown'
import { ROOT, hostDirectory } from './dependencies.mjs'
import { patchComposer } from './repair-composer.mjs'

const packageDir = resolve(process.argv[2])
const original = await readFile(join(packageDir, 'lib/client.js'), 'utf8')
const { version } = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
const source = process.argv.includes('--original') ? original : patchComposer(original, version)
const start = source.indexOf('function InputBar(')
const end = source.indexOf('\n\t\t//#endregion', start)
if (start < 0 || end < 0) throw new Error('InputBar source region not found')
const component = source.slice(start, end)
const css = JSON.parse(source.match(/const css\$17 = (".*");/)[1])
const classes = JSON.parse(source.match(/var InputBar_module_css_default = (\{[\s\S]*?\n\t\t\});/)[1])
const code = `
import * as react from 'react'
import * as react_jsx_runtime from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
const clsx = (...values) => values.filter(Boolean).join(' ')
const InputBar_module_css_default = ${JSON.stringify(classes)}
const INERT_DECORATIONS = {token:null,chips:[],textRefs:[],hint:null}
const deriveDecorations = () => INERT_DECORATIONS
const isSafariBrowser = () => false
const ContextMeter = () => null
const _deepseek_ai_dsh_client_ui_primitives = {
  Tooltip: ({children}) => children,
  IconPlusOutline16: () => null
}
const _deepseek_ai_dsh_client_ui_attachment = {useFileDrag: () => false}
${component}
window.fixtureErrors = []
window.addEventListener('error', event => window.fixtureErrors.push(event.message))
window.submissions = 0
function Fixture() {
  const [draft, setDraft] = react.useState('')
  const [phase, setPhase] = react.useState('idle')
  const state = {draft, phase, imageIds:[], occurrences:[], queue:[]}
  const stateRef = react.useRef(state)
  stateRef.current = state
  const actions = react.useMemo(() => ({
    setDraft, pruneImages: () => {},
    submit: () => { window.submissions++; setDraft(''); setPhase('submitting'); setTimeout(() => setPhase('idle'), 30) }
  }), [])
  const keyboard = react.useMemo(() => ({
    get snapshot() { return stateRef.current },
    setDraft, track: () => {}, arbitrate: () => 'pass', space: () => false,
    submit: actions.submit, dismissPopup: () => {},
    pasteBegin: (text, selection) => setDraft(value => value.slice(0,selection.start)+text+value.slice(selection.end))
  }), [])
  const useProjection = (_key, selector) => selector ? selector(undefined) : undefined
  const props = {
    useSession: selector => selector({running:false,removed:false}),
    useInput: selector => selector(state), inputActions: actions, keyboard,
    useNotices: selector => selector(null), useLexicon: selector => selector({}),
    useMenuLauncher: selector => selector(null), useProjection,
    renderSlot: () => null, resolveSubmitMode: () => 'normal',
    t: key => key === 'input.send' ? 'Send' : key === 'placeholder.default' ? 'Message' : key,
    sessionId:'fixture', variant:'hero'
  }
  return react.createElement(InputBar, props)
}
createRoot(document.getElementById('root')).render(react.createElement(Fixture))
`
const outputDir = join(ROOT, '.tmp-build', `browser-${version}${process.argv.includes('--original') ? '-original' : ''}`)
await mkdir(outputDir, { recursive: true })
const build = await rolldown({
  input: 'composer-fixture', platform: 'browser',
  resolve: { modules: [join(ROOT, '.tmp-build/browser-deps/node_modules'), 'node_modules', ...(hostDirectory() ? [hostDirectory()] : [])] },
  onLog(level, log, handler) {
    if (log.code === 'UNRESOLVED_IMPORT') throw new Error(log.message)
    handler(level, log)
  },
  transform: { define: { 'process.env.NODE_ENV': JSON.stringify('development') } },
  plugins: [{ name: 'fixture', resolveId: id => id === 'composer-fixture' ? '\0composer-fixture' : null,
    load: id => id === '\0composer-fixture' ? code : null }],
})
try { await build.write({ file: join(outputDir, 'fixture.js'), format: 'iife' }) }
finally { await build.close() }
await writeFile(join(outputDir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSH Composer ${version}</title><style>
:root{--dsw-alias-label-primary:#202124;--dsw-alias-label-caption:#666;--dsw-alias-border-l2-darkmode-thin:#bbb;--dsw-specific-input-major:#fff;--dsw-alias-button-info-fill:#2468d2;--dsw-font-family:Arial,sans-serif;--dsh-composer-text-max-height:336px;--dsh-composer-card-max-width:780px;--dsh-composer-side-clearance:16px}body{margin:0;background:#f4f6f8}#root{max-width:800px;margin:100px auto}${css}</style><div id="root"></div><script src="fixture.js"></script></html>`)
console.log(outputDir)
