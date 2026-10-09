import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const theme = process.argv[2]
const path = 'mira-watch-native-BuPTxi/nested/live.txt'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function read(expression, kind = 'iframe') { const data=JSON.parse(execFileSync(process.execPath, ['/tmp/mira-cdp.mjs',kind,'evaluate',expression],{encoding:'utf8'}));if(data.result.exceptionDetails)throw Error(JSON.stringify(data.result.exceptionDetails));return data.result.result.value }
function act(selector, action = 'click') {execFileSync(process.execPath,['/tmp/mira-act.mjs',selector,action])}
function key(name, ...mods) {execFileSync('/tmp/mira-zcode-cu',['key',name,...mods])}
async function until(expression) {const deadline=Date.now()+12000;while(Date.now()<deadline){try{if(read(expression))return}catch{}await pause(100)}throw Error(expression)}
function capture(name) {const w=JSON.parse(execFileSync('/tmp/mira-zcode-cu',['windows','Electron'],{encoding:'utf8'})).find(w=>w.kCGWindowName?.includes('Mira')&&w.kCGWindowBounds.Width>500);const b=w.kCGWindowBounds;assert.equal(JSON.parse(execFileSync('/tmp/mira-zcode-cu',['frontmost'],{encoding:'utf8'})).pid,w.kCGWindowOwnerPID);execFileSync('/tmp/mira-zcode-cu',['move','700','30']);execFileSync('screencapture',['-x','-R',`${b.X},${b.Y},${b.Width},${b.Height}`,`/tmp/${name}.png`]);assert.equal(JSON.parse(execFileSync('/tmp/mira-zcode-cu',['frontmost'],{encoding:'utf8'})).pid,w.kCGWindowOwnerPID);console.log(JSON.stringify({phase:'native-region-capture',theme,name,at:new Date().toISOString(),pid:w.kCGWindowOwnerPID,foregroundVerified:true,window:w.kCGWindowNumber,bounds:b,target:read('location.href'),timeOrigin:read('performance.timeOrigin')}))}
await until('!!document.querySelector("button[aria-label=查看文件]")')
assert.equal(read('document.documentElement.classList.contains("dark")'),theme==='dark')
if(!read('!!document.querySelector("input[aria-label=搜索文件]")'))act('button[aria-label="查看文件"]')
await until('!!document.querySelector("input[aria-label=搜索文件]")')
act('input[aria-label="搜索文件"]');key('a','cmd');key('backspace')
await until('document.querySelector("input[aria-label=搜索文件]").value===""')
execFileSync('/tmp/mira-zcode-cu',['type',path])
await until(`document.querySelector('input[aria-label="搜索文件"]').value===${JSON.stringify(path)}`)
await until(`!!document.querySelector('[data-file-tree-path="${path}"]')`)
act(`[data-file-tree-path="${path}"]`)
await until(`document.querySelector('.pilot-panel-view.is-active .mira-file-preview')?.getAttribute('aria-label')==='文件预览 ${path}'`)
await pause(400)
act('button[aria-label="选择打开方式"]')
await until('!!document.querySelector("[role=menu]")')
assert.deepEqual(read('[...document.querySelectorAll("[role=menuitemradio]")].map(e=>e.innerText.trim())'),['Finder','Trae'])
capture(`mira-editors-${theme}-final-native`);key('escape')
act(`[data-file-tree-path="${path}"]`,'right');act('[role=menuitem] >> 打开方式')
await until('[...document.querySelectorAll("[role=menu]")].some(e=>e.innerText.includes("TextEdit"))')
capture(`mira-open-with-${theme}-final-native`);key('escape');key('escape')
capture(`mira-watch-preview-${theme}-final-native`)
