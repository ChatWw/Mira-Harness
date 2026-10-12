// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionResponseCard } from '../apps/harness-react/src/components/conversation/AssistantMessageParts'
import type { MiraFlowReview } from '../src/config/miraFlowReview'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); document.body.replaceChildren() })
const review: MiraFlowReview = { action: 'run', name: '稿件审核', source: 'const text = "<script>alert(1)</script>"; return text;', sourceHash: 'a'.repeat(64), commands: ['git'], maxConcurrency: 2, model: '当前模型', graph: {
  phases: [{ id: 'draft', name: '撰写' }, { id: 'review', name: '审核' }], participants: [{ id: 'writer', phase: 'draft', lane: 'writer', name: '作者', steps: ['ask1'] }, { id: 'editor', phase: 'review', lane: 'editor', name: '编辑', steps: ['ask2'] }], handoffs: [], steps: [], phaseEdges: [{ from: 'draft', to: 'review', kind: 'branch' }], truncated: false,
} }
async function mount(action: 'run' | 'save' = 'run', responding = false, error?: string) {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const onRespond = vi.fn(async () => undefined)
  await act(async () => root!.render(<PermissionResponseCard request={{ requestId: 'exact-review', sessionId: 'parent', title: '审阅工作流', detail: '确认已编译源码', workflowReview: { ...review, action } }} placement="dock" responding={responding} error={error} onRespond={onRespond} />))
  return { container, onRespond }
}
describe('compiled workflow source approval', () => {
  it('shows actual phases and conditional transitions, with escaped complete source and exact response identity', async () => {
    const { container, onRespond } = await mount()
    expect(container.textContent).toContain('作者'); expect(container.textContent).toContain('编辑'); expect(container.textContent).toContain('条件分支')
    expect(container.querySelector('pre[aria-label="已编译的工作流源码"]')?.textContent).toBe(review.source)
    expect(container.querySelector('script')).toBeNull()
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === '确认并运行')!
    await act(async () => button.click())
    expect(onRespond).toHaveBeenCalledExactlyOnceWith('exact-review', true)
  })
  it('keeps arrows available for source scrolling and lets action arrows move focus without approving', async () => {
    const { container, onRespond } = await mount()
    const source = container.querySelector<HTMLPreElement>('pre')!
    source.focus(); const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }); source.dispatchEvent(arrow)
    expect(arrow.defaultPrevented).toBe(false); expect(document.activeElement).toBe(source)
    const [reject, approve] = [...container.querySelectorAll('.pilot-action__buttons > button')]
    reject!.focus(); reject!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(approve); expect(onRespond).not.toHaveBeenCalled()
  })
  it('clearly distinguishes save from execution and retains local error with locked response controls', async () => {
    const { container, onRespond } = await mount('save', true, '提交失败')
    expect(container.textContent).toContain('确认保存'); expect(container.textContent).not.toContain('确认并运行')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('提交失败')
    expect([...container.querySelectorAll<HTMLButtonElement>('.pilot-action__buttons > button')].every(button => button.disabled)).toBe(true)
    container.querySelector<HTMLButtonElement>('.pilot-action__buttons > button')!.click(); expect(onRespond).not.toHaveBeenCalled()
  })
})
