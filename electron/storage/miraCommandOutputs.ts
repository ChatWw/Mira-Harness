import { createHash, randomUUID } from 'node:crypto'
import { constants, existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { redactHarnessText } from '../services/agentTools'

export interface MiraOutputIdentity { sessionId: string; runId: string; toolId: string }
export const MIRA_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024
const identityKey = (identity: MiraOutputIdentity) => createHash('sha256').update(JSON.stringify([identity.sessionId, identity.runId, identity.toolId])).digest('hex')

/** Full merged output is separate from the bounded model/conversation snapshot.
 * Only redacted text reaches disk. Live reads are snapshots; terminal output is
 * atomically saved before the command's completion is published. */
export class MiraCommandOutputs {
  private readonly directory: string
  private readonly live = new Map<string, { chunks: string[]; bytes: number; secrets: string[] }>()

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.directory = realpathSync(directory)
  }

  begin(identity: MiraOutputIdentity, secrets: string[]) {
    const key = identityKey(identity)
    if (this.live.has(key)) throw new Error('这次命令已经在执行')
    this.assertDirectory()
    const directory = this.sessionDirectory(identity.sessionId)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (realpathSync(directory) !== directory) throw new Error('命令输出目录已变化')
    this.live.set(key, { chunks: [], bytes: 0, secrets })
  }

  append(identity: MiraOutputIdentity, chunk: string) {
    const entry = this.live.get(identityKey(identity))
    if (!entry) throw new Error('命令输出记录不可用')
    const bytes = Buffer.byteLength(chunk)
    const remaining = MIRA_COMMAND_OUTPUT_BYTES - entry.bytes
    if (bytes > remaining) {
      const data = Buffer.from(chunk)
      let end = remaining
      while (end > 0 && (data[end] & 0xc0) === 0x80) end--
      entry.chunks.push(data.subarray(0, end).toString('utf8'))
      entry.bytes += end
      throw new Error('命令输出超过16 MiB，已停止；请缩小输出范围后重试')
    }
    entry.chunks.push(chunk); entry.bytes += bytes
  }

  available(identity: MiraOutputIdentity) { return this.live.has(identityKey(identity)) || existsSync(this.path(identity)) }

  private sessionDirectory(sessionId: string) { return join(this.directory, createHash('sha256').update(sessionId).digest('hex')) }
  private path(identity: MiraOutputIdentity) { return join(this.sessionDirectory(identity.sessionId), `${identityKey(identity)}.log`) }
  removeSession(sessionId: string) {
    this.assertDirectory()
    rmSync(this.sessionDirectory(sessionId), { recursive: true, force: true })
  }
  private text(entry: { chunks: string[]; secrets: string[] }, final: boolean) {
    let text = entry.chunks.join('')
    // Never expose a credential split between stdout/stderr callbacks.
    {
      let suffix = 0
      for (const secret of entry.secrets) for (let size = Math.min(secret.length - 1, text.length); size > suffix; size--) {
        if (text.endsWith(secret.slice(0, size))) { suffix = size; break }
      }
      if (suffix) text = text.slice(0, -suffix) + (final ? '[已隐藏]' : '')
    }
    return redactHarnessText(text, entry.secrets)
  }

  async finish(identity: MiraOutputIdentity) {
    const key = identityKey(identity), entry = this.live.get(key)
    if (!entry) return
    const temporary = join(this.sessionDirectory(identity.sessionId), `${key}.${randomUUID()}.tmp`)
    try {
      this.assertDirectory(identity.sessionId)
      const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      try { await file.writeFile(this.text(entry, true), 'utf8'); await file.sync() } finally { await file.close() }
      this.assertDirectory(identity.sessionId)
      await rename(temporary, this.path(identity))
    } finally {
      this.live.delete(key)
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  }

  async read(identity: MiraOutputIdentity): Promise<string> {
    const entry = this.live.get(identityKey(identity))
    if (entry) return this.text(entry, false)
    this.assertDirectory(identity.sessionId)
    const file = await open(this.path(identity), constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > MIRA_COMMAND_OUTPUT_BYTES * 2) throw new Error('命令输出文件不可用')
      return await file.readFile('utf8')
    } finally { await file.close() }
  }

  private assertDirectory(sessionId?: string) {
    if (realpathSync(this.directory) !== this.directory || sessionId !== undefined && realpathSync(this.sessionDirectory(sessionId)) !== this.sessionDirectory(sessionId)) throw new Error('命令输出目录已变化')
  }
}
