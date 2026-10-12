import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { DEFAULT_REQUEST_TIMEOUT_MSEC } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { validateToolArguments } from '@earendil-works/pi-ai'
import { McpManager } from '../electron/adapters/mcpManager'
import type { McpServerConfig } from '../electron/storage/mcpConfigStore'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { await Promise.all(cleanups.splice(0).map(cleanup => cleanup())); vi.restoreAllMocks() })
const config = (fields: Partial<McpServerConfig>): McpServerConfig => ({ id: 'remote', name: 'Remote', command: '', args: [], enabled: true, createdAt: 1, updatedAt: 1, ...fields })
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
}
async function fixture(type: 'streamableHttp' | 'sse') {
  const manager = new McpManager()
  const sessions = new Map<string, StreamableHTTPServerTransport | SSEServerTransport>()
  const servers: Server[] = []
  const requests: { method: string; url: string; authorization?: string; custom?: string }[] = []
  let denied = 0; let initialized = 0; let called = 0; let cancelled = 0; let rejectProtocol = false
  let reply: { text: string; isError: boolean } | undefined
  let markStarted!: () => void; let markCancelled!: () => void
  const started = new Promise<void>(resolve => { markStarted = resolve })
  const cancellation = new Promise<void>(resolve => { markCancelled = resolve })
  const releases: (() => void)[] = []
  function mcp() {
    const server = new Server({ name: 'mira-test', version: '1' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'mira_remote_echo', description: 'Actual remote echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] }))
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      called++
      if (request.params.arguments?.text === 'hold') {
        await new Promise<void>(resolve => {
          const abort = () => { cancelled++; markCancelled(); resolve() }
          extra.signal.addEventListener('abort', abort, { once: true })
          releases.push(() => { extra.signal.removeEventListener('abort', abort); resolve() })
          markStarted()
        })
      }
      return { ...(reply && { isError: reply.isError }), content: [{ type: 'text', text: reply?.text ?? `real:${request.params.arguments?.text}` }] }
    })
    servers.push(server); return server
  }
  const http = createServer(async (req, res) => {
    try {
      requests.push({ method: req.method!, url: req.url!, authorization: req.headers.authorization, custom: req.headers['x-mira-token'] as string | undefined })
      if (denied) { res.writeHead(denied); res.end('do-not-leak-body-private'); return }
      if (rejectProtocol) { res.writeHead(404); res.end('not-mcp'); return }
      const url = new URL(req.url!, 'http://localhost')
      if (type === 'sse') {
        if (req.method === 'GET' && url.pathname === '/sse') {
          const transport = new SSEServerTransport('/messages', res)
          sessions.set(transport.sessionId, transport); initialized++
          await mcp().connect(transport); return
        }
        const transport = sessions.get(url.searchParams.get('sessionId') || '')
        if (transport instanceof SSEServerTransport) { await transport.handlePostMessage(req, res, await body(req)); return }
      } else if (url.pathname === '/mcp') {
        const parsed = await body(req)
        let transport = sessions.get(req.headers['mcp-session-id'] as string)
        if (!transport && parsed?.method === 'initialize') {
          const created = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true, onsessioninitialized: id => sessions.set(id, created) })
          initialized++; transport = created; await mcp().connect(created)
        }
        if (transport instanceof StreamableHTTPServerTransport) { await transport.handleRequest(req, res, parsed); return }
      }
      res.writeHead(400); res.end('invalid session')
    } catch { if (!res.headersSent) res.writeHead(500); res.end() }
  })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const address = http.address() as { port: number }
  cleanups.push(async () => { releases.forEach(release => release()); await manager.closeAll(); await Promise.all(servers.map(server => server.close())); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())) })
  return {
    manager, requests, url: `http://127.0.0.1:${address.port}/${type === 'sse' ? 'sse' : 'mcp'}?key=query-private`,
    deny: (status: number) => { denied = status }, rejectProtocol: () => { rejectProtocol = true },
    reply: (text: string, isError = false) => { reply = { text, isError } },
    started, cancellation, cancelled: () => cancelled,
    counts: () => ({ initialized, called }),
  }
}

describe('Mira MCP actual SDK transports', () => {
  it.each(['streamableHttp', 'sse'] as const)('cancels a running %s request without disconnecting or cancelling other calls', async type => {
    const view = await fixture(type)
    await view.manager.refresh([config({ type, url: view.url, headers: { Authorization: 'Bearer header-private' } })])
    const tool = view.manager.getTools()[0]
    const controller = new AbortController()
    const stopped = tool.execute('stopped', { text: 'hold' }, controller.signal).catch((error: unknown) => error)
    await view.started
    const sibling = tool.execute('sibling', { text: 'sibling' })
    controller.abort(new Error('do-not-leak-header-private-query-private'))
    const outcome = await Promise.race([stopped, new Promise(resolve => setTimeout(() => resolve('still-running'), 250))])
    expect(outcome).toMatchObject({ name: 'AbortError', message: '运行已停止' })
    expect(await Promise.race([view.cancellation.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 250))])).toBe(true)
    expect(view.cancelled()).toBe(1)
    expect(await sibling).toMatchObject({ content: [{ text: 'real:sibling' }] })
    expect(await tool.execute('next', { text: 'next' })).toMatchObject({ content: [{ text: 'real:next' }] })
    expect(view.counts()).toEqual({ initialized: 1, called: 3 })
    expect(view.manager.getStatus('remote')).toEqual({ state: 'connected', toolCount: 1 })
  })

  it.each(['streamableHttp', 'sse'] as const)('makes no %s request for a pre-aborted call and preserves the connection', async type => {
    const view = await fixture(type)
    await view.manager.refresh([config({ type, url: view.url })])
    const controller = new AbortController(); controller.abort()
    const before = view.requests.length
    await expect(view.manager.getTools()[0].execute('stopped', { text: 'never' }, controller.signal)).rejects.toMatchObject({ name: 'AbortError', message: '运行已停止' })
    expect(view.requests).toHaveLength(before)
    expect(view.counts().called).toBe(0)
    expect(await view.manager.getTools()[0].execute('next', { text: 'next' })).toMatchObject({ content: [{ text: 'real:next' }] })
    expect(view.counts().initialized).toBe(1)
  })

  it.each(['streamableHttp', 'sse'] as const)('reports a recoverable %s SDK request timeout and reuses the connection', async type => {
    const view = await fixture(type)
    await view.manager.refresh([config({ type, url: view.url, headers: { Authorization: 'Bearer header-private' } })])
    // Accelerate only the SDK's existing 60-second timer; keep real HTTP/SSE I/O and cancellation.
    const schedule = globalThis.setTimeout
    const timers = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler, ms, ...args) => schedule(handler, ms === DEFAULT_REQUEST_TIMEOUT_MSEC ? 50 : ms, ...args)) as typeof setTimeout)
    const controller = new AbortController()
    const result = view.manager.getTools()[0].execute('timeout', { text: 'hold' }, controller.signal).catch((error: unknown) => error)
    await view.started
    expect(await result).toMatchObject({ message: 'MCP 工具调用超时，请重试；如果持续超时，请检查服务状态' })
    expect(controller.signal.aborted).toBe(false)
    expect(timers.mock.calls.some(([, ms]) => ms === 60_000)).toBe(true)
    timers.mockRestore()
    expect(await Promise.race([view.cancellation.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 250))])).toBe(true)
    expect(view.cancelled()).toBe(1)
    expect(await view.manager.getTools()[0].execute('next', { text: 'next' })).toMatchObject({ content: [{ text: 'real:next' }] })
    expect(view.counts()).toEqual({ initialized: 1, called: 2 })
    expect(view.manager.getStatus('remote')).toEqual({ state: 'connected', toolCount: 1 })
  })

  it.each(['streamableHttp', 'sse'] as const)('connects, lists, calls, disconnects and reconnects an actual %s server with all request headers', async type => {
    const view = await fixture(type)
    const selected = config({ type, url: view.url, headers: { Authorization: 'Bearer header-private', 'X-Mira-Token': 'custom-private' } })
    await view.manager.refresh([selected])
    expect(view.manager.getStatus(selected.id)).toEqual({ state: 'connected', toolCount: 1 })
    const tool = view.manager.getTools([selected.id])[0]
    expect(tool).toMatchObject({ name: expect.stringMatching(/^mira_mcp_[a-f0-9]{10}_mira_remote_echo_[a-f0-9]{8}$/), label: 'mira_remote_echo', miraMcpToolName: 'mira_remote_echo', executionMode: 'sequential', miraMcpServerName: 'Remote', miraMcpServerId: 'remote' })
    expect(tool.parameters).toMatchObject({ type: 'object', properties: { text: { type: 'string' } }, required: ['text'] })
    expect(() => validateToolArguments(tool, { type: 'toolCall', id: 'invalid', name: tool.name, arguments: {} })).toThrow('Validation failed')
    expect(view.counts().called).toBe(0)
    const args = validateToolArguments(tool, { type: 'toolCall', id: 'first', name: tool.name, arguments: { text: 'one' } })
    expect(await tool.execute('first', args)).toMatchObject({ content: [{ type: 'text', text: 'real:one' }] })
    await view.manager.closeAll()
    expect(view.manager.getStatus(selected.id)).toEqual({ state: 'disconnected', toolCount: 0 })
    expect(view.manager.getTools()).toEqual([])
    await view.manager.reconnect(selected)
    expect(view.manager.getTools([selected.id])[0].name).toBe(tool.name)
    expect(await view.manager.getTools([selected.id])[0].execute('second', { text: 'two' })).toMatchObject({ content: [{ text: 'real:two' }] })
    expect(view.counts()).toEqual({ initialized: 2, called: 2 })
    expect(view.requests.every(request => request.authorization === 'Bearer header-private' && request.custom === 'custom-private')).toBe(true)
    if (type === 'sse') expect(view.requests.some(request => request.method === 'GET' && request.url.startsWith('/sse'))).toBe(true)
    else expect(view.requests.some(request => request.method === 'POST' && request.url.startsWith('/mcp'))).toBe(true)
  })

  it.each([
    ['streamableHttp', 401], ['streamableHttp', 403], ['sse', 401], ['sse', 403],
  ] as const)('reports recoverable %s HTTP %i failures without credentials/URL/body in status or logs and retries only on request', async (type, status) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = await fixture(type); view.deny(status)
    const selected = config({ type, url: view.url, headers: { Authorization: 'Bearer header-private' } })
    await view.manager.refresh([selected])
    expect(view.manager.getStatus(selected.id)).toMatchObject({ state: 'failed', toolCount: 0, error: expect.stringContaining(status === 401 ? '需要认证' : '拒绝访问') })
    const printed = JSON.stringify([view.manager.getStatus(selected.id), logged.mock.calls])
    for (const secret of ['query-private', 'header-private', 'body-private', '127.0.0.1']) expect(printed).not.toContain(secret)
    expect(view.manager.getTools()).toEqual([])
    view.deny(0); await view.manager.reconnect(selected)
    expect(view.manager.getStatus(selected.id)).toEqual({ state: 'connected', toolCount: 1 })
    expect(view.counts().initialized).toBe(1)
  })

  it.each(['streamableHttp', 'sse'] as const)('sanitizes actual %s tool-call authentication errors while preserving server tool result semantics', async type => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = await fixture(type)
    const selected = config({ type, url: view.url, headers: { Authorization: 'Bearer header-private' } })
    await view.manager.refresh([selected]); view.deny(403)
    await expect(view.manager.getTools()[0].execute('denied', {})).rejects.toThrow('拒绝访问')
    view.deny(0)
    expect(await view.manager.getTools()[0].execute('retry', { text: 'restored' })).toMatchObject({ content: [{ text: 'real:restored' }] })
  })

  it('does not silently retry Streamable HTTP as legacy SSE', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = await fixture('streamableHttp'); view.rejectProtocol()
    await view.manager.refresh([config({ type: 'streamableHttp', url: view.url })])
    expect(view.manager.getStatus('remote')).toMatchObject({ state: 'failed', error: expect.stringContaining('远程连接失败') })
    expect(view.requests.map(request => request.method)).toEqual(['POST'])
  })

  it.each(['streamableHttp', 'sse'] as const)('redacts known %s credentials in successful and failed tool business responses', async type => {
    const view = await fixture(type)
    await view.manager.refresh([config({ type, url: view.url, headers: { Authorization: 'Bearer header-private', 'X-Mira-Token': 'custom-private' } })])
    const text = 'Meaningful response: Bearer header-private / header-private / custom-private / query-private'
    view.reply(text)
    expect((await view.manager.getTools()[0].execute('success', {})).content[0].text).toBe('Meaningful response: [REDACTED] / [REDACTED] / [REDACTED] / [REDACTED]')
    view.reply(text, true)
    await expect(view.manager.getTools()[0].execute('failure', {})).rejects.toThrow('Meaningful response: [REDACTED] / [REDACTED] / [REDACTED] / [REDACTED]')
  })

  it('supplies explicit environment variables to an actual stdio SDK child without replacing PATH', async () => {
    const manager = new McpManager(); cleanups.push(() => manager.closeAll())
    const source = `
      import { Server } from '@modelcontextprotocol/sdk/server/index.js';
      import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
      import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
      const server = new Server({name:'actual-stdio',version:'1'},{capabilities:{tools:{}}});
      server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'mira_env',inputSchema:{type:'object'}}]}));
      server.setRequestHandler(CallToolRequestSchema,async()=>({content:[{type:'text',text:JSON.stringify({token:process.env.MIRA_ACTUAL_TOKEN,path:!!process.env.PATH})}]}));
      await server.connect(new StdioServerTransport());
    `
    await manager.refresh([config({ command: process.execPath, args: ['--input-type=module', '-e', source], env: { MIRA_ACTUAL_TOKEN: 'actual-stdio-private' } })])
    expect(manager.getStatus('remote')).toEqual({ state: 'connected', toolCount: 1 })
    const result = await manager.getTools()[0].execute('env', {})
    expect(JSON.parse(result.content[0].text)).toEqual({ token: '[REDACTED]', path: true })
  })
})
