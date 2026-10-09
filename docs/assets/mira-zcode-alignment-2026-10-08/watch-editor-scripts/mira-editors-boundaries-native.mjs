import { execFileSync } from 'node:child_process'
import { readFileSync, renameSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
const scope = readFileSync('/tmp/mira-watch-editors-native-final-results.jsonl', 'utf8').trim().split('\n').map(JSON.parse).find(line => line.phase === 'scope')
const path = `${scope.fixture.split('/').at(-1)}/nested/live.txt`
const file = `${scope.fixture}/nested/live.txt`
const backup = `${file}.mira-editor-smoke-backup`
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function read(expression, kind = 'iframe') {
  const data = JSON.parse(execFileSync(process.execPath, ['/tmp/mira-cdp.mjs', kind, 'evaluate', expression], { encoding: 'utf8' }))
  if (data.result?.exceptionDetails) throw Error(JSON.stringify(data.result.exceptionDetails))
  return data.result?.result.value
}
function act(selector, action = 'click') { execFileSync(process.execPath, ['/tmp/mira-act.mjs', selector, action]) }
function key(name, ...mods) { execFileSync('/tmp/mira-zcode-cu', ['key', name, ...mods]) }
async function until(expression, kind = 'iframe') {
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) { try { const value = read(expression, kind); if (value) return value } catch {} await pause(100) }
  throw Error(`Timed out: ${expression}`)
}
function log(phase, details = {}) { console.log(JSON.stringify({ phase, at: new Date().toISOString(), ...details })) }
function win() { return JSON.parse(execFileSync('/tmp/mira-zcode-cu', ['windows', 'Electron'], { encoding: 'utf8' })).find(w => w.kCGWindowName?.includes('Mira') && w.kCGWindowBounds.Width > 500) }
function capture(name) { const b=win().kCGWindowBounds; execFileSync('/tmp/mira-zcode-cu', ['move', '700', '30']); execFileSync('screencapture', ['-x', '-R', `${b.X},${b.Y},${b.Width},${b.Height}`, `/tmp/${name}.png`]) }
function resize(width, height) { execFileSync('osascript', ['-e', `tell application "System Events"\ntell (first process whose unix id is ${win().kCGWindowOwnerPID})\nset size of front window to {${width}, ${height}}\nend tell\nend tell`]) }
function menuInfo(selector = '.mira-editor-menu') {
  return read(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,width:r.width,height:r.height,innerHeight,scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflow:getComputedStyle(e).overflowY,items:[...e.querySelectorAll('[role^=menuitem]')].map(i=>({name:i.innerText.trim(),bottom:i.getBoundingClientRect().bottom,top:i.getBoundingClientRect().top}))}})()`)
}
function wheel(menu, amount) {
  const frame = read('document.querySelector("iframe").getBoundingClientRect().toJSON()', 'page')
  const bounds = win().kCGWindowBounds
  execFileSync('/tmp/mira-zcode-cu', ['move', String(bounds.X + frame.x + menu.x + menu.width / 2), String(bounds.Y + frame.y + menu.y + menu.height / 2)])
  execFileSync('/tmp/mira-zcode-cu', ['scroll', String(amount)])
}
const active = '.pilot-panel-view.is-active .mira-file-preview'
assert.equal(read(`document.querySelector('${active}')?.getAttribute('aria-label')`), `文件预览 ${path}`)
assert.ok(!existsSync(backup))
const original = readFileSync(file, 'utf8')
try {
  renameSync(file, backup)
  await until(`document.querySelector('${active} .mira-file-preview__notice[role=alert]')?.innerText.includes('已不存在')`)
  act(`${active} button[aria-label="在 Finder 中打开"]`)
  await until(`document.querySelector('${active} .mira-file-preview__feedback.is-error')?.innerText.includes('已不存在')`)
  capture('mira-editor-open-error-native')
  log('real-missing-file-open-error', { feedback: read(`document.querySelector('${active} .mira-file-preview__feedback').innerText`) })
} finally { if (existsSync(backup)) renameSync(backup, file) }
await until(`document.querySelector('${active}')?.innerText.includes(${JSON.stringify(original.trim())})`)
act(`${active} button[aria-label="关闭提示"]`)
act(`${active} button[aria-label="在 Finder 中打开"]`)
await pause(250)
assert.ok(!read(`!!document.querySelector('${active} .mira-file-preview__feedback.is-error')`))
log('real-missing-file-open-recovery', { restored: readFileSync(file, 'utf8') === original })

const originalBounds = win().kCGWindowBounds
read(`(()=>{const original=MessagePort.prototype.postMessage;window.__miraEditorFixtureCleanup=()=>{MessagePort.prototype.postMessage=original};MessagePort.prototype.postMessage=function(data,...rest){if(data?.type==='mira:request'&&data.method==='harness.editors.list'){const value=Array.from({length:24},(_,i)=>({id:'mira-fixture-'+i,name:'Mira fixture editor '+String(i+1).padStart(2,'0')}));queueMicrotask(()=>this.onmessage?.({data:{type:'mira:response',id:data.id,ok:true,value}}));return}return original.call(this,data,...rest)};return true})()`)
try {
  resize(1440, 680)
  await pause(200)
  act('button[aria-label="选择打开方式"]'); act('[role=menuitem] >> 重新检测应用')
  await until('!document.querySelector(".mira-editor-button__open").disabled')
  act('button[aria-label="选择打开方式"]')
  await until('document.querySelectorAll(".mira-editor-menu [role=menuitemradio]").length===24')
  let menu = menuInfo()
  assert.equal(menu.overflow, 'auto'); assert.ok(menu.bottom <= menu.innerHeight); assert.ok(menu.scrollHeight > menu.clientHeight)
  capture('mira-editor-short-fixture-native')
  wheel(menu, -1600)
  await until('document.querySelector(".mira-editor-menu").scrollTop>0')
  menu = menuInfo()
  assert.ok(menu.items.at(-1).bottom <= menu.bottom)
  capture('mira-editor-short-fixture-scrolled-native')
  log('fixture-header-menu-native-wheel', { window: win().kCGWindowBounds, editors: 24, menu })
  key('escape')
  act(`[data-file-tree-path=${JSON.stringify(path)}]`, 'right'); act('[role=menuitem] >> 打开方式')
  await until('!!document.querySelector(".mira-editor-menu")')
  menu = menuInfo()
  assert.equal(menu.overflow, 'auto'); assert.ok(menu.bottom <= menu.innerHeight); assert.ok(menu.scrollHeight > menu.clientHeight)
  wheel(menu, -1600)
  await until('document.querySelector(".mira-editor-menu").scrollTop>0')
  menu = menuInfo()
  assert.ok(menu.items.at(-1).bottom <= menu.bottom)
  capture('mira-open-with-short-fixture-scrolled-native')
  log('fixture-tree-submenu-native-wheel', { window: win().kCGWindowBounds, editors: 24, menu })
  key('escape'); key('escape')
} finally {
  read('window.__miraEditorFixtureCleanup?.();true')
  resize(originalBounds.Width, originalBounds.Height)
}
act('button[aria-label="选择打开方式"]')
wheel(menuInfo(), -1600)
await pause(150)
act('[role=menuitem] >> 重新检测应用')
await until('!document.querySelector(".mira-editor-button__open").disabled')
act('button[aria-label="选择打开方式"]')
assert.deepEqual(read('[...document.querySelectorAll("[role=menuitemradio]")].map(e=>e.innerText.trim())'), ['Finder', 'Trae'])
capture('mira-editors-light-final-native')
key('escape')
act(`[data-file-tree-path=${JSON.stringify(path)}]`, 'right'); act('[role=menuitem] >> 打开方式')
await until('[...document.querySelectorAll("[role=menu]")].some(e=>e.innerText.includes("TextEdit"))')
capture('mira-open-with-light-final-native')
key('escape'); key('escape')
capture('mira-watch-preview-light-final-native')
log('fixture-removed-real-apps-restored', { names: ['Finder', 'Trae'], window: win().kCGWindowBounds })
