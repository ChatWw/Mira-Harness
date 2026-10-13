// Local model-IO inspection references ZCode modelTrajectory (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd.; Mira records its own Pi provider calls.
import { appendFile, mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'
import type { MiraModelCall, MiraModelTrace } from '../../src/config/miraModelTrace'
import type { MiraPaths } from './miraPaths'

const MAX_PAYLOAD = 256 * 1024
const TAIL_BYTES = 8 * 1024 * 1024
const SECRET_KEY = /^(?:api[_-]?key|authorization|token|access[_-]?token|refresh[_-]?token|secret|password|cookie|set-cookie)$/i

/** Keep usage tokens and tool content; redact credentials and binary bytes before persisting. */
export function miraTraceValue(value: unknown, secrets: readonly string[] = []): unknown {
  let budget = MAX_PAYLOAD
  const visit = (item: unknown, key = '', depth = 0): unknown => {
    if (SECRET_KEY.test(key)) return '[已隐藏凭据]'
    if (budget <= 0 || depth > 40) return '[内容超出记录上限]'
    if (typeof item === 'string') {
      let text = item
      for (const secret of secrets) if (secret) text = text.split(secret).join('[已隐藏凭据]')
      text = text.replace(/data:([^;,\s]+);base64,([A-Za-z0-9+/=]+)/g, (_, mime: string, bytes: string) => `[媒体 ${mime}，base64 ${bytes.length} 字符；不保存二进制内容]`)
        .replace(/\b(?:sk|rk|pk)-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]+/ig, '[已隐藏凭据]')
        .replace(/((?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret|cookie)\s*[=:]\s*)[^\s,;&]+/ig, '$1[已隐藏凭据]')
      const allowed = Math.min(budget, 64 * 1024)
      budget -= Math.min(text.length, allowed)
      return text.length > allowed ? `${text.slice(0, allowed)}\n[内容超出记录上限]` : text
    }
    if (Array.isArray(item)) {
      const result: unknown[] = []
      for (const child of item) { if (budget <= 0) { result.push('[内容超出记录上限]'); break }; budget -= 4; result.push(visit(child, '', depth + 1)) }
      return result
    }
    if (item && typeof item === 'object') {
      const result: Record<string, unknown> = {}
      for (const [name, child] of Object.entries(item)) {
        if (budget <= 0) { result['记录截断'] = true; break }
        budget -= name.length + 4
        Object.defineProperty(result, name, { value: visit(child, name, depth + 1), enumerable: true })
      }
      return result
    }
    return item
  }
  return visit(value)
}

export class MiraModelTraceStore {
  readonly directory: string
  private pending = new Map<string, Promise<void>>()
  private warnings = new Set<string>()
  constructor(paths: MiraPaths) { this.directory = join(paths.logs, 'model-calls') }
  async flush() { await Promise.all(this.pending.values()) }
  path(sessionId: string) {
    if (!sessionId || sessionId.length > 128 || /[\u0000-\u001f]/.test(sessionId)) throw new Error('会话 ID 无效')
    return join(this.directory, `${Buffer.from(sessionId).toString('base64url')}.jsonl`)
  }
  write(record: MiraModelCall, secrets: readonly string[] = []) {
    const path = this.path(record.sessionId)
    const safe = { ...record, request: miraTraceValue(record.request, secrets), response: miraTraceValue(record.response, secrets), error: record.error ? miraTraceValue(record.error, secrets) : undefined }
    const line = `${JSON.stringify(safe)}\n`
    const next = (this.pending.get(record.sessionId) || Promise.resolve()).then(async () => {
      await mkdir(this.directory, { recursive: true })
      await appendFile(path, line, { encoding: 'utf8', mode: 0o600 })
    }).catch(() => {
      this.warnings.add(record.sessionId)
      if (this.warnings.size > 100) this.warnings.delete(this.warnings.values().next().value!)
    })
    this.pending.set(record.sessionId, next)
    void next.then(() => { if (this.pending.get(record.sessionId) === next) this.pending.delete(record.sessionId) })
  }
  async read(sessionId: string): Promise<MiraModelTrace> {
    const sourceFile = this.path(sessionId)
    await this.pending.get(sessionId)
    const result: MiraModelTrace = { sessionId, sourceFile, records: [], truncated: false, ...(this.warnings.has(sessionId) ? { warning: '部分模型调用未能写入本地记录，请检查日志目录是否可写。' } : {}) }
    let file
    try { file = await open(sourceFile, 'r') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result; throw new Error('模型轨迹读取失败，请检查本地日志目录权限后重试') }
    try {
      const size = (await file.stat()).size, start = Math.max(0, size - TAIL_BYTES)
      const buffer = Buffer.alloc(Math.min(size, TAIL_BYTES))
      const { bytesRead } = await file.read(buffer, 0, buffer.length, start)
      let text = buffer.subarray(0, bytesRead).toString('utf8')
      if (start > 0) { text = text.slice(text.indexOf('\n') + 1); result.truncated = true }
      const calls = new Map<string, MiraModelCall>()
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let record: MiraModelCall
        try { record = JSON.parse(line) } catch { result.warning ||= '部分本地记录不完整，已跳过；可刷新重试。'; continue }
        if (!record || record.sessionId !== sessionId || typeof record.id !== 'string' || !Number.isSafeInteger(record.startedAt) || record.startedAt < 0 || record.startedAt > 8_640_000_000_000_000) continue
        calls.set(record.id, { ...calls.get(record.id), ...record })
      }
      const all = [...calls.values()].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
      result.truncated ||= all.length > 200
      result.records = all.slice(-200)
      return result
    } finally { await file.close() }
  }
}
