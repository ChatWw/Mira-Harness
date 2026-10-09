import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, readdir, readFile, realpath } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep, posix } from 'node:path'
import type { HarnessWorkspaceFileEntry, HarnessWorkspaceImagePreview } from '../../src/config/harness'

const MAX_READ_BYTES = 1_000_000
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const imageMediaTypes: Record<string, string> = {
  '.apng': 'image/apng', '.avif': 'image/avif', '.bmp': 'image/bmp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
}

export { searchHarnessWorkspaceFiles } from './harnessWorkspaceSearch'

export function workspaceFileError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENOENT') return new Error('文件或目录不存在')
  if (code === 'ENOTDIR') return new Error('目标不是目录')
  if (code === 'EACCES' || code === 'EPERM') return new Error('没有权限读取文件或目录')
  return error
}

function normalizeRelativePath(value: string) {
  if (typeof value !== 'string' || value.includes('\\') || isAbsolute(value)) throw new Error('路径无效')
  const normalized = posix.normalize(value || '.')
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error('路径无效')
  return normalized === '.' ? '' : normalized
}

export async function resolveHarnessWorkspacePath(workspacePath: string, requestedPath: string) {
  const root = await realpath(workspacePath)
  const relativePath = normalizeRelativePath(requestedPath)
  const target = resolve(root, relativePath)
  const targetRelative = relative(root, target)
  if (targetRelative.startsWith('..' + sep) || targetRelative === '..' || isAbsolute(targetRelative)) throw new Error('路径无效')
  const targetReal = await realpath(target)
  const realRelative = relative(root, targetReal)
  if (realRelative.startsWith('..' + sep) || realRelative === '..' || isAbsolute(realRelative)) throw new Error('路径不能离开工作目录')
  return { target: targetReal, path: relativePath }
}

export async function listHarnessWorkspaceFiles(workspacePath: string, requestedPath: string): Promise<{ path: string; entries: HarnessWorkspaceFileEntry[] }> {
  try {
    const resolved = await resolveHarnessWorkspacePath(workspacePath, requestedPath)
    const stat = await lstat(resolved.target)
    if (!stat.isDirectory()) throw new Error('目标不是目录')
    const entries = await readdir(resolved.target, { withFileTypes: true })
    const result = await Promise.all(entries
      .filter(entry => entry.isDirectory() || entry.isFile() || entry.isSymbolicLink())
      .map(async entry => {
        if (entry.isSymbolicLink()) {
          try {
            const linked = await resolveHarnessWorkspacePath(workspacePath, resolved.path ? resolved.path + '/' + entry.name : entry.name)
            const linkedStat = await lstat(linked.target)
            return linkedStat.isDirectory() || linkedStat.isFile()
              ? { name: entry.name, path: linked.path, type: linkedStat.isDirectory() ? 'directory' as const : 'file' as const }
              : null
          } catch {
            return null
          }
        }
        return { name: entry.name, path: resolved.path ? resolved.path + '/' + entry.name : entry.name, type: entry.isDirectory() ? 'directory' as const : 'file' as const }
      }))
    return { path: resolved.path, entries: result.filter((entry): entry is HarnessWorkspaceFileEntry => entry !== null).sort((left, right) => Number(right.type === 'directory') - Number(left.type === 'directory') || left.name.localeCompare(right.name)) }
  } catch (error) {
    throw workspaceFileError(error)
  }
}

export async function readHarnessWorkspaceFile(workspacePath: string, requestedPath: string): Promise<{ path: string; content: string }> {
  try {
    const resolved = await resolveHarnessWorkspacePath(workspacePath, requestedPath)
    const stat = await lstat(resolved.target)
    if (!stat.isFile()) throw new Error('目标不是文件')
    if (stat.size > MAX_READ_BYTES) throw new Error('文件过大，暂不支持预览')
    const content = await readFile(resolved.target)
    if (content.byteLength > MAX_READ_BYTES) throw new Error('文件过大，暂不支持预览')
    if (content.includes(0)) throw new Error('暂不支持预览二进制文件')
    return { path: resolved.path, content: content.toString('utf8') }
  } catch (error) {
    throw workspaceFileError(error)
  }
}

function sameImageVersion(left: BigIntStats, right: BigIntStats) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
}

export async function readHarnessWorkspaceImage(workspacePath: string, requestedPath: string): Promise<HarnessWorkspaceImagePreview> {
  try {
    if (typeof requestedPath !== 'string' || !requestedPath.trim() || requestedPath.length > 2048 || requestedPath.includes('\0')
      || /^[a-z][a-z\d+.-]*:/i.test(requestedPath) || requestedPath.split('/').includes('..')) throw new Error('路径无效')
    const mediaType = imageMediaTypes[extname(requestedPath).toLowerCase()]
    if (!mediaType) throw new Error('图片格式暂不支持预览')
    const root = await realpath(workspacePath)
    const rootStat = await lstat(root, { bigint: true })
    const resolved = await resolveHarnessWorkspacePath(root, requestedPath)
    const initial = await lstat(resolved.target, { bigint: true })
    if (!initial.isFile()) throw new Error('目标不是文件')
    if (initial.size > BigInt(MAX_IMAGE_BYTES)) throw new Error('图片文件超过 4 MiB 预览限制')
    const handle = await open(resolved.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      if (!sameImageVersion(initial, await handle.stat({ bigint: true }))) throw new Error('文件在读取期间发生变化，请重试')
      // One extra byte detects growth without ever allocating an unbounded filesystem payload.
      const content = Buffer.alloc(Number(initial.size) + 1)
      let byteLength = 0
      while (byteLength < content.byteLength) {
        const result = await handle.read(content, byteLength, content.byteLength - byteLength, byteLength)
        if (!result.bytesRead) break
        byteLength += result.bytesRead
      }
      const finalHandle = await handle.stat({ bigint: true })
      if (!sameImageVersion(initial, finalHandle) || BigInt(byteLength) !== initial.size) throw new Error('文件在读取期间发生变化，请重试')
      const finalRoot = await realpath(workspacePath)
      const finalRootStat = await lstat(finalRoot, { bigint: true })
      if (root !== finalRoot || rootStat.dev !== finalRootStat.dev || rootStat.ino !== finalRootStat.ino) throw new Error('文件在读取期间发生变化，请重试')
      const finalPath = await resolveHarnessWorkspacePath(root, requestedPath)
      if (finalPath.target !== resolved.target || !sameImageVersion(initial, await lstat(finalPath.target, { bigint: true }))) throw new Error('文件在读取期间发生变化，请重试')
      return { path: resolved.path, mediaType, dataBase64: content.subarray(0, byteLength).toString('base64'), byteLength }
    } finally {
      await handle.close()
    }
  } catch (error) {
    const safeError = workspaceFileError(error)
    const safeMessages = ['路径无效', '路径不能离开工作目录', '文件或目录不存在', '目标不是目录', '目标不是文件', '没有权限读取文件或目录', '图片格式暂不支持预览', '图片文件超过 4 MiB 预览限制', '文件在读取期间发生变化，请重试']
    throw new Error(safeError instanceof Error && safeMessages.includes(safeError.message) ? safeError.message : '图片读取失败，请重试')
  }
}
