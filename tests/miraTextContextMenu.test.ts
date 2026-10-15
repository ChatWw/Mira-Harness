import { afterEach, expect, it, vi } from 'vitest'
import { setupMiraTextContextMenu } from '../electron/bootstrap/miraTextContextMenu'

const menu = vi.hoisted(() => ({ build: vi.fn(), popup: vi.fn() }))
vi.mock('electron', () => ({ Menu: { buildFromTemplate: menu.build } }))
afterEach(() => vi.clearAllMocks())

function fixture() {
  menu.build.mockReturnValue({ popup: menu.popup })
  const frame = { isDestroyed: vi.fn(() => false), executeJavaScript: vi.fn(async () => null as unknown) }
  let open: (event: unknown, params: unknown) => Promise<void>
  const window = { isDestroyed: vi.fn(() => false), webContents: { on: vi.fn((_event, handler) => { open = handler }) } }
  setupMiraTextContextMenu(window as any)
  const flags = { canUndo: false, canRedo: false, canCopy: false, canCut: false, canPaste: true, canDelete: false, canSelectAll: true }
  return { frame, window, flags, open: (params = {}) => open({}, { frame, editFlags: flags, isEditable: false, selectionText: '', ...params }) }
}

it('offers only copy for selected read-only text and leaves empty/custom contexts alone', async () => {
  const view = fixture()
  await view.open()
  expect(menu.build).not.toHaveBeenCalled()
  await view.open({ selectionText: '对话正文', editFlags: { ...view.flags, canCopy: true } })
  expect(menu.build).toHaveBeenLastCalledWith([{ label: '复制', role: 'copy', enabled: true }])
  expect(menu.popup).toHaveBeenCalledWith({ window: view.window, frame: view.frame })
  expect(view.frame.executeJavaScript).not.toHaveBeenCalled()
})

it('uses Lexical history flags with native shortcuts and retains native clipboard actions', async () => {
  const view = fixture()
  view.frame.executeJavaScript.mockResolvedValue({ undo: true, redo: false })
  await view.open({ isEditable: true })
  const items = menu.build.mock.lastCall![0]
  expect(items.map((item: any) => item.label ?? '|')).toEqual(['撤销', '重做', '|', '剪切', '复制', '粘贴', '删除', '|', '全选'])
  expect(items[0]).toMatchObject({ enabled: true, accelerator: 'CmdOrCtrl+Z', registerAccelerator: false })
  expect(items[1].enabled).toBe(false)
  expect(items[3]).toMatchObject({ role: 'cut', enabled: false })
  expect(items[4]).toMatchObject({ role: 'copy', enabled: false })
  expect(items[5]).toMatchObject({ role: 'paste', enabled: true })
  items[0].click()
  expect(view.frame.executeJavaScript.mock.lastCall![0]).toContain("detail: 'undo'")
})

it('uses Chromium history for ordinary inputs and skips a frame destroyed while opening', async () => {
  const view = fixture()
  await view.open({ isEditable: true })
  expect(menu.build.mock.lastCall![0][0]).toMatchObject({ role: 'undo', enabled: false })
  menu.build.mockClear()
  view.frame.executeJavaScript.mockImplementation(async () => { view.frame.isDestroyed.mockReturnValue(true); return null })
  await view.open({ isEditable: true })
  expect(menu.build).not.toHaveBeenCalled()
})
