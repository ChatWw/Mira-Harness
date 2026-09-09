import { computed, nextTick, ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getPlatformApi } from '@/platform'
import { OPEN_HARNESS_PROJECT_DIALOG_EVENT, type HarnessFileReference, type HarnessGitBranch, type HarnessGitConfig, type HarnessMessage, type HarnessUserAnswer, type ModelSelection, type PermissionMode, type ThinkingLevel } from '@/config/harness'
import { useHarnessStore } from '@/stores/harness'
import { createHarnessSendAction, type HarnessSendAction } from './harnessComposerActions'

export type { HarnessSendAction } from './harnessComposerActions'

export type HarnessComposerAction =
  | { type: 'update-draft', patch: { text?: string, projectId?: string, attachments?: HarnessFileReference[], modelSelection?: ModelSelection, permissionMode?: PermissionMode, activeSkillIds?: string[], activeMcpServerIds?: string[] } }
  | { type: 'select-project', projectId?: string }
  | { type: 'refresh-projects' }
  | { type: 'refresh-composer-data' }
  | { type: 'create-project' }
  | { type: 'set-model', providerId: string, modelId: string, thinkingLevel?: ThinkingLevel }
  | { type: 'set-permission', permissionMode: PermissionMode }
  | { type: 'set-skill', id: string, enabled: boolean }
  | { type: 'set-mcp', id: string, enabled: boolean }
  | { type: 'set-delegation', enabled: boolean }
  | { type: 'select-files', projectId: string }
  | { type: 'resolve-file-path', file: File }
  | { type: 'list-git-branches', projectId: string }
  | { type: 'checkout-git-branch', projectId: string, branchName: string }
  | { type: 'get-git-config' }
  | { type: 'create-git-branch', projectId: string, branchName: string }
  | { type: 'open-git-settings' }
  | { type: 'save-memory', selection?: ModelSelection }
  | { type: 'send', payload: HarnessSendAction }
  | { type: 'abort' }
  | { type: 'confirm-plan' }
  | { type: 'answer-plan-questions', answers: HarnessUserAnswer[] }
  | { type: 'cancel-plan' }

export type HarnessComposerDispatch = (action: HarnessComposerAction) => Promise<unknown>

export function useHarnessPageFacade(options: {
  planMode: Ref<boolean>
  interactionSubmitting: Ref<boolean>
  permissionResponding: Ref<boolean>
  loadEnvironment: () => Promise<void>
  scrollLatestMessageToTop: (messageId: string) => void
}) {
  const route = useRoute()
  const router = useRouter()
  const store = useHarnessStore()
  const enteringMessageId = ref<string>()
  const sessionId = computed(() => typeof route.params.id === 'string' ? route.params.id : undefined)
  const draftToken = computed(() => typeof route.query.draft === 'string' ? route.query.draft : undefined)
  const draftKey = computed(() => sessionId.value ? `session:${sessionId.value}` : (draftToken.value ? `draft:${draftToken.value}` : ''))
  const isPersistedSession = computed(() => Boolean(sessionId.value))
  const composerDraft = computed(() => draftKey.value ? store.drafts[draftKey.value] || { text: '', attachments: [], updatedAt: 0 } : { text: '', attachments: [], updatedAt: 0 })
  let routeLoadPromise: Promise<void> = Promise.resolve()

  async function loadSession() {
    if (sessionId.value) {
      if (store.activeSession?.id !== sessionId.value) await store.openSession(sessionId.value)
      const key = `session:${sessionId.value}`
      store.ensureComposerDraft(key)
      const session = store.activeSession
      if (session?.modelProviderId && session.modelId && !store.drafts[key]?.modelSelection) {
        const savedSelection = store.lastModelSelection
        store.updateComposerDraft(key, {
          modelSelection: {
            providerId: session.modelProviderId,
            modelId: session.modelId,
            thinkingLevel: savedSelection?.providerId === session.modelProviderId && savedSelection.modelId === session.modelId
              ? savedSelection.thinkingLevel
              : undefined,
          },
        })
      }
      return
    }
    store.clearActiveSession()
    if (!draftToken.value) {
      const token = store.startDraft()
      await router.replace({ path: '/workspace/chat', query: { ...route.query, draft: token } })
      return
    }
    const key = `draft:${draftToken.value}`
    store.ensureComposerDraft(key)
    if (!store.drafts[key]?.modelSelection && store.lastModelSelection) {
      store.updateComposerDraft(key, { modelSelection: { ...store.lastModelSelection } })
    }
  }

  function reload() {
    routeLoadPromise = Promise.all([options.loadEnvironment(), loadSession()]).then(() => undefined)
    return routeLoadPromise
  }

  async function respondPermission(allowed: boolean) {
    const activeId = store.activeSession?.id
    if (!activeId || options.permissionResponding.value) return
    options.permissionResponding.value = true
    try {
      await store.respondPermission(activeId, allowed)
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '提交审批结果失败')
    } finally {
      options.permissionResponding.value = false
    }
  }

  async function rerun() {
    const api = getPlatformApi()
    const session = store.activeSession
    if (!api || !session || store.running || store.rendering) return
    const last = session.messages[session.messages.length - 1]
    if (last?.role === 'assistant') session.messages.pop()
    const selection = composerDraft.value.modelSelection
    try {
      await api.rerunHarness(session.id, selection ? { ...selection } : undefined)
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '重新生成失败')
    }
  }

  async function editAndRerun(message: HarnessMessage, content: string) {
    const api = getPlatformApi()
    const session = store.activeSession
    if (!api || !session || !content || store.running || store.rendering) return
    const messageIndex = session.messages.findIndex(item => item.id === message.id)
    if (messageIndex < 0) return
    session.messages[messageIndex].content = content
    session.messages = session.messages.slice(0, messageIndex + 1)
    session.context = undefined
    store.running = true
    try {
      const selection = composerDraft.value.modelSelection
      await api.editAndRerunHarnessMessage(session.id, message.id, content, selection ? { ...selection } : undefined)
    } catch (error) {
      await store.openSession(session.id).catch(() => undefined)
      ElMessage.error(error instanceof Error ? error.message : '重新生成失败')
    } finally {
      store.running = false
    }
  }

  async function confirmPlan() {
    const plan = store.activePlan
    const activeId = store.activeSession?.id
    const selection = composerDraft.value.modelSelection
    if (!plan || !activeId || !selection) return
    options.interactionSubmitting.value = true
    try {
      await store.confirmPlan(activeId, plan.id, { ...selection })
      options.planMode.value = false
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '无法执行计划')
    } finally {
      options.interactionSubmitting.value = false
    }
  }

  async function answerPlanQuestions(answers: HarnessUserAnswer[]) {
    const interaction = store.activeInteraction
    const activeId = store.activeSession?.id
    const selection = composerDraft.value.modelSelection
    if (!interaction || interaction.kind !== 'question' || !activeId || !selection) return
    options.interactionSubmitting.value = true
    try {
      await store.answerInteraction(activeId, interaction.id, answers.map(answer => ({ ...answer })), { ...selection })
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '无法提交回答')
    } finally {
      options.interactionSubmitting.value = false
    }
  }

  async function cancelPlan() {
    const plan = store.activePlan
    const activeId = store.activeSession?.id
    if (!plan || !activeId) return
    options.interactionSubmitting.value = true
    try {
      await store.cancelPlan(activeId, plan.id)
      options.planMode.value = false
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '无法取消计划')
    } finally {
      options.interactionSubmitting.value = false
    }
  }

  async function send(action: HarnessSendAction) {
    const api = getPlatformApi()
    const originKey = draftKey.value
    if (!api || !originKey || !action.text || store.running || store.rendering) return
    if (store.activeInteraction?.kind === 'question' && store.activeInteraction.status === 'waiting') {
      ElMessage.info('请先回答当前澄清问题。')
      return
    }
    const payload = createHarnessSendAction(action)
    let activeId = sessionId.value
    try {
      if (!activeId) {
        const session = await store.createSession(payload.projectId)
        if (!session) return
        activeId = session.id
        const key = `session:${session.id}`
        store.ensureComposerDraft(key)
        if (payload.activeSkillIds.length) store.activeSession = await api.setHarnessActiveSkills(session.id, payload.activeSkillIds)
        if (payload.activeMcpServerIds.length) store.activeSession = await api.setHarnessActiveMcpServers(session.id, payload.activeMcpServerIds)
        store.updateComposerDraft(key, { text: payload.text, attachments: payload.attachments, activeSkillIds: payload.activeSkillIds, activeMcpServerIds: payload.activeMcpServerIds, modelSelection: payload.modelSelection, permissionMode: payload.permissionMode })
        store.removeComposerDraft(originKey)
        await router.replace(`/workspace/chat/${session.id}`)
        await nextTick()
        await routeLoadPromise
      }
      if (store.activeSession?.permissionMode !== payload.permissionMode) await store.setSessionPermission(activeId, payload.permissionMode)
      const key = `session:${activeId}`
      store.updateComposerDraft(key, { text: '', attachments: [] })
      const messageId = `local-${Date.now()}`
      enteringMessageId.value = messageId
      store.activeSession?.messages.push({ id: messageId, role: 'user', content: payload.text, attachments: payload.attachments.map(file => ({ ...file, content: '' })), createdAt: Date.now() })
      options.scrollLatestMessageToTop(messageId)
      store.running = true
      await nextTick()
      const plan = store.activePlan
      if (plan && plan.status === 'awaiting_confirmation') await api.continueHarnessPlan(activeId, plan.id, payload.text, payload.attachments, payload.modelSelection)
      else await api.runHarnessMessage(activeId, payload.text, payload.attachments, payload.modelSelection, payload.planning)
    } catch (error) {
      const key = activeId ? `session:${activeId}` : originKey
      const session = activeId ? await store.openSession(activeId).catch(() => undefined) : undefined
      const persisted = session?.messages.some(message => message.role === 'user' && message.content === payload.text)
      if (!persisted) store.updateComposerDraft(key, { text: payload.text, attachments: payload.attachments, activeSkillIds: payload.activeSkillIds, activeMcpServerIds: payload.activeMcpServerIds, modelSelection: payload.modelSelection, permissionMode: payload.permissionMode })
      ElMessage.error(error instanceof Error ? error.message : '消息发送失败')
    } finally {
      store.running = false
    }
  }

  async function abort() {
    if (store.activeSession) await getPlatformApi()?.abortHarnessRun(store.activeSession.id)
  }

  async function stopSubtask(id: string) {
    if (store.activeSession) await getPlatformApi()?.stopHarnessSubtasks(store.activeSession.id, [id])
  }

  async function dispatchComposerAction(action: HarnessComposerAction): Promise<unknown> {
    const api = getPlatformApi()
    if (action.type === 'update-draft') {
      if (draftKey.value) {
        const patch = { ...action.patch }
        if (action.patch.attachments) patch.attachments = action.patch.attachments.map(file => ({ path: file.path, name: file.name }))
        if (action.patch.modelSelection) patch.modelSelection = { ...action.patch.modelSelection }
        if (action.patch.activeSkillIds) patch.activeSkillIds = [...action.patch.activeSkillIds]
        if (action.patch.activeMcpServerIds) patch.activeMcpServerIds = [...action.patch.activeMcpServerIds]
        store.updateComposerDraft(draftKey.value, patch)
      }
      return
    }
    if (action.type === 'select-project') {
      if (draftKey.value && !isPersistedSession.value) store.updateComposerDraft(draftKey.value, { projectId: action.projectId, attachments: [] })
      return
    }
    if (action.type === 'refresh-projects') return store.refreshProjects()
    if (action.type === 'refresh-composer-data') {
      if (!api) return { skills: [], mcpServers: [], memoryEnabled: false }
      const [skills, mcpServers, memoryEnabled] = await Promise.all([api.listHarnessSkills(), api.listMcpServers(), api.getHarnessMemoryEnabled()])
      return { skills: [...skills], mcpServers: mcpServers.map(server => ({ ...server, args: [...server.args] })), memoryEnabled }
    }
    if (action.type === 'create-project') {
      window.dispatchEvent(new CustomEvent<{ onCreated: (projectId: string) => void }>(OPEN_HARNESS_PROJECT_DIALOG_EVENT, {
        detail: { onCreated: projectId => { void dispatchComposerAction({ type: 'select-project', projectId }) } },
      }))
      return
    }
    if (action.type === 'set-model') {
      const selection = { providerId: action.providerId, modelId: action.modelId, thinkingLevel: action.thinkingLevel }
      store.setLastModelSelection(selection)
      if (draftKey.value) store.updateComposerDraft(draftKey.value, { modelSelection: selection })
      return
    }
    if (action.type === 'set-permission') {
      if (store.activeSession) await store.setSessionPermission(store.activeSession.id, action.permissionMode)
      if (draftKey.value) store.updateComposerDraft(draftKey.value, { permissionMode: action.permissionMode })
      return
    }
    if (action.type === 'set-skill') {
      if (!draftKey.value) return false
      const current = store.activeSession?.activeSkillIds || composerDraft.value.activeSkillIds || []
      const next = action.enabled ? [...new Set([...current, action.id])] : current.filter(value => value !== action.id)
      if (store.activeSession && api) store.activeSession = await api.setHarnessActiveSkills(store.activeSession.id, [...next])
      else store.updateComposerDraft(draftKey.value, { activeSkillIds: next })
      return true
    }
    if (action.type === 'set-mcp') {
      if (!draftKey.value) return
      const current = store.activeSession?.activeMcpServerIds || composerDraft.value.activeMcpServerIds || []
      const next = action.enabled ? [...new Set([...current, action.id])] : current.filter(value => value !== action.id)
      if (store.activeSession) await store.setActiveMcpServers(store.activeSession.id, next)
      else store.updateComposerDraft(draftKey.value, { activeMcpServerIds: next })
      return
    }
    if (action.type === 'set-delegation') {
      if (store.activeSession) await store.setDelegationEnabled(store.activeSession.id, action.enabled)
      return
    }
    if (!api) return
    if (action.type === 'select-files') return (await api.selectHarnessFiles(action.projectId)).map(file => ({ path: file.path, name: file.name }))
    if (action.type === 'resolve-file-path') return api.getPathForFile(action.file)
    if (action.type === 'list-git-branches') return api.listHarnessGitBranches(action.projectId)
    if (action.type === 'checkout-git-branch') {
      const branches = await api.checkoutHarnessGitBranch(action.projectId, action.branchName)
      await store.refreshProjects()
      return branches.map(branch => ({ ...branch }))
    }
    if (action.type === 'get-git-config') return { ...await api.getHarnessGitConfig() } satisfies HarnessGitConfig
    if (action.type === 'create-git-branch') {
      const branches = await api.createAndCheckoutHarnessGitBranch(action.projectId, action.branchName)
      await store.refreshProjects()
      return branches.map((branch: HarnessGitBranch) => ({ ...branch }))
    }
    if (action.type === 'open-git-settings') return router.push({ path: '/settings/git', query: { from: route.fullPath } })
    if (action.type === 'save-memory') {
      const session = store.activeSession
      if (!session) return
      await api.saveHarnessProjectMemory(session.id, action.selection ? { ...action.selection } : undefined)
      store.activeSession = await api.getHarnessSession(session.id)
      return
    }
    if (action.type === 'send') return send(action.payload)
    if (action.type === 'abort') return abort()
    if (action.type === 'confirm-plan') return confirmPlan()
    if (action.type === 'answer-plan-questions') return answerPlanQuestions(action.answers)
    if (action.type === 'cancel-plan') return cancelPlan()
  }

  function clearMessageEntrance(messageId: string) {
    if (enteringMessageId.value === messageId) enteringMessageId.value = undefined
  }

  return {
    sessionId,
    draftToken,
    draftKey,
    isPersistedSession,
    composerDraft,
    enteringMessageId,
    reload,
    respondPermission,
    rerun,
    editAndRerun,
    confirmPlan,
    answerPlanQuestions,
    cancelPlan,
    send,
    abort,
    stopSubtask,
    dispatchComposerAction,
    clearMessageEntrance,
  }
}
