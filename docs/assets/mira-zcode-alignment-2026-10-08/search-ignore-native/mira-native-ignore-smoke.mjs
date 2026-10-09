import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, realpath, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const evidence = dirname(fileURLToPath(import.meta.url))
const repository = resolve(evidence, '../../../..')
const home = await realpath(process.argv[2])
assert.match(home, /^\/private\/tmp\/mira-native-ignore-[A-Za-z0-9]+$/)
await stat(resolve(home, '.mira/state.sqlite'))
const root = resolve(home, 'project')
const helper = '/private/tmp/mira-zcode-cu'
const cdpScript = resolve(repository, 'docs/assets/mira-zcode-alignment-2026-10-08/watch-editor-scripts/mira-cdp.mjs')
const actScript = resolve(repository, 'docs/assets/mira-zcode-alignment-2026-10-08/watch-editor-scripts/mira-act.mjs')
const records = []
const captures = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

function inspect(expression, target = 'page') {
  const result = JSON.parse(execFileSync(process.execPath, [cdpScript, target, 'evaluate', expression], { encoding: 'utf8', timeout: 8000 }))
  if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text)
  return result.result.result.value
}
async function until(expression, target = 'page') {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    try { if (inspect(expression, target)) return } catch { /* The renderer/iframe may still be mounting. */ }
    await pause(100)
  }
  throw new Error(`Timed out: ${expression}`)
}
function window() {
  const items = JSON.parse(execFileSync(helper, ['windows', 'Electron'], { encoding: 'utf8' }))
  const windows = items.filter(item => item.kCGWindowLayer === 0 && item.kCGWindowName?.includes('Mira') && item.kCGWindowBounds.Width > 500)
  assert.equal(windows.length, 1)
  return windows[0]
}
function frontmost(pid) {
  const front = JSON.parse(execFileSync(helper, ['frontmost'], { encoding: 'utf8' }))
  assert.equal(front.pid, pid, 'Only operate on the isolated Mira foreground window')
}
function focus(own) {
  execFileSync(helper, ['focus', String(own.kCGWindowOwnerPID)])
  execFileSync('/usr/bin/osascript', ['-e', `tell application "System Events" to set frontmost of first process whose unix id is ${own.kCGWindowOwnerPID} to true`])
}
function act(selector, target = 'page') {
  const own = window()
  focus(own)
  frontmost(own.kCGWindowOwnerPID)
  const output = JSON.parse(execFileSync(process.execPath, [actScript, target === 'page' ? 'page:' + selector : selector], { encoding: 'utf8', timeout: 12000 }))
  frontmost(own.kCGWindowOwnerPID)
  records.push({ action: 'native-click', ...output })
}
function key(name, ...modifiers) {
  frontmost(window().kCGWindowOwnerPID)
  execFileSync(helper, ['key', name, ...modifiers])
}
function type(value) {
  frontmost(window().kCGWindowOwnerPID)
  execFileSync(helper, ['type', value], { timeout: 30000 })
}
async function draft(value) {
  act('.search-ignore__editor textarea')
  key('a', 'cmd')
  key('backspace')
  type(value)
  await until(`document.querySelector('.search-ignore__editor textarea').value===${JSON.stringify(value)}`)
}
function record(name, details = {}) { records.push({ name, at: new Date().toISOString(), ...details }) }
async function capture(name) {
  const own = window()
  focus(own)
  await pause(300)
  frontmost(own.kCGWindowOwnerPID)
  const path = resolve(evidence, name + '.png')
  execFileSync('/usr/sbin/screencapture', ['-x', '-l', String(own.kCGWindowNumber), path])
  frontmost(own.kCGWindowOwnerPID)
  captures.push({ name, path, window: own, at: new Date().toISOString() })
}

const result = { startedAt: new Date().toISOString(), home, root, records, captures, passed: false }
try {
  const foreground = JSON.parse(execFileSync(helper, ['frontmost'], { encoding: 'utf8' }))
  if (foreground.bundle === 'com.apple.loginwindow') {
    result.blockedBy = 'macOS-loginwindow'
    throw new Error('Desktop is locked; native input/capture cannot target Mira')
  }
  await mkdir(resolve(root, 'node_modules'), { recursive: true })
  await writeFile(resolve(root, 'needle.md'), '# Mira native file search\n')
  await writeFile(resolve(root, 'node_modules/needle.md'), 'Dependency stays browsable\n')
  await writeFile(resolve(root, '.gitignore'), 'build/\n')
  const shell = inspect('({url:location.href,api:!!window.platform,title:document.title})')
  assert.ok(shell.api)
  assert.ok(shell.url.startsWith('file://' + resolve(repository, 'out/renderer/index.html')))
  // Fixture setup uses the real preload API; user-visible actions below use native input.
  const project = inspect(`window.platform.createHarnessProject(${JSON.stringify({ name: 'Mira native rules', directory: root })})`)
  const session = inspect(`window.platform.createHarnessSession(${JSON.stringify(project.id)})`)
  inspect(`window.platform.renameHarnessSession(${JSON.stringify(session.id)}, 'Mira native search validation')`)
  inspect("location.hash='/settings/file-search?from=/workspace/harness-react';true")
  await until("!!document.querySelector('.search-ignore__editor textarea:not(:disabled)')")
  const initial = inspect("document.querySelector('.search-ignore__editor textarea').value")
  assert.ok(initial.includes('node_modules/'))
  await assert.rejects(readFile(resolve(root, '.miraignore')), { code: 'ENOENT' })
  record('real-preload-template-does-not-write', { projectId: project.id, sessionId: session.id, window: window(), shell })
  await capture('light-template-native')

  const saved = initial + '\nprivate/\n'
  await draft(saved)
  act('.search-ignore__actions button >> 保存')
  await until("document.querySelector('.search-ignore__status').innerText.includes('已保存')")
  assert.equal(await readFile(resolve(root, '.miraignore'), 'utf8'), saved)
  record('native-save-real-ipc-real-file', { bytes: Buffer.byteLength(saved) })

  await draft(saved + 'unsaved/\n')
  act('.settings-nav-item >> 常规')
  await until("document.querySelector('.el-message-box')?.innerText.includes('未保存的修改')")
  act('.el-message-box__btns button >> 继续编辑')
  await until("!document.querySelector('.el-overlay-message-box') || getComputedStyle(document.querySelector('.el-overlay-message-box')).display==='none'")
  assert.ok(inspect("location.hash.includes('/settings/file-search')"))
  assert.equal(inspect("document.querySelector('.search-ignore__editor textarea').value"), saved + 'unsaved/\n')
  record('native-cancel-route-leave-retains-draft')
  act('.search-ignore__actions button >> 撤销修改')
  await until(`document.querySelector('.search-ignore__editor textarea').value===${JSON.stringify(saved)}`)

  act('.settings-nav-item >> 外观')
  await until("!!document.querySelector('.theme-option')")
  act('.theme-option >> 深色')
  await until("document.documentElement.getAttribute('data-theme')==='dark'")
  act('.settings-nav-item >> 文件搜索')
  await until("!!document.querySelector('.search-ignore__editor textarea:not(:disabled)')")
  await draft(saved + 'local-draft/\n')
  await writeFile(resolve(root, '.miraignore'), 'external/\n')
  act('.search-ignore__actions button >> 保存')
  await until("document.querySelector('.search-ignore__error')?.innerText.includes('已被修改')")
  assert.equal(await readFile(resolve(root, '.miraignore'), 'utf8'), 'external/\n')
  assert.equal(inspect("document.querySelector('.search-ignore__editor textarea').value"), saved + 'local-draft/\n')
  record('native-external-conflict-retains-file-and-draft', { error: inspect("document.querySelector('.search-ignore__error').innerText") })
  await capture('dark-conflict-native')

  act('button[aria-label="重新读取规则"]')
  await until("document.querySelector('.el-message-box')?.innerText.includes('未保存的修改')")
  act('.el-message-box__btns button >> 放弃修改')
  await until("document.querySelector('.search-ignore__editor textarea').value==='external/\\n'")
  await draft(saved)
  act('.search-ignore__actions button >> 保存')
  await until("document.querySelector('.search-ignore__status').innerText.includes('已保存')")
  assert.equal(await readFile(resolve(root, '.miraignore'), 'utf8'), saved)
  record('native-reload-and-retry-recovers')

  act('button[aria-label="返回应用"]')
  await until("!!document.querySelector('iframe')")
  await until("!!document.querySelector('.mira-session-row__open')", 'iframe')
  act('.mira-session-row__open >> Mira native search validation', 'iframe')
  await until("!!document.querySelector('button[aria-label=查看文件]')", 'iframe')
  act('button[aria-label="查看文件"]', 'iframe')
  await until("!!document.querySelector('[data-file-tree-path=\"node_modules\"]')", 'iframe')
  record('native-browsing-remains-unfiltered')
  act('input[aria-label="搜索文件"]', 'iframe')
  type('needle')
  await until("document.querySelector('[role=tree]')?.getAttribute('aria-busy')==='false' && !!document.querySelector('[data-file-tree-path=\"needle.md\"]')", 'iframe')
  assert.ok(!inspect("!!document.querySelector('[data-file-tree-path=\"node_modules/needle.md\"]')", 'iframe'))
  record('native-react-search-respects-saved-rules', { frame: inspect('({url:location.href,timeOrigin:performance.timeOrigin,overflow:document.documentElement.scrollWidth>innerWidth})', 'iframe') })
  act('[data-file-tree-path="needle.md"]', 'iframe')
  await until("document.querySelector('.pilot-panel-view.is-active .mira-file-preview')?.innerText.includes('Mira native file search')", 'iframe')
  await capture('dark-react-search-preview-native')
  result.passed = true
} catch (error) {
  result.error = error.stack
  throw error
} finally {
  result.finishedAt = new Date().toISOString()
  await writeFile(resolve(evidence, 'results.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ passed: result.passed, records: records.length, captures: captures.length, home, error: result.error }, null, 2))
}
