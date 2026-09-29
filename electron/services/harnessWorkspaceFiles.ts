import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep, posix } from 'node:path'
import type { HarnessWorkspaceFileEntry } from '../../src/config/harness'

const MAX_READ_BYTES = 1_000_000

function normalizeRelativePath(value: string) {
  if (typeof value !== 'string' || value.includes('\\') || isAbsolute(value)) throw new Error('路径无效')
  const normalized = posix.normalize(value || '.')
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error('路径无效')
  return normalized === '.' ? '' : normalized
}

async function resolveInsideWorkspace(workspacePath: string, requestedPath: string) {
  const root = await realpath(workspacePath)
  const relativePath = normalizeRelativePath(requestedPath)
  const target = resolve(root, relativePath)
  const targetRelative = relative(root, target)
  if (targetRelative.startsWith('..' + sep) || targetRelative === '..' || isAbsolute(targetRelative)) throw new Error('路径无效')
  let targetReal: string
  try {
    targetReal = await realpath(target)
  } catch {
    throw new Error('文件或目录不存在')
  }
  const realRelative = relative(root, targetReal)
  if (realRelative.startsWith('..' + sep) || realRelative === '..' || isAbsolute(realRelative)) throw new Error('路径不能离开工作目录')
  return { target: targetReal, path: relativePath }
}

export async function listHarnessWorkspaceFiles(workspacePath: string, requestedPath: string): Promise<{ path: string; entries: HarnessWorkspaceFileEntry[] }> {
  const resolved = await resolveInsideWorkspace(workspacePath, requestedPath)
  const stat = await lstat(resolved.target)
  if (!stat.isDirectory()) throw new Error('目标不是目录')
  const entries = await readdir(resolved.target, { withFileTypes: true })
  const result = await Promise.all(entries
    .filter(entry => !entry.name.startsWith('.') && (entry.isDirectory() || entry.isFile() || entry.isSymbolicLink()))
    .map(async entry => {
      if (entry.isSymbolicLink()) {
        try {
          const linked = await resolveInsideWorkspace(workspacePath, resolved.path ? resolved.path + '/' + entry.name : entry.name)
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
}

export async function readHarnessWorkspaceFile(workspacePath: string, requestedPath: string): Promise<{ path: string; content: string }> {
  const resolved = await resolveInsideWorkspace(workspacePath, requestedPath)
  const stat = await lstat(resolved.target)
  if (!stat.isFile()) throw new Error('目标不是文件')
  if (stat.size > MAX_READ_BYTES) throw new Error('文件过大，暂不支持预览')
  const content = await readFile(resolved.target)
  if (content.includes(0)) throw new Error('暂不支持预览二进制文件')
  return { path: resolved.path, content: content.toString('utf8') }
}
