import { readdir, lstat, statfs } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import type { MiraStorageSnapshot } from '../../src/config/resourceManager'
const categories = [
  { id: 'sessions', title: '会话记录与数据库', names: ['sessions', 'state.sqlite', 'state.sqlite-wal', 'state.sqlite-shm'] },
  { id: 'artifacts', title: '工具输出与产物', names: ['attachments', 'workflow-artifacts'] },
  { id: 'logs', title: '日志与崩溃报告', names: ['logs', 'Crashpad'] },
  { id: 'runtimes', title: '运行时与插件', names: ['skills', 'plugins'] },
  { id: 'config', title: '配置与工作区', names: ['config', 'memories', 'workspace', 'AGENTS.md'] },
  { id: 'cache', title: '缓存', names: ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache'] },
  { id: 'other', title: '其他', names: [] },
]
export function insideResourceRoot(root: string, path: string) { const back = relative(root, path); return !isAbsolute(back) && back !== '..' && !back.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) }
export async function scanResourceStorage(root: string, signal: AbortSignal): Promise<MiraStorageSnapshot> {
  let errors = 0
  async function measure(path: string): Promise<{ bytes: number; files: number }> {
    signal.throwIfAborted()
    try {
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) return { bytes: 0, files: 0 }
      if (!stat.isDirectory()) return { bytes: stat.size, files: 1 }
      let bytes = 0, files = 0
      for (const name of await readdir(path)) { const child = await measure(join(path, name)); bytes += child.bytes; files += child.files }
      return { bytes, files }
    } catch (error) { signal.throwIfAborted(); errors++; return { bytes: 0, files: 0 } }
  }
  const groups: MiraStorageSnapshot['categories'] = categories.map(({ id, title }) => ({ id, title, bytes: 0, files: 0, entries: [] }))
  for (const name of await readdir(root)) {
    signal.throwIfAborted()
    const spec = categories.find(category => category.names.includes(name)) ?? categories[categories.length - 1]
    const group = groups.find(group => group.id === spec.id)!
    const path = join(root, name), result = await measure(path)
    group.entries.push({ name, path, ...result }); group.bytes += result.bytes; group.files += result.files
  }
  let volume: MiraStorageSnapshot['volume'] = null
  try { const stat = await statfs(root); volume = { totalBytes: stat.blocks * stat.bsize, freeBytes: stat.bavail * stat.bsize } } catch { /* Unknown disk capacity is displayed explicitly. */ }
  signal.throwIfAborted()
  return { root, finishedAt: Date.now(), totalBytes: groups.reduce((sum, group) => sum + group.bytes, 0), volume, categories: groups, errors }
}
