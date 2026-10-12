import { parentPort, workerData } from 'node:worker_threads'
import { compileMiraFlow } from './miraFlowCompile.js'

if (!parentPort) throw new Error('工作流编译必须在独立 Worker 中执行')
try {
  if (typeof workerData?.source !== 'string') throw new Error('工作流脚本必须是文本')
  parentPort.postMessage({ ok: true, compilation: compileMiraFlow(workerData.source) })
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
}
