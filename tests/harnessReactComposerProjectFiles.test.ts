import * as React from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessWorkspaceFileSearchResult } from '../src/config/harness'

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
const result = (path: string): HarnessWorkspaceFileSearchResult => ({ entries: [{ path, name: path.split('/').pop()!, type: 'file' }], truncated: false })
let dom: Window, unmount: (() => Promise<void>) | undefined

beforeEach(() => {
  dom = new Window({ url: 'http://localhost' })
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLDivElement', 'HTMLInputElement', 'Element', 'Node', 'Text', 'DocumentFragment', 'Range', 'Selection', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'MutationObserver', 'ResizeObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    const value = (dom as unknown as Record<string, unknown>)[name]
    vi.stubGlobal(name, typeof value === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? value.bind(dom) : value)
  }
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  dom.document.body.innerHTML = '<div id="root"></div>'
})
afterEach(async () => {
  await unmount?.(); unmount = undefined
  // Radix restores focus on a timer after unmount; keep this DOM alive until it completes.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  dom.happyDOM.abort(); vi.unstubAllGlobals()
})

async function fixture(savedPreference?: unknown, queue = false) {
  const { HarnessComposer } = await import('../apps/harness-react/src/components/composer/HarnessComposer')
  const { $createParagraphNode, $createTextNode, $getRoot, $isElementNode, getNearestEditorFromDOMNode } = await import('lexical')
  const { $isMiraPromptReferenceNode } = await import('../apps/harness-react/src/components/composer/MiraPromptReferenceNode')
  const { createRoot } = await import('react-dom/client')
  const projects = ['a', 'b'].map(id => ({ id, name: `Project ${id}`, directory: `/project-${id}`, directoryExists: true, createdAt: 1, updatedAt: 1 }))
  const state: PilotState = { sessions: [], projects, providers: [{ id: 'provider', providerKey: 'custom', name: 'Provider', endpoint: 'http://localhost', enabled: true, authMode: 'api-key', hasApiKey: true, createdAt: 1, updatedAt: 1, models: [{ id: 'model', enabled: true }] }], selection: { providerId: 'provider', modelId: 'model' }, messages: [], running: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} }
  let projectId: string | undefined, planning = false
  const root = createRoot(document.getElementById('root')!)
  const api = {
    getSnapshot: () => state,
    getPreference: vi.fn(async () => savedPreference ?? null), setPreference: vi.fn(async (_key: string, _value: unknown, _replace?: boolean) => undefined),
    getComposerPreferences: vi.fn(async () => ({ sendShortcut: 'enter', showContextUsage: true, followupMode: 'queue' })),
    registerBeforeNavigation: vi.fn(() => () => undefined), onSessionDeleted: vi.fn(() => () => undefined),
    listProjectFiles: vi.fn(async (_id: string) => ({ path: '', entries: [...result('README.md').entries, ...result('ignored.txt').entries, { path: 'src', name: 'src', type: 'directory' }] })),
    searchProjectFiles: vi.fn(async (_id: string, _query: string) => result('src/README.md')),
    listFilesFor: vi.fn(async () => ({ path: '', ...result('session.md') })), searchFilesFor: vi.fn(async () => result('session-match.md')),
    listSkills: vi.fn(async () => []), listMcp: vi.fn(async () => []), supportsAttachments: true,
    supportsMessageQueue: queue,
    getSession: vi.fn(async (id: string) => ({ version: 1, id, title: '相关对话', messages: [{ role: 'user', content: '真实正文' }] })),
    prepare: vi.fn(async (id: string | undefined, isCurrent: () => boolean) => {
      if (!isCurrent()) return false
      state.session = { version: 1, id: 'prepared', title: '草稿', projectId: id, workingDirectory: projects.find(project => project.id === id)?.directory, messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, permissionMode: 'default', status: 'active', pinned: false, draftState: 'prepared' }
      render(); return true
    }),
    stageAttachment: vi.fn(async (_id: string, path: string) => ({ path: 'mira-attachment:readme', name: path.split('/').pop()! })),
    getAttachment: vi.fn(async (_id: string, path: string) => ({ path, name: 'README.md', content: 'frozen contents', type: 'text', size: 15 })),
    send: vi.fn(async (..._args: unknown[]) => true), select: vi.fn(),
  }
  function render() { root.render(React.createElement(HarnessComposer, { state: { ...state }, controller: api as unknown as PilotController, planning, setPlanning: value => { planning = value; render() }, draftProjectId: projectId, onDraftProjectChange: value => { projectId = value; render() } })) }
  const settle = async (delay = 0) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, delay)) }) }
  await act(async () => { render() }); await settle()
  unmount = async () => { await act(async () => root.unmount()) }
  const input = () => document.querySelector<HTMLDivElement>('[role="textbox"][aria-label="任务内容"]')!
  const editor = () => getNearestEditorFromDOMNode(input())!
  const text = () => editor().getEditorState().read(() => $getRoot().getChildren().map(paragraph => $isElementNode(paragraph) ? paragraph.getChildren().map(node => $isMiraPromptReferenceNode(node) ? node.getReference().text : node.getTextContent()).join('') : paragraph.getTextContent()).join('\n'))
  const type = async (value: string, position = value.length) => {
    await act(async () => {
      input().focus()
      editor().update(() => {
        const node = $createTextNode(value)
        $getRoot().clear().append($createParagraphNode().append(node))
        node.select(position, position)
      }, { discrete: true })
    })
    await settle(140)
  }
  const click = async (node: Element | null) => {
    expect(node).not.toBeNull()
    await act(async () => { node!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); (node as HTMLElement).click() }); await settle()
  }
  const scope = async (id?: string, sessionId?: string) => {
    await act(async () => {
      projectId = id
      state.session = sessionId ? { version: 1, id: sessionId, title: sessionId, projectId: id, workingDirectory: `/project-${id}`, messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false } : undefined
      render()
    }); await settle()
  }
  const files = () => [...document.querySelectorAll('[data-suggestion-id^="file-"]')].map(node => node.getAttribute('data-suggestion-id'))
  const fileGroup = () => document.querySelector('[role="group"][aria-label^="文件"]')
  const key = async (key: string, options: KeyboardEventInit = {}) => { await act(async () => input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))); await settle() }
  return { api, state, render, settle, input, editor, text, type, click, scope, files, fileGroup, key }
}

describe('project file mentions in the real React Composer', () => {
  it('keeps a resolved root-file pill out of @ suggestions and preserves it through / and + actions', async () => {
    const view = await fixture()
    await view.scope('a'); await view.type('@')
    await view.click(document.querySelector('[data-suggestion-id="file-README.md"]')); await view.settle(30)
    const { $nodesOfType } = await import('lexical')
    const { MiraPromptReferenceNode } = await import('../apps/harness-react/src/components/composer/MiraPromptReferenceNode')
    await act(async () => view.editor().update(() => $nodesOfType(MiraPromptReferenceNode)[0].selectEnd(), { discrete: true })); await view.settle(140)
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    await view.click(document.querySelector('[aria-label="添加上下文"]'))
    await view.click(document.querySelector('[data-suggestion-id="open-commands"]'))
    expect(view.input().querySelector('[data-mira-prompt-reference="file"]')).not.toBeNull()
    await view.click(document.querySelector('[data-suggestion-id="command-plan"]'))
    expect(view.text()).toBe('@README.md  ')
    expect(document.querySelector('[aria-label="关闭计划模式"]')).not.toBeNull()
    expect(view.api.stageAttachment).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('retries a failed @ file without losing its insertion or overwriting changed text (%s)', async changeText => {
    const view = await fixture()
    view.api.stageAttachment.mockRejectedValueOnce(new Error('文件暂不可读'))
    await view.scope('a'); await view.type('@README')
    await view.click(document.querySelector('[data-suggestion-id="file-src/README.md"]'))
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('文件暂不可读')
    if (changeText) await view.type('改过的新草稿')
    await view.click(document.querySelector('.mira-attachment-upload-retry')); await view.settle(30)
    expect(view.api.stageAttachment).toHaveBeenCalledTimes(2)
    expect(view.api.prepare).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[aria-label="待发送附件"]')?.textContent).toContain('README.md')
    expect(view.text()).toBe(changeText ? '改过的新草稿' : '@src/README.md ')
    expect(Boolean(view.input().querySelector('[data-mira-prompt-reference="file"]'))).toBe(!changeText)
  })

  it('drops a late session reference after an anonymous draft switches project', async () => {
    const view = await fixture(), read = deferred<Awaited<ReturnType<typeof view.api.getSession>>>()
    await view.scope('a')
    view.state.sessions.push({ version: 1, id: 'ref-a', title: '相关对话', projectId: 'a', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false })
    view.api.getSession.mockImplementationOnce(() => read.promise)
    await view.type('@'); await view.click(document.querySelector('[data-suggestion-id="session-ref-a"]'))
    await view.scope('b')
    await act(async () => read.resolve({ version: 1, id: 'ref-a', title: '相关对话', messages: [{ role: 'user', content: 'A私有正文' }] }))
    expect(view.text()).toBe('@')
    expect(view.input().textContent).not.toContain('A私有正文')
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('preserves the active editor and caret when a first-draft queue ACK arrives after newer input', async () => {
    const view = await fixture(undefined, true), ack = deferred<boolean>()
    view.api.send.mockImplementationOnce(() => ack.promise)
    await view.scope('a'); await view.type('@README')
    await view.click(document.querySelector('[data-suggestion-id="file-src/README.md"]')); await view.settle(30)
    await view.click(document.querySelector('[aria-label="发送任务"]'))
    expect(view.api.send).toHaveBeenCalledTimes(1)
    await view.type('ACK等待期间的新草稿', 4)
    const element = view.input(), selection = document.getSelection()?.anchorOffset
    await act(async () => ack.resolve(true)); await view.settle()
    expect(view.input()).toBe(element); expect(document.activeElement).toBe(element)
    expect(document.getSelection()?.anchorOffset).toBe(selection)
    expect(view.text()).toBe('ACK等待期间的新草稿')
  })

  it('deletes and undoes an inline file together with its real staged attachment, without staging it again', async () => {
    const view = await fixture()
    await view.scope('a'); await view.type('@README')
    await view.click(document.querySelector('[data-suggestion-id="file-src/README.md"]'))
    await view.settle(30)
    view.input().focus(); await view.key('z', { ctrlKey: true })
    expect(view.input().querySelector('[data-mira-prompt-reference]')).toBeNull()
    expect(document.querySelector('[aria-label="待发送附件"]')).toBeNull()
    await view.key('y', { ctrlKey: true })
    expect(view.input().querySelector('[data-mira-prompt-reference="file"]')).not.toBeNull()
    const { $nodesOfType } = await import('lexical')
    const { MiraPromptReferenceNode } = await import('../apps/harness-react/src/components/composer/MiraPromptReferenceNode')
    await act(async () => { view.input().focus(); view.editor().update(() => $nodesOfType(MiraPromptReferenceNode)[0].selectEnd(), { discrete: true }) })
    await view.key('Backspace')
    expect(view.input().querySelector('[data-mira-prompt-reference]')).toBeNull()
    expect(document.querySelector('[aria-label="待发送附件"]')).toBeNull()
    await view.key('z', { ctrlKey: true })
    expect(view.input().querySelector('[data-mira-prompt-reference="file"]')?.textContent).toBe('README.md')
    expect(document.querySelector('[aria-label="待发送附件"]')?.textContent).toContain('README.md')
    expect(view.text()).toBe('@src/README.md ')
    await view.click(document.querySelector('[aria-label="移除 README.md"]'))
    expect(view.input().querySelector('[data-mira-prompt-reference]')).toBeNull()
    view.input().focus(); await view.key('z', { ctrlKey: true })
    expect(view.input().querySelector('[data-mira-prompt-reference="file"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="待发送附件"]')?.textContent).toContain('README.md')
    expect(view.api.stageAttachment).toHaveBeenCalledTimes(1)
    await view.settle(280)
    expect(view.api.setPreference.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ drafts: { prepared: '@src/README.md ' }, fileDrafts: { prepared: [expect.objectContaining({ path: 'mira-attachment:readme' })] }, documents: { prepared: expect.objectContaining({ version: 1 }) } }))
  })

  it('restores an inline draft after reload and clears its undo history after successful admission', async () => {
    const view = await fixture()
    await view.scope('a'); await view.type('@README')
    await view.click(document.querySelector('[data-suggestion-id="file-src/README.md"]')); await view.settle(280)
    const saved = view.api.setPreference.mock.calls.at(-1)![1]
    await unmount?.(); unmount = undefined
    const restored = await fixture(saved)
    await restored.scope('a', 'prepared'); await restored.settle(30)
    expect(restored.input().querySelector('[data-mira-prompt-reference="file"]')?.textContent).toBe('README.md')
    expect(restored.text()).toBe('@src/README.md ')
    expect(restored.api.stageAttachment).not.toHaveBeenCalled()
    await restored.click(document.querySelector('[aria-label="发送任务"]'))
    expect(restored.api.send).toHaveBeenCalledWith('@src/README.md', false, [expect.objectContaining({ path: 'mira-attachment:readme' })])
    expect(restored.text()).toBe('')
    restored.input().focus(); await restored.key('z', { ctrlKey: true })
    expect(restored.text()).toBe('')
    expect(restored.input().querySelector('[data-mira-prompt-reference]')).toBeNull()
  })

  it('browses and searches a selected draft project without creating a task, then stages only the chosen file', async () => {
    const view = await fixture()
    await view.scope('a'); await view.type('@')
    expect(view.api.listProjectFiles).toHaveBeenCalledWith('a')
    expect(view.files()).toEqual(['file-README.md', 'file-ignored.txt'])
    expect(view.api.prepare).not.toHaveBeenCalled(); expect(view.api.listFilesFor).not.toHaveBeenCalled()
    // Browsing is not filtered by client-side ignore rules; recursive search belongs to the host.
    await view.type('分析 @README 保留尾句', 10)
    expect(view.api.searchProjectFiles).toHaveBeenCalledWith('a', 'README')
    expect(view.files()).toEqual(['file-src/README.md'])
    expect(view.api.prepare).not.toHaveBeenCalled()
    await view.click(document.querySelector('[data-suggestion-id="file-src/README.md"]'))
    expect(view.api.prepare).toHaveBeenCalledTimes(1)
    expect(view.api.prepare.mock.calls[0][0]).toBe('a')
    expect(view.api.stageAttachment).toHaveBeenCalledWith('prepared', 'src/README.md')
    expect(document.querySelector('[aria-label="待发送附件"]')?.textContent).toContain('README.md')
    expect(view.text()).toBe('分析 @src/README.md  保留尾句')
    expect(view.input().querySelector('[data-mira-prompt-reference="file"]')?.textContent).toBe('README.md')
    await view.settle(30)
    expect(document.getSelection()?.isCollapsed).toBe(true)
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(document.querySelector('[aria-label="发送任务"]')?.hasAttribute('disabled')).toBe(false)
  })

  it('supports + in a fresh draft, explains missing workspaces, and uses session scope when a task exists', async () => {
    const view = await fixture()
    await view.type('@')
    expect(view.fileGroup()?.textContent).toContain('请先选择项目')
    expect(view.api.listProjectFiles).not.toHaveBeenCalled(); expect(view.api.prepare).not.toHaveBeenCalled()
    await view.scope('a'); await view.type('')
    await view.click(document.querySelector('[aria-label="添加上下文"]')); await view.settle(10)
    expect(view.files()).toContain('file-README.md'); expect(view.api.prepare).not.toHaveBeenCalled()
    await view.scope('a', 'existing'); await view.type('@')
    expect(view.api.listFilesFor).toHaveBeenCalledWith('existing')
    expect(view.files()).toEqual(['file-session.md'])
    await view.type('@session')
    expect(view.api.searchFilesFor).toHaveBeenCalledWith('existing', 'session')
    expect(view.api.prepare).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'] as const)('rejects late project A search %s after switching to project B or a real task', async completion => {
    const view = await fixture(), old = deferred<HarnessWorkspaceFileSearchResult>()
    view.api.searchProjectFiles.mockImplementationOnce(() => old.promise)
    await view.scope('a'); await view.type('@needle')
    expect(view.api.searchProjectFiles).toHaveBeenCalledWith('a', 'needle')
    await view.scope('b'); await view.settle(140)
    expect(view.files()).toEqual(['file-src/README.md'])
    await act(async () => { if (completion === 'resolve') old.resolve(result('private-a.md')); else old.reject(new Error('A directory unavailable')) })
    expect(view.files()).toEqual(['file-src/README.md'])
    expect(view.fileGroup()?.textContent).not.toContain('A directory unavailable')
    await view.scope('b', 'task-b'); await view.type('@needle')
    expect(view.api.searchFilesFor).toHaveBeenCalledWith('task-b', 'needle')
    expect(view.files()).toEqual(['file-session-match.md'])
  })

  it('offers a real retry on a failed project query without falling back to another task or creating one', async () => {
    const view = await fixture()
    view.api.searchProjectFiles.mockRejectedValueOnce(new Error('项目文件搜索失败'))
    await view.scope('b'); await view.type('@README')
    expect(view.fileGroup()?.querySelector('[role="alert"]')?.textContent).toContain('项目文件搜索失败')
    await view.click(view.fileGroup()!.querySelector('button')); await view.settle(140)
    expect(view.files()).toEqual(['file-src/README.md'])
    expect(view.api.searchProjectFiles).toHaveBeenCalledTimes(2)
    expect(view.api.prepare).not.toHaveBeenCalled(); expect(view.api.searchFilesFor).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'] as const)('drops a late project browse %s when a real task becomes active', async completion => {
    const view = await fixture(), old = deferred<{ path: string; entries: HarnessWorkspaceFileSearchResult['entries'] }>()
    view.api.listProjectFiles.mockImplementationOnce(() => old.promise)
    await view.scope('a'); await view.type('@')
    expect(view.api.listProjectFiles).toHaveBeenCalledWith('a')
    await view.scope('b', 'task-b'); await view.type('@')
    await act(async () => { if (completion === 'resolve') old.resolve({ path: '', ...result('private-a.md') }); else old.reject(new Error('A browse failed')) })
    expect(view.files()).toEqual(['file-session.md'])
    expect(view.fileGroup()?.textContent).not.toContain('A browse failed')
    expect(view.api.prepare).not.toHaveBeenCalled()
  })

  it('does not stage a selected project A file if the draft moves to project B during preparation', async () => {
    const view = await fixture(), gate = deferred<void>(), prepare = view.api.prepare.getMockImplementation()!
    view.api.prepare.mockImplementationOnce(async (id, isCurrent) => { await gate.promise; return prepare(id, isCurrent) })
    await view.scope('a'); await view.type('@README')
    await view.click(document.querySelector('[data-suggestion-id="file-src/README.md"]'))
    expect(view.api.prepare).toHaveBeenCalledTimes(1)
    await view.scope('b')
    await act(async () => gate.resolve())
    expect(view.state.session).toBeUndefined()
    expect(view.api.stageAttachment).not.toHaveBeenCalled()
    expect(document.querySelector('[aria-label="待发送附件"]')).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(view.text()).toBe('@README')
  })

  it.each(['resolve', 'reject'] as const)('does not apply a slow selected-file %s to the next task', async completion => {
    const view = await fixture(), upload = deferred<{ path: string; name: string }>()
    view.api.stageAttachment.mockImplementationOnce(() => upload.promise)
    await view.scope('a'); await view.type('@README')
    await view.click(document.querySelector('[data-suggestion-id="file-src/README.md"]'))
    expect(view.api.stageAttachment).toHaveBeenCalledWith('prepared', 'src/README.md')
    await view.scope('b', 'task-b')
    await act(async () => { if (completion === 'resolve') upload.resolve({ path: 'mira-attachment:old-a', name: 'old-a.md' }); else upload.reject(new Error('old A read failed')) })
    expect(view.text()).toBe('')
    expect(document.querySelector('[aria-label="待发送附件"]')).toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
    await view.type('B任务的新输入')
    expect(view.text()).toBe('B任务的新输入')
  })

  it('invalidates a draft project search if its directory changes without changing the project id', async () => {
    const view = await fixture(), old = deferred<HarnessWorkspaceFileSearchResult>()
    view.api.searchProjectFiles.mockImplementationOnce(() => old.promise)
    await view.scope('a'); await view.type('@README')
    await act(async () => { view.state.projects[0] = { ...view.state.projects[0], directory: '/moved-a' }; view.render() })
    await view.settle(140)
    expect(view.api.searchProjectFiles).toHaveBeenCalledTimes(2)
    await act(async () => old.resolve(result('old-directory.md')))
    expect(view.files()).toEqual(['file-src/README.md'])
    expect(view.api.prepare).not.toHaveBeenCalled()
  })
})
