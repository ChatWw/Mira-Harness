// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AssistantMessageParts } from '../apps/harness-react/src/components/conversation/AssistantMessageParts'
import { MiraQueuedSummary, MiraStreamEntrance } from '../apps/harness-react/src/components/conversation/MiraStreamMotion'
import { MiraWorkingIndicator } from '../apps/harness-react/src/components/conversation/MiraWorkingIndicator'
import type { HarnessMessage } from '../src/config/harness'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const message = (text: string, state: 'streaming' | 'complete' = 'streaming'): HarnessMessage => ({ id: 'live', role: 'assistant', content: '', createdAt: 1, parts: [{ id: 'thought', type: 'reasoning', text, state, startedAt: 1 }] })
const render = async (text: string, state: 'streaming' | 'complete' = 'streaming') => { await act(async () => root.render(<AssistantMessageParts message={message(text, state)} toolsById={new Map()} streaming={state === 'streaming'} />)) }

it('shows the latest nonempty line and follows growing thought text to the end', async () => {
  await render('old line\nlatest thought\n\n')
  const preview = container.querySelector<HTMLElement>('.mira-reasoning__preview')!
  expect(preview.textContent).toBe('latest thought'); expect(preview.scrollLeft).toBe(1000)
  expect(preview.dataset.overflow).toBe('true')
  await render('old line\nlatest thought with more tokens')
  expect(preview.textContent).toBe('latest thought with more tokens'); expect(preview.scrollLeft).toBe(1000)
  await render('old line\nlatest thought', 'complete')
  expect(container.querySelector('.mira-reasoning__preview')).toBeNull()
  expect(container.querySelector('details')?.open).toBe(false)
})

it('lets the user expand the full thought and removes the duplicate preview', async () => {
  await render('old line\nlatest thought')
  await act(async () => { const details = container.querySelector('details')!; details.open = true; details.dispatchEvent(new Event('toggle')) })
  expect(container.querySelector('.mira-reasoning__content')?.textContent).toBe('old line\nlatest thought')
  expect(container.querySelector('.mira-reasoning__preview')).toBeNull()
})

it('keeps the work indicator through reasoning and tool execution and removes it on waiting/completion', async () => {
  for (const running of [true, true, false, true, false]) {
    await act(async () => root.render(<MiraWorkingIndicator running={running} />))
    expect(Boolean(container.querySelector('[role="status"]'))).toBe(running)
    if (running) { expect(container.textContent).toBe('Mira 正在努力工作中～'); expect(container.querySelector('svg.animate-spin')).not.toBeNull() }
  }
})

it('uses the thinking icon throughout the stream and sweeps only the running title', async () => {
  await render('公开思考内容')
  expect(container.querySelector('.lucide-brain')).not.toBeNull()
  expect(container.querySelector('.animate-spin')).toBeNull()
  expect(container.querySelector('.mira-process-sweep')?.textContent).toBe('正在思考')
  await render('公开思考内容', 'complete')
  expect(container.querySelector('.lucide-brain')).not.toBeNull()
  expect(container.querySelector('.mira-process-sweep')).toBeNull()
})

it('queues summary changes with ZCode hold timing and refreshes the same line without replay', async () => {
  vi.useFakeTimers()
  try {
    const show = async (key: string, text: string, enabled = true) => act(async () => root.render(<MiraQueuedSummary contentKey={key} version={text} enabled={enabled}>{text}</MiraQueuedSummary>))
    await show('a', '第一条')
    await show('a', '第一条追加')
    expect(container.textContent).toBe('第一条追加')
    expect(container.querySelector('.mira-summary-roll__current')).toBeNull()
    await show('b', '第二条')
    await show('c', '第三条')
    await show('d', '第四条')
    await show('e', '最新条')
    expect(container.querySelector('.mira-summary-roll__current')?.textContent).toBe('第二条')
    await act(async () => vi.advanceTimersByTime(800))
    expect(container.querySelector('.mira-summary-roll__current')?.textContent).toBe('第三条')
    await act(async () => vi.advanceTimersByTime(800))
    expect(container.querySelector('.mira-summary-roll__current')?.textContent).toBe('最新条')
    await show('final', '最终摘要', false)
    expect(container.textContent).toBe('最终摘要')
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})

it('animates a new live process row once, and does not replay it after remount', async () => {
  vi.useFakeTimers()
  try {
    const row = <MiraStreamEntrance identity="entrance-test" active>工具行</MiraStreamEntrance>
    await act(async () => root.render(row))
    expect(container.querySelector('[data-mira-stream-entrance="true"]')).not.toBeNull()
    await act(async () => vi.advanceTimersByTime(1000))
    expect(container.querySelector('[data-mira-stream-entrance="true"]')).toBeNull()
    await act(async () => root.render(null))
    await act(async () => root.render(row))
    expect(container.querySelector('[data-mira-stream-entrance="true"]')).toBeNull()
  } finally { vi.useRealTimers() }
})
