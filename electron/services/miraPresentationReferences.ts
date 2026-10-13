import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type BigIntStats } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { MIRA_OFFICE_PREVIEW_LIMIT } from '../../src/config/miraMedia'
import { parseMiraPresentationReferences } from '../../src/config/miraPresentation'

export function miraPresentationWorkspaceIdentity(root: string, stat: Pick<BigIntStats, 'dev' | 'ino'>) {
  return 'sha256:' + createHash('sha256').update(`${root}\0${stat.dev}\0${stat.ino}`).digest('hex')
}
function sameFile(a: BigIntStats, b: BigIntStats) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs
}
function inside(root: string, path: string) {
  const value = relative(root, path)
  return value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value)
}

/** Submit is synchronous today; revalidate the quoted version before accepting the task. */
export function assertMiraPresentationReferences(text: string, sessionId: string, workingDirectory?: string): void {
  if (!text.includes('演示文稿元素引用：')) return
  const { references, error } = parseMiraPresentationReferences(text)
  if (error) throw new Error(error)
  if (!references.length) return
  if (references.some(reference => reference.sessionId !== sessionId)) throw new Error('演示文稿元素引用不属于当前任务，请重新引用')
  if (!workingDirectory) throw new Error('当前任务没有工作目录，请选择演示文稿所在的项目后重新引用')
  try {
    const root = realpathSync(workingDirectory), rootStat = lstatSync(root, { bigint: true })
    if (!rootStat.isDirectory()) throw new Error('invalid workspace')
    const identity = miraPresentationWorkspaceIdentity(root, rootStat)
    const checked = new Map<string, { stat: BigIntStats; fingerprint: string }>()
    for (const reference of references) {
      if (reference.workspaceIdentity !== identity) throw new Error('workspace changed')
      const target = realpathSync(resolve(root, reference.sourcePath))
      if (!inside(root, target)) throw new Error('outside workspace')
      const stat = lstatSync(target, { bigint: true })
      if (!stat.isFile() || stat.size <= 0n || stat.size > BigInt(MIRA_OFFICE_PREVIEW_LIMIT)) throw new Error('invalid file')
      const previous = checked.get(target)
      if (previous) {
        if (!sameFile(previous.stat, stat) || previous.fingerprint !== reference.sourceFingerprint) throw new Error('file changed')
        continue
      }
      const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        if (!sameFile(stat, fstatSync(fd, { bigint: true }))) throw new Error('file changed')
        const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024)
        let total = 0
        while (total <= Number(stat.size)) {
          const count = readSync(fd, buffer, 0, Math.min(buffer.length, Number(stat.size) - total + 1), total)
          if (!count) break
          total += count; hash.update(buffer.subarray(0, count))
        }
        if (total !== Number(stat.size) || !sameFile(stat, fstatSync(fd, { bigint: true })) || 'sha256:' + hash.digest('hex') !== reference.sourceFingerprint) throw new Error('file changed')
        checked.set(target, { stat, fingerprint: reference.sourceFingerprint })
      } finally { closeSync(fd) }
    }
    const finalRoot = realpathSync(workingDirectory), finalStat = lstatSync(finalRoot, { bigint: true })
    if (finalRoot !== root || finalStat.dev !== rootStat.dev || finalStat.ino !== rootStat.ino) throw new Error('workspace changed')
    for (const reference of references) {
      const target = realpathSync(resolve(root, reference.sourcePath)), verified = checked.get(target)
      if (!verified || !inside(root, target) || !sameFile(verified.stat, lstatSync(target, { bigint: true }))) throw new Error('file changed')
    }
  } catch { throw new Error('演示文稿或工作目录已变化，或文件不可读取，请重新打开并引用') }
}
