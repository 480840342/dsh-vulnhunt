import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../', import.meta.url))
export const CLIENT_DEPS = join(ROOT, 'scripts/client-deps/node_modules')
const localRequire = createRequire(join(ROOT, 'package.json'))

export function hostDirectory(env = process.env) {
  if (!env.DSH_HOST_NODE_MODULES) return undefined
  const directory = resolve(env.DSH_HOST_NODE_MODULES)
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`DSH_HOST_NODE_MODULES is not a directory: ${directory}`)
  }
  return directory
}

export function packageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
}

export function resolveDependency(specifier, { host = hostDirectory(), client = false } = {}) {
  const name = packageName(specifier)
  for (const directory of [join(ROOT, 'node_modules'), ...(host ? [host] : []), ...(client ? [CLIENT_DEPS] : [])]) {
    // Only use the requested tree, never an unrelated ancestor installation.
    if (!existsSync(join(directory, name, 'package.json'))) continue
    const require = createRequire(join(directory, '.dsh-resolve.cjs'))
    return require.resolve(specifier)
  }
  throw new Error(`Missing dependency '${specifier}'. Use repo node_modules or set DSH_HOST_NODE_MODULES to a compatible DSH node_modules directory.${client ? ' For isolated client build dependencies, see scripts/README.md.' : ''}`)
}

export function dependencyInfo(name, options) {
  const entry = resolveDependency(name, options)
  let directory = dirname(entry)
  while (dirname(directory) !== directory) {
    const manifest = join(directory, 'package.json')
    if (existsSync(manifest)) {
      const data = JSON.parse(readFileSync(manifest, 'utf8'))
      if (data.name === name) return { name, version: data.version, directory }
    }
    directory = dirname(directory)
  }
  throw new Error(`Cannot find package metadata for ${name}`)
}

export function dependencyFallback() {
  return {
    name: 'dsh-local-dependency-fallback',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.startsWith('@deepseek-ai/')) return null
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      if (resolved) return resolved
      return resolveDependency(source).replaceAll('\\', '/')
    },
  }
}

export function resolveBuildImport(source, importer) {
  if (source.startsWith('.') || isAbsolute(source)) {
    return resolve(dirname(importer), source)
  }
  try {
    return localRequire.resolve(source, { paths: [dirname(importer)] })
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    return resolveDependency(source, { client: true })
  }
}
