/**
 * A small FIFO reader/writer lock used by parent tool calls and delegated
 * tasks. A waiting writer prevents newer readers from jumping the queue.
 */
type LockKind = 'read' | 'write'
type Waiter = { kind: LockKind, resolve: () => void, reject: (error: Error) => void, signal?: AbortSignal }

class ProjectLock {
  private readers = 0
  private writer = false
  private queue: Waiter[] = []

  async acquire(kind: LockKind, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw new Error('任务已停止')
    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { kind, resolve, reject, signal }
      const abort = () => {
        const index = this.queue.indexOf(waiter)
        if (index >= 0) this.queue.splice(index, 1)
        reject(new Error('任务已停止'))
      }
      signal?.addEventListener('abort', abort, { once: true })
      const originalResolve = resolve
      waiter.resolve = () => {
        signal?.removeEventListener('abort', abort)
        originalResolve()
      }
      this.queue.push(waiter)
      this.drain()
    })
    return () => {
      if (kind === 'write') this.writer = false
      else this.readers = Math.max(0, this.readers - 1)
      this.drain()
    }
  }

  private drain() {
    if (this.writer || !this.queue.length) return
    const first = this.queue[0]
    if (first.kind === 'write') {
      if (this.readers) return
      this.writer = true
      this.queue.shift()?.resolve()
      return
    }
    while (this.queue[0]?.kind === 'read' && !this.writer) {
      this.readers++
      this.queue.shift()?.resolve()
    }
  }
}

export class ProjectTaskLock {
  private readonly locks = new Map<string, ProjectLock>()

  acquire(projectId: string | undefined, kind: LockKind, signal?: AbortSignal) {
    if (!projectId) return Promise.resolve(() => undefined)
    let lock = this.locks.get(projectId)
    if (!lock) {
      lock = new ProjectLock()
      this.locks.set(projectId, lock)
    }
    return lock.acquire(kind, signal)
  }
}
