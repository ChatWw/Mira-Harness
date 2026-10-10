import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FirstPartyGrantStore } from '../electron/security/firstPartyGrant'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import { handleFirstPartyRequest } from '../src/platform/firstPartyBridge'

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>()
  return { handlers, handle: vi.fn((channel, handler) => handlers.set(channel, handler)), showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), writeFile: vi.fn(async () => undefined) }
})
vi.mock('electron', () => ({ ipcMain: { handle: electron.handle }, BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null }, dialog: { showOpenDialog: electron.showOpenDialog, showSaveDialog: electron.showSaveDialog } }))
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>(), writeFile: electron.writeFile }))
import { registerPlatformIpcHandlers } from '../electron/ipc/platformIpc'

function fixture() {
  const references = [{ path: 'mira-attachment:8ba45489-36c1-4c0f-aa58-f97a8bcb5f08', name: 'a.txt', size: 3 }]
  const harness = {
    assertAttachmentSessionWritable: vi.fn(() => ({ id: 's', workingDirectory: '/temporary-workspace' })),
    selectMessageAttachments: vi.fn(() => references),
    importMessageAttachments: vi.fn(() => references),
    getMessageAttachment: vi.fn(() => ({ ...references[0], content: 'abc' })),
    stageMessageAttachment: vi.fn(() => references[0]),
  }
  const sender = Object.assign(new EventEmitter(), { id: 41, isDestroyed: vi.fn(() => false) })
  const grantStore = new FirstPartyGrantStore()
  registerPlatformIpcHandlers({ database: { harness } as never, harnessRuntime: {} as never, localMicroAppServer: {} as never, firstPartyGrantStore: grantStore })
  const grantId = electron.handlers.get('platform:create-first-party-grant')!({ sender }, 'mira-harness') as string
  const call = (method: string, params: unknown = { sessionId: 's' }) => electron.handlers.get('platform:first-party-harness')!({ sender }, grantId, method, params)
  return { harness, sender, grantStore, grantId, call, references }
}

beforeEach(() => { electron.handlers.clear(); vi.clearAllMocks() })
describe('controlled Harness attachment IPC', () => {
  it('selects native files for a personal session and returns only staged references', async () => {
    const { harness, call, references } = fixture()
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/selected-by-user/file.txt'] })
    await expect(call('attachments.select')).resolves.toEqual(references)
    expect(electron.showOpenDialog).toHaveBeenCalledWith({ defaultPath: '/temporary-workspace', properties: ['openFile', 'multiSelections'], title: '选择附件（文本或图片）' })
    expect(harness.assertAttachmentSessionWritable).toHaveBeenCalledTimes(2)
    expect(harness.selectMessageAttachments).toHaveBeenCalledWith('s', ['/selected-by-user/file.txt'])
  })

  it('does not stage anything when the native chooser is canceled', async () => {
    const { harness, call } = fixture()
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    await expect(call('attachments.select')).resolves.toEqual([])
    expect(harness.selectMessageAttachments).not.toHaveBeenCalled()
  })

  it.each(['revoke', 'archive', 'destroy'] as const)('rechecks %s while a native dialog is open before publishing bytes', async change => {
    const { harness, call, grantStore, grantId, sender } = fixture()
    let finish!: (value: { canceled: boolean; filePaths: string[] }) => void
    electron.showOpenDialog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = call('attachments.select') as Promise<unknown>
    if (change === 'revoke') grantStore.revoke(grantId, sender.id)
    if (change === 'archive') harness.assertAttachmentSessionWritable.mockImplementation(() => { throw new Error('归档会话不能新增附件，请先恢复任务') })
    if (change === 'destroy') sender.isDestroyed.mockReturnValue(true)
    finish({ canceled: false, filePaths: ['/selected-by-user/file.txt'] })
    await expect(pending).rejects.toThrow(change === 'revoke' ? '授权无效' : change === 'archive' ? '归档会话' : '连接已关闭')
    expect(harness.selectMessageAttachments).not.toHaveBeenCalled()
  })

  it('routes only validated import/get payloads through the grant', () => {
    const { harness, call, references } = fixture()
    const file = { name: 'a.txt', mediaType: 'text/plain', data: 'YWJj' }
    expect(call('attachments.import', { sessionId: 's', files: [{ ...file, path: '/never-read' }] })).toEqual(references)
    expect(harness.importMessageAttachments).toHaveBeenCalledExactlyOnceWith('s', [file])
    expect(call('attachments.get', { sessionId: 's', path: references[0]!.path })).toMatchObject({ content: 'abc' })
    expect(harness.getMessageAttachment).toHaveBeenCalledExactlyOnceWith('s', references[0]!.path)
    expect(call('attachments.stage', { sessionId: 's', path: 'picture.png' })).toBe(references[0])
    expect(harness.stageMessageAttachment).toHaveBeenCalledExactlyOnceWith('s', 'picture.png')
  })

  it.each([
    { name: '摘录.txt', content: '第一行\n第二行 🌙', mediaType: undefined, bytes: Buffer.from('第一行\n第二行 🌙') },
    { name: '截图.png', content: 'iVBORw0KGgo=', mediaType: 'image/png', bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
  ])('saves frozen $name through the native picker without accepting a renderer destination', async ({ name, content, mediaType, bytes }) => {
    const { harness, call, references } = fixture()
    harness.getMessageAttachment.mockReturnValue({ ...references[0]!, name, content, ...(mediaType ? { mediaType } : {}) })
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/selected-by-user/export' })
    await expect(call('attachments.save', { sessionId: 's', path: references[0]!.path, destination: '/renderer-injected/target', content: 'renderer-injected' })).resolves.toEqual({ status: 'saved' })
    expect(electron.showSaveDialog).toHaveBeenCalledExactlyOnceWith({ title: '保存附件', defaultPath: name, buttonLabel: '保存' })
    expect(electron.writeFile).toHaveBeenCalledExactlyOnceWith('/selected-by-user/export', bytes)
    expect(harness.getMessageAttachment).toHaveBeenNthCalledWith(1, 's', references[0]!.path)
    expect(harness.getMessageAttachment).toHaveBeenNthCalledWith(2, 's', references[0]!.path)
  })

  it('treats a canceled save as a successful cancellation without writing or modifying the task', async () => {
    const { harness, call, references } = fixture()
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: true })
    await expect(call('attachments.save', { sessionId: 's', path: references[0]!.path })).resolves.toEqual({ status: 'canceled' })
    expect(electron.writeFile).not.toHaveBeenCalled()
    expect(harness.importMessageAttachments).not.toHaveBeenCalled()
    expect(harness.stageMessageAttachment).not.toHaveBeenCalled()
    expect(harness.assertAttachmentSessionWritable).not.toHaveBeenCalled()
  })

  it.each(['revoke', 'delete', 'destroy'] as const)('rechecks %s before writing a native save result', async change => {
    const { harness, call, references, grantStore, grantId, sender } = fixture()
    let finish!: (value: { canceled: boolean; filePath: string }) => void
    electron.showSaveDialog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = call('attachments.save', { sessionId: 's', path: references[0]!.path }) as Promise<unknown>
    if (change === 'revoke') grantStore.revoke(grantId, sender.id)
    if (change === 'delete') harness.getMessageAttachment.mockImplementation(() => { throw new Error('未找到会话') })
    if (change === 'destroy') sender.isDestroyed.mockReturnValue(true)
    finish({ canceled: false, filePath: '/selected-by-user/export' })
    await expect(pending).rejects.toThrow(change === 'revoke' ? '授权无效' : change === 'delete' ? '未找到会话' : '连接已关闭')
    expect(electron.writeFile).not.toHaveBeenCalled()
  })

  it('rejects a different-session token and invalid paths before opening the save picker', () => {
    const { harness, call, references } = fixture()
    harness.getMessageAttachment.mockImplementation(() => { throw new Error('附件引用无效或不属于当前会话') })
    expect(() => call('attachments.save', { sessionId: 'another', path: references[0]!.path })).toThrow('不属于当前会话')
    for (const path of ['../secret', 'a/../secret', '', 'a\0b']) expect(() => call('attachments.save', { sessionId: 's', path })).toThrow()
    expect(electron.showSaveDialog).not.toHaveBeenCalled()
    expect(electron.writeFile).not.toHaveBeenCalled()
  })

  it('keeps the dialog default to a filename and reports failed writes without leaking the native path', async () => {
    const { harness, call, references } = fixture()
    harness.getMessageAttachment.mockReturnValueOnce({ ...references[0]!, name: '../private\\导出.txt', content: 'abc' })
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/selected-by-user/export' })
    electron.writeFile.mockRejectedValueOnce(new Error('EACCES /private/secret token=unsafe'))
    await expect(call('attachments.save', { sessionId: 's', path: references[0]!.path })).rejects.toThrow('附件保存失败，请重试。')
    expect(electron.showSaveDialog).toHaveBeenCalledExactlyOnceWith({ title: '保存附件', defaultPath: '导出.txt', buttonLabel: '保存' })
  })
})

describe('Harness attachment bridge errors', () => {
  function request(method: string, failure: string) {
    const manifest = firstPartyAppManifests.find(app => app.appId === 'mira-harness')!
    const api = { invokeFirstPartyHarness: vi.fn(async () => { throw new Error(`Error invoking remote method 'platform:first-party-harness': Error: ${failure}`) }) }
    const params = method === 'attachments.import' ? { sessionId: 's', files: [{ name: 'a.txt', mediaType: 'text/plain', data: 'YWJj' }] }
      : method === 'message.submit' || method === 'message.run' ? { sessionId: 's', submissionId: 'submission', text: '任务', references: [], planning: false, selection: { providerId: 'p', modelId: 'm' } }
        : method === 'plan.continue' ? { sessionId: 's', planId: 'plan', message: '继续', references: [], selection: { providerId: 'p', modelId: 'm' } }
          : method === 'attachments.save' ? { sessionId: 's', path: 'mira-attachment:frozen' } : { sessionId: 's' }
    return handleFirstPartyRequest({ manifest, grantId: 'grant', api: api as never, context: { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'mira', name: 'Mira' } }, route: '/', navigate: () => {} }, { type: 'mira:request', id: 'request', method: `harness.${method}`, params })
  }

  it.each(['单张图片不得超过 20 MiB', '图片附件总大小不得超过 40 MiB', '图片附件内容不完整或签名无效', '附件必须使用规范的 base64 编码', '归档会话不能新增附件，请先恢复任务'])('retains actionable attachment failure %s', async failure => {
    await expect(request('attachments.import', failure)).rejects.toMatchObject({ code: 'FILE_REFERENCE_FAILED', message: failure })
  })

  it.each(['message.submit', 'message.run', 'plan.continue', 'queue.resume'])('retains image model capability failure for %s', async method => {
    const failure = '所选模型不支持图片输入，请在模型设置中启用图片能力或切换支持图片的模型'
    await expect(request(method, failure)).rejects.toMatchObject({ code: 'FILE_REFERENCE_FAILED', message: failure })
  })

  it('redacts unknown host paths and secrets instead of exposing native errors', async () => {
    await expect(request('attachments.select', 'EACCES /private/secret token=unsafe')).rejects.toMatchObject({ code: 'FILE_REFERENCE_FAILED', message: '附件处理失败，请重新选择文件后重试。' })
  })

  it('sanitizes native save failures with a save-specific recovery message', async () => {
    await expect(request('attachments.save', 'EACCES /private/secret token=unsafe')).rejects.toMatchObject({ code: 'FILE_REFERENCE_FAILED', message: '附件保存失败，请重试。' })
  })
})
