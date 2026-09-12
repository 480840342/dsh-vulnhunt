import { dependencyInfo, hostDirectory } from './dependencies.mjs'

const hostPackages = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-invariants',
  '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-storage', '@deepseek-ai/dsh-storage-domain',
  '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm']

console.log(`Node ${process.version}; host fallback: ${hostDirectory() ?? '(not configured)'}`)
console.log('Repository host target: DSH 0.1.0-rc.6 (including its declared Cordis peer).')
for (const name of ['vitest', 'rolldown', 'lightningcss', 'zod', ...hostPackages, '@xyflow/react']) {
  try {
    const info = dependencyInfo(name, { client: true })
    console.log(`${info.name}@${info.version}: ${info.directory}`)
    if (hostPackages.includes(name) && info.version !== '0.1.0-rc.6') {
      console.warn(`  WARNING: ${name} differs from the repository target; test results are compatibility evidence only.`)
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
