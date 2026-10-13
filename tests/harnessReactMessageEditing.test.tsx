// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserMessageEditor } from '../apps/harness-react/src/components/conversation/message-parts'
import type { HarnessFileReference, HarnessMessage, HarnessMessageAttachment } from '../src/config/harness'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import { miraBrowserPrompt } from '../apps/harness-react/src/lib/mira-browser-reference'
import { createMiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function historyController() {
  const host = { listFiles: vi.fn(async () => ({ entries: [{ name: 'notes.txt', path: 'notes.txt', type: 'file' }] })), searchFiles: vi.fn(async () => ({ entries: [{ name: 'notes.txt', path: 'notes.txt', type: 'file' }] })), listPluginCatalog: vi.fn(async () => []), listUserAgents: vi.fn(async () => []), importAttachments: vi.fn(), getAttachment: vi.fn(), selectAttachments: vi.fn(), stageAttachment: vi.fn() }
  const controller = new PilotController(host as unknown as PilotHost)
  const state = { ...controller.getSnapshot(), session: { id: 'task', projectId: 'project', workingDirectory: '/fixture', delegationEnabled: true } as any }
  vi.spyOn(controller, 'getSnapshot').mockImplementation(() => state)
  return { controller, host, state }
}
async function mount(content = '原始要求', attachments: HarnessMessageAttachment[] = [], controller?: PilotController) {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const props = { original: { id: 'user', role: 'user', content, attachments, createdAt: 1 } as HarnessMessage, content, controller, sessionId: controller ? 'task' : undefined, onCancel: vi.fn(), onConfirm: vi.fn<(next: string, references?: HarnessFileReference[]) => Promise<boolean>>(async () => false), disabled: false }
  const render = async () => { await act(async () => root!.render(<React.StrictMode><UserMessageEditor {...props} /></React.StrictMode>)) }
  await render()
  const input = () => container.querySelector<HTMLDivElement>('[aria-label="编辑消息"]')!
  const change = async (text: string) => {
    await act(async () => {
      input().focus()
      const range = document.createRange(); range.selectNodeContents(input())
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await act(async () => {
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: { getData: (format: string) => format === 'text/plain' ? text : '', types: ['text/plain'] } })
      input().dispatchEvent(event)
    })
  }
  const submit = () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => /保存并重跑|重新发送中/.test(button.textContent!))!
  const click = async (element: HTMLElement) => { await act(async () => element.click()) }
  const moveCaret = async (start: number, end = start) => {
    await act(async () => {
      const walker = document.createTreeWalker(input(), NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      let node: Node | null, offset = 0
      while ((node = walker.nextNode())) {
        const length = node.textContent!.length
        if (start >= offset && start <= offset + length) range.setStart(node, start - offset)
        if (end >= offset && end <= offset + length) { range.setEnd(node, end - offset); break }
        offset += length
      }
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
  }
  return { props, container, input, change, submit, render, click, moveCaret }
}

describe('history edit real DOM admission and draft recovery', () => {
  it.each(['/', '$'])('keeps the discovered %s query and full replacement span while moving within a historical token', async trigger => {
    const { controller } = historyController()
    vi.spyOn(controller, 'listSkills').mockResolvedValue([
      { id: 'research', name: 'Research', enabled: true, valid: true },
      { id: 'rewrite', name: 'Rewrite', enabled: true, valid: true },
    ] as any)
    const view = await mount('原要求', [], controller)
    await view.change(`前文 ${trigger}Research 后文`)
    await view.moveCaret(12)
    const candidates = () => [...document.querySelectorAll('.mira-composer-suggestions [data-suggestion-id]')].map(item => item.getAttribute('data-suggestion-id'))
    expect(candidates()).toEqual(['skill-research'])
    await view.moveCaret(6)
    expect(candidates()).toEqual(['skill-research'])
    await view.moveCaret(7)
    expect(candidates()).toEqual(['skill-research'])
    await view.click(document.querySelector<HTMLButtonElement>('[data-suggestion-id="skill-research"]')!)
    expect(view.input().textContent).toBe('前文 Research  后文')
    expect(view.props.onConfirm).not.toHaveBeenCalled(); expect(view.props.onCancel).not.toHaveBeenCalled()
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('前文 [$Research](mira-skill:research)  后文')
  })

  it('closes historical discovery outside its span, rediscovers on re-entry and refreshes after a text change', async () => {
    const { controller } = historyController()
    vi.spyOn(controller, 'listSkills').mockResolvedValue([
      { id: 'research', name: 'Research', enabled: true, valid: true },
      { id: 'rewrite', name: 'Rewrite', enabled: true, valid: true },
    ] as any)
    const view = await mount('原要求', [], controller)
    await view.change('前文 /Research 后文'); await view.moveCaret(12)
    await view.moveCaret(6, 7)
    expect(view.input().getAttribute('aria-expanded')).toBe('false')
    await view.moveCaret(12)
    expect(document.querySelector('[data-suggestion-id="skill-rewrite"]')).toBeNull()
    await view.moveCaret(3)
    expect(view.input().getAttribute('aria-expanded')).toBe('false')
    await view.moveCaret(6)
    expect(document.querySelector('[data-suggestion-id="skill-rewrite"]')).not.toBeNull()
    await view.change('前文 /Rewrite')
    expect(document.querySelector('[data-suggestion-id="skill-rewrite"]')).not.toBeNull()
    expect(document.querySelector('[data-suggestion-id="skill-research"]')).toBeNull()
    expect(view.props.onConfirm).not.toHaveBeenCalled()
  })

  it('groups historical slash command sources into commands, skills and subagents while bounding keyboard selection', async () => {
    const { controller, host } = historyController()
    vi.spyOn(controller, 'listSkills').mockResolvedValue([])
    Object.assign(host, { listPromptCommands: vi.fn(async () => [{ id: 'check', scope: 'project', name: 'check', revision: 'r', description: 'Review project' }, { id: 'blocked', scope: 'global', name: 'blocked', revision: 'r', unavailableReason: 'Skill 已停用' }]) })
    host.listPluginCatalog.mockResolvedValue([{ id: 'kit@local', name: 'kit', enabled: true, skills: [], commands: [{ name: 'check' }], agents: [], conflicts: [], unsupported: [] }] as any)
    const view = await mount('原要求', [], controller)
    await view.change('/')
    const panel = document.querySelector('.mira-composer-suggestions')!
    expect([...panel.querySelectorAll('[role="group"]')].map(group => group.getAttribute('aria-label'))).toEqual(['命令', '技能', '子智能体 · 引用后由主 Agent 按需委派'])
    const commands = panel.querySelector('[role="group"][aria-label="命令"]')!
    expect(commands.textContent).toContain('/check'); expect(commands.textContent).toContain('/kit:check')
    expect(commands.querySelector('[data-suggestion-id="custom-blocked"]')?.getAttribute('aria-disabled')).toBe('true')
    const selected = () => panel.querySelector('[aria-selected="true"]')?.getAttribute('data-suggestion-id')
    expect(selected()).toBe('custom-check')
    await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })))
    expect(selected()).toBe('custom-check')
    await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })))
    expect(selected()).toBe('command-kit@local-check')
    for (let i = 0; i < 15; i++) await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })))
    const last = selected()
    await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })))
    expect(selected()).toBe(last)
    expect(view.props.onConfirm).not.toHaveBeenCalled()
  })

  it('shows one command-position status in a historical slash menu and hides settled empty @ categories', async () => {
    const { controller } = historyController()
    vi.spyOn(controller, 'listSkills').mockResolvedValue([])
    const view = await mount('原要求', [], controller)
    await view.change('前文 /unmatched-name')
    expect(document.querySelectorAll('.mira-composer-suggestions [role="group"]')).toHaveLength(3)
    expect(document.querySelectorAll('.mira-composer-suggestions__status')).toHaveLength(3)
    expect(document.querySelector('.mira-composer-suggestions [aria-label="命令"]')?.textContent).toContain('命令需放在消息开头')
    await view.change('@rev')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 160)) })
    const groups = [...document.querySelectorAll('.mira-composer-suggestions [role="group"]')]
    expect(groups.some(group => group.getAttribute('aria-label') === '插件 Skill')).toBe(false)
    expect(groups.some(group => group.getAttribute('aria-label') === '对话')).toBe(false)
    expect(view.props.onConfirm).not.toHaveBeenCalled()
  })

  it('keeps available historical commands selectable when the plugin source fails', async () => {
    const { controller, host } = historyController()
    vi.spyOn(controller, 'listSkills').mockResolvedValue([])
    Object.assign(host, { listPromptCommands: vi.fn(async () => [{ id: 'check', scope: 'project', name: 'check', revision: 'r' }]) })
    host.listPluginCatalog.mockRejectedValue(new Error('插件目录不可用'))
    const view = await mount('原要求', [], controller)
    await view.change('/check')
    expect(document.querySelector('.mira-composer-suggestions [aria-label="命令"] [role="alert"]')?.textContent).toContain('插件命令：插件目录不可用')
    await view.click(document.querySelector<HTMLButtonElement>('[data-suggestion-id="custom-check"]')!)
    expect(view.input().querySelector('[data-mira-prompt-reference="command"]')?.textContent).toBe('/check')
    expect(view.props.onConfirm).not.toHaveBeenCalled()
  })

  it.each(['/', '$'])('inserts a canonical Skill through %s in historical editing without submitting', async trigger => {
    const { controller } = historyController()
    vi.spyOn(controller, 'listSkills').mockResolvedValue([{ id: 'research', name: 'Research', description: 'Research instructions', enabled: true, valid: true } as any])
    const view = await mount('原要求', [], controller)
    await view.change(`前文 ${trigger}Re`)
    const candidate = document.querySelector<HTMLButtonElement>('[data-suggestion-id="skill-research"]')!
    expect(candidate.textContent).toContain(trigger === '/' ? '$Research' : 'Research')
    await view.click(candidate)
    expect(view.input().querySelector('[data-mira-prompt-reference="skill"]')?.textContent).toBe('Research')
    expect(view.props.onConfirm).not.toHaveBeenCalled(); expect(view.props.onCancel).not.toHaveBeenCalled()
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('前文 [$Research](mira-skill:research)')
  })

  it('preserves a canonical Skill name beginning with $ in historical editing', async () => {
    const { controller } = historyController()
    vi.spyOn(controller, 'listSkills').mockResolvedValue([{ id: 'research', name: '$Research', enabled: true, valid: true } as any])
    const view = await mount('原要求', [], controller)
    await view.change('/Re')
    await view.click(document.querySelector<HTMLButtonElement>('[data-suggestion-id="skill-research"]')!)
    expect(view.input().querySelector('[data-mira-prompt-reference="skill"]')?.textContent).toBe('$Research')
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('[$$Research](mira-skill:research)')
  })

  it.each(['Enter', 'Tab'])('selects an @ agent with %s without submitting or cancelling the edit', async key => {
    const { controller } = historyController()
    const view = await mount('原要求', [], controller)
    await view.change('请 @rev')
    await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
    expect(view.input().querySelector('[data-mira-prompt-reference="agent"]')?.textContent).toBe('审查')
    expect(view.props.onConfirm).not.toHaveBeenCalled()
    expect(view.props.onCancel).not.toHaveBeenCalled()
  })

  it('keeps text typed while a file reference is loading and retains the staged attachment for an explicit retry', async () => {
    const { controller, host } = historyController()
    const stage = deferred<HarnessFileReference>()
    host.stageAttachment.mockReturnValue(stage.promise)
    host.getAttachment.mockResolvedValue({ path: 'mira-attachment:new', name: 'notes.txt', content: 'Frozen contents' })
    const view = await mount('原要求', [], controller)
    await view.change('请 @notes')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)) })
    await view.click(document.querySelector<HTMLButtonElement>('[data-suggestion-id="file-notes.txt"]')!)
    expect(view.submit().disabled).toBe(true)
    await view.change('读文件时继续写下的新要求')
    await act(async () => stage.resolve({ path: 'mira-attachment:new', name: 'notes.txt' }))
    expect(view.input().textContent).toBe('读文件时继续写下的新要求')
    expect(view.input().querySelector('[data-mira-prompt-reference="file"]')).toBeNull()
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('读取引用期间正文已修改')
    expect(view.container.querySelector('[aria-label="预览附件 notes.txt"]')).not.toBeNull()
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('读文件时继续写下的新要求', [expect.objectContaining({ path: 'mira-attachment:new', name: 'notes.txt' })])
  })

  it('coalesces picker clicks, preserves the old snapshot on a failed read, and permits retry', async () => {
    const { controller, host } = historyController()
    const picked = deferred<HarnessFileReference[]>()
    host.selectAttachments.mockReturnValueOnce(picked.promise).mockResolvedValueOnce([{ path: 'mira-attachment:new', name: 'new.txt' }])
    host.getAttachment.mockRejectedValueOnce(new Error('附件读取失败')).mockResolvedValueOnce({ path: 'mira-attachment:new', name: 'new.txt', content: 'New snapshot' })
    const view = await mount('保留要求', [{ path: 'old.txt', name: 'old.txt', content: 'Old snapshot' }], controller)
    const picker = view.container.querySelector<HTMLButtonElement>('[aria-label="添加历史消息附件"]')!
    await view.click(picker); await view.click(picker)
    expect(host.selectAttachments).toHaveBeenCalledOnce()
    await act(async () => picked.resolve([{ path: 'mira-attachment:new', name: 'new.txt' }]))
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('附件读取失败')
    expect(view.input().textContent).toBe('保留要求')
    expect(view.container.querySelector('[aria-label="预览附件 old.txt"]')).not.toBeNull()
    expect(view.container.querySelector('[aria-label="预览附件 new.txt"]')).toBeNull()
    await view.click(picker)
    expect(view.container.querySelector('[aria-label="预览附件 new.txt"]')).not.toBeNull()
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('保留要求', [expect.objectContaining({ path: 'old.txt' }), expect.objectContaining({ path: 'mira-attachment:new' })])
  })

  it('does not read an old task file after switching task during staging', async () => {
    const { controller, host, state } = historyController()
    const stage = deferred<HarnessFileReference>(); host.stageAttachment.mockReturnValue(stage.promise)
    const view = await mount('原要求', [], controller)
    await view.change('请 @notes')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)) })
    await view.click(document.querySelector<HTMLButtonElement>('[data-suggestion-id="file-notes.txt"]')!)
    state.session = { ...state.session, id: 'other' }
    await act(async () => stage.resolve({ path: 'mira-attachment:new', name: 'notes.txt' }))
    expect(host.getAttachment).not.toHaveBeenCalled()
    expect(view.input().textContent).toBe('请 @notes')
    expect(view.container.querySelector('[aria-label="消息附件"]')).toBeNull()
  })

  it.each(['paste', 'drop'])('imports %s files through the authorized attachment API without changing the draft', async kind => {
    const { controller, host } = historyController()
    host.importAttachments.mockResolvedValue([{ path: 'mira-attachment:paste', name: 'pasted.txt' }])
    host.getAttachment.mockResolvedValue({ path: 'mira-attachment:paste', name: 'pasted.txt', content: 'Pasted contents' })
    const view = await mount('保留正文', [], controller)
    const data = { types: ['Files'], files: [new File(['Pasted contents'], 'pasted.txt', { type: 'text/plain' })], getData: () => '', dropEffect: '' }
    const event = new Event(kind, { bubbles: true, cancelable: true })
    Object.defineProperty(event, kind === 'paste' ? 'clipboardData' : 'dataTransfer', { value: data })
    await act(async () => { view.input().dispatchEvent(event); await new Promise(resolve => setTimeout(resolve, 40)) })
    expect(event.defaultPrevented).toBe(true)
    expect(host.importAttachments).toHaveBeenCalledExactlyOnceWith('task', [{ name: 'pasted.txt', mediaType: 'text/plain', data: btoa('Pasted contents') }])
    expect(view.input().textContent).toBe('保留正文')
    expect(view.container.querySelector('[aria-label="预览附件 pasted.txt"]')).not.toBeNull()
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('保留正文', [expect.objectContaining({ path: 'mira-attachment:paste' })])
  })
  it('opens the shared @ candidates, inserts an atomic agent, and uses Escape to close candidates before cancelling', async () => {
    const host = { listFiles: vi.fn(async () => ({ entries: [] })), searchFiles: vi.fn(async () => ({ entries: [] })), listPluginCatalog: vi.fn(async () => []), listUserAgents: vi.fn(async () => []) } as unknown as PilotHost
    const controller = new PilotController(host)
    vi.spyOn(controller, 'getSnapshot').mockReturnValue({ ...controller.getSnapshot(), session: { id: 'task', projectId: 'project', workingDirectory: '/fixture', delegationEnabled: true } as any })
    const view = await mount('请核对', [], controller)
    await view.change('请 @rev')
    expect(view.input().getAttribute('aria-expanded')).toBe('true')
    const option = document.querySelector<HTMLButtonElement>('[data-suggestion-id="agent-reviewer"]')!
    expect(option.disabled).toBe(false)
    await view.click(option)
    expect(view.input().querySelector('[data-mira-prompt-reference="agent"]')?.textContent).toBe('审查')
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('请 @reviewer')
    expect(host.listPluginCatalog).toHaveBeenCalledWith('task')
    await view.change('请 @reviewer')
    await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(view.props.onCancel).not.toHaveBeenCalled()
    expect(view.input().getAttribute('aria-expanded')).toBe('false')
    await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(view.props.onCancel).toHaveBeenCalledOnce()
  })

  it('does not cancel when Radix already consumed Escape during document capture', async () => {
    const { controller } = historyController()
    const view = await mount('原要求', [], controller)
    // React may commit Radix closing before the native event reaches Lexical.
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    event.preventDefault()
    await act(async () => view.input().dispatchEvent(event))
    expect(view.props.onCancel).not.toHaveBeenCalled()
    expect(view.input().textContent).toBe('原要求')
  })

  it('inserts a catalog command without running it and retains the source identity for rerun', async () => {
    const listPromptCommands = vi.fn(async () => [{ id: 'command', name: 'check', description: '检查代码', scope: 'project' }])
    const host = { listSkills: vi.fn(async () => []), listPromptCommands, listPluginCatalog: vi.fn(async () => []), listUserAgents: vi.fn(async () => []) } as unknown as PilotHost
    const controller = new PilotController(host)
    vi.spyOn(controller, 'getSnapshot').mockReturnValue({ ...controller.getSnapshot(), session: { id: 'task', workingDirectory: '/fixture' } as any })
    const view = await mount('', [], controller)
    await view.click(view.container.querySelector<HTMLButtonElement>('[aria-label="命令与能力"]')!)
    expect(view.input().textContent).toBe('/')
    const option = document.querySelector<HTMLButtonElement>('[data-suggestion-id="custom-command"]')!
    await view.click(option)
    expect(view.input().querySelector('[data-mira-prompt-reference="command"]')?.textContent).toBe('/check')
    expect(view.props.onConfirm).not.toHaveBeenCalled()
    expect(listPromptCommands).toHaveBeenCalledWith({ sessionId: 'task' })
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('/check')
  })

  it('retains attachment snapshots on cancel/refusal and submits explicit empty lists on removal', async () => {
    const attachments = [{ path: 'notes.txt', name: 'notes.txt', content: 'Original snapshot' }]
    const view = await mount('原要求', attachments)
    await view.click(view.container.querySelector<HTMLButtonElement>('[aria-label="移除附件 notes.txt"]')!)
    expect(view.container.querySelector('[aria-label="预览附件 notes.txt"]')).toBeNull()
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenCalledExactlyOnceWith('原要求', [])
    expect(view.props.original.attachments).toEqual(attachments)
    expect(view.input().textContent).toBe('原要求')
    await view.click([...view.container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '取消')!)
    expect(view.props.onCancel).toHaveBeenCalledOnce()
  })

  it('permits an attachment-only edit and disables it only after all attachments are removed', async () => {
    const view = await mount('', [{ path: 'notes.txt', name: 'notes.txt', content: 'Snapshot' }])
    expect(view.submit().disabled).toBe(false)
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenCalledExactlyOnceWith('', [{ path: 'notes.txt', name: 'notes.txt', mediaType: undefined, size: undefined }])
    await view.click(view.container.querySelector<HTMLButtonElement>('[aria-label="移除附件 notes.txt"]')!)
    expect(view.submit().disabled).toBe(true)
  })

  it('allows context-only rerun, blocks an empty draft after removing it, and leaves the original intact on cancel', async () => {
    const element = { pageUrl: 'https://mira.test/page', pageTitle: 'Mira page', tagName: 'button', role: 'button', accessibleName: '继续', selector: '#go', xpath: '/html/body/button', text: '继续', nearbyText: '', htmlExcerpt: '', attributes: '', style: '', rect: { x: 0, y: 0, width: 80, height: 28 } }
    const result = miraBrowserPrompt({ sessionId: 'task', browserId: 'browser:one', element }, createMiraPromptDocument(''))
    if ('error' in result) throw new Error(result.error)
    const view = await mount(result.reference.text)
    expect(view.input().textContent).toBe('')
    expect(view.submit().disabled).toBe(false)
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenCalledExactlyOnceWith(result.reference.text.trim())
    const alert = view.container.querySelector('[role="alert"]')!
    expect(view.input().getAttribute('aria-describedby')).toBe(alert.id)
    await view.click(view.container.querySelector<HTMLButtonElement>('[aria-label="移除全部网页元素上下文"]')!)
    expect(view.submit().disabled).toBe(true)
    expect(document.activeElement).toBe(view.input())
    await view.click([...view.container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '取消')!)
    expect(view.props.onCancel).toHaveBeenCalledOnce()
    expect(view.props.original.content).toBe(result.reference.text)
  })

  it('retains modified text after a refused submission and permits one successful retry', async () => {
    const view = await mount(); await view.change('修改后的要求')
    await view.click(view.submit())
    expect(view.input().textContent).toBe('修改后的要求')
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('重新发送')
    expect(view.submit().disabled).toBe(false)
    view.props.onConfirm.mockResolvedValueOnce(true)
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenCalledTimes(2)
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('修改后的要求')
    expect(view.container.querySelector('[role="alert"]')).toBeNull()
  })

  it('preserves text on a rejected promise and shows the actual failure', async () => {
    const view = await mount(); await view.change('保留这段草稿')
    view.props.onConfirm.mockRejectedValueOnce(new Error('模型暂不可用'))
    await view.click(view.submit())
    expect(view.input().textContent).toBe('保留这段草稿')
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('模型暂不可用')
    expect(view.submit().disabled).toBe(false)
  })

  it('blocks waiting/loading state and ignores duplicate submissions while admission is pending', async () => {
    const view = await mount(); view.props.disabled = true; await view.render()
    expect(view.submit().disabled).toBe(true)
    await view.click(view.submit()); expect(view.props.onConfirm).not.toHaveBeenCalled()
    view.props.disabled = false; await view.render()
    const pending = deferred<boolean>(); view.props.onConfirm.mockReturnValueOnce(pending.promise)
    await view.click(view.submit()); await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenCalledOnce()
    expect(view.input().getAttribute('contenteditable')).toBe('false')
    expect(view.container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
    await act(async () => pending.resolve(false))
    expect(view.submit().disabled).toBe(false)
    expect(view.input().textContent).toBe('原始要求')
  })

  it('uses Escape to cancel but yields Escape to an active Chinese input composition', async () => {
    const view = await mount()
    await act(async () => view.input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', isComposing: true })))
    expect(view.props.onCancel).not.toHaveBeenCalled()
    await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', keyCode: 229 })))
    expect(view.props.onCancel).not.toHaveBeenCalled()
    await act(async () => view.input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await act(async () => view.input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })))
    expect(view.props.onCancel).toHaveBeenCalledOnce()
  })
})
