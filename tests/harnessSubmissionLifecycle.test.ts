import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_PERMISSION_CONFIG, type HarnessSession } from '../src/config/harness'
import { useHarnessStore } from '../src/stores/harness'
import { useHarnessPageFacade } from '../src/pages/frontend/harness/useHarnessPageFacade'

const route = { params: { id: 'session-1' as string | undefined }, query: { draft: undefined as string | undefined }, fullPath: '/workspace/chat/session-1' }
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn(), info: vi.fn() } }))

function session(): HarnessSession {
  return {
    version: 1, id: 'session-1', title: '测试对话', permissionMode: 'default',
    messages: [
      { id: 'user-1', role: 'user', content: '处理文件', createdAt: 1 },
      { id: 'reply-1', role: 'assistant', content: '已处理一部分', createdAt: 2, run: { status: 'failed', startedAt: 1, completedAt: 2, durationMs: 1, activities: [] } },
    ],
    toolCalls: [], createdAt: 1, updatedAt: 2, status: 'active', pinned: false,
  }
}

function deferred() {
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((_, fail) => { reject = fail })
  return { promise, reject }
}

function setup(api: Record<string, unknown>) {
  setActivePinia(createPinia())
  const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { platform: api })
  const store = useHarnessStore()
  store.activeSession = session()
  store.ensureComposerDraft('session:session-1')
  store.updateComposerDraft('session:session-1', { modelSelection: { providerId: 'provider', modelId: 'model' } })
  const interactionSubmitting = ref(false)
  const facade = useHarnessPageFacade({
    planMode: ref(false), interactionSubmitting, permissionResponding: ref(false),
    permissionConfig: ref({ ...DEFAULT_PERMISSION_CONFIG }),
    loadEnvironment: async () => undefined,
    scrollLatestMessageToTop: vi.fn(),
  })
  return { store, facade, interactionSubmitting }
}

afterEach(() => { route.params.id = 'session-1'; route.query.draft = undefined; vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('Harness submission lifecycle', () => {
  it('does not create two sessions when send is clicked twice before creation returns', async () => {
    route.params.id = undefined
    route.query.draft = 'draft-1'
    const pending = deferred()
    const createHarnessSession = vi.fn(() => pending.promise)
    const { store, facade } = setup({ createHarnessSession })
    store.clearActiveSession()
    store.ensureComposerDraft('draft:draft-1')
    const action = {
      text: '新任务', attachments: [], activeSkillIds: [], activeMcpServerIds: [],
      permissionMode: 'default' as const, modelSelection: { providerId: 'provider', modelId: 'model' }, planning: false,
    }

    const first = facade.send(action)
    await facade.send(action)
    expect(createHarnessSession).toHaveBeenCalledTimes(1)
    expect(facade.submissionInFlight.value).toBe(true)

    pending.reject(new Error('无法创建会话'))
    await first
    expect(store.drafts['draft:draft-1'].text).toBe('新任务')
    expect(facade.submissionInFlight.value).toBe(false)
  })

  it('sends a message only once while the first request is pending', async () => {
    const pending = deferred()
    const runHarnessMessage = vi.fn(() => pending.promise)
    const saved = session()
    const { store, facade } = setup({ runHarnessMessage, getHarnessSession: vi.fn(async () => saved) })
    const action = {
      text: '继续处理', attachments: [], activeSkillIds: [], activeMcpServerIds: [],
      permissionMode: 'default' as const, modelSelection: { providerId: 'provider', modelId: 'model' }, planning: false,
    }

    const first = facade.send(action)
    await facade.send(action)
    expect(runHarnessMessage).toHaveBeenCalledTimes(1)
    expect(facade.submissionInFlight.value).toBe(true)

    pending.reject(new Error('连接失败'))
    await first
    expect(facade.submissionInFlight.value).toBe(false)
    expect(store.drafts['session:session-1'].text).toBe('继续处理')
  })

  it('prevents duplicate retries and restores the saved reply after a failed request', async () => {
    const pending = deferred()
    const rerunHarness = vi.fn(() => pending.promise)
    const saved = session()
    const { store, facade } = setup({ rerunHarness, getHarnessSession: vi.fn(async () => saved) })

    const first = facade.rerun()
    await facade.rerun()
    expect(rerunHarness).toHaveBeenCalledTimes(1)
    expect(facade.submissionInFlight.value).toBe(true)

    pending.reject(new Error('模型不可用'))
    await first
    expect(store.activeSession?.messages.at(-1)?.content).toBe('已处理一部分')
    expect(facade.submissionInFlight.value).toBe(false)
  })

  it('submits plan confirmation once and unlocks it after failure', async () => {
    const pending = deferred()
    const confirmHarnessPlan = vi.fn(() => pending.promise)
    const { store, facade, interactionSubmitting } = setup({ confirmHarnessPlan })
    store.activePlan = {
      id: 'plan-1', status: 'awaiting_confirmation', request: '处理文件', understanding: '',
      steps: [], risks: [], createdAt: 1, updatedAt: 1,
    }

    const first = facade.confirmPlan()
    await facade.confirmPlan()
    expect(confirmHarnessPlan).toHaveBeenCalledTimes(1)
    expect(store.running).toBe(true)

    pending.reject(new Error('确认失败'))
    await first
    expect(store.running).toBe(false)
    expect(interactionSubmitting.value).toBe(false)
  })

  it.each(['confirm', 'continue'] as const)('clears the running state when %s plan fails', async operation => {
    const failure = vi.fn(async () => { throw new Error('模型不可用') })
    const { store } = setup({ confirmHarnessPlan: failure, continueHarnessPlan: failure })
    const selection = { providerId: 'provider', modelId: 'model' }

    if (operation === 'confirm') await expect(store.confirmPlan('session-1', 'plan-1', selection)).rejects.toThrow('模型不可用')
    else await expect(store.continuePlan('session-1', 'plan-1', '修改意见', [], selection)).rejects.toThrow('模型不可用')

    expect(store.running).toBe(false)
    expect(failure).toHaveBeenCalledTimes(1)
  })
})
