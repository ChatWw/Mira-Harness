import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { Type } from '@earendil-works/pi-ai'
import { normalizePlanRisks, normalizePlanSteps, type HarnessEvent, type HarnessFileReference, type HarnessPendingInteraction, type HarnessPlan, type HarnessSession, type HarnessUserAnswer, type HarnessUserQuestion, type ModelSelection } from '../src/config/harness'
import type { PlatformDatabase } from './database'

type PublishEvent = (sender: WebContents | undefined, event: HarnessEvent) => unknown
type ProviderSelection = { provider: any, apiKey: string }
type RunAgent = (sender: WebContents, sessionId: string, session: HarnessSession, selection: ModelSelection, provider: any, apiKey: string, options?: { planning?: boolean }) => Promise<unknown>

interface HarnessPlanCoordinatorOptions {
  isRunning: (sessionId: string) => boolean
  requireProvider: (selection?: ModelSelection) => ProviderSelection
  runAgent: RunAgent
  runMessage: (sender: WebContents, sessionId: string, message: string, references: HarnessFileReference[], selection: ModelSelection | undefined, planning: boolean) => Promise<unknown>
  abort: (sessionId: string) => void
}

function normalizeQuestions(value: unknown): HarnessUserQuestion[] {
  const seen = new Set<string>()
  const rawQuestions = Array.isArray(value) ? value : value === undefined ? [] : [value]
  const questions = rawQuestions.flatMap((raw, index): HarnessUserQuestion[] => {
    const item = typeof raw === 'string' ? { question: raw } : raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const suppliedId = typeof item.id === 'string' ? item.id.trim().slice(0, 80) : ''
    const id = suppliedId || `question-${index + 1}`
    const question = [item.question, item.text, item.prompt, item.content].find(entry => typeof entry === 'string' && entry.trim()) as string | undefined
    if (!id || !question || seen.has(id)) return []
    seen.add(id)
    const choices = Array.isArray(item.options) ? item.options.flatMap((option: unknown) => {
      if (typeof option === 'string' && option.trim()) return [{ label: option.trim().slice(0, 160) }]
      if (!option || typeof option !== 'object') return []
      const choice = option as Record<string, unknown>
      return typeof choice.label === 'string' && choice.label.trim() ? [{ label: choice.label.trim().slice(0, 160), ...(typeof choice.description === 'string' && choice.description.trim() ? { description: choice.description.trim().slice(0, 500) } : {}) }] : []
    }).slice(0, item.multiSelect === true ? 5 : 3) : undefined
    return [{ id, question: question.trim().slice(0, 1000), ...(typeof item.header === 'string' && item.header.trim() ? { header: item.header.trim().slice(0, 80) } : {}), ...(typeof item.context === 'string' && item.context.trim() ? { context: item.context.trim().slice(0, 1000) } : {}), ...(choices?.length ? { options: choices } : {}), ...(item.multiSelect === true ? { multiSelect: true } : {}), ...(item.allowCustom !== false ? { allowCustom: true } : {}) }]
  }).slice(0, 5)
  return questions.length ? questions : [{ id: 'question-1', question: '为了继续制定方案，请补充这次最希望解决的问题、预期效果或优先级。' }]
}

export class HarnessPlanCoordinator {
  constructor(private readonly database: PlatformDatabase, private readonly publish: PublishEvent, private readonly options: HarnessPlanCoordinatorOptions) {}

  createTools(sender: WebContents | undefined, sessionId: string) {
    const session = () => this.database.harness.getSession(sessionId)
    const askUserTool = {
      name: 'ask_user', label: '询问用户', description: '在继续规划前向用户提出关键澄清问题。可以一次提出最多 5 个问题，用户会逐个作答（也可跳过）。单选题请给出不超过 3 个候选，多选题不超过 5 个；自由输入由界面提供，无需兜底选项。调用后会等待用户作答；不要把同样的问题重复写进普通回复。',
      parameters: Type.Object({ questions: Type.Optional(Type.Any()) }),
      executionMode: 'sequential',
      execute: async (_id: string, params: any) => {
        const questions = normalizeQuestions(params?.questions)
        const plan = session().activePlan
        if (!plan) throw new Error('当前没有计划')
        const interaction: HarnessPendingInteraction = { id: randomUUID(), kind: 'question', status: 'waiting', questions, createdAt: Date.now() }
        this.database.harness.updatePlan(sessionId, { status: 'awaiting_input' })
        this.database.harness.setPendingInteraction(sessionId, interaction)
        this.publish(sender, { sessionId, type: 'interaction-created', payload: { interaction } })
        return { content: [{ type: 'text', text: '问题已展示，等待用户回答。' }], details: { interactionId: interaction.id }, terminate: true }
      },
    }
    const presentPlanTool = {
      name: 'present_plan', label: '展示方案', description: '信息已经齐全时提交完整方案供用户审阅。不要包含待回答问题；用户批准前不得执行修改。',
      parameters: Type.Object({ understanding: Type.String(), steps: Type.Array(Type.Object({ label: Type.String(), detail: Type.Optional(Type.String()) })), risks: Type.Optional(Type.Array(Type.String())) }),
      executionMode: 'sequential',
      execute: async (_id: string, params: any) => {
        const understanding = String(params.understanding || '').trim()
        const steps = normalizePlanSteps(params.steps)
        const risks = normalizePlanRisks(params.risks)
        if (!understanding || !steps.length) throw new Error('完整方案必须包含当前理解和至少一个步骤')
        const existing = session().activePlan
        if (!existing) throw new Error('当前没有计划')
        const plan: HarnessPlan = { ...existing, understanding, steps, risks, status: 'awaiting_confirmation', updatedAt: Date.now() }
        this.database.harness.setActivePlan(sessionId, plan)
        const interaction: HarnessPendingInteraction = { id: randomUUID(), kind: 'plan-review', status: 'waiting', planId: plan.id, createdAt: Date.now() }
        this.database.harness.setPendingInteraction(sessionId, interaction)
        this.publish(sender, { sessionId, type: 'plan-updated', payload: { plan } })
        this.publish(sender, { sessionId, type: 'interaction-created', payload: { interaction } })
        return { content: [{ type: 'text', text: '方案已展示，等待用户确认。' }], details: { planId: plan.id, interactionId: interaction.id }, terminate: true }
      },
    }
    return { askUserTool, presentPlanTool }
  }

  async confirm(sender: WebContents, sessionId: string, planId: string, selection?: ModelSelection) {
    if (this.options.isRunning(sessionId)) throw new Error('该会话正在运行')
    const session = this.database.harness.getSession(sessionId)
    const interaction = session.pendingInteraction
    if (!session.activePlan || session.activePlan.id !== planId || session.activePlan.status !== 'awaiting_confirmation' || interaction?.kind !== 'plan-review' || interaction.status !== 'waiting' || interaction.planId !== planId) throw new Error('计划当前不可执行')
    const { provider, apiKey } = this.options.requireProvider(selection)
    this.database.harness.resolvePendingInteraction(sessionId, interaction.id, 'approved')
    const confirmed = this.database.harness.confirmPlan(sessionId, planId)
    this.publish(sender, { sessionId, type: 'plan-confirmed', payload: { plan: confirmed.activePlan } })
    this.publish(sender, { sessionId, type: 'interaction-resolved', payload: { interactionId: interaction.id, status: 'approved' } })
    return this.options.runAgent(sender, sessionId, confirmed, selection!, provider, apiKey)
  }

  async answer(sender: WebContents, sessionId: string, interactionId: string, answers: HarnessUserAnswer[], selection?: ModelSelection) {
    const session = this.database.harness.getSession(sessionId)
    const interaction = session.pendingInteraction
    if (!session.activePlan || interaction?.id !== interactionId || interaction.kind !== 'question' || interaction.status !== 'waiting') throw new Error('问题当前不可回答')
    const expected = new Set(interaction.questions.map(question => question.id))
    if (!Array.isArray(answers) || answers.length !== expected.size || answers.some(answer => !expected.has(answer.id))) throw new Error('回答不完整或不匹配')
    if (this.options.isRunning(sessionId)) throw new Error('当前问题正在保存，请稍后重试')
    this.database.harness.resolvePendingInteraction(sessionId, interactionId, 'answered', answers)
    this.database.harness.updatePlan(sessionId, { status: 'planning' })
    this.publish(sender, { sessionId, type: 'interaction-resolved', payload: { interactionId, status: 'answered', answers } })
    const { provider, apiKey } = this.options.requireProvider(selection)
    const questionById = new Map(interaction.questions.map(question => [question.id, question] as const))
    const text = `用户对澄清问题的回答：\n${answers.map(answer => `- ${questionById.get(answer.id)?.question || answer.id}：${answer.custom || answer.selected.join('、') || '（用户跳过）'}`).join('\n')}`
    const resumed = this.database.harness.addMessage(sessionId, 'user', text, undefined, true)
    return this.options.runAgent(sender, sessionId, resumed, selection!, provider, apiKey, { planning: true })
  }

  async continue(sender: WebContents, sessionId: string, planId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection) {
    const session = this.database.harness.getSession(sessionId)
    if (!session.activePlan || session.activePlan.id !== planId) throw new Error('计划不存在')
    if (session.pendingInteraction?.kind === 'plan-review' && session.pendingInteraction.status === 'waiting') {
      this.database.harness.resolvePendingInteraction(sessionId, session.pendingInteraction.id, 'discussing')
      this.publish(sender, { sessionId, type: 'interaction-resolved', payload: { interactionId: session.pendingInteraction.id, status: 'discussing' } })
    }
    this.database.harness.updatePlan(sessionId, { status: 'planning' })
    return this.options.runMessage(sender, sessionId, message, references, selection, true)
  }

  cancel(sender: WebContents, sessionId: string, planId: string) {
    const session = this.database.harness.getSession(sessionId)
    if (session.pendingInteraction?.status === 'waiting') {
      this.database.harness.resolvePendingInteraction(sessionId, session.pendingInteraction.id, 'cancelled')
      this.publish(sender, { sessionId, type: 'interaction-resolved', payload: { interactionId: session.pendingInteraction.id, status: 'cancelled' } })
    }
    const plan = this.database.harness.cancelPlan(sessionId, planId).activePlan
    this.publish(sender, { sessionId, type: 'plan-cancelled', payload: { plan } })
    this.options.abort(sessionId)
    return plan
  }
}
