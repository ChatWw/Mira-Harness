// @vitest-environment happy-dom
import React, { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessSubtask } from '../src/config/harness'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import { MiraSideConversation } from '../apps/harness-react/src/components/workspace/MiraSideConversation'

vi.mock('../apps/harness-react/src/components/composer/HarnessComposer', () => ({ HarnessComposer: ({ leadingActions }: { leadingActions: ReactNode }) => <Tooltip.Provider><textarea className="mira-prompt-editor" aria-label="侧面输入" />{leadingActions}</Tooltip.Provider> }))
vi.mock('../apps/harness-react/src/components/conversation/MiraConversationMessages', async () => ({ MiraConversationContext: (await import('react')).createContext({}), UserMessage: () => null, AssistantMessage: () => null }))
vi.mock('../apps/harness-react/src/components/conversation/MiraConversationTimeline', () => ({ MiraConversationTimeline: () => null }))
vi.mock('../apps/harness-react/src/components/conversation/MiraConversationViewport', () => ({ MiraConversationViewport: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('../apps/harness-react/src/components/conversation/MiraTaskFind', () => ({ MiraTaskFind: () => null }))
vi.mock('../apps/harness-react/src/components/conversation/MiraSelectionActions', () => ({ MiraSelectionActions: () => null }))
vi.mock('../apps/harness-react/src/components/conversation/MiraPendingGuides', () => ({ MiraPendingGuides: () => null }))
vi.mock('../apps/harness-react/src/components/conversation/ConversationTurnRail', () => ({ ConversationTurnRail: () => null }))
vi.mock('../apps/harness-react/src/components/conversation/TaskSummary', () => ({ TaskSummary: () => null }))
vi.mock('../apps/harness-react/src/components/conversation/AssistantMessageParts', () => ({ PermissionResponseCard: () => null }))
vi.mock('../apps/harness-react/src/components/workspace/MiraSubtaskPanel', () => ({ MiraSubtaskPanel: ({ sessionId, runId, subtaskId }: { sessionId: string; runId: string; subtaskId: string }) => <div data-child-detail>{sessionId}:{runId}:{subtaskId}</div> }))
vi.mock('../apps/harness-react/src/components/workspace/OverviewPanel', () => ({ OverviewPanel: ({ sessionId, runId }: { sessionId: string; runId: string }) => <div data-run-detail>{sessionId}:{runId}</div> }))

let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); document.body.replaceChildren() })
const task = (id: string, status: HarnessSubtask['status'] = 'running') => ({ id, status, task: id, parentToolCallId: 'tool', role: 'reviewer' as const, createdAt: 1, activities: [] })
async function fixture(subtasks = [task('side-agent')]) {
  const state = { initialized: true, sessionLoading: false, running: true, projects: [], messages: [], session: { id: 'side', title: '侧面任务', toolCalls: [], activeRun: { id: 'side-run', startedAt: 1, activities: [], subtasks } } }
  let snapshot = state
  const sideController = { getSnapshot: () => snapshot, subscribe: () => () => {}, start: vi.fn(async () => {}), flushBeforeNavigation: vi.fn(async () => {}), dispose: vi.fn() }
  const parentState = { initialized: true, sessions: [{ id: 'side', title: '侧面任务' }], runningSessionIds: [], session: { id: 'main', activeRun: { id: 'main-run', subtasks: [task('main-a'), task('main-b')] } } }
  const parent = { getSnapshot: () => parentState, subscribe: () => () => {}, createTaskPaneController: () => sideController, registerBeforeNavigation: () => () => {}, reportError: vi.fn() }
  const render = async () => { await act(async () => root.render(<MiraSideConversation parentController={parent as unknown as PilotController} parentId="main" childSessionId="side" existingTask active keyboardActive requests={[]} onConsume={() => {}} onFocus={() => {}} onOpenFile={() => {}} />)) }
  await render()
  return { render, state, setSnapshot: (value: typeof state) => { snapshot = value } }
}

describe('side task background entry owns its session and live run', () => {
  it('counts only side agents and opens the side agent instead of borrowing primary state', async () => {
    await fixture()
    const button = container.querySelector<HTMLButtonElement>('[aria-label="查看 1 个进行中的智能体任务"]')!
    expect(button).not.toBeNull()
    expect(container.querySelector('[aria-label="查看 2 个进行中的智能体任务"]')).toBeNull()
    await act(async () => button.click())
    expect(container.querySelector('[data-child-detail]')?.textContent).toBe('side:side-run:side-agent')
  })
  it('opens only the side run overview for multiple agents', async () => {
    await fixture([task('side-a'), task('side-b', 'queued')])
    await act(async () => container.querySelector<HTMLButtonElement>('.mira-background-tasks-trigger')!.click())
    expect(container.querySelector('[data-run-detail]')?.textContent).toBe('side:side-run')
  })
  it('rejects a stale click after the active run changes before React paints', async () => {
    const view = await fixture()
    const button = container.querySelector<HTMLButtonElement>('.mira-background-tasks-trigger')!
    view.setSnapshot({ ...view.state, session: { ...view.state.session, activeRun: { ...view.state.session.activeRun, id: 'new-run' } } })
    await act(async () => button.click())
    expect(container.querySelector('[data-child-detail]')).toBeNull()
    expect(container.querySelector('[data-run-detail]')).toBeNull()
  })
  it('rejects a stale click when the child finished before the projection re-rendered', async () => {
    const view = await fixture()
    const button = container.querySelector<HTMLButtonElement>('.mira-background-tasks-trigger')!
    view.setSnapshot({ ...view.state, session: { ...view.state.session, activeRun: { ...view.state.session.activeRun, subtasks: [task('side-agent', 'completed')] } } })
    await act(async () => button.click())
    expect(container.querySelector('[data-child-detail]')).toBeNull()
  })
  it('does not show primary agents when the side run has no agents', async () => {
    await fixture([])
    expect(container.querySelector('.mira-background-tasks-trigger')).toBeNull()
  })
  it('moves focused entry to the visible return button and restores the still live entry', async () => {
    await fixture()
    const entry = container.querySelector<HTMLButtonElement>('.mira-background-tasks-trigger')!
    await act(async () => { entry.focus(); entry.click() })
    const back = container.querySelector<HTMLButtonElement>('[aria-label="返回侧面任务"]')!
    expect(document.activeElement).toBe(back)
    expect(document.activeElement?.closest('[hidden], [inert]')).toBeNull()
    await act(async () => back.click())
    expect(document.activeElement).toBe(container.querySelector('.mira-background-tasks-trigger'))
  })
  it('returns focus to the side Composer when the entry disappears as the agent finishes', async () => {
    const view = await fixture()
    const entry = container.querySelector<HTMLButtonElement>('.mira-background-tasks-trigger')!
    await act(async () => { entry.focus(); entry.click() })
    const back = container.querySelector<HTMLButtonElement>('[aria-label="返回侧面任务"]')!
    expect(document.activeElement).toBe(back)
    view.setSnapshot({ ...view.state, session: { ...view.state.session, activeRun: { ...view.state.session.activeRun, subtasks: [task('side-agent', 'completed')] } } })
    await view.render()
    await act(async () => back.click())
    expect(container.querySelector('.mira-background-tasks-trigger')).toBeNull()
    expect(document.activeElement).toBe(container.querySelector('[aria-label="侧面输入"]'))
  })
  it('does not steal focus from another surface on an unfocused programmatic click', async () => {
    await fixture()
    const outside = document.createElement('button'); document.body.append(outside); outside.focus()
    await act(async () => container.querySelector<HTMLButtonElement>('.mira-background-tasks-trigger')!.click())
    expect(document.activeElement).toBe(outside)
    expect(container.querySelector('[data-child-detail]')).not.toBeNull()
  })
  it('keeps focus in the side pane while its Composer is not yet editable on return', async () => {
    const view = await fixture()
    const entry = container.querySelector<HTMLButtonElement>('.mira-background-tasks-trigger')!
    await act(async () => { entry.focus(); entry.click() })
    view.setSnapshot({ ...view.state, session: { ...view.state.session, activeRun: { ...view.state.session.activeRun, subtasks: [task('side-agent', 'completed')] } } })
    await view.render()
    container.querySelector<HTMLTextAreaElement>('.mira-prompt-editor')!.disabled = true
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="返回侧面任务"]')!.click())
    expect(document.activeElement).toBe(container.querySelector('[data-side-session-id="side"]'))
    expect(document.activeElement?.closest('[hidden], [inert]')).toBeNull()
  })
})
