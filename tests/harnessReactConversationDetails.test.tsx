// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolCallRecord } from '../src/config/harness'
import { miraToolRelativePath, MiraConversationDetailMemory, MiraConversationDetails } from '../apps/harness-react/src/components/conversation/MiraConversationDetails'
import { ToolRecord } from '../apps/harness-react/src/components/conversation/run-progress'
import { AssistantMessageParts } from '../apps/harness-react/src/components/conversation/AssistantMessageParts'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren() })

const tool: ToolCallRecord = { id: 'tool', runId: 'run', tool: 'read', target: 'README.md', status: 'ok', input: { text: 'input', truncated: false }, output: { text: 'output', truncated: false }, createdAt: 1 }

async function mount() {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const memory = new MiraConversationDetailMemory()
  const onOpenFile = vi.fn()
  let scope = 'A', visible = true, record = tool
  const render = async (patch: { scope?: string; visible?: boolean; record?: ToolCallRecord } = {}) => {
    scope = patch.scope ?? scope; visible = patch.visible ?? visible; record = patch.record ?? record
    await act(async () => root!.render(<React.StrictMode><MiraConversationDetails memory={memory} scope={scope} directory="/workspace/project">{visible && <><ToolRecord tool={record} onOpenFile={onOpenFile} /><AssistantMessageParts message={{ id: 'message', runId: 'run', role: 'assistant', content: '', createdAt: 1, parts: [{ id: 'thought', type: 'reasoning', text: 'recorded reasoning', state: 'complete', startedAt: 1 }] }} toolsById={new Map()} /></>}</MiraConversationDetails></React.StrictMode>))
  }
  const toggle = async (selector: string, open: boolean) => {
    const element = container.querySelector<HTMLElement>(selector)!
    await act(async () => {
      if (element instanceof HTMLDetailsElement) { element.open = open; element.dispatchEvent(new Event('toggle')) }
      else if ((element.dataset.state === 'open') !== open) element.querySelector<HTMLElement>('[data-tool-record-toggle]')!.click()
    })
  }
  await render()
  return { container, render, toggle, onOpenFile }
}

describe('conversation details survive actual virtual-message unmounts', () => {
  it('restores tool and reasoning open state after unmount without mounting collapsed payloads', async () => {
    const view = await mount()
    expect(view.container.querySelector('[data-tool-payload]')).toBeNull()
    expect(view.container.textContent).not.toContain('recorded reasoning')
    await view.toggle('.mira-tool-record', true); await view.toggle('.mira-reasoning', true)
    expect(view.container.textContent).toContain('output'); expect(view.container.textContent).toContain('recorded reasoning')
    await view.render({ visible: false }); await view.render({ visible: true })
    expect(view.container.querySelector<HTMLElement>('.mira-tool-record')?.dataset.state).toBe('open')
    expect(view.container.querySelector<HTMLDetailsElement>('.mira-reasoning')?.open).toBe(true)
    expect(view.container.textContent).toContain('output'); expect(view.container.textContent).toContain('recorded reasoning')
  })

  it('isolates identical tool/part ids across sessions and runs, and remembers explicit collapse', async () => {
    const view = await mount(); await view.toggle('.mira-tool-record', true)
    await view.render({ scope: 'B' }); expect(view.container.querySelector<HTMLElement>('.mira-tool-record')?.dataset.state).toBe('closed')
    await view.render({ scope: 'A' }); expect(view.container.querySelector<HTMLElement>('.mira-tool-record')?.dataset.state).toBe('open')
    await view.render({ record: { ...tool, runId: 'another-run' } }); expect(view.container.querySelector<HTMLElement>('.mira-tool-record')?.dataset.state).toBe('closed')
    await view.render({ record: tool }); expect(view.container.querySelector<HTMLElement>('.mira-tool-record')?.dataset.state).toBe('open')
    await view.toggle('.mira-tool-record', false); await view.render({ visible: false }); await view.render({ visible: true })
    expect(view.container.querySelector('[data-tool-payload]')).toBeNull()
  })

  it('bounds recent sessions and removes closed records instead of retaining every streamed tool', () => {
    const memory = new MiraConversationDetailMemory()
    for (let index = 0; index <= 200; index++) memory.setOpen(`s${index}`, 'tool', true)
    expect(memory.isOpen('s0', 'tool')).toBe(false); expect(memory.isOpen('s1', 'tool')).toBe(true)
    memory.setOpen('s1', 'tool', false); expect(memory.isOpen('s1', 'tool')).toBe(false)
  })

  it('opens the exact recorded file through the workspace action without expanding the tool', async () => {
    const view = await mount(); await view.render({ record: { ...tool, target: 'src/main.ts' } })
    const file = view.container.querySelector<HTMLButtonElement>('button[aria-label="打开文件 src/main.ts"]')!
    expect(file.textContent).toBe('main.ts')
    await act(async () => file.click())
    expect(view.onOpenFile).toHaveBeenCalledExactlyOnceWith('src/main.ts')
    expect(view.container.querySelector<HTMLElement>('.mira-tool-record')?.dataset.state).toBe('closed')
    await view.render({ record: { ...tool, tool: 'bash', target: 'npm test' } })
    expect(view.container.querySelector('.mira-tool-file')).toBeNull()
    expect(view.container.textContent).toContain('终端'); expect(view.container.textContent).toContain('npm test')
    await view.render({ record: { ...tool, target: '/workspace/project/src/main.ts' } })
    await act(async () => view.container.querySelector<HTMLButtonElement>('[aria-label="打开文件 src/main.ts"]')!.click())
    expect(view.onOpenFile.mock.calls).toEqual([['src/main.ts'], ['src/main.ts']])
    await view.render({ record: { ...tool, target: '/workspace/outside.txt' } })
    expect(view.container.querySelector('button.mira-tool-file')).toBeNull()
    expect(view.container.querySelector('.mira-tool-file-chip')?.textContent).toContain('outside.txt')
    expect(view.onOpenFile).toHaveBeenCalledTimes(2)
  })

  it('shows the real failure reason on keyboard focus and copies it without expanding or swallowing clipboard failure', async () => {
    const view = await mount(); const error = 'permission <denied>'
    await view.render({ record: { ...tool, status: 'failed', error } })
    const trigger = view.container.querySelector<HTMLElement>('[aria-label="查看工具错误"]')!
    await act(async () => trigger.focus())
    const tooltip = document.querySelector<HTMLElement>('.mira-tool-failure-popover')!
    expect(tooltip).not.toBeNull(); expect(tooltip.querySelector('p')?.textContent).toBe(error)
    expect(tooltip.querySelector('denied')).toBeNull()
    expect(view.container.querySelector<HTMLElement>('.mira-tool-record')?.dataset.state).toBe('closed')
    const clipboard = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } })
    await act(async () => tooltip.querySelector<HTMLButtonElement>('button[aria-label="复制错误"]')!.click())
    expect(tooltip.querySelector('[role="alert"]')?.textContent).toBe('复制失败，请重试。')
    await act(async () => tooltip.querySelector<HTMLButtonElement>('button[aria-label="复制错误"]')!.click())
    expect(clipboard.mock.calls).toEqual([[error], [error]])
    expect(tooltip.querySelector('[aria-label="已复制错误"]')).not.toBeNull()
    expect(tooltip.querySelector('[role="alert"]')).toBeNull()
    expect(view.container.querySelector<HTMLElement>('.mira-tool-record')?.dataset.state).toBe('closed')
  })

  it('keeps the interactive failure panel open during keyboard traversal and restores focus once on Escape', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const view = await mount(); await view.render({ record: { ...tool, status: 'failed', error: 'actual failure' } })
    const trigger = view.container.querySelector<HTMLButtonElement>('[aria-label="查看工具错误"]')!
    await act(async () => trigger.focus())
    const copy = document.querySelector<HTMLButtonElement>('[aria-label="复制错误"]')!
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    await act(async () => trigger.dispatchEvent(tab)); await act(async () => vi.advanceTimersByTimeAsync(160))
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(copy); expect(document.querySelector('.mira-tool-failure-popover')).not.toBeNull()
    const reverseTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    await act(async () => copy.dispatchEvent(reverseTab)); await act(async () => vi.advanceTimersByTimeAsync(160))
    expect(reverseTab.defaultPrevented).toBe(true); expect(document.activeElement).toBe(trigger)
    expect(document.querySelector('.mira-tool-failure-popover')).not.toBeNull()
    const modifiedTab = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => trigger.dispatchEvent(modifiedTab))
    expect(modifiedTab.defaultPrevented).toBe(false); expect(document.activeElement).toBe(trigger)
    await act(async () => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    const forwardTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    await act(async () => copy.dispatchEvent(forwardTab)); await act(async () => vi.advanceTimersByTimeAsync(160))
    expect(forwardTab.defaultPrevented).toBe(false); expect(document.querySelector('.mira-tool-failure-popover')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    // happy-dom does not perform default Tab navigation; Chromium covers the next actual focus target.
    await act(async () => trigger.click())
    await act(async () => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await act(async () => vi.advanceTimersByTimeAsync(160))
    expect(document.querySelector('.mira-tool-failure-popover')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(view.container.querySelector<HTMLElement>('.mira-tool-record')?.dataset.state).toBe('closed')
    await act(async () => trigger.click()); expect(document.querySelector('.mira-tool-failure-popover')).not.toBeNull()
    const outside = document.createElement('button'); document.body.append(outside)
    await act(async () => outside.focus()); await act(async () => vi.advanceTimersByTimeAsync(160))
    expect(document.querySelector('.mira-tool-failure-popover')).toBeNull(); expect(document.activeElement).toBe(outside)
  })

  it.each([
    ['/workspace/project/src/main.ts', '/workspace/project', 'src/main.ts'],
    ['/workspace/project2/main.ts', '/workspace/project', undefined],
    ['/workspace/project/../outside.ts', '/workspace/project', undefined],
    ['src/../main.ts', '/workspace/project', 'main.ts'],
    ['../../main.ts', '/workspace/project', undefined],
    ['C:\\Workspace\\Project\\src\\main.ts', 'c:\\workspace\\project', 'src/main.ts'],
    ['D:\\Workspace\\main.ts', 'c:\\workspace\\project', undefined],
    ['src\\main.ts', 'C:\\Workspace\\Project', 'src/main.ts'],
    ['https://example.test/file', '/workspace/project', undefined],
    ['/workspace/project/main.ts', undefined, undefined],
  ])('converts recorded %s only inside the current workspace', (target, directory, expected) => {
    expect(miraToolRelativePath(target, directory)).toBe(expected)
  })
})
