// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MiraFullViewHost } from '../apps/harness-react/src/components/workspace/MiraFullViewHost'
import { miraFloatingPosition, miraNearestFloatingAnchor, type MiraFullView } from '../apps/harness-react/src/lib/side-pane-full-view'
import { fileManagerPreferences } from '../apps/harness-react/src/lib/file-manager-preferences'
import { createWorkspaceFileManagerTab, createWorkspaceSession, openWorkspaceTab, readWorkspaceSessions } from '../apps/harness-react/src/state/workspace-state'
import { conversationFloatingStatus } from '../apps/harness-react/src/lib/conversation-timeline'
import type { TimelineRenderMessage } from '../apps/harness-react/src/components/conversation/conversation-model'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'

const roots: Array<ReturnType<typeof createRoot>> = []
afterEach(async () => { await act(async () => roots.splice(0).forEach(root => root.unmount())); document.body.replaceChildren(); vi.unstubAllGlobals() })
it('snaps a dragged conversation inside the content slot at all seven positions', () => {
  const slot = { width: 1000, height: 800 }, size = { width: 560, height: 120 }
  for (const anchor of ['top-left','top-right','left-center','right-center','bottom-left','bottom-center','bottom-right'] as const) {
    const position = miraFloatingPosition(slot, size, anchor)
    expect(position.x).toBeGreaterThanOrEqual(16); expect(position.y).toBeGreaterThanOrEqual(16)
    expect(position.x + size.width).toBeLessThanOrEqual(984); expect(position.y + size.height).toBeLessThanOrEqual(784)
    expect(miraNearestFloatingAnchor(slot, size, position)).toBe(anchor)
  }
})
it('restores independently scoped file manager tabs including identical relative paths', () => {
  const a = { ...createWorkspaceFileManagerTab('/one', 'project'), path: 'note.md' }, b = { ...createWorkspaceFileManagerTab('/two', 'project'), path: 'note.md' }
  const state = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), a), b)
  const restored = readWorkspaceSessions({ owner: state }).owner
  expect(restored.tabs).toHaveLength(2)
  expect(restored.tabs.map(tab => [tab.rootPath, tab.fileManager?.directory, tab.path])).toEqual([['/one','/one','note.md'],['/two','/two','note.md']])
})
it('retains explicit navigation changes made before host preferences finish loading and shares them across tabs', async () => {
  let resolve!: (value: unknown) => void
  const controller = { getPreference: vi.fn(() => new Promise(done => { resolve = done })), setPreference: vi.fn(async () => undefined), reportError: vi.fn() } as unknown as PilotController
  const store = fileManagerPreferences(controller)
  const loading = store.load()
  store.update('/two', { open: false })
  resolve({ '/one': { open: false, width: 240 }, '/two': { open: true, width: 300 } })
  await loading; await store.flush()
  expect(fileManagerPreferences(controller)).toBe(store)
  expect(store.getSnapshot()).toEqual({ '/one': { open: false, width: 240 }, '/two': { open: false, width: 300 } })
  expect(controller.setPreference).toHaveBeenLastCalledWith('mira-file-manager-navigation', store.getSnapshot(), true)
})
it('keeps one editor through floating, full conversation and ordinary views and restores a minimized pending interaction', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container); roots.push(root)
  const controller = { getPreference: vi.fn(async () => undefined), setPreference: vi.fn(async () => undefined), reportError: vi.fn() } as unknown as PilotController
  let setView!: (value: MiraFullView | undefined) => void, setWaiting!: (value: boolean) => void
  function Fixture() {
    const [view, update] = useState<MiraFullView | undefined>({surface:'resource',floating:'collapsed'}), [waiting, updateWaiting] = useState(false)
    setView = update; setWaiting = updateWaiting
    const state = { running: false, messages: [], session: waiting ? { pendingInteraction: {status:'waiting'} } : undefined } as unknown as ReturnType<PilotController['getSnapshot']>
    return <MiraFullViewHost status={{turnKey:'',running:false,answer:'',startedAt:undefined}} controller={controller} view={view} onChange={update} slotRef={{current:container}} owner="one" state={state}><textarea defaultValue="retained draft" /></MiraFullViewHost>
  }
  await act(async () => root.render(<Fixture />))
  const editor = container.querySelector('textarea')!
  editor.value = 'edited draft'; editor.setSelectionRange(3, 6)
  for (const view of [{surface:'conversation',floating:'collapsed'}, undefined, {surface:'resource',floating:'minimized'}] as Array<MiraFullView | undefined>) {
    await act(async () => setView(view)); expect(container.querySelector('textarea')).toBe(editor)
    expect(editor.value).toBe('edited draft'); expect(editor.selectionStart).toBe(3); expect(editor.selectionEnd).toBe(6)
  }
  await act(async () => setWaiting(true))
  expect(container.querySelector('[data-floating]')?.getAttribute('data-floating')).toBe('collapsed')
})

it('only reports the complete final answer after the last tool boundary in the final turn', () => {
  const message = (id: string, role: string, parts?: unknown[], extra = {}) => ({ rendererId: id, original: { id, role, content: 'fallback', parts, ...extra } }) as TimelineRenderMessage
  const messages = [message('u', 'user'), message('a', 'assistant', [
    { type: 'text', text: 'process narration', state: 'complete' }, { type: 'tool-call', toolCallId: 't' },
    { type: 'text', text: 'final answer', state: 'complete' },
  ])]
  expect(conversationFloatingStatus(messages, undefined, false).answer).toBe('final answer')
  expect(conversationFloatingStatus(messages, 'a', true, 100)).toMatchObject({ running: true, startedAt: 100, answer: '' })
  for (const extra of [{ interrupted: true }, { run: { status: 'failed' } }, { run: { status: 'stopped' } }]) {
    expect(conversationFloatingStatus([messages[0], message('a', 'assistant', undefined, extra)], undefined, false).answer).toBe('')
  }
  expect(conversationFloatingStatus([...messages, message('u2', 'user')], undefined, false).answer).toBe('')
  expect(conversationFloatingStatus([messages[0], message('a', 'assistant', [{ type: 'text', text: 'incomplete', state: 'streaming' }])], undefined, false).answer).toBe('')
})
it('suppresses old replies, retains per-task bubbles, handles fast replies and dismisses a clicked bubble', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container); roots.push(root)
  const controller = { getPreference: vi.fn(async () => undefined), reportError: vi.fn() } as unknown as PilotController
  let update!: (value: { owner: string; status: { turnKey: string; running: boolean; answer: string; startedAt: undefined } }) => void
  function Fixture() {
    const [value, change] = useState({ owner: 'a', status: { turnKey: 'old', running: false, answer: 'old reply', startedAt: undefined } })
    const [view, setView] = useState<MiraFullView>({ surface: 'resource', floating: 'collapsed' }); update = change
    return <MiraFullViewHost controller={controller} view={view} onChange={setView} slotRef={{current:container}} owner={value.owner} status={value.status} state={{} as never}><textarea /></MiraFullViewHost>
  }
  const change = async (owner: string, turnKey: string, answer: string, running = false) => act(async () => update({ owner, status: { turnKey, answer, running, startedAt: undefined } }))
  await act(async () => root.render(<Fixture />)); expect(container.querySelector('.mira-floating-answer')).toBeNull()
  await change('a','new','new reply'); expect(container.querySelector('.mira-floating-answer')?.textContent).toBe('new reply')
  await change('a','next','',true); expect(container.querySelector('.mira-floating-answer')?.textContent).toBe('new reply')
  await change('b','b-old','B old'); expect(container.querySelector('.mira-floating-answer')).toBeNull()
  await change('a','next','',true); expect(container.querySelector('.mira-floating-answer')?.textContent).toBe('new reply')
  await change('a','next','finished'); expect(container.querySelector('.mira-floating-answer')?.textContent).toBe('finished')
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="展开最新回答"]')!.click())
  expect(container.querySelector('[data-floating]')?.getAttribute('data-floating')).toBe('expanded')
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="收起消息流"]')!.click())
  expect(container.querySelector('.mira-floating-answer')).toBeNull()
})
