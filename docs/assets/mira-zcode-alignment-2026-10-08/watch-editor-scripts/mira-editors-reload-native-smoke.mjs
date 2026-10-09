import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
const lines = readFileSync('/tmp/mira-watch-editors-native-final-results.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line))
const scope = lines.find(line => line.phase === 'scope')
const relative = scope.fixture.split('/').at(-1)
const path = `${relative}/nested/live.txt`
const file = `${scope.fixture}/nested/live.txt`
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function read(expression, kind = 'iframe') {
  const response = JSON.parse(execFileSync(process.execPath, ['/tmp/mira-cdp.mjs', kind, 'evaluate', expression], { encoding: 'utf8' }))
  if (response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails))
  return response.result?.result.value
}
function act(selector, action = 'click') { execFileSync(process.execPath, ['/tmp/mira-act.mjs', selector, action]) }
function key(name, ...mods) { execFileSync('/tmp/mira-zcode-cu', ['key', name, ...mods]) }
async function until(expression, kind = 'iframe', timeout = 12000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { const value = read(expression, kind); if (value) return value } catch {}
    await pause(100)
  }
  throw new Error(`Timed out: ${expression}`)
}
function log(phase, details = {}) { console.log(JSON.stringify({phase,at:new Date().toISOString(),...details})) }
function capture(name) {
  const windows = JSON.parse(execFileSync('/tmp/mira-zcode-cu', ['windows', 'Electron'], { encoding: 'utf8' }))
  const win = windows.find(e => e.kCGWindowName?.includes('Mira') && e.kCGWindowBounds.Width > 500)
  execFileSync('/tmp/mira-zcode-cu', ['move', '700', '75'])
  execFileSync('screencapture', ['-x', '-l', String(win.kCGWindowNumber), `/tmp/${name}`])
}
async function openFixture() {
  if (!read('!!document.querySelector("input[aria-label=搜索文件]")')) act('button[aria-label="查看文件"]')
  await until('document.querySelector(".mira-file-drawer h2")?.title==="/tmp/mira-ui-project.xsM04t"')
  act('input[aria-label="搜索文件"]'); key('a','cmd'); key('backspace')
  await until('document.querySelector("input[aria-label=搜索文件]").value===""')
  execFileSync('/tmp/mira-zcode-cu',['type',path])
  await until(`document.querySelector('input[aria-label="搜索文件"]').value===${JSON.stringify(path)}`)
  await until('document.querySelector("[role=tree]")?.getAttribute("aria-busy")==="false"')
  const row = value => `[data-file-tree-path=${JSON.stringify(value)}]`
  await until(`!!document.querySelector(${JSON.stringify(row(path))})`)
  act(row(path))
  await until(`document.querySelector('.pilot-panel-view.is-active .mira-file-preview')?.getAttribute('aria-label')===${JSON.stringify(`文件预览 ${path}`)}`)
  await until(`window.platform.getSnapshot().then(s=>s.preferences['first-party.mira-harness.harness-react-workspace']?.[s.preferences['first-party.mira-harness.active-session']]?.tabs.some(t=>t.id===${JSON.stringify(`file:${path}`)}))`,'page')
}
await until('!!document.querySelector("button[aria-label=查看文件]")')
await openFixture()
log('scope', {file,path,timeOrigin:read('performance.timeOrigin','page'),url:read('location.href','page'),windows:JSON.parse(execFileSync('/tmp/mira-zcode-cu',['windows','Electron'],{encoding:'utf8'}))})
act('button[aria-label="选择打开方式"]')
await until('!!document.querySelector("[role=menu]")')
const menu = read('({width:document.querySelector("[role=menu]").getBoundingClientRect().width,names:[...document.querySelectorAll("[role=menuitemradio]")].map(e=>e.innerText.trim()),icons:[...document.querySelectorAll("[role=menuitemradio] img")].map(e=>e.src)})')
assert.equal(menu.width,160); assert.deepEqual(menu.names,['Finder','Trae'])
assert.equal(new Set(menu.icons).size,2)
const hashes=menu.icons.map(icon=>createHash('sha256').update(Buffer.from(icon.split(',')[1],'base64')).digest('hex'))
capture('mira-editors-light-final-native.png')
log('real-installed-icons', {width:menu.width,names:menu.names,hashes})
act('[role=menuitemradio] >> Finder')
await until('window.platform.getSnapshot().then(s=>s.preferences["first-party.mira-harness.harness-react-editor"]==="mira-finder")','page')
log('header-selection-opens-and-saves', {preferred:'mira-finder'})
act('button[aria-label="选择打开方式"]')
act('[role=menuitemradio] >> Finder')
log('same-selected-editor-opens-again', {passed:true})
act('button[aria-label="选择打开方式"]')
act('[role=menuitem] >> 重新检测应用')
await until('!document.querySelector(".mira-editor-button__open").disabled')
log('redetect-apps', {passed:true})

act(`[data-file-tree-path=${JSON.stringify(path)}]`, 'right')
act('[role=menuitem] >> 打开方式')
await until('[...document.querySelectorAll("[role=menu]")].some(e=>e.innerText.includes("TextEdit"))')
capture('mira-open-with-light-final-native.png')
act('[role=menuitem] >> TextEdit')
await pause(400)
const pid = Number(execFileSync('pgrep',['-f','/System/Applications/TextEdit.app/Contents/MacOS/TextEdit'],{encoding:'utf8'}).trim())
execFileSync('/tmp/mira-zcode-cu',['focus',String(pid)])
execFileSync('osascript',['-e',`tell application "System Events" to set frontmost of first process whose unix id is ${pid} to true`])
await pause(150)
const ax = JSON.parse(execFileSync('/tmp/mira-zcode-cu',['ax',String(pid)],{encoding:'utf8'}))
const originalContent = readFileSync(file, 'utf8')
const text = ax.find(e=>e.AXRole==='AXTextArea'&&e.AXValue===originalContent)
if(!text) throw new Error('Expected isolated TextEdit document is not active')
execFileSync('/tmp/mira-zcode-cu',['click',String(text.position[0]+120),String(text.position[1]+40)])
key('a','cmd')
execFileSync('/tmp/mira-zcode-cu',['type','Mira actual TextEdit final save\n'])
execFileSync('osascript',['-e','tell application "System Events" to keystroke "s" using command down'])
await until(`document.querySelector('.pilot-panel-view.is-active .mira-file-preview')?.innerText.includes('Mira actual TextEdit final save')`)
assert.equal(readFileSync(file,'utf8'),'Mira actual TextEdit final save\n')
const afterAx = JSON.parse(execFileSync('/tmp/mira-zcode-cu',['ax',String(pid)],{encoding:'utf8'})).filter(e=>e.AXRole==='AXWindow'||e.AXRole==='AXTextArea')
log('actual-textedit-save-auto-refresh', {file,afterAx,preferred:read('document.querySelector(".mira-editor-button__open").getAttribute("aria-label")')})
execFileSync('osascript',['-e','tell application "System Events" to keystroke "w" using command down'])
act('.pilot-panel-view.is-active button[aria-label="在 Finder 中打开"]')
log('preview-native-finder-reveal', {passed:true})

for(let index=0;index<10;index++){
  act('input[aria-label="搜索文件"]')
  const before=read('performance.timeOrigin','page')
  key('r','cmd')
  await until(`performance.timeOrigin>${before}`,'page')
  await until('!!document.querySelector("button[aria-label=查看文件]")')
  await openFixture()
  writeFileSync(file,`Mira reload ${index+1} notification\n`)
  await until(`document.querySelector('.pilot-panel-view.is-active .mira-file-preview')?.innerText.includes('Mira reload ${index+1} notification')`)
  const alerts=read('[...document.querySelectorAll("[role=alert]")].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.innerText)')
  assert.deepEqual(alerts,[])
  log('native-window-reload', {iteration:index+1,before,after:read('performance.timeOrigin','page'),alerts})
}
capture('mira-watch-preview-light-final-native.png')
log('final', {file,tabs:read('[...document.querySelectorAll("[data-workspace-tab-id]")].map(e=>e.dataset.workspaceTabId)'),root:read('document.querySelector(".mira-file-drawer h2").title')})
