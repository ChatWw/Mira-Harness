import * as React from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraPendingGuides, type MiraPendingGuidesProps } from '../apps/harness-react/src/components/conversation/MiraPendingGuides'
import type { HarnessQueuedMessage } from '../src/config/harness'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown }> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
  },
}))
beforeEach(() => { hooks.cursor = 0; hooks.slots = []; vi.stubGlobal('React', React) })
afterEach(() => vi.unstubAllGlobals())
const guide = (id = 'guide'): HarnessQueuedMessage => ({ id, sessionId: 'session', submissionId: `submit-${id}`, text: `指导正文 ${id}`, references: [], planning: false, permissionMode: 'default', selection: { providerId: 'provider', modelId: 'model' }, createdAt: 1, delivery: 'guide', targetRunId: 'running' })
function deferred() { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
function mount(items: HarnessQueuedMessage[] = [guide()]) {
  const props: MiraPendingGuidesProps = { items, onWithdraw: vi.fn(async () => undefined) }
  let tree: React.ReactNode
  const visit = (node: React.ReactNode, callback: (element: React.ReactElement<Record<string, unknown>>) => void) => {
    if (Array.isArray(node)) return node.forEach(child => visit(child, callback))
    if (!React.isValidElement<Record<string, unknown>>(node)) return
    callback(node); visit(node.props.children as React.ReactNode, callback)
  }
  const nodes = (match: (props: Record<string, unknown>) => boolean) => { const found: Record<string, unknown>[] = []; visit(tree, element => { if (match(element.props)) found.push(element.props) }); return found }
  const render = () => { hooks.cursor = 0; tree = MiraPendingGuides(props) }
  const drain = async () => { for (let index = 0; index < 8; index++) { await Promise.resolve(); render() } }
  const button = (index = 1) => nodes(props => props['aria-label'] === `撤回指导 ${index}`)[0]
  render()
  return { props, nodes, render, drain, button, tree: () => tree }
}

describe('Timeline pending guides are not future queue messages', () => {
  it('omits ordinary queue rows and preserves source order without modifying authority', () => {
    const ordinary = { ...guide('ordinary'), delivery: undefined }
    const source = [ordinary, guide('first'), guide('second')], view = mount(source)
    expect(view.nodes(props => Boolean(props['data-pending-guide'])).map(props => props['data-pending-guide'])).toEqual(['first', 'second'])
    expect(source.map(item => item.id)).toEqual(['ordinary', 'first', 'second'])
    view.props.items = [ordinary]; view.render(); expect(view.tree()).toBeNull()
  })
  it('shows the complete long user body with wrapping and a readable pending status', () => {
    const text = '长文本指导'.repeat(200), view = mount([{ ...guide(), text }])
    const body = view.nodes(props => props.children === text)[0]
    expect(body.className).toContain('whitespace-pre-wrap'); expect(body.className).toContain('wrap-anywhere')
    expect(view.nodes(props => props.role === 'status')[0].children).toBe('等待引导当前任务…')
    expect(view.button()['aria-label']).toBe('撤回指导 1')
    expect((view.tree() as React.ReactElement).type).toBe(Tooltip.Provider)
  })
  it('never removes an acknowledged withdrawal before the authoritative items change', async () => {
    const view = mount()
    ;(view.button().onClick as () => void)(); await view.drain()
    expect(view.props.onWithdraw).toHaveBeenCalledExactlyOnceWith('guide')
    expect(view.nodes(props => props['data-pending-guide'] === 'guide')).toHaveLength(1)
    view.props.items = []; view.render(); expect(view.tree()).toBeNull()
  })
  it('locks only the engine-consuming guide and keeps later guides withdrawable', () => {
    const view = mount([guide('applying'), guide('later')]); view.props.promotingItemId = 'applying'; view.render()
    expect(view.button().disabled).toBe(true); expect(view.button(2).disabled).toBe(false)
    expect(view.nodes(props => props.role === 'status').map(props => props.children)).toEqual(['正在应用指导…', '等待引导当前任务…'])
    ;(view.button().onClick as () => void)(); expect(view.props.onWithdraw).not.toHaveBeenCalled()
    ;(view.button(2).onClick as () => void)(); expect(view.props.onWithdraw).toHaveBeenCalledExactlyOnceWith('later')
  })
  it('rejects duplicate clicks while an ACK is pending without blocking another row', async () => {
    const view = mount([guide('first'), guide('second')]), ack = deferred()
    vi.mocked(view.props.onWithdraw).mockReturnValueOnce(ack.promise)
    const staleClick = view.button().onClick as () => void
    staleClick(); staleClick(); view.render()
    expect(view.button().disabled).toBe(true); expect(view.button()['aria-busy']).toBe(true)
    expect(view.button(2).disabled).toBe(false); expect(view.props.onWithdraw).toHaveBeenCalledTimes(1)
    ack.resolve(); await view.drain(); expect(view.button().disabled).toBe(false)
  })
  it('retains the guide after a failed withdrawal and allows a clear retry', async () => {
    const view = mount()
    vi.mocked(view.props.onWithdraw).mockRejectedValueOnce(new Error('已开始应用'))
    ;(view.button().onClick as () => void)(); await view.drain()
    expect(view.nodes(props => props.role === 'alert')[0].children).toBe('撤回失败：已开始应用')
    expect(view.nodes(props => Boolean(props['data-pending-guide']))).toHaveLength(1); expect(view.button().disabled).toBe(false)
    ;(view.button().onClick as () => void)(); await view.drain()
    expect(view.nodes(props => props.role === 'alert')).toEqual([])
  })
  it('keeps an inactive or loading conversation read-only', () => {
    const view = mount(); view.props.disabled = true; view.render()
    expect(view.button().disabled).toBe(true)
    ;(view.button().onClick as () => void)(); expect(view.props.onWithdraw).not.toHaveBeenCalled()
  })
})
