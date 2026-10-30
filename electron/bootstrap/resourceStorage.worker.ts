// Keep directory traversal off the main event loop.
import { parentPort, workerData } from 'node:worker_threads'
import { scanResourceStorage } from './resourceStorage'
void scanResourceStorage(workerData.root, new AbortController().signal).then(
  snapshot => parentPort?.postMessage({ ok: true, snapshot }),
  () => parentPort?.postMessage({ ok: false }),
)
