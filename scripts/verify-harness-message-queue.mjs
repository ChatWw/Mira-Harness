import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = await mkdtemp(resolve(tmpdir(), 'mira-message-queue-browser-'))
const load = async path => {
  const result = await build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
}
const { HarnessMessageQueue } = await load('electron/services/harnessMessageQueue.ts')
const { createHarnessEventPublisher } = await load('electron/services/harnessEventPublisher.ts')
const { handleFirstPartyRequest } = await load('src/platform/firstPartyBridge.ts')
const { DEFAULT_PERMISSION_CONFIG } = await load('src/config/harness.ts')
const now = Date.now(), selection = { providerId: 'fixture-provider', modelId: 'fixture-model', thinkingLevel: 'medium' }
const task = (id, title) => ({ version: 1, id, title, projectId: 'project', workingDirectory: output, messages: [], toolCalls: [], permissionMode: 'default', createdAt: now, updatedAt: now, status: 'active' })
const sessions = [task('active', '运行中消息队列验收'), task('secondary', '另一项任务')]
sessions[0].activeRun = { id: 'initial-run', startedAt: now, activities: [], subtasks: [] }
const events = [], requests = [], started = [], admittedInputs = [], busy = new Set(['active']), reservations = new Map(), executions = new Map()
const preferences = new Map([['first-party.mira-harness.active-session', 'active']])
const gates = new Map()
const draftPreferenceKey = 'first-party.mira-harness.harness-react-composer-drafts'
let nextAck, nextWithdrawal, failRecoveryConsumption = false
let preemptGate
let transcriptPermission, settleTranscriptPermission, failPermissionOnce = false
let attachmentContent = 'Original attachment before queue admission.'
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const waitFor = async predicate => {
  const until = Date.now() + 12000
  while (!predicate()) {
    assert.ok(Date.now() < until, 'Fixture state did not settle within 12 seconds')
    await new Promise(done => setTimeout(done, 20))
  }
}
const sender = { isDestroyed: () => false, send: (_channel, event) => events.push(event) }
const emit = createHarnessEventPublisher()
const getSession = id => { const session = sessions.find(item => item.id === id); assert.ok(session); return session }
const queue = new HarnessMessageQueue({
  isRunning: id => busy.has(id),
  currentRunId: id => getSession(id).activeRun?.id,
  preemptAndWait: async (id, expectedRunId) => {
    assert.ok(expectedRunId === undefined || expectedRunId === getSession(id).activeRun?.id)
    if (preemptGate) { const gate = preemptGate; preemptGate = undefined; gates.set('preempt', gate); await gate.promise; gates.delete('preempt') }
    if (busy.has(id)) finish(id, true, true)
  },
  reserve: id => { const token = Symbol(id); reservations.set(id, token); return token },
  release: (id, token) => { if (reservations.get(id) === token) reservations.delete(id) },
  blocked: id => getSession(id).pendingInteraction?.status === 'waiting',
  publish: (_sender, snapshot) => emit(sender, { sessionId: snapshot.sessionId, type: 'queue-updated', payload: { queue: snapshot } }),
  settled: () => {},
  execute: async (item, attachments, _token, _sender, admitted) => {
    const session = getSession(item.sessionId), result = defer()
    const runId = `run-${item.id}`
    busy.add(item.sessionId)
    session.messages.push({ id: `user-${item.id}`, role: 'user', content: item.text, attachments, createdAt: Date.now() })
    session.activeRun = { id: runId, startedAt: Date.now(), activities: [], subtasks: [] }
    started.push(item.text); admittedInputs.push(structuredClone({ item, attachments })); admitted()
    const content = `当前队列回复：${item.text}`
    session.messages.push({ id: `assistant-${item.id}`, role: 'assistant', runId, content, createdAt: Date.now() })
    executions.set(item.sessionId, { item, runId, result, content })
    emit(sender, { sessionId: item.sessionId, runId, type: 'run-start', payload: { startedAt: session.activeRun.startedAt } })
    emit(sender, { sessionId: item.sessionId, runId, type: 'message-delta', payload: { delta: content } })
    return result.promise
  },
})
function finish(id, interrupted = false, internalPreemption = false) {
  const session = getSession(id), execution = executions.get(id)
  const runId = session.activeRun?.id
  if (execution) {
    const index = session.messages.findIndex(message => message.id === `assistant-${execution.item.id}`)
    session.messages[index] = { ...session.messages[index], content: execution.content, ...(interrupted ? { interrupted: true } : {}), run: { status: interrupted ? 'stopped' : 'completed', startedAt: session.activeRun.startedAt, completedAt: Date.now(), durationMs: Date.now() - session.activeRun.startedAt, activities: [], subtasks: [] } }
  }
  busy.delete(id); delete session.activeRun
  if (interrupted && !internalPreemption) queue.pause(id, 'stopped')
  emit(sender, { sessionId: id, runId, type: 'message-complete', payload: {} })
  emit(sender, { sessionId: id, runId, type: 'status', payload: { state: 'idle' } })
  if (execution) { executions.delete(id); execution.result.resolve({ interrupted }) }
  else queue.onRunSettled(id, interrupted ? 'aborted' : 'completed')
}
async function invoke(_grant, method, params = {}) {
  switch (method) {
    case 'sessions.list': return sessions
    case 'projects.list': return [{ id: 'project', name: 'Mira 队列验收', directory: output, directoryExists: true, createdAt: now, updatedAt: now, sessionCount: sessions.length }]
    case 'providers.list': return [{ id: selection.providerId, name: '隔离模型', providerKey: 'custom', endpoint: 'https://fixture.invalid', enabled: true, authMode: 'none', models: [{ id: selection.modelId, enabled: true, reasoning: true }], createdAt: now, updatedAt: now }]
    case 'session.get': return getSession(params.id)
    case 'session.set-unread': return
    case 'permissions.pending': return transcriptPermission?.sessionId === params.sessionId ? [transcriptPermission] : []
    case 'permission.respond': {
      assert.equal(params.requestId, transcriptPermission?.requestId)
      if (failPermissionOnce) { failPermissionOnce = false; throw new Error('隔离审批失败，请重试') }
      settleTranscriptPermission(params.allowed)
      transcriptPermission = undefined
      return
    }
    case 'skills.list': case 'mcp.list': case 'editors.list': return []
    case 'permissions.config': return DEFAULT_PERMISSION_CONFIG
    case 'composer.preferences': return { sendShortcut: 'mod-enter', showContextUsage: true }
    case 'files.list': return { path: '', entries: [{ name: 'context.md', path: 'context.md', type: 'file' }] }
    case 'files.search': return { entries: [{ name: 'context.md', path: 'context.md', type: 'file' }], truncated: false }
    case 'message.submit': {
      const { options, ...submission } = params
      const receipt = await queue.submit(sender, { ...submission, permissionMode: 'default' }, params.references.map(reference => ({ ...reference, content: attachmentContent })), { projectId: 'project', workingDirectory: output }, options)
      if (nextAck && receipt.id) { const gate = nextAck; nextAck = undefined; gates.set('ack', gate); await gate.promise; gates.delete('ack') }
      return receipt
    }
    case 'queue.list': return queue.get(params.sessionId)
    case 'queue.withdraw': {
      const withdrawal = queue.withdraw(params.sessionId, params.itemId)
      if (nextWithdrawal) { const gate = nextWithdrawal; nextWithdrawal = undefined; gates.set('withdraw', gate); await gate.promise; gates.delete('withdraw') }
      return withdrawal
    }
    case 'queue.resume': return queue.resume(params.sessionId)
    case 'queue.reorder': return queue.reorder(params.sessionId, params.itemId, params.beforeItemId)
    case 'queue.send-now': return queue.sendNow(params.sessionId, params.itemId, params.expectedRunId)
    case 'run.abort': {
      if (params.expectedRunId !== getSession(params.sessionId).activeRun?.id) return false
      queue.cancelPromotion(params.sessionId, params.expectedRunId)
      finish(params.sessionId, true); return true
    }
    default: throw new Error(`Queue fixture does not implement ${method}`)
  }
}
const bridge = { manifest: { appId: 'mira-harness', enabled: true, capabilities: ['harness:workbench'] }, grantId: 'isolated-queue-fixture', context: { version: 1, theme: 'light', language: 'zh-CN' }, route: '/workspace/harness-react', navigate: () => {}, api: { invokeFirstPartyHarness: invoke, getSnapshot: async () => ({ preferences: Object.fromEntries(preferences) }), savePreference: async (key, value) => {
  if (failRecoveryConsumption && key === draftPreferenceKey && value.drafts?.active === '第二条排队任务' && !value.recoveries?.active?.length) {
    failRecoveryConsumption = false
    throw new Error('Isolated recovery consumption save failure')
  }
  preferences.set(key, value)
} } }
const parent = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style></head><body><iframe id="app" sandbox="allow-scripts allow-forms allow-downloads" src="/app/index.html"></iframe><script>
document.getElementById('app').addEventListener('load',()=>{const channel=new MessageChannel();window.port=channel.port1;channel.port1.onmessage=async event=>{if(event.data.type!=='mira:request')return;const response=await fetch('/invoke',{method:'POST',body:JSON.stringify(event.data)});channel.port1.postMessage({type:'mira:response',id:event.data.id,...await response.json()})};document.getElementById('app').contentWindow.postMessage({type:'mira:connect',apiVersion:{major:1}},'*',[channel.port2]);window.theme=theme=>channel.port1.postMessage({type:'mira:context',context:{theme}})});
setInterval(async()=>{if(!window.port)return;for(const event of await(await fetch('/events')).json())window.port.postMessage({type:'mira:harness-event',event})},30)
</script></body></html>`
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  try {
    if (request.url === '/events') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(events.splice(0))); return }
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return }
    if (request.url === '/invoke') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk)
      const call = JSON.parse(Buffer.concat(chunks)); requests.push(call)
      response.setHeader('Content-Type', 'application/json')
      try { response.end(JSON.stringify({ ok: true, value: await handleFirstPartyRequest(bridge, call) })) }
      catch (error) { response.end(JSON.stringify({ ok: false, error: { message: error.message } })) }
      return
    }
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(parent); return }
    const file = resolve(root, 'dist/harness-react-app', decodeURIComponent(new URL(request.url, 'http://fixture.invalid').pathname).replace(/^\/app\//, ''))
    assert.ok(file.startsWith(resolve(root, 'dist/harness-react-app') + '/'))
    response.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[extname(file)] || 'application/octet-stream')
    response.end(await readFile(file))
  } catch (error) { response.writeHead(500); response.end(error.message) }
})
const report = { startedAt: new Date().toISOString(), passed: false, output, checks: [], errors: [], captures: [], boundary: 'Current built production React app, opaque iframe, MessageChannel, real first-party bridge/parser and actual process-local message queue. Explicit in-memory session/execution/permission fixtures; no model, Electron grant/preload/IPC, native input, ZCode same-state comparison or performance acceptance.' }
for (const path of ['dist/harness-react-app/app.js', 'dist/harness-react-app/app.css']) (report.artifacts ??= []).push({ path, sha256: createHash('sha256').update(await readFile(resolve(root, path))).digest('hex') })
let browser, page
await new Promise(done => server.listen(0, '127.0.0.1', done))
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(() => {
    window.__miraQueueListeners = []
    const ids = new WeakMap()
    let id = 0
    for (const method of ['addEventListener', 'removeEventListener']) {
      const original = EventTarget.prototype[method]
      EventTarget.prototype[method] = function (type, listener, options) {
        if (type === 'keydown' && listener) {
          if (!ids.has(listener)) ids.set(listener, ++id)
          window.__miraQueueListeners.push({ method, id: ids.get(listener), name: listener.name, target: this === document ? 'document' : this === window ? 'window' : this.nodeName, time: performance.now() })
        }
        return original.call(this, type, listener, options)
      }
    }
  })
  page.setDefaultTimeout(12000); page.on('pageerror', error => report.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') (report.consoleErrors ??= []).push(message.text()) })
  page.on('requestfailed', request => (report.networkFailures ??= []).push({ url: request.url(), failure: request.failure() }))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const frame = page.frameLocator('#app'), input = frame.getByRole('textbox', { name: '任务内容', includeHidden: true })
  await input.waitFor()
  await frame.getByRole('button', { name: '停止任务', exact: true }).waitFor()
  const sendButton = () => frame.getByRole('button', { name: /^(发送任务|加入待发送)$/ })
  const send = async text => { await input.fill(text); await sendButton().click() }
  const rows = frame.locator('[data-queue-item]')
  const capture = async name => { await page.waitForTimeout(150); await page.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' }); report.captures.push(`${name}.png`) }
  await send('第一条排队任务')
  await rows.filter({ hasText: '第一条排队任务' }).waitFor()
  await assert.equal(await input.inputValue(), '')
  assert.deepEqual(started, [])
  assert.equal(sessions[0].messages.length, 0)
  report.checks.push('Running input accepts a queue message without optimistic transcript insertion or waiting for the model.')

  await input.fill('第二条排队任务 @'); await input.press('ArrowLeft'); await input.press('ArrowRight')
  await frame.getByRole('option').filter({ hasText: 'context.md' }).click()
  await frame.getByRole('button', { name: /^推理强度：/ }).click()
  await frame.getByRole('menuitemradio', { name: '中', exact: true }).click()
  nextAck = defer()
  await sendButton().click()
  await rows.filter({ hasText: '第二条排队任务' }).waitFor()
  await input.fill('确认返回前的新草稿')
  gates.get('ack').resolve()
  await sendButton().waitFor({ state: 'visible' })
  await frame.getByRole('button', { name: /^推理强度：/ }).click()
  await frame.getByRole('menuitemradio', { name: '高', exact: true }).click()
  attachmentContent = 'Changed attachment after queue admission.'
  assert.equal(await input.inputValue(), '确认返回前的新草稿')
  const frozen = queue.get('active').items.find(item => item.text === '第二条排队任务')
  assert.equal(frozen.selection.thinkingLevel, 'medium')
  report.checks.push('Delayed submit ACK preserves a newer draft; changing the next reasoning setting does not mutate the queued selection.')

  await input.fill('')
  nextWithdrawal = defer()
  await frame.getByRole('button', { name: '编辑待发送消息 2', exact: true }).click()
  await rows.filter({ hasText: '第二条排队任务' }).waitFor({ state: 'hidden' })
  await input.fill('撤回确认期间的新草稿')
  gates.get('withdraw').resolve()
  await frame.getByRole('button', { name: '恢复撤回的草稿', exact: true }).waitFor()
  assert.equal(await input.inputValue(), '撤回确认期间的新草稿')
  await waitFor(() => preferences.get(draftPreferenceKey)?.recoveries?.active?.some(item => item.id === frozen.id))
  await page.reload(); await input.waitFor()
  await frame.getByRole('button', { name: '恢复撤回的草稿', exact: true }).waitFor()
  assert.equal(await input.inputValue(), '撤回确认期间的新草稿')
  report.checks.push('A confirmed withdrawn message survives a renderer reload without replacing the occupied saved draft.')
  failRecoveryConsumption = true
  await input.fill(''); await frame.getByRole('button', { name: '恢复撤回的草稿', exact: true }).click()
  await frame.getByRole('alert').filter({ hasText: '恢复草稿保存失败，发送已暂停' }).waitFor()
  assert.equal(await sendButton().isDisabled(), true)
  assert.deepEqual(started, [])
  await frame.getByRole('button', { name: '重试保存恢复草稿', exact: true }).click()
  await frame.getByRole('alert').filter({ hasText: '恢复草稿保存失败，发送已暂停' }).waitFor({ state: 'hidden' })
  assert.equal(preferences.get(draftPreferenceKey).recoveries?.active?.length ?? 0, 0)
  assert.equal(await input.inputValue(), '第二条排队任务')
  await frame.locator('.harness-composer__attachment').filter({ hasText: 'context.md' }).waitFor()
  await frame.getByRole('button', { name: '推理强度：中', exact: true }).waitFor()
  attachmentContent = 'Original attachment before queue admission.'
  await sendButton().click()
  await rows.filter({ hasText: '第二条排队任务' }).waitFor()
  attachmentContent = 'Changed attachment after queue admission.'
  report.checks.push('Recovery consumption save failure locks Send; explicit save retry commits removal before the restored text, file references and original reasoning can be resubmitted.')
  await send('第三条排队任务')
  await frame.getByRole('button', { name: '停止任务', exact: true }).click()
  await frame.getByRole('button', { name: '恢复待发送', exact: true }).waitFor()
  assert.deepEqual(started, []); assert.equal(queue.get('active').paused, 'stopped')
  report.checks.push('Withdrawal ACK cannot overwrite a newer draft; explicit restore recovers text and attachment. Stop pauses the backlog.')
  await capture('queue-paused-light')
  await page.evaluate(() => window.theme('dark')); await frame.locator('html.dark').waitFor(); await capture('queue-paused-dark')

  await frame.getByRole('button', { name: '恢复待发送', exact: true }).click()
  await frame.getByText('当前队列回复：第一条排队任务', { exact: true }).waitFor()
  await frame.locator('[data-user-message-id]').filter({ hasText: '第一条排队任务' }).waitFor()
  assert.deepEqual(started, ['第一条排队任务'])
  await send('执行期间第四条任务')
  const oldRun = executions.get('active').runId
  finish('active')
  await frame.getByText('当前队列回复：第二条排队任务', { exact: true }).waitFor()
  await frame.locator('[data-user-message-id]').filter({ hasText: '第二条排队任务' }).waitFor()
  const currentRun = executions.get('active').runId
  assert.equal(admittedInputs[1].attachments[0].content, 'Original attachment before queue admission.')
  assert.equal(admittedInputs[1].item.selection.thinkingLevel, 'medium')
  report.checks.push('Actual dispatch receives the attachment bytes and reasoning frozen at submission, not the subsequently changed file fixture or next-draft setting.')
  const duplicate = emit(sender, { sessionId: 'active', runId: currentRun, type: 'message-delta', payload: { delta: '去重标记' } })
  executions.get('active').content += '去重标记'
  events.push(duplicate, { sessionId: 'active', runId: oldRun, eventId: 'late-old-delta', sequence: 101, type: 'message-delta', payload: { delta: '不应显示的旧回复' } }, { sessionId: 'active', runId: oldRun, eventId: 'late-old-idle', sequence: 102, type: 'status', payload: { state: 'idle' } })
  await frame.getByText('当前队列回复：第二条排队任务去重标记', { exact: true }).waitFor()
  assert.equal(await frame.getByText('不应显示的旧回复', { exact: false }).count(), 0)
  assert.equal(await invoke('', 'run.abort', { sessionId: 'active', expectedRunId: oldRun }), false)
  assert.ok(busy.has('active'))
  await frame.getByRole('button', { name: '停止任务', exact: true }).click()
  await frame.getByRole('button', { name: '恢复待发送', exact: true }).waitFor()
  assert.deepEqual(started, ['第一条排队任务', '第二条排队任务'])
  assert.equal(queue.get('active').items.length, 2)
  report.checks.push('FIFO admits exactly one message at a time, accepts further input, ignores duplicate/old-run deltas and rejects a stale Stop.')

  await page.reload(); await frame.getByRole('heading', { name: sessions[0].title, exact: true }).waitFor()
  await frame.getByRole('button', { name: '恢复待发送', exact: true }).waitFor()
  assert.equal(await rows.count(), 2)
  await frame.getByRole('button', { name: '恢复待发送', exact: true }).click()
  await frame.getByText('当前队列回复：第三条排队任务', { exact: true }).waitFor()
  await input.fill('跨会话等待确认的提交')
  nextAck = defer()
  await sendButton().click()
  await rows.filter({ hasText: '跨会话等待确认的提交' }).waitFor()
  const switchTask = async title => {
    await frame.locator('.mira-session-row__open').filter({ hasText: title }).click()
    const id = sessions.find(session => session.title === title).id
    await waitFor(() => preferences.get('first-party.mira-harness.active-session') === id)
    await frame.locator('.mira-session-row__open[aria-current="page"]').filter({ hasText: title }).waitFor()
  }
  await switchTask('另一项任务')
  await input.fill('另一任务的草稿不应改变')
  gates.get('ack').resolve()
  await waitFor(() => (preferences.get(draftPreferenceKey)?.drafts?.active ?? '') === '')
  assert.equal(await input.inputValue(), '另一任务的草稿不应改变')
  await switchTask(sessions[0].title)
  assert.equal(await input.inputValue(), '')
  await page.reload(); await input.waitFor()
  assert.equal(await input.inputValue(), '')
  await switchTask('另一项任务'); assert.equal(await input.inputValue(), '另一任务的草稿不应改变')
  await switchTask(sessions[0].title)
  report.checks.push('An ACK received after switching tasks clears and persists only the submitted owner draft; the other draft is preserved across navigation and reload.')

  await input.fill('确认前刷新重试同一个提交')
  nextAck = defer()
  await sendButton().click()
  await rows.filter({ hasText: '确认前刷新重试同一个提交' }).waitFor()
  const originalSubmissionId = queue.get('active').items.find(item => item.text === '确认前刷新重试同一个提交').submissionId
  await frame.getByRole('button', { name: /^推理强度：/ }).click()
  await frame.getByRole('menuitemradio', { name: '高', exact: true }).click()
  await waitFor(() => preferences.get('first-party.mira-harness.session-model-selection.active')?.thinkingLevel === 'high')
  await page.reload(); await input.waitFor()
  assert.equal(await input.inputValue(), '确认前刷新重试同一个提交')
  gates.get('ack').resolve()
  await sendButton().click()
  await waitFor(() => requests.filter(call => call.method === 'harness.message.submit' && call.params.text === '确认前刷新重试同一个提交').length === 2)
  const retries = requests.filter(call => call.method === 'harness.message.submit' && call.params.text === '确认前刷新重试同一个提交')
  assert.ok(retries.every(call => call.params.submissionId === originalSubmissionId))
  assert.ok(retries.every(call => call.params.selection.thinkingLevel === 'medium'))
  assert.equal(queue.get('active').items.filter(item => item.text === '确认前刷新重试同一个提交').length, 1)
  await waitFor(() => (preferences.get(draftPreferenceKey)?.drafts?.active ?? '') === '')
  report.checks.push('Reload before the submit ACK reuses the persisted identity and original intent even after the next-draft reasoning changes: one accepted message and no duplicate queue item.')

  const selectedRow = rows.filter({ hasText: '确认前刷新重试同一个提交' })
  const selectedId = await selectedRow.getAttribute('data-queue-item')
  const reorderHandle = selectedRow.getByRole('button', { name: /^排序待发送消息 \d+$/ })
  await selectedRow.evaluate(() => {
    window.__miraQueueKeys = []
    document.addEventListener('keydown', event => {
      const entry = { key: event.key, code: event.code, target: event.target?.getAttribute('aria-label'), prevented: event.defaultPrevented }
      window.__miraQueueKeys.push(entry)
      queueMicrotask(() => { entry.prevented = event.defaultPrevented })
    }, true)
    window.addEventListener('keydown', event => window.__miraQueueKeys.push({ phase: 'window-bubble', key: event.key, code: event.code, prevented: event.defaultPrevented, time: performance.now() }))
  })
  await reorderHandle.focus(); await reorderHandle.press('Space')
  await frame.locator(`[data-queue-item="${selectedId}"].mira-message-queue__row--dragging`).waitFor()
  // dnd-kit defers its keyboard listener until after the activation event.
  await page.frames().find(frame => frame.url().endsWith('/app/index.html')).waitForFunction(() => window.__miraQueueListeners.some(entry => entry.method === 'addEventListener' && entry.target === 'document' && entry.name === 'bound handleKeyDown'))
  const reorderTarget = queue.get('active').items[1].id
  await reorderHandle.press('ArrowUp')
  await frame.getByText(`Draggable item ${selectedId} was moved over droppable area ${reorderTarget}.`, { exact: true }).waitFor({ state: 'attached' })
  await reorderHandle.press('Space')
  await waitFor(() => queue.get('active').items[1]?.id === selectedId)
  report.checks.push('The shipped drag handle supports keyboard reordering and commits the anchor order to the authoritative queue.')
  await frame.getByText('当前队列回复：第三条排队任务', { exact: true }).waitFor()
  preemptGate = defer()
  const interruptedRun = executions.get('active').runId
  await rows.filter({ hasText: '确认前刷新重试同一个提交' }).getByRole('button', { name: /^立即发送待发送消息 \d+$/ }).click()
  await waitFor(() => queue.get('active').promotingItemId === selectedId && gates.has('preempt'))
  await page.reload(); await input.waitFor()
  const promotingRow = frame.locator(`[data-queue-item="${selectedId}"]`)
  await frame.locator(`[data-queue-item="${selectedId}"][data-queue-promoting="true"]`).waitFor()
  assert.equal(await promotingRow.getByRole('button', { name: /^删除待发送消息 \d+$/ }).isDisabled(), true)
  assert.equal(await promotingRow.getByRole('button', { name: /^立即发送待发送消息 \d+$/ }).isDisabled(), true)
  gates.get('preempt').resolve()
  await frame.getByText('当前队列回复：确认前刷新重试同一个提交', { exact: true }).waitFor()
  await frame.locator('[data-user-message-id]').filter({ hasText: '确认前刷新重试同一个提交' }).waitFor()
  await frame.getByText('当前队列回复：第三条排队任务', { exact: true }).waitFor()
  assert.deepEqual(started, ['第一条排队任务', '第二条排队任务', '第三条排队任务', '确认前刷新重试同一个提交'])
  assert.equal(queue.get('active').promotingItemId, undefined)
  assert.equal(queue.get('active').paused, undefined)
  assert.equal(await invoke('', 'run.abort', { sessionId: 'active', expectedRunId: interruptedRun }), false)
  assert.ok(busy.has('active'))
  assert.deepEqual(queue.get('active').items.map(item => item.text), ['执行期间第四条任务', '跨会话等待确认的提交'])
  report.checks.push('Send Now reserves the selected complete intent, survives renderer reload with an authoritative row lock, preempts the old run without pausing the remaining queue, and rejects stale Stop.')
  await page.evaluate(() => window.theme('light')); await frame.locator('html:not(.dark)').waitFor(); await capture('queue-running-light')
  await page.evaluate(() => window.theme('dark')); await frame.locator('html.dark').waitFor(); await capture('queue-running-dark')
  finish('active')
  await frame.getByText('当前队列回复：执行期间第四条任务', { exact: true }).waitFor()
  await frame.getByRole('button', { name: '停止任务', exact: true }).click()
  await frame.getByRole('button', { name: '恢复待发送', exact: true }).waitFor()
  assert.deepEqual(queue.get('active').items.map(item => item.text), ['跨会话等待确认的提交'])
  assert.equal(queue.get('active').paused, 'stopped')
  report.checks.push('After a promoted task completes, untouched messages continue in their revised FIFO order; an explicit user Stop pauses the remaining backlog.')

  const confirmation = frame.getByRole('dialog', { name: '发送消息？', exact: true })
  const retainedIds = queue.get('active').items.map(item => item.id)
  const startsBeforeConfirmation = started.length
  await send('暂停队列确认的草稿')
  await confirmation.waitFor()
  assert.equal(await input.inputValue(), '暂停队列确认的草稿')
  assert.deepEqual(queue.get('active').items.map(item => item.id), retainedIds)
  await confirmation.press('Escape')
  await confirmation.waitFor({ state: 'hidden' })
  assert.equal(await input.inputValue(), '暂停队列确认的草稿')
  assert.equal(started.length, startsBeforeConfirmation)
  await page.frames().find(frame => frame.url().endsWith('/app/index.html')).waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '任务内容')
  report.checks.push('A paused backlog requires a host confirmation before sending. Escape cancels without admitting a message, clearing the draft or changing the queue.')

  await send('保留旧队列并立即发送')
  await confirmation.waitFor()
  await page.evaluate(() => window.theme('light')); await frame.locator('html:not(.dark)').waitFor(); await capture('queue-confirmation-light')
  await page.evaluate(() => window.theme('dark')); await frame.locator('html.dark').waitFor(); await capture('queue-confirmation-dark')
  await confirmation.getByRole('button', { name: '发送消息', exact: true }).click()
  await frame.getByText('当前队列回复：保留旧队列并立即发送', { exact: true }).waitFor()
  await confirmation.waitFor({ state: 'hidden' })
  assert.deepEqual(queue.get('active').items.map(item => item.id), retainedIds)
  assert.equal(queue.get('active').paused, 'stopped')
  assert.equal(started.length, startsBeforeConfirmation + 1)
  await frame.getByRole('button', { name: '停止任务', exact: true }).click()
  await frame.getByRole('button', { name: '恢复待发送', exact: true }).waitFor()
  report.checks.push('Retain sends only the newly confirmed input immediately and leaves the old backlog paused, rather than silently auto-draining it.')

  await send('清空确认过的旧队列并发送')
  await confirmation.waitFor()
  const beforeStaleDecision = started.length
  // Simulate another authorized host client changing the paused queue after the dialog opens.
  queue.submit(sender, { sessionId: 'active', submissionId: 'concurrent-queue-fixture', text: '确认期间新加入的排队任务', references: [], selection, planning: false, permissionMode: 'default' }, [], { projectId: 'project', workingDirectory: output })
  await confirmation.getByRole('button', { name: '清空队列', exact: true }).click()
  await confirmation.getByText(/2 条消息/).waitFor()
  assert.equal(started.length, beforeStaleDecision)
  assert.equal(queue.get('active').items.length, 2)
  assert.equal(await input.inputValue(), '清空确认过的旧队列并发送')
  await confirmation.getByRole('button', { name: '清空队列', exact: true }).click()
  await frame.getByText('当前队列回复：清空确认过的旧队列并发送', { exact: true }).waitFor()
  await confirmation.waitFor({ state: 'hidden' })
  assert.equal(queue.get('active').items.length, 0)
  assert.equal(started.length, beforeStaleDecision + 1)
  assert.ok(!started.includes('确认期间新加入的排队任务'))
  report.checks.push('An outdated clear confirmation is rejected without starting or deleting anything. A fresh confirmation clears exactly the observed backlog only after admission.')

  preemptGate = defer(); nextAck = defer()
  const preemptedByComposer = getSession('active').activeRun.id
  await input.fill('修饰键立即发送的新消息')
  await input.press('Control+Enter')
  await waitFor(() => gates.has('preempt'))
  assert.equal(await input.inputValue(), '修饰键立即发送的新消息')
  assert.equal(queue.get('active').items.length, 0)
  await input.fill('立即发送等待期间的新草稿')
  gates.get('preempt').resolve()
  await frame.getByText('当前队列回复：修饰键立即发送的新消息', { exact: true }).waitFor()
  await waitFor(() => gates.has('ack'))
  gates.get('ack').resolve()
  await waitFor(() => !preferences.get(draftPreferenceKey)?.submissions?.active)
  assert.equal(await input.inputValue(), '立即发送等待期间的新草稿')
  const immediateCalls = requests.filter(call => call.method === 'harness.message.submit' && call.params.text === '修饰键立即发送的新消息')
  assert.equal(immediateCalls.length, 1)
  assert.deepEqual(immediateCalls[0].params.options, { delivery: 'immediate', expectedRunId: preemptedByComposer })
  assert.equal(await invoke('', 'run.abort', { sessionId: 'active', expectedRunId: preemptedByComposer }), false)
  report.checks.push('Ctrl/Command+Enter submits a single atomic immediate intent without a transient queue row. Preemption and a delayed ACK preserve the newer draft and reject stale Stop.')

  await input.fill('修饰键点击立即发送')
  const primaryModifier = await input.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? 'Meta' : 'Control')
  await page.keyboard.down(primaryModifier)
  try { await frame.getByRole('button', { name: '立即发送', exact: true }).click() }
  finally { await page.keyboard.up(primaryModifier) }
  await frame.getByText('当前队列回复：修饰键点击立即发送', { exact: true }).waitFor()
  await waitFor(() => (preferences.get(draftPreferenceKey)?.drafts?.active ?? '') === '')
  assert.equal(requests.filter(call => call.method === 'harness.message.submit' && call.params.text === '修饰键点击立即发送' && call.params.options?.delivery === 'immediate').length, 1)
  report.checks.push('Holding the platform primary modifier exposes the immediate-send hint; modifier-click uses the same atomic submission contract without changing the saved send preference.')
  await send('终态验收保留的待发送消息')
  await rows.filter({ hasText: '终态验收保留的待发送消息' }).waitFor()
  await input.fill('')
  await frame.getByRole('button', { name: '停止任务', exact: true }).click()
  await frame.getByRole('button', { name: '恢复待发送', exact: true }).waitFor()

  const transcriptRun = 'ordered-conversation-fixture', transcriptStartedAt = Date.now()
  const transcript = { id: 'ordered-conversation-message', role: 'assistant', runId: transcriptRun, content: '', parts: [], createdAt: transcriptStartedAt }
  const persistTranscript = () => {
    const index = sessions[0].messages.findIndex(message => message.id === transcript.id)
    if (index < 0) sessions[0].messages.push(structuredClone(transcript))
    else sessions[0].messages[index] = structuredClone(transcript)
  }
  sessions[0].messages.push({ id: 'ordered-conversation-user', role: 'user', content: '检查配置并解释修改过程', createdAt: transcriptStartedAt })
  sessions[0].activeRun = { id: transcriptRun, startedAt: transcriptStartedAt, activities: [], subtasks: [] }
  busy.add('active')
  const publishPart = part => {
    const index = transcript.parts.findIndex(item => item.id === part.id)
    if (index < 0) transcript.parts.push(part)
    else transcript.parts[index] = part
    emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'message-part', payload: { part: structuredClone(part) } })
  }
  const appendPart = (id, delta) => {
    const part = transcript.parts.find(item => item.id === id)
    const offset = part.text.length
    part.text += delta
    emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'message-part', payload: { partId: id, delta, offset } })
    if (part.type === 'text') {
      transcript.content += delta
      emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'message-delta', payload: { delta } })
    }
  }
  const publishTool = tool => {
    const index = sessions[0].toolCalls.findIndex(item => item.id === tool.id)
    if (index < 0) sessions[0].toolCalls.push(tool)
    else sessions[0].toolCalls[index] = tool
    emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'tool-call', payload: structuredClone(tool) })
  }
  emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'run-start', payload: { startedAt: transcriptStartedAt } })
  sessions[0].activeRun.activities = [{ id: 'todo-read', kind: 'plan', label: '读取配置', status: 'completed', startedAt: transcriptStartedAt }, { id: 'todo-write', kind: 'plan', label: '确认配置修改', status: 'running', startedAt: transcriptStartedAt }]
  emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'run-activity', payload: { activities: sessions[0].activeRun.activities } })
  publishPart({ id: 'ordered-reasoning', type: 'reasoning', text: '', state: 'streaming', startedAt: transcriptStartedAt })
  appendPart('ordered-reasoning', '公开的分析过程：先检查配置，再请求写入许可。')
  const reasoning = frame.locator('[data-message-part-id="ordered-reasoning"] details')
  await reasoning.waitFor()
  assert.equal(await reasoning.getAttribute('open'), null)
  await reasoning.locator('summary').press('Enter')
  await frame.getByText('公开的分析过程：先检查配置，再请求写入许可。', { exact: true }).waitFor()
  publishPart({ ...transcript.parts[0], state: 'complete', completedAt: Date.now() })
  publishPart({ id: 'ordered-before', type: 'text', text: '', state: 'streaming', startedAt: Date.now() })
  appendPart('ordered-before', '我先检查配置。')
  publishPart({ ...transcript.parts[1], state: 'complete', completedAt: Date.now() })
  const readRecord = { id: `${transcriptRun}:read`, providerCallId: 'read', runId: transcriptRun, tool: 'read', target: 'config.json', status: 'running', input: { text: '{"path":"config.json"}', truncated: false }, createdAt: Date.now() }
  publishPart({ id: 'ordered-read', type: 'tool', toolCallId: readRecord.id })
  publishTool(readRecord)
  const readRow = frame.locator(`[data-tool-call-id="${readRecord.id}"]`)
  await readRow.locator('summary').click()
  await readRow.locator('[data-tool-payload="input"]').filter({ hasText: 'config.json' }).waitFor()
  publishTool({ ...readRecord, status: 'ok', output: { text: 'port=3000\nmode=development', truncated: false }, completedAt: Date.now() })
  await readRow.locator('[data-tool-payload="output"]').filter({ hasText: 'port=3000' }).waitFor()
  publishPart({ id: 'ordered-between', type: 'text', text: '', state: 'streaming', startedAt: Date.now() })
  appendPart('ordered-between', '配置已读取，准备更新。')
  publishPart({ ...transcript.parts[3], state: 'complete', completedAt: Date.now() })
  const writeRecord = { id: `${transcriptRun}:write`, providerCallId: 'write', runId: transcriptRun, tool: 'write', target: 'config.json', status: 'waiting-confirm', input: { text: '{"path":"config.json","token":"***"}', truncated: false }, approvalRequestId: 'ordered-permission', createdAt: Date.now() }
  publishPart({ id: 'ordered-write', type: 'tool', toolCallId: writeRecord.id })
  publishTool(writeRecord)
  transcriptPermission = { requestId: 'ordered-permission', sessionId: 'active', toolCallId: writeRecord.id, runId: transcriptRun, title: '允许修改配置？', detail: 'config.json' }
  settleTranscriptPermission = allowed => publishTool({ ...writeRecord, status: allowed ? 'ok' : 'cancelled', error: allowed ? undefined : '用户拒绝了操作', completedAt: Date.now() })
  emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'permission-request', payload: transcriptPermission })
  const inlinePermission = frame.locator('[data-permission-request-id="ordered-permission"][data-permission-placement="inline"]')
  await inlinePermission.waitFor()
  await frame.getByRole('button', { name: '展开任务摘要', exact: true }).click()
  await frame.locator('.mira-task-summary').getByText('待办', { exact: true }).waitFor()
  await frame.locator('.mira-task-summary').getByText('1/2 已完成', { exact: true }).waitFor()
  assert.equal(await frame.locator('[data-permission-request-id="ordered-permission"]').count(), 1)
  failPermissionOnce = true
  await inlinePermission.getByRole('button', { name: '拒绝', exact: true }).click()
  await inlinePermission.getByRole('alert').filter({ hasText: '隔离审批失败，请重试' }).waitFor()
  persistTranscript()
  await page.reload(); await inlinePermission.waitFor()
  emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'message-part', payload: { partId: 'ordered-before', delta: '我先检查配置。', offset: 0 } })
  emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'message-delta', payload: { delta: '我先检查配置。' } })
  await frame.getByText('我先检查配置。', { exact: true }).waitFor()
  assert.equal(await frame.getByText('我先检查配置。', { exact: true }).count(), 1)
  report.checks.push('A running reload restores the tool-bound pending approval; a late delta already included in the saved part is not appended twice.')
  await inlinePermission.getByRole('button', { name: '拒绝', exact: true }).click()
  await frame.locator(`[data-tool-call-id="${writeRecord.id}"][data-tool-status="cancelled"]`).waitFor()
  await inlinePermission.waitFor({ state: 'detached' })
  publishPart({ id: 'ordered-after', type: 'text', text: '', state: 'streaming', startedAt: Date.now() })
  appendPart('ordered-after', '未修改文件，现有配置已保留。')
  publishPart({ ...transcript.parts[5], state: 'complete', completedAt: Date.now() })
  persistTranscript()
  const expectedPartOrder = ['ordered-reasoning', 'ordered-before', 'ordered-read', 'ordered-between', 'ordered-write', 'ordered-after']
  const partOrder = () => frame.locator('[data-message-part-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-message-part-id')))
  await frame.getByText('未修改文件，现有配置已保留。', { exact: true }).waitFor()
  assert.deepEqual(await partOrder(), expectedPartOrder)
  assert.equal(await frame.getByText('我先检查配置。', { exact: true }).count(), 1)
  report.checks.push('Ordered public reasoning/text/tool parts preserve text→read→text→write→text without duplicate legacy deltas; real input/output and a failed-then-retried inline denial remain attached to the correct tool.')
  await reasoning.locator('summary').press('Enter')
  await frame.getByText('公开的分析过程：先检查配置，再请求写入许可。', { exact: true }).waitFor()
  await readRow.locator('summary').press('Enter')
  await readRow.locator('[data-tool-payload="output"]').waitFor()
  await reasoning.evaluate(element => { element.dataset.disclosureInstance = 'before-final' })
  await readRow.evaluate(element => { element.dataset.disclosureInstance = 'before-final' })
  const completedAt = Date.now()
  transcript.run = { status: 'completed', startedAt: transcriptStartedAt, completedAt, durationMs: completedAt - transcriptStartedAt, activities: [], subtasks: [] }
  sessions[0].messages[sessions[0].messages.length - 1] = structuredClone(transcript)
  busy.delete('active'); delete sessions[0].activeRun
  emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'message-complete', payload: { content: transcript.content, run: transcript.run } })
  emit(sender, { sessionId: 'active', runId: transcriptRun, type: 'status', payload: { state: 'idle' } })
  await frame.getByRole('button', { name: '恢复待发送', exact: true }).waitFor()
  await frame.locator('[data-assistant-message-id="ordered-conversation-message"]').waitFor()
  assert.equal(await reasoning.getAttribute('open'), '', 'Reasoning remains expanded after the streaming row receives its canonical message ID.')
  assert.equal(await readRow.getAttribute('open'), '', 'Tool details remain expanded after completion.')
  assert.equal(await reasoning.getAttribute('data-disclosure-instance'), 'before-final')
  assert.equal(await readRow.getAttribute('data-disclosure-instance'), 'before-final')
  report.checks.push('Streaming completion preserves the same expanded reasoning/tool DOM nodes while message actions keep their canonical identity.')
  await page.reload(); await frame.getByText('未修改文件，现有配置已保留。', { exact: true }).waitFor()
  assert.deepEqual(await partOrder(), expectedPartOrder)
  assert.equal(await frame.locator(`[data-tool-call-id="${writeRecord.id}"][data-tool-status="cancelled"]`).count(), 1)
  assert.equal(await frame.locator('[data-permission-request-id]').count(), 0)
  await page.evaluate(() => window.theme('light')); await frame.locator('html:not(.dark)').waitFor(); await capture('ordered-conversation-light')
  await page.evaluate(() => window.theme('dark')); await frame.locator('html.dark').waitFor(); await capture('ordered-conversation-dark')
  report.checks.push('Reload preserves authoritative part order, tool I/O and cancelled history, and does not resurrect a resolved approval. Light/dark use the same production components.')
  assert.deepEqual(report.errors, [])
  assert.equal(requests.filter(call => call.method === 'harness.message.run').length, 0)
  report.checks.push('Reload reads the authoritative paused process queue; no legacy message.run fallback is used.')
  report.passed = true
} catch (error) {
  report.failure = error.stack
  report.requests = requests.map(({ method, params }) => ({ method, params }))
  report.queue = queue.get('active')
  report.frameText = await page?.frames().find(frame => frame.url().endsWith('/app/index.html'))?.locator('body').innerText().catch(() => '')
  report.queueDOM = await page?.frames().find(frame => frame.url().endsWith('/app/index.html'))?.locator('body').evaluate(() => ({
    keys: window.__miraQueueKeys,
    listeners: window.__miraQueueListeners,
    focus: document.activeElement?.outerHTML,
    rows: [...document.querySelectorAll('[data-queue-item]')].map(row => ({ id: row.getAttribute('data-queue-item'), rect: row.getBoundingClientRect().toJSON(), transform: getComputedStyle(row).transform, transition: getComputedStyle(row).transition })),
    list: document.querySelector('.mira-message-queue__list')?.getBoundingClientRect().toJSON(),
  })).catch(() => undefined)
  throw error
}
finally {
  for (const gate of gates.values()) gate.resolve()
  nextAck?.resolve(); nextWithdrawal?.resolve()
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2))
  await browser?.close(); await new Promise(done => server.close(done))
  const { requests: _requests, queue: _queue, frameText: _frameText, queueDOM: _queueDOM, ...summary } = report
  console.log(JSON.stringify(summary, null, 2))
}
