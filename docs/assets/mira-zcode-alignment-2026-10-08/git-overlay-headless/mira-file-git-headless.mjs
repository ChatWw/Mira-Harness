import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { build } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/esbuild/lib/main.js'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import sharp from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs'

const root = '/Volumes/VrenDisk/project/Mira/Mira-Harness'
const evidence = resolve(root, 'docs/assets/mira-zcode-alignment-2026-10-08/git-overlay-headless')
const fixture = await mkdtemp(resolve(tmpdir(), 'mira-git-headless-'))
const project = resolve(fixture, 'mira-git-project')
const plain = resolve(fixture, 'mira-plain-project')
await mkdir(project); await mkdir(plain)
const run = promisify(execFile)
const git = (...args) => run('git', ['-C', project, ...args], { timeout: 10_000 })
async function loadModule(path) {
  const bundle = await build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
}
const files = await loadModule('electron/services/harnessWorkspaceFiles.ts')
const search = await loadModule('electron/services/harnessWorkspaceSearch.ts')
const workspaceGit = await loadModule('electron/services/harnessWorkspaceGit.ts')
const { handleFirstPartyRequest } = await loadModule('src/platform/firstPartyBridge.ts')
await git('init', '--initial-branch=main')
await git('config', 'user.name', 'Mira Isolated Fixture')
await git('config', 'user.email', 'fixture@mira.invalid')
for (const directory of ['src', 'gone', 'cache', 'bulk']) await mkdir(resolve(project, directory))
await writeFile(resolve(project, '.gitignore'), 'cache/\n*.secret\n')
for (const path of ['src/modified.ts', 'src/original.ts', 'src/clean.ts', 'gone/deleted.md', 'gone/keep.md']) await writeFile(resolve(project, path), `// ${path}\nexport const miraFixture = true\n`)
for (let index = 0; index < 720; index++) await writeFile(resolve(project, `bulk/file-${String(index).padStart(4, '0')}.txt`), 'Mira virtual tree fixture\n')
await git('add', '--', '.')
await git('commit', '-m', 'fixture baseline')
await writeFile(resolve(project, 'src/modified.ts'), 'export const miraFixture = "modified"\n')
await rename(resolve(project, 'src/original.ts'), resolve(project, 'src/renamed.ts'))
await git('add', '--', 'src/original.ts', 'src/renamed.ts')
await writeFile(resolve(project, 'src/staged.ts'), 'export const miraStaged = true\n')
await git('add', '--', 'src/staged.ts')
await writeFile(resolve(project, 'src/untracked.ts'), 'export const miraUntracked = true\n')
await rm(resolve(project, 'gone/deleted.md'))
await writeFile(resolve(project, 'cache/ignored.ts'), 'export const miraIgnored = true\n')
await writeFile(resolve(project, 'src/token.secret'), 'Mira ignore fixture, not a credential\n')
await writeFile(resolve(plain, 'plain.txt'), 'Non-repository fixture\n')

const sessions = [
  { version: 1, id: 'git-fixture', projectId: 'git-project', title: 'Mira Git 状态验收夹具', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 2, status: 'active', pinned: false },
  { version: 1, id: 'plain-fixture', projectId: 'plain-project', title: 'Mira 非仓库验收夹具', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false },
]
const preferences = new Map([['first-party.mira-harness.active-session', sessions[0].id]])
const requests = [], checks = [], pageErrors = []
let gitFailure = false, holdStatus = false, releaseStatus, heldStatusStarted = false
const record = (name, details) => { const item = { at: new Date().toISOString(), name, ...details }; checks.push(item); console.log(JSON.stringify(item)) }
async function invoke(_grant, method, call) {
  const current = sessions.find(session => session.id === (call.sessionId || call.id))
  const directory = current?.projectId === 'git-project' ? project : plain
  switch (method) {
    case 'sessions.list': return sessions
    case 'projects.list': return [{ id: 'git-project', name: 'Mira Git 夹具', directory: project, directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 1 }, { id: 'plain-project', name: 'Mira 非仓库夹具', directory: plain, directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 1 }]
    case 'providers.list': case 'permissions.pending': case 'skills.list': case 'mcp.list': case 'editors.list': return []
    case 'session.get': assert.ok(current); return current
    case 'session.set-unread': return
    case 'files.list': return files.listHarnessWorkspaceFiles(directory, call.path)
    case 'files.read': return files.readHarnessWorkspaceFile(directory, call.path)
    case 'files.search': return search.searchHarnessWorkspaceFiles(directory, call.query, call.refresh)
    case 'files.git-status': {
      if (gitFailure) throw new Error('Git 状态读取超时，请重试')
      const value = await workspaceGit.readHarnessWorkspaceGit(directory)
      if (holdStatus && current.id === 'git-fixture') { holdStatus = false; heldStatusStarted = true; await new Promise(resolve => { releaseStatus = resolve }) }
      return value
    }
    case 'files.git-ignored': return workspaceGit.readHarnessWorkspaceIgnored(directory, call.paths)
    case 'files.watch': return { watchId: `${call.sessionId}-watch` }
    case 'files.unwatch': return
    default: throw new Error(`Fixture method not implemented: ${method}`)
  }
}
const bridge = {
  manifest: { appId: 'mira-harness', enabled: true, capabilities: ['harness:workbench'] }, grantId: 'isolated-git-fixture',
  context: { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'fixture', name: 'Mira' } }, route: '/', navigate() {},
  api: { invokeFirstPartyHarness: invoke, getSnapshot: async () => ({ preferences: Object.fromEntries(preferences) }), savePreference: async (key, value) => { preferences.set(key, value) } },
}
const parentHtml = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe id="app" src="/app/index.html" sandbox="allow-scripts allow-forms allow-downloads" allow="clipboard-write"></iframe><script>
const app=document.getElementById('app');app.addEventListener('load',()=>{const channel=new MessageChannel();window.fixturePort=channel.port1;channel.port1.onmessage=async event=>{const data=event.data;if(data.type!=='mira:request')return;try{const response=await fetch('/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});channel.port1.postMessage({type:'mira:response',id:data.id,...await response.json()})}catch(error){channel.port1.postMessage({type:'mira:response',id:data.id,ok:false,error:{message:error.message}})}};app.contentWindow.postMessage({type:'mira:connect',apiVersion:{major:1}},'*',[channel.port2]);window.theme=theme=>channel.port1.postMessage({type:'mira:context',context:{theme}});window.watch=()=>channel.port1.postMessage({type:'mira:harness-event',event:{type:'workspace-files-changed',sessionId:'git-fixture',payload:{watchId:'git-fixture-watch',directory:${JSON.stringify(project)},paths:['src']}}})})</script>`
const server = createServer(async (request, response) => {
  try {
    response.setHeader('Access-Control-Allow-Origin', '*')
    if (request.url === '/invoke') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk)
      const call = JSON.parse(Buffer.concat(chunks))
      requests.push({ method: call.method, params: call.params, at: new Date().toISOString() })
      response.setHeader('Content-Type', 'application/json')
      try { response.end(JSON.stringify({ ok: true, value: await handleFirstPartyRequest(bridge, call) })) }
      catch (error) { response.end(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })) }
      return
    }
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(parentHtml); return }
    const relative = decodeURIComponent(new URL(request.url, 'http://fixture.invalid').pathname).replace(/^\/app\//, '')
    const path = resolve(root, 'dist/harness-react-app', relative)
    if (!path.startsWith(resolve(root, 'dist/harness-react-app') + '/')) { response.writeHead(403); response.end(); return }
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(path)] || 'application/octet-stream')
    response.end(await readFile(path))
  } catch (error) { response.writeHead(500); response.end(error.message) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const frame = page.frameLocator('#app')
  await frame.locator('.mira-session-row__open[aria-current="page"]').waitFor()
  await frame.getByRole('button', { name: '查看文件', exact: true }).click()
  const drawer = frame.locator('.mira-file-drawer')
  const row = path => drawer.locator(`[data-file-tree-path="${path}"]`)
  const status = async (path, expected) => {
    await row(path).locator(`[data-file-git-status="${expected}"]`).waitFor()
    assert.match(await row(path).getAttribute('aria-label'), /已修改|已新增|已重命名|未跟踪/)
  }
  const statusCalls = () => requests.filter(request => request.method === 'harness.files.git-status').length
  const waitFor = async predicate => { for (let attempt = 0; attempt < 100; attempt++) { if (await predicate()) return; await page.waitForTimeout(50) }; assert.fail('Fixture condition timed out') }
  const capture = async name => {
    await drawer.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.waitForTimeout(250)
    const state = await frame.locator('html').evaluate(html => ({ dark: html.classList.contains('dark'), alerts: [...html.querySelectorAll('.mira-file-drawer [role="alert"]')].map(alert => alert.textContent), selectedPath: html.querySelector('[data-file-tree-path][aria-selected="true"]')?.getAttribute('data-file-tree-path') }))
    const screenshot = await page.screenshot({ path: resolve(evidence, name), animations: 'disabled' })
    const pixel = await sharp(screenshot).extract({ left: 640, top: 200, width: 1, height: 1 }).removeAlpha().raw().toBuffer()
    assert.ok(state.dark ? pixel[0] < 40 : pixel[0] > 230, `Stale theme capture ${name}`)
    if (name.includes('error')) assert.ok(state.alerts.some(alert => alert.includes('Git 状态读取超时')), 'Missing Git error')
    record('capture', { name, type: 'headless-react-fixture-not-electron', ...state, threadPixel: [...pixel] })
  }
  await row('src').click()
  await status('src/modified.ts', 'modified'); await status('src/renamed.ts', 'renamed')
  await status('src/staged.ts', 'added'); await status('src/untracked.ts', 'untracked')
  await row('src/token.secret').locator('[data-file-git-color="ignored"]').waitFor()
  await row('cache').locator('[data-file-git-color="ignored"]').waitFor()
  await row('gone').locator('[data-file-git-dot="deleted"]').waitFor()
  await row('src').locator('[data-file-git-dot="modified"]').waitFor()
  await row('cache').click(); await row('cache/ignored.ts').locator('[data-file-git-color="ignored"]').waitFor()
  assert.equal(await row('cache').locator('[data-file-git-dot]').count(), 0)
  await row('gone').click(); await row('gone/keep.md').waitFor()
  assert.equal(await row('gone/deleted.md').count(), 0)
  await row('src/modified.ts').click()
  await frame.locator('.mira-file-preview:visible [role="region"]').waitFor()
  const geometry = await row('src/modified.ts').evaluate(element => ({ height: element.getBoundingClientRect().height, color: getComputedStyle(element.querySelector('.mira-file-drawer__name')).color, indicatorWidth: element.querySelector('[data-file-git-status]').getBoundingClientRect().width }))
  assert.equal(geometry.height, 28); assert.equal(geometry.indicatorWidth, 10)
  await capture('mira-git-light.png')
  record('real-git-status-overlay', { letters: ['M', 'A', 'R', 'U'], deletedDirectoryDot: true, ignoredExactOnly: true, ...geometry })
  await page.evaluate(() => window.theme('dark')); await frame.locator('html.dark').waitFor()
  await capture('mira-git-dark.png')

  await row('bulk').click()
  await page.waitForTimeout(600)
  const callsBeforeScroll = statusCalls()
  const tree = drawer.getByRole('tree')
  await tree.evaluate(element => { element.scrollTop = 14_000 })
  await page.waitForTimeout(350)
  assert.equal(statusCalls(), callsBeforeScroll)
  assert.ok(await drawer.locator('[data-file-tree-path]').count() < 100)
  const batches = requests.filter(request => request.method === 'harness.files.git-ignored').map(request => request.params.paths.length)
  assert.ok(batches.every(size => size <= 512))
  record('virtualized-scroll-no-status-poll', { mountedRows: await drawer.locator('[data-file-tree-path]').count(), statusCalls: statusCalls(), ignoredBatchMaximum: Math.max(...batches) })
  await tree.evaluate(element => { element.scrollTop = 0 })

  const query = drawer.getByRole('textbox', { name: '搜索文件', exact: true })
  await query.fill('src/modified'); await status('src/modified.ts', 'modified')
  await row('src/modified.ts').click()
  const beforeStage = statusCalls()
  await git('add', '--', 'src/modified.ts'); await git('commit', '-m', 'fixture manual status refresh')
  await page.waitForTimeout(250)
  assert.equal(statusCalls(), beforeStage, 'Do not imply external .git metadata watching')
  await drawer.getByRole('button', { name: '刷新文件', exact: true }).click()
  await waitFor(async () => statusCalls() > beforeStage && await row('src/modified.ts').locator('[data-file-git-status]').count() === 0)
  assert.equal(await query.inputValue(), 'src/modified')
  assert.equal(await row('src/modified.ts').getAttribute('aria-selected'), 'true')
  record('manual-index-refresh-retains-query-selection', { query: await query.inputValue(), externalMetadataAutoRefresh: false })
  await writeFile(resolve(project, 'src/modified.ts'), 'export const miraFixture = "watch changed"\n')
  await page.evaluate(() => window.watch())
  await status('src/modified.ts', 'modified')
  record('workspace-event-status-refresh', { notification: 'explicit-protocol-fixture-not-native-fs-watch' })
  await query.fill('')
  await row('src/modified.ts').waitFor()

  gitFailure = true
  await drawer.getByRole('button', { name: '刷新文件', exact: true }).click()
  await drawer.getByRole('alert').filter({ hasText: 'Git 状态读取超时' }).waitFor()
  await capture('mira-git-dark-error.png')
  await page.evaluate(() => window.theme('light')); await frame.locator('html:not(.dark)').waitFor()
  await capture('mira-git-light-error.png')
  gitFailure = false
  await drawer.getByRole('button', { name: '重试读取 Git 状态', exact: true }).click()
  await status('src/modified.ts', 'modified')
  assert.equal(await drawer.getByRole('alert').count(), 0)
  record('safe-error-and-retry', { source: 'injected-safe-timeout-through-real-first-party-bridge', recovered: true })

  holdStatus = true
  await drawer.getByRole('button', { name: '刷新文件', exact: true }).click()
  await waitFor(() => heldStatusStarted)
  await drawer.getByRole('button', { name: '返回任务', exact: true }).click()
  await frame.getByRole('button', { name: 'Mira 非仓库验收夹具', exact: true }).click()
  await frame.getByRole('button', { name: '查看文件', exact: true }).click()
  await row('plain.txt').waitFor()
  releaseStatus(); releaseStatus = undefined
  await waitFor(() => requests.some(request => request.method === 'harness.files.git-status' && request.params.sessionId === 'plain-fixture'))
  await page.waitForTimeout(350)
  assert.equal(await drawer.locator('[data-file-git-status], [data-file-git-dot]').count(), 0)
  assert.equal(await drawer.getByRole('alert').count(), 0)
  await capture('mira-git-nonrepo.png')
  record('nonrepo-and-stale-session-result', { ordinaryNonrepoIsNotError: true, staleOldSessionDiscarded: true })
  await drawer.getByRole('button', { name: '返回任务', exact: true }).click()
  await frame.getByRole('button', { name: 'Mira Git 状态验收夹具', exact: true }).click()
  await frame.getByRole('button', { name: '查看文件', exact: true }).click()
  await status('src/modified.ts', 'modified')
  for (const viewport of [{ width: 1710, height: 992 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport)
    await capture(`mira-git-desktop-${viewport.width}.png`)
    const bounds = await drawer.evaluate(element => { const rect = element.getBoundingClientRect(); return { width: rect.width, right: rect.right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth } })
    assert.equal(bounds.width, 264); assert.equal(bounds.scrollWidth, bounds.clientWidth)
    record('desktop-viewport', { ...viewport, ...bounds })
  }
  assert.equal(pageErrors.length, 0)
  record('result', { passed: true, browserVersion: browser.version(), viewports: ['1440x900', '1710x992', '1280x800'], pageErrors, desktopMouseKeyboard: false, electronGrant: 'unit-tests-only', watch: 'protocol-fixture-only', projectsAreIsolated: true })
} catch (error) { record('result', { passed: false, error: error.stack, pageErrors }); throw error }
finally {
  releaseStatus?.()
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  await writeFile(resolve(evidence, 'results.json'), JSON.stringify({ checks, requests, pageErrors }, null, 2))
  await rm(fixture, { recursive: true, force: true })
}
