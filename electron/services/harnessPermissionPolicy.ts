import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { HarnessEvent, HarnessPermissionRequest, PermissionMode } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'
import type { MiraFlowReview } from '../../src/config/miraFlowReview'

export type ToolRisk = 'read' | 'write' | 'command' | 'mcp'

export type ToolDescriptor = {
  risk: ToolRisk
  deferApproval?: boolean
  title: (args: Record<string, unknown>) => string
  detail: (args: Record<string, unknown>) => string
}

type PublishEvent = (sender: WebContents | undefined, event: HarnessEvent) => unknown
export type ToolApprovalContext = {
  toolCallId: string; runId: string; onRequest: (requestId: string) => void
  hookPermission?: 'allow' | 'ask'
  beforeRequest?: () => Promise<{ allowed?: boolean; reason?: string; terminate?: boolean } | undefined>
}

export class HarnessPermissionPolicy {
  private readonly pending = new Map<string, { request: HarnessPermissionRequest, resolve: (allowed: boolean) => void, timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly database: PlatformDatabase, private readonly publish: PublishEvent) {}

  private isDangerousCommand(command: string) {
    const normalized = ` ${command.toLowerCase().replace(/\s+/g, ' ')} `
    return this.database.harness.getPermissionConfig().dangerousCommands.some(item => normalized.includes(item)) || /\brm\b.*(-[a-z]*r[a-z]*|--recursive)/.test(normalized)
  }

  private async approve(sender: WebContents | undefined, sessionId: string, mode: PermissionMode, title: () => string, detail: () => string, signal?: AbortSignal, context?: ToolApprovalContext, workflowReview?: MiraFlowReview): Promise<{ allowed: boolean; reason?: string; terminate?: boolean }> {
    if (signal?.aborted) return Promise.resolve({ allowed: false, reason: '运行已停止' })
    if (!workflowReview && (context?.hookPermission === 'allow' || context?.hookPermission !== 'ask' && (mode === 'full' || mode === 'auto-approve'))) return { allowed: true }
    const hook = context?.beforeRequest ? await context.beforeRequest() : undefined
    if (signal?.aborted) return { allowed: false, reason: '运行已停止' }
    if (hook?.allowed !== undefined && (!workflowReview || !hook.allowed)) return { allowed: hook.allowed, reason: hook.reason, terminate: hook.terminate }
    const requestId = randomUUID()
    const request: HarnessPermissionRequest = { requestId, sessionId, title: title(), detail: detail(), ...(context ? { toolCallId: context.toolCallId, runId: context.runId } : {}), ...(workflowReview ? { workflowReview } : {}) }
    context?.onRequest(requestId)
    return new Promise((resolve) => {
      const settle = (allowed: boolean, reason?: string) => {
        if (!this.pending.delete(requestId)) return
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        resolve({ allowed, ...(reason ? { reason } : {}) })
      }
      const abort = () => settle(false, '运行已停止')
      const timer = setTimeout(() => {
        settle(false, '权限确认超时，已取消该操作。')
        this.publish(sender, { sessionId, runId: context?.runId, type: 'error', payload: { message: '权限确认超时，已取消该操作。' } })
      }, 5 * 60 * 1000)
      this.pending.set(requestId, { request, resolve: allowed => settle(allowed), timer })
      signal?.addEventListener('abort', abort, { once: true })
      this.publish(sender, { sessionId, runId: context?.runId, type: 'permission-request', payload: { ...request } })
    })
  }

  resolve(requestId: string, allowed: boolean) {
    const entry = this.pending.get(requestId)
    if (!entry) return
    entry.resolve(allowed)
  }

  listPending(sessionId: string): HarnessPermissionRequest[] {
    return [...this.pending.values()].map(entry => entry.request).filter(request => request.sessionId === sessionId)
  }

  reviewWorkflow(sender: WebContents | undefined, sessionId: string, review: MiraFlowReview, signal?: AbortSignal, context?: ToolApprovalContext) {
    const frozen = structuredClone(review)
    return this.approve(sender, sessionId, 'default', () => frozen.action === 'run' ? `运行工作流「${frozen.name}」？` : `保存工作流「${frozen.name}」？`, () => frozen.action === 'run' ? '确认后将在当前会话启动后台工作流。' : '保存供以后使用，本次不会执行工作流。', signal, context, frozen)
  }

  async preflight(sender: WebContents | undefined, sessionId: string, descriptors: Map<string, ToolDescriptor>, name: string, args: unknown, automation = false, permissionMode?: PermissionMode, signal?: AbortSignal, context?: ToolApprovalContext) {
    if (signal?.aborted) return { block: true, reason: '运行已停止' }
    const descriptor = descriptors.get(name)
    if (!descriptor || descriptor.risk === 'read' && context?.hookPermission !== 'ask') return undefined
    const values = args && typeof args === 'object' ? args as Record<string, unknown> : {}
    if (name === 'bash' && this.isDangerousCommand(String(values.command ?? ''))) return { block: true, reason: '危险命令已被永久拦截' }
    const mode = permissionMode || this.database.harness.getPermissionConfig().globalDefaultMode || 'default'
    if (automation && mode === 'default') return { block: true, reason: '自动化任务的默认权限仅允许只读工具' }
    // Authoring tools compile first, then review the exact source and compiler projection.
    if (descriptor.deferApproval) return undefined
    const decision = await this.approve(sender, sessionId, mode, () => descriptor.title(values) || `允许 Mira 调用 ${name}？`, () => descriptor.detail(values) || `Hook 要求确认工具 ${name} 的调用。`, signal, context)
    if (signal?.aborted) return { block: true, reason: '运行已停止' }
    // Permission hooks may replace arguments; permanent gates also apply to the replacement.
    if (name === 'bash' && this.isDangerousCommand(String(values.command ?? ''))) return { block: true, reason: '危险命令已被永久拦截' }
    return decision.allowed ? undefined : { block: true, reason: decision.reason || '用户拒绝了操作', ...(decision.terminate ? { terminate: true } : {}) }
  }

  preflightSubtask(name: string, args: unknown) {
    if (name !== 'bash') return undefined
    const values = args && typeof args === 'object' ? args as Record<string, unknown> : {}
    return this.isDangerousCommand(String(values.command ?? '')) ? { block: true, reason: '危险命令已被永久拦截' } : undefined
  }
}
