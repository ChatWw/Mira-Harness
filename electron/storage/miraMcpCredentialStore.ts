/* Canonical client/token pair storage informed by ZCode mcp/oauth-credentials.ts.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira host encryption and per-configuration files; see third-party-licenses/zcode/. */
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import { OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { MiraPaths } from './miraPaths'

export interface MiraMcpEncryption {
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
  isAvailable?(): boolean
}
export interface MiraMcpCredentials {
  clientInformation: OAuthClientInformationMixed
  tokens: OAuthTokens
  discovery?: OAuthDiscoveryState
  obtainedAt: number
  expiresAt?: number
}
export function miraMcpAuthorizationIdentity(configId: string, serverUrl: string) {
  if (!configId.trim() || configId.length > 1024) throw new Error('MCP 授权配置标识无效')
  const url = new URL(serverUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('MCP 授权服务地址无效')
  const normalized = url.href
  return { configId, serverUrl: normalized, key: createHash('sha256').update(JSON.stringify([configId, normalized])).digest('hex') }
}
function stat(path: string) { try { return lstatSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error } }

/** Host-only encrypted canonical pairs. No tokens/verifiers or client secrets are exposed to UI. */
export class MiraMcpCredentialStore {
  private readonly directory: string
  constructor(private readonly paths: MiraPaths, private readonly encryption: MiraMcpEncryption) { this.directory = join(paths.config, 'mcp-credentials') }
  private checked(configId: string, serverUrl: string) {
    const identity = miraMcpAuthorizationIdentity(configId, serverUrl)
    for (const directory of [this.paths.root, this.paths.config, this.directory]) if (stat(directory)?.isSymbolicLink()) throw new Error('MCP 凭据目录不能是符号链接')
    const path = join(this.directory, `${identity.key}.bin`)
    if (stat(path)?.isSymbolicLink()) throw new Error('MCP 凭据文件不能是符号链接')
    if (this.encryption.isAvailable?.() === false) throw new Error('系统安全存储不可用，MCP 授权凭据未写入')
    return { identity, path }
  }
  read(configId: string, serverUrl: string): MiraMcpCredentials | undefined {
    const { identity, path } = this.checked(configId, serverUrl)
    if (!stat(path)) return
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const info = fstatSync(fd)
      if (!info.isFile() || info.size > 1024 * 1024) throw new Error('invalid file')
      const source = this.encryption.decryptString(readFileSync(fd))
      if (Buffer.byteLength(source) > 1024 * 1024) throw new Error('invalid size')
      const parsed = JSON.parse(source)
      if (parsed.version !== 1 || parsed.key !== identity.key || !parsed.credentials || typeof parsed.credentials.clientInformation?.client_id !== 'string' || !Number.isFinite(parsed.credentials.obtainedAt)) throw new Error('invalid credentials')
      OAuthTokensSchema.parse(parsed.credentials.tokens)
      return parsed.credentials as MiraMcpCredentials
    } catch { throw new Error('MCP 授权凭据不可读取，请重新授权；原文件未被覆盖') }
    finally { closeSync(fd) }
  }
  save(configId: string, serverUrl: string, credentials: MiraMcpCredentials) {
    const { identity, path } = this.checked(configId, serverUrl)
    OAuthTokensSchema.parse(credentials.tokens)
    if (!credentials.clientInformation.client_id || !Number.isFinite(credentials.obtainedAt)) throw new Error('MCP 授权凭据无效')
    const source = JSON.stringify({ version: 1, key: identity.key, credentials })
    if (Buffer.byteLength(source) > 512 * 1024) throw new Error('MCP 授权凭据超过存储限制')
    const encrypted = this.encryption.encryptString(source)
    if (!Buffer.isBuffer(encrypted) || !encrypted.length || encrypted.length > 1024 * 1024) throw new Error('MCP 授权凭据加密失败')
    mkdirSync(this.directory, { recursive: true, mode: 0o700 }); this.checked(configId, serverUrl)
    const temporary = join(this.directory, `.mira-auth-${randomUUID()}.tmp`)
    writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600 })
    try { this.checked(configId, serverUrl); renameSync(temporary, path) }
    finally { if (stat(temporary)) unlinkSync(temporary) }
  }
  delete(configId: string, serverUrl: string) { const { path } = this.checked(configId, serverUrl); if (stat(path)) unlinkSync(path) }
  /** Explicit retry keeps an unreadable original, rather than overwriting it. */
  prepareRetry(configId: string, serverUrl: string) {
    const { path } = this.checked(configId, serverUrl)
    if (!stat(path)) return
    try { this.read(configId, serverUrl) } catch (error) {
      if (!(error instanceof Error) || error.message !== 'MCP 授权凭据不可读取，请重新授权；原文件未被覆盖') throw error
      renameSync(path, `${path}.unreadable-${randomUUID()}`)
    }
  }
}
