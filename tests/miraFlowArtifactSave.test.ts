import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import { saveMiraFlowArtifact } from '../electron/services/flows/miraFlowArtifactSave'
const native = vi.hoisted(() => ({ dialog: vi.fn(), owner: {} }))
vi.mock('electron', () => ({ BrowserWindow: { fromWebContents: () => native.owner }, dialog: { showSaveDialog: native.dialog } }))
const roots: string[] = []
afterEach(async () => { native.dialog.mockReset(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'mira-artifact-save-'))); roots.push(root)
  const store = join(root, 'store'); await mkdir(store)
  const destination = join(root, 'saved.md'), payload = Buffer.from('# Published version')
  const record = { id: 'draft', kind: 'markdown' as const, version: 1, bytes: payload.length, title: '报告/草稿' }
  const sender = { isDestroyed: () => false } as WebContents
  native.dialog.mockResolvedValue({ canceled: false, filePath: destination })
  return { root, store, destination, payload, record, sender }
}
describe('workflow native artifact saving', () => {
  it('writes the host-owned published bytes to native selected destination without revealing its path', async () => {
    const view = await fixture(); await writeFile(view.destination, 'old')
    expect(await saveMiraFlowArtifact(view.sender, view.store, view.record, view.payload)).toEqual({ saved: true })
    expect(await readFile(view.destination)).toEqual(view.payload)
    expect(native.dialog.mock.calls[0]![1]).toMatchObject({ defaultPath: '报告_草稿.md', title: '保存工作流产物' })
    expect((await readdir(view.root)).filter(name => name.endsWith('.tmp'))).toEqual([])
  })
  it('native cancel changes no destination and reports no success', async () => {
    const view = await fixture(); native.dialog.mockResolvedValue({ canceled: true })
    expect(await saveMiraFlowArtifact(view.sender, view.store, view.record, view.payload)).toEqual({ saved: false })
    expect(await readdir(view.root)).toEqual(['store'])
  })
  it('rechecks revoked authorization after the native dialog await', async () => {
    const view = await fixture(); let revoked = false
    native.dialog.mockImplementation(async () => { revoked = true; return { canceled: false, filePath: view.destination } })
    await expect(saveMiraFlowArtifact(view.sender, view.store, view.record, view.payload, () => { if (revoked) throw new Error('第一方授权无效或应用已停用') })).rejects.toThrow('第一方授权无效或应用已停用')
    expect(await readdir(view.root)).toEqual(['store'])
  })
  it('does not let the native destination overwrite the immutable store', async () => {
    const view = await fixture(); native.dialog.mockResolvedValue({ canceled: false, filePath: join(view.store, 'payload') })
    await expect(saveMiraFlowArtifact(view.sender, view.store, view.record, view.payload)).rejects.toThrow('不能覆盖')
    expect(await readdir(view.store)).toEqual([])
  })
  it('rejects a symlink target and cleans staging bytes', async () => {
    const view = await fixture(), external = join(view.root, 'outside.md')
    await writeFile(external, 'KEEP'); await symlink(external, view.destination)
    await expect(saveMiraFlowArtifact(view.sender, view.store, view.record, view.payload)).rejects.toThrow('普通文件')
    expect(await readFile(external, 'utf8')).toBe('KEEP')
    expect((await readdir(view.root)).filter(name => name.endsWith('.tmp'))).toEqual([])
  })
  it('reauthorizes after staged fs writes immediately before commit', async () => {
    const view = await fixture(); await writeFile(view.destination, 'KEEP'); let checks = 0
    await expect(saveMiraFlowArtifact(view.sender, view.store, view.record, view.payload, () => { if (++checks >= 4) throw new Error('第一方授权无效或应用已停用') })).rejects.toThrow('第一方授权无效或应用已停用')
    expect(await readFile(view.destination, 'utf8')).toBe('KEEP')
    expect((await readdir(view.root)).filter(name => name.endsWith('.tmp'))).toEqual([])
  })
})
