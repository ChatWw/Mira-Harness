import type { WebContents } from 'electron'
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { ArtifactVersionRecord } from '../../../packages/mira-flow-kit/src/engine/mira-types'

/** The native dialog is the sole authority for choosing a destination. Commit only after reauthorization. */
export async function saveMiraFlowArtifact(sender: WebContents, artifactRoot: string, record: ArtifactVersionRecord, payload: Buffer, authorize?: () => void) {
  authorize?.()
  const { BrowserWindow, dialog } = await import('electron')
  const owner = BrowserWindow.fromWebContents(sender)
  if (!owner || sender.isDestroyed()) throw new Error('工作流只能由宿主工作台管理')
  const extension = record.kind === 'markdown' ? '.md' : extname(record.sourcePath ?? '')
  const name = (record.title || record.id).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120)
  authorize?.()
  const chosen = await dialog.showSaveDialog(owner, { title: '保存工作流产物', defaultPath: name.toLowerCase().endsWith(extension.toLowerCase()) ? name : name + extension })
  authorize?.()
  if (chosen.canceled || !chosen.filePath) return { saved: false }
  const target = resolve(chosen.filePath), parent = await realpath(dirname(target)), store = await realpath(artifactRoot)
  const parentStat = await lstat(parent), local = relative(store, join(parent, basename(target)))
  if (!local || (!isAbsolute(local) && local !== '..' && !local.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')))) throw new Error('不能覆盖工作流产物存储，请选择其他位置')
  const destination = join(parent, basename(target)), temporary = join(parent, `.mira-artifact-${randomUUID()}.tmp`)
  let pending = false
  try {
    const handle = await open(temporary, 'wx', 0o600)
    pending = true
    try { await handle.writeFile(payload); await handle.sync() } finally { await handle.close() }
    const current = await lstat(parent)
    if (!current.isDirectory() || current.dev !== parentStat.dev || current.ino !== parentStat.ino || await realpath(dirname(target)) !== parent) throw new Error('保存位置已变化，请重试')
    try {
      const stat = await lstat(destination)
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('请选择普通文件作为保存位置')
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    authorize?.()
    await rename(temporary, destination)
    pending = false
    authorize?.()
    return { saved: true }
  } finally { if (pending) await unlink(temporary).catch(() => undefined) }
}
