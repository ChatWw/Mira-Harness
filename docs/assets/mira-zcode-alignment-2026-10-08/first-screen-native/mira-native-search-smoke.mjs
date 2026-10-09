import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const evidence = dirname(fileURLToPath(import.meta.url)), repository = resolve(evidence, '../../../..')
const home = await realpath(process.argv[2])
const sidebarMode = process.argv[3] === 'sidebar'
assert.match(home, /^\/private\/tmp\/mira-first-screen-native-[A-Za-z0-9]+$/)
await stat(resolve(home, '.mira/state.sqlite'))
const helper = '/private/tmp/mira-zcode-cu'
const cdp = resolve(repository, 'docs/assets/mira-zcode-alignment-2026-10-08/watch-editor-scripts/mira-cdp.mjs')
const nativeAct = resolve(repository, 'docs/assets/mira-zcode-alignment-2026-10-08/watch-editor-scripts/mira-act.mjs')
const pause = ms => new Promise(done => setTimeout(done, ms))
const records = [], captures = []
const front = () => JSON.parse(execFileSync(helper, ['frontmost'], { encoding: 'utf8' }))
const originalFront = front()
const windows = JSON.parse(execFileSync(helper, ['windows', 'Electron'], { encoding: 'utf8' }))
const ownWindows = windows.filter(item => item.kCGWindowLayer === 0 && item.kCGWindowName?.includes('Mira') && item.kCGWindowBounds.Width > 500)
assert.equal(ownWindows.length, 1)
const own = ownWindows[0]
const processArgs = execFileSync('/bin/ps', ['-p', String(own.kCGWindowOwnerPID), '-o', 'args='], { encoding: 'utf8' })
assert.ok(processArgs.includes(repository + '/node_modules/electron/dist/Electron.app/'))
assert.ok(processArgs.includes('--remote-debugging-port=9222'))
const report = { startedAt: new Date().toISOString(), home, window: own, originalFront, boundary: 'Native macOS clicks and Unicode key input on isolated unpackaged Mira. Real Vue Shell, production React opaque iframe, MessageChannel and Electron preload/IPC. This search test does not run models/scheduler, install market packages, prove ZCode same-state visuals or performance. Legacy /novel is platform fallback only, not the independent Mira Novel Studio implementation.', passed: false, records, captures }

function inspect(expression, target = 'iframe') {
  const result = JSON.parse(execFileSync(process.execPath, [cdp, target, 'evaluate', expression], { encoding: 'utf8', timeout: 8000 }))
  if (result.result.exceptionDetails) throw Error(result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text)
  return result.result.result.value
}
async function until(expression, target = 'iframe') {
  const end = Date.now() + 12000
  while (Date.now() < end) {
    try { if (inspect(expression, target)) return } catch { /* Target can be mounting after actual navigation. */ }
    await pause(100)
  }
  throw Error(`Timed out: ${expression}`)
}
function allowedForeground() {
  const active = front()
  assert.ok([originalFront.pid, own.kCGWindowOwnerPID].includes(active.pid), 'User moved to another app; stop native input')
}
function focus() {
  allowedForeground()
  execFileSync(helper, ['focus', String(own.kCGWindowOwnerPID)])
  execFileSync('/usr/bin/osascript', ['-e', `tell application "System Events" to set frontmost of first process whose unix id is ${own.kCGWindowOwnerPID} to true`])
  assert.equal(front().pid, own.kCGWindowOwnerPID)
}
function act(selector, target = 'iframe') {
  focus()
  const result = JSON.parse(execFileSync(process.execPath, [nativeAct, target === 'page' ? 'page:' + selector : selector], { encoding: 'utf8', timeout: 12000 }))
  assert.equal(front().pid, own.kCGWindowOwnerPID)
  records.push({ at: new Date().toISOString(), nativeClick: result })
}
function key(name, ...modifiers) {
  assert.equal(front().pid, own.kCGWindowOwnerPID)
  execFileSync(helper, ['key', name, ...modifiers])
}
function type(text) {
  assert.equal(front().pid, own.kCGWindowOwnerPID)
  execFileSync(helper, ['type', text])
}
function record(name, details = {}) { records.push({ name, at: new Date().toISOString(), ...details }); console.log(name) }
async function capture(name) {
  focus(); await pause(200)
  const path = resolve(evidence, name + '.png')
  execFileSync('/usr/sbin/screencapture', ['-x', '-l', String(own.kCGWindowNumber), path])
  assert.equal(front().pid, own.kCGWindowOwnerPID)
  captures.push({ name, sha256: createHash('sha256').update(await readFile(path)).digest('hex'), at: new Date().toISOString() })
}
async function harness() {
  inspect("location.hash='/workspace/harness-react';true", 'page')
  await until("!!document.querySelector('.mira-session-actions') || !!document.querySelector('button[aria-label=会话]')")
  if (!inspect("!!document.querySelector('.mira-session-actions')")) act('button[aria-label="会话"]')
  await until("!!document.querySelector('.mira-session-actions')")
}
const preferences = () => inspect('(async()=> (await window.platform.getSnapshot()).preferences["first-party.mira-harness.session-drawer"])()', 'page')
async function sidebarChecks() {
  if (inspect("!!document.querySelector('[aria-label=任务时间线]')")) {
    act('button[aria-label="任务视图选项"]')
    act('[role="menuitemradio"] >> 按项目')
    await until("!document.querySelector('[aria-label=任务时间线]')")
  }
  act('.mira-session-row__open >> 首屏验收会话')
  await until("document.querySelector('.mira-thread-header')?.innerText.includes('首屏验收会话') || document.querySelector('.pilot-task-title')?.innerText.includes('首屏验收会话') || !!document.querySelector('.mira-session-row.is-active')")
  const activeId = inspect('(async()=> (await window.platform.getSnapshot()).preferences["first-party.mira-harness.active-session"])()', 'page')
  act('button[aria-label="全部折叠"]')
  await until("!!document.querySelector('button[aria-label=全部展开]')")
  const collapsed = preferences()
  assert.equal(collapsed.expandedProjectIds.length, 0)
  assert.equal(collapsed.collapsedProjectIds.length, 1)
  record('native-bulk-collapse-saves-explicit-project-state', { activeId, collapsed })
  focus(); key('r', 'cmd')
  await until("!!document.querySelector('button[aria-label=全部展开]')")
  assert.deepEqual(preferences().collapsedProjectIds, collapsed.collapsedProjectIds)
  assert.equal(inspect('(async()=> (await window.platform.getSnapshot()).preferences["first-party.mira-harness.active-session"])()', 'page'), activeId)
  record('native-reload-keeps-active-project-explicitly-collapsed')
  act('button[aria-label="全部展开"]')
  await until("!!document.querySelector('button[aria-label=全部折叠]')")
  act('button[aria-label="任务视图选项"]')
  await until("!!document.querySelector('[role=menuitemradio][data-state=unchecked]')")
  act('[role="menuitemradio"] >> 时间线')
  await until("!!document.querySelector('[aria-label=任务时间线]')")
  assert.equal(preferences().projectView, 'timeline')
  assert.equal(inspect("document.querySelectorAll('.mira-session-view button').length"), 2)
  assert.equal(inspect("document.querySelectorAll('.mira-session-row--timeline').length"), 1)
  assert.equal(inspect("document.querySelector('.mira-session-row__project')?.innerText"), 'Mira 首屏原生验收')
  assert.equal(inspect("getComputedStyle(document.querySelector('.mira-session-row--timeline .mira-session-row__open')).height"), '42px')
  assert.equal(inspect("!!document.querySelector('button[aria-label=全部折叠]')"), false)
  record('native-timeline-two-tabs-project-source-and-real-row-size')
  await capture('sidebar-timeline-native-light')
  act('button[aria-label="查看已归档任务"]')
  await until("!!document.querySelector('button[aria-label=\"恢复 归档恢复验收\"]')")
  act('button[aria-label="恢复 归档恢复验收"]')
  await until("!document.querySelector('button[aria-label=\"恢复 归档恢复验收\"]')")
  const restored = inspect('(async()=> (await window.platform.listHarnessSessions()).some(s=>s.title==="归档恢复验收"))()', 'page')
  assert.ok(restored)
  act('button[aria-label="返回任务列表"]')
  await until("document.querySelectorAll('.mira-session-row--timeline').length===2")
  record('native-archive-restore-through-real-query-and-ipc')
  act('.mira-session-view button >> 分组')
  act('button[aria-label="新建分组"]')
  await until("!!document.querySelector('input[aria-label=重命名分组]')")
  type('首屏独立分组')
  key('enter')
  await until("[...document.querySelectorAll('.mira-collection-title')].some(e=>e.innerText==='首屏独立分组')")
  act('button[aria-label="全部折叠"]')
  await until("!!document.querySelector('button[aria-label=全部展开]')")
  assert.equal(preferences().groups[0].collapsed, true)
  record('native-group-bulk-collapse-keeps-project-view-independent')
  await capture('sidebar-group-collapsed-native-light')
  act('.mira-session-view button >> 项目')
  await until("document.querySelectorAll('.mira-session-row--timeline').length===2")
  assert.equal(preferences().projectView, 'timeline')
  record('native-group-project-return-keeps-timeline-and-active-session')
  assert.equal(inspect('(async()=> (await window.platform.getSnapshot()).preferences["first-party.mira-harness.active-session"])()', 'page'), activeId)
  await capture('sidebar-restored-native-light')
}

try {
  assert.notEqual(originalFront.bundle, 'com.apple.loginwindow')
  const url = inspect('location.href', 'page')
  assert.ok(url.startsWith('file://' + resolve(repository, 'out/renderer/index.html')))
  report.artifacts = []
  for (const path of ['dist/harness-react-app/app.js', 'dist/harness-react-app/app.css', 'out/main/main.js', 'out/preload/preload.mjs']) report.artifacts.push({ path, sha256: createHash('sha256').update(await readFile(resolve(repository, path))).digest('hex') })
  await harness()
  if (inspect("!!document.querySelector('[role=dialog]')")) act('button[aria-label="关闭全局搜索"]')
  if (sidebarMode) {
    await sidebarChecks()
    report.passed = true
  } else {
  act('button[aria-label="搜索会话"]')
  await until("!!document.querySelector('.mira-command-center') && document.activeElement?.getAttribute('aria-label')==='搜索命令、对话和文件'")
  assert.equal(inspect("document.querySelectorAll('.mira-command-center').length"), 1)
  assert.equal(inspect("document.querySelectorAll('.el-dialog.search-dialog').length", 'page'), 0)
  record('sidebar-opens-one-react-search-dialog')
  await capture('sidebar-search-native-light')
  key('escape')
  await until("!document.querySelector('.mira-command-center')")

  act('button[aria-label="全局搜索"]', 'page')
  await until("!!document.querySelector('.mira-command-center') && document.activeElement?.getAttribute('aria-label')==='搜索命令、对话和文件'")
  assert.equal(inspect("document.querySelectorAll('.mira-command-center').length"), 1)
  assert.equal(inspect("document.querySelectorAll('.el-dialog.search-dialog').length", 'page'), 0)
  record('shell-search-opens-same-react-component-without-vue-dialog')
  await capture('shell-search-native-light')
  key('escape'); await until("!document.querySelector('.mira-command-center')")

  act('button[aria-label="新建任务"]')
  await until("document.querySelector('textarea[aria-label=任务内容]')?.checkVisibility()")
  act('textarea[aria-label="任务内容"]')
  type('Native search draft preserved')
  await until("document.querySelector('textarea[aria-label=任务内容]').value==='Native search draft preserved'")
  key('k', 'cmd')
  await until("!!document.querySelector('.mira-command-center')")
  type('自动化')
  await until("document.querySelector('.mira-command-center-input input').value==='自动化'")
  key('escape')
  await until("!document.querySelector('.mira-command-center')")
  assert.equal(inspect("document.querySelector('textarea[aria-label=任务内容]').value"), 'Native search draft preserved')
  record('native-cmd-k-unicode-search-escape-retains-composer-draft')

  inspect("location.hash='/novel';true", 'page')
  await until("location.hash==='#/novel' && !!document.querySelector('.mira-shell') && !document.querySelector('.harness-react-host')", 'page')
  act('button[aria-label="全局搜索"]', 'page')
  await until("[...document.querySelectorAll('.el-dialog.search-dialog')].some(e=>e.checkVisibility())", 'page')
  assert.ok(inspect("document.querySelector('.el-dialog.search-dialog').innerText.includes('系统操作')", 'page'))
  record('legacy-novel-shell-opens-platform-search-not-harness')
  await capture('novel-platform-search-native-light')
  key('escape')
  await until("![...document.querySelectorAll('.el-dialog.search-dialog')].some(e=>e.checkVisibility())", 'page')
  await harness()
  await until("document.querySelector('textarea[aria-label=任务内容]')?.value==='Native search draft preserved'")
  record('real-route-leave-return-restores-harness-draft')
  report.passed = true
  }
} catch (cause) {
  report.error = cause.stack
  if (front().pid === own.kCGWindowOwnerPID) await capture('failure-native')
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(evidence, sidebarMode ? 'sidebar-results.json' : 'search-results.json'), JSON.stringify(report, null, 2) + '\n')
  if (front().pid === own.kCGWindowOwnerPID && originalFront.pid !== own.kCGWindowOwnerPID) execFileSync(helper, ['focus', String(originalFront.pid)])
  console.log(JSON.stringify({ passed: report.passed, records: records.length, captures: captures.length, error: report.error }))
}
