export interface SessionPowerBlocker {
  start(type: 'prevent-app-suspension'): number
  stop(id: number): void
}

/** Prevent system sleep only while the global preference and a running session agree. */
export class AutomationKeepAwake {
  private blockerId: number | undefined
  constructor(private readonly blocker: SessionPowerBlocker) {}
  update(enabled: boolean, running: boolean) {
    if (enabled && running) this.blockerId ??= this.blocker.start('prevent-app-suspension')
    else this.dispose()
  }
  dispose() {
    if (this.blockerId === undefined) return
    this.blocker.stop(this.blockerId)
    this.blockerId = undefined
  }
}
