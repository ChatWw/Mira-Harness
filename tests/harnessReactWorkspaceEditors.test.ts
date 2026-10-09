import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectWorkspaceEditor, workspaceEditorIcon, type WorkspaceEditorInfo } from '../apps/harness-react/src/lib/workspace-editors'
import { useWorkspaceEditors } from '../apps/harness-react/src/hooks/useWorkspaceEditors'
import { WorkspaceEditorButton } from '../apps/harness-react/src/components/workspace/WorkspaceEditorButton'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'

const hooks = vi.hoisted(() => ({
  cursor: 0, dirty: false,
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>,
  effects: [] as Array<() => void>,
}))

// Exercise the real hook and button callbacks; leave Radix descendants unmounted.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => {
      const next = typeof value === 'function' ? value(slot.value) : value
      if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true }
    }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps
    hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))

const KEY = 'harness-react-editor'
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture(preference: () => Promise<unknown> = async () => null, installed: WorkspaceEditorInfo[] = editors) {
  const listEditors = vi.fn(async (_refresh: boolean) => installed)
  const getPreference = vi.fn((_key: string) => preference())
  const setPreference = vi.fn(async (_key: string, _value: unknown, _reportFailure = false) => undefined)
  const openFileInEditorFor = vi.fn(async (_session: string, _path: string, _editorId: string) => undefined)
  const controller = { listEditors, getPreference, setPreference, openFileInEditorFor } as unknown as PilotController
  return { controller, listEditors, getPreference, setPreference, openFileInEditorFor }
}

function mount(controller: PilotController) {
  let currentController = controller
  let access: ReturnType<typeof useWorkspaceEditors>
  let button: React.ReactElement
  let mounted = true
  const render = () => {
    hooks.cursor = 0; hooks.dirty = false
    access = useWorkspaceEditors(currentController)
    button = WorkspaceEditorButton({ ...access, disabled: false, onRetry: access.retry, onOpen: (editorId, remember) => access.open('session', '', editorId, remember) })
    hooks.effects.splice(0).forEach(effect => effect())
  }
  const drain = async () => {
    for (let index = 0; index < 24; index++) {
      await Promise.resolve()
      if (hooks.dirty && mounted) render()
    }
  }
  const props = (match: (props: Record<string, unknown>) => boolean) => {
    const visit = (node: React.ReactNode): Record<string, unknown> | undefined => {
      if (Array.isArray(node)) return node.map(visit).find(Boolean)
      if (!React.isValidElement<Record<string, unknown>>(node)) return
      return match(node.props) ? node.props : visit(node.props.children as React.ReactNode)
    }
    const found = visit(button)
    if (!found) throw new Error('Editor control not found')
    return found
  }
  const clickOpen = () => (props(props => props.className === 'mira-editor-button__open').onClick as () => void)()
  const select = (editorId: string) => (props(props => props.value === editorId && typeof props.onSelect === 'function').onSelect as () => void)()
  const unmount = () => { mounted = false; hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) }
  render()
  return { drain, props, clickOpen, select, access: () => access, unmount, setController: (next: PilotController) => { currentController = next; render() } }
}

beforeEach(() => {
  hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []
  vi.stubGlobal('React', React)
  vi.stubGlobal('document', { getElementById: () => null })
})
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

const editors = [{ id: 'mira-finder', name: 'Finder' }, { id: 'mira-vscode', name: 'VS Code' }]

describe('Mira workspace editor affordances', () => {
  it('uses the explicit installed preference without changing the supplied list', () => {
    expect(selectWorkspaceEditor(editors, 'mira-vscode')).toBe(editors[1])
    expect(editors.map(editor => editor.id)).toEqual(['mira-finder', 'mira-vscode'])
  })
  it('falls back without rewriting a preference when the app is missing', () => {
    expect(selectWorkspaceEditor(editors, 'mira-missing')).toBe(editors[0])
    expect(selectWorkspaceEditor([], 'mira-vscode')).toBeUndefined()
  })
  it('renders only bounded raster data icons', () => {
    expect(workspaceEditorIcon('data:image/png;base64,aGVsbG8=')).toBe('data:image/png;base64,aGVsbG8=')
    for (const value of [undefined, 'file:///private/icon.png', 'https://example.com/icon.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,' + 'a'.repeat(128_000)]) expect(workspaceEditorIcon(value)).toBeUndefined()
  })
})

describe('Mira workspace editor preference lifecycle', () => {
  it('does not let late preference hydration overwrite an explicit successful user selection', async () => {
    const hydration = deferred<unknown>()
    const { controller, getPreference, setPreference, openFileInEditorFor } = fixture(() => hydration.promise)
    const view = mount(controller)
    await view.drain()
    await view.access().open('alpha', 'notes.md', 'mira-vscode', true)
    hydration.resolve('mira-finder'); await view.drain()
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    expect(getPreference).toHaveBeenCalledWith(KEY)
    expect(setPreference).toHaveBeenCalledOnce()
    expect(setPreference).toHaveBeenCalledWith(KEY, 'mira-vscode', true)
    expect(openFileInEditorFor).toHaveBeenCalledWith('alpha', 'notes.md', 'mira-vscode')
  })

  it('does not persist or change the preferred editor when its launch fails', async () => {
    const { controller, setPreference, openFileInEditorFor } = fixture(async () => 'mira-finder')
    const view = mount(controller); await view.drain()
    openFileInEditorFor.mockRejectedValueOnce(new Error('VS Code 未安装或已卸载'))
    await expect(view.access().open('alpha', '', 'mira-vscode', true)).rejects.toThrow('未安装或已卸载')
    await view.drain()
    expect(view.access().selectedEditor?.id).toBe('mira-finder')
    expect(setPreference).not.toHaveBeenCalled()
    expect(openFileInEditorFor).toHaveBeenCalledOnce()
  })

  it.each(['initial read', 'read retry'])('restores a delayed %s after an explicit editor launch fails', async phase => {
    const hydration = deferred<unknown>()
    const preference = vi.fn<() => Promise<unknown>>()
    if (phase === 'read retry') preference.mockRejectedValueOnce(new Error('编辑器偏好读取失败'))
    preference.mockReturnValueOnce(hydration.promise)
    const { controller, getPreference, setPreference, openFileInEditorFor } = fixture(preference)
    const view = mount(controller); await view.drain()
    if (phase === 'read retry') { view.access().retry(); await view.drain() }
    openFileInEditorFor.mockRejectedValueOnce(new Error('Finder 无法打开'))
    await expect(view.access().open('alpha', '', 'mira-finder', true)).rejects.toThrow('Finder 无法打开')
    hydration.resolve('mira-vscode'); await view.drain()
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    expect(view.access().error).toBeUndefined()
    expect(getPreference).toHaveBeenCalledTimes(phase === 'read retry' ? 2 : 1)
    expect(setPreference).not.toHaveBeenCalled()
  })

  it('keeps the newest explicit selection when parallel editor launches complete in reverse order', async () => {
    const { controller, setPreference, openFileInEditorFor } = fixture()
    const view = mount(controller); await view.drain()
    const older = deferred<void>(), latest = deferred<void>()
    openFileInEditorFor.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
    const first = view.access().open('alpha', '', 'mira-finder', true)
    const second = view.access().open('alpha', '', 'mira-vscode', true)
    expect(setPreference).not.toHaveBeenCalled()
    latest.resolve(); await second; await view.drain()
    older.resolve(); await first; await view.drain()
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    expect(setPreference.mock.calls).toEqual([[KEY, 'mira-vscode', true]])
    expect(openFileInEditorFor.mock.calls).toEqual([['alpha', '', 'mira-finder'], ['alpha', '', 'mira-vscode']])
  })

  it('reports real controller preference-save failures after a successful launch without launching a second time', async () => {
    const setPreference = vi.fn(async () => { throw new Error('编辑器偏好无法保存') })
    const openFileInEditor = vi.fn(async () => undefined)
    const host = { listEditors: vi.fn(async () => editors), getPreference: vi.fn(async () => null), setPreference, openFileInEditor } as unknown as PilotHost
    const controller = new PilotController(host)
    const view = mount(controller); await view.drain()
    const opening = view.access().open('alpha', 'notes.md', 'mira-vscode', true)
    await expect(opening).rejects.toThrow('编辑器偏好无法保存')
    await opening.catch(cause => controller.reportError(cause))
    expect(controller.getSnapshot().error).toBe('编辑器偏好无法保存')
    expect(openFileInEditor).toHaveBeenCalledOnce()
    expect(openFileInEditor).toHaveBeenCalledWith('alpha', 'notes.md', 'mira-vscode')
    expect(setPreference).toHaveBeenCalledOnce()
    expect(setPreference).toHaveBeenCalledWith(KEY, 'mira-vscode')
    view.unmount(); controller.dispose()
  })

  it('redetects installed apps explicitly, retains known preference, and never saves automatic fallbacks', async () => {
    const { controller, listEditors, setPreference } = fixture(async () => 'mira-vscode')
    const view = mount(controller); await view.drain()
    expect(listEditors.mock.calls).toEqual([[false]])
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    listEditors.mockResolvedValueOnce([editors[0]])
    view.access().retry(); await view.drain()
    expect(listEditors.mock.calls).toEqual([[false], [true]])
    expect(view.access().selectedEditor?.id).toBe('mira-finder')
    listEditors.mockResolvedValueOnce(editors)
    view.access().retry(); await view.drain()
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    expect(setPreference).not.toHaveBeenCalled()
  })

  it('does not rehydrate a stale saved preference during re-detection while a new choice is saving', async () => {
    const { controller, getPreference, setPreference } = fixture(async () => 'mira-finder')
    const view = mount(controller); await view.drain()
    const saving = deferred<void>()
    setPreference.mockReturnValueOnce(saving.promise)
    const opening = view.access().open('alpha', '', 'mira-vscode', true)
    await view.drain()
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    view.access().retry(); await view.drain()
    saving.resolve(); await opening; await view.drain()
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    expect(getPreference).toHaveBeenCalledOnce()
  })

  it('reports detection failure and clears it when retry discovers a usable editor', async () => {
    const { controller, listEditors } = fixture()
    const view = mount(controller); await view.drain()
    listEditors.mockRejectedValueOnce(new Error('应用检测失败'))
    view.access().retry(); await view.drain()
    expect(view.access().loading).toBe(false)
    expect(view.access().error).toBe('应用检测失败')
    view.access().retry(); await view.drain()
    expect(view.access().error).toBeUndefined()
    expect(listEditors.mock.calls).toEqual([[false], [true], [true]])
  })

  it('retries a failed preference read and restores the saved editor without changing the preference', async () => {
    const preference = vi.fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('编辑器偏好读取失败'))
      .mockResolvedValueOnce('mira-vscode')
    const { controller, getPreference, setPreference } = fixture(preference)
    const view = mount(controller); await view.drain()
    expect(view.access().error).toBe('编辑器偏好读取失败')
    expect(view.access().selectedEditor?.id).toBe('mira-finder')
    view.access().retry(); await view.drain()
    expect(getPreference).toHaveBeenCalledTimes(2)
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    expect(view.access().error).toBeUndefined()
    expect(setPreference).not.toHaveBeenCalled()
    view.access().retry(); await view.drain()
    expect(getPreference).toHaveBeenCalledTimes(2)
  })

  it('keeps a preference-read error visible until its retry succeeds even when editor detection succeeds', async () => {
    const restored = deferred<unknown>()
    const preference = vi.fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('编辑器偏好读取失败'))
      .mockReturnValueOnce(restored.promise)
    const { controller, getPreference, listEditors } = fixture(preference)
    const view = mount(controller); await view.drain()
    view.access().retry(); await view.drain()
    expect(getPreference).toHaveBeenCalledTimes(2)
    expect(listEditors.mock.calls).toEqual([[false], [true]])
    expect(view.access().loading).toBe(false)
    expect(view.access().error).toBe('编辑器偏好读取失败')
    restored.resolve('mira-vscode'); await view.drain()
    expect(view.access().error).toBeUndefined()
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
  })

  it('does not let late preference retry hydration override a newer explicit successful selection', async () => {
    const restored = deferred<unknown>()
    const preference = vi.fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('编辑器偏好读取失败'))
      .mockReturnValueOnce(restored.promise)
    const { controller, getPreference, setPreference } = fixture(preference)
    const view = mount(controller); await view.drain()
    view.access().retry(); await view.drain()
    expect(getPreference).toHaveBeenCalledTimes(2)
    await view.access().open('alpha', '', 'mira-finder', true)
    restored.resolve('mira-vscode'); await view.drain()
    expect(view.access().selectedEditor?.id).toBe('mira-finder')
    expect(view.access().error).toBeUndefined()
    expect(setPreference.mock.calls).toEqual([[KEY, 'mira-finder', true]])
  })

  it('does not rehydrate a stale saved preference when read retry begins after a successful selection starts saving', async () => {
    const saving = deferred<void>()
    const preference = vi.fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('编辑器偏好读取失败'))
      .mockResolvedValueOnce('mira-vscode')
    const { controller, getPreference, setPreference } = fixture(preference)
    const view = mount(controller); await view.drain()
    setPreference.mockReturnValueOnce(saving.promise)
    const opening = view.access().open('alpha', '', 'mira-finder', true)
    await view.drain()
    view.access().retry(); await view.drain()
    expect(getPreference).toHaveBeenCalledTimes(2)
    expect(view.access().error).toBeUndefined()
    expect(view.access().selectedEditor?.id).toBe('mira-finder')
    saving.resolve(); await opening
    expect(setPreference.mock.calls).toEqual([[KEY, 'mira-finder', true]])
  })

  it('does not replace a newer detection with a late old list after another retry', async () => {
    const { controller, listEditors } = fixture()
    const old = deferred<WorkspaceEditorInfo[]>(), latest = deferred<WorkspaceEditorInfo[]>()
    listEditors.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const view = mount(controller); await view.drain()
    view.access().retry(); await view.drain()
    latest.resolve([editors[1]]); await view.drain()
    old.resolve([editors[0]]); await view.drain()
    expect(view.access().editors).toEqual([editors[1]])
    expect(view.access().loading).toBe(false)
  })

  it('ignores late editor discovery and preference responses from the previous controller', async () => {
    const oldPreference = deferred<unknown>(), oldEditors = deferred<WorkspaceEditorInfo[]>()
    const old = fixture(() => oldPreference.promise)
    old.listEditors.mockReturnValueOnce(oldEditors.promise)
    const view = mount(old.controller); await view.drain()
    const fresh = fixture(async () => 'mira-vscode', [editors[1]])
    view.setController(fresh.controller); await view.drain()
    expect(view.access().editors).toEqual([editors[1]])
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    oldPreference.resolve('mira-finder'); oldEditors.resolve([editors[0]]); await view.drain()
    expect(view.access().editors).toEqual([editors[1]])
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
    expect(view.access().loading).toBe(false)
    expect(fresh.getPreference).toHaveBeenCalledOnce()
  })

  it('does not save a remembered choice after its pending external launch completes after unmount', async () => {
    const { controller, setPreference, openFileInEditorFor } = fixture()
    const view = mount(controller); await view.drain()
    const launch = deferred<void>()
    openFileInEditorFor.mockReturnValueOnce(launch.promise)
    const opening = view.access().open('alpha', '', 'mira-vscode', true)
    view.unmount()
    launch.resolve(); await opening; await view.drain()
    expect(openFileInEditorFor).toHaveBeenCalledOnce()
    expect(setPreference).not.toHaveBeenCalled()
  })

  it('does not let the old controller launch save its choice after the controller is replaced', async () => {
    const old = fixture(async () => 'mira-finder')
    const view = mount(old.controller); await view.drain()
    const launch = deferred<void>()
    old.openFileInEditorFor.mockReturnValueOnce(launch.promise)
    const opening = view.access().open('alpha', '', 'mira-vscode', true)
    const fresh = fixture(async () => 'mira-finder')
    view.setController(fresh.controller); await view.drain()
    launch.resolve(); await opening; await view.drain()
    expect(old.openFileInEditorFor).toHaveBeenCalledOnce()
    expect(old.setPreference).not.toHaveBeenCalled()
    expect(fresh.setPreference).not.toHaveBeenCalled()
    expect(view.access().selectedEditor?.id).toBe('mira-finder')
  })

  it('uses a directory-capable fallback for a file-only preference without rewriting that preference', async () => {
    const textEdit: WorkspaceEditorInfo = { id: 'mira-textedit', name: 'TextEdit', fileOnly: true }
    const { controller, setPreference, openFileInEditorFor } = fixture(async () => textEdit.id, [...editors, textEdit])
    const view = mount(controller); await view.drain()
    expect(view.access().selectedEditor).toBe(textEdit)
    expect(view.props(props => props.className === 'mira-editor-button__open')['aria-label']).toBe('在 Finder 中打开')
    view.clickOpen(); await view.drain()
    expect(openFileInEditorFor).toHaveBeenCalledWith('session', '', 'mira-finder')
    expect(setPreference).not.toHaveBeenCalled()
    expect(view.access().selectedEditor).toBe(textEdit)
  })

  it('still opens the currently selected editor when its same menu item is selected again', async () => {
    const { controller, setPreference, openFileInEditorFor } = fixture(async () => 'mira-vscode')
    const view = mount(controller); await view.drain()
    view.select('mira-vscode'); await view.drain()
    view.select('mira-vscode'); await view.drain()
    expect(openFileInEditorFor.mock.calls).toEqual([['session', '', 'mira-vscode'], ['session', '', 'mira-vscode']])
    expect(setPreference.mock.calls).toEqual([[KEY, 'mira-vscode', true], [KEY, 'mira-vscode', true]])
    expect(view.access().selectedEditor?.id).toBe('mira-vscode')
  })

  it('rejects an unavailable editor before launch or persistence and ignores late hydration after unmount', async () => {
    const hydration = deferred<unknown>()
    const { controller, setPreference, openFileInEditorFor } = fixture(() => hydration.promise)
    const view = mount(controller); await view.drain()
    await expect(view.access().open('alpha', '', 'mira-missing', true)).rejects.toThrow('该编辑器不可用')
    expect(openFileInEditorFor).not.toHaveBeenCalled()
    expect(setPreference).not.toHaveBeenCalled()
    view.unmount(); hydration.resolve('mira-vscode'); await view.drain()
    expect(view.access().selectedEditor?.id).toBe('mira-finder')
  })
})
