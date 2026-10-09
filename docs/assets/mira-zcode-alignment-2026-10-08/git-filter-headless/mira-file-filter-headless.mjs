import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rename, rmdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { build } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/esbuild/lib/main.js'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import sharp from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs'

// Independent production-renderer fixture, not native Electron or foreground desktop automation.
const root = '/Volumes/VrenDisk/project/Mira/Mira-Harness'
const evidence = resolve(root, 'docs/assets/mira-zcode-alignment-2026-10-08/git-filter-headless')
const baseline = process.argv.includes('--baseline')
const menuProbe = process.argv.includes('--menu-refresh-probe')
const verificationMode = baseline ? 'old-production-baseline' : menuProbe ? 'deleted-menu-refresh-before-fix' : 'new-production-verification'
const fixture = await mkdtemp(resolve(tmpdir(), 'mira-git-filter-headless-'))
const project = resolve(fixture, 'mira-git-project')
const plain = resolve(fixture, 'mira-plain-project')
const clean = resolve(fixture, 'mira-clean-project')
for (const directory of [project, plain, clean]) await mkdir(directory)
const run = promisify(execFile)
const gitAt = (directory, ...args) => run('git', ['-C', directory, ...args], { timeout: 10_000 })
const git = (...args) => gitAt(project, ...args)
async function loadModule(path) {
  const bundle = await build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
}
const files = await loadModule('electron/services/harnessWorkspaceFiles.ts')
const search = await loadModule('electron/services/harnessWorkspaceSearch.ts')
const workspaceGit = await loadModule('electron/services/harnessWorkspaceGit.ts')
const { handleFirstPartyRequest } = await loadModule('src/platform/firstPartyBridge.ts')
for (const directory of [project, clean]) {
  await gitAt(directory, 'init', '--initial-branch=main')
  await gitAt(directory, 'config', 'user.name', 'Mira Isolated Fixture')
  await gitAt(directory, 'config', 'user.email', 'fixture@mira.invalid')
}
for (const directory of ['src', 'gone', 'absent', 'unloaded', 'cache', 'bulk']) await mkdir(resolve(project, directory))
await writeFile(resolve(project, '.gitignore'), 'cache/\n*.secret\n')
for (const path of ['root-deleted.md', 'root-deleted.png', 'root-clean.txt', 'src/modified.ts', 'src/original.ts', 'src/clean.ts', 'gone/deleted.md', 'gone/keep.md', 'absent/deleted.md', 'unloaded/deleted.md', 'unloaded/keep.md']) await writeFile(resolve(project, path), `// ${path}\nexport const miraFixture = true\n`)
for (let index = 0; index < 240; index++) await writeFile(resolve(project, `bulk/file-${String(index).padStart(4, '0')}.txt`), 'Mira virtual tree fixture\n')
await git('add', '--', '.')
await git('commit', '-m', 'fixture baseline')
await writeFile(resolve(project, 'src/modified.ts'), 'export const miraFixture = "modified"\n')
await rename(resolve(project, 'src/original.ts'), resolve(project, 'src/renamed.ts'))
await git('add', '--', 'src/original.ts', 'src/renamed.ts')
await writeFile(resolve(project, 'src/staged.ts'), 'export const miraStaged = true\n')
await git('add', '--', 'src/staged.ts')
await writeFile(resolve(project, 'src/untracked.ts'), 'export const miraUntracked = true\n')
for (const path of ['root-deleted.md', 'root-deleted.png', 'gone/deleted.md', 'absent/deleted.md', 'unloaded/deleted.md']) await rm(resolve(project, path))
await rmdir(resolve(project, 'absent'))
await writeFile(resolve(project, 'cache/ignored.ts'), 'export const miraIgnored = true\n')
await writeFile(resolve(project, 'src/token.secret'), 'Mira ignore fixture, not a credential\n')
await writeFile(resolve(plain, 'plain.txt'), 'Non-repository fixture\n')
await writeFile(resolve(clean, 'clean.txt'), 'Clean repository fixture\n')
await gitAt(clean, 'add', '--', '.')
await gitAt(clean, 'commit', '-m', 'fixture clean baseline')

const sessions = [
  { version: 1, id: 'git-fixture', projectId: 'git-project', workingDirectory: project, title: 'Mira Git 筛选验收夹具', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 3, status: 'active', pinned: false },
  { version: 1, id: 'plain-fixture', projectId: 'plain-project', workingDirectory: plain, title: 'Mira 非仓库验收夹具', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 2, status: 'active', pinned: false },
  { version: 1, id: 'clean-fixture', projectId: 'clean-project', workingDirectory: clean, title: 'Mira 干净仓库验收夹具', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false },
]
const preferences = new Map([['first-party.mira-harness.active-session', sessions[0].id]])
const requests = [], checks = [], pageErrors = [], interactionFailures = []
let gitFailure = false, holdStatus = false, releaseStatus, heldStatusStarted = false
const record = (name, details) => { const item = { at: new Date().toISOString(), name, ...details }; checks.push(item); console.log(JSON.stringify(item)) }
async function invoke(_grant, method, call) {
  const current = sessions.find(session => session.id === (call.sessionId || call.id))
  const directory = current?.workingDirectory || project
  switch (method) {
    case 'sessions.list': return sessions
    case 'projects.list': return [{ id: 'git-project', name: 'Mira Git 夹具', directory: project, directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 1 }, { id: 'plain-project', name: 'Mira 非仓库夹具', directory: plain, directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 1 }, { id: 'clean-project', name: 'Mira 干净夹具', directory: clean, directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 1 }]
    case 'providers.list': case 'permissions.pending': case 'skills.list': case 'mcp.list': return []
    case 'editors.list': return [{ id: 'vscode', name: 'VS Code' }]
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
  manifest: { appId: 'mira-harness', enabled: true, capabilities: ['harness:workbench'] }, grantId: 'isolated-git-filter-fixture',
  context: { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'fixture', name: 'Mira' } }, route: '/', navigate() {},
  api: { invokeFirstPartyHarness: invoke, getSnapshot: async () => ({ preferences: Object.fromEntries(preferences) }), savePreference: async (key, value) => { preferences.set(key, value) } },
}
const parentHtml = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe id="app" src="/app/index.html" sandbox="allow-scripts allow-forms allow-downloads" allow="clipboard-write"></iframe><script>
const app=document.getElementById('app');app.addEventListener('load',()=>{const channel=new MessageChannel();window.fixturePort=channel.port1;channel.port1.onmessage=async event=>{const data=event.data;if(data.type!=='mira:request')return;try{const response=await fetch('/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});channel.port1.postMessage({type:'mira:response',id:data.id,...await response.json()})}catch(error){channel.port1.postMessage({type:'mira:response',id:data.id,ok:false,error:{message:error.message}})}};app.contentWindow.postMessage({type:'mira:connect',apiVersion:{major:1}},'*',[channel.port2]);window.theme=theme=>channel.port1.postMessage({type:'mira:context',context:{theme}});window.watch=(paths=['src'])=>channel.port1.postMessage({type:'mira:harness-event',event:{type:'workspace-files-changed',sessionId:'git-fixture',payload:{watchId:'git-fixture-watch',directory:${JSON.stringify(project)},paths}}});window.refreshSession=()=>channel.port1.postMessage({type:'mira:harness-event',event:{type:'status',sessionId:'git-fixture',payload:{state:'idle'}}})})</script>`
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
  await page.addInitScript(() => {
    window.miraFixtureCopiedPaths = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.miraFixtureCopiedPaths.push(text) } } })
  })
  page.on('pageerror', error => pageErrors.push(error.message))
  page.setDefaultTimeout(12_000)
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const frame = page.frameLocator('#app')
  await frame.locator('.mira-session-row__open[aria-current="page"]').waitFor()
  await frame.getByRole('button', { name: '查看文件', exact: true }).click()
  const drawer = frame.locator('.mira-file-drawer')
  const row = path => drawer.locator(`[data-file-tree-path="${path}"]`)
  const query = drawer.getByRole('textbox', { name: '搜索文件', exact: true })
  const tree = drawer.getByRole('tree')
  const allFiles = () => drawer.getByRole('button', { name: '显示全部文件', exact: true })
  const changedFiles = () => drawer.getByRole('button', { name: '只看变更', exact: true })
  const methodCalls = method => requests.filter(request => request.method === `harness.${method}`)
  const statusCalls = () => methodCalls('files.git-status').length
  const waitFor = async predicate => { for (let attempt = 0; attempt < 140; attempt++) { if (await predicate()) return; await page.waitForTimeout(50) }; assert.fail('Fixture condition timed out') }
  const status = async (path, expected) => { await row(path).locator(`[data-file-git-status="${expected}"]`).waitFor() }
  const capture = async name => {
    await drawer.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.waitForTimeout(250)
    const state = await frame.locator('html').evaluate(html => ({ dark: html.classList.contains('dark'), alerts: [...html.querySelectorAll('.mira-file-drawer [role="alert"]')].map(alert => alert.textContent), selectedPath: html.querySelector('[data-file-tree-path][aria-selected="true"]')?.getAttribute('data-file-tree-path'), changedOnly: html.querySelector('.mira-file-drawer [aria-pressed]')?.getAttribute('aria-pressed') }))
    const screenshot = await page.screenshot({ path: resolve(evidence, name), animations: 'disabled' })
    const pixel = await sharp(screenshot).extract({ left: 640, top: 200, width: 1, height: 1 }).removeAlpha().raw().toBuffer()
    assert.ok(state.dark ? pixel[0] < 40 : pixel[0] > 230, `Stale theme capture ${name}`)
    record('capture', { name, type: 'headless-react-fixture-not-electron', ...state, threadPixel: [...pixel] })
  }
  const assertFilterOn = async () => assert.equal(await allFiles().getAttribute('aria-pressed'), 'true')
  const probeDeletedMenuRefresh = async screenshotName => {
    await row('root-deleted.md').click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '复制相对路径', exact: true }).waitFor()
    heldStatusStarted = false; holdStatus = true
    await page.evaluate(() => window.watch(['']))
    await waitFor(() => heldStatusStarted)
    await page.waitForTimeout(100)
    const during = { deletedRowPresent: await row('root-deleted.md').count() === 1, menuPresent: await frame.getByRole('menuitem', { name: '复制相对路径', exact: true }).count() === 1 }
    await capture(screenshotName)
    let copiedDuringLoading = false
    if (during.deletedRowPresent && during.menuPresent) {
      await frame.getByRole('menuitem', { name: '复制相对路径', exact: true }).click()
      copiedDuringLoading = (await frame.locator('html').evaluate(() => window.miraFixtureCopiedPaths)).at(-1) === 'root-deleted.md'
    }
    releaseStatus(); releaseStatus = undefined
    await status('root-deleted.md', 'deleted')
    const passed = during.deletedRowPresent && during.menuPresent && copiedDuringLoading
    record('deleted-menu-during-refresh', { ...during, copiedDuringLoading, passed, statusHeldUntilAfterCopy: true, notification: 'explicit-protocol-fixture-not-native-watch' })
    if (!passed) interactionFailures.push('deleted-menu-during-refresh')
  }
  const selectSession = async title => {
    await drawer.getByRole('button', { name: '返回任务', exact: true }).click()
    await frame.getByRole('button', { name: title, exact: true }).click()
    await frame.getByRole('button', { name: '查看文件', exact: true }).click()
  }
  await row('src').locator('[data-file-git-dot="modified"]').waitFor()
  if (baseline) {
    const missing = { rootDeletedRowMissing: await row('root-deleted.md').count() === 0, changedOnlyControlMissing: await changedFiles().count() === 0 }
    assert.equal(missing.rootDeletedRowMissing, true)
    assert.equal(missing.changedOnlyControlMissing, true)
    await capture('baseline-old-production.png')
    record('baseline-confirmed-missing-capability', { ...missing, expectedFailure: true, sourceReverted: false })
  } else if (menuProbe) {
    await status('root-deleted.md', 'deleted')
    await page.waitForTimeout(600)
    await probeDeletedMenuRefresh('mira-menu-refresh-before-fix.png')
  } else {
    await status('root-deleted.md', 'deleted'); await status('root-deleted.png', 'deleted')
    assert.match(await row('root-deleted.md').getAttribute('aria-label'), /已删除/)
    assert.equal(await row('absent').count(), 0)
    assert.equal(await row('unloaded/deleted.md').count(), 0)
    assert.equal(methodCalls('files.list').some(call => call.params.path === 'unloaded'), false)
    await row('gone').click(); await status('gone/deleted.md', 'deleted')
    await row('unloaded').click(); await status('unloaded/deleted.md', 'deleted')
    await row('src').click()
    for (const [path, expected] of [['src/modified.ts', 'modified'], ['src/renamed.ts', 'renamed'], ['src/staged.ts', 'added'], ['src/untracked.ts', 'untracked']]) await status(path, expected)
    await row('src/token.secret').locator('[data-file-git-color="ignored"]').waitFor()
    await row('cache').locator('[data-file-git-color="ignored"]').waitFor()
    await page.waitForTimeout(600)
    record('deleted-loaded-parent-overlay', { rootDeletedVisible: true, nestedDeletedAfterParentLoaded: true, unloadedParentNotScanned: true, absentAncestorNotCreated: true })

    const readsBeforeDeleted = methodCalls('files.read').length
    const previewsBeforeDeleted = await frame.locator('.mira-file-preview').count()
    await row('root-deleted.md').click(); await row('root-deleted.md').press('Enter'); await row('root-deleted.md').press('Space')
    assert.equal(await row('root-deleted.md').getAttribute('aria-selected'), 'true')
    assert.equal(methodCalls('files.read').length, readsBeforeDeleted)
    assert.equal(await frame.locator('.mira-file-preview').count(), previewsBeforeDeleted)
    await row('root-deleted.md').click({ button: 'right' })
    assert.equal(await frame.getByRole('menuitem', { name: '打开', exact: true }).getAttribute('aria-disabled'), 'true')
    assert.equal(await frame.getByRole('menuitem', { name: '打开方式', exact: true }).getAttribute('aria-disabled'), 'true')
    await capture('mira-deleted-context-light.png')
    await frame.getByRole('menuitem', { name: '复制相对路径', exact: true }).click()
    assert.deepEqual(await frame.locator('html').evaluate(() => window.miraFixtureCopiedPaths), ['root-deleted.md'])
    await row('root-deleted.md').click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '复制绝对路径', exact: true }).click()
    assert.equal((await frame.locator('html').evaluate(() => window.miraFixtureCopiedPaths)).at(-1), resolve(project, 'root-deleted.md'))
    await row('root-deleted.md').click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '加入对话', exact: true }).click()
    await frame.getByRole('button', { name: '移除 root-deleted.md', exact: true }).waitFor()
    assert.equal(methodCalls('files.read').length, readsBeforeDeleted)
    await frame.getByRole('button', { name: '移除 root-deleted.md', exact: true }).click()
    assert.equal(await frame.getByRole('button', { name: '移除 root-deleted.md', exact: true }).count(), 0)
    await row('root-deleted.png').click({ button: 'right' })
    assert.equal(await frame.getByRole('menuitem', { name: '加入对话', exact: true }).getAttribute('aria-disabled'), 'true')
    await frame.getByRole('menuitem', { name: '复制相对路径', exact: true }).press('Escape')
    assert.equal(methodCalls('files.open-editor').length, 0)
    record('deleted-safe-interactions', { clickEnterSpaceReadDelta: 0, previewsAdded: 0, openDisabled: true, openWithDisabled: true, clipboard: 'iframe-stub-only-no-native-clipboard', nonBitmapReferenceChipAddedAndRemoved: true, bitmapReferenceDisabled: true, editorFixture: 'VS Code' })
    await probeDeletedMenuRefresh('mira-menu-refresh-confirmed.png')

    await row('src/modified.ts').click()
    await frame.locator('.mira-file-preview:visible [role="region"]').waitFor()
    const expandedBefore = await tree.locator('[aria-expanded="true"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-file-tree-path')))
    await changedFiles().click(); await assertFilterOn()
    for (const path of ['src', 'gone', 'unloaded', 'root-deleted.md', 'src/modified.ts', 'gone/deleted.md', 'unloaded/deleted.md']) await row(path).waitFor()
    for (const path of ['bulk', 'cache', '.git', '.gitignore', 'root-clean.txt', 'src/clean.ts', 'src/token.secret', 'gone/keep.md', 'unloaded/keep.md']) assert.equal(await row(path).count(), 0, `${path} should not be in changed-only tree`)
    assert.equal(await row('src/modified.ts').getAttribute('aria-selected'), 'true')
    assert.deepEqual(await tree.locator('[aria-expanded="true"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-file-tree-path'))), expandedBefore)
    const accessibleRows = await tree.locator('[data-file-tree-path]').evaluateAll(elements => elements.map(element => ({ path: element.getAttribute('data-file-tree-path'), level: Number(element.getAttribute('aria-level')), position: Number(element.getAttribute('aria-posinset')), siblings: Number(element.getAttribute('aria-setsize')), height: element.getBoundingClientRect().height })))
    assert.ok(accessibleRows.every(item => item.height === 28 && item.position >= 1 && item.position <= item.siblings))
    assert.equal(accessibleRows.find(item => item.path === 'src/modified.ts').level, 2)
    await capture('mira-changed-light.png')
    await page.evaluate(() => window.theme('dark')); await frame.locator('html.dark').waitFor()
    await capture('mira-changed-dark.png')
    record('changed-only-tree', { cleanAndIgnoredExcluded: true, ancestorHierarchyPreserved: true, expansionAndSelectionRetained: true, accessibleRows })

    await query.fill('src/modified'); await status('src/modified.ts', 'modified'); await assertFilterOn()
    await row('src/modified.ts').click()
    await allFiles().click(); assert.equal(await query.inputValue(), 'src/modified')
    assert.equal(await row('src/modified.ts').getAttribute('aria-selected'), 'true')
    await changedFiles().click(); await assertFilterOn(); assert.equal(await query.inputValue(), 'src/modified')
    await query.fill('src/clean'); await drawer.getByRole('status').filter({ hasText: '没有匹配的变更文件' }).waitFor()
    await allFiles().click(); await row('src/clean.ts').waitFor()
    await changedFiles().click(); await drawer.getByRole('status').filter({ hasText: '没有匹配的变更文件' }).waitFor()
    await query.fill('root-deleted'); await drawer.getByRole('status').filter({ hasText: '没有匹配的变更文件' }).waitFor()
    await allFiles().click(); await drawer.getByRole('status').filter({ hasText: '没有匹配的文件' }).waitFor()
    await changedFiles().click(); await query.fill('src'); await row('src/modified.ts').waitFor()
    assert.equal(await row('src').count(), 0, 'Search filtering uses direct status, not descendant dots')
    await query.fill(''); await row('src/modified.ts').waitFor()
    assert.equal(await row('src').getAttribute('aria-expanded'), 'true')
    record('search-and-changed-only', { queryAndSelectionRetainedOnToggle: true, searchUsesDirectStatus: true, cleanSearchFiltered: true, deletedNamesNotIndexed: 'upstream-matching-real-files-only-limit', expansionRetainedAfterSearch: true })

    await query.fill('src/modified'); await row('src/modified.ts').waitFor()
    heldStatusStarted = false; holdStatus = true
    const manualBefore = statusCalls()
    await drawer.getByRole('button', { name: '刷新文件', exact: true }).click()
    await waitFor(() => heldStatusStarted)
    await assertFilterOn()
    await drawer.getByRole('status').filter({ hasText: '正在读取 Git 状态' }).waitFor()
    releaseStatus(); releaseStatus = undefined
    await status('src/modified.ts', 'modified'); await assertFilterOn()
    assert.ok(statusCalls() > manualBefore)
    assert.equal(await query.inputValue(), 'src/modified')
    assert.equal(await row('src/modified.ts').getAttribute('aria-selected'), 'true')
    await query.fill(''); await row('src/modified.ts').waitFor()
    assert.equal(await row('src').getAttribute('aria-expanded'), 'true')
    await writeFile(resolve(project, 'src/watch-new.ts'), 'export const miraWatch = true\n')
    await row('src/modified.ts').focus()
    const focusBeforeWatch = await frame.locator('html').evaluate(() => ({ path: document.activeElement?.getAttribute('data-file-tree-path'), tag: document.activeElement?.tagName }))
    assert.equal(focusBeforeWatch.path, 'src/modified.ts')
    heldStatusStarted = false; holdStatus = true
    await page.evaluate(() => window.watch())
    await waitFor(() => heldStatusStarted); await assertFilterOn()
    await drawer.getByRole('status').filter({ hasText: '正在读取 Git 状态' }).waitFor()
    const focusDuringWatch = await frame.locator('html').evaluate(() => ({ path: document.activeElement?.getAttribute('data-file-tree-path'), tag: document.activeElement?.tagName }))
    releaseStatus(); releaseStatus = undefined
    await status('src/watch-new.ts', 'untracked'); await assertFilterOn()
    await page.waitForTimeout(100)
    const focusAfterWatch = await frame.locator('html').evaluate(() => ({ path: document.activeElement?.getAttribute('data-file-tree-path'), tag: document.activeElement?.tagName }))
    await page.keyboard.press('ArrowDown')
    const focusAfterArrow = await frame.locator('html').evaluate(() => ({ path: document.activeElement?.getAttribute('data-file-tree-path'), tag: document.activeElement?.tagName }))
    const watchKeyboardContinues = focusAfterWatch.path === 'src/modified.ts' && Boolean(focusAfterArrow.path) && focusAfterArrow.path !== focusAfterWatch.path
    if (!watchKeyboardContinues) interactionFailures.push('changed-only-watch-tree-focus')
    record('watch-tree-focus', { focusBeforeWatch, focusDuringWatch, focusAfterWatch, focusAfterArrow, passed: watchKeyboardContinues })
    record('refresh-retains-changed-only', { manualRefresh: true, loadingKeepsFilterPressed: true, queryRetained: true, watchRefresh: 'explicit-protocol-fixture-not-native-fs-watch', selectionAndExpandedRetained: true })

    gitFailure = true
    await drawer.getByRole('button', { name: '刷新文件', exact: true }).click()
    await drawer.getByRole('alert').filter({ hasText: 'Git 状态读取超时' }).waitFor()
    await row('src/clean.ts').waitFor(); assert.equal(await allFiles().count(), 0); assert.equal(await changedFiles().count(), 0)
    await capture('mira-filter-error-dark.png')
    gitFailure = false
    await drawer.getByRole('button', { name: '重试读取 Git 状态', exact: true }).click()
    await status('src/modified.ts', 'modified'); await changedFiles().waitFor()
    assert.equal(await changedFiles().getAttribute('aria-pressed'), 'false')
    assert.equal(await drawer.getByRole('alert').count(), 0)
    record('failure-and-retry', { ordinaryTreeRestoredOnFailure: true, errorIsSafeBridgeMapping: true, retryRestoresGitNotOldFilter: true })

    await changedFiles().click(); await assertFilterOn()
    heldStatusStarted = false; holdStatus = true
    await drawer.getByRole('button', { name: '刷新文件', exact: true }).click()
    await waitFor(() => heldStatusStarted)
    await selectSession('Mira 非仓库验收夹具'); await row('plain.txt').waitFor()
    releaseStatus(); releaseStatus = undefined
    await waitFor(() => methodCalls('files.git-status').some(call => call.params.sessionId === 'plain-fixture'))
    await page.waitForTimeout(300)
    assert.equal(await changedFiles().count(), 0); assert.equal(await allFiles().count(), 0)
    assert.equal(await drawer.locator('[data-file-git-status], [data-file-git-dot]').count(), 0)
    assert.equal(await drawer.getByRole('alert').count(), 0)
    await capture('mira-filter-nonrepo.png')
    await selectSession('Mira 干净仓库验收夹具'); await row('clean.txt').waitFor(); await changedFiles().click()
    await drawer.getByRole('status').filter({ hasText: '没有变更文件' }).waitFor(); await assertFilterOn()
    await capture('mira-filter-clean-empty.png')
    await selectSession('Mira Git 筛选验收夹具'); await changedFiles().waitFor()
    assert.equal(await changedFiles().getAttribute('aria-pressed'), 'false')
    record('session-and-nonrepo', { nonrepoNoFilterNoError: true, cleanRepoChangedEmptyState: true, sessionSwitchResetsFilter: true, staleOldSessionDiscarded: true })

    await changedFiles().click(); await assertFilterOn()
    sessions[0].projectId = undefined; sessions[0].workingDirectory = clean
    await page.evaluate(() => window.refreshSession())
    await row('clean.txt').waitFor(); await changedFiles().waitFor()
    assert.equal(await changedFiles().getAttribute('aria-pressed'), 'false')
    assert.equal(await row('root-deleted.md').count(), 0)
    record('same-session-root-change', { sessionIdUnchanged: true, directoryChangedToCleanFixture: true, filterReset: true, staleDeletedRowsRemoved: true })
    sessions[0].projectId = 'git-project'; sessions[0].workingDirectory = project
    await page.evaluate(() => window.refreshSession())
    await status('root-deleted.md', 'deleted'); await changedFiles().click(); await assertFilterOn()
    await page.evaluate(() => window.theme('light')); await frame.locator('html:not(.dark)').waitFor()
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1710, height: 992 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport)
      await capture(`mira-filter-desktop-${viewport.width}.png`)
      const bounds = await drawer.evaluate(element => { const rect = element.getBoundingClientRect(); return { width: rect.width, right: rect.right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, iconBounds: [...element.querySelectorAll('.mira-file-drawer__header button')].map(button => { const rect = button.getBoundingClientRect(); return { x: rect.x, right: rect.right, y: rect.y, height: rect.height, width: rect.width } }) } })
      assert.equal(bounds.width, 264); assert.equal(bounds.scrollWidth, bounds.clientWidth)
      assert.ok(bounds.iconBounds.every(button => button.width === 28 && button.height === 28 && button.right <= bounds.right))
      const canvas = await frame.locator('html').evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }))
      assert.ok(canvas.scrollWidth <= canvas.clientWidth && canvas.scrollHeight <= canvas.clientHeight)
      record('desktop-viewport', { viewport, ...bounds, canvas })
    }
    await allFiles().click(); await row('bulk').click(); await page.waitForTimeout(600)
    const callsBeforeScroll = statusCalls(); await tree.evaluate(element => { element.scrollTop = 4_000 }); await page.waitForTimeout(300)
    assert.equal(statusCalls(), callsBeforeScroll)
    assert.ok(await drawer.locator('[data-file-tree-path]').count() < 100)
    const batches = methodCalls('files.git-ignored').map(call => call.params.paths.length)
    assert.ok(batches.every(size => size <= 512))
    record('virtualization-retained', { mountedRows: await drawer.locator('[data-file-tree-path]').count(), noStatusPollOnScroll: true, ignoredBatchMaximum: Math.max(...batches) })
  }
  assert.equal(pageErrors.length, 0)
  assert.deepEqual(interactionFailures, [], 'Headless interaction acceptance failures')
  record('result', { passed: true, mode: verificationMode, browserVersion: browser.version(), pageErrors, desktopMouseKeyboard: false, electronGrant: 'unit-tests-only', watch: 'protocol-fixture-only', clipboard: 'iframe-stub-only', projectsAreIsolated: true })
} catch (error) { record('result', { passed: false, mode: verificationMode, error: error.stack, pageErrors }); throw error }
finally {
  releaseStatus?.()
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  await writeFile(resolve(evidence, baseline ? 'baseline-results.json' : menuProbe ? 'menu-refresh-before-fix.json' : 'results.json'), JSON.stringify({ checks, requests, pageErrors, interactionFailures }, null, 2))
  await rm(fixture, { recursive: true, force: true })
}
