import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { HarnessComposer, type HarnessComposerHandle } from '../apps/harness-react/src/components/composer/HarnessComposer'
import { ComposerSuggestionPanel, type ComposerSuggestion, type ComposerSuggestionSection } from '../apps/harness-react/src/components/composer/ComposerSuggestionPanel'
import { HarnessMessageQueue } from '../apps/harness-react/src/components/composer/HarnessMessageQueue'
import { MiraComposerAttachments } from '../apps/harness-react/src/components/composer/MiraComposerAttachments'
import { MiraPromptEditor, type MiraPromptEditorHandle } from '../apps/harness-react/src/components/composer/MiraPromptEditor'
import { createMiraPromptDocument, replaceMiraPromptDocumentRange, validateMiraPromptDocument, type MiraPromptDocument, type MiraPromptSelectionRange } from '../apps/harness-react/src/lib/prompt-editor-document'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessQueuedMessage, HarnessWorkspaceFileSearchResult } from '../src/config/harness'
import type { ComposerTaskDraft } from '../apps/harness-react/src/lib/composer-drafts'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
// Exercise shipped Composer hooks/catalogues through an explicit editor handle mock.
// Lexical DOM behavior has its own real-editor tests; Radix owns positioning.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = factory(); slot.deps = deps }
    return slot.value
  },
  useImperativeHandle: (ref: React.RefObject<unknown> | null, factory: () => unknown) => { if (ref) ref.current = factory() },
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
const emptyFiles = { entries: [], truncated: false } as HarnessWorkspaceFileSearchResult
const event = (key: string, modifiers: Record<string, unknown> = {}) => ({ key, keyCode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...modifiers })
const listeners = new Map<string, Set<(event: ReturnType<typeof event>) => void>>()

function fixture(options: { search?: (id: string, query: string) => Promise<HarnessWorkspaceFileSearchResult>; files?: Promise<HarnessWorkspaceFileSearchResult>; preference?: 'enter' | 'mod-enter'; followupMode?: 'queue' | 'guide'; draftPreference?: Promise<unknown>; active?: boolean; queue?: boolean; queueActions?: boolean; submissionOptions?: boolean; attachments?: boolean; editorElement?: HTMLDivElement } = {}) {
  const session = { version: 1 as const, id: 'current', title: 'Current', projectId: 'project', workingDirectory: '/project', permissionMode: 'default' as const, messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active' as const, pinned: false }
  const state: PilotState = { session, sessions: [session, { ...session, id: 'reference', title: '研究记录' }], projects: [{ id: 'project', name: 'Project', directory: '/project', directoryExists: true, createdAt: 1, updatedAt: 1 }], providers: [{ id: 'provider', providerKey: 'custom', name: 'Provider', endpoint: 'http://localhost', enabled: true, authMode: 'api-key', hasApiKey: true, createdAt: 1, updatedAt: 1, models: [{ id: 'model', enabled: true, reasoning: true, contextWindow: 1000 }] }], selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'medium' }, messages: [], running: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} }
  const api = {
    getSnapshot: () => state,
    getPreference: vi.fn(async () => options.draftPreference ? await options.draftPreference : null),
    getComposerPreferences: vi.fn(async () => ({ sendShortcut: options.preference || 'enter', showContextUsage: true, followupMode: options.followupMode || 'queue' })),
    setPreference: vi.fn(async () => undefined), registerBeforeNavigation: vi.fn((_guard: () => Promise<void>) => () => undefined),
    onSessionDeleted: vi.fn((_listener: (id: string) => void) => () => undefined),
    supportsAttachments: options.attachments ?? false,
    prepare: vi.fn(async () => { state.session = { ...session, id: 'created', draftState: 'prepared' }; return true }),
    open: vi.fn(async (id: string, isCurrent = () => true) => { if (!isCurrent()) return false; state.session = { ...session, id, draftState: 'prepared' }; return true }),
    moveSession: vi.fn(async (_id: string, projectId: string) => { state.session = { ...state.session!, projectId } }),
    reportError: vi.fn((error: unknown) => { state.error = error instanceof Error ? error.message : String(error) }),
    newConversation: vi.fn(() => { state.session = undefined; state.sessionLoading = false }),
    stageAttachment: vi.fn(async (_id: string, path: string) => ({ path: 'mira-attachment:staged', name: path.split('/').pop()!, size: 20 })),
    selectAttachments: vi.fn(async (_id: string) => [{ path: 'mira-attachment:fixture', name: '截图.png', mediaType: 'image/png' as const, size: 70 }]),
    importAttachments: vi.fn(async (_id: string, _files: unknown[]) => [{ path: 'mira-attachment:paste', name: '粘贴的文本.txt' }]),
    listFilesFor: vi.fn(async () => options.files ? await options.files : emptyFiles),
    searchFilesFor: vi.fn(options.search || (async () => emptyFiles)),
    listSkills: vi.fn(async () => [{ id: 'research', name: 'Research', description: '资料整理', enabled: true }]),
    listMcp: vi.fn(async () => [{ id: 'docs', name: 'Docs', enabled: true }]),
    getSession: vi.fn(async () => ({ ...session, id: 'reference', title: '研究记录', messages: [{ role: 'user', content: '真实需求' }, { role: 'assistant', content: '真实结论' }, { role: 'assistant', content: 'internal secret', internal: true }] })),
    setSessionSkills: vi.fn(async () => undefined), setSessionMcpServers: vi.fn(async () => undefined), setSessionPermission: vi.fn(async () => undefined), select: vi.fn(), stop: vi.fn(async () => undefined), send: vi.fn(async (): Promise<boolean | 'confirmation-required' | 'retry-required'> => true),
    supportsMessageQueue: options.queue ?? false,
    supportsQueueSubmissionOptions: options.submissionOptions ?? false,
    supportsQueueReorder: options.queueActions ?? false,
    supportsQueueSendNow: options.queueActions ?? false,
    withdrawMessage: vi.fn(async (_owner: string, itemId: string) => ({ item: queued(itemId), queue: { sessionId: 'current', revision: 2, items: [] } })),
    resumeMessageQueue: vi.fn(async () => ({ sessionId: 'current', revision: 3, items: [] })),
    reorderMessageQueue: vi.fn(async () => ({ sessionId: 'current', revision: 3, items: [] })),
    sendQueuedMessageNow: vi.fn(async () => ({ sessionId: 'current', revision: 3, items: [] })),
  }
  let tree: React.ReactElement, planning = false, active = options.active ?? true, draftProjectId: string | undefined
  const onDraftChange = vi.fn<(draft: ComposerTaskDraft | null | undefined) => void>()
  const onDraftAccepted = vi.fn(async (_sessionId: string, _draft: ComposerTaskDraft) => undefined)
  const handle = { current: null as HarnessComposerHandle | null }
  const editorElement = options.editorElement ?? { focus: vi.fn(), closest: () => null, contains: (target: unknown) => target === editorElement }
  const promptSelection: MiraPromptSelectionRange = { start: 0, end: 0 }
  let promptDocument = createMiraPromptDocument(''), promptDisabled = false
  const setPromptSelection = (start: number, end: number) => { promptSelection.start = start; promptSelection.end = end }
  const editorHandle: MiraPromptEditorHandle = {
    getElement: () => editorElement as HTMLDivElement,
    focus: (options?: FocusOptions) => { if (!promptDisabled) editorElement.focus(options) },
    getSelectionRange: () => ({ ...promptSelection }),
    setSelectionRange: setPromptSelection,
    replaceRange: (range, parts) => {
      const replacement = replaceMiraPromptDocumentRange(promptDocument, range, parts)
      if (!replacement || promptDisabled) return
      promptDocument = replacement.document; setPromptSelection(replacement.range.start, replacement.range.end)
      ;(inputProps().onChange as (document: MiraPromptDocument, range: MiraPromptSelectionRange) => void)(promptDocument, { ...promptSelection })
      return promptDocument
    },
  }
  const plusButton = { contains: (target: unknown) => target === plusButton }
  const visit = (node: React.ReactNode, callback: (element: React.ReactElement<Record<string, unknown>>) => void) => {
    if (Array.isArray(node)) { node.forEach(child => visit(child, callback)); return }
    if (!React.isValidElement<Record<string, unknown>>(node)) return
    callback(node); visit(node.props.children as React.ReactNode, callback)
  }
  const props = (match: (props: Record<string, unknown>, element: React.ReactElement<Record<string, unknown>>) => boolean) => {
    let found: Record<string, unknown> | undefined
    visit(tree, element => { if (!found && match(element.props, element)) found = element.props })
    if (!found) throw new Error('Composer control not found')
    return found
  }
  const render = () => {
    hooks.cursor = 0; hooks.dirty = false
    tree = (HarnessComposer as unknown as { render: (props: unknown, ref: unknown) => React.ReactElement }).render({ state, controller: api as unknown as PilotController, active, planning, setPlanning: (value: boolean) => { planning = value; hooks.dirty = true }, draftProjectId, onDraftProjectChange: (value?: string) => { draftProjectId = value; hooks.dirty = true }, onDraftChange, onDraftAccepted }, handle)
    visit(tree, element => {
      if (element.type === MiraPromptEditor) {
        (element.props.ref as React.RefObject<unknown>).current = editorHandle
        const text = element.props.text as string
        promptDocument = validateMiraPromptDocument(element.props.document, text) ?? createMiraPromptDocument(text)
        promptDisabled = Boolean(element.props.disabled)
        setPromptSelection(Math.min(promptSelection.start, text.length), Math.min(promptSelection.end, text.length))
        if (options.editorElement) { options.editorElement.textContent = text; options.editorElement.contentEditable = String(!promptDisabled) }
      }
      if (element.props['aria-label'] === '添加上下文' && element.props.ref) (element.props.ref as React.RefObject<unknown>).current = plusButton
    })
    hooks.effects.splice(0).forEach(callback => callback())
  }
  const drain = async () => { for (let index = 0; index < 24; index++) { await Promise.resolve(); if (hooks.dirty) render() } }
  const inputProps = () => props((_, element) => element.type === MiraPromptEditor)
  const panelProps = () => props((_, element) => element.type === ComposerSuggestionPanel)
  const items = () => (panelProps().sections as ComposerSuggestionSection[]).flatMap(section => section.items)
  const type = async (text: string, position = text.length) => {
    setPromptSelection(position, position); promptDocument = createMiraPromptDocument(text)
    ;(inputProps().onChange as (document: MiraPromptDocument, range: MiraPromptSelectionRange) => void)(promptDocument, { ...promptSelection })
    await drain()
  }
  const append = async (text: string) => {
    const end = (inputProps().text as string).length
    editorHandle.replaceRange({ start: end, end }, [{ type: 'text', text }])
    await drain()
  }
  const key = async (value: string, modifiers: Record<string, unknown> = {}) => {
    const keyboard = event(value, modifiers)
    ;(inputProps().onKeyDown as (event: unknown) => void)(keyboard)
    await drain(); return keyboard
  }
  const plus = async (keyboardActivation = false) => {
    const button = props(props => props['aria-label'] === '添加上下文')
    if (!keyboardActivation) (button.onMouseDown as (event: unknown) => void)({ preventDefault: vi.fn() })
    ;(button.onClick as () => void)(); await drain()
  }
  const select = async (id: string) => { const item = items().find(item => item.id === id); if (!item) throw new Error(`Missing candidate ${id}`); (panelProps().onSelect as (item: ComposerSuggestion) => void)(item); await drain() }
  const dispatch = async (value: string, modifiers: Record<string, unknown> = {}) => { const keyboard = event(value, modifiers); listeners.get('keydown')?.forEach(listener => listener(keyboard)); await drain(); return keyboard }
  const compose = async (text: string) => { listeners.get('mira:compose-draft')?.forEach(listener => listener({ detail: text } as unknown as ReturnType<typeof event>)); await drain() }
  const setActive = async (value: boolean) => { active = value; render(); await drain() }
  const formSubmit = async (modifiers: Record<string, unknown> = {}) => {
    ;(props(props => props.type === 'submit').onClick as (event: unknown) => void)(event('click', modifiers))
    ;(props((_, element) => element.type === 'form').onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() })
    await drain()
  }
  const dialogProps = () => props((_, element) => element.type === Dialog.Root)
  const confirm = async (decision: 'retain' | 'discard') => { (props(props => props.className === `mira-composer-confirm__${decision === 'retain' ? 'send' : 'discard'}`).onClick as () => void)(); await drain() }
  const cancel = async () => { (dialogProps().onOpenChange as (open: boolean) => void)(false); await drain() }
  const openPopups = () => { let count = 0; visit(tree, element => { if (element.props.open === true) count++ }); return count }
  render()
  const queueProps = () => props((_, element) => element.type === HarnessMessageQueue)
  const attachmentProps = () => props((_, element) => element.type === MiraComposerAttachments)
  const attachmentPaths = () => (attachmentProps().references as Array<{ path: string }>).map(item => item.path)
  return { state, api, handle, onDraftChange, onDraftAccepted, render, drain, type, append, key, plus, select, dispatch, compose, setActive, formSubmit, dialogProps, confirm, cancel, openPopups, editorElement, promptSelection, plusButton, props, inputProps, panelProps, queueProps, attachmentProps, attachmentPaths, items, text: () => inputProps().text as string }
}

function queued(id = 'queued-1'): HarnessQueuedMessage {
  return { id, submissionId: `submission-${id}`, sessionId: 'current', text: '排队的正文', references: [{ path: 'queued.md', name: 'queued.md' }], selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'high' }, planning: true, permissionMode: 'default', createdAt: 1 }
}

beforeEach(() => {
  hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; listeners.clear()
  vi.useFakeTimers(); vi.stubGlobal('React', React)
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null })
  vi.stubGlobal('window', { setTimeout, clearTimeout, requestAnimationFrame: (callback: () => void) => { callback(); return 1 }, addEventListener: (name: string, callback: (event: ReturnType<typeof event>) => void) => { const set = listeners.get(name) || new Set(); set.add(callback); listeners.set(name, set) }, removeEventListener: (name: string, callback: (event: ReturnType<typeof event>) => void) => listeners.get(name)?.delete(callback) })
})

describe('group draft lifecycle in the shipped Composer', () => {
  function focusFixture(options: Parameters<typeof fixture>[0] = {}) {
    const dom = new Window(), frames = new Map<number, () => void>()
    const editorElement = dom.document.createElement('div'), outside = dom.document.createElement('button')
    editorElement.contentEditable = 'true'; editorElement.tabIndex = 0
    dom.document.body.append(outside, editorElement); outside.focus()
    vi.stubGlobal('document', dom.document)
    let nextFrame = 0
    window.requestAnimationFrame = (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, () => callback(0)); return id }
    const view = fixture({ ...options, editorElement: editorElement as unknown as HTMLDivElement })
    const frame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()) }
    return { ...view, editorElement, dom, outside, frame, unmount: () => hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) }
  }

  it('focuses the editor element after explicit new-task entries, including repeated entries in the same draft', async () => {
    const view = focusFixture(); await view.drain()
    expect(view.dom.document.activeElement).toBe(view.outside)
    expect(await view.handle.current!.startDraft('research', undefined, () => true)).toBe(true)
    await view.drain(); view.frame()
    expect(view.dom.document.activeElement).toBe(view.editorElement)
    await view.type('保留输入和光标'); view.outside.focus()
    expect(await view.handle.current!.startDraft('writing', undefined, () => true)).toBe(true)
    await view.drain(); view.frame()
    expect(view.dom.document.activeElement).toBe(view.editorElement)
    expect(view.editorElement.textContent).toBe('保留输入和光标')
    expect(view.api.prepare).not.toHaveBeenCalled()
  })

  it('does not steal focus on hydration, implicit draft restoration or ordinary task reading', async () => {
    const view = focusFixture({ draftPreference: Promise.resolve({ draft: { id: 'saved', sessionId: 'prepared' }, drafts: { prepared: '已保存的输入' } }) })
    await view.drain(); view.frame()
    expect(view.dom.document.activeElement).toBe(view.outside)
    expect(await view.handle.current!.openDraft(undefined, () => true)).toBe(true)
    await view.drain(); view.frame()
    expect(view.dom.document.activeElement).toBe(view.outside)
    view.state.session = { ...view.state.session!, id: 'reading' }; view.render(); await view.drain(); view.frame()
    expect(view.dom.document.activeElement).toBe(view.outside)
  })

  it('waits for a prepared draft to become visible and editable before returning focus on explicit reopen', async () => {
    const view = focusFixture({ active: false, draftPreference: Promise.resolve({ draft: { id: 'saved', sessionId: 'prepared' }, drafts: { prepared: '附件草稿' } }) })
    await view.drain()
    expect(await view.handle.current!.openDraft('saved', () => true)).toBe(true)
    view.state.sessionLoading = true; view.render(); await view.setActive(true); view.frame()
    expect(view.dom.document.activeElement).toBe(view.outside)
    expect(view.editorElement.contentEditable).toBe('false')
    view.state.sessionLoading = false; view.render(); await view.drain(); view.frame()
    expect(view.dom.document.activeElement).toBe(view.editorElement)
    expect(view.editorElement.contentEditable).toBe('true')
    expect(view.editorElement.textContent).toBe('附件草稿')
    expect(view.api.prepare).not.toHaveBeenCalled()
  })

  it('does not let an asynchronous prepared draft or its scheduled focus override a newer navigation', async () => {
    const view = focusFixture({ draftPreference: Promise.resolve({ draft: { id: 'saved', sessionId: 'prepared' } }) })
    await view.drain()
    const opened = deferred<boolean>(); view.api.open.mockReturnValueOnce(opened.promise)
    let current = true
    const reopening = view.handle.current!.openDraft('saved', () => current)
    await view.drain(); current = false; opened.resolve(true)
    expect(await reopening).toBe(false); await view.drain(); view.frame()
    expect(view.dom.document.activeElement).toBe(view.outside)
    current = true
    expect(await view.handle.current!.startDraft(undefined, undefined, () => current)).toBe(true)
    await view.drain(); current = false; view.frame()
    expect(view.dom.document.activeElement).toBe(view.outside)
  })

  it('drops scheduled draft focus after the application hides or the Composer unmounts', async () => {
    const view = focusFixture(); await view.drain()
    await view.handle.current!.startDraft(undefined, undefined, () => true); await view.drain()
    await view.setActive(false); view.frame()
    expect(view.dom.document.activeElement).toBe(view.outside)
    await view.setActive(true); view.unmount(); view.frame()
    expect(view.dom.document.activeElement).toBe(view.outside)
  })

  it('reuses an unsent owner across group entries and closes only its visible placement', async () => {
    const view = fixture(); view.state.session = undefined; view.render(); await view.drain()
    await view.type('保留未发送输入')
    await view.handle.current!.startDraft('first'); await view.drain()
    const first = view.onDraftChange.mock.lastCall![0]!
    await view.handle.current!.startDraft('second'); await view.drain()
    expect(view.onDraftChange.mock.lastCall![0]).toEqual({ ...first, groupId: 'second' })
    expect(view.text()).toBe('保留未发送输入'); expect(view.api.prepare).not.toHaveBeenCalled()
    await view.handle.current!.closeDraft('obsolete'); await view.drain()
    expect(view.onDraftChange.mock.lastCall![0]?.visible).toBe(true)
    await view.handle.current!.closeDraft(first.id); await view.drain()
    expect(view.text()).toBe('保留未发送输入')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ draft: { id: first.id, visible: false }, drafts: { draft: '保留未发送输入' } }), true)
    await view.handle.current!.startDraft('first'); await view.drain()
    expect(view.onDraftChange.mock.lastCall![0]).toEqual({ id: first.id, groupId: 'first', visible: true })
  })

  it('retains the prepared attachment owner while closing and reopening the same draft', async () => {
    const view = fixture({ attachments: true }); view.state.session = undefined; view.render(); await view.drain()
    await view.type('附件草稿'); await view.handle.current!.startDraft('first'); await view.drain()
    await view.plus(); await view.select('attach-files'); await view.drain()
    const owner = view.onDraftChange.mock.lastCall![0]!
    expect(owner).toMatchObject({ sessionId: 'created', groupId: 'first' })
    expect(view.attachmentPaths()).toEqual(['mira-attachment:fixture'])
    await view.handle.current!.closeDraft(owner.id); await view.drain()
    view.state.session = undefined; view.render(); await view.drain()
    await view.handle.current!.startDraft('second'); await view.drain()
    expect(view.api.prepare).toHaveBeenCalledOnce(); expect(view.api.open).toHaveBeenCalledExactlyOnceWith('created', undefined)
    expect(view.text()).toBe('附件草稿'); expect(view.attachmentPaths()).toEqual(['mira-attachment:fixture'])
    expect(view.onDraftChange.mock.lastCall![0]).toEqual({ ...owner, groupId: 'second', visible: true })
  })

  it('keeps the selected project when only the anonymous draft group changes', async () => {
    const view = fixture(); view.state.session = undefined; view.render(); await view.drain()
    await view.type('项目草稿'); await view.handle.current!.startDraft('first', 'project'); await view.drain()
    await view.handle.current!.startDraft('second'); await view.drain()
    await view.api.registerBeforeNavigation.mock.calls[0][0]()
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ config: expect.objectContaining({ projectId: 'project' }) }), true)
    await view.key('Enter'); expect(view.api.prepare).toHaveBeenCalledWith('project', expect.any(Function))
  })

  it('moves a prepared draft to another project while keeping its text and frozen attachment owner', async () => {
    const view = fixture({ attachments: true }); view.state.session = undefined; view.render(); await view.drain()
    await view.type('切换项目保留附件'); await view.handle.current!.startDraft('first', 'project'); await view.drain()
    await view.plus(); await view.select('attach-files'); await view.drain()
    const owner = view.onDraftChange.mock.lastCall![0]!
    await view.handle.current!.startDraft(undefined, 'other'); await view.drain()
    expect(view.api.moveSession).toHaveBeenCalledExactlyOnceWith('created', 'other')
    expect(view.api.prepare).toHaveBeenCalledOnce()
    expect(view.onDraftChange.mock.lastCall![0]).toEqual({ ...owner, groupId: undefined, visible: true })
    expect(view.text()).toBe('切换项目保留附件'); expect(view.attachmentPaths()).toEqual(['mira-attachment:fixture'])
    await view.api.registerBeforeNavigation.mock.calls[0][0]()
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ config: expect.objectContaining({ projectId: 'other' }) }), true)
  })

  it('keeps the prepared draft accessible when moving its project fails', async () => {
    const view = fixture({ attachments: true }); view.state.session = undefined; view.render(); await view.drain()
    await view.type('项目变更失败仍保留'); await view.handle.current!.startDraft('first', 'project'); await view.drain()
    await view.plus(); await view.select('attach-files'); await view.drain()
    const owner = view.onDraftChange.mock.lastCall![0]!
    view.api.moveSession.mockImplementationOnce(async () => { view.state.error = '目标目录不可用' })
    expect(await view.handle.current!.startDraft('second', 'other')).toBe(false); await view.drain()
    expect(view.onDraftChange.mock.lastCall![0]).toEqual(owner)
    expect(view.state.session?.projectId).toBe('project')
    expect(view.text()).toBe('项目变更失败仍保留'); expect(view.attachmentPaths()).toEqual(['mira-attachment:fixture'])
  })

  it('returns to an unconfirmed first submission without replacing its owner, project or captured group', async () => {
    const view = fixture({ queue: true }); view.state.session = undefined; view.render(); await view.drain()
    await view.type('尚未确认的首发'); await view.handle.current!.startDraft('first'); await view.drain()
    const receipt = deferred<boolean>(); view.api.send.mockImplementationOnce(() => receipt.promise)
    await view.key('Enter')
    const submitted = view.onDraftChange.mock.lastCall![0]!
    await view.handle.current!.closeDraft(submitted.id); await view.drain()
    expect(view.onDraftChange.mock.lastCall![0]?.visible).toBe(false)
    await view.handle.current!.startDraft('second', 'other'); await view.drain()
    expect(view.onDraftChange.mock.lastCall![0]).toEqual(submitted)
    expect(view.api.moveSession).not.toHaveBeenCalled(); expect(view.api.prepare).toHaveBeenCalledOnce()
    expect(view.text()).toBe('尚未确认的首发')
    receipt.resolve(true); await view.drain()
    expect(view.onDraftAccepted).toHaveBeenCalledExactlyOnceWith('created', submitted)
  })

  it('settles a late ACK into its captured group without clearing another open task input', async () => {
    const view = fixture({ queue: true }); view.state.session = undefined; view.render(); await view.drain()
    await view.type('第一份提交'); await view.handle.current!.startDraft('first'); await view.drain()
    const receipt = deferred<boolean>(); view.api.send.mockImplementationOnce(() => receipt.promise)
    await view.key('Enter')
    const submitted = view.onDraftChange.mock.lastCall![0]!
    expect(view.api.send).toHaveBeenCalledOnce()
    view.state.session = { ...view.state.sessions[1], messages: [], toolCalls: [] }; view.render(); await view.drain()
    await view.type('另一任务的新输入')
    receipt.resolve(true); await view.drain()
    expect(view.onDraftAccepted).toHaveBeenCalledExactlyOnceWith('created', submitted)
    expect(view.text()).toBe('另一任务的新输入'); expect(view.state.session?.id).toBe('reference')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: { reference: '另一任务的新输入' } }), true)
  })
})
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('shipped Mira Composer contextual interactions', () => {
  it('never rehydrates deleted owner text, files, recoveries or submissions from a late preference read', async () => {
    const saved = deferred<unknown>(), view = fixture({ draftPreference: saved.promise, attachments: true, queue: true })
    const remove = view.api.onSessionDeleted.mock.calls[0][0]
    remove('current'); await view.drain()
    saved.resolve({ drafts: { current: '旧草稿', reference: '保留草稿' }, fileDrafts: { current: [{ path: 'mira-attachment:old', name: 'old.png', mediaType: 'image/png' }], reference: [{ path: 'keep.md', name: 'keep.md' }] }, recoveries: { current: [queued()] }, submissions: { current: { id: 'unconfirmed', text: '旧草稿', planning: false, references: [], selection: view.state.selection } } })
    await view.drain()
    expect(view.text()).toBe(''); expect(view.attachmentPaths()).toEqual([])
    await view.api.registerBeforeNavigation.mock.calls[0][0]()
    const writes = view.api.setPreference.mock.calls as unknown as Array<[string, { drafts: Record<string, string>; fileDrafts: Record<string, unknown>; recoveries?: Record<string, unknown>; submissions?: Record<string, unknown> }]>
    const result = writes.at(-1)![1]
    expect(result.drafts).toEqual({ reference: '保留草稿' }); expect(result.fileDrafts).toEqual({ reference: [{ path: 'keep.md', name: 'keep.md' }] })
    expect(result.recoveries ?? {}).not.toHaveProperty('current'); expect(result.submissions ?? {}).not.toHaveProperty('current')
  })
  it('releases a rejected model intent so the same image can be sent with a newly selected model', async () => {
    const image = { path: 'mira-attachment:fixture', name: '截图.png', mediaType: 'image/png', size: 70 }
    const view = fixture({ attachments: true, queue: true, draftPreference: Promise.resolve({ drafts: { current: '检查图片' }, fileDrafts: { current: [image] } }) }); await view.drain()
    ;(view.attachmentProps().onBlocked as (blocked: boolean) => void)(false); await view.drain()
    view.api.send.mockResolvedValueOnce('retry-required'); view.state.error = '所选模型不支持图片输入'
    await view.key('Enter')
    expect(view.text()).toBe('检查图片'); expect(view.attachmentPaths()).toEqual([image.path])
    const rejected = view.api.send.mock.calls[0]
    view.state.selection = { providerId: 'provider', modelId: 'vision' }; view.render(); await view.drain()
    await view.key('Enter')
    expect(view.api.send.mock.calls[1][4]).toEqual(view.state.selection)
    expect(view.api.send.mock.calls[1][3]).not.toBe(rejected[3])
    expect(view.text()).toBe('')
  })

  it('never transfers an old upload failure to another task after an external owner change', async () => {
    const pending = deferred<Awaited<ReturnType<ReturnType<typeof fixture>['api']['selectAttachments']>>>(), view = fixture({ attachments: true }); await view.drain()
    view.api.selectAttachments.mockReturnValueOnce(pending.promise)
    await view.plus(); await view.select('attach-files')
    view.state.session = { ...view.state.session!, id: 'other' }; view.render(); await view.drain()
    pending.reject(new Error('旧任务已删除')); await view.drain()
    expect(view.attachmentPaths()).toEqual([])
    await expect(view.api.registerBeforeNavigation.mock.calls[0][0]()).resolves.toBeUndefined()
    await view.type('新任务内容'); expect(view.props(props => props['aria-label'] === '发送任务').disabled).toBe(false)
  })

  it('holds navigation through draft session creation and configuration before importing', async () => {
    const create = deferred<boolean>(), configuration = deferred<void>()
    const view = fixture({ attachments: true, draftPreference: Promise.resolve({ config: { permission: 'full' } }) }); await view.drain()
    view.state.session = undefined; view.render(); await view.drain(); await view.type('新任务草稿')
    view.api.prepare.mockImplementationOnce(async () => { await create.promise; view.state.session = { version: 1, id: 'created', title: 'Created', draftState: 'prepared', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false }; return true })
    view.api.setSessionPermission.mockReturnValueOnce(configuration.promise)
    await view.plus(); await view.select('attach-files')
    let completed = false
    const flush = view.api.registerBeforeNavigation.mock.calls[0][0]().then(() => { completed = true })
    await view.drain(); expect(completed).toBe(false); expect(view.api.selectAttachments).not.toHaveBeenCalled()
    create.resolve(true); await view.drain(); expect(completed).toBe(false)
    expect(view.api.setSessionPermission).toHaveBeenCalledWith('created', 'full')
    configuration.resolve(); await view.drain(); await flush
    expect(view.api.selectAttachments).toHaveBeenCalledWith('created')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: expect.objectContaining({ created: '新任务草稿' }), fileDrafts: expect.objectContaining({ created: [expect.objectContaining({ path: 'mira-attachment:fixture' })] }) }), true)
  })

  it('keeps a newly created task visible when its pending import fails during navigation', async () => {
    const create = deferred<boolean>(), view = fixture({ attachments: true }); await view.drain()
    view.state.session = undefined; view.render(); await view.drain()
    view.api.prepare.mockImplementationOnce(async () => { await create.promise; view.state.session = { version: 1, id: 'created', title: 'Created', draftState: 'prepared', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false }; return true })
    view.api.selectAttachments.mockRejectedValueOnce(new Error('文件读取失败'))
    await view.plus(); await view.select('attach-files')
    const guarded = expect(view.api.registerBeforeNavigation.mock.calls[0][0]()).rejects.toThrow('附件尚未添加成功')
    create.resolve(true); await view.drain(); await guarded
    expect(view.props(props => props.role === 'alert').children).toBeDefined()
    expect(view.props(props => props['aria-label'] === '取消附件添加')).toBeDefined()
  })

  it('blocks a newly added reference immediately and freezes workspace references before displaying them', async () => {
    const staging = deferred<Awaited<ReturnType<ReturnType<typeof fixture>['api']['stageAttachment']>>>()
    const view = fixture({ attachments: true, queue: true }); await view.drain(); await view.type('检查文件')
    view.api.stageAttachment.mockReturnValueOnce(staging.promise)
    view.handle.current!.addFileReference('current', 'src/mira.ts'); await view.drain()
    expect(view.api.stageAttachment).toHaveBeenCalledWith('current', 'src/mira.ts')
    await view.key('Enter'); expect(view.api.send).not.toHaveBeenCalled()
    staging.resolve({ path: 'mira-attachment:staged', name: 'mira.ts', size: 20 }); await view.drain()
    expect(view.attachmentPaths()).toEqual(['mira-attachment:staged'])
    await view.key('Enter'); expect(view.api.send).not.toHaveBeenCalled()
    ;(view.attachmentProps().onBlocked as (blocked: boolean) => void)(false); await view.drain()
    await view.key('Enter'); expect(view.api.send).toHaveBeenCalledWith('检查文件', false, [{ path: 'mira-attachment:staged', name: 'mira.ts', size: 20 }], expect.any(String), expect.any(Object))
  })

  it('retries a failed draft read while preserving local input and blocking file admission', async () => {
    const preference = deferred<unknown>(), view = fixture({ attachments: true, draftPreference: preference.promise })
    await view.type('读取期间的新输入'); preference.reject(new Error('偏好不可读')); await view.drain()
    expect(view.props(props => props['aria-label'] === '添加上下文').disabled).toBe(true)
    await expect(view.api.registerBeforeNavigation.mock.calls[0][0]()).rejects.toThrow('偏好不可读')
    view.api.getPreference.mockResolvedValueOnce({ drafts: { other: '历史草稿' } })
    ;(view.props(props => props.children === '重试读取草稿').onClick as () => void)(); await view.drain()
    expect(view.text()).toBe('读取期间的新输入')
    expect(view.props(props => props['aria-label'] === '添加上下文').disabled).toBe(false)
    await expect(view.api.registerBeforeNavigation.mock.calls[0][0]()).resolves.toBeUndefined()
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: { current: '读取期间的新输入', other: '历史草稿' } }), true)
  })

  it('waits for native attachment staging before saving and entering settings', async () => {
    const pending = deferred<Awaited<ReturnType<ReturnType<typeof fixture>['api']['selectAttachments']>>>()
    const view = fixture({ attachments: true, queue: true }); await view.drain()
    view.api.selectAttachments.mockReturnValueOnce(pending.promise)
    await view.plus(); await view.select('attach-files')
    expect(view.api.selectAttachments).toHaveBeenCalledWith('current')
    const guard = view.api.registerBeforeNavigation.mock.calls[0][0]
    let completed = false; const flush = guard().then(() => { completed = true })
    await view.drain(); expect(completed).toBe(false)
    pending.resolve([{ path: 'mira-attachment:fixture', name: '截图.png', mediaType: 'image/png', size: 70 }]); await view.drain(); await flush
    expect(view.attachmentPaths()).toEqual(['mira-attachment:fixture'])
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ fileDrafts: { current: [expect.objectContaining({ mediaType: 'image/png' })] } }), true)
  })

  it('blocks sending and leaving after failed attachment staging until retry succeeds or the user cancels', async () => {
    const view = fixture({ attachments: true, queue: true }); await view.drain(); await view.type('原草稿')
    view.api.selectAttachments.mockRejectedValueOnce(new Error('图片无法读取'))
    await view.plus(); await view.select('attach-files')
    expect(view.text()).toBe('原草稿')
    expect(view.props(props => props['aria-label'] === '发送任务').disabled).toBe(true)
    await expect(view.api.registerBeforeNavigation.mock.calls[0][0]()).rejects.toThrow('附件尚未添加成功')
    await view.key('Enter'); expect(view.api.send).not.toHaveBeenCalled()
    ;(view.props(props => props['aria-label'] === '取消附件添加').onClick as () => void)(); await view.drain()
    await expect(view.api.registerBeforeNavigation.mock.calls[0][0]()).resolves.toBeUndefined()
    expect(view.props(props => props['aria-label'] === '发送任务').disabled).toBe(false)
  })

  it('preserves spreadsheet text over its generated clipboard image and converts large plain pastes to files', async () => {
    const view = fixture({ attachments: true }); await view.drain()
    const nativePaste = { clipboardData: { getData: (type: string) => type === 'text/plain' ? 'A\tB' : '<table><tr><td>A</td></tr></table>', files: [new File(['image'], 'table.png', { type: 'image/png' })] }, preventDefault: vi.fn() }
    ;(view.inputProps().onPaste as (event: unknown) => void)(nativePaste)
    expect(nativePaste.preventDefault).not.toHaveBeenCalled(); expect(view.api.importAttachments).not.toHaveBeenCalled()
    vi.stubGlobal('FileReader', class { result = 'data:text/plain;base64,cGFzdGU='; onload?: () => void; readAsDataURL() { Promise.resolve().then(() => this.onload?.()) } })
    const longPaste = { clipboardData: { getData: (type: string) => type === 'text/plain' ? '原文'.repeat(8000) : '', files: [] }, preventDefault: vi.fn() }
    ;(view.inputProps().onPaste as (event: unknown) => void)(longPaste); await view.drain()
    expect(longPaste.preventDefault).toHaveBeenCalledOnce()
    expect(view.api.importAttachments).toHaveBeenCalledWith('current', [{ name: '粘贴的文本.txt', mediaType: 'text/plain', data: 'cGFzdGU=' }])
    expect(view.attachmentPaths()).toEqual(['mira-attachment:paste'])
  })

  it('handles file drops on the Composer and never imports while hidden', async () => {
    const view = fixture({ attachments: true }); await view.drain()
    vi.stubGlobal('FileReader', class { result = 'data:text/plain;base64,dGV4dA=='; onload?: () => void; readAsDataURL() { Promise.resolve().then(() => this.onload?.()) } })
    const drop = { dataTransfer: { types: ['Files'], files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] }, preventDefault: vi.fn() }
    ;(view.props((_, element) => element.type === 'form').onDrop as (event: unknown) => void)(drop); await view.drain()
    expect(drop.preventDefault).toHaveBeenCalledOnce(); expect(view.api.importAttachments).toHaveBeenCalledWith('current', [{ name: 'notes.txt', mediaType: 'text/plain', data: 'dGV4dA==' }])
    await view.setActive(false)
    ;(view.props((_, element) => element.type === 'form').onDrop as (event: unknown) => void)(drop); await view.drain()
    expect(view.api.importAttachments).toHaveBeenCalledTimes(1)
  })
  it('sends an attachment-only idle draft and preserves attachment-only retry metadata', async () => {
    const image = { path: 'mira-attachment:fixture', name: '截图.png', mediaType: 'image/png', size: 70 }
    const view = fixture({ queue: true, draftPreference: Promise.resolve({ fileDrafts: { current: [image] } }) }); await view.drain()
    expect(view.text()).toBe('')
    expect(view.props(props => props['aria-label'] === '发送任务').disabled).toBe(false)
    view.api.send.mockResolvedValueOnce(false)
    await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledWith('', false, [image], expect.any(String), expect.any(Object))
    expect(view.attachmentPaths()).toEqual([image.path])
    const id = view.api.send.mock.calls[0][3]
    await view.key('Enter')
    expect(view.api.send.mock.calls[1][3]).toBe(id)
  })

  it('queues an attachment-only running draft and exposes Stop only after the references are gone', async () => {
    const view = fixture({ queue: true, draftPreference: Promise.resolve({ fileDrafts: { current: [{ path: 'only.md', name: 'only.md' }] } }) }); await view.drain()
    view.state.running = true; view.render(); await view.drain()
    expect(view.props(props => props['aria-label'] === '加入待发送').disabled).toBe(false)
    await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledWith('', false, [{ path: 'only.md', name: 'only.md' }], expect.any(String), expect.any(Object))
    expect(view.props(props => props['aria-label'] === '停止任务')).toBeDefined()
  })
  it('sends plain running input as a real guide intent and keeps the default empty-input Stop', async () => {
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide' }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'guide-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    expect(view.props(props => props['aria-label'] === '停止任务')).toBeDefined()
    const text = '指导当前运行：先保留原始资料，再逐项核对。'.repeat(200)
    await view.type(text)
    expect(view.props(props => props['aria-label'] === '引导当前任务').disabled).toBe(false)
    await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledExactlyOnceWith(text, false, [], expect.any(String), view.state.selection, { delivery: 'guide', expectedRunId: 'guide-run' })
    expect(view.text()).toBe(''); expect(view.props(props => props['aria-label'] === '停止任务')).toBeDefined()
  })

  it.each(['ctrlKey', 'metaKey'])('reverses guide to ordinary queue with %s+Enter, never immediate', async modifier => {
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide' }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'guide-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('等待下一任务'); await view.key('Enter', { [modifier]: true })
    expect(view.api.send).toHaveBeenCalledExactlyOnceWith('等待下一任务', false, [], expect.any(String), view.state.selection, { expectedRunId: 'guide-run' })
    expect(view.api.sendQueuedMessageNow).not.toHaveBeenCalled()
  })

  it('updates the guide pointer hint with the primary modifier and never carries it to another click', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide' }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'guide-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('下一任务'); await view.dispatch('Meta', { metaKey: true })
    expect(view.props(props => props['aria-label'] === '加入待发送').disabled).toBe(false)
    await view.formSubmit({ metaKey: true }); expect(view.api.send.mock.calls[0]?.[5]).toEqual({ expectedRunId: 'guide-run' })
    listeners.get('blur')?.forEach(listener => listener(event('blur'))); await view.drain()
    await view.type('继续指导'); await view.formSubmit(); expect(view.api.send.mock.calls[1]?.[5]).toEqual({ delivery: 'guide', expectedRunId: 'guide-run' })
  })

  it('retains guide IME, Shift, idle and legacy-host behavior without manufacturing a guide', async () => {
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide' }); await view.drain(); await view.type('空闲首发')
    await view.key('Enter'); expect(view.api.send.mock.calls[0]).toHaveLength(5)
    view.state.running = true; view.state.session!.activeRun = { id: 'guide-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('输入法草稿'); await view.key('Enter', { isComposing: true }); await view.key('Enter', { keyCode: 229 }); await view.key('Enter', { ctrlKey: true, shiftKey: true })
    expect(view.api.send).toHaveBeenCalledTimes(1); expect(view.text()).toBe('输入法草稿')
    view.api.supportsQueueSubmissionOptions = false; view.render(); await view.drain(); await view.key('Enter')
    expect(view.api.send.mock.calls[1]).toHaveLength(5)
  })

  it('passes attachments, planning and captured model through guide admission for an honest backend fallback', async () => {
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide', search: async () => ({ entries: [{ path: 'guide.md', name: 'guide.md', type: 'file' }], truncated: false }) }); await view.drain()
    await view.type('@guide'); await vi.advanceTimersByTimeAsync(120); await view.drain(); await view.select('file-guide.md')
    await view.append('/plan'); await view.select('command-plan'); await view.append('带完整配置的指导')
    view.state.running = true; view.state.session!.activeRun = { id: 'guide-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain(); await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledExactlyOnceWith('@guide.md 带完整配置的指导', true, [{ path: 'guide.md', name: 'guide.md' }], expect.any(String), view.state.selection, { delivery: 'guide', expectedRunId: 'guide-run' })
  })

  it('freezes guide ID and target across uncertain ACK and reload instead of converting to immediate', async () => {
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide' }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'original-guide-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('未知确认的指导'); view.api.send.mockResolvedValueOnce(false); await view.key('Enter'); const original = view.api.send.mock.calls[0]
    expect(view.text()).toBe('未知确认的指导')
    expect(view.api.setPreference).toHaveBeenCalledWith('harness-react-composer-drafts', expect.objectContaining({ submissions: { current: expect.objectContaining({ options: { delivery: 'guide', expectedRunId: 'original-guide-run' } }) } }), true)
    view.state.session!.activeRun = { ...view.state.session!.activeRun!, id: 'new-run' }; view.state.selection = { ...view.state.selection!, thinkingLevel: 'high' }; view.render(); await view.drain()
    await view.key('Enter', { ctrlKey: true }); expect(view.api.send.mock.calls[1]).toEqual(original)
  })

  it('restores a durable guide intent with its original target after reload', async () => {
    const submission = { id: 'durable-guide', text: '重载指导', references: [], planning: false, selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'medium' }, options: { delivery: 'guide', expectedRunId: 'original-run' } }
    const view = fixture({ queue: true, submissionOptions: true, draftPreference: Promise.resolve({ drafts: { current: submission.text }, submissions: { current: submission } }) }); await view.drain(); await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledExactlyOnceWith(submission.text, false, [], submission.id, submission.selection, submission.options)
  })

  it('refreshes the follow-up preference when returning from settings without replacing the draft', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'same-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain(); await view.type('设置返回后的正文')
    await view.setActive(false)
    view.api.getComposerPreferences.mockResolvedValueOnce({ sendShortcut: 'enter', showContextUsage: true, followupMode: 'guide' })
    await view.setActive(true)
    expect(view.text()).toBe('设置返回后的正文'); expect(view.props(props => props['aria-label'] === '引导当前任务')).toBeDefined()
    await view.key('Enter'); expect(view.api.send.mock.calls[0]?.[5]).toEqual({ delivery: 'guide', expectedRunId: 'same-run' })
  })

  it('captures the guide target before durable save and does not silently follow a new run', async () => {
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide' }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'clicked-guide-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain(); await view.type('指导原任务')
    const saving = deferred<void>(); view.api.setPreference.mockReturnValueOnce(saving.promise); await view.key('Enter')
    expect(view.api.send).not.toHaveBeenCalled()
    view.state.session!.activeRun = { ...view.state.session!.activeRun!, id: 'later-run' }; view.render(); await view.drain(); saving.resolve(); await view.drain()
    expect(view.api.send.mock.calls[0]?.[5]).toEqual({ delivery: 'guide', expectedRunId: 'clicked-guide-run' })
  })

  it('keeps an uncertain guide target frozen even while a running identity is temporarily missing', async () => {
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide' }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'original-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain(); await view.type('未知确认不改路由')
    view.api.send.mockResolvedValueOnce(false); await view.key('Enter'); const original = view.api.send.mock.calls[0]
    view.state.session!.activeRun = undefined; view.render(); await view.drain(); await view.key('Enter')
    expect(view.api.send.mock.calls[1]).toEqual(original)
  })

  it('protects new draft text from a late guide ACK and resamples only after explicit stale-run rejection', async () => {
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide' }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'first-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    const ack = deferred<boolean>(); view.api.send.mockReturnValueOnce(ack.promise); await view.type('第一条指导'); await view.key('Enter')
    await view.type('晚确认期间的新草稿'); ack.resolve(true); await view.drain(); expect(view.text()).toBe('晚确认期间的新草稿')
    view.api.send.mockImplementationOnce(async () => { view.state.session!.activeRun = { ...view.state.session!.activeRun!, id: 'new-run' }; return 'retry-required' })
    await view.key('Enter'); const rejected = view.api.send.mock.calls[1]
    expect(view.text()).toBe('晚确认期间的新草稿'); await view.key('Enter')
    expect(view.api.send.mock.calls[2]?.[3]).not.toBe(rejected?.[3]); expect(view.api.send.mock.calls[2]?.[5]).toEqual({ delivery: 'guide', expectedRunId: 'new-run' })
  })

  it('withdraws a pending guide into durable recovery without overriding an occupied draft', async () => {
    const view = fixture({ queue: true, submissionOptions: true, followupMode: 'guide' }); await view.drain()
    const guide = { ...queued(), delivery: 'guide' as const, targetRunId: 'run', text: '撤回的指导', references: [], planning: false }
    view.state.queue = { sessionId: 'current', revision: 1, items: [guide] }; view.api.withdrawMessage.mockResolvedValueOnce({ item: guide, queue: { sessionId: 'current', revision: 2, items: [] } }); view.render(); await view.drain()
    await view.type('正在编辑的正文'); await view.handle.current!.withdrawPendingGuide(guide.id); await view.drain()
    expect(view.api.withdrawMessage).toHaveBeenCalledExactlyOnceWith('current', guide.id)
    expect(view.text()).toBe('正在编辑的正文'); expect(view.queueProps().recoveries).toEqual([guide]); expect(view.api.select).not.toHaveBeenCalled()
    await view.type(''); await (view.queueProps().onRestore as (id: string) => void)(guide.id); await view.drain(); expect(view.text()).toBe(guide.text)
  })

  it('blocks consumed/promoting/stale guide withdrawal and cannot recover from a failed ACK', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    const guide = { ...queued(), delivery: 'guide' as const, targetRunId: 'run' }
    view.state.queue = { sessionId: 'current', revision: 1, items: [guide], promotingItemId: guide.id }; view.render(); await view.drain()
    await view.handle.current!.withdrawPendingGuide(guide.id); expect(view.api.withdrawMessage).not.toHaveBeenCalled()
    view.state.queue.promotingItemId = undefined; view.api.withdrawMessage.mockRejectedValueOnce(new Error('消息已消费')); view.render(); await view.drain()
    await view.handle.current!.withdrawPendingGuide(guide.id); await view.drain()
    expect(view.queueProps().recoveries).toEqual([]); expect(view.text()).toBe('')
    view.state.queue.items = []; view.render(); await view.drain(); await view.handle.current!.withdrawPendingGuide(guide.id)
    expect(view.api.withdrawMessage).toHaveBeenCalledTimes(1)
  })

  it('saves a late guide withdrawal only for its original owner after navigating away', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    const guide = { ...queued(), delivery: 'guide' as const, targetRunId: 'run' }, ack = deferred<Awaited<ReturnType<typeof view.api.withdrawMessage>>>()
    view.state.queue = { sessionId: 'current', revision: 1, items: [guide] }; view.api.withdrawMessage.mockReturnValueOnce(ack.promise); view.render(); await view.drain()
    const withdrawal = view.handle.current!.withdrawPendingGuide(guide.id)
    view.state.session = { ...view.state.session!, id: 'next' }; view.state.queue = undefined; view.render(); await view.drain(); await view.type('另一会话的新正文')
    ack.resolve({ item: guide, queue: { sessionId: 'current', revision: 2, items: [] } }); await withdrawal; await view.drain()
    expect(view.text()).toBe('另一会话的新正文'); expect(view.api.select).not.toHaveBeenCalled()
    expect(view.api.setPreference).toHaveBeenCalledWith('harness-react-composer-drafts', expect.objectContaining({ recoveries: { current: [expect.objectContaining({ id: guide.id, sessionId: 'current', text: guide.text })] } }), true)
    view.state.session = { ...view.state.session!, id: 'current' }; view.render(); await view.drain(); expect(view.queueProps().recoveries).toEqual([guide]); expect(view.text()).toBe('')
  })

  it.each(['ctrlKey', 'metaKey'])('submits %s+Enter as one atomic immediate intent with the clicked run identity', async modifier => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'clicked-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('立即开始新任务'); await view.key('Enter', { [modifier]: true })
    expect(view.api.send).toHaveBeenCalledExactlyOnceWith('立即开始新任务', false, [], expect.any(String), view.state.selection, { delivery: 'immediate', expectedRunId: 'clicked-run' })
    expect(view.api.sendQueuedMessageNow).not.toHaveBeenCalled()
    expect(view.text()).toBe('')
  })

  it.each(['ctrlKey', 'metaKey'])('preserves upstream modified Enter semantics with Alt and %s held', async modifier => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'clicked-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('与上游修饰键规则一致'); await view.key('Enter', { [modifier]: true, altKey: true })
    expect(view.api.send).toHaveBeenCalledExactlyOnceWith('与上游修饰键规则一致', false, [], expect.any(String), view.state.selection, { delivery: 'immediate', expectedRunId: 'clicked-run' })
  })

  it('shows the held primary modifier label and uses it on pointer send without leaking to the next click', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('修饰键发送'); await view.dispatch('Meta', { metaKey: true })
    expect(view.props(props => props['aria-label'] === '立即发送').disabled).toBe(false)
    await view.formSubmit({ metaKey: true })
    expect(view.api.send.mock.calls[0]?.[5]).toEqual({ delivery: 'immediate', expectedRunId: 'run' })
    listeners.get('blur')?.forEach(listener => listener(event('blur'))); await view.drain()
    await view.type('普通入队'); await view.formSubmit()
    expect(view.api.send.mock.calls[1]).toHaveLength(5)
  })

  it('uses Ctrl for the non-Apple pointer modifier and ignores Meta-only pointer delivery', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('不是主修饰键'); await view.formSubmit({ metaKey: true })
    expect(view.api.send.mock.calls[0]).toHaveLength(5)
    await view.type('主修饰键发送'); await view.formSubmit({ ctrlKey: true })
    expect(view.api.send.mock.calls[1]?.[5]).toEqual({ delivery: 'immediate', expectedRunId: 'run' })
  })

  it('retains mod-enter preferences and never sends Shift-modified or composing Enter', async () => {
    const view = fixture({ queue: true, submissionOptions: true, preference: 'mod-enter' }); await view.drain(); await view.type('输入法草稿')
    await view.key('Enter'); await view.key('Enter', { ctrlKey: true, shiftKey: true }); await view.key('Enter', { metaKey: true, isComposing: true }); await view.key('Enter', { ctrlKey: true, keyCode: 229 })
    expect(view.api.send).not.toHaveBeenCalled(); expect(view.text()).toBe('输入法草稿')
    await view.key('Enter', { ctrlKey: true })
    expect(view.api.send.mock.calls[0]?.[5]).toEqual({ delivery: 'immediate', expectedRunId: null })
  })

  it('does not synthesize immediate delivery for a legacy queue host or a missing running identity', async () => {
    const view = fixture({ queue: true }); await view.drain(); view.state.running = true; view.render(); await view.drain(); await view.type('兼容宿主')
    await view.key('Enter', { ctrlKey: true }); expect(view.api.send.mock.calls[0]).toHaveLength(5)
    view.api.supportsQueueSubmissionOptions = true; view.render(); await view.drain(); await view.type('身份未同步')
    await view.key('Enter', { ctrlKey: true })
    expect(view.api.send).toHaveBeenCalledTimes(1); expect(view.text()).toBe('身份未同步')
    expect(view.props(props => props.role === 'alert').children).toBeDefined()
  })

  it('opens paused queue confirmation only on an authoritative response and cancels without queue actions', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued()], paused: 'stopped' }; view.render(); await view.drain()
    expect(view.dialogProps().open).toBe(false)
    await view.type('新消息'); view.api.send.mockResolvedValueOnce('confirmation-required'); await view.key('Enter')
    expect(view.dialogProps().open).toBe(true); expect(view.text()).toBe('新消息')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.not.objectContaining({ submissions: expect.anything() }), true)
    await view.dispatch('Escape'); expect(view.api.stop).not.toHaveBeenCalled()
    await view.cancel()
    expect(view.dialogProps().open).toBe(false); expect(view.text()).toBe('新消息')
    expect(view.api.send).toHaveBeenCalledTimes(1); expect(view.api.withdrawMessage).not.toHaveBeenCalled(); expect(view.api.resumeMessageQueue).not.toHaveBeenCalled()
  })

  it.each(['retain', 'discard'] as const)('confirms paused queue %s atomically using latest draft and model with frozen queue identities', async decision => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued(), queued('queued-2')], paused: 'stopped' }; view.render(); await view.drain()
    await view.type('确认前正文'); view.api.send.mockResolvedValueOnce('confirmation-required'); await view.key('Enter')
    await view.type('确认时最新正文'); view.state.selection = { ...view.state.selection!, thinkingLevel: 'high' }; view.render(); await view.drain()
    await view.confirm(decision)
    expect(view.api.send).toHaveBeenLastCalledWith('确认时最新正文', false, [], expect.any(String), expect.objectContaining({ thinkingLevel: 'high' }), { pausedQueueDecision: decision, expectedQueueRevision: 4, expectedQueueItemIds: ['queued-1', 'queued-2'], expectedRunId: null })
    expect(view.api.sendQueuedMessageNow).not.toHaveBeenCalled(); expect(view.api.withdrawMessage).not.toHaveBeenCalled(); expect(view.api.resumeMessageQueue).not.toHaveBeenCalled()
    expect(view.text()).toBe(''); expect(view.dialogProps().open).toBe(false)
  })

  it('requires a fresh confirmation when authority rejects stale queue identities', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued()], paused: 'stopped' }; view.render(); await view.drain()
    await view.type('不要误清新消息'); view.api.send.mockResolvedValueOnce('confirmation-required'); await view.key('Enter')
    view.api.send.mockImplementationOnce(async () => { view.state.queue = { sessionId: 'current', revision: 7, items: [queued('queued-new')], paused: 'stopped' }; return 'confirmation-required' })
    await view.confirm('discard')
    expect(view.dialogProps().open).toBe(true); expect(view.text()).toBe('不要误清新消息')
    expect(view.api.send.mock.calls[1]?.[5]).toMatchObject({ expectedQueueRevision: 4, expectedQueueItemIds: ['queued-1'] })
    await view.confirm('discard')
    expect(view.api.send.mock.calls[2]?.[5]).toMatchObject({ expectedQueueRevision: 7, expectedQueueItemIds: ['queued-new'] })
    expect(view.dialogProps().open).toBe(false)
  })

  it('keeps confirmation pending protected, preserves new text on late ACK and returns focus to the composer', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued()], paused: 'stopped' }; view.render(); await view.drain()
    await view.type('已确认发送'); view.api.send.mockResolvedValueOnce('confirmation-required'); await view.key('Enter')
    const ack = deferred<boolean>(); view.api.send.mockReturnValueOnce(ack.promise); await view.confirm('retain')
    const escape = { preventDefault: vi.fn() }
    ;(view.props(props => props['data-testid'] === 'mira-paused-queue-confirmation').onEscapeKeyDown as (event: unknown) => void)(escape)
    expect(escape.preventDefault).toHaveBeenCalledOnce()
    await view.cancel(); await view.confirm('discard'); expect(view.api.send).toHaveBeenCalledTimes(2)
    expect(view.dialogProps().open).toBe(true)
    await view.type('等待期间新草稿'); ack.resolve(true); await view.drain()
    expect(view.dialogProps().open).toBe(false); expect(view.text()).toBe('等待期间新草稿')
    ;(view.props(props => props['data-testid'] === 'mira-paused-queue-confirmation').onCloseAutoFocus as (event: unknown) => void)({ preventDefault: vi.fn() })
    expect(view.editorElement.focus).toHaveBeenCalled()
  })

  it('closes hidden confirmations and rejects their old callbacks without changing another session', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued()], paused: 'stopped' }; view.render(); await view.drain()
    await view.type('会话A的正文'); view.api.send.mockResolvedValueOnce('confirmation-required'); await view.key('Enter')
    const staleConfirm = view.props(props => props.className === 'mira-composer-confirm__discard').onClick as () => void
    await view.setActive(false); expect(view.dialogProps().open).toBe(false); staleConfirm(); await view.drain(); expect(view.api.send).toHaveBeenCalledTimes(1)
    await view.setActive(true); staleConfirm(); await view.drain(); expect(view.api.send).toHaveBeenCalledTimes(1)
    view.state.session = { ...view.state.session!, id: 'next' }; view.state.queue = undefined; view.render(); await view.drain(); await view.type('会话B的正文')
    staleConfirm(); await view.drain()
    expect(view.api.send).toHaveBeenCalledTimes(1); expect(view.text()).toBe('会话B的正文'); expect(view.dialogProps().open).toBe(false)
  })

  it('persists and retries the original immediate intent and never clears on a false response', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'original-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('失败后重试'); view.api.send.mockResolvedValueOnce(false); await view.key('Enter', { metaKey: true })
    expect(view.text()).toBe('失败后重试'); const original = view.api.send.mock.calls[0]
    expect(view.api.setPreference).toHaveBeenCalledWith('harness-react-composer-drafts', expect.objectContaining({ submissions: { current: expect.objectContaining({ options: { delivery: 'immediate', expectedRunId: 'original-run' } }) } }), true)
    view.state.session!.activeRun = { ...view.state.session!.activeRun!, id: 'new-run' }; view.state.selection = { ...view.state.selection!, thinkingLevel: 'high' }; view.render(); await view.drain()
    await view.key('Enter')
    expect(view.api.send.mock.calls[1]).toEqual(original)
  })

  it('captures immediate run identity before awaiting durable intent persistence', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'clicked-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('保存后仍是同一意图')
    const saving = deferred<void>(); view.api.setPreference.mockReturnValueOnce(saving.promise); await view.key('Enter', { ctrlKey: true })
    expect(view.api.send).not.toHaveBeenCalled()
    view.state.session!.activeRun = { ...view.state.session!.activeRun!, id: 'later-run' }; view.render(); await view.drain()
    saving.resolve(); await view.drain()
    expect(view.api.send.mock.calls[0]?.[5]).toEqual({ delivery: 'immediate', expectedRunId: 'clicked-run' })
  })

  it('starts a new intent after an explicit pre-admission run rejection without changing the body', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'clicked-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('正文不变也可以重试')
    view.api.send.mockImplementationOnce(async () => { view.state.session!.activeRun = { ...view.state.session!.activeRun!, id: 'new-authority-run' }; view.state.error = '当前任务已变化，请重新发送'; return 'retry-required' })
    await view.key('Enter', { ctrlKey: true }); const originalId = view.api.send.mock.calls[0]?.[3]
    expect(view.text()).toBe('正文不变也可以重试')
    await view.key('Enter', { ctrlKey: true })
    expect(view.api.send.mock.calls[1]?.[3]).not.toBe(originalId)
    expect(view.api.send.mock.calls[1]?.[5]).toEqual({ delivery: 'immediate', expectedRunId: 'new-authority-run' })
  })

  it('closes an explicitly rejected paused confirmation and samples the next send as a new intent', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued()], paused: 'stopped' }; view.render(); await view.drain()
    await view.type('任务已变化，正文保留'); view.api.send.mockResolvedValueOnce('confirmation-required'); await view.key('Enter')
    view.api.send.mockImplementationOnce(async () => { view.state.running = true; view.state.session!.activeRun = { id: 'new-authority-run', startedAt: 1, activities: [], subtasks: [] }; return 'retry-required' })
    await view.confirm('retain'); const rejectedId = view.api.send.mock.calls[1]?.[3]
    expect(view.dialogProps().open).toBe(false); expect(view.text()).toBe('任务已变化，正文保留')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: { current: '任务已变化，正文保留' } }), true)
    expect(view.api.setPreference.mock.lastCall?.[1]).not.toHaveProperty('submissions')
    await view.key('Enter', { ctrlKey: true })
    expect(view.api.send.mock.calls[2]?.[3]).not.toBe(rejectedId)
    expect(view.api.send.mock.calls[2]?.[5]).toEqual({ delivery: 'immediate', expectedRunId: 'new-authority-run' })
  })

  it('blocks resampling a rejected intent until clearing its durable submission succeeds', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.running = true; view.state.session!.activeRun = { id: 'clicked-run', startedAt: 1, activities: [], subtasks: [] }; view.render(); await view.drain()
    await view.type('持久清理失败也不吃稿')
    view.api.send.mockImplementationOnce(async () => { view.api.setPreference.mockRejectedValueOnce(new Error('清理保存断开')); view.state.session!.activeRun = { ...view.state.session!.activeRun!, id: 'new-run' }; return 'retry-required' })
    await view.key('Enter', { ctrlKey: true })
    expect(view.text()).toBe('持久清理失败也不吃稿'); expect(view.queueProps().recoveryBlocked).toBe(true)
    await view.key('Enter', { ctrlKey: true }); expect(view.api.send).toHaveBeenCalledTimes(1)
    await (view.queueProps().onRetrySave as () => Promise<void>)(); await view.drain(); await view.key('Enter', { ctrlKey: true })
    expect(view.api.send.mock.calls[1]?.[3]).not.toBe(view.api.send.mock.calls[0]?.[3])
    expect(view.api.send.mock.calls[1]?.[5]).toEqual({ delivery: 'immediate', expectedRunId: 'new-run' })
  })

  it('clears only a late explicitly rejected owner and preserves another session retry intent', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    await view.type('原会话不被接纳'); const rejection = deferred<'retry-required'>(); view.api.send.mockReturnValueOnce(rejection.promise); await view.key('Enter')
    view.state.session = { ...view.state.session!, id: 'next' }; view.render(); await view.drain(); await view.type('新会话未知响应保留')
    view.api.send.mockResolvedValueOnce(false); await view.key('Enter'); const nextIntent = view.api.send.mock.calls[1]
    rejection.resolve('retry-required'); await view.drain()
    expect(view.text()).toBe('新会话未知响应保留')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: { current: '原会话不被接纳', next: '新会话未知响应保留' }, submissions: { next: expect.objectContaining({ id: nextIntent?.[3] }) } }), true)
    await view.key('Enter'); expect(view.api.send.mock.calls[2]).toEqual(nextIntent)
  })

  it('does not open a late confirmation result over a newly selected session', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued()], paused: 'stopped' }; view.render(); await view.drain(); await view.type('等待原会话响应')
    const result = deferred<'confirmation-required'>(); view.api.send.mockReturnValueOnce(result.promise); await view.key('Enter')
    view.state.session = { ...view.state.session!, id: 'next' }; view.state.queue = undefined; view.render(); await view.drain(); await view.type('新会话继续')
    result.resolve('confirmation-required'); await view.drain()
    expect(view.dialogProps().open).toBe(false); expect(view.text()).toBe('新会话继续')
    view.state.session = { ...view.state.session!, id: 'current' }; view.render(); await view.drain()
    expect(view.text()).toBe('等待原会话响应')
  })

  it('restores the full atomic intent after reload instead of changing delivery or confirmed queue membership', async () => {
    const submission = { id: 'durable-atomic', text: '重载后原子重试', references: [], planning: false, selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'medium' }, options: { delivery: 'immediate', expectedRunId: 'original-run', pausedQueueDecision: 'retain', expectedQueueRevision: 7, expectedQueueItemIds: ['queued-1'] } }
    const view = fixture({ queue: true, submissionOptions: true, draftPreference: Promise.resolve({ drafts: { current: submission.text }, submissions: { current: submission } }) }); await view.drain(); await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledExactlyOnceWith(submission.text, false, [], submission.id, submission.selection, submission.options)
  })

  it('keeps a rejected confirmation open with the exact durable intent until retry or cancel', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued()], paused: 'failed' }; view.render(); await view.drain()
    await view.type('失败不能吃稿'); view.api.send.mockResolvedValueOnce('confirmation-required'); await view.key('Enter')
    view.api.send.mockResolvedValueOnce(false); await view.confirm('discard')
    expect(view.dialogProps().open).toBe(true); expect(view.text()).toBe('失败不能吃稿')
    expect(view.props(props => props.className === 'mira-composer-confirm__error').children).toBe('发送失败，请重试')
    const original = view.api.send.mock.calls[1]
    await view.confirm('discard')
    expect(view.api.send.mock.calls[2]).toEqual(original); expect(view.dialogProps().open).toBe(false)
  })

  it('cleans only the confirmed owner on a cross-session ACK and leaves the new session and draft untouched', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued()], paused: 'stopped' }; view.render(); await view.drain()
    await view.type('原会话确认发送'); view.api.send.mockResolvedValueOnce('confirmation-required'); await view.key('Enter')
    const ack = deferred<boolean>(); view.api.send.mockReturnValueOnce(ack.promise); await view.confirm('retain')
    view.state.session = { ...view.state.session!, id: 'next' }; view.state.queue = undefined; view.render(); await view.drain(); await view.type('下一会话保留')
    ack.resolve(true); await view.drain()
    expect(view.dialogProps().open).toBe(false); expect(view.text()).toBe('下一会话保留')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: { next: '下一会话保留' } }), true)
  })

  it('does not submit a confirmation until its draft intent is durable', async () => {
    const view = fixture({ queue: true, submissionOptions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 4, items: [queued()], paused: 'stopped' }; view.render(); await view.drain()
    await view.type('保留未保存意图'); view.api.send.mockResolvedValueOnce('confirmation-required'); await view.key('Enter')
    view.api.setPreference.mockRejectedValueOnce(new Error('意图保存断开')); await view.confirm('discard')
    expect(view.api.send).toHaveBeenCalledTimes(1); expect(view.text()).toBe('保留未保存意图'); expect(view.dialogProps().open).toBe(true)
    expect(view.props(props => props.className === 'mira-composer-confirm__discard').disabled).toBe(true)
    await view.cancel(); await (view.queueProps().onRetrySave as () => Promise<void>)(); await view.drain(); await view.key('Enter')
    expect(view.api.send.mock.calls[1]?.[5]).toMatchObject({ pausedQueueDecision: 'discard', expectedQueueRevision: 4 })
  })

  it('sends a nonempty running draft to the queue but stops from an empty running draft', async () => {
    const view = fixture({ queue: true }); await view.drain()
    view.state.running = true; view.render(); await view.drain()
    expect(view.props(props => props['aria-label'] === '停止任务')).toBeDefined()
    await view.type('下一条消息')
    expect(view.props(props => props['aria-label'] === '加入待发送').disabled).toBe(false)
    await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledWith('下一条消息', false, [], expect.any(String), view.state.selection)
    expect(view.text()).toBe('')
    expect(view.props(props => props['aria-label'] === '停止任务')).toBeDefined()
  })

  it('keeps legacy running hosts on Stop without attempting a queue submission', async () => {
    const view = fixture(); await view.drain(); view.state.running = true; view.render(); await view.drain()
    await view.type('旧宿主下一条'); await view.key('Enter')
    expect(view.api.send).not.toHaveBeenCalled()
    expect(view.props(props => props['aria-label'] === '停止任务')).toBeDefined()
    expect(view.text()).toBe('旧宿主下一条')
  })

  it('clears only the ACKed text revision and attachment identities, not edits during admission', async () => {
    const ack = deferred<boolean>()
    const view = fixture({ queue: true, search: async (_id, query) => ({ entries: [{ path: `${query}.md`, name: `${query}.md`, type: 'file' }], truncated: false }) }); await view.drain()
    await view.type('@old'); await vi.advanceTimersByTimeAsync(120); await view.drain(); await view.select('file-old.md')
    await view.append('先发这一条'); view.api.send.mockReturnValueOnce(ack.promise); await view.key('Enter')
    expect(view.text()).toBe('@old.md 先发这一条')
    expect(view.inputProps().disabled).toBe(false)
    await view.type('@new'); await vi.advanceTimersByTimeAsync(120); await view.drain(); await view.select('file-new.md')
    await view.append('ACK 期间的新草稿')
    ack.resolve(true); await view.drain()
    expect(view.text()).toBe('@new.md ACK 期间的新草稿')
    expect(view.attachmentPaths()).toContain('new.md')
    expect(view.attachmentPaths()).not.toContain('old.md')
  })

  it('reuses the submission identity for an unchanged retry and changes it for a new payload', async () => {
    const view = fixture({ queue: true }); await view.drain(); await view.type('保留以便重试')
    view.api.send.mockResolvedValueOnce(false); await view.key('Enter')
    expect(view.text()).toBe('保留以便重试')
    view.api.send.mockResolvedValueOnce(false); await view.key('Enter')
    expect(view.api.send.mock.calls[1][3]).toBe(view.api.send.mock.calls[0][3])
    await view.type('修改后的提交'); await view.key('Enter')
    expect(view.api.send.mock.calls[2][3]).not.toBe(view.api.send.mock.calls[0][3])
  })

  it('clears and persists the submitted owner after a cross-session ACK without changing the new draft', async () => {
    const ack = deferred<boolean>(), view = fixture({ queue: true }); await view.drain(); await view.type('原会话提交')
    view.api.send.mockReturnValueOnce(ack.promise); await view.key('Enter')
    view.state.session = { ...view.state.session!, id: 'next' }; view.render(); await view.drain(); await view.type('新会话草稿')
    ack.resolve(true); await view.drain()
    expect(view.text()).toBe('新会话草稿')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: { next: '新会话草稿' } }), true)
    view.state.session = { ...view.state.session!, id: 'current' }; view.render(); await view.drain()
    expect(view.text()).toBe('')
  })

  it('preserves a revised owner draft when its prior ACK arrives after leaving it', async () => {
    const ack = deferred<boolean>(), view = fixture({ queue: true }); await view.drain(); await view.type('已提交正文')
    view.api.send.mockReturnValueOnce(ack.promise); await view.key('Enter'); await view.type('原会话新草稿')
    view.state.session = { ...view.state.session!, id: 'next' }; view.render(); await view.drain(); await view.type('另一个草稿')
    ack.resolve(true); await view.drain()
    expect(view.text()).toBe('另一个草稿')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: { current: '原会话新草稿', next: '另一个草稿' } }), true)
  })

  it('saves the submission identity before admission and locks resending until ACK cleanup is saved', async () => {
    const intentSave = deferred<void>(), cleanupSave = deferred<void>(), view = fixture({ queue: true }); await view.drain(); await view.type('防刷新重复提交')
    view.api.setPreference.mockReturnValueOnce(intentSave.promise).mockReturnValueOnce(cleanupSave.promise)
    await view.key('Enter'); expect(view.api.send).not.toHaveBeenCalled()
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ submissions: { current: expect.objectContaining({ id: expect.any(String), text: '防刷新重复提交' }) } }), true)
    intentSave.resolve(); await view.drain(); expect(view.api.send).toHaveBeenCalledOnce(); expect(view.text()).toBe('')
    await view.type('下一份草稿'); await view.key('Enter'); expect(view.api.send).toHaveBeenCalledOnce()
    cleanupSave.resolve(); await view.drain(); await view.key('Enter'); expect(view.api.send).toHaveBeenCalledTimes(2)
  })

  it('reuses a persisted submission intent after reopening instead of creating a new ID', async () => {
    const submission = { id: 'durable-submission', text: '已保存待确认', references: [], planning: false, selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'medium' } }
    const view = fixture({ queue: true, draftPreference: Promise.resolve({ drafts: { current: submission.text }, submissions: { current: submission } }) }); await view.drain(); await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledWith(submission.text, false, [], submission.id, submission.selection)
  })

  it('replays the original saved identity and configuration even when next-message settings changed before reload', async () => {
    const submission = { id: 'accepted-before-reload', text: '同一条待确认提交', references: [], planning: false, selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'medium' } }
    const view = fixture({ queue: true, draftPreference: Promise.resolve({ drafts: { current: submission.text }, submissions: { current: submission }, config: { planning: true } }) }); await view.drain()
    view.state.selection = { ...view.state.selection!, thinkingLevel: 'high' }; view.render(); await view.drain()
    expect(view.props(props => props.className === 'mira-composer-pending-submission').children).toContain('上次提交待确认')
    await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledWith(submission.text, false, [], submission.id, submission.selection)
    expect(view.state.selection.thinkingLevel).toBe('high')
  })

  it('does not submit when intent persistence fails and captures the model before awaiting that save', async () => {
    const saving = deferred<void>(), view = fixture({ queue: true }); await view.drain(); await view.type('保存后发送')
    view.api.setPreference.mockRejectedValueOnce(new Error('意图保存失败')); await view.key('Enter')
    expect(view.api.send).not.toHaveBeenCalled(); expect(view.text()).toBe('保存后发送')
    await (view.queueProps().onRetrySave as () => Promise<void>)(); await view.drain()
    view.api.setPreference.mockReturnValueOnce(saving.promise); await view.key('Enter')
    view.state.selection = { ...view.state.selection!, thinkingLevel: 'high' }; view.render(); await view.drain()
    saving.resolve(); await view.drain()
    expect(view.api.send).toHaveBeenCalledWith('保存后发送', false, [], expect.any(String), expect.objectContaining({ thinkingLevel: 'medium' }))
  })

  it('locks only the submitted owner after ACK cleanup fails until explicit persistence retry', async () => {
    const view = fixture({ queue: true }); await view.drain(); await view.type('已接收正文')
    view.api.setPreference.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('ACK 清理保存失败'))
    await view.key('Enter'); expect(view.text()).toBe('')
    await view.type('原会话下一条'); await view.key('Enter'); expect(view.api.send).toHaveBeenCalledOnce()
    expect(view.queueProps().error).toContain('ACK 清理保存失败')
    view.state.session = { ...view.state.session!, id: 'next' }; view.render(); await view.drain(); await view.type('其他会话下一条'); await view.key('Enter'); expect(view.api.send).toHaveBeenCalledTimes(2)
    view.state.session = { ...view.state.session!, id: 'current' }; view.render(); await view.drain()
    await (view.queueProps().onRetrySave as () => Promise<void>)(); await view.drain(); await view.key('Enter'); expect(view.api.send).toHaveBeenCalledTimes(3)
  })

  it('allows next-draft file and conversation context while locking active capabilities', async () => {
    const view = fixture({ queue: true, search: async () => ({ entries: [{ path: 'next.md', name: 'next.md', type: 'file' }], truncated: false }) }); await view.drain()
    view.state.running = true; view.render(); await view.drain(); await view.type('@')
    expect(view.items().find(item => item.id === 'skill-research')?.disabled).toBe(true)
    expect(view.items().find(item => item.id === 'mcp-docs')?.disabled).toBe(true)
    await view.type('@next')
    await vi.advanceTimersByTimeAsync(120); await view.drain(); await view.select('file-next.md')
    expect(view.attachmentPaths()).toContain('next.md')
    await view.type('@研究'); await view.select('session-reference'); expect(view.text()).toContain('真实结论')
    expect(view.props(props => props['aria-label'] === '权限与计划模式').disabled).toBe(true)
    expect(view.props(props => props['aria-label'] === '模型').disabled).toBe(false)
    await view.type('/plan'); await view.select('command-plan')
    expect(view.props(props => props['aria-label'] === '关闭计划模式').disabled).toBe(false)
    expect(view.api.setSessionSkills).not.toHaveBeenCalled()
  })

  it('restores a queued message only after withdrawal ACK, including references and next settings', async () => {
    const ack = deferred<Awaited<ReturnType<ReturnType<typeof fixture>['api']['withdrawMessage']>>>()
    const view = fixture({ queue: true }); await view.drain(); view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }; view.render(); await view.drain()
    view.api.withdrawMessage.mockReturnValueOnce(ack.promise)
    const editing = (view.queueProps().onEdit as (id: string) => Promise<void>)('queued-1'); await view.drain()
    expect(view.text()).toBe('')
    ack.resolve({ item: queued(), queue: { sessionId: 'current', revision: 2, items: [] } }); await editing; await view.drain()
    expect(view.text()).toBe('排队的正文')
    expect(view.attachmentPaths()).toContain('queued.md')
    expect(view.api.select).toHaveBeenCalledWith(queued().selection)
    expect(view.props(props => props['aria-label'] === '关闭计划模式')).toBeDefined()
  })

  it('keeps a withdrawn message recoverable when text is edited while waiting for ACK', async () => {
    const ack = deferred<Awaited<ReturnType<ReturnType<typeof fixture>['api']['withdrawMessage']>>>()
    const view = fixture({ queue: true }); await view.drain(); view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }; view.render(); await view.drain()
    view.api.withdrawMessage.mockReturnValueOnce(ack.promise)
    const editing = (view.queueProps().onEdit as (id: string) => Promise<void>)('queued-1'); await view.drain(); await view.type('不能覆盖的新草稿')
    ack.resolve({ item: queued(), queue: { sessionId: 'current', revision: 2, items: [] } }); await editing; await view.drain()
    expect(view.text()).toBe('不能覆盖的新草稿')
    expect(view.queueProps().recoveries).toEqual([queued()])
    expect(view.api.setPreference).toHaveBeenCalledWith('harness-react-composer-drafts', expect.objectContaining({ recoveries: { current: [queued()] }, drafts: expect.objectContaining({ current: '不能覆盖的新草稿' }) }), true)
    await view.type(''); (view.queueProps().onRestore as (id: string) => void)('queued-1'); await view.drain()
    expect(view.text()).toBe('排队的正文')
    expect(view.queueProps().recoveries).toEqual([])
  })

  it('hydrates confirmed recoveries without replacing a saved occupied draft', async () => {
    const view = fixture({ queue: true, draftPreference: Promise.resolve({ drafts: { current: '原有草稿' }, recoveries: { current: [queued()], other: [{ ...queued('other-item'), sessionId: 'other' }] } }) }); await view.drain()
    expect(view.text()).toBe('原有草稿')
    expect(view.queueProps().recoveries).toEqual([queued()])
    expect(view.queueProps().editDisabled).toBe(true)
    await view.type(''); await (view.queueProps().onRestore as (id: string) => Promise<void>)('queued-1'); await view.drain()
    expect(view.text()).toBe('排队的正文')
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: expect.objectContaining({ current: '排队的正文' }), recoveries: { other: [{ ...queued('other-item'), sessionId: 'other' }] } }), true)
  })

  it('retains confirmed recovery and offers save retry when preference persistence fails', async () => {
    const view = fixture({ queue: true }); await view.drain(); view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }; view.render(); await view.drain()
    view.api.setPreference.mockRejectedValueOnce(new Error('保存连接断开'))
    await (view.queueProps().onEdit as (id: string) => Promise<void>)('queued-1'); await view.drain()
    expect(view.text()).toBe('')
    expect(view.queueProps().recoveries).toEqual([queued()])
    expect(view.queueProps().recoveryBlocked).toBe(true)
    expect(view.queueProps().error).toContain('保存连接断开')
    await (view.queueProps().onRestore as (id: string) => Promise<void>)('queued-1'); await view.drain(); expect(view.text()).toBe('')
    await (view.queueProps().onRetrySave as () => Promise<void>)(); await view.drain()
    expect(view.queueProps().recoveryBlocked).toBe(false)
    await (view.queueProps().onRestore as (id: string) => Promise<void>)('queued-1'); await view.drain()
    expect(view.text()).toBe('排队的正文')
  })

  it('blocks resending a restored draft until its persisted recovery is consumed successfully', async () => {
    const consumption = deferred<void>(), view = fixture({ queue: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }; view.render(); await view.drain()
    view.api.setPreference.mockResolvedValueOnce(undefined).mockReturnValueOnce(consumption.promise)
    const editing = (view.queueProps().onEdit as (id: string) => Promise<void>)('queued-1'); await view.drain()
    expect(view.text()).toBe('排队的正文')
    expect(view.props(props => props['aria-label'] === '发送任务').disabled).toBe(true)
    await view.key('Enter'); expect(view.api.send).not.toHaveBeenCalled()
    consumption.resolve(); await editing; await view.drain()
    expect(view.props(props => props['aria-label'] === '发送任务').disabled).toBe(false)
  })

  it('keeps sending blocked after recovery consumption save failure until explicit retry succeeds', async () => {
    const view = fixture({ queue: true }); await view.drain(); view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }; view.render(); await view.drain()
    view.api.setPreference.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('消费保存失败'))
    await (view.queueProps().onEdit as (id: string) => Promise<void>)('queued-1'); await view.drain()
    expect(view.text()).toBe('排队的正文')
    expect(view.props(props => props['aria-label'] === '发送任务').disabled).toBe(true)
    await view.key('Enter'); expect(view.api.send).not.toHaveBeenCalled()
    expect(view.queueProps().error).toContain('消费保存失败')
    await (view.queueProps().onRetrySave as () => Promise<void>)(); await view.drain()
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: expect.objectContaining({ current: '排队的正文' }), fileDrafts: expect.objectContaining({ current: queued().references }) }), true)
    await view.key('Enter'); expect(view.api.send).toHaveBeenCalledOnce()
  })

  it('never creates a recovery from a failed withdrawal even when the queue no longer contains it', async () => {
    const view = fixture({ queue: true }); await view.drain(); view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }; view.render(); await view.drain()
    view.api.withdrawMessage.mockRejectedValueOnce(new Error('待发送消息已开始或已撤回'))
    const edit = (view.queueProps().onEdit as (id: string) => Promise<void>)('queued-1')
    view.state.queue = { sessionId: 'current', revision: 2, items: [] }; await edit; await view.drain()
    expect(view.queueProps().recoveries).toEqual([])
    expect(view.text()).toBe('')
    expect(view.api.select).not.toHaveBeenCalled()
  })

  it('deletes a queued message through ACK without restoring its content', async () => {
    const view = fixture({ queue: true }); await view.drain(); view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }; view.render(); await view.drain(); await view.type('已有草稿')
    await (view.queueProps().onDelete as (id: string) => Promise<void>)('queued-1'); await view.drain()
    expect(view.api.withdrawMessage).toHaveBeenCalledWith('current', 'queued-1')
    expect(view.text()).toBe('已有草稿')
    expect(view.queueProps().recoveries).toEqual([])
  })

  it('preserves a newly re-added attachment at the same path when the earlier identity is ACKed', async () => {
    const ack = deferred<boolean>(), view = fixture({ queue: true, search: async () => ({ entries: [{ path: 'same.md', name: 'same.md', type: 'file' }], truncated: false }) }); await view.drain()
    await view.type('@same'); await vi.advanceTimersByTimeAsync(120); await view.drain(); await view.select('file-same.md'); await view.append('发这条')
    view.api.send.mockReturnValueOnce(ack.promise); await view.key('Enter')
    ;(view.attachmentProps().onRemove as (path: string) => void)('same.md'); await view.drain()
    await view.type('@same'); await vi.advanceTimersByTimeAsync(120); await view.drain(); await view.select('file-same.md'); await view.append('保留新正文')
    ack.resolve(true); await view.drain()
    expect(view.attachmentPaths()).toContain('same.md')
    expect(view.text()).toBe('@same.md 保留新正文')
  })

  it('does not withdraw into an occupied draft and saves cross-session ACK recovery for its owner', async () => {
    const ack = deferred<Awaited<ReturnType<ReturnType<typeof fixture>['api']['withdrawMessage']>>>()
    const view = fixture({ queue: true }); await view.drain(); view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }; view.render(); await view.drain()
    await view.type('已有内容'); await (view.queueProps().onEdit as (id: string) => Promise<void>)('queued-1')
    expect(view.api.withdrawMessage).not.toHaveBeenCalled()
    await view.type(''); view.api.withdrawMessage.mockReturnValueOnce(ack.promise)
    const editing = (view.queueProps().onEdit as (id: string) => Promise<void>)('queued-1'); await view.drain()
    view.state.session = { ...view.state.session!, id: 'next' }; view.state.queue = undefined; view.render(); await view.drain(); await view.type('其他会话内容')
    ack.resolve({ item: queued(), queue: { sessionId: 'current', revision: 2, items: [] } }); await editing; await view.drain()
    expect(view.text()).toBe('其他会话内容'); expect(view.api.select).not.toHaveBeenCalled()
    view.state.session = { ...view.state.session!, id: 'current' }; view.render(); await view.drain()
    expect(view.queueProps().recoveries).toEqual([queued()])
    ;(view.queueProps().onRestore as (id: string) => void)('queued-1'); await view.drain()
    expect(view.text()).toBe('排队的正文')
  })

  it('uses actual pending confirmation to guide resume instead of a stale queue pause reason', async () => {
    const view = fixture({ queue: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 1, items: [queued()], paused: 'confirmation' }
    view.state.permission = { requestId: 'permission' } as PilotState['permission']; view.render(); await view.drain()
    expect(view.queueProps().confirmationPending).toBe(true)
    await (view.queueProps().onResume as () => Promise<void>)(); expect(view.api.resumeMessageQueue).not.toHaveBeenCalled()
    view.state.permission = undefined; view.render(); await view.drain()
    expect(view.queueProps().confirmationPending).toBe(false)
    await (view.queueProps().onResume as () => Promise<void>)()
    expect(view.api.resumeMessageQueue).toHaveBeenCalledWith('current')
  })

  it('gates queue capabilities and serializes reorder commands without changing the local queue', async () => {
    const view = fixture({ queue: true }); await view.drain()
    expect(view.queueProps().onMove).toBeUndefined(); expect(view.queueProps().onSendNow).toBeUndefined()
    view.api.supportsQueueReorder = true; view.api.supportsQueueSendNow = true
    view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }; view.render(); await view.drain()
    const ack = deferred<{ sessionId: string; revision: number; items: never[] }>(); view.api.reorderMessageQueue.mockReturnValueOnce(ack.promise)
    const move = view.queueProps().onMove as (id: string, before: string | null) => Promise<void>
    const pending = move('queued-1', null); await view.drain(); await move('queued-1', null)
    expect(view.api.reorderMessageQueue).toHaveBeenCalledExactlyOnceWith('current', 'queued-1', null)
    expect(view.queueProps().reorderPending).toBe(true); expect(view.state.queue.items).toEqual([queued()])
    ack.resolve({ sessionId: 'current', revision: 2, items: [] }); await pending; await view.drain()
    expect(view.queueProps().reorderPending).toBe(false)
  })

  it('captures the send-now run identity, locks only that row and ignores late errors after navigation', async () => {
    const view = fixture({ queue: true, queueActions: true }); await view.drain()
    view.state.queue = { sessionId: 'current', revision: 1, items: [queued(), queued('queued-2')] }
    view.state.running = true; view.state.session!.activeRun = { id: 'run-at-click', status: 'running', startedAt: 1 } as NonNullable<typeof view.state.session>['activeRun']; view.render(); await view.drain()
    const ack = deferred<{ sessionId: string; revision: number; items: never[] }>(); view.api.sendQueuedMessageNow.mockReturnValueOnce(ack.promise)
    const sendNow = view.queueProps().onSendNow as (id: string) => Promise<void>
    const sending = sendNow('queued-1'); await view.drain(); await sendNow('queued-2')
    expect(view.api.sendQueuedMessageNow).toHaveBeenCalledExactlyOnceWith('current', 'queued-1', 'run-at-click')
    expect(view.queueProps().sendNowPendingItems).toEqual(['queued-1'])
    view.state.session = { ...view.state.session!, id: 'next' }; view.state.queue = undefined; view.render(); await view.drain(); await view.type('新会话草稿')
    ack.reject(new Error('旧会话立即发送失败')); await sending; await view.drain()
    expect(view.text()).toBe('新会话草稿'); expect(view.queueProps().sendNowPendingItems).toEqual([])
    expect(() => view.props(props => props.role === 'alert')).toThrow()
    view.state.session = { ...view.state.session!, id: 'current' }; view.state.queue = { sessionId: 'current', revision: 2, items: [queued('queued-2')] }; view.render(); await view.drain()
    view.api.sendQueuedMessageNow.mockRejectedValueOnce(new Error('立即发送失败')); await (view.queueProps().onSendNow as (id: string) => Promise<void>)('queued-2'); await view.drain()
    expect(view.props(props => props.role === 'alert').children).toBeDefined(); expect(view.queueProps().sendNowPendingItems).toEqual([])
  })

  it('uses real confirmation and authoritative promotion state to prevent incompatible queue actions', async () => {
    const show = vi.fn(); vi.stubGlobal('document', { getElementById: () => null, querySelector: () => ({ scrollIntoView: show }) })
    const view = fixture({ queue: true, queueActions: true }); await view.drain(); view.state.queue = { sessionId: 'current', revision: 1, items: [queued()] }
    view.state.permission = { requestId: 'permission', sessionId: 'current' } as PilotState['permission']; view.render(); await view.drain()
    await (view.queueProps().onSendNow as (id: string) => Promise<void>)('queued-1'); expect(show).toHaveBeenCalledOnce(); expect(view.api.sendQueuedMessageNow).not.toHaveBeenCalled()
    view.state.permission = undefined; view.state.queue.promotingItemId = 'queued-1'; view.render(); await view.drain()
    await (view.queueProps().onSendNow as (id: string) => Promise<void>)('queued-1'); await (view.queueProps().onMove as (id: string, before: string | null) => Promise<void>)('queued-1', null); await (view.queueProps().onDelete as (id: string) => Promise<void>)('queued-1')
    expect(view.api.sendQueuedMessageNow).not.toHaveBeenCalled(); expect(view.api.reorderMessageQueue).not.toHaveBeenCalled(); expect(view.api.withdrawMessage).not.toHaveBeenCalled()
    view.state.queue.promotingItemId = undefined; view.state.running = true; view.render(); await view.drain()
    await (view.queueProps().onSendNow as (id: string) => Promise<void>)('queued-1'); expect(view.api.sendQueuedMessageNow).not.toHaveBeenCalled()
  })

  it('preserves the complete existing draft when + opens slash commands at the saved caret', async () => {
    const view = fixture(); await view.drain()
    await view.type('已有草稿 后续正文', 5); await view.plus(); await view.select('open-commands')
    expect(view.text()).toBe('已有草稿 /后续正文')
    expect(view.promptSelection.start).toBe(6)
    expect(view.api.send).not.toHaveBeenCalled()
  })

  it('captures the current canonical selection when the + button is activated from the keyboard', async () => {
    const view = fixture(); await view.drain()
    await view.type('已有草稿 后续正文', 5); await view.plus(true); await view.select('open-commands')
    expect(view.text()).toBe('已有草稿 /后续正文')
    expect(view.promptSelection.start).toBe(6)
    expect(view.api.send).not.toHaveBeenCalled()
  })

  it('lets the + button toggle the panel without Radix outside-dismiss reopening it', async () => {
    const view = fixture(); await view.drain(); await view.type('保留正文'); await view.plus()
    const outside = { target: view.plusButton, preventDefault: vi.fn() }
    ;(view.props(props => typeof props.onInteractOutside === 'function').onInteractOutside as (event: unknown) => void)(outside)
    expect(outside.preventDefault).toHaveBeenCalledOnce()
    await view.plus()
    expect(view.inputProps()['aria-expanded']).toBe(false)
    expect(view.text()).toBe('保留正文')
  })

  it('adds a real file reference at a middle caret while preserving both sides of the prompt', async () => {
    const view = fixture({ search: async () => ({ entries: [{ path: 'docs/README.md', name: 'README.md', type: 'file' }], truncated: false }) }); await view.drain()
    await view.type('检查 @RE 后续正文', 6); await vi.advanceTimersByTimeAsync(120); await view.drain()
    expect(view.api.searchFilesFor).toHaveBeenCalledWith('current', 'RE')
    await view.key('Tab')
    expect(view.text()).toBe('检查 @docs/README.md  后续正文')
    expect(view.attachmentPaths()).toContain('docs/README.md')
    expect(view.api.send).not.toHaveBeenCalled()
  })

  it('removes a slash token including the matching suffix after the caret, not following body text', async () => {
    const view = fixture(); await view.drain()
    await view.type('前文 /plan 后文', 6); await view.key('Enter')
    expect(view.text()).toBe('前文  后文')
    expect(view.props(props => props['aria-label'] === '关闭计划模式')).toBeDefined()
  })

  it('keeps a highlighted capability selected when late file candidates arrive before it', async () => {
    const files = deferred<HarnessWorkspaceFileSearchResult>()
    const view = fixture({ files: files.promise }); await view.drain(); await view.type('@'); await vi.advanceTimersByTimeAsync(1); await view.drain()
    const index = view.items().findIndex(item => item.id === 'skill-research')
    ;(view.panelProps().onHighlight as (index: number) => void)(index); await view.drain()
    files.resolve({ entries: [{ name: 'readme.md', path: 'readme.md', type: 'file' }], truncated: false }); await view.drain()
    expect(view.items()[view.panelProps().selectedIndex as number].id).toBe('skill-research')
    await view.key('Enter')
    expect(view.api.setSessionSkills).toHaveBeenCalledWith('current', ['research'])
    expect(view.text()).toBe('')
  })

  it('rejects stale file search results and lets Escape close the panel without stopping a task', async () => {
    const old = deferred<HarnessWorkspaceFileSearchResult>(), next = deferred<HarnessWorkspaceFileSearchResult>()
    const view = fixture({ search: (_id, query) => query === 'old' ? old.promise : next.promise }); await view.drain()
    await view.type('@old'); await vi.advanceTimersByTimeAsync(120); await view.drain()
    await view.type('@next'); await vi.advanceTimersByTimeAsync(120); await view.drain()
    next.resolve({ entries: [{ name: 'next.md', path: 'next.md', type: 'file' }], truncated: false }); await view.drain()
    old.resolve({ entries: [{ name: 'old.md', path: 'old.md', type: 'file' }], truncated: false }); await view.drain()
    expect(view.items().some(item => item.id === 'file-old.md')).toBe(false)
    expect(view.items().some(item => item.id === 'file-next.md')).toBe(true)
    const keyboard = await view.key('Escape')
    expect(keyboard.stopPropagation).toHaveBeenCalled()
    expect(view.inputProps()['aria-expanded']).toBe(false)
    expect(view.api.stop).not.toHaveBeenCalled()
    expect(view.text()).toBe('@next')
  })

  it('does not show previous-workspace files after switching tasks during a pending search', async () => {
    const previous = deferred<HarnessWorkspaceFileSearchResult>()
    const view = fixture({ search: () => previous.promise }); await view.drain()
    await view.type('@old'); await vi.advanceTimersByTimeAsync(120); await view.drain()
    view.state.session = { ...view.state.session!, id: 'next', workingDirectory: '/next' }; view.render(); await view.drain()
    previous.resolve({ entries: [{ name: 'old.md', path: 'old.md', type: 'file' }], truncated: false }); await view.drain()
    expect(view.text()).toBe('')
    expect(view.inputProps()['aria-expanded']).toBe(false)
    expect(view.items().some(item => item.id === 'file-old.md')).toBe(false)
    expect(view.api.setSessionSkills).not.toHaveBeenCalled()
  })

  it('keeps file-search failure visible with retry and skips unsupported bitmap attachments', async () => {
    let failed = true
    const view = fixture({ search: async () => {
      if (failed) throw new Error('目录搜索失败')
      return { entries: [{ name: 'image.png', path: 'image.png', type: 'file' }, { name: 'source.svg', path: 'source.svg', type: 'file' }], truncated: false }
    } }); await view.drain(); await view.type('@source'); await vi.advanceTimersByTimeAsync(120); await view.drain()
    const section = (view.panelProps().sections as ComposerSuggestionSection[]).find(section => section.id === 'files')!
    expect(section.error).toBe('目录搜索失败')
    failed = false; section.onRetry!(); await view.drain(); await vi.advanceTimersByTimeAsync(120); await view.drain()
    expect(view.items().find(item => item.id === 'file-image.png')?.disabled).toBe(true)
    expect(view.items()[view.panelProps().selectedIndex as number].id).toBe('file-source.svg')
    await view.key('Enter'); expect(view.text()).toBe('@source.svg ')
    expect(view.attachmentPaths()).toContain('source.svg')
  })

  it('does not scan the filesystem for slash commands and wraps keyboard navigation', async () => {
    const view = fixture(); await view.drain(); await view.type('/'); await vi.advanceTimersByTimeAsync(120); await view.drain()
    expect(view.api.listFilesFor).not.toHaveBeenCalled(); expect(view.api.searchFilesFor).not.toHaveBeenCalled()
    await view.key('ArrowUp')
    expect(view.panelProps().selectedIndex).toBe(view.items().length - 1)
    await view.key('ArrowDown'); expect(view.panelProps().selectedIndex).toBe(0)
  })

  it('loads actual selected conversation content and sends the explicit reference as context', async () => {
    const view = fixture(); await view.drain(); await view.type('结合 @研究 来回答', 6); await view.select('session-reference')
    expect(view.api.getSession).toHaveBeenCalledWith('reference')
    expect(view.text()).toContain('真实需求'); expect(view.text()).toContain('真实结论')
    expect(view.text()).not.toContain('internal secret')
    expect(view.text()).toMatch(/^结合 【引用对话：研究记录】/)
    expect(view.text()).toMatch(/【引用结束】\n  来回答$/)
    await view.key('Enter')
    expect(view.api.send).toHaveBeenCalledWith(expect.stringContaining('真实结论'), false, [])
  })

  it('does not overwrite edits made while a conversation reference is being read', async () => {
    const read = deferred<Awaited<ReturnType<ReturnType<typeof fixture>['api']['getSession']>>>()
    const view = fixture(); view.api.getSession.mockReturnValueOnce(read.promise); await view.drain(); await view.type('@研究'); await view.select('session-reference')
    await view.type('刚修改的草稿')
    read.resolve({ ...view.state.session!, id: 'reference', title: '研究记录', messages: [{ role: 'user', content: '旧引用' }] } as Awaited<ReturnType<typeof view.api.getSession>>); await view.drain()
    expect(view.text()).toBe('刚修改的草稿')
    expect(view.props(props => props.role === 'alert').children).toBeDefined()
  })

  it('uses the host send preference, cycles real reasoning and stops only the focused idle menu state', async () => {
    const view = fixture({ preference: 'mod-enter' }); await view.drain(); await view.type('请处理资料')
    await view.key('Enter'); expect(view.api.send).not.toHaveBeenCalled()
    await view.dispatch('t', { ctrlKey: true, target: view.editorElement })
    expect(view.api.select).toHaveBeenCalledWith({ providerId: 'provider', modelId: 'model', thinkingLevel: 'high' })
    await view.key('Enter', { ctrlKey: true }); expect(view.api.send).toHaveBeenCalledOnce()
    view.state.running = true; view.render(); await view.drain()
    await view.dispatch('Escape', { target: view.editorElement }); expect(view.api.stop).toHaveBeenCalledOnce()
    expect(view.inputProps().placeholder).toContain('任务运行中')
    expect(view.props(props => props['aria-label'] === '停止任务')).toBeDefined()
  })

  it('yields model, permission and stop shortcuts to an open modal preview', async () => {
    const view = fixture()
    await view.drain()
    view.state.running = true; view.render(); await view.drain()
    vi.stubGlobal('document', { getElementById: () => null, querySelector: (selector: string) => selector.includes('aria-modal') ? {} : null })
    for (const [key, modifiers] of [['m', { ctrlKey: true }], ['m', { ctrlKey: true, shiftKey: true }], ['Escape', {}]] as const) {
      const input = await view.dispatch(key, { ...modifiers, target: { closest: () => null } })
      expect(input.preventDefault).not.toHaveBeenCalled()
    }
    await view.drain()
    expect(view.api.select).not.toHaveBeenCalled()
    expect(view.api.stop).not.toHaveBeenCalled()
    expect(view.api.setSessionPermission).not.toHaveBeenCalled()
    expect(view.openPopups()).toBe(0)
  })

  it('yields Composer shortcuts to terminal and other editable targets', async () => {
    const view = fixture(); await view.drain()
    for (const selector of ['input', 'textarea', '[contenteditable]', '.xterm']) {
      const target = { closest: (query: string) => query.includes(selector) ? target : null }
      const reasoning = await view.dispatch('t', { ctrlKey: true, target })
      const model = await view.dispatch('m', { ctrlKey: true, target })
      const permission = await view.dispatch('m', { ctrlKey: true, shiftKey: true, target })
      expect(reasoning.preventDefault).not.toHaveBeenCalled()
      expect(model.preventDefault).not.toHaveBeenCalled()
      expect(permission.preventDefault).not.toHaveBeenCalled()
      expect(view.openPopups()).toBe(0)
      view.state.running = true; view.render(); await view.drain()
      const escape = await view.dispatch('Escape', { target })
      expect(escape.preventDefault).not.toHaveBeenCalled()
      view.state.running = false; view.render(); await view.drain()
    }
    expect(view.api.select).not.toHaveBeenCalled()
    expect(view.api.setSessionPermission).not.toHaveBeenCalled()
    expect(view.api.stop).not.toHaveBeenCalled()
  })

  it('uses Ctrl+T only in the Composer but preserves global model and permission shortcuts', async () => {
    const view = fixture(); await view.drain()
    const target = { closest: () => null }
    const reasoning = await view.dispatch('t', { ctrlKey: true, target })
    expect(reasoning.preventDefault).not.toHaveBeenCalled()
    expect(view.api.select).not.toHaveBeenCalled()
    await view.dispatch('m', { ctrlKey: true, target }); expect(view.openPopups()).toBe(1)
    await view.dispatch('m', { ctrlKey: true, target }); expect(view.openPopups()).toBe(0)
    await view.dispatch('m', { ctrlKey: true, shiftKey: true, target })
    expect(view.api.setSessionPermission).toHaveBeenCalledWith('current', 'auto-approve')
  })

  it('stops only for bare Escape and ignores IME keyboard events', async () => {
    const view = fixture(); await view.drain(); view.state.running = true; view.render(); await view.drain()
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
      const keyboard = await view.dispatch('Escape', { target: view.editorElement, ...modifiers })
      expect(keyboard.preventDefault).not.toHaveBeenCalled()
    }
    expect(view.api.stop).not.toHaveBeenCalled()
    await view.dispatch('Escape', { target: view.editorElement }); expect(view.api.stop).toHaveBeenCalledOnce()
  })

  it('closes popups and ignores shortcuts and compose events while the conversation is hidden', async () => {
    const view = fixture(); await view.drain(); await view.type('@')
    expect(view.inputProps()['aria-expanded']).toBe(true)
    await view.setActive(false)
    expect(view.inputProps()['aria-expanded']).toBe(false)
    expect(view.openPopups()).toBe(0)
    await view.dispatch('m', { ctrlKey: true, target: view.editorElement })
    await view.dispatch('t', { ctrlKey: true, target: view.editorElement })
    await view.compose('隐藏页不能替换草稿')
    expect(view.openPopups()).toBe(0)
    expect(view.api.select).not.toHaveBeenCalled()
    expect(view.text()).toBe('@')
    view.state.running = true; view.render(); await view.drain()
    await view.dispatch('Escape', { target: view.editorElement }); expect(view.api.stop).not.toHaveBeenCalled()
    await view.setActive(true)
    view.state.running = false; view.render(); await view.drain()
    await view.dispatch('m', { ctrlKey: true, target: view.editorElement }); expect(view.openPopups()).toBe(1)
    await view.setActive(false); expect(view.openPopups()).toBe(0)
  })

  it('preserves text typed before delayed draft hydration', async () => {
    const preference = deferred<unknown>(), view = fixture({ draftPreference: preference.promise })
    await view.type('用户新草稿')
    preference.resolve({ drafts: { current: '旧保存草稿' } }); await view.drain()
    expect(view.text()).toBe('用户新草稿')
    await vi.advanceTimersByTimeAsync(250)
    expect(view.api.setPreference).toHaveBeenCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: expect.objectContaining({ current: '用户新草稿' }) }), true)
  })

  it('restores a prepared owner only through guarded navigation and retains input typed before hydration', async () => {
    const preference = deferred<unknown>(), view = fixture({ draftPreference: preference.promise })
    view.state.session = undefined; view.render(); await view.type('启动期间的新输入')
    preference.resolve({ draft: { id: 'saved', sessionId: 'created', groupId: 'first' }, drafts: { created: '已保存的输入' } }); await view.drain()
    expect(view.api.open).not.toHaveBeenCalled()
    const current = () => true
    expect(await view.handle.current!.openDraft(undefined, current)).toBe(true); await view.drain()
    expect(view.api.open).toHaveBeenCalledExactlyOnceWith('created', current)
    expect(view.text()).toBe('已保存的输入\n\n启动期间的新输入')
    await view.api.registerBeforeNavigation.mock.calls[0][0]()
    expect(view.api.setPreference).toHaveBeenLastCalledWith('harness-react-composer-drafts', expect.objectContaining({ drafts: { created: '已保存的输入\n\n启动期间的新输入' } }), true)
  })

  it('abandons restored owner navigation when a newer target wins during hydration', async () => {
    const preference = deferred<unknown>(), view = fixture({ draftPreference: preference.promise })
    view.state.session = undefined; view.render(); await view.drain()
    let current = true
    const navigation = view.handle.current!.openDraft(undefined, () => current)
    current = false; preference.resolve({ draft: { id: 'saved', sessionId: 'created' }, drafts: { created: '保存的草稿' } })
    expect(await navigation).toBe(false); await view.drain()
    expect(view.api.open).not.toHaveBeenCalled(); expect(view.api.newConversation).not.toHaveBeenCalled()
  })
})
