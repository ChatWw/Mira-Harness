/* Hook output and matcher semantics adapted from ZCode hooks.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import { randomUUID } from 'node:crypto'
import type { ToolCallRecord } from '../../src/config/harness'
import type { MiraHookEvent, MiraHookItem } from '../../src/config/miraHooks'
import type { MiraHookStore } from '../storage/miraHookStore'
import { publicHarnessText, publicHarnessToolInput } from './agentTools'
import { executeMiraHook, type MiraHookInput, type MiraHookOutput } from './miraHookRunner'

type Permission = 'allow' | 'ask' | 'deny'
export interface MiraHookRunResult {
  contexts: string[]
  blocked?: string
  permission?: Permission
  permissionReason?: string
  updatedInput?: unknown
  stopShouldContinue: boolean
  stopReason?: string
  permissionRequest?: NonNullable<MiraHookOutput['hookSpecificOutput']>['decision']
}
interface Options {
  store: Pick<MiraHookStore, 'list' | 'assert'>
  directory?: string
  inputBase: Omit<MiraHookInput, 'hookEventName'> & { sessionId: string; cwd: string; runId: string }
  signal: AbortSignal
  secrets?: string[]
  onRecord: (record: ToolCallRecord) => void
}
export function matchesMiraHook(matchValue: string | undefined, matcher: string | undefined): boolean {
  if (!matcher || matcher === '*') return true
  if (!matchValue) return false
  if (/^[a-zA-Z0-9_|]+$/.test(matcher)) return matcher.split('|').includes(matchValue)
  try { return new RegExp(matcher).test(matchValue) } catch { return false }
}
function mergePermission(current: Permission | undefined, next: Permission): Permission {
  if (current === 'deny' || next === 'deny') return 'deny'
  if (current === 'ask' || next === 'ask') return 'ask'
  return next
}
const permissionEvent = (event: MiraHookEvent) => event === 'PreToolUse' || event === 'PermissionRequest'
const preventsContinuation = (event: MiraHookEvent) => permissionEvent(event) || event === 'UserPromptSubmit'

export class HarnessHooks {
  private readonly snapshot: MiraHookItem[]
  private readonly pending = new Set<Promise<void>>()
  private readonly reportedUntrusted = new Set<string>()
  private readonly controller = new AbortController()
  private readonly abort = () => this.controller.abort()
  constructor(private readonly options: Options) {
    this.snapshot = options.store.list(options.directory)
    if (options.signal.aborted) this.abort()
    else options.signal.addEventListener('abort', this.abort, { once: true })
  }
  private safe(text: string, partial = false) {
    // Incremental/chunk-limit output can end in a prefix of a known secret.
    if (partial) for (const secret of this.options.secrets ?? []) for (let size = Math.min(secret.length - 1, text.length); size > 0; size--) {
      if (text.endsWith(secret.slice(0, size))) { text = text.slice(0, -size) + '[已隐藏]'; break }
    }
    return publicHarnessText(text, this.options.secrets).text
  }
  private announce(hook: MiraHookItem, input: MiraHookInput, error?: string, skipped = false): ToolCallRecord {
    const row: ToolCallRecord = {
      id: randomUUID(), tool: 'hook', target: this.safe(`${hook.event} · ${hook.statusMessage || hook.name}`),
      runId: this.options.inputBase.runId, status: skipped ? 'cancelled' : error ? 'failed' : 'running',
      input: publicHarnessToolInput({ name: hook.name, event: hook.event, type: hook.type, async: hook.type === 'command' && hook.async,
        ...(hook.pluginId ? { pluginId: hook.pluginId, pluginName: hook.pluginName, sourcePath: hook.sourcePath } : {}), input }, this.options.secrets),
      createdAt: Date.now(), ...(error ? { ...(skipped ? { skipReason: this.safe(error) } : { error: this.safe(error) }), completedAt: Date.now() } : {}),
    }
    this.options.onRecord(row); return row
  }
  private async execute(hook: MiraHookItem, input: MiraHookInput, signal = this.controller.signal) {
    const record = this.announce(hook, input)
    let changed = false
    const result = await executeMiraHook(hook, input, {
      cwd: this.options.inputBase.cwd, signal,
      ...(hook.pluginId ? { plugin: { id: hook.pluginId, name: hook.pluginName!, root: hook.sourceRoot, data: hook.pluginDataPath! } } : {}),
      assertCurrent: () => { try { this.options.store.assert(hook, this.options.directory) } catch (error) { changed = true; throw error } },
    })
    const blocked = !(hook.type === 'command' && hook.async) && result.output && (result.output.continue === false && input.hookEventName !== 'Stop' || result.output.decision === 'block' || result.output.hookSpecificOutput?.permissionDecision === 'deny' || result.output.hookSpecificOutput?.decision?.behavior === 'deny')
    const diagnostic = result.error || (blocked ? result.output?.stopReason || result.output?.reason || result.output?.hookSpecificOutput?.permissionDecisionReason || result.output?.hookSpecificOutput?.decision?.message || 'Hook 请求阻止当前操作' : undefined)
    this.options.onRecord({
      ...record, status: result.status === 'ok' ? blocked ? 'failed' : 'ok' : result.status,
      output: publicHarnessToolInput({ stdout: this.safe(result.stdout, result.error?.includes('超过') === true), stderr: this.safe(result.stderr, result.error?.includes('超过') === true), output: result.output, exitCode: result.exitCode }, this.options.secrets),
      ...(diagnostic ? { error: this.safe(diagnostic) } : {}), completedAt: Date.now(),
    })
    return { result, changed }
  }
  async run(event: MiraHookEvent, fields: Record<string, unknown> = {}, matchValue?: string, signal?: AbortSignal): Promise<MiraHookRunResult> {
    const outcome: MiraHookRunResult = { contexts: [], stopShouldContinue: false }
    const effectiveSignal = signal ? AbortSignal.any([this.controller.signal, signal]) : this.controller.signal
    if (effectiveSignal.aborted) return outcome
    const input: MiraHookInput = { ...this.options.inputBase, ...fields, hookEventName: event, sessionId: this.options.inputBase.sessionId, cwd: this.options.inputBase.cwd }
    for (const hook of this.snapshot) {
      if (!hook.enabled || hook.event !== event || !matchesMiraHook(matchValue, hook.matcher)) continue
      if (!hook.trusted) {
        const key = `${hook.scope}:${hook.id}`
        if (!this.reportedUntrusted.has(key)) { this.reportedUntrusted.add(key); this.announce(hook, input, hook.unavailableReason || 'Hook 尚未确认信任，已跳过；请在设置中检查并确认', true) }
        continue
      }
      if (effectiveSignal.aborted) break
      try { this.options.store.assert(hook, this.options.directory) }
      catch { outcome.blocked = 'Hook 声明或信任状态已变化，请刷新后重试'; this.announce(hook, input, outcome.blocked); break }
      if (hook.type === 'command' && hook.async) {
        // Background hooks are observed and drained, but cannot decide the foreground action.
        const running = this.execute(hook, input, effectiveSignal).then(() => undefined)
        this.pending.add(running)
        void running.finally(() => this.pending.delete(running)).catch(() => undefined)
        continue
      }
      const { result, changed } = await this.execute(hook, input, effectiveSignal)
      if (changed) { outcome.blocked = 'Hook 声明或信任状态已变化，请刷新后重试'; break }
      if (result.status !== 'ok' || !result.output) continue
      this.apply(event, result.output, outcome)
    }
    return outcome
  }
  private apply(event: MiraHookEvent, output: MiraHookOutput, outcome: MiraHookRunResult) {
    const reason = output.stopReason ?? output.reason
    if (output.continue === false && event !== 'Stop') {
      if (preventsContinuation(event)) outcome.blocked = this.safe(reason || 'Hook 阻止了当前操作')
      if (permissionEvent(event)) outcome.permission = mergePermission(outcome.permission, 'deny')
    }
    if (event === 'Stop' && output.continue === true) { outcome.stopShouldContinue = true; if (reason) outcome.stopReason = this.safe(reason) }
    if (output.decision === 'approve' && permissionEvent(event)) outcome.permission = mergePermission(outcome.permission, 'allow')
    if (output.decision === 'block') {
      if (preventsContinuation(event)) outcome.blocked = this.safe(reason || output.systemMessage || 'Hook 阻止了当前操作')
      if (permissionEvent(event)) outcome.permission = mergePermission(outcome.permission, 'deny')
      if (event === 'Stop') { outcome.stopShouldContinue = true; if (reason || output.systemMessage) outcome.stopReason = this.safe(reason || output.systemMessage!); for (const text of [output.systemMessage, output.reason]) if (text) outcome.contexts.push(this.safe(text)) }
    }
    for (const text of [output.additionalContext, output.additional_context]) if (text) outcome.contexts.push(this.safe(text))
    const specific = output.hookSpecificOutput
    if (!specific) return
    if (event === 'PreToolUse') {
      if (specific.permissionDecision) {
        outcome.permission = mergePermission(outcome.permission, specific.permissionDecision)
        if (specific.permissionDecisionReason && outcome.permission === specific.permissionDecision) outcome.permissionReason = this.safe(specific.permissionDecisionReason)
      }
      if ('updatedInput' in specific) outcome.updatedInput = specific.updatedInput
    }
    if (event === 'PermissionRequest' && specific.decision) {
      const decision = specific.decision
      outcome.permission = mergePermission(outcome.permission, decision.behavior)
      if (!outcome.permissionRequest || outcome.permissionRequest.behavior !== 'deny') outcome.permissionRequest = decision
      if (decision.behavior === 'allow' && 'updatedInput' in decision) outcome.updatedInput = decision.updatedInput
    }
    if (specific.additionalContext) outcome.contexts.push(this.safe(specific.additionalContext))
  }
  async drain(): Promise<void> { await Promise.all([...this.pending]) }
  async close(): Promise<void> {
    this.options.signal.removeEventListener('abort', this.abort)
    this.controller.abort()
    await this.drain()
  }
}
