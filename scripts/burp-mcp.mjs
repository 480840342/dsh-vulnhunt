import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { globalHost } from './repair-composer.mjs'

export const inject = ['commands', 'tools']

export function apply(ctx, config = {}) {
  let connection
  let pending
  let disposed = false
  const disconnect = async () => {
    if (pending) await pending
    const active = connection
    connection = undefined
    await active?.dispose()
  }
  ctx.effect(() => async () => {
    disposed = true
    await disconnect()
  })
  ctx.commands.register({
    name: 'burp-connect',
    description: '连接 Burp MCP',
    handler: async () => {
      if (pending) return { kind: 'error', text: 'Burp MCP 正在连接，请稍后。' }
      if (connection) return { kind: 'success', text: 'Burp MCP 已启用，可通过 burp-disconnect 断开。' }
      pending = (async () => {
        let fiber
        try {
          const require = createRequire(join(globalHost(), 'package.json'))
          const bridge = config.args?.[0] ?? process.env.DSH_BURP_MCP_BRIDGE ?? 'D:/burp-mcp/node_modules/mcp-remote/dist/proxy.js'
          if (config.transport !== 'streamable-http' && !existsSync(bridge)) {
            throw new Error('未找到 mcp-remote。请配置 DSH_BURP_MCP_BRIDGE 或运行 configure-burp-mcp。')
          }
          const mcp = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-mcp-client')).href)
          fiber = ctx.plugin(mcp, {
            transport: 'stdio', serverName: 'burp',
            command: process.env.DSH_BURP_MCP_NODE ?? process.execPath,
            args: [bridge, process.env.DSH_BURP_MCP_URL ?? 'http://127.0.0.1:9876/', '--transport', 'sse-only'],
            cwd: dirname(bridge), env: {}, toolCallTimeoutMs: 60000,
            reconnect: { enabled: true, initialDelayMs: 1000, maxDelayMs: 30000, maxAttempts: 10 },
            ...config, failOnStartupError: true,
          })
          await fiber.inertia
          if (fiber.state !== 2 || disposed) throw new Error('连接失败，请检查 Burp MCP 服务地址及服务是否开启。')
          connection = fiber
          return { kind: 'success', text: 'Burp MCP 已连接，工具前缀为 mcp__burp__。连接在当前 DSH 进程内共享；重启后需要重新连接。' }
        } catch (error) {
          await fiber?.dispose()
          return { kind: 'error', text: `Burp MCP: ${error.message}` }
        }
      })()
      try { return await pending } finally { pending = undefined }
    },
  })
  ctx.commands.register({
    name: 'burp-disconnect', description: '断开 Burp MCP',
    handler: async () => {
      await disconnect()
      return { kind: 'success', text: 'Burp MCP 已断开。' }
    },
  })
}
