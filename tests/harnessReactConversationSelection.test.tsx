// @vitest-environment happy-dom
import React, { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraSelectionActions } from '../apps/harness-react/src/components/conversation/MiraSelectionActions'
import { inspectMiraConversationSelection, miraSelectionPrompt, type MiraConversationSelection } from '../apps/harness-react/src/lib/mira-conversation-selection'
import { createMiraPromptDocument, validateMiraPromptDocument, type MiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'

let renderer: Root | undefined
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({ left: 80, top: 120, bottom: 140, width: 200, height: 20 } as DOMRect)
})
afterEach(async () => {
  await act(async () => renderer?.unmount()); renderer = undefined
  document.getSelection()?.removeAllRanges(); document.body.replaceChildren()
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

const rowHtml = '<div data-renderer-message-id="reply"><div data-mira-selectable="assistant" data-mira-selection-region="text-1"><p>真实回复内容</p><button>复制</button><p>第二段正文</p></div><div data-mira-selectable="reasoning" data-mira-selection-region="thinking-1">原始思考</div></div><div data-renderer-message-id="user"><div data-mira-selectable="user">用户原文</div></div><div contenteditable="true">输入草稿</div>'
function range(start: Node, end = start, startOffset = 0, endOffset = end.textContent!.length) {
  const selection = document.getSelection()!, selected = document.createRange()
  selected.setStart(start, startOffset); selected.setEnd(end, endOffset)
  selection.removeAllRanges(); selection.addRange(selected)
}
async function fixture() {
  const container = document.createElement('div'); document.body.append(container)
  renderer = createRoot(container)
  const add = vi.fn<(_reference: MiraConversationSelection) => boolean>(() => true)
  function View({ sessionId = 'current', enabled = true }) {
    const ref = useRef<HTMLDivElement>(null)
    return <><div ref={ref} id="timeline" dangerouslySetInnerHTML={{ __html: rowHtml }} /><MiraSelectionActions rootRef={ref} sessionId={sessionId} enabled={enabled} onAdd={add} /></>
  }
  await act(async () => renderer!.render(<View />))
  const root = document.getElementById('timeline')!
  const select = async (selector = '[data-mira-selectable="assistant"] p') => {
    await act(async () => { range(root.querySelector(selector)!.firstChild!); root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await vi.advanceTimersByTimeAsync(20) })
  }
  const render = async (sessionId: string, enabled = true) => { await act(async () => renderer!.render(<View sessionId={sessionId} enabled={enabled} />)) }
  return { root, add, select, render }
}

describe('Mira selected conversation references', () => {
  it('accepts only one eligible region and rejects cross-message, cross-part, input and control endpoints', () => {
    const root = document.createElement('div'); root.innerHTML = rowHtml; document.body.append(root)
    const paragraphs = root.querySelectorAll('p'), first = paragraphs[0].firstChild!, last = paragraphs[1].firstChild!
    range(first, last)
    expect(inspectMiraConversationSelection(root, 'current')?.reference).toMatchObject({ sessionId: 'current', messageId: 'reply', regionId: 'text-1', kind: 'assistant' })
    for (const end of [root.querySelector('[data-mira-selectable="reasoning"]')!.firstChild!, root.querySelector('[data-mira-selectable="user"]')!.firstChild!, root.querySelector('button')!.firstChild!, root.querySelector('[contenteditable]')!.firstChild!]) {
      range(first, end); expect(inspectMiraConversationSelection(root, 'current')).toBeUndefined()
    }
    range(root.querySelector('[data-mira-selectable="reasoning"]')!.firstChild!)
    expect(inspectMiraConversationSelection(root, 'current')?.reference.kind).toBe('reasoning')
    root.append(Object.assign(document.createElement('div'), { role: 'dialog' }))
    root.lastElementChild!.setAttribute('aria-modal', 'true')
    expect(inspectMiraConversationSelection(root, 'current')).toBeUndefined()
  })

  it('adds the exact selected snapshot once and clears the native range only after acceptance', async () => {
    const view = await fixture(); await view.select()
    const button = document.querySelector<HTMLButtonElement>('[data-mira-selection-menu] button')!
    expect(button.textContent).toBe('添加到当前任务')
    await act(async () => button.click())
    expect(view.add).toHaveBeenCalledExactlyOnceWith({ sessionId: 'current', messageId: 'reply', regionId: 'text-1', kind: 'assistant', text: '真实回复内容' })
    expect(document.getSelection()?.isCollapsed).toBe(true)
    expect(document.querySelector('[data-mira-selection-menu]')).toBeNull()
  })

  it('refuses stale selected DOM and hides on task changes, scrolling and resize', async () => {
    const view = await fixture(); await view.select()
    view.root.querySelector('p')!.textContent = '流式更新后的文本'
    await act(async () => document.querySelector<HTMLButtonElement>('[data-mira-selection-menu] button')!.click())
    expect(view.add).not.toHaveBeenCalled()
    await view.select(); await view.render('another')
    expect(document.querySelector('[data-mira-selection-menu]')).toBeNull()
    for (const target of [view.root, window]) {
      await view.select()
      expect(document.querySelector('[data-mira-selection-menu]')).not.toBeNull()
      await act(async () => target.dispatchEvent(new Event(target === window ? 'resize' : 'scroll')))
      expect(document.querySelector('[data-mira-selection-menu]')).toBeNull()
    }
    await view.select(); await view.render('another', false)
    expect(document.querySelector('[data-mira-selection-menu]')).toBeNull()
  })

  it('consumes bare Escape before the Composer stop shortcut and does not reopen on keyup', async () => {
    const view = await fixture(); await view.select()
    const composing = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true })
    await act(async () => document.dispatchEvent(composing))
    expect(composing.defaultPrevented).toBe(false)
    expect(document.querySelector('[data-mira-selection-menu]')).not.toBeNull()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    let seenPrevented = false
    const stop = (event: KeyboardEvent) => { seenPrevented = event.defaultPrevented }
    window.addEventListener('keydown', stop)
    await act(async () => { document.dispatchEvent(escape); document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true })); await vi.advanceTimersByTimeAsync(20) })
    window.removeEventListener('keydown', stop)
    expect(seenPrevented).toBe(true)
    expect(document.querySelector('[data-mira-selection-menu]')).toBeNull()
  })

  it('preserves 8000-character snapshots, enforces eight/16000 limits, and deduplicates restored pills', () => {
    const base = { sessionId: 'current', messageId: 'reply', regionId: 'text', kind: 'assistant' as const, text: '原始正文' }
    const document: MiraPromptDocument = createMiraPromptDocument('已有草稿')
    const add = (reference: MiraConversationSelection) => {
      const result = miraSelectionPrompt(reference, document)
      if (!('error' in result) && !result.duplicate) document.parts.push({ type: 'reference', reference: result.reference })
      return result
    }
    for (let index = 0; index < 8; index++) expect(add({ ...base, regionId: `part-${index}` })).not.toHaveProperty('error')
    expect(add(base)).toHaveProperty('error', expect.stringContaining('8 个'))
    const restored = validateMiraPromptDocument(JSON.parse(JSON.stringify(document)))!
    expect(miraSelectionPrompt({ ...base, regionId: 'part-0' }, restored)).toHaveProperty('duplicate', true)
    expect(miraSelectionPrompt({ ...base, text: '字'.repeat(8001) }, createMiraPromptDocument(''))).toHaveProperty('error')
    const first = miraSelectionPrompt({ ...base, text: '字'.repeat(8000) }, createMiraPromptDocument(''))
    if ('error' in first) throw new Error(first.error)
    const large: MiraPromptDocument = { version: 1, parts: [{ type: 'reference', reference: first.reference }] }
    const second = miraSelectionPrompt({ ...base, regionId: 'second', text: '另'.repeat(8000) }, large)
    expect(second).not.toHaveProperty('error')
    if ('error' in second) throw new Error(second.error)
    large.parts.push({ type: 'reference', reference: second.reference })
    expect(miraSelectionPrompt({ ...base, regionId: 'third', text: '字' }, large)).toHaveProperty('error', expect.stringContaining('16000'))
  })
})
