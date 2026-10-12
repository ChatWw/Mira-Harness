import { afterEach, describe, expect, it } from 'vitest'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraMcpCredentialStore } from '../electron/storage/miraMcpCredentialStore'
import { MiraMcpAuthorization, type MiraMcpAuthorizationEvent } from '../electron/services/miraMcpAuthorization'
import { McpManager } from '../electron/adapters/mcpManager'
import { miraMcpOAuthServer } from './helpers/miraMcpOAuthServer'

const cleanups: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function until(predicate: () => boolean) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) } throw new Error('Expected OAuth state did not arrive') }
async function fixture(type: 'streamableHttp' | 'sse' = 'streamableHttp', timeoutMs?: number) {
  const home = mkdtempSync(join(tmpdir(), 'mira-mcp-oauth-')); cleanups.push(() => rmSync(home, { recursive: true, force: true }))
  const paths = new MiraPaths(home).ensure(), key = randomBytes(32)
  const encryption = {
    encryptString(value: string) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]) },
    decryptString(value: Buffer) { const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(12, 28)); return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString() },
    isAvailable: () => true,
  }
  const credentials = new MiraMcpCredentialStore(paths, encryption)
  const authorization = new MiraMcpAuthorization(credentials, { timeoutMs }); cleanups.push(() => authorization.closeAll())
  const manager = new McpManager(authorization.fork(), authorization); cleanups.push(() => manager.closeAll())
  const server = await miraMcpOAuthServer(type); cleanups.push(() => server.close())
  const config = { id: 'remote', name: 'Mira OAuth', command: '', args: [], enabled: true, type, url: server.url, authentication: 'oauth' as const, createdAt: 1, updatedAt: 1 }
  const events: MiraMcpAuthorizationEvent[] = []; authorization.subscribe(event => { events.push(event) })
  await manager.refresh([config])
  const browser = async () => { let url = ''; await authorization.openAuthorization(config.id, server.url, value => { url = value }); return server.browserCallback(url) }
  return { home, paths, encryption, credentials, authorization, manager, server, config, events, browser }
}

describe('Mira MCP browser authorization using actual SDK and encrypted credentials', () => {
  it.each(['streamableHttp', 'sse'] as const)('completes %s discovery, DCR, PKCE, callback and reconnect, then reuses and refreshes persisted tokens', async type => {
    const view = await fixture(type)
    expect(view.manager.getStatus('remote')).toMatchObject({ state: 'authorization-required', authorization: { startedAt: expect.any(Number), expiresAt: expect.any(Number) } })
    expect(view.manager.getTools()).toEqual([])
    const callback = await view.browser(); expect((await fetch(callback)).status).toBe(200)
    await until(() => view.manager.getStatus('remote').state === 'connected')
    const result = await view.manager.getTools()[0].execute('call', {})
    expect(result.content[0].text).toContain('[REDACTED]'); expect(result.content[0].text).not.toMatch(/access-|refresh-/)
    view.server.toolError(); await expect(view.manager.getTools()[0].execute('error', {})).rejects.toThrow('[REDACTED]')
    const stored = view.credentials.read('remote', view.server.url)!
    expect(stored.clientInformation.client_id).toMatch(/^client-/)
    const files = readdirSync(join(view.paths.config, 'mcp-credentials')); expect(files).toHaveLength(1)
    expect(readFileSync(join(view.paths.config, 'mcp-credentials', files[0])).includes(Buffer.from(stored.tokens.access_token))).toBe(false)
    expect(JSON.stringify(view.events)).not.toContain(stored.tokens.access_token)
    expect(JSON.stringify(view.manager.getStatus('remote'))).not.toContain(stored.tokens.refresh_token!)
    await view.manager.closeAll()
    const reloaded = new MiraMcpAuthorization(new MiraMcpCredentialStore(view.paths, view.encryption)); cleanups.push(() => reloaded.closeAll())
    const manager = new McpManager(reloaded); cleanups.push(() => manager.closeAll())
    await manager.refresh([view.config]); expect(manager.getStatus('remote').state).toBe('connected')
    expect(view.server.counts).toMatchObject({ registration: 1, exchange: 1, refresh: 0, initialized: 2 })
    view.server.revokeAccess(); await manager.refresh([view.config])
    expect(manager.getStatus('remote').state).toBe('connected'); expect(view.server.counts.refresh).toBe(1)
  })

  it('rejects a wrong state without consuming the valid request, and rejects late callbacks after configuration replacement', async () => {
    const view = await fixture(), callback = new URL(await view.browser())
    const wrong = new URL(callback); wrong.searchParams.set('state', 'wrong')
    expect((await fetch(wrong)).status).toBe(400); expect(view.server.counts.exchange).toBe(0)
    expect(view.manager.getStatus('remote').state).toBe('authorization-required')
    expect((await fetch(callback)).status).toBe(200)
    await until(() => view.manager.getStatus('remote').state === 'connected')
    const other = await fixture(), late = await other.browser()
    await other.manager.refresh([{ ...other.config, enabled: false }])
    await expect(fetch(late)).rejects.toThrow(); expect(other.server.counts.exchange).toBe(0)
    expect(other.credentials.read('remote', other.server.url)).toBeUndefined()
  })

  it('isolates borrowed project authorization from global refresh and releases all callbacks on shutdown', async () => {
    const view = await fixture(), child = view.manager.createSibling(); cleanups.push(() => child.closeAll())
    const selected = { ...view.config, id: 'project:fixture:remote' }
    await child.refresh([selected])
    let childUrl = ''; await view.authorization.openAuthorization(selected.id, selected.url, url => { childUrl = url })
    const callback = await view.server.browserCallback(childUrl)
    await view.manager.refresh([])
    expect(view.authorization.getPending(selected.id, selected.url)).toBeDefined()
    expect((await fetch(callback)).status).toBe(200)
    await until(() => child.getStatus(selected.id).state === 'connected')
    expect(view.manager.getTools()).toEqual([]); expect(child.getTools()).toHaveLength(1)
    await view.authorization.closeAll()
    expect(view.authorization.getPending(selected.id, selected.url)).toBeUndefined()
  })

  it('reports denied and expired authorization as retryable failures without exchanging or persisting tokens', async () => {
    const view = await fixture(), callback = new URL(await view.browser()); callback.searchParams.delete('code'); callback.searchParams.set('error', 'access_denied')
    expect((await fetch(callback)).status).toBe(400)
    await until(() => view.manager.getStatus('remote').state === 'failed')
    expect(view.manager.getStatus('remote').error).toContain('被拒绝')
    expect(view.server.counts.exchange).toBe(0); expect(view.credentials.read('remote', view.server.url)).toBeUndefined()
    const expired = await fixture('streamableHttp', 80)
    await until(() => expired.manager.getStatus('remote').state === 'failed')
    expect(expired.manager.getStatus('remote').error).toContain('超时')
    await expect(expired.authorization.openAuthorization('remote', expired.server.url, () => undefined)).rejects.toThrow('已失效')
  })

  it('keeps exchange errors generic and retryable, with no partially written canonical pair', async () => {
    const view = await fixture(); view.server.failExchange()
    await fetch(await view.browser()); await until(() => view.manager.getStatus('remote').state === 'failed')
    expect(view.manager.getStatus('remote').error).toBe('MCP 授权交换失败，请重新授权')
    expect(view.credentials.read('remote', view.server.url)).toBeUndefined()
    expect(JSON.stringify(view.events)).not.toContain('fixture-private-message')
  })

  it('does not silently overwrite corrupt credentials, follow symlinks, or use unavailable encryption', async () => {
    const view = await fixture(); await fetch(await view.browser()); await until(() => view.manager.getStatus('remote').state === 'connected')
    const file = join(view.paths.config, 'mcp-credentials', readdirSync(join(view.paths.config, 'mcp-credentials'))[0])
    writeFileSync(file, 'corrupt'); expect(() => view.credentials.read('remote', view.server.url)).toThrow('原文件未被覆盖')
    expect(readFileSync(file, 'utf8')).toBe('corrupt')
    view.credentials.prepareRetry('remote', view.server.url)
    const backup = readdirSync(join(view.paths.config, 'mcp-credentials')).find(name => name.includes('.unreadable-'))!
    expect(readFileSync(join(view.paths.config, 'mcp-credentials', backup), 'utf8')).toBe('corrupt')
    expect(view.credentials.read('remote', view.server.url)).toBeUndefined()
    writeFileSync(file, 'corrupt')
    expect(() => new MiraMcpCredentialStore(view.paths, { ...view.encryption, isAvailable: () => false }).read('remote', view.server.url)).toThrow('系统安全存储不可用')
    const sibling = join(view.home, 'sibling'); symlinkSync(file, sibling)
    const directory = join(view.paths.config, 'mcp-credentials'), target = join(directory, 'bad.bin'); symlinkSync(file, target)
    // The identity-bound canonical path is protected independently of arbitrary files in the folder.
    rmSync(file); symlinkSync(sibling, file)
    expect(() => view.credentials.read('remote', view.server.url)).toThrow('符号链接')
  })
})
