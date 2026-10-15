import * as React from 'react'
import { act } from 'react'
import { Window } from 'happy-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MiraPromptEditorHandle } from '../apps/harness-react/src/components/composer/MiraPromptEditor'
import type { MiraPromptDocument, MiraPromptPart, MiraPromptSelectionRange } from '../apps/harness-react/src/lib/prompt-editor-document'

let dom: Window, unmount: (() => Promise<void>) | undefined
beforeEach(() => {
  dom = new Window({ url: 'http://localhost' })
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLDivElement', 'Element', 'Node', 'Text', 'DocumentFragment', 'Range', 'Selection', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'ClipboardEvent', 'CompositionEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    const value = (dom as unknown as Record<string, unknown>)[name]
    vi.stubGlobal(name, typeof value === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? value.bind(dom) : value)
  }
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  dom.document.body.innerHTML = '<button id="outside">Other action</button><div id="root"></div>'
})
afterEach(async () => {
  await unmount?.(); unmount = undefined
  dom.happyDOM.abort(); vi.unstubAllGlobals()
})

const file: Extract<MiraPromptPart, { type: 'reference' }> = { type: 'reference', reference: { id: 'file-one', kind: 'file', label: 'read.md', value: 'mira-attachment:frozen', text: '@src/deep/read.md' } }
const session: Extract<MiraPromptPart, { type: 'reference' }> = { type: 'reference', reference: { id: 'session-one', kind: 'session', label: '相关对话', value: 'session-one', text: '用户：真实问题\n助手：完整正文\n'.repeat(300) } }

async function fixture(initialText = '', initialDocument?: MiraPromptDocument) {
  const { MiraPromptEditor } = await import('../apps/harness-react/src/components/composer/MiraPromptEditor')
  const { serializeMiraPromptDocument } = await import('../apps/harness-react/src/lib/prompt-editor-document')
  const { createRoot } = await import('react-dom/client')
  const ref = React.createRef<MiraPromptEditorHandle>()
  const root = createRoot(document.getElementById('root')!)
  let text = initialText, richDocument = initialDocument, owner = 'a', selection: MiraPromptSelectionRange = { start: 0, end: 0 }
  const changed = vi.fn(), error = vi.fn(), keydown = vi.fn(), paste = vi.fn()
  const history = vi.fn((_direction: 'up' | 'down') => false)
  function render() {
    root.render(<MiraPromptEditor key={owner} ref={ref} text={text} document={richDocument} aria-label="任务内容" onChange={(next, range) => { richDocument = next; text = serializeMiraPromptDocument(next); selection = range; changed(next, range); render() }} onSelectionChange={next => { selection = next }} onKeyDown={keydown} onHistoryNavigate={history} onPaste={paste} onError={error} />)
  }
  await act(async () => { render() })
  unmount = async () => { await act(async () => root.unmount()) }
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
  const input = () => document.querySelector<HTMLDivElement>('[role="textbox"]')!
  const replace = async (start: number, end: number, parts: MiraPromptPart[]) => { await act(async () => { ref.current!.replaceRange({ start, end }, parts) }); await settle() }
  const select = async (start: number, end = start) => { await act(async () => { ref.current!.focus(); ref.current!.setSelectionRange(start, end) }); await settle() }
  const key = async (key: string, options: KeyboardEventInit = {}) => { await act(async () => { input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })) }); await settle() }
  const clipboard = async (type: string, content = '', fail = false) => {
    const setData = vi.fn(() => { if (fail) throw new Error('Clipboard unavailable') })
    const getData = vi.fn((format: string) => format === 'text/plain' ? content : '<b>unsafe</b>')
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { setData, getData, types: ['text/plain', 'text/html', 'application/x-lexical-editor'] } })
    await act(async () => { input().dispatchEvent(event) }); await settle()
    return { event, setData, getData }
  }
  return { ref, input, replace, select, key, clipboard, settle, changed, error, keydown, paste, history, get text() { return text }, get document() { return richDocument }, get selection() { return selection }, update: async (next: string, nextDocument?: MiraPromptDocument, nextOwner = owner) => { await act(async () => { text = next; richDocument = nextDocument; owner = nextOwner; render() }); await settle() } }
}

describe('Mira Lexical prompt editor', () => {
  it('exposes its own undo stack to the native context menu and handles native history commands', async () => {
    const view = await fixture('原始草稿')
    expect(view.input().dataset.miraCanUndo).toBe('false')
    await view.select(4); await view.replace(4, 4, [{ type: 'text', text: '修改' }])
    expect(view.input().dataset.miraCanUndo).toBe('true')
    const history = async (action: string) => {
      await act(async () => { view.input().dispatchEvent(new window.CustomEvent('mira-prompt-history', { detail: action })) })
      await view.settle()
    }
    await history('undo')
    expect(view.text).toBe('原始草稿')
    expect(view.input().dataset.miraCanRedo).toBe('true')
    await history('redo')
    expect(view.text).toBe('原始草稿修改')
    await view.update('另一个任务', undefined, 'b')
    expect(view.input().dataset.miraCanUndo).toBe('false')
    expect(view.input().dataset.miraCanRedo).toBe('false')
  })
  it('copies a Chinese command chip as its canonical command and deletes the chip with its spacer in one Backspace', async () => {
    const command: MiraPromptPart = { type: 'reference', reference: { id: 'goal-chip', kind: 'command', label: '持续目标', value: 'builtin:goal', text: '/goal' } }
    const view = await fixture('/goal ', { version: 1, parts: [command, { type: 'text', text: ' ' }] })
    expect(view.input().querySelector('[data-mira-prompt-reference="command"]')?.textContent).toBe('持续目标')
    await view.select(0, 5)
    expect((await view.clipboard('copy')).setData).toHaveBeenCalledWith('text/plain', '/goal')
    await view.select(6); await view.key('Backspace')
    expect(view.text).toBe('')
    await view.key('z', { ctrlKey: true })
    expect(view.text).toBe('/goal ')
    expect(view.input().querySelector('[data-mira-prompt-reference="command"]')?.textContent).toBe('持续目标')
  })
  it('offers unmodified arrows to history only after candidate handlers, without disturbing IME or modified selection', async () => {
    const view = await fixture(); await view.select(0)
    view.history.mockReturnValue(true)
    await view.key('ArrowUp'); await view.key('ArrowDown')
    expect(view.history.mock.calls).toEqual([['up'], ['down']])
    view.history.mockClear()
    for (const modifier of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey', 'isComposing']) await view.key('ArrowUp', { [modifier]: true })
    await view.key('ArrowDown', { keyCode: 229 } as KeyboardEventInit)
    expect(view.history).not.toHaveBeenCalled()
    view.keydown.mockImplementation((event: KeyboardEvent) => { if (event.key === 'ArrowDown') event.preventDefault() })
    await view.key('ArrowDown'); expect(view.history).not.toHaveBeenCalled()
    expect(view.text).toBe(''); expect(view.error).not.toHaveBeenCalled()
  })
  it('keeps the localized child role atomic and copies its actual @role request', async () => {
    const agent: MiraPromptPart = { type: 'reference', reference: { id: 'agent-chip', kind: 'agent', label: '审查', value: 'reviewer', text: '@reviewer' } }
    const view = await fixture('before after')
    await view.replace(7, 7, [agent]); await view.select(7, 16)
    expect(view.input().querySelector('[data-mira-prompt-reference="agent"]')?.textContent).toBe('审查')
    expect((await view.clipboard('copy')).setData).toHaveBeenCalledWith('text/plain', '@reviewer')
    await view.select(16); await view.key('Backspace'); expect(view.text).toBe('before after')
    await view.key('z', { ctrlKey: true }); expect(view.text).toBe('before @reviewerafter')
    expect(view.document?.parts.find(part => part.type === 'reference')).toEqual(agent)
  })
  it('deletes and undoes a plugin as one chip while retaining its stable identity', async () => {
    const plugin: MiraPromptPart = { type: 'reference', reference: { id: 'plugin-chip', kind: 'plugin', label: 'review-kit', value: 'review-kit@local', text: '[@review-kit](plugin://review-kit@local)' } }
    const view = await fixture('before after')
    await view.replace(7, 7, [plugin]); await view.select(7 + plugin.reference.text.length)
    expect(view.input().querySelector('[data-mira-prompt-reference="plugin"]')?.textContent).toBe('review-kit')
    await view.key('Backspace'); expect(view.text).toBe('before after')
    await view.key('z', { ctrlKey: true }); expect(view.text).toBe(`before ${plugin.reference.text}after`)
    expect(view.document?.parts.find(part => part.type === 'reference')).toEqual(plugin)
  })
  it('deletes and undoes a skill chip atomically without losing its submitted identity', async () => {
    const skill: MiraPromptPart = { type: 'reference', reference: { id: 'skill-chip', kind: 'skill', label: 'Research', value: 'research', text: '[$Research](mira-skill:research)' } }
    const view = await fixture('before after')
    await view.replace(7, 7, [skill]); await view.select(7 + skill.reference.text.length)
    expect(view.input().querySelector('[data-mira-prompt-reference="skill"]')?.textContent).toBe('Research')
    await view.key('Backspace'); expect(view.text).toBe('before after')
    await view.key('z', { ctrlKey: true }); expect(view.text).toBe(`before ${skill.reference.text}after`)
    expect(view.document?.parts.find(part => part.type === 'reference')).toEqual(skill)
  })

  it('renders compact reference labels while serializing the actual session text and exact newlines', async () => {
    const view = await fixture('before\n\nafter\n')
    await view.replace(8, 8, [session])
    expect(view.text).toBe(`before\n\n${session.reference.text}after\n`)
    expect(view.input().textContent).toContain('相关对话')
    expect(view.input().textContent).not.toContain('真实问题')
    expect(view.document?.parts.some(part => part.type === 'reference')).toBe(true)
    expect(view.error).not.toHaveBeenCalled()
  })

  it('replaces only a middle token and reports canonical caret offsets', async () => {
    const view = await fixture('分析 @rea 保留尾句')
    await view.replace(3, 7, [file])
    expect(view.text).toBe(`分析 ${file.reference.text} 保留尾句`)
    expect(view.ref.current!.getSelectionRange()).toEqual({ start: 3 + file.reference.text.length, end: 3 + file.reference.text.length })
    await view.select(4, 6)
    expect(view.ref.current!.getSelectionRange()).toEqual({ start: 3, end: 3 + file.reference.text.length })
  })

  it.each(['Backspace', 'Delete'])('deletes a reference atomically with %s and supports undo/redo through controlled echoes', async key => {
    const view = await fixture('ab')
    await view.replace(1, 1, [file])
    await view.select(key === 'Backspace' ? 1 + file.reference.text.length : 1)
    await view.key(key)
    expect(view.text).toBe('ab')
    await view.key('z', { ctrlKey: true })
    expect(view.text).toBe(`a${file.reference.text}b`)
    await view.key('y', { ctrlKey: true })
    expect(view.text).toBe('ab')
  })

  it('copies/cuts canonical text including whole intersecting references, and preserves input if clipboard writing fails', async () => {
    const view = await fixture('head tail')
    await view.replace(5, 5, [session])
    await view.select(5, 5 + session.reference.text.length)
    const copy = await view.clipboard('copy')
    expect(copy.setData).toHaveBeenCalledWith('text/plain', session.reference.text)
    expect(view.text).toBe(`head ${session.reference.text}tail`)
    const failed = await view.clipboard('cut', '', true)
    expect(failed.event.defaultPrevented).toBe(true)
    expect(view.text).toBe(`head ${session.reference.text}tail`)
    await view.clipboard('cut')
    expect(view.text).toBe('head tail')
  })

  it('pastes external content as plain text with exact line breaks, without restoring opaque tokens or HTML', async () => {
    const view = await fixture('ab')
    await view.select(1)
    await view.clipboard('paste', '\n<script>plain text</script>\n\n')
    expect(view.text).toBe('a\n<script>plain text</script>\n\nb')
    expect(view.document?.parts.every(part => part.type === 'text')).toBe(true)
    expect(view.input().querySelector('script')).toBeNull()
    expect(view.paste).toHaveBeenCalledTimes(1)
  })

  it('restores only a matching owner document, clears externally and never steals another control focus', async () => {
    const doc: MiraPromptDocument = { version: 1, parts: [file] }
    const view = await fixture(file.reference.text, doc)
    expect(view.input().querySelector('[data-mira-prompt-reference]')).not.toBeNull()
    document.getElementById('outside')!.focus()
    await view.update('owner b plain text', doc, 'b')
    expect(view.input().querySelector('[data-mira-prompt-reference]')).toBeNull()
    expect(document.activeElement?.id).toBe('outside')
    await view.update('')
    expect(view.input().textContent).toBe('')
    expect(document.activeElement?.id).toBe('outside')
  })

  it('publishes rich metadata even when converting plain text to a reference with identical canonical text', async () => {
    const view = await fixture(file.reference.text)
    await view.replace(0, view.text.length, [file])
    expect(view.text).toBe(file.reference.text)
    expect(view.changed).toHaveBeenCalled()
    expect(view.document?.parts).toEqual([file])
    expect(view.input().querySelector('[data-mira-prompt-reference]')?.textContent).toBe('read.md')
  })

  it('cannot undo another owner document or resurrect text after an authoritative external clear', async () => {
    const view = await fixture('owner-a')
    await view.replace(7, 7, [file])
    await view.update('owner-b', undefined, 'b')
    await view.select(7); await view.key('z', { ctrlKey: true })
    expect(view.text).toBe('owner-b')
    await view.replace(7, 7, [file])
    await view.update('')
    await view.select(0); await view.key('z', { ctrlKey: true })
    expect(view.text).toBe('')
    expect(view.input().querySelector('[data-mira-prompt-reference]')).toBeNull()
  })

  it('expands native partial reference selections for copy/cut while keeping boundary-touching text separate', async () => {
    const view = await fixture('ab')
    await view.replace(1, 1, [file]); await view.select(1)
    const tokenText = view.input().querySelector('[data-mira-prompt-reference]')!.firstChild!
    const native = window.getSelection()!, selected = document.createRange()
    selected.setStart(tokenText, 1); selected.setEnd(tokenText, 3)
    await act(async () => { native.removeAllRanges(); native.addRange(selected); document.dispatchEvent(new Event('selectionchange')) })
    const copy = await view.clipboard('copy')
    expect(copy.setData).toHaveBeenCalledWith('text/plain', file.reference.text)
    await view.clipboard('cut')
    expect(view.text).toBe('ab')
    await view.replace(1, 1, [file]); await view.select(0, 1)
    const preceding = await view.clipboard('cut')
    expect(preceding.setData).toHaveBeenCalledWith('text/plain', 'a')
    expect(view.text).toBe(`${file.reference.text}b`)
  })

  it('offers parent keyboard interception before Lexical defaults and preserves composing input', async () => {
    const view = await fixture('draft')
    await view.select(5)
    view.keydown.mockImplementation((event: KeyboardEvent) => { if (!event.isComposing && event.key === 'Enter') event.preventDefault() })
    await view.key('Enter')
    expect(view.text).toBe('draft')
    await view.key('Enter', { isComposing: true })
    expect(view.keydown).toHaveBeenCalledTimes(2)
    expect(view.keydown.mock.calls[1][0].isComposing).toBe(true)
    expect(view.text).toBe('draft')
    expect(view.error).not.toHaveBeenCalled()
  })
})
