export interface FirstPartyPortLike {
  close(): void
}

/** 管理第一方 frame 的授权句柄和端口，避免异步加载把旧会话重新激活。 */
export class FirstPartyConnectionSession {
  private generation = 0
  private active?: { grantId: string; port: FirstPartyPortLike }
  private leaveSequence = 0
  private pendingLeave = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly revoke: (grantId: string) => void | Promise<void>) {}

  begin() {
    this.invalidate()
    return this.generation
  }

  activate(generation: number, grantId: string, port: FirstPartyPortLike) {
    if (generation !== this.generation) return false
    this.active = { grantId, port }
    return true
  }

  isCurrent(generation: number) {
    return generation === this.generation
  }

  isActive(grantId: string, port: FirstPartyPortLike) {
    return this.active?.grantId === grantId && this.active.port === port
  }

  canForwardHarnessEvent(grantId: string, port: FirstPartyPortLike, event: { type: string; payload: Record<string, unknown> }) {
    return this.isActive(grantId, port) && (event.type !== 'workspace-files-changed' || event.payload.grantId === grantId)
  }

  prepareLeave(send: (message: { type: 'mira:prepare-leave'; id: string }) => void): Promise<void> {
    if (!this.active) return Promise.reject(new Error('Harness 连接尚未就绪，无法确认草稿保存'))
    const id = `leave-${++this.leaveSequence}`
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingLeave.delete(id)
        reject(new Error('草稿保存确认超时，已保留当前页面，请稍后重试'))
      }, 5000)
      this.pendingLeave.set(id, { resolve, reject, timer })
      try { send({ type: 'mira:prepare-leave', id }) }
      catch (error) {
        clearTimeout(timer)
        this.pendingLeave.delete(id)
        reject(error instanceof Error ? error : new Error('Harness 连接已关闭'))
      }
    })
  }

  receiveLeaveReady(value: unknown) {
    if (!value || typeof value !== 'object' || (value as { type?: unknown }).type !== 'mira:leave-ready') return false
    const message = value as { id?: unknown; ok?: unknown; error?: unknown }
    if (typeof message.id !== 'string' || typeof message.ok !== 'boolean') return true
    const pending = this.pendingLeave.get(message.id)
    if (!pending) return true
    this.pendingLeave.delete(message.id)
    clearTimeout(pending.timer)
    if (message.ok) pending.resolve()
    else pending.reject(new Error(typeof message.error === 'string' ? message.error : '草稿保存失败，已保留当前页面'))
    return true
  }

  invalidate() {
    this.generation += 1
    const previous = this.active
    this.active = undefined
    for (const pending of this.pendingLeave.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Harness 连接已失效，草稿尚未确认保存'))
    }
    this.pendingLeave.clear()
    previous?.port.close()
    if (previous) void Promise.resolve(this.revoke(previous.grantId)).catch(() => undefined)
  }
}
