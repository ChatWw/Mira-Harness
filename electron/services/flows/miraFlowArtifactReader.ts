import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { NodeRecord, ArtifactVersionRecord } from '../../../packages/mira-flow-kit/src/engine/mira-types'
import { ARTIFACT_CAPS } from '../../../packages/mira-flow-kit/src/facade/mira-artifact-caps'

const unavailable = () => new Error('工作流产物不可读取，请刷新后重试')
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
/** Read the published version, never its mutable workspace source. No caller-controlled path. */
export async function readMiraFlowArtifact(rootPath: string, runId: string, node: NodeRecord, authorize?: () => void) {
  authorize?.()
  if (node.runId !== runId || node.status !== 'completed' || node.kind !== 'artifact' || !node.result || typeof node.result !== 'object') throw unavailable()
  const { primary: _primary, ...record } = node.result as ArtifactVersionRecord
  if (record.kind !== 'file' && record.kind !== 'markdown') throw new Error('此产物是预置看板，没有可下载的文件内容')
  const key = hash(JSON.stringify([runId, record.id, record.version]))
  if (record.uri !== `mira-artifact://${key}` || record.id !== node.artifactId
    || !Number.isSafeInteger(record.bytes) || record.bytes! < 0 || record.bytes! > ARTIFACT_CAPS.maxFileBytes) throw unavailable()
  try {
    const requested = resolve(rootPath), root = await realpath(requested), rootStat = await lstat(requested)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || root !== join(await realpath(dirname(requested)), basename(requested))) throw unavailable()
    const directory = join(root, key), directoryStat = await lstat(directory)
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || await realpath(directory) !== directory) throw unavailable()
    const check = async () => {
      const currentRoot = await lstat(requested), currentDirectory = await lstat(directory)
      if (currentRoot.isSymbolicLink() || currentRoot.dev !== rootStat.dev || currentRoot.ino !== rootStat.ino || await realpath(requested) !== root
        || currentDirectory.isSymbolicLink() || currentDirectory.dev !== directoryStat.dev || currentDirectory.ino !== directoryStat.ino) throw unavailable()
      authorize?.()
    }
    const read = async (name: string, cap: number) => {
      await check()
      const path = join(directory, name), before = await lstat(path)
      if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1 || before.size > cap) throw unavailable()
      const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size) throw unavailable()
        const buffer = Buffer.alloc(stat.size + 1)
        let size = 0
        while (size < buffer.length) {
          authorize?.()
          const part = await handle.read(buffer, size, buffer.length - size, size)
          if (!part.bytesRead) break
          size += part.bytesRead
        }
        const after = await handle.stat(), pathAfter = await lstat(path)
        if (size !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs
          || pathAfter.isSymbolicLink() || pathAfter.dev !== stat.dev || pathAfter.ino !== stat.ino) throw unavailable()
        await check()
        return buffer.subarray(0, size)
      } finally { await handle.close() }
    }
    const metadata = JSON.parse((await read('metadata.json', 16 * 1024)).toString('utf8')) as { record: ArtifactVersionRecord; fingerprint: string; payloadHash: string }
    const identity = JSON.stringify([runId, node.siteId, node.ordinal, record.kind, record.id, record.version])
    if (!isDeepStrictEqual(metadata.record, record) || !/^[a-f0-9]{64}$/.test(metadata.payloadHash)
      || metadata.fingerprint !== hash(JSON.stringify({ identity, hash: metadata.payloadHash, record: { ...metadata.record, publishedAt: undefined } }))) throw unavailable()
    const payload = await read('payload', ARTIFACT_CAPS.maxFileBytes)
    if (payload.length !== record.bytes || hash(payload) !== metadata.payloadHash) throw unavailable()
    authorize?.()
    return { record, payload }
  } catch (error) {
    // Authorization errors retain their recognized bridge messages; filesystem errors never expose paths.
    authorize?.()
    throw unavailable()
  }
}
