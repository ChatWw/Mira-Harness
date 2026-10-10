// @vitest-environment happy-dom
import React, { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessCommandCenter } from '../apps/harness-react/src/components/search/HarnessCommandCenter'
import { HarnessComposer, type HarnessComposerHandle } from '../apps/harness-react/src/components/composer/HarnessComposer'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'

const roots = new Set<Root>()
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
})
afterEach(async () => {
  await act(async () => { roots.forEach(root => root.unmount()); roots.clear() })
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail }); return { promise, resolve, reject } }

async function mount(action?: () => Promise<void | boolean>, onDismiss?: () => boolean) {
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container)
  const root = createRoot(container); roots.add(root)
  let snapshot: PilotState = { sessions: [], projects: [], providers: [], messages: [], running: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} }
  let updateState!: React.Dispatch<React.SetStateAction<PilotState>>, updateOpen!: React.Dispatch<React.SetStateAction<boolean>>, updateOpener!: React.Dispatch<React.SetStateAction<boolean>>, updateFocusRequest!: React.Dispatch<React.SetStateAction<number>>
  const controller = {
    getSnapshot: () => snapshot, getPreference: async () => null, setPreference: async () => undefined,
    getComposerPreferences: async () => ({ sendShortcut: 'enter', showContextUsage: true }),
    registerBeforeNavigation: () => () => undefined, onSessionDeleted: () => () => undefined,
    newConversation: () => { snapshot = { ...snapshot, session: undefined }; updateState(snapshot) },
    supportsAttachments: false, supportsMessageQueue: false,
  } as unknown as PilotController
  function App() {
    const [state, setState] = useState(snapshot), [open, setOpen] = useState(false), [planning, setPlanning] = useState(false), [showOpener, setShowOpener] = useState(true)
    const [focusRequest, setFocusRequest] = useState(0)
    const composer = useRef<HarnessComposerHandle>(null)
    updateState = setState; updateOpen = setOpen; updateOpener = setShowOpener
    updateFocusRequest = setFocusRequest
    const newTask = async () => {
      if (!await composer.current!.startDraft(undefined, undefined, () => true)) return false
      // The Workbench closes search as soon as its guarded navigation commits.
      setOpen(false)
      return true
    }
    return <>{showOpener && <button aria-label="侧栏搜索" onClick={() => setOpen(true)}>搜索</button>}<button aria-label="其他入口" onClick={() => setOpen(true)}>另一个搜索入口</button><button aria-label="新目的地">目的地</button><HarnessComposer ref={composer} state={state} controller={controller} active planning={planning} setPlanning={setPlanning} /><HarnessCommandCenter open={open} focusRequest={focusRequest} onOpenChange={setOpen} onDismiss={onDismiss} controller={controller} commands={[{ id: 'new', label: '新建任务', action: action ?? newTask }]} onOpenSession={async () => true} onOpenFile={async () => true} /></>
  }
  await act(async () => root.render(<React.StrictMode><App /></React.StrictMode>))
  const element = (label: string) => { const result = document.querySelector<HTMLElement>(`[aria-label="${label}"]`); if (!result) throw new Error(`Missing ${label}`); return result }
  const open = async (label = '侧栏搜索') => { await act(async () => { element(label).focus(); element(label).click() }) }
  const dismiss = async (kind: 'close' | 'escape' = 'close') => { await act(async () => { if (kind === 'close') element('关闭全局搜索').click(); else element('搜索命令、对话和文件').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) }) }
  const select = async () => { await act(async () => { document.querySelector<HTMLElement>('[role="option"]')!.click() }) }
  const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(20) }) }
  const unmount = async () => { await act(async () => root.unmount()); roots.delete(root) }
  return { element, open, dismiss, select, settle, unmount, refocus: async () => { await act(async () => updateFocusRequest(value => value + 1)) }, removeOpener: async () => { await act(async () => updateOpener(false)) }, externallyClose: async () => { await act(async () => updateOpen(false)) } }
}

describe('real React and Radix command-center dismissal focus', () => {
  it('refocuses an already-open search on a new opening request without resetting its query', async () => {
    const view = await mount(); await view.open()
    const input = view.element('搜索命令、对话和文件') as HTMLInputElement
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'new'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    const originalInput = input
    input.blur(); expect(document.activeElement).not.toBe(input)
    await view.refocus()
    expect(document.activeElement).toBe(input)
    expect(input).toBe(originalInput); expect(input.value).toBe('new')
  })
  it('hands Shell cancellation back after the dialog unmounts without also restoring child focus', async () => {
    let view!: Awaited<ReturnType<typeof mount>>
    const dismiss = vi.fn(() => { expect(document.querySelector('[role="dialog"]')).toBeNull(); view.element('新目的地').focus(); return true })
    view = await mount(undefined, dismiss)
    await view.open(); await view.dismiss(); await view.settle()
    expect(dismiss).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(view.element('新目的地'))
  })

  it('does not send Shell cancellation for a selected command, external navigation or stale close', async () => {
    const dismiss = vi.fn(() => true), view = await mount(undefined, dismiss)
    await view.open(); await view.select(); await view.settle()
    expect(dismiss).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(view.element('任务内容'))
    await view.open(); await view.externallyClose(); await view.settle()
    expect(dismiss).not.toHaveBeenCalled()
    await view.open(); await view.dismiss(); await view.open('其他入口'); await view.settle()
    expect(dismiss).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(view.element('搜索命令、对话和文件'))
  })
  it.each(['close', 'escape'] as const)('restores the opener after %s without changing Composer focus', async kind => {
    const view = await mount(), opener = view.element('侧栏搜索')
    await view.open(); expect(document.activeElement).toBe(view.element('搜索命令、对话和文件'))
    await view.dismiss(kind); await view.settle()
    expect(document.activeElement).toBe(opener)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('leaves the destination Composer focused when choosing a new task closes search inside navigation', async () => {
    const view = await mount(); await view.open(); await view.select(); await view.settle()
    expect(document.activeElement).toBe(view.element('任务内容'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('keeps asynchronous action failure in search and returns to the opener only after dismissal', async () => {
    const pending = deferred<void>(), view = await mount(() => pending.promise), opener = view.element('侧栏搜索')
    await view.open(); await view.select()
    await act(async () => pending.reject(new Error('任务打开失败')))
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('任务打开失败')
    expect(document.activeElement).toBe(view.element('搜索命令、对话和文件'))
    await view.dismiss(); await view.settle(); expect(document.activeElement).toBe(opener)
  })

  it('does not let an old close or a late accepted action steal focus from a reopened search', async () => {
    const pending = deferred<void>(), view = await mount(() => pending.promise)
    await view.open(); await view.select(); await view.dismiss(); await view.open('其他入口')
    await act(async () => pending.resolve()); await view.settle()
    expect(document.activeElement).toBe(view.element('搜索命令、对话和文件'))
    await view.dismiss(); await view.settle()
    expect(document.activeElement).toBe(view.element('其他入口'))
  })

  it.each(['removed', 'hidden', 'inert', 'disabled'] as const)('does not return to an opener that is %s', async state => {
    const view = await mount(), opener = view.element('侧栏搜索')
    await view.open()
    if (state === 'removed') await view.removeOpener()
    else if (state === 'hidden') opener.hidden = true
    else if (state === 'inert') opener.setAttribute('inert', '')
    else opener.setAttribute('disabled', '')
    await view.dismiss(); await view.settle()
    expect(document.activeElement).not.toBe(opener)
  })

  it('does not override another destination focused between dismissal and delayed Radix cleanup', async () => {
    const view = await mount(); await view.open(); await view.dismiss()
    const destination = view.element('新目的地'); destination.focus(); await view.settle()
    expect(document.activeElement).toBe(destination)
  })

  it('does not restore the opener on external navigation closure or component unmount', async () => {
    const view = await mount(), opener = view.element('侧栏搜索')
    await view.open(); await view.externallyClose(); await view.settle()
    expect(document.activeElement).not.toBe(opener)
    await view.open(); await view.dismiss(); await view.unmount(); await view.settle()
    expect(document.activeElement).not.toBe(opener)
  })
})
