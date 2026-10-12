// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessSubtask } from '../src/config/harness'
import { MiraBackgroundTasksTrigger } from '../apps/harness-react/src/components/composer/MiraBackgroundTasksTrigger'

let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); document.body.replaceChildren() })
const task = (id: string, status: HarnessSubtask['status']): HarnessSubtask => ({ id, status, task: `实际任务 ${id}`, parentToolCallId: 'tool', role: 'reviewer', createdAt: 1, activities: [] })
async function render(subtasks: HarnessSubtask[], onOpen = vi.fn(), disabled = false) {
  await act(async () => root.render(<Tooltip.Provider><MiraBackgroundTasksTrigger subtasks={subtasks} onOpen={onOpen} disabled={disabled} /></Tooltip.Provider>))
  return onOpen
}

describe('Composer real running subtask entry', () => {
  it('does not show empty or completed historical work as live tasks', async () => {
    await render([])
    expect(container.querySelector('button')).toBeNull()
    await render(['completed', 'failed', 'stopped', 'timed_out', 'turn_limit', 'interrupted'].map((status, index) => task(`${index}`, status as HarnessSubtask['status'])))
    expect(container.querySelector('button')).toBeNull()
  })
  it('counts queued, running and stopping tasks but excludes terminal statuses', async () => {
    await render([task('waiting', 'queued'), task('running', 'running'), task('closing', 'stopping'), task('done', 'completed')])
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('查看 3 个进行中的智能体任务')
    expect(button.textContent).toBe('3')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
    expect(button.getAttribute('type')).toBe('button')
    expect(container.textContent).not.toMatch(/终端|工作流/)
  })
  it.each(['queued', 'running', 'stopping'] as const)('opens the exact only %s task without submitting the composer', async status => {
    const open = await render([task('done', 'completed'), task('real-child', status)])
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    expect(open).toHaveBeenCalledExactlyOnceWith('real-child')
  })
  it('opens the existing run overview when several real tasks are active', async () => {
    const open = await render([task('first', 'running'), task('second', 'queued')])
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    expect(open).toHaveBeenCalledExactlyOnceWith(undefined)
  })
  it('blocks navigation while the owning session loads', async () => {
    const open = await render([task('first', 'running')], vi.fn(), true)
    const button = container.querySelector<HTMLButtonElement>('button')!
    expect(button.disabled).toBe(true)
    await act(async () => button.click())
    expect(open).not.toHaveBeenCalled()
  })
  it('updates the count and destination from the current projection and disappears after completion', async () => {
    const open = vi.fn()
    await render([task('first', 'running'), task('second', 'running')], open)
    await render([task('first', 'completed'), task('second', 'stopping')], open)
    expect(container.querySelector('button')?.textContent).toBe('1')
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    expect(open).toHaveBeenCalledExactlyOnceWith('second')
    await render([task('first', 'completed'), task('second', 'stopped')], open)
    expect(container.querySelector('button')).toBeNull()
  })
})
