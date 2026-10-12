/* OAuth transaction semantics adapted from ZCode mcp/oauth-interactive.ts and auth/localhost-callback.ts.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira names, single-host lifecycle fencing and SDK v1 provider; see third-party-licenses/zcode/. */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { MiraMcpCredentialStore, miraMcpAuthorizationIdentity } from '../storage/miraMcpCredentialStore'

export interface MiraMcpAuthorizationStatus { startedAt: number; expiresAt: number }
export interface MiraMcpAuthorizationEvent { configId: string; serverUrl: string; state: 'required' | 'authorized' | 'cancelled' | 'failed'; error?: string }
interface MiraMcpAuthorizationLease {
  configId: string; serverUrl: string; key: string; controller: AbortController; server?: Server
  provider?: OAuthClientProvider; redirectUrl?: string; state?: string; verifier?: string
  client?: OAuthClientInformationMixed; discovery?: OAuthDiscoveryState
  pending?: MiraMcpAuthorizationStatus & { url: string; state: string }
  timer?: ReturnType<typeof setTimeout>; exchanging: boolean
}

/** Full SDK provider owned by one current host connection; browsing is always explicit. */
export class MiraMcpAuthorization {
  private readonly leases = new Map<string, MiraMcpAuthorizationLease>()
  private readonly listeners = new Set<(event: MiraMcpAuthorizationEvent) => void>()
  private readonly children = new Set<MiraMcpAuthorization>()
  private parent?: MiraMcpAuthorization
  constructor(private readonly credentials: MiraMcpCredentialStore, private readonly options: { timeoutMs?: number; fetchFn?: typeof fetch } = {}) {}
  subscribe(listener: (event: MiraMcpAuthorizationEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  prepareRetry(configId: string, serverUrl: string) { this.credentials.prepareRetry(configId, serverUrl) }
  fork() {
    const child = new MiraMcpAuthorization(this.credentials, this.options)
    child.parent = this
    this.children.add(child)
    child.subscribe(event => { for (const listener of this.listeners) listener(event) })
    return child
  }
  async release(child: MiraMcpAuthorization) { this.children.delete(child); await child.closeAll() }
  private publish(lease: MiraMcpAuthorizationLease, state: MiraMcpAuthorizationEvent['state'], error?: string) {
    if (this.leases.get(lease.key) !== lease) return
    for (const listener of this.listeners) {
      try { listener({ configId: lease.configId, serverUrl: lease.serverUrl, state, ...(error ? { error } : {}) }) } catch { /* Observers cannot interrupt credential exchange. */ }
    }
  }
  private requireCurrent(lease: MiraMcpAuthorizationLease) {
    if (this.leases.get(lease.key) !== lease || lease.controller.signal.aborted) throw new Error('MCP 授权连接已结束')
  }
  private clearPending(lease: MiraMcpAuthorizationLease) { clearTimeout(lease.timer); lease.timer = undefined; lease.pending = undefined; lease.verifier = undefined }
  private async closeListener(lease: MiraMcpAuthorizationLease) {
    const server = lease.server
    lease.server = undefined
    if (server?.listening) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  }
  private async fail(lease: MiraMcpAuthorizationLease, error: string, state: 'failed' | 'cancelled' = 'failed') {
    this.clearPending(lease); lease.controller.abort(); this.publish(lease, state, error)
    await this.closeListener(lease)
  }
  async createProvider(configId: string, serverUrl: string): Promise<OAuthClientProvider> {
    this.parent?.children.add(this)
    const identity = miraMcpAuthorizationIdentity(configId, serverUrl)
    await this.close(configId, serverUrl)
    const lease: MiraMcpAuthorizationLease = { ...identity, controller: new AbortController(), exchanging: false }
    this.leases.set(identity.key, lease)
    const callbackPath = `/mira/mcp/callback/${randomBytes(16).toString('hex')}`
    const server = createServer((request, response) => {
      const respond = (status: number, message: string) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); response.end(message) }
      const url = new URL(request.url ?? '/', lease.redirectUrl ?? 'http://127.0.0.1')
      if (request.method !== 'GET' || url.pathname !== callbackPath || request.headers.host !== new URL(lease.redirectUrl!).host) { respond(404, '无效授权回调。'); return }
      const pending = lease.pending, state = url.searchParams.get('state') ?? ''
      if (!pending || this.leases.get(lease.key) !== lease || lease.controller.signal.aborted || lease.exchanging) { respond(410, '授权请求已结束。'); return }
      const expected = Buffer.from(pending.state), actual = Buffer.from(state)
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected) || url.searchParams.getAll('state').length !== 1) { respond(400, '授权状态不匹配，请使用当前授权入口。'); return }
      if (url.searchParams.has('error')) { respond(400, '授权未完成，请返回 Mira 重试。'); void this.fail(lease, 'MCP 授权被拒绝，请重新授权', 'cancelled'); return }
      const code = url.searchParams.get('code'), issuer = url.searchParams.get('iss')
      if (!code || code.length > 8192 || url.searchParams.getAll('code').length !== 1 || issuer && issuer !== lease.discovery?.authorizationServerUrl) { respond(400, '授权响应无效，请返回 Mira 重试。'); void this.fail(lease, 'MCP 授权响应无效，请重新授权'); return }
      lease.exchanging = true
      clearTimeout(lease.timer); lease.timer = undefined
      respond(200, '授权响应已收到，正在交换凭据。请返回 Mira 查看结果。')
      const networkTimer = setTimeout(() => { void this.fail(lease, 'MCP 授权交换超时，请重新授权') }, this.options.timeoutMs ?? 5 * 60 * 1000)
      void auth(lease.provider!, { serverUrl: lease.serverUrl, authorizationCode: code, fetchFn: this.fetchFor(lease) }).then(result => {
        this.requireCurrent(lease)
        if (result !== 'AUTHORIZED') throw new Error('authorization incomplete')
        this.clearPending(lease)
        this.publish(lease, 'authorized')
      }).catch(() => { if (!lease.controller.signal.aborted) return this.fail(lease, 'MCP 授权交换失败，请重新授权') }).finally(() => { clearTimeout(networkTimer); void this.closeListener(lease) })
    })
    lease.server = server
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() }) })
      this.requireCurrent(lease)
      lease.redirectUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}${callbackPath}`
    } catch { await this.closeListener(lease); if (this.leases.get(lease.key) === lease) this.leases.delete(lease.key); throw new Error('MCP 本机授权回调无法启动，请重试') }
    const stored = () => { this.requireCurrent(lease); return this.credentials.read(configId, lease.serverUrl) }
    lease.provider = {
      get redirectUrl() { return lease.redirectUrl! },
      get clientMetadata() { return { client_name: 'Mira MCP', redirect_uris: [lease.redirectUrl!], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' } },
      state: () => { this.requireCurrent(lease); this.clearPending(lease); lease.state = randomBytes(32).toString('base64url'); return lease.state },
      // Reuse DCR client only for refresh. Interactive authorization needs the current callback port.
      clientInformation: () => lease.client ?? (stored()?.tokens.refresh_token ? stored()?.clientInformation : undefined),
      saveClientInformation: information => { this.requireCurrent(lease); lease.client = structuredClone(information) },
      tokens: () => stored()?.tokens,
      saveTokens: tokens => {
        this.requireCurrent(lease)
        const previous = stored(), clientInformation = lease.client ?? previous?.clientInformation
        if (!clientInformation) throw new Error('MCP 授权缺少客户端信息')
        const obtainedAt = Date.now()
        const combined: OAuthTokens = { ...tokens, ...(tokens.refresh_token === undefined && previous?.tokens.refresh_token ? { refresh_token: previous.tokens.refresh_token } : {}) }
        this.credentials.save(configId, lease.serverUrl, { clientInformation, tokens: combined, discovery: lease.discovery ?? previous?.discovery, obtainedAt, ...(tokens.expires_in !== undefined ? { expiresAt: obtainedAt + tokens.expires_in * 1000 } : {}) })
      },
      saveCodeVerifier: value => { this.requireCurrent(lease); lease.verifier = value },
      codeVerifier: () => { this.requireCurrent(lease); if (!lease.verifier) throw new Error('MCP 授权校验信息已失效'); return lease.verifier },
      redirectToAuthorization: async url => {
        this.requireCurrent(lease)
        if (!server.listening || !lease.state || url.searchParams.get('state') !== lease.state || url.searchParams.get('redirect_uri') !== lease.redirectUrl || url.searchParams.get('code_challenge_method') !== 'S256' || !url.searchParams.get('code_challenge')) throw new Error('MCP 授权请求无效，请重连后重试')
        const target = new URL(url)
        if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw new Error('MCP 授权网址无效')
        const startedAt = Date.now(), expiresAt = startedAt + (this.options.timeoutMs ?? 5 * 60 * 1000)
        lease.pending = { url: target.href, state: lease.state, startedAt, expiresAt }
        lease.timer = setTimeout(() => { void this.fail(lease, 'MCP 授权超时，请重新授权') }, expiresAt - startedAt)
        this.publish(lease, 'required')
      },
      discoveryState: () => { this.requireCurrent(lease); return lease.discovery ?? stored()?.discovery },
      saveDiscoveryState: value => { this.requireCurrent(lease); lease.discovery = structuredClone(value) },
      invalidateCredentials: scope => {
        this.requireCurrent(lease)
        if (scope === 'all' || scope === 'client' || scope === 'tokens') { this.credentials.delete(configId, lease.serverUrl); lease.client = undefined }
        if (scope === 'all' || scope === 'discovery') lease.discovery = undefined
        if (scope === 'all' || scope === 'verifier') lease.verifier = undefined
      },
    }
    return lease.provider
  }
  private fetchFor(lease: MiraMcpAuthorizationLease): typeof fetch {
    return async (input, init) => {
      this.requireCurrent(lease)
      const response = await (this.options.fetchFn ?? fetch)(input, { ...init, redirect: 'error', signal: init?.signal ? AbortSignal.any([lease.controller.signal, init.signal]) : lease.controller.signal })
      this.requireCurrent(lease)
      return response
    }
  }
  fetch(provider: OAuthClientProvider, input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
    const lease = [...this.leases.values()].find(item => item.provider === provider)
    if (!lease) throw new Error('MCP 授权连接已结束')
    return this.fetchFor(lease)(input, init)
  }
  getPending(configId: string, serverUrl: string): MiraMcpAuthorizationStatus | undefined {
    const pending = this.leases.get(miraMcpAuthorizationIdentity(configId, serverUrl).key)?.pending
    if (pending && pending.expiresAt > Date.now()) return { startedAt: pending.startedAt, expiresAt: pending.expiresAt }
    for (const child of this.children) { const status = child.getPending(configId, serverUrl); if (status) return status }
  }
  async openAuthorization(configId: string, serverUrl: string, openUrl: (url: string) => Promise<unknown> | unknown): Promise<void> {
    const lease = this.leases.get(miraMcpAuthorizationIdentity(configId, serverUrl).key)
    if (!lease?.pending) {
      for (const child of this.children) if (child.getPending(configId, serverUrl)) return child.openAuthorization(configId, serverUrl, openUrl)
    }
    if (!lease?.pending || lease.pending.expiresAt <= Date.now() || lease.controller.signal.aborted || lease.exchanging) throw new Error('MCP 授权入口已失效，请重新授权')
    this.requireCurrent(lease)
    await openUrl(lease.pending.url)
  }
  async close(configId: string, serverUrl: string) {
    const key = miraMcpAuthorizationIdentity(configId, serverUrl).key, lease = this.leases.get(key)
    if (!lease) return
    const pending = Boolean(lease.pending)
    this.clearPending(lease); lease.controller.abort()
    if (pending) this.publish(lease, 'cancelled')
    if (this.leases.get(key) === lease) this.leases.delete(key)
    await this.closeListener(lease)
  }
  async closeAll() { await Promise.all([...this.leases.values()].map(lease => this.close(lease.configId, lease.serverUrl))); await Promise.all([...this.children].map(child => this.release(child))); this.parent?.children.delete(this) }
}
