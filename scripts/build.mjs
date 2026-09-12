import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { rolldown } from 'rolldown'
import { transform as transformCss } from 'lightningcss'
import { CLIENT_DEPS, ROOT, hostDirectory, resolveBuildImport, resolveDependency } from './dependencies.mjs'

export const PLUGIN_ID = '@howmp/dsh-pentest/ui-pentest'
const CSS_PREFIX = '\0dsh-inline-css:'
const CSS_QUERY = '?dsh-inline-css'

export function cssModuleCode(css, classes, tagId) {
  return `const tagId = ${JSON.stringify(tagId)}
if (typeof document !== 'undefined' && ![...document.querySelectorAll('style[data-plugin-css]')].some(tag => tag.dataset.pluginCss === tagId)) {
  const tag = document.createElement('style')
  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)}
  tag.dataset.pluginCss = tagId
  tag.textContent = ${JSON.stringify(css)}
  document.head.appendChild(tag)
}
export default ${JSON.stringify(classes)}
`
}

function inlineCss() {
  return {
    name: 'dsh-inline-css',
    resolveId(source, importer) {
      if (!source.endsWith('.css') || !importer) return null
      // Keep the source extension for resolution, but add a query so modern
      // Rolldown does not infer the virtual module's loader from `.css`.
      return CSS_PREFIX + resolveBuildImport(source, importer) + CSS_QUERY
    },
    async load(id) {
      if (!id.startsWith(CSS_PREFIX)) return null
      const resolved = id.slice(CSS_PREFIX.length)
      const filename = resolved.endsWith(CSS_QUERY) ? resolved.slice(0, -CSS_QUERY.length) : resolved
      const module = filename.endsWith('.module.css')
      const stableName = module ? relative(ROOT, filename).replaceAll('\\', '/') : '@xyflow/react/dist/style.css'
      const result = transformCss({
        filename: stableName,
        code: await readFile(filename),
        cssModules: module ? { pattern: 'dsh-pentest_[name]_[local]_[hash]' } : false,
        minify: false,
      })
      const classes = Object.fromEntries(Object.entries(result.exports ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => {
        if (value.composes.length) throw new Error(`CSS composition is not supported by this bundle: ${stableName}`)
        return [name, value.name]
      }))
      return cssModuleCode(result.code.toString(), classes, `${PLUGIN_ID}/${stableName}`)
    },
  }
}

function bundleIdentity() {
  const invariant = join(ROOT, 'src/dsh-pentest/src/invariant.ts').replaceAll('\\', '/')
  return {
    name: 'dsh-bundle-identity',
    transform(code, id) {
      if (id.replaceAll('\\', '/') !== invariant) return null
      // Packaging identity only; source tests retain their upstream identity.
      return code
        .replace(/(const PACKAGE_NAME\s*=\s*)['"]@deepseek-ai\/dsh-pentest['"]/, '$1\'@howmp/dsh-pentest\'')
        .replace(/(export const name\s*=\s*)['"]pentest-invariant['"]/, '$1\'dsh-pentest-invariant\'')
    },
  }
}

export function wrapClient(code) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PLUGIN_ID)},
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
${code}
    return module.exports
  }
})
`
}

async function bundle(input, { client = false } = {}) {
  const host = hostDirectory()
  const build = await rolldown({
    cwd: ROOT,
    input: join(ROOT, input),
    platform: client ? 'browser' : 'node',
    external: source => isBuiltin(source) || source.startsWith('@deepseek-ai/')
      || (client && /^(react|react-dom)(\/|$)/.test(source)),
    resolve: { modules: ['node_modules', ...(host ? [host] : []), CLIENT_DEPS] },
    transform: {
      target: 'es2022',
      jsx: { runtime: 'automatic' },
      define: client ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
    },
    plugins: client ? [inlineCss()] : [bundleIdentity()],
    onLog(level, log, defaultHandler) {
      if (log.code === 'UNRESOLVED_IMPORT') throw new Error(log.message)
      defaultHandler(level, log)
    },
  })
  try {
    const { output } = await build.generate({
      format: client ? 'cjs' : 'es',
      exports: 'named',
      sourcemap: false,
      codeSplitting: false,
      comments: { legal: true, annotation: false, jsdoc: false },
    })
    if (output.length !== 1 || output[0].type !== 'chunk') {
      throw new Error('Expected one self-contained JavaScript artifact per entry')
    }
    return client ? wrapClient(output[0].code) : output[0].code
  } finally {
    await build.close()
  }
}

export async function buildArtifacts(target = 'all') {
  if (!['all', 'host', 'client'].includes(target)) throw new Error(`Unknown build target: ${target}`)
  const outputs = new Map()
  if (target !== 'client') {
    outputs.set('pentest.js', await bundle('src/dsh-pentest/src/index.ts'))
    outputs.set('invariant.js', await bundle('src/dsh-pentest/src/invariant.ts'))
  }
  if (target !== 'host') {
    resolveDependency('@xyflow/react', { client: true })
    outputs.set('ui-pentest.client.js', await bundle('src/dsh-client-ui-pentest/src/client/index.ts', { client: true }))
  }
  return outputs
}

async function main() {
  const { values } = parseArgs({ options: {
    target: { type: 'string', default: 'all' },
    'out-dir': { type: 'string', default: 'lib' },
    'host-node-modules': { type: 'string' },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  } })
  if (values.help) {
    console.log('node scripts/build.mjs [--target all|host|client] [--out-dir PATH] [--check] [--host-node-modules PATH]')
    return
  }
  if (values['host-node-modules']) process.env.DSH_HOST_NODE_MODULES = values['host-node-modules']
  const directory = resolve(ROOT, values['out-dir'])
  const relativeDirectory = relative(ROOT, directory)
  if (isAbsolute(relativeDirectory) || relativeDirectory.split(/[\\/]/).includes('..')
    || !relativeDirectory || ['src', 'preset', 'packages', 'node_modules'].includes(relativeDirectory.split(/[\\/]/)[0])) {
    throw new Error('--out-dir must be a build-output directory inside this repository, not a source or dependency directory')
  }
  const outputs = await buildArtifacts(values.target)
  if (!values.check) await mkdir(directory, { recursive: true })
  for (const [name, code] of outputs) {
    const filename = join(directory, name)
    if (values.check) {
      const existing = await readFile(filename, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      if (existing !== code) {
        console.error(`STALE ${relative(ROOT, filename)}`)
        process.exitCode = 1
      } else console.log(`OK ${relative(ROOT, filename)}`)
    } else {
      await writeFile(filename, code)
      console.log(`${relative(ROOT, filename)} (${Buffer.byteLength(code)} bytes, sha256 ${createHash('sha256').update(code).digest('hex')})`)
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
