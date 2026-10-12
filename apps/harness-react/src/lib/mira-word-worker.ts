/** Local legacy Word parser, compatible with the first-party opaque iframe. */
export function createMiraWordWorker(): Worker {
  const entry = new URL('office/mira-word-worker.js', document.baseURI).href
  const bootstrap = URL.createObjectURL(new Blob([`
    const pending = [];
    const queue = event => { event.stopImmediatePropagation(); pending.push(event.data); };
    self.addEventListener('message', queue, true);
    import(${JSON.stringify(entry)}).then(() => {
      self.removeEventListener('message', queue, true);
      self.postMessage({type:'mira-word-ready'});
      for (const data of pending.splice(0)) self.dispatchEvent(new MessageEvent('message', {data}));
    }).catch(error => self.postMessage({type:'mira-word-load-error', message:String(error)}));
  `], { type: 'application/javascript' }))
  let worker: Worker
  try { worker = new Worker(bootstrap, { name: 'Mira Word reader' }) }
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
  const fail = (message: string) => { worker.dispatchEvent(new ErrorEvent('error', { message })); worker.terminate() }
  const nativeFailure = () => worker.terminate()
  const initialized = (event: MessageEvent) => {
    if (event.data?.type === 'mira-word-ready') { release(); worker.removeEventListener('message', initialized) }
    else if (event.data?.type === 'mira-word-load-error') fail('Word 引擎加载失败，请重新加载 Mira。')
  }
  const timer = setTimeout(() => fail('Word 引擎启动超时，请重试。'), 10_000)
  worker.addEventListener('message', initialized); worker.addEventListener('error', nativeFailure)
  return worker
}
