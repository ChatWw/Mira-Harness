// @vitest-environment happy-dom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraConversationContext, UserMessage } from '../apps/harness-react/src/components/conversation/MiraConversationMessages'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'

vi.mock('../apps/harness-react/src/components/conversation/markdown', () => ({ MessageMarkdown: () => null }))

let root: Root, container: HTMLDivElement, height: number, frames: Map<number, FrameRequestCallback>, resize: () => void
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  height = 350; frames = new Map(); let sequence = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await React.act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const content = '这是保留缩进的需求\n    需要原样复制和编辑\n'.repeat(12) + '折叠末尾定位词'
const controller = new PilotController({} as PilotHost)
async function render(text = content, id = 'long-prompt', sessionId = 'task-a') {
  await React.act(async () => root.render(<MiraConversationContext.Provider value={{ controller, sessionId, active: true, canRerun: true, running: false, waiting: false, tools: [], toolsById: new Map(), openChangesTab: vi.fn(), openFile: vi.fn(), openRunProgress: vi.fn(), openSubtask: vi.fn(), stopSubtask: vi.fn(async () => undefined) }}><UserMessage original={{ id, role: 'user', content: text, createdAt: 1 }} rendererId={id} /></MiraConversationContext.Provider>))
  await flush()
}
async function flush() { await React.act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }) }
const body = () => container.querySelector<HTMLElement>('[data-mira-user-body]')!
const toggle = () => body().querySelector<HTMLButtonElement>('button')!
const click = async () => React.act(async () => toggle().click())

describe('long user prompt reading', () => {
  it('starts collapsed with the full text still present and supports expand and collapse', async () => {
    await render()
    expect(body()).not.toBeNull()
    expect(body().querySelector('[data-mira-user-body-content]')?.textContent).toBe(content)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(toggle().getAttribute('aria-controls')).toBe(body().querySelector('[data-mira-user-body-content]')?.id)
    expect(toggle().getAttribute('aria-label')).toBe('展开消息')
    await click(); expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(toggle().getAttribute('aria-label')).toBe('收起消息')
    await click(); expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it.each([120, 121])('does not add an expand control to a %ipx prompt', async value => {
    height = value; await render('短消息')
    expect(body()).not.toBeNull(); expect(toggle()).toBeNull()
  })

  it('remeasures after a narrower pane wraps the prompt and removes the toggle when it fits again', async () => {
    height = 100; await render('随面板宽度换行的正文')
    expect(toggle()).toBeNull()
    height = 300; resize(); resize(); expect(frames.size).toBe(1); await flush()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    await click(); height = 100; resize(); await flush()
    expect(toggle()).toBeNull()
  })

  it('reveals a folded body for task-find without changing the original text', async () => {
    await render()
    await React.act(async () => body().dispatchEvent(new CustomEvent('mira-reveal-user-body')))
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(body().textContent).toContain('折叠末尾定位词')
  })

  it('retains usable dimensions while a task pane is hidden and remeasures on return', async () => {
    await render(); await click()
    const clipped = () => body().querySelector<HTMLElement>('[data-mira-user-body-content]')!
    expect(clipped().style.maxHeight).toBe('350px')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0)
    height = 0; resize(); await flush()
    expect(clipped().style.maxHeight).toBe('350px')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
    height = 600; resize(); await flush()
    expect(clipped().style.maxHeight).toBe('600px')
  })

  it('does not carry an expanded state into another message, task, or edited text', async () => {
    await render(); await click()
    await render(content, 'other'); expect(toggle().getAttribute('aria-expanded')).toBe('false')
    await click(); await render(content, 'other', 'task-b'); expect(toggle().getAttribute('aria-expanded')).toBe('false')
    await click(); await render(content + '补充', 'other', 'task-b'); expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('copies and edits the entire original prompt while its display is folded', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await render()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    await React.act(async () => container.querySelector<HTMLButtonElement>('[aria-label="复制消息"]')!.click())
    expect(copy).toHaveBeenCalledExactlyOnceWith(content)
    await React.act(async () => container.querySelector<HTMLButtonElement>('[aria-label="编辑并重跑"]')!.click())
    const editor = container.querySelector('[aria-label="编辑消息"]')!
    const readText = (node: Node): string => node.nodeName === 'BR' ? '\n' : node.nodeType === Node.TEXT_NODE ? node.textContent! : [...node.childNodes].map(readText).join('')
    expect(readText(editor)).toBe(content)
  })
})
