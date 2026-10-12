/** Local spreadsheet parser, compatible with the first-party opaque iframe. */
export function createMiraSheetWorker(): Worker {
  const entry = new URL('office/mira-sheet-worker.js', document.baseURI).href
  // The library posts its transferred buffer immediately. Queue until import has
  // installed the real parser listener; replay inside the worker without copying it.
  const bootstrap = URL.createObjectURL(new Blob([`
    const pending = [];
    const queue = event => { event.stopImmediatePropagation(); pending.push(event.data); };
    self.addEventListener('message', queue, true);
    import(${JSON.stringify(entry)}).then(() => {
      self.removeEventListener('message', queue, true);
      self.postMessage({type:'mira-sheet-ready'});
      for (const data of pending.splice(0)) self.dispatchEvent(new MessageEvent('message', {data}));
    }).catch(error => self.postMessage({type:'mira-sheet-load-error', message:String(error)}));
  `], { type: 'application/javascript' }))
  let worker: Worker
  try { worker = new Worker(bootstrap, { name: 'Mira spreadsheet reader' }) }
  catch (error) { URL.revokeObjectURL(bootstrap); throw error }
  const terminate = worker.terminate.bind(worker)
  let disposed = false
  const release = () => { clearTimeout(timer); URL.revokeObjectURL(bootstrap) }
  worker.terminate = () => {
    if (disposed) return
    disposed = true; release()
    worker.removeEventListener('message', initialized); worker.removeEventListener('error', nativeFailure)
    terminate()
  }
  const fail = (message: string) => {
    worker.dispatchEvent(new ErrorEvent('error', { message }))
    worker.terminate()
  }
  const nativeFailure = () => worker.terminate()
  const initialized = (event: MessageEvent) => {
    if (event.data?.type === 'mira-sheet-ready') { release(); worker.removeEventListener('message', initialized) }
    else if (event.data?.type === 'mira-sheet-load-error') fail('表格引擎加载失败，请重新加载 Mira。')
  }
  const timer = setTimeout(() => fail('表格引擎启动超时，请重试。'), 10_000)
  worker.addEventListener('message', initialized)
  worker.addEventListener('error', nativeFailure)
  return worker
}
