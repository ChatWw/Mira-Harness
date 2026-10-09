import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, unlinkSync, rmdirSync, chmodSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = '/tmp/mira-ui-project.xsM04t'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function read(expression, kind = 'iframe') {
  const response = JSON.parse(execFileSync(process.execPath, ['/tmp/mira-cdp.mjs', kind, 'evaluate', expression], { encoding: 'utf8' }))
  if (response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails))
  return response.result?.result.value
}
function act(selector, action = 'click', value = '') {
  if (selector.startsWith('[data-file-tree-path')) {
    for (let index=0;index<12;index++) {
      const box=read(`(()=>{const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(),t=document.querySelector('[role=tree]').getBoundingClientRect();return r?{visible:r.top>=t.top&&r.bottom<=t.bottom,delta:r.top<t.top?240:-240,x:t.x+t.width/2,y:t.y+t.height/2}:null})()`)
      if (!box || box.visible) break
      const frame=read('document.querySelector("iframe").getBoundingClientRect().toJSON()','page')
      const win=JSON.parse(execFileSync('/tmp/mira-zcode-cu',['windows','Electron'],{encoding:'utf8'})).find(e=>e.kCGWindowName?.includes('Mira')&&e.kCGWindowBounds.Width>500)
      execFileSync('/tmp/mira-zcode-cu',['move',String(win.kCGWindowBounds.X+frame.x+box.x),String(win.kCGWindowBounds.Y+frame.y+box.y)])
      execFileSync('/tmp/mira-zcode-cu',['scroll',String(box.delta)])
      execFileSync('sleep',['0.12'])
    }
  }
  execFileSync(process.execPath, ['/tmp/mira-act.mjs', selector, action, value])
}
function key(name, ...mods) { execFileSync('/tmp/mira-zcode-cu', ['key', name, ...mods]) }
async function until(expression, kind = 'iframe', timeout = 12000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { const value = read(expression, kind); if (value) return value } catch (error) { if (Date.now() + 200 >= deadline) throw error }
    await pause(100)
  }
  throw new Error(`Timed out: ${expression}`)
}
function log(phase, details = {}) { console.log(JSON.stringify({ phase, at: new Date().toISOString(), ...details })) }
function capture(name) {
  const windows = JSON.parse(execFileSync('/tmp/mira-zcode-cu', ['windows', 'Electron'], { encoding: 'utf8' }))
  const window = windows.find(item => item.kCGWindowName?.includes('Mira') && item.kCGWindowBounds.Width > 500)
  execFileSync('/tmp/mira-zcode-cu', ['move', '700', '75'])
  execFileSync('screencapture', ['-x', '-l', String(window.kCGWindowNumber), `/tmp/${name}`])
}
const row = path => `[data-file-tree-path=${JSON.stringify(path)}]`
const hasRow = path => `!!document.querySelector(${JSON.stringify(row(path))})`
const activeText = text => `document.querySelector('.pilot-panel-view.is-active .mira-file-preview')?.innerText.includes(${JSON.stringify(text)})`
async function query(text) {
  act('input[aria-label="搜索文件"]'); key('a', 'cmd'); key('backspace')
  await until('document.querySelector("input[aria-label=搜索文件]").value===""')
  act('input[aria-label="搜索文件"]')
  if (text) execFileSync('/tmp/mira-zcode-cu', ['type', text])
  await until(`document.querySelector('input[aria-label="搜索文件"]').value===${JSON.stringify(text)}`)
  await until('document.querySelector("[role=tree]")?.getAttribute("aria-busy")==="false"')
}
const installMonitor = `(()=>{
  window.__miraWatchCleanup?.();
  window.__miraWatchSmoke={requests:[],events:[],activeReads:0,maxReads:0,longTasks:[]};
  const original=MessagePort.prototype.postMessage, pending=new WeakMap(), removers=[];
  window.__miraWatchCleanup=()=>{
    MessagePort.prototype.postMessage=original;
    for(const remove of removers) remove();
    window.__miraWatchObserver?.disconnect();
  };
  MessagePort.prototype.postMessage=function(data,...args){
    if(data?.type!=='mira:request') return original.call(this,data,...args);
    const state=window.__miraWatchSmoke;
    if(!pending.has(this)){
      const ids=new Set();pending.set(this,ids);
      const listener=event=>{
      const reply=event.data;
      if(reply?.type==='mira:harness-event'&&reply.event?.type==='workspace-files-changed') state.events.push({paths:reply.event.payload.paths,error:reply.event.payload.error});
      if(reply?.type==='mira:response'&&ids.delete(reply.id)) state.activeReads--;
      };
      const handler=this.onmessage;
      if(typeof handler!=='function') throw Error('Expected first-party port onmessage handler');
      const wrapper=event=>{listener(event);return handler.call(this,event)};
      this.onmessage=wrapper;
      removers.push(()=>{if(this.onmessage===wrapper)this.onmessage=handler});
    }
    const result=original.call(this,data,...args);
    if(data?.type==='mira:request'){
      state.requests.push({method:data.method,params:data.params,at:performance.now()});
      if(data.method==='harness.files.list'){pending.get(this).add(data.id);state.activeReads++;state.maxReads=Math.max(state.maxReads,state.activeReads)}
    }
    return result;
  };
  window.__miraWatchObserver=new PerformanceObserver(list=>statePush(list));
  function statePush(list){window.__miraWatchSmoke.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))}
  window.__miraWatchObserver.observe({type:'longtask',buffered:false});return true;
})()`

await until('!!document.querySelector("button[aria-label=查看文件]")')
if (read('document.querySelector("h1")?.innerText') !== '慢速：项目附件发送与切换验收第二轮') act('.mira-session-row__open >> 慢速：项目附件发送与切换验收第二轮')
if (!read('!!document.querySelector("input[aria-label=搜索文件]")')) act('button[aria-label="查看文件"]')
await until('document.querySelector(".mira-file-drawer h2")?.title==="/tmp/mira-ui-project.xsM04t"')
await query('')
read(installMonitor)
try {
const fixture = mkdtempSync(join(root, 'mira-watch-native-'))
const relative = basename(fixture)
const child = join(fixture, 'nested')
const file = join(child, 'live.txt')
const hidden = join(child, 'hidden.txt')
mkdirSync(child)
writeFileSync(file, 'Mira watch version one\n')
writeFileSync(hidden, 'Mira hidden version one\n')
log('scope', { fixture, timeOrigin: read('performance.timeOrigin'), url: read('location.href'), windows: JSON.parse(execFileSync('/tmp/mira-zcode-cu', ['windows', 'Electron'], { encoding: 'utf8' })) })

await query(relative)
await until(hasRow(relative))
act(row(relative))
await until(hasRow(`${relative}/nested`))
act(row(`${relative}/nested`))
await until(hasRow(`${relative}/nested/live.txt`))
act(row(`${relative}/nested/live.txt`))
await until(activeText('Mira watch version one'))
await pause(600)
log('root-create-expanded-preview', { passed: true })

let started = Date.now()
writeFileSync(file, 'Mira watch version two\n')
await until(activeText('Mira watch version two'))
log('external-save-auto-preview', { latencyMs: Date.now() - started })
writeFileSync(join(child, 'atomic.tmp'), 'Mira atomic save version three\n')
renameSync(join(child, 'atomic.tmp'), file)
await until(activeText('Mira atomic save version three'))
log('atomic-save-auto-preview', { passed: true })

act(row(`${relative}/nested/hidden.txt`))
await until(activeText('Mira hidden version one'))
act(`[data-workspace-tab-id=${JSON.stringify(`file:${relative}/nested/live.txt`)}]`)
writeFileSync(hidden, 'Mira hidden version two\n')
await pause(700)
const beforeActivate = read('window.__miraWatchSmoke.requests.filter(e=>e.method==="harness.files.read").length')
act(`[data-workspace-tab-id=${JSON.stringify(`file:${relative}/nested/hidden.txt`)}]`)
await until(activeText('Mira hidden version two'))
log('inactive-preview-refresh-on-activation', { readCountBefore: beforeActivate, readCountAfter: read('window.__miraWatchSmoke.requests.filter(e=>e.method==="harness.files.read").length') })

act(`[data-workspace-tab-id=${JSON.stringify(`file:${relative}/nested/live.txt`)}]`)
unlinkSync(file)
await until('document.querySelector(".pilot-panel-view.is-active .mira-file-preview [role=alert]")?.innerText.includes("已不存在")')
assert.ok(read(`!!document.querySelector('[data-workspace-tab-id="file:${relative}/nested/live.txt"]')`))
writeFileSync(file, 'Mira recovered file version four\n')
await until(activeText('Mira recovered file version four'))
log('deleted-preview-tab-retained-and-recovers', { passed: true })

const moved = mkdtempSync('/tmp/mira-watch-moved-')
renameSync(child, join(moved, 'old-nested'))
mkdirSync(child)
writeFileSync(file, 'Mira rebuilt child version five\n')
await until(activeText('Mira rebuilt child version five'))
const fresh = join(child, 'fresh.txt')
writeFileSync(fresh, 'Mira new watcher binding\n')
await until(hasRow(`${relative}/nested/fresh.txt`))
writeFileSync(join(moved, 'old-nested', 'outside.txt'), 'Mira moved-old-directory isolation\n')
await pause(700)
assert.ok(!read(hasRow(`${relative}/nested/outside.txt`)))
log('child-replacement-rebind-isolation', { passed: true, events: read('window.__miraWatchSmoke.events') })

const searchName = `${relative}-new-search.txt`
await query(searchName)
await until('document.querySelector("[role=tree]")?.innerText.includes("没有匹配")')
const searchFile = join(child, searchName)
writeFileSync(searchFile, 'Mira search auto refresh\n')
await until(hasRow(`${relative}/nested/${searchName}`))
assert.equal(read('document.querySelector("input[aria-label=搜索文件]").value'), searchName)
log('search-auto-refresh-retains-query', { passed: true })
await query('')

chmodSync(child, 0)
writeFileSync(join(fixture, 'permission-probe.txt'), 'Mira permission event fixture\n')
try {
  await until('document.body.innerText.includes("没有权限监听文件或目录")')
  capture('mira-watch-permission-native.png')
  log('watch-permission-visible-error', { alerts: read('[...document.querySelectorAll("[role=alert]")].map(e=>e.innerText)') })
} finally { chmodSync(child, 0o755) }
act('.mira-file-drawer button[aria-label="重试文件自动刷新"]')
await until('!document.body.innerText.includes("没有权限监听文件或目录")')
writeFileSync(file, 'Mira retry recovered version six\n')
await until(activeText('Mira retry recovered version six'))
log('watch-permission-retry-recovers', { passed: true })

await pause(800)
const quietBefore = read('window.__miraWatchSmoke.requests.filter(e=>e.method.startsWith("harness.files.")).length')
await pause(1600)
const quietAfter = read('window.__miraWatchSmoke.requests.filter(e=>e.method.startsWith("harness.files.")).length')
assert.equal(quietBefore, quietAfter)
assert.ok(read('window.__miraWatchSmoke.maxReads') <= 2, `Observed ${read('window.__miraWatchSmoke.maxReads')} outstanding tree requests`)
capture('mira-watch-preview-light-native.png')
log('no-polling-bounded-tree-reads', { quietBefore, quietAfter, maxReads: read('window.__miraWatchSmoke.maxReads'), longTasks: read('window.__miraWatchSmoke.longTasks') })
log('fixture-retained-for-native-editor', { fixture, moved, file, relative })
} finally {
  read('window.__miraWatchCleanup?.();true')
}
