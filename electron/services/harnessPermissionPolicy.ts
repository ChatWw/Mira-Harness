import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { HarnessEvent, HarnessPermissionRequest, PermissionMode } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'

export type ToolRisk = 'read' | 'write' | 'command' | 'mcp'

export type ToolDescriptor = {
  risk: ToolRisk
  title: (args: Record<string, unknown>) => string
  detail: (args: Record<string, unknown>) => string
}

type PublishEvent = (sender: WebContents | undefined, event: HarnessEvent) => unknown
type ToolApprovalContext = { toolCallId: string; runId: string; onRequest: (requestId: string) => void }

export class HarnessPermissionPolicy {
  private readonly pending = new Map<string, { request: HarnessPermissionRequest, resolve: (allowed: boolean) => void, timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly database: PlatformDatabase, private readonly publish: PublishEvent) {}

  private isDangerousCommand(command: string) {
    const normalized = ` ${command.toLowerCase().replace(/\s+/g, ' ')} `
    return this.database.harness.getPermissionConfig().dangerousCommands.some(item => normalized.includes(item)) || /\brm\b.*(-[a-z]*r[a-z]*|--recursive)/.test(normalized)
  }

  private approve(sender: WebContents | undefined, sessionId: string, mode: PermissionMode, title: string, detail: string, signal?: AbortSignal, context?: ToolApprovalContext): Promise<{ allowed: boolean; reason?: string }> {
    if (signal?.aborted) return Promise.resolve({ allowed: false, reason: '运行已停止' })
    if (mode === 'full' || mode === 'auto-approve') return Promise.resolve({ allowed: true })
    const requestId = randomUUID()
    const request: HarnessPermissionRequest = { requestId, sessionId, title, detail, ...(context ? { toolCallId: context.toolCallId, runId: context.runId } : {}) }
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
        this.publish(sender, { sessionId, type: 'error', payload: { message: '权限确认超时，已取消该操作。' } })
      }, 5 * 60 * 1000)
      this.pending.set(requestId, { request, resolve: allowed => settle(allowed), timer })
      signal?.addEventListener('abort', abort, { once: true })
      this.publish(sender, { sessionId, type: 'permission-request', payload: { ...request } })
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

  async preflight(sender: WebContents | undefined, sessionId: string, descriptors: Map<string, ToolDescriptor>, name: string, args: unknown, automation = false, permissionMode?: PermissionMode, signal?: AbortSignal, context?: ToolApprovalContext) {
    if (signal?.aborted) return { block: true, reason: '运行已停止' }
    const descriptor = descriptors.get(name)
    if (!descriptor || descriptor.risk === 'read') return undefined
    const values = args && typeof args === 'object' ? args as Record<string, unknown> : {}
    if (name === 'bash' && this.isDangerousCommand(String(values.command ?? ''))) return { block: true, reason: '危险命令已被永久拦截' }
    const mode = permissionMode || this.database.harness.getPermissionConfig().globalDefaultMode || 'default'
    if (automation && mode === 'default') return { block: true, reason: '自动化任务的默认权限仅允许只读工具' }
    const decision = await this.approve(sender, sessionId, mode, descriptor.title(values), descriptor.detail(values), signal, context)
    if (signal?.aborted) return { block: true, reason: '运行已停止' }
    return decision.allowed ? undefined : { block: true, reason: decision.reason || '用户拒绝了操作' }
  }

  preflightSubtask(name: string, args: unknown) {
    if (name !== 'bash') return undefined
    const values = args && typeof args === 'object' ? args as Record<string, unknown> : {}
    return this.isDangerousCommand(String(values.command ?? '')) ? { block: true, reason: '危险命令已被永久拦截' } : undefined
  }
}
