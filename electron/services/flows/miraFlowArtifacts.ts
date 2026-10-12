// Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
// Adapted for Mira from ZCode bootstrap workflow-artifact-publish.ts.
// See third-party-licenses/zcode/LICENSE and NOTICE.md.
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, open, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { MiraFlowError } from '../../../packages/mira-flow-kit/src/engine/mira-errors'
import { ARTIFACT_CAPS, ARTIFACT_ID_PATTERN } from '../../../packages/mira-flow-kit/src/facade/mira-artifact-caps'
import type { ArtifactPublishRequest, ArtifactVersionRecord } from '../../../packages/mira-flow-kit/src/engine/mira-types'

interface ArtifactHostOptions {
  artifactRoot?: string
  signal?: AbortSignal
  readWorkspaceFile(path: string, maxBytes: number): Promise<Buffer>
}
const invalid = (message: string) => new MiraFlowError('DriverError', message)
const unavailable = (message: string) => new MiraFlowError('ArtifactStoreUnavailable', message)
const tooLarge = (message: string) => new MiraFlowError('ArtifactTooLarge', message)
const contentTypes: Record<string, string> = {
  '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
  '.html': 'text/html', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.zip': 'application/zip',
}
function optionalText(value: unknown, name: string, cap: number) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw invalid(`artifact: ${name} must be a string.`)
  if (value.length > cap) throw tooLarge(`artifact: ${name} exceeds ${cap} characters.`)
  return value
}
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')

export function createMiraFlowArtifacts(options: ArtifactHostOptions) {
  const assertActive = () => { if (options.signal?.aborted) throw new MiraFlowError('Cancelled', 'Artifact publication cancelled.') }
  const storeRoot = async () => {
    if (!options.artifactRoot) throw unavailable('No local artifact store connected.')
    const requested = resolve(options.artifactRoot)
    try {
      await mkdir(requested, { recursive: true, mode: 0o700 })
      const stat = await lstat(requested)
      const root = await realpath(requested)
      // Canonical OS parent aliases are allowed; a symlink at the configured store itself is not.
      if (!stat.isDirectory() || stat.isSymbolicLink() || root !== join(await realpath(dirname(requested)), basename(requested))) throw unavailable('Artifact store is not a real directory.')
      return { root, dev: stat.dev, ino: stat.ino }
    } catch (error) {
      if (error instanceof MiraFlowError) throw error
      throw unavailable('Cannot initialize local artifact store.')
    }
  }
  const executeArtifactPublish = async (request: ArtifactPublishRequest): Promise<ArtifactVersionRecord> => {
    assertActive()
    if (typeof request.id !== 'string' || !request.id || request.id.length > ARTIFACT_CAPS.maxIdLength || !ARTIFACT_ID_PATTERN.test(request.id)
      || typeof request.runId !== 'string' || !request.runId || typeof request.siteId !== 'string' || !request.siteId
      || !Number.isSafeInteger(request.version) || request.version < 1 || !Number.isSafeInteger(request.ordinal) || request.ordinal < 0
      || (request.op !== 'file' && request.op !== 'markdown')) throw invalid('Invalid artifact publication identity.')
    if (request.opts !== undefined && (typeof request.opts !== 'object' || request.opts === null || Array.isArray(request.opts))) throw invalid('artifact: options must be an object.')
    const opts = request.opts as { title?: unknown; description?: unknown; contentType?: unknown } | undefined
    const title = optionalText(opts?.title, 'title', ARTIFACT_CAPS.maxTitleLength)
    const description = optionalText(opts?.description, 'description', ARTIFACT_CAPS.maxDescriptionLength)
    const override = request.op === 'file' ? optionalText(opts?.contentType, 'contentType', 255) : undefined
    if (override !== undefined && !/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(override)) throw invalid('artifact.file: contentType must be a bare MIME type.')
    const store = await storeRoot() // Fail for missing store before reading the source.
    let bytes: Buffer, sourcePath: string | undefined
    if (request.op === 'markdown') {
      if (typeof request.content !== 'string') throw invalid('artifact.markdown: content must be a string.')
      if (Buffer.byteLength(request.content) > ARTIFACT_CAPS.maxMarkdownBytes) throw tooLarge('Markdown exceeds its byte cap.')
      bytes = Buffer.from(request.content, 'utf8')
    } else {
      if (typeof request.path !== 'string' || !request.path) throw invalid('artifact.file: expected workspace-relative source path.')
      sourcePath = request.path
      try { bytes = await options.readWorkspaceFile(sourcePath, ARTIFACT_CAPS.maxFileBytes) }
      catch (error) {
        if (error instanceof MiraFlowError) {
          if (error.code === 'Cancelled') throw error
          if (error.code === 'WorldReadCapExceeded') throw tooLarge('Artifact source exceeds its byte cap.')
          throw new MiraFlowError('ArtifactPathOutsideWorkspace', error.message)
        }
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') throw new MiraFlowError('ArtifactSourceMissing', 'Artifact source does not exist.')
        throw new MiraFlowError('ArtifactSourceMissing', 'Artifact source cannot be read.')
      }
    }
    assertActive()
    const key = hash(JSON.stringify([request.runId, request.id, request.version]))
    const final = join(store.root, key)
    const record: ArtifactVersionRecord = {
      id: request.id, kind: request.op, version: request.version,
      ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }),
      contentType: request.op === 'markdown' ? 'text/markdown' : override ?? contentTypes[extname(sourcePath!).toLowerCase()] ?? 'application/octet-stream',
      bytes: bytes.length, uri: `mira-artifact://${key}`, ...(sourcePath === undefined ? {} : { sourcePath }), publishedAt: Date.now(),
    }
    const identity = JSON.stringify([request.runId, request.siteId, request.ordinal, request.op, request.id, request.version])
    const fingerprint = hash(JSON.stringify({ identity, hash: hash(bytes), record: { ...record, publishedAt: undefined } }))
    const assertStore = async () => {
      assertActive()
      const current = await lstat(store.root)
      if (current.isSymbolicLink() || current.dev !== store.dev || current.ino !== store.ino || await realpath(options.artifactRoot!) !== store.root) throw unavailable('Artifact store changed during publication.')
    }
    const readExisting = async (): Promise<ArtifactVersionRecord | undefined> => {
      try {
        const dir = await lstat(final)
        if (!dir.isDirectory() || dir.isSymbolicLink()) throw unavailable('Artifact version target is unsafe.')
      } catch (error) { if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined; throw error }
      const readStored = async (name: string, cap: number) => {
        const handle = await open(join(final, name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        try {
          const stat = await handle.stat()
          if (!stat.isFile() || stat.size > cap) throw unavailable('Stored artifact exceeds its cap.')
          const content = Buffer.alloc(stat.size + 1)
          let size = 0
          while (size < content.length) {
            assertActive()
            const next = await handle.read(content, size, content.length - size, size)
            if (!next.bytesRead) break
            size += next.bytesRead
          }
          if (size !== stat.size) throw unavailable('Stored artifact changed during reading.')
          return content.subarray(0, size)
        } finally { await handle.close() }
      }
      const saved = JSON.parse((await readStored('metadata.json', 16 * 1024)).toString('utf8')) as { fingerprint: string; payloadHash: string; record: ArtifactVersionRecord }
      if (saved.fingerprint !== fingerprint || saved.payloadHash !== hash(bytes)
        || hash(JSON.stringify({ identity, hash: saved.payloadHash, record: { ...saved.record, publishedAt: undefined } })) !== fingerprint
        || !Number.isSafeInteger(saved.record.publishedAt)) throw unavailable('Artifact version already exists with different content or receipt.')
      const payload = await readStored('payload', ARTIFACT_CAPS.maxFileBytes)
      if (payload.length !== bytes.length || hash(payload) !== saved.payloadHash) throw unavailable('Stored artifact content is corrupt.')
      await assertStore()
      return saved.record
    }
    let staging: string | undefined
    try {
      await assertStore()
      const existing = await readExisting()
      if (existing) return existing
      staging = await mkdtemp(join(store.root, '.pending-'))
      const save = async (name: string, value: Buffer | string) => {
        const handle = await open(join(staging!, name), 'wx', 0o400)
        try { await handle.writeFile(value); await handle.sync() } finally { await handle.close() }
      }
      await save('payload', bytes)
      await save('metadata.json', JSON.stringify({ fingerprint, payloadHash: hash(bytes), record }))
      await assertStore()
      try { await rename(staging, final); staging = undefined }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        const concurrent = await readExisting()
        if (!concurrent) throw unavailable('Artifact version publication collided.')
        return concurrent
      }
      return record
    } catch (error) {
      if (error instanceof MiraFlowError) throw error
      throw unavailable('Cannot publish immutable local artifact.')
    } finally {
      if (staging) { await chmod(staging, 0o700); await rm(staging, { recursive: true, force: true }) }
    }
  }
  return { executeArtifactPublish }
}
