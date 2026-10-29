// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HarnessSession } from '../src/config/harness'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import { remoteCall } from '../apps/harness-react/src/platform/mobile-host'
import { MiraMobileWorkbench } from '../apps/harness-react/src/components/workbench/MiraMobileWorkbench'

vi.mock('../apps/harness-react/src/platform/mobile-host', () => ({ remoteCall: vi.fn() }))
vi.mock('../apps/harness-react/src/components/conversation/MiraConversationMessages', () => ({ MiraConversationContext: React.createContext({}), UserMessage: () => null, AssistantMessage: () => null }))
vi.mock('../apps/harness-react/src/components/composer/MiraModelMenu', () => ({ MiraModelMenu: () => null }))
vi.mock('../apps/harness-react/src/components/interactions/TaskInteraction', () => ({ TaskInteraction: () => null }))
vi.mock('../apps/harness-react/src/components/composer/MiraPromptEditor', () => ({ MiraPromptEditor: ({ text, onChange }: { text: string; onChange: Function }) => <textarea aria-label="任务内容" value={text} onInput={event => onChange({ version: 1, parts: [{ type: 'text', text: event.currentTarget.value }] })} readOnly /> }))

let root: Root
let controller: PilotController
let sessions: HarnessSession[]
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === label || item.textContent === label)!
const page = () => document.querySelector('.mobile-preview')?.getAttribute('data-page')
const session = (id: string): HarnessSession => ({ version: 1, id, projectId: 'project', title: id, permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false })
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  sessions = [session('历史对话')]
  vi.mocked(remoteCall).mockImplementation(async method => {
    if (method === 'session.create') { const created = session('新对话'); sessions.push(created); return created }
    return { autoApproveEnabled: false, fullAccessEnabled: false }
  })
  controller = new PilotController({
    listSessions: async () => [...sessions],
    listProjects: async () => [{ id: 'project', name: '测试项目' }],
    listProviders: async () => [{ id: 'provider', providerKey: 'custom', name: '服务商', endpoint: 'http://localhost', enabled: true, authMode: 'none', models: [{ id: 'model', enabled: true }] }],
    getSession: async (id: string) => sessions.find(item => item.id === id)!,
    listPendingPermissions: async () => [],
    onEvent: () => () => undefined,
  } as unknown as PilotHost)
  await controller.start()
  document.body.append(document.createElement('div'))
  root = createRoot(document.body.lastElementChild!)
})
afterEach(async () => { await act(async () => root.unmount()); controller.dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })
const render = () => act(async () => root.render(<MiraMobileWorkbench controller={controller} />))

it('opens the project page even when the controller restores a historical conversation', async () => {
  history.replaceState({ miraMobileSession: '历史对话' }, '')
  await render()
  expect(history.state).toBeNull()
  expect(controller.getSnapshot().session?.id).toBe('历史对话')
  expect(page()).toBe('projects')
  expect(document.querySelector('.mobile-sidebar h1')?.textContent).toBe('项目空间')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('enters a selected conversation and returns to projects with browser navigation', async () => {
  await render()
  const push = vi.spyOn(history, 'pushState')
  const back = vi.spyOn(history, 'back').mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate', { state: null })))
  await act(async () => button('历史对话').click())
  expect(page()).toBe('conversation')
  expect(push).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.mobile-heading h1')?.textContent).toBe('历史对话')
  const editor = document.querySelector<HTMLTextAreaElement>('[aria-label="任务内容"]')!
  await act(async () => { editor.value = '尚未发送的草稿'; editor.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => button('返回项目空间').click())
  expect(back).toHaveBeenCalledTimes(1)
  expect(page()).toBe('projects')
  expect(controller.getSnapshot().session?.id).toBe('历史对话')
  await act(async () => window.dispatchEvent(new PopStateEvent('popstate', { state: { miraMobileSession: '历史对话' } })))
  expect(page()).toBe('conversation')
  expect(document.querySelector<HTMLTextAreaElement>('[aria-label="任务内容"]')?.value).toBe('尚未发送的草稿')
})

it('creates a conversation in the chosen project before entering it', async () => {
  await render()
  await act(async () => button('在 测试项目 中新建对话').click())
  expect(remoteCall).toHaveBeenCalledWith('session.create', { projectId: 'project' })
  expect(page()).toBe('conversation')
  expect(controller.getSnapshot().session?.id).toBe('新对话')
  expect(document.querySelector('.mobile-heading h1')?.textContent).toBe('新对话')
})

it('keeps the project page and reports a failed creation without entering a conversation', async () => {
  await render()
  vi.mocked(remoteCall).mockRejectedValueOnce(new Error('新建失败，请重试'))
  await act(async () => button('在 测试项目 中新建对话').click())
  expect(page()).toBe('projects')
  expect(document.querySelector('[role="status"]')?.textContent).toBe('新建失败，请重试')
})

it('keeps projects visible when opening a history entry fails', async () => {
  await render()
  vi.spyOn(controller, 'open').mockResolvedValue(false)
  await act(async () => button('历史对话').click())
  expect(page()).toBe('projects')
  expect(document.querySelector('[role="status"]')?.textContent).toBe('打开对话失败，请重试')
})

it('opens the single system attachment picker directly from the plus button', async () => {
  await render()
  await act(async () => button('历史对话').click())
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]')
  expect(inputs).toHaveLength(1)
  const pick = vi.spyOn(inputs[0], 'click').mockImplementation(() => undefined)
  await act(async () => button('添加手机附件').click())
  expect(pick).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="menu"]')).toBeNull()
})
