import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type {
  HarnessMessageAttachment,
  HarnessMessageQueueSnapshot,
  HarnessMessageSubmissionReceipt,
  HarnessMessageSubmissionOptions,
  HarnessMessageSubmissionResult,
  HarnessMessageWithdrawal,
  HarnessQueuedMessage,
  HarnessGuideFallbackReason,
} from '../../src/config/harness'

export interface HarnessMessageQueueScope {
  projectId?: string
  workingDirectory?: string
}

export interface HarnessMessageQueueDependencies {
  isRunning(sessionId: string): boolean
  reserve(sessionId: string): symbol
  release(sessionId: string, token: symbol): void
  blocked(sessionId: string): boolean
  currentRunId(sessionId: string): string | undefined
  preemptAndWait(sessionId: string, expectedRunId?: string): Promise<void>
  guideFallback?(item: Submission, scope: HarnessMessageQueueScope, runId: string): HarnessGuideFallbackReason | undefined
  execute(
    item: HarnessQueuedMessage,
    attachments: HarnessMessageAttachment[],
    token: symbol,
    sender: WebContents,
    started: () => void,
    scope: HarnessMessageQueueScope,
  ): Promise<{ interrupted?: boolean }>
  publish(sender: WebContents, snapshot: HarnessMessageQueueSnapshot): void
  settled(sessionId: string): void
}

type PauseReason = NonNullable<HarnessMessageQueueSnapshot['paused']>
type Submission = Omit<HarnessQueuedMessage, 'id' | 'createdAt'>
type SubmissionIntent = Pick<Submission, 'text' | 'references' | 'selection' | 'planning'>
type Entry = { item: HarnessQueuedMessage, attachments: HarnessMessageAttachment[], scope: HarnessMessageQueueScope, fingerprint: string, sender: WebContents, started?: boolean }
type Promotion = { entry: Entry, controller: AbortController, sourceRunId?: string, admit: () => void, reject: (error: Error) => void, atomic?: boolean, discardIds?: string[] }
type QueueState = {
  revision: number
  items: Entry[]
  active?: Entry
  sender?: WebContents
  token?: symbol
  waitingForRun: boolean
  paused?: PauseReason
  error?: string
  promotion?: Promotion
  guidingItemId?: string
  activeDone?: Promise<void>
  runSettled?: () => void
}
type Receipt = { id: string, sessionId: string, fingerprint: string, delivery?: HarnessMessageSubmissionReceipt['delivery'] }

const MAX_PENDING = 32
const MAX_RECEIPTS = 64
const RECOVERABLE_QUEUE_ERROR = '待发送消息执行失败，请重试或撤回后重新发送。'
const QUEUE_BUSINESS_ERRORS = new Set([
  '工作目录已变化，请撤回消息后重新发送', '目标会话不可用', '未找到会话',
  '请先选择一个可用模型', '所选模型不属于当前供应商', '当前 Agent 模型不可用，请检查 Provider 配置',
  '该会话正在运行', '回复已停止', '没有可运行的对话', '模型没有返回文本',
  '模型未提交可确认的计划或澄清问题，请重新描述任务后重试',
  '待发送消息正在提升，请稍后重试', '当前任务已变化，请刷新后重试', '立即发送已取消，消息仍在队列中',
  '立即发送已取消，内容已保留',
  '待发送消息已开始或已撤回', '请先处理当前任务的确认',
])

function queueError(error: unknown) {
  const message = error instanceof Error ? error.message : error
  return typeof message === 'string' && QUEUE_BUSINESS_ERRORS.has(message) ? message : RECOVERABLE_QUEUE_ERROR
}

export class HarnessMessageQueue {
  private readonly sessions = new Map<string, QueueState>()
  private readonly receipts = new Map<string, Receipt>()
  private readonly submissions = new Map<string, { fingerprint: string, promise: Promise<HarnessMessageSubmissionReceipt> }>()

  constructor(private readonly deps: HarnessMessageQueueDependencies) {}

  submit(sender: WebContents, input: Submission, attachments: HarnessMessageAttachment[], scope: HarnessMessageQueueScope): HarnessMessageSubmissionReceipt
  submit(sender: WebContents, input: Submission, attachments: HarnessMessageAttachment[], scope: HarnessMessageQueueScope, options: HarnessMessageSubmissionOptions): HarnessMessageSubmissionResult | Promise<HarnessMessageSubmissionReceipt>
  submit(sender: WebContents, input: Submission, attachments: HarnessMessageAttachment[], scope: HarnessMessageQueueScope, options?: HarnessMessageSubmissionOptions) {
    if (options !== undefined) return this.submitWithOptions(sender, input, attachments, scope, options)
    const replay = this.replay(input.sessionId, input.submissionId, input)
    if (replay) return replay
    return this.enqueue(sender, input, attachments, scope, this.fingerprint(input.sessionId, input))
  }

  private enqueue(sender: WebContents, input: Submission, attachments: HarnessMessageAttachment[], scope: HarnessMessageQueueScope, fingerprint: string) {
    const frozen = structuredClone({ input, attachments, scope })
    const state = this.state(input.sessionId)
    if (state.promotion?.atomic) throw new Error('待发送消息正在提升，请稍后重试')
    if (state.items.length + (state.active && !state.active.started && !state.items.includes(state.active) ? 1 : 0) >= MAX_PENDING) throw new Error('待发送消息已达 32 条上限')
    // Reserve before the ACK, including while a previous run is tearing down.
    try {
      if (input.delivery !== 'guide' && !state.paused && !state.token) state.token = this.deps.reserve(input.sessionId)
      if (!state.active && this.deps.isRunning(input.sessionId)) state.waitingForRun = true
    } catch (error) {
      this.fail(input.sessionId, state, error)
      throw new Error(queueError(error))
    }
    const item: HarnessQueuedMessage = { ...frozen.input, id: randomUUID(), createdAt: Date.now() }
    state.items.push({ item, attachments: frozen.attachments, scope: frozen.scope, fingerprint, sender })
    state.sender = sender
    state.revision++
    this.remember(item, fingerprint)
    this.notify(input.sessionId, state)
    this.schedule(input.sessionId)
    return { id: item.id, submissionId: item.submissionId, queue: this.get(input.sessionId), ...(item.requestedDelivery ? { delivery: item.delivery === 'guide' ? 'guide' as const : 'queue' as const } : {}) }
  }

  submitWithOptions(sender: WebContents, input: Submission, attachments: HarnessMessageAttachment[], scope: HarnessMessageQueueScope, options: HarnessMessageSubmissionOptions): HarnessMessageSubmissionResult | Promise<HarnessMessageSubmissionReceipt> {
    const replay = this.replayWithOptions(input.sessionId, input.submissionId, input, options)
    if (replay) return replay
    const fingerprint = this.fingerprint(input.sessionId, input, options)
    const state = this.state(input.sessionId)
    if (state.promotion) throw new Error('待发送消息正在提升，请稍后重试')
    if ((options.delivery || options.pausedQueueDecision) && options.expectedRunId === undefined) throw new Error('当前任务已变化，请刷新后重试')
    if (options.expectedRunId !== undefined && (this.deps.currentRunId(input.sessionId) ?? null) !== options.expectedRunId) return { retryRequired: true, queue: this.get(input.sessionId) }
    if (options.delivery === 'guide') {
      if (typeof options.expectedRunId !== 'string' || options.pausedQueueDecision) throw new Error('当前任务已变化，请刷新后重试')
      const fallbackReason = state.paused ? 'confirmation' : this.deps.guideFallback ? this.deps.guideFallback(input, scope, options.expectedRunId) : 'run-unavailable'
      return this.enqueue(sender, {
        ...input, requestedDelivery: 'guide',
        ...(fallbackReason ? { fallbackReason } : { delivery: 'guide', targetRunId: options.expectedRunId }),
      }, attachments, scope, fingerprint)
    }
    if (state.guidingItemId && (options.delivery || options.pausedQueueDecision)) throw new Error('待发送消息正在提升，请稍后重试')
    const held = !!state.paused && state.items.length > 0
    if (held || options.pausedQueueDecision) {
      if (this.deps.blocked(input.sessionId)) throw new Error('请先处理当前任务的确认')
      const ids = state.items.map(entry => entry.item.id)
      if (!held || !options.pausedQueueDecision || state.revision !== options.expectedQueueRevision || ids.length !== options.expectedQueueItemIds?.length || ids.some((id, index) => id !== options.expectedQueueItemIds?.[index])) {
        return { confirmationRequired: true, queue: this.get(input.sessionId) }
      }
    }
    if (!options.delivery && !options.pausedQueueDecision) return this.submit(sender, input, attachments, scope)
    if (this.deps.blocked(input.sessionId)) throw new Error('请先处理当前任务的确认')
    const frozen = structuredClone({ input, attachments, scope, options })
    const entry: Entry = { item: { ...frozen.input, id: randomUUID(), createdAt: Date.now() }, attachments: frozen.attachments, scope: frozen.scope, fingerprint, sender }
    let resolve!: (receipt: HarnessMessageSubmissionReceipt) => void, reject!: (error: unknown) => void
    const promise = new Promise<HarnessMessageSubmissionReceipt>((done, fail) => { resolve = done; reject = fail })
    this.submissions.set(input.submissionId, { fingerprint, promise })
    state.sender = sender
    void this.promote(input.sessionId, entry, frozen.options.expectedRunId ?? undefined, true, frozen.options.pausedQueueDecision === 'discard' ? frozen.options.expectedQueueItemIds : undefined)
      .then(queue => { this.submissions.delete(input.submissionId); resolve({ id: entry.item.id, submissionId: entry.item.submissionId, queue }) }, error => { this.submissions.delete(input.submissionId); reject(error) })
    return promise
  }

  replayWithOptions(sessionId: string, submissionId: string, input: SubmissionIntent, options: HarnessMessageSubmissionOptions): HarnessMessageSubmissionReceipt | Promise<HarnessMessageSubmissionReceipt> | undefined {
    const pending = this.submissions.get(submissionId)
    if (pending) {
      if (pending.fingerprint !== this.fingerprint(sessionId, input, options)) throw new Error('待发送消息已存在且内容不同')
      return pending.promise
    }
    return this.replay(sessionId, submissionId, input, options)
  }

  replay(sessionId: string, submissionId: string, input: SubmissionIntent, options?: HarnessMessageSubmissionOptions): HarnessMessageSubmissionReceipt | undefined {
    const duplicate = this.receipts.get(submissionId) ?? this.findLiveReceipt(submissionId)
    if (!duplicate) return
    if (duplicate.fingerprint !== this.fingerprint(sessionId, input, options)) throw new Error('待发送消息已存在且内容不同')
    if (this.submissions.has(submissionId)) return
    return { id: duplicate.id, submissionId, queue: this.get(duplicate.sessionId), ...(duplicate.delivery ? { delivery: duplicate.delivery } : {}) }
  }

  stageGuide(sessionId: string, runId: string) {
    const state = this.sessions.get(sessionId)
    if (!state || state.paused || state.promotion || state.guidingItemId || this.deps.currentRunId(sessionId) !== runId || this.deps.blocked(sessionId)) return
    const entry = state.items.find(value => value.item.delivery === 'guide' && value.item.targetRunId === runId)
    if (!entry) return
    state.guidingItemId = entry.item.id
    state.revision++
    this.notify(sessionId, state)
    return structuredClone({ item: entry.item, scope: entry.scope })
  }

  consumeGuide(sessionId: string, itemId: string, runId: string, commit: () => void) {
    const state = this.sessions.get(sessionId)
    if (!state || state.paused || state.promotion || state.guidingItemId !== itemId || this.deps.currentRunId(sessionId) !== runId) return false
    const index = state.items.findIndex(value => value.item.id === itemId && value.item.delivery === 'guide' && value.item.targetRunId === runId)
    if (index < 0) return false
    commit()
    state.items.splice(index, 1)
    state.guidingItemId = undefined
    state.revision++
    this.reconcile(sessionId, state)
    this.notify(sessionId, state)
    return true
  }

  get(sessionId: string): HarnessMessageQueueSnapshot {
    const state = this.sessions.get(sessionId)
    return structuredClone({
      sessionId, revision: state?.revision ?? 0, items: state?.items.map(entry => entry.item) ?? [],
      ...(state?.paused ? { paused: state.paused } : {}),
      ...(state?.error ? { error: state.error } : {}),
      ...(state?.promotion || state?.guidingItemId ? { promotingItemId: state.promotion?.entry.item.id ?? state.guidingItemId } : {}),
    })
  }

  withdraw(sessionId: string, itemId: string): HarnessMessageWithdrawal {
    const state = this.state(sessionId)
    if (state.guidingItemId === itemId) throw new Error('待发送消息已开始或已撤回')
    if (state.promotion && (state.promotion.atomic || state.promotion.entry.item.id === itemId)) throw new Error('待发送消息正在提升，请稍后重试')
    const index = state.items.findIndex(entry => entry.item.id === itemId)
    if (index < 0) throw new Error('待发送消息已开始或已撤回')
    const [entry] = state.items.splice(index, 1)
    state.revision++
    this.reconcile(sessionId, state)
    this.notify(sessionId, state)
    return { item: structuredClone(entry!.item), queue: this.get(sessionId) }
  }

  reorder(sessionId: string, itemId: string, beforeItemId: string | null): HarnessMessageQueueSnapshot {
    const state = this.state(sessionId)
    if (state.guidingItemId && (state.guidingItemId === itemId || state.guidingItemId === beforeItemId)) throw new Error('待发送消息已开始或已撤回')
    if (state.promotion && (state.promotion.atomic || state.promotion.entry.item.id === itemId || state.promotion.entry.item.id === beforeItemId)) throw new Error('待发送消息正在提升，请稍后重试')
    const index = state.items.findIndex(entry => entry.item.id === itemId)
    if (index < 0 || beforeItemId !== null && !state.items.some(entry => entry.item.id === beforeItemId)) throw new Error('待发送消息已开始或已撤回')
    if (itemId === beforeItemId) return this.get(sessionId)
    const [entry] = state.items.splice(index, 1)
    const destination = beforeItemId === null ? state.items.length : state.items.findIndex(value => value.item.id === beforeItemId)
    state.items.splice(destination, 0, entry!)
    state.revision++
    this.notify(sessionId, state)
    return this.get(sessionId)
  }

  async sendNow(sessionId: string, itemId: string, expectedRunId?: string): Promise<HarnessMessageQueueSnapshot> {
    const state = this.state(sessionId)
    if (state.promotion || state.guidingItemId) throw new Error('待发送消息正在提升，请稍后重试')
    const entry = state.items.find(value => value.item.id === itemId)
    if (!entry) throw new Error('待发送消息已开始或已撤回')
    return this.promote(sessionId, entry, expectedRunId)
  }

  private async promote(sessionId: string, entry: Entry, expectedRunId?: string, atomic = false, discardIds?: string[]): Promise<HarnessMessageQueueSnapshot> {
    const state = this.state(sessionId)
    const sourceRunId = this.deps.currentRunId(sessionId)
    if (expectedRunId !== undefined && sourceRunId !== expectedRunId) throw new Error('当前任务已变化，请刷新后重试')
    if (this.deps.blocked(sessionId)) throw new Error('请先处理当前任务的确认')
    let admit!: () => void
    let reject!: (error: Error) => void
    const admitted = new Promise<void>((done, fail) => { admit = done; reject = fail })
    const promotion: Promotion = { entry, controller: new AbortController(), sourceRunId, admit, reject, atomic, discardIds }
    state.promotion = promotion
    state.revision++
    this.notify(sessionId, state)
    const activeDone = state.activeDone
    const outerDone = state.waitingForRun ? new Promise<void>(resolve => { state.runSettled = resolve }) : undefined
    const cancelled = atomic ? '立即发送已取消，内容已保留' : '立即发送已取消，消息仍在队列中'
    try {
      if (!state.token) state.token = this.deps.reserve(sessionId)
      await this.deps.preemptAndWait(sessionId, expectedRunId)
      await activeDone
      await outerDone
      if (promotion.controller.signal.aborted) throw new Error(cancelled)
      if (this.deps.blocked(sessionId)) throw new Error('请先处理当前任务的确认')
      state.waitingForRun = false
      void this.dispatch(sessionId, promotion)
      await admitted
      return this.get(sessionId)
    } catch (error) {
      if (promotion.controller.signal.aborted) this.pause(sessionId, 'stopped')
      else this.fail(sessionId, state, error)
      throw new Error(promotion.controller.signal.aborted ? cancelled : queueError(error))
    } finally {
      if (state.promotion === promotion) {
        state.promotion = undefined
        state.revision++
      }
      state.runSettled = undefined
      this.reconcile(sessionId, state)
      this.notify(sessionId, state)
    }
  }

  cancelPromotion(sessionId: string, expectedRunId?: string) {
    const promotion = this.sessions.get(sessionId)?.promotion
    if (!promotion || expectedRunId !== undefined && expectedRunId !== promotion.sourceRunId && expectedRunId !== this.deps.currentRunId(sessionId)) return false
    promotion.controller.abort()
    return true
  }

  resume(sessionId: string): HarnessMessageQueueSnapshot {
    const state = this.state(sessionId)
    if (state.promotion) throw new Error('待发送消息正在提升，请稍后重试')
    let blocked: boolean
    let running: boolean
    try {
      blocked = this.deps.blocked(sessionId)
      running = this.deps.isRunning(sessionId)
      if (!blocked && state.items.length && !state.token) state.token = this.deps.reserve(sessionId)
    } catch (error) {
      this.fail(sessionId, state, error)
      throw new Error(queueError(error))
    }
    if (blocked) throw new Error('请先处理当前任务的确认')
    if (state.paused || state.error) {
      state.paused = undefined
      state.error = undefined
      state.revision++
    }
    if (!state.active) state.waitingForRun = running
    this.notify(sessionId, state)
    this.schedule(sessionId)
    return this.get(sessionId)
  }

  pause(sessionId: string, reason: PauseReason, error?: string) {
    const state = this.state(sessionId)
    if (error !== undefined) error = queueError(error)
    if (state.paused !== reason || state.error !== error) {
      state.paused = reason
      state.error = error
      state.revision++
    }
    this.reconcile(sessionId, state)
    this.notify(sessionId, state)
  }

  onRunSettled(sessionId: string, status: 'completed' | 'failed' | 'aborted') {
    const state = this.sessions.get(sessionId)
    if (!state) { this.complete(sessionId); return }
    state.waitingForRun = false
    this.settleGuides(sessionId, state, status)
    try {
      if (status !== 'completed' && (!state.promotion || state.promotion.controller.signal.aborted)) this.pause(sessionId, status === 'aborted' ? 'stopped' : 'failed', state.error)
      else if (!state.paused && state.items.length && this.deps.blocked(sessionId)) this.pause(sessionId, 'confirmation')
    } catch (error) { this.fail(sessionId, state, error) }
    if (state.active) return
    this.reconcile(sessionId, state)
    this.notify(sessionId, state)
    this.complete(sessionId, state)
    state.runSettled?.()
    if (!state.paused && state.items.length) this.schedule(sessionId)
  }

  hasPending(sessionId: string) {
    const state = this.sessions.get(sessionId)
    return !!state && (!!state.active || !!state.promotion || state.items.length > 0)
  }

  pendingSessionIds() {
    return [...this.sessions.keys()].filter(sessionId => this.hasPending(sessionId))
  }

  private state(sessionId: string) {
    let state = this.sessions.get(sessionId)
    if (!state) { state = { revision: 0, items: [], waitingForRun: false }; this.sessions.set(sessionId, state) }
    return state
  }

  private findLiveReceipt(submissionId: string): Receipt | undefined {
    for (const [sessionId, state] of this.sessions) {
      const entry = [...state.items, ...(state.active ? [state.active] : [])].find(value => value.item.submissionId === submissionId)
      if (entry) return { id: entry.item.id, sessionId, fingerprint: entry.fingerprint, ...(entry.item.requestedDelivery ? { delivery: entry.item.delivery === 'guide' ? 'guide' as const : 'queue' as const } : {}) }
    }
  }

  private remember(item: HarnessQueuedMessage, fingerprint: string) {
    this.receipts.set(item.submissionId, { id: item.id, sessionId: item.sessionId, fingerprint, ...(item.requestedDelivery ? { delivery: item.delivery === 'guide' ? 'guide' as const : 'queue' as const } : {}) })
    if (this.receipts.size > MAX_RECEIPTS) this.receipts.delete(this.receipts.keys().next().value!)
  }

  private fingerprint(sessionId: string, input: SubmissionIntent, options?: HarnessMessageSubmissionOptions) {
    return JSON.stringify({
      sessionId, text: input.text, references: input.references.map(({ path, name }) => ({ path, name })),
      selection: { providerId: input.selection.providerId, modelId: input.selection.modelId, thinkingLevel: input.selection.thinkingLevel },
      planning: input.planning,
      ...(options && (options.delivery || options.pausedQueueDecision) ? { options: {
        delivery: options.delivery, pausedQueueDecision: options.pausedQueueDecision,
        expectedQueueRevision: options.expectedQueueRevision, expectedQueueItemIds: options.expectedQueueItemIds, expectedRunId: options.expectedRunId,
      } } : {}),
    })
  }

  private notify(sessionId: string, state: QueueState) {
    if (state.sender) {
      try { this.deps.publish(state.sender, this.get(sessionId)) } catch { /* A detached renderer must not affect accepted input. */ }
    }
  }

  private settleGuides(sessionId: string, state: QueueState, status: 'completed' | 'failed' | 'aborted') {
    if (this.deps.isRunning(sessionId) || this.deps.currentRunId(sessionId)) return
    const guides = state.items.filter(entry => entry.item.delivery === 'guide')
    if (!guides.length) return
    state.guidingItemId = undefined
    for (const entry of guides) {
      delete entry.item.delivery
      delete entry.item.targetRunId
      entry.item.fallbackReason = 'run-ended'
      this.remember(entry.item, entry.fingerprint)
    }
    state.paused = status === 'aborted' ? 'stopped' : status === 'failed' ? 'failed' : state.paused || 'confirmation'
    state.revision++
  }

  private release(sessionId: string, state: QueueState) {
    const token = state.token
    state.token = undefined
    if (token) {
      try { this.deps.release(sessionId, token) }
      catch (error) {
        if (state.items.length) {
          state.paused = 'failed'
          state.error = queueError(error)
          state.revision++
        }
      }
    }
  }

  private reconcile(sessionId: string, state: QueueState) {
    if (state.active || state.promotion) return
    if (!state.items.length) {
      state.paused = undefined
      state.error = undefined
      state.waitingForRun = false
      this.release(sessionId, state)
    } else if (state.paused) this.release(sessionId, state)
  }

  private schedule(sessionId: string) {
    queueMicrotask(() => { void this.dispatch(sessionId) })
  }

  private fail(sessionId: string, state: QueueState, error: unknown) {
    state.paused = 'failed'
    state.error = queueError(error)
    state.revision++
    this.reconcile(sessionId, state)
    this.notify(sessionId, state)
  }

  private complete(sessionId: string, state?: QueueState) {
    try { this.deps.settled(sessionId) }
    catch (error) { if (state) this.fail(sessionId, state, error) }
  }

  private async dispatch(sessionId: string, promotion?: Promotion) {
    const state = this.state(sessionId)
    if (state.active || !promotion && !state.items.length || state.waitingForRun || !promotion && (state.paused || state.promotion)) return
    let entry: Entry | undefined
    let completeActive: (() => void) | undefined
    try {
      if (this.deps.isRunning(sessionId)) {
        if (promotion) throw new Error('当前任务已变化，请刷新后重试')
        state.waitingForRun = true
        return
      }
      this.settleGuides(sessionId, state, 'completed')
      if (!promotion && state.paused) return
      if (this.deps.blocked(sessionId)) {
        if (promotion) throw new Error('请先处理当前任务的确认')
        this.pause(sessionId, 'confirmation')
        return
      }
      if (!state.token) state.token = this.deps.reserve(sessionId)
      entry = promotion?.entry || state.items.shift()!
      state.active = entry
      state.activeDone = new Promise<void>(resolve => { completeActive = resolve })
      state.revision++
      this.notify(sessionId, state)
      const result = await this.deps.execute(structuredClone(entry.item), structuredClone(entry.attachments), state.token, entry.sender, () => {
        if (entry!.started) return
        entry!.started = true
        if (promotion) {
          if (promotion.atomic) {
            this.remember(entry!.item, entry!.fingerprint)
            if (promotion.discardIds) {
              state.items = state.items.filter(value => !promotion.discardIds!.includes(value.item.id))
              state.paused = undefined
              state.error = undefined
            }
          } else state.items.splice(state.items.indexOf(entry!), 1)
          if (state.promotion === promotion) state.promotion = undefined
          state.revision++
          this.notify(sessionId, state)
          promotion.admit()
        }
      }, structuredClone(entry.scope))
      if (result.interrupted) {
        if (!entry.started && !promotion) state.items.unshift(entry)
        if (!state.promotion || state.promotion.controller.signal.aborted) this.pause(sessionId, 'stopped')
      }
      else if (!state.paused && state.items.length && this.deps.blocked(sessionId)) this.pause(sessionId, 'confirmation')
      if (promotion && !entry.started) promotion.reject(new Error(promotion.atomic ? '立即发送已取消，内容已保留' : '立即发送已取消，消息仍在队列中'))
    } catch (error) {
      if (entry && !entry.started && !promotion) state.items.unshift(entry)
      this.fail(sessionId, state, error)
      promotion?.reject(new Error(queueError(error)))
    } finally {
      // Clear processing before any external cleanup or completion observer can fail.
      if (entry) {
        state.active = undefined
        state.activeDone = undefined
        state.revision++
        this.settleGuides(sessionId, state, state.paused === 'failed' ? 'failed' : state.paused === 'stopped' ? 'aborted' : 'completed')
      }
      if (!state.waitingForRun) {
        this.reconcile(sessionId, state)
        this.notify(sessionId, state)
        this.complete(sessionId, state)
        if (!state.paused && state.items.length) this.schedule(sessionId)
      }
      completeActive?.()
    }
  }
}
