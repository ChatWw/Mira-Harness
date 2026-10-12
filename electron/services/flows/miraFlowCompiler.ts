import { Worker } from 'node:worker_threads'
import type { MiraFlowCompilation } from './miraFlowCompile.js'

// One instance per host analysis owner, rather than one global editor queue.
export class MiraFlowCompiler {
  private cancelPending?: () => void

  constructor(private readonly workerPath: string) {}

  compile(source: string, signal?: AbortSignal): Promise<MiraFlowCompilation> {
    this.cancelPending?.()
    if (signal?.aborted) return Promise.reject(new Error('工作流编译已取消'))
    if (Buffer.byteLength(source, 'utf8') > 256 * 1024) return Promise.reject(new Error('工作流脚本超过 256 KiB'))
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, {
        workerData: { source }, resourceLimits: { maxOldGenerationSizeMb: 256 },
      })
      let settled = false
      const finish = (error?: Error, compilation?: MiraFlowCompilation) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        if (this.cancelPending === abort) this.cancelPending = undefined
        void worker.terminate()
        if (error) reject(error)
        else resolve(compilation!)
      }
      const abort = () => finish(new Error('工作流编译已取消'))
      const timer = setTimeout(() => finish(new Error('工作流编译超时')), 15_000)
      this.cancelPending = abort
      signal?.addEventListener('abort', abort, { once: true })
      worker.once('message', reply => {
        if (reply.ok) finish(undefined, reply.compilation)
        else finish(new Error(reply.error))
      })
      worker.once('error', error => finish(error instanceof Error ? error : new Error(String(error))))
      worker.once('exit', code => {
        if (!settled) finish(new Error(`工作流编译进程提前退出（${code}）`))
      })
    })
  }

  dispose(): void { this.cancelPending?.() }
}
