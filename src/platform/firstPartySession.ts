export interface FirstPartyPortLike {
  close(): void
}

/** 管理第一方 frame 的授权句柄和端口，避免异步加载把旧会话重新激活。 */
export class FirstPartyConnectionSession {
  private generation = 0
  private active?: { grantId: string; port: FirstPartyPortLike }

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

  invalidate() {
    this.generation += 1
    const previous = this.active
    this.active = undefined
    previous?.port.close()
    if (previous) void Promise.resolve(this.revoke(previous.grantId)).catch(() => undefined)
  }
}
