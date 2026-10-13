// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraTaskChangesPanel } from '../apps/harness-react/src/components/workspace/MiraTaskChangesPanel'
import type { HarnessFileChange } from '../src/config/harness'
import type { MiraTaskChangeSummary } from '../src/config/miraTaskChanges'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })

const operations: Array<HarnessFileChange & { key: string }> = [
  { key: 'operation-one', toolCallId: 'tool-one', tool: 'edit', path: 'note.md', diff: '@@ -1 +1 @@\n-old\n+intermediate\n+temporary' },
  { key: 'operation-two', toolCallId: 'tool-two', tool: 'edit', path: 'note.md', diff: '@@ -1 +1 @@\n-intermediate\n-temporary\n+final' },
]
const summary: MiraTaskChangeSummary = {
  files: [{ key: 'net-note', path: 'note.md', tool: 'edit', writes: 2, added: 1, removed: 1, diff: '@@ -1 +1 @@\n-old\n+final' }],
  added: 1, removed: 1, incomplete: false, estimated: false,
}

async function mount(changes = operations, netSummary: MiraTaskChangeSummary | null = summary) {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const selected = vi.fn<(id: string | undefined) => void>()
  function Panel() {
    const [id, setId] = useState<string>()
    return <MiraTaskChangesPanel changes={changes} summary={netSummary ?? undefined} selectedChangeId={id} onSelect={next => { selected(next); setId(next) }} />
  }
  await act(async () => root!.render(<React.StrictMode><Panel /></React.StrictMode>))
  const click = async (button: HTMLButtonElement) => { await act(async () => button.click()) }
  const netButton = (path = 'note.md') => container.querySelector<HTMLButtonElement>(`button[aria-label="查看 ${path} 的任务净变化"]`)!
  const operationButton = (index = 0) => container.querySelectorAll<HTMLButtonElement>('button[title]')[index]!
  return { container, selected, click, netButton, operationButton }
}

it('counts current net changes while retaining restored files and their operation history', async () => {
  const restored = { ...summary, added: 0, removed: 0, files: [{ ...summary.files[0]!, unchanged: true, added: 0, removed: 0, diff: undefined }] }
  const view = await mount(operations, restored)
  expect(view.container.querySelector('h2')?.textContent).toBe('本次任务变更 · 0 个文件')
  expect(view.netButton().textContent).toContain('无净变化')
  expect(view.container.querySelector('h3')?.textContent).toContain('2 次')
  await view.click(view.netButton()); expect(view.container.textContent).toContain('没有可显示的净差异')
})

describe('task-owned net changes through real React DOM', () => {
  it('counts one changed file and exposes net totals separately from repeated operation diffs', async () => {
    const view = await mount()
    expect(view.container.querySelector('h2')?.textContent).toBe('本次任务变更 · 1 个文件')
    expect(view.container.querySelector('[aria-label="任务净变化"]')?.textContent).toBe('+1 行-1 行')
    expect(view.container.querySelector('h3')?.textContent).toBe('逐次操作记录 · 2 次')
    expect(view.netButton().querySelector('small')?.textContent).toBe('+1 -1')
    expect(view.operationButton().querySelector('small')?.textContent).toBe('+2 -1')
    expect(view.operationButton(1).querySelector('small')?.textContent).toBe('+1 -2')
    expect(view.container.querySelector('.mira-task-change-note')?.textContent).toContain('重复编辑不重复计数')
  })

  it('opens and toggles the net preview, then selects the forensic operation without leaking its intermediate diff into the net view', async () => {
    const view = await mount()
    await view.click(view.netButton())
    let region = view.container.querySelector('[role="region"]')!
    expect(view.selected).toHaveBeenLastCalledWith('net-note')
    expect(region.getAttribute('aria-label')).toBe('note.md 的任务净变化')
    expect(region.textContent).toContain('2 次操作')
    expect([...region.querySelectorAll('code')].map(line => line.textContent)).toEqual(['@@ -1 +1 @@', '-old', '+final'])
    expect(region.textContent).not.toContain('intermediate')
    await view.click(view.netButton())
    expect(view.selected).toHaveBeenLastCalledWith(undefined)
    expect(view.container.querySelector('[role="region"]')).toBeNull()
    await view.click(view.operationButton())
    region = view.container.querySelector('[role="region"]')!
    expect(view.selected).toHaveBeenLastCalledWith('operation-one')
    expect(region.getAttribute('aria-label')).toBe('note.md 的差异')
    expect(region.textContent).toContain('+intermediate')
    expect(region.querySelector('code[data-mira-find-target]')).not.toBeNull()
    await view.click(view.netButton())
    expect(view.container.querySelectorAll('[role="region"]')).toHaveLength(1)
    expect(view.container.querySelector('[role="region"]')?.textContent).not.toContain('intermediate')
  })

  it('does not invent legacy net totals and still uses a unique file count for repeated operations', async () => {
    const view = await mount(operations, null)
    expect(view.container.querySelector('h2')?.textContent).toBe('本次任务变更 · 1 个文件')
    expect(view.container.querySelector('[aria-label="任务净变化"]')).toBeNull()
    expect(view.container.querySelector('.mira-task-change-note')?.textContent).toContain('不汇总为任务净变化')
    expect(view.container.querySelectorAll('button')).toHaveLength(2)
  })

  it('marks unavailable snapshots explicitly and keeps their operation history reachable', async () => {
    const view = await mount(operations, { files: [{ key: 'unknown-note', path: 'note.md', tool: 'edit', writes: 2, unavailable: true }], added: 0, removed: 0, incomplete: true, estimated: false })
    expect(view.netButton().querySelector('small')?.textContent).toBe('无法统计')
    expect(view.container.querySelector('.mira-task-change-note')?.textContent).toContain('部分文件无法计算净变化')
    await view.click(view.netButton())
    const preview = view.container.querySelector('[role="region"]')!
    expect(preview.textContent).toContain('未保存完整首末快照，可查看逐次操作记录')
    expect(preview.textContent).not.toContain('undefined')
    expect(view.operationButton()).not.toBeNull()
  })

  it('labels estimated totals and a truncated preview while preserving the host line counts', async () => {
    const view = await mount([], { files: [{ key: 'large-note', path: 'note.md', tool: 'write', writes: 1, added: 900, removed: 800, estimated: true, diffTruncated: true, diff: '@@ -1 +1 @@\n-old\n+preview' }], added: 900, removed: 800, incomplete: false, estimated: true })
    expect(view.container.querySelector('[aria-label="任务净变化"]')?.textContent).toBe('+900 行-800 行')
    expect(view.netButton().querySelector('small')?.textContent).toBe('约 +900 -800')
    expect(view.container.querySelector('.mira-task-change-note')?.textContent).toContain('有界估算')
    await view.click(view.netButton())
    expect(view.container.querySelector('[role="region"]')?.textContent).toContain('差异预览已截断，行数来自完整快照')
  })

  it('explains a truncated preview even when the host could not render a diff and renders deletion semantics', async () => {
    const view = await mount([], { files: [{ key: 'deleted-note', path: 'note.md', tool: 'delete', writes: 3, added: 0, removed: 12, diffTruncated: true }], added: 0, removed: 12, incomplete: false, estimated: false })
    await view.click(view.netButton())
    const region = view.container.querySelector('[role="region"]')!
    expect(region.querySelector('strong')?.textContent).toBe('删除 · note.md · 3 次操作')
    expect(region.textContent).toContain('没有可显示的净差异')
    expect(region.textContent).toContain('差异预览已截断')
  })

  it('retains verified zero net totals after a revert without erasing forensic history', async () => {
    const view = await mount(operations, { ...summary, files: [{ ...summary.files[0], added: 0, removed: 0, diff: undefined }], added: 0, removed: 0 })
    expect(view.container.querySelector('[aria-label="任务净变化"]')?.textContent).toBe('+0 行-0 行')
    expect(view.container.querySelector('h3')?.textContent).toBe('逐次操作记录 · 2 次')
    await view.click(view.netButton())
    expect(view.container.querySelector('[role="region"]')?.textContent).toContain('没有可显示的净差异')
  })
})
