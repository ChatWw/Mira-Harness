// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskSummary } from '../apps/harness-react/src/components/conversation/TaskSummary'
import { MiraGitTools } from '../apps/harness-react/src/components/git/MiraGitTools'
import { MiraGitReviewPanel } from '../apps/harness-react/src/components/git/MiraGitReviewPanel'
import { MiraGitGraphDialog } from '../apps/harness-react/src/components/git/MiraGitGraphDialog'
import type { HarnessProject } from '../src/config/harness'
import type { MiraGitSnapshot } from '../src/config/miraGit'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const project = { id: 'side-project', directory: '/side', directoryExists: true, isGitRepository: true, gitBranch: 'topic' } as HarnessProject
const snapshot: MiraGitSnapshot = { projectId: project.id, directory: project.directory, repository: '/side', branch: 'topic', head: 'a'.repeat(40), token: 'b'.repeat(64), files: [{ path: 'staged.txt', staged: true, unstaged: false, conflict: false }, { path: 'new.txt', staged: false, unstaged: true, conflict: false }], added: 7, removed: 3, stagedPatch: '+staged content', unstagedPatch: '+new content', ahead: 0, behind: 0, canPush: true, mutationBlocked: false }
function controller() {
  return { supportsGitTools: true, supportsGitActions: true, getGitTools: vi.fn(async () => snapshot), getGitGraph: vi.fn(async () => ({ commits: [], hasMore: false })), generateGitMessage: vi.fn(async () => 'feat: generated'), gitAction: vi.fn(async () => ({ committed: true, pushed: false })), getGitContext: vi.fn(async () => ({ projectId: project.id, directory: project.directory, headType: 'branch', branchName: 'topic', isRepository: true, branches: [], uncommittedFileCount: 2, snapshotToken: snapshot.token, mutationBlocked: false })) }
}
async function click(text: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === text || button.getAttribute('aria-label') === text)
  expect(button, text).toBeTruthy()
  await act(async () => { button!.click(); await new Promise(resolve => setTimeout(resolve, 0)) })
}
async function tools(view = controller(), options: { blocked?: boolean; refresh?: () => Promise<MiraGitSnapshot | undefined> } = {}) {
  const owner = { controller: view as unknown as PilotController, project, active: true, blocked: Boolean(options.blocked), onReview: vi.fn() }
  const refresh = options.refresh || vi.fn(async () => snapshot)
  await act(async () => root.render(<MiraGitTools owner={owner} snapshot={snapshot} refresh={refresh} />))
  await click('提交或推送')
  return { view, owner, refresh }
}

describe('conversation Git tools DOM', () => {
  it('shows repository totals and review action rather than substituting session changes', async () => {
    const view = controller(), onReview = vi.fn()
    await act(async () => root.render(<TaskSummary taskState="已完成" taskTone="completed" running={false} activities={[]} subtasks={[]} changes={99} git={{ controller: view as unknown as PilotController, project, active: true, blocked: false, onReview }} onOpenChanges={() => {}} onReviewPlan={() => {}} onStopSubtask={async () => {}} onError={() => {}} />))
    expect(container.querySelector('.mira-task-summary__mini')?.textContent).toContain('Git 工具+7−3')
    await click('更改+7−3')
    expect(onReview).toHaveBeenCalledOnce()
    expect(view.getGitTools).toHaveBeenCalledWith(project.id)
    expect(container.textContent).toContain('99 个文件变更')
  })

  it('does not create a Git capsule for a clean repository', async () => {
    const view = controller()
    view.getGitTools.mockResolvedValue({ ...snapshot, files: [], added: 0, removed: 0, stagedPatch: '', unstagedPatch: '' })
    await act(async () => root.render(<TaskSummary taskState="已完成" taskTone="completed" running={false} activities={[]} subtasks={[]} changes={0} git={{ controller: view as unknown as PilotController, project, active: true, blocked: false, onReview: () => {} }} onOpenChanges={() => {}} onReviewPlan={() => {}} onStopSubtask={async () => {}} onError={() => {}} />))
    expect(container.querySelector('.mira-task-summary')).toBeNull()
  })

  it('uses the owning project, auto-generates a message and defaults to including unstaged changes', async () => {
    const { view } = await tools()
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true)
    await click('提交')
    expect(view.generateGitMessage).toHaveBeenCalledExactlyOnceWith(project.id, snapshot.token, true)
    expect(view.gitAction).toHaveBeenCalledExactlyOnceWith(project.id, 'commit', snapshot.token, 'feat: generated', true)
  })

  it('keeps the reviewed snapshot frozen across automatic refreshes and submits staged-only explicitly', async () => {
    const { view, owner, refresh } = await tools()
    await act(async () => root.render(<MiraGitTools owner={owner} snapshot={{ ...snapshot, token: 'c'.repeat(64), files: [...snapshot.files, { path: 'unexpected.txt', staged: false, unstaged: true, conflict: false }] }} refresh={refresh} />))
    expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain('unexpected.txt')
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    await click('提交')
    expect(view.gitAction).toHaveBeenCalledExactlyOnceWith(project.id, 'commit', snapshot.token, 'feat: generated', false)
  })

  it('blocks writes while project activity is pending', async () => {
    const { view } = await tools(controller(), { blocked: true })
    await click('提交')
    expect(view.gitAction).not.toHaveBeenCalled()
    expect(view.generateGitMessage).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('请先停止项目任务')
  })

  it('keeps push failure visible after a successful commit, and retries only the push', async () => {
    const view = controller()
    view.gitAction.mockResolvedValueOnce({ committed: true, pushed: false, error: 'network' } as never)
    const clean = { ...snapshot, token: 'c'.repeat(64), files: [], added: 0, removed: 0, ahead: 1 }
    const refresh = vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValue(clean)
    await tools(view, { refresh })
    await click('提交并推送')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('提交已成功，推送失败')
    await click('推送 ↑1')
    expect(view.gitAction.mock.calls[1]).toEqual([project.id, 'push', clean.token, '', false])
  })

  it('does not submit if message generation fails', async () => {
    const view = controller(); view.generateGitMessage.mockRejectedValueOnce(new Error('model unavailable'))
    await tools(view)
    await click('提交')
    expect(view.gitAction).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('model unavailable')
  })

  it('switches between actual staged and unstaged review sources', async () => {
    const view = controller()
    await act(async () => root.render(<MiraGitReviewPanel controller={view as unknown as PilotController} project={project} active />))
    expect(container.querySelector('pre')?.textContent).toContain('new content')
    await click('已暂存（1）')
    expect(container.querySelector('pre')?.textContent).toContain('staged content')
    expect(container.querySelector('pre')?.textContent).not.toContain('new content')
  })

  it('renders actual graph parent lines, metadata and paginates within the same project', async () => {
    const view = controller()
    const commits = [{ hash: 'a', parents: ['b', 'c'], subject: 'merge', author: 'Test', date: '2026-10-15T10:00:00Z', refs: 'HEAD -> topic' }, { hash: 'b', parents: ['c'], subject: 'feature', author: 'Test', date: '2026-10-14T10:00:00Z', refs: '' }, { hash: 'c', parents: [], subject: 'base', author: 'Test', date: '2026-10-13T10:00:00Z', refs: '' }]
    view.getGitGraph.mockResolvedValueOnce({ commits, hasMore: true } as never)
    await act(async () => root.render(<MiraGitGraphDialog controller={view as unknown as PilotController} projectId={project.id} open onOpenChange={() => {}} />))
    expect(container.querySelectorAll('svg circle')).toHaveLength(3)
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(0)
    expect(container.textContent).toContain('HEAD -> topic')
    await click('加载更多')
    expect(view.getGitGraph).toHaveBeenLastCalledWith(project.id, 3)
  })
})

describe('repository review file rows', () => {
  it('uses typed file icons and expands per-file differences while hiding binary payloads', async () => {
    const view = controller()
    view.getGitTools.mockResolvedValue({ ...snapshot, unstagedFiles: [
      { path: 'src/app.tsx', patch: 'diff --git a/src/app.tsx b/src/app.tsx\n@@ -1 +1 @@\n-old\n+new', added: 1, removed: 1, binary: false },
      { path: 'image.png', patch: 'GIT binary patch\nENCODED_PAYLOAD', added: 0, removed: 0, binary: true },
    ] })
    await act(async () => root.render(<MiraGitReviewPanel controller={view as unknown as PilotController} project={project} active />))
    const rows = container.querySelectorAll<HTMLDetailsElement>('.mira-git-review__files details')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('summary')?.textContent).toContain('src/app.tsx+1−1')
    expect(rows[0].querySelector('img')?.getAttribute('src')).toBeTruthy()
    expect(rows[0].querySelector('img')?.getAttribute('src')).not.toBe(rows[1].querySelector('img')?.getAttribute('src'))
    expect(rows[0].querySelector('.pilot-diff__line--added')?.textContent).toContain('+new')
    expect(container.textContent).toContain('二进制文件已更改')
    expect(container.textContent).not.toContain('ENCODED_PAYLOAD')
  })
})
