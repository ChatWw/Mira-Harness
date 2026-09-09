import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { HarnessEvent, PermissionMode } from '../src/config/harness'
import type { PlatformDatabase } from './database'

export type ToolRisk = 'read' | 'write' | 'command' | 'mcp'

export type ToolDescriptor = {
  risk: ToolRisk
  title: (args: Record<string, unknown>) => string
  detail: (args: Record<string, unknown>) => string
}

type PublishEvent = (sender: WebContents | undefined, event: HarnessEvent) => unknown

export class HarnessPermissionPolicy {
  private readonly pending = new Map<string, { resolve: (allowed: boolean) => void, timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly database: PlatformDatabase, private readonly publish: PublishEvent) {}

  private isDangerousCommand(command: string) {
    const normalized = ` ${command.toLowerCase().replace(/\s+/g, ' ')} `
    return this.database.harness.getPermissionConfig().dangerousCommands.some(item => normalized.includes(item)) || /\brm\b.*(-[a-z]*r[a-z]*|--recursive)/.test(normalized)
  }

  private approve(sender: WebContents | undefined, sessionId: string, mode: PermissionMode, title: string, detail: string): Promise<boolean> {
    if (mode === 'full' || mode === 'auto-approve') return Promise.resolve(true)
    const requestId = randomUUID()
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        this.publish(sender, { sessionId, type: 'error', payload: { message: '权限确认超时，已取消该操作。' } })
        resolve(false)
      }, 5 * 60 * 1000)
      this.pending.set(requestId, { resolve, timer })
      this.publish(sender, { sessionId, type: 'permission-request', payload: { requestId, title, detail } })
    })
  }

  resolve(requestId: string, allowed: boolean) {
    const entry = this.pending.get(requestId)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(requestId)
    entry.resolve(allowed)
  }

  async preflight(sender: WebContents | undefined, sessionId: string, descriptors: Map<string, ToolDescriptor>, name: string, args: unknown, automation = false, permissionMode?: PermissionMode) {
    const descriptor = descriptors.get(name)
    if (!descriptor || descriptor.risk === 'read') return undefined
    const values = args && typeof args === 'object' ? args as Record<string, unknown> : {}
    if (name === 'bash' && this.isDangerousCommand(String(values.command ?? ''))) return { block: true, reason: '危险命令已被永久拦截' }
    const mode = permissionMode || this.database.harness.getSession(sessionId).permissionMode
    if (automation && mode === 'default') return { block: true, reason: '自动化任务的默认权限仅允许只读工具' }
    const allowed = await this.approve(sender, sessionId, mode, descriptor.title(values), descriptor.detail(values))
    return allowed ? undefined : { block: true, reason: '用户拒绝了操作' }
  }

  preflightSubtask(name: string, args: unknown) {
    if (name !== 'bash') return undefined
    const values = args && typeof args === 'object' ? args as Record<string, unknown> : {}
    return this.isDangerousCommand(String(values.command ?? '')) ? { block: true, reason: '危险命令已被永久拦截' } : undefined
  }
}
