import { createServer, type IncomingMessage } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

/** Real OAuth/PKCE and MCP fixture; no mocked client or transport. */
export async function miraMcpOAuthServer(type: 'streamableHttp' | 'sse' = 'streamableHttp') {
  const clients = new Map<string, string[]>(), codes = new Map<string, { client: string; redirect: string; challenge: string }>()
  const sessions = new Map<string, StreamableHTTPServerTransport | SSEServerTransport>(), servers: Server[] = []
  const tokens = new Set<string>(), refreshTokens = new Set<string>()
  const counts = { registration: 0, exchange: 0, refresh: 0, initialized: 0, tools: 0 }
  let base = '', denyToken = false, failExchange = false, toolError = false
  async function source(request: IncomingMessage) { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks).toString() }
  function mcp() {
    const server = new Server({ name: 'mira-oauth-fixture', version: '1' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'authorized_echo', inputSchema: { type: 'object', properties: {} } }] }))
    server.setRequestHandler(CallToolRequestSchema, async () => { counts.tools++; return { content: [{ type: 'text', text: `Authorized tool result ${[...tokens].join(' ')} ${[...refreshTokens].join(' ')}` }], ...(toolError ? { isError: true } : {}) } })
    servers.push(server); return server
  }
  const http = createServer(async (request, response) => {
    const url = new URL(request.url!, base)
    const json = (value: unknown, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    try {
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return json({ resource: `${base}/${type === 'sse' ? 'sse' : 'mcp'}`, authorization_servers: [base], scopes_supported: ['tools'] })
      if (url.pathname === '/.well-known/oauth-authorization-server') return json({ issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'] })
      if (url.pathname === '/register') {
        const data = JSON.parse(await source(request)), id = `client-${randomUUID()}`
        clients.set(id, data.redirect_uris); counts.registration++
        return json({ ...data, client_id: id }, 201)
      }
      if (url.pathname === '/authorize') {
        const client = url.searchParams.get('client_id')!, redirect = url.searchParams.get('redirect_uri')!, challenge = url.searchParams.get('code_challenge')!
        if (!clients.get(client)?.includes(redirect) || url.searchParams.get('code_challenge_method') !== 'S256' || !challenge || !url.searchParams.get('state')) return json({ error: 'invalid_request' }, 400)
        const code = randomUUID(); codes.set(code, { client, redirect, challenge })
        const target = new URL(redirect); target.searchParams.set('code', code); target.searchParams.set('state', url.searchParams.get('state')!); target.searchParams.set('iss', base)
        response.writeHead(302, { Location: target.href }); response.end(); return
      }
      if (url.pathname === '/token') {
        const data = new URLSearchParams(await source(request))
        if (failExchange) return json({ error: 'server_error', error_description: 'fixture-private-message' }, 500)
        if (data.get('grant_type') === 'refresh_token') {
          if (!refreshTokens.has(data.get('refresh_token')!)) return json({ error: 'invalid_grant' }, 400)
          counts.refresh++
        } else {
          const code = codes.get(data.get('code')!)
          if (!code || code.client !== data.get('client_id') || code.redirect !== data.get('redirect_uri') || code.challenge !== createHash('sha256').update(data.get('code_verifier') || '').digest('base64url')) return json({ error: 'invalid_grant' }, 400)
          codes.delete(data.get('code')!); counts.exchange++
        }
        const token = `access-${randomUUID()}`, refresh = `refresh-${randomUUID()}`
        tokens.add(token); refreshTokens.add(refresh); denyToken = false
        return json({ access_token: token, refresh_token: refresh, token_type: 'Bearer', expires_in: 3600, scope: 'tools' })
      }
      if (denyToken || !tokens.has(request.headers.authorization?.replace(/^Bearer /, '') || '')) {
        response.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`)
        return json({ error: 'unauthorized' }, 401)
      }
      if (type === 'sse') {
        if (request.method === 'GET' && url.pathname === '/sse') {
          const transport = new SSEServerTransport('/messages', response); sessions.set(transport.sessionId, transport); counts.initialized++
          await mcp().connect(transport); return
        }
        const transport = sessions.get(url.searchParams.get('sessionId')!)
        if (transport instanceof SSEServerTransport) { await transport.handlePostMessage(request, response, JSON.parse(await source(request))); return }
      } else if (url.pathname === '/mcp') {
        const data = request.method === 'POST' ? JSON.parse(await source(request)) : undefined
        let transport = sessions.get(request.headers['mcp-session-id'] as string)
        if (!transport && data?.method === 'initialize') {
          const created = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true, onsessioninitialized: id => sessions.set(id, created) })
          transport = created; counts.initialized++; await mcp().connect(created)
        }
        if (transport instanceof StreamableHTTPServerTransport) { await transport.handleRequest(request, response, data); return }
      }
      json({ error: 'not_found' }, 404)
    } catch { if (!response.headersSent) json({ error: 'fixture_failure' }, 500); else response.end() }
  })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(http.address() as { port: number }).port}`
  return {
    url: `${base}/${type === 'sse' ? 'sse' : 'mcp'}`, counts,
    revokeAccess: () => { denyToken = true }, failExchange: () => { failExchange = true }, toolError: () => { toolError = true },
    async browserCallback(authorizationUrl: string) {
      const response = await fetch(authorizationUrl, { redirect: 'manual' })
      if (response.status !== 302) throw new Error(`Fixture authorization failed: ${response.status}`)
      return response.headers.get('location')!
    },
    async close() { await Promise.all(servers.map(server => server.close())); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())) },
  }
}
