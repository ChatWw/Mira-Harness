// Native helper, Electron rendering and selected Windows backend integration. Input targets only an owned test window.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const output = resolve(process.argv[2] || 'docs/evidence/computer-use')
await mkdir(output, { recursive: true })
const temporary = await mkdtemp(resolve('node_modules/.cache/mira-computer-use-'))
const report = { boundary: 'Real Windows helper, real Electron React/CSS rendering with fixture records, and bundled DSH Windows input only into an owned test window. Esc is verified through the native helper test seam. No user applications, hardware key injection, external model task or installer acceptance.', checks: [], native: {} }
let helper
try {
  if (process.platform === 'win32') {
    helper = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', resolve('resources/plugins/computer-use/windows/scripts/windows-takeover.ps1'), '-CancelEvent', `Local\\Mira-CU-verify-${process.pid}`, '-TestMode'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const pending = new Map()
    let next = 0, diagnostic = ''
    helper.stderr.on('data', chunk => { diagnostic += chunk })
    let readyResolve, readyReject
    const ready = new Promise((done, fail) => { readyResolve = done; readyReject = fail })
    const timer = setTimeout(() => readyReject(new Error('Native helper timeout: ' + diagnostic)), 20000)
    helper.once('error', readyReject)
    helper.once('exit', () => { clearTimeout(timer); readyReject(new Error('Native helper exited: ' + diagnostic)); for (const task of pending.values()) { clearTimeout(task.timer); task.fail(new Error('Helper exited')) } })
    createInterface({ input: helper.stdout }).on('line', line => {
      const message = JSON.parse(line)
      if (message.kind === 'ready') { clearTimeout(timer); readyResolve(); return }
      const task = pending.get(message.id)
      if (!task) return
      clearTimeout(task.timer); pending.delete(message.id)
      message.ok ? task.done(message) : task.fail(new Error(message.error))
    })
    await ready
    const command = (command, args = {}) => new Promise((done, fail) => {
      const id = ++next
      const timer = setTimeout(() => { pending.delete(id); fail(new Error('Helper command timed out: ' + command)) }, 5000)
      pending.set(id, { done, fail, timer })
      helper.stdin.write(JSON.stringify({ ...args, id, command }) + '\n')
    })
    const before = await command('status')
    const active = await command('begin', { indicatorText: 'Mira 正在控制电脑 · 点击', remoteIndicatorVisible: true })
    assert.equal(active.armed, true)
    assert.equal(active.overlayClickThrough, true)
    assert.equal(active.pointerClickThrough, true)
    assert.equal(active.liveCursorAvailable, true)
    assert.equal(active.foreground, before.foreground)
    report.native = { windows: active.windows, pointerVisible: active.pointerVisible, overlayClickThrough: active.overlayClickThrough, pointerClickThrough: active.pointerClickThrough, foregroundUnchanged: true }
    await command('test_render', { path: join(output, 'windows-indicator.png') })
    await command('test_render_pointer', { path: join(output, 'windows-pointer.png') })
    const injected = await command('test_key', { vk: 27, injected: true })
    assert.equal(injected.paused, false)
    const stopped = await command('test_key', { vk: 27, injected: false })
    assert.equal(stopped.paused, true); assert.equal(stopped.cancelled, true)
    assert.equal(stopped.windows, 0); assert.equal(stopped.pointerVisible, false)
    report.checks.push('Native helper compiles; overlays pass clicks and retain focus; injected Esc ignored; physical-Esc test seam cancels and removes overlays')
    await command('close'); helper.stdin.end()
    await new Promise(done => helper.exitCode !== null ? done() : helper.once('exit', done))
  }
  execFileSync(process.execPath, ['node_modules/@tailwindcss/cli/dist/index.mjs', '-i', 'apps/harness-react/src/styles/app.css', '-o', join(temporary, 'fixture.css'), '--minify'], { windowsHide: true, stdio: 'pipe' })
  const renderer = await build({ stdin: { contents: `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ToolRecord } from './apps/harness-react/src/components/conversation/run-progress'
import { MiraConversationDetails, MiraConversationDetailMemory } from './apps/harness-react/src/components/conversation/MiraConversationDetails'
const memory = new MiraConversationDetailMemory()
const tools = [
 {id:'observe',computerUse:{action:'观察窗口',target:'记事本 · 窗口 42'},status:'ok',output:{text:'已读取窗口状态。',truncated:false}},
 {id:'click',computerUse:{action:'点击',target:'搜索框 · (420, 180)'},status:'ok'},
 {id:'type',computerUse:{action:'输入文字',target:'搜索框 · 12 个字符'},status:'running'},
 {id:'steps',computerUse:{action:'执行电脑操作步骤',target:'记事本',steps:['点击 · 搜索','输入文字 · 5 个字符','快捷键 · Ctrl + S']},status:'failed',error:'第 2 步失败：目标控件已变化',output:{text:'step 1: ok\\nstep 2: failed\\nstep 3: not executed',truncated:false}},
 {id:'stop',computerUse:{action:'点击',target:'保存按钮'},status:'cancelled',error:'用户按 Esc 停止了电脑控制。本轮不要重试；请等待用户发送新消息后继续。'}
].map(item=>({tool:'mira_mcp_desktop_'+item.id,label:'driver_'+item.id,createdAt:1,runId:'fixture',...item}))
createRoot(document.getElementById('root')).render(<MiraConversationDetails memory={memory} scope="computer-verification"><main style={{maxWidth:780,margin:'36px auto',padding:24}}><h1 style={{fontSize:20,marginBottom:24}}>电脑控制</h1><div className="mira-tool-records">{tools.map(tool=><ToolRecord key={tool.id} tool={tool}/>)}</div></main></MiraConversationDetails>)
`, resolveDir: process.cwd(), loader: 'tsx' }, loader: { '.svg': 'dataurl', '.css': 'empty' }, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', write: false })
  const css = await readFile(join(temporary, 'fixture.css'), 'utf8')
  await build({ stdin: { contents: `export { McpManager } from './electron/adapters/mcpManager'; export { createMiraComputerConnection } from './electron/services/miraComputerUse'`, resolveDir: process.cwd(), loader: 'ts' }, outfile: join(temporary, 'computer.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external' })
  const entry = join(temporary, 'verify.cjs')
  await writeFile(join(temporary, 'fixture.html'), '<!doctype html><meta charset="utf-8"><style>' + css + '</style><body><div id="root"></div><script>' + renderer.outputFiles[0].text.replaceAll('</script', '<\\/script') + '</script>')
  await writeFile(entry, `
const {app,BrowserWindow,screen}=require('electron');const fs=require('node:fs');const assert=require('node:assert/strict');
const deadline=setTimeout(()=>app.exit(1),45000);let win;
app.whenReady().then(async()=>{try{
win=new BrowserWindow({show:false,width:1000,height:820,webPreferences:{backgroundThrottling:false}});
await win.loadFile(${JSON.stringify(join(temporary, 'fixture.html'))});
await new Promise(r=>setTimeout(r,500));
for(const mode of ['light','dark']) {
 await win.webContents.executeJavaScript('document.documentElement.classList.toggle("dark",'+(mode==='dark')+');document.getElementById("root").dataset.theme='+JSON.stringify(mode)+';for(const id of ["steps","stop"]) { const row=document.querySelector("[data-tool-call-id="+id+"]");if(row?.getAttribute("data-state")!=="open")row?.querySelector("[data-tool-record-toggle]")?.click(); }');
 await new Promise(r=>setTimeout(r,250));
 await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const info=await win.webContents.executeJavaScript('({text:document.body.innerText,width:document.documentElement.scrollWidth,viewport:innerWidth,steps:[...document.querySelectorAll("ol li")].map(n=>n.innerText)})');
 assert.ok(info.text.includes('计划顺序，执行结果见输出'));assert.ok(info.text.includes('step 3: not executed'));assert.equal(info.steps.length,3);assert.ok(info.width<=info.viewport);
 fs.writeFileSync(${JSON.stringify(output)}+'/'+mode+'.png',(await win.webContents.capturePage()).toPNG());
}
if(process.platform==='win32') {
 const {McpManager,createMiraComputerConnection}=await import('./computer.mjs');
 const manager=new McpManager(undefined,undefined,()=>createMiraComputerConnection({resourceRoot:${JSON.stringify(resolve('resources/plugins/computer-use'))}}));
 const fixture=new BrowserWindow({show:false,width:500,height:350,title:'Mira computer control verification',webPreferences:{backgroundThrottling:false}});
 try {
  await fixture.loadURL('data:text/html,'+encodeURIComponent('<title>Mira computer control verification</title><body style="padding:40px"><button style="width:200px;height:60px" onclick="document.body.dataset.clicked=Number(document.body.dataset.clicked||0)+1">Mira test button</button><input aria-label="Mira test input" style="display:block;margin-top:20px"><p>Only this test window is operated.</p></body>'));
  fixture.setAlwaysOnTop(true);fixture.show();fixture.focus();fixture.moveTop();await new Promise(r=>setTimeout(r,300));
  const config={id:'plugin:computer-use@mira-builtin:desktop',name:'电脑控制',command:'mira:computer-use',args:[],enabled:true,createdAt:1,updatedAt:1};
  await manager.refresh([config]);
  assert.equal(manager.getStatus(config.id).state,'connected');
  const call=async(name,args,signal)=>{const tool=manager.getTools().find(t=>t.miraMcpToolName==='windows_computer_use_'+name);assert.ok(tool,name);return tool.execute('native-'+name,args,signal)};
  const handle=fixture.getNativeWindowHandle();const nativeWindowHandle=handle.length===8?Number(handle.readBigUInt64LE()):handle.readUInt32LE();
  const target={nativeWindowHandle};
  const shot=await call('screenshot',target);
  assert.ok(shot.content.some(block=>block.type==='image'&&block.data.length>1000));
  assert.ok(!shot.content.filter(block=>block.type==='text').some(block=>/windows-computer-use-.*png/.test(block.text)));
  const ocr=await call('ocr',{...target,query:'Mira',includeScreenshot:true});
  assert.ok(ocr.content.some(block=>block.type==='image'));
  assert.ok(ocr.content.some(block=>block.type==='text'&&block.text.includes('Mira')));
  const point=async(selector)=>{const rect=await fixture.webContents.executeJavaScript('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');const bounds=fixture.getContentBounds();return screen.dipToScreenPoint({x:rect.x+bounds.x,y:rect.y+bounds.y})};
  const clickPoint=await point('button');
  await call('click',{...target,...clickPoint,dispatch:'foreground',activate:true});
  await new Promise(r=>setTimeout(r,150));
  assert.equal(await fixture.webContents.executeJavaScript('document.body.dataset.clicked'),'1');
  await call('click',{...target,...await point('input'),dispatch:'foreground',activate:true});
  await call('type_text',{...target,text:'Mira 测试',method:'clipboard'});
  assert.equal(await fixture.webContents.executeJavaScript('document.querySelector("input").value'),'Mira 测试');
  console.log('PASS selected Windows backend: screenshot images, OCR, visible coordinate click and Unicode input');
  for(const teardown of ['cancel','close','refresh']) {
   if(teardown!=='cancel')await manager.refresh([config]);
   const controller=new AbortController();
   const waiting=call('wait',{milliseconds:10000},controller.signal);waiting.catch(()=>{});
   await new Promise(r=>setTimeout(r,250));
   const queued=call('click',{...target,...clickPoint,dispatch:'foreground'},controller.signal);queued.catch(()=>{});
   if(teardown==='cancel')controller.abort();else await (teardown==='close'?manager.closeAll():manager.refresh([]));
   await assert.rejects(waiting);await assert.rejects(queued);
   await manager.closeAll();
   await new Promise(r=>setTimeout(r,500));
   assert.equal(await fixture.webContents.executeJavaScript('document.body.dataset.clicked'),'1');
   console.log('PASS '+teardown+' discards queued input and closes the native helpers');
  }
 } finally { await manager.closeAll();fixture.destroy(); }
}

win.destroy();clearTimeout(deadline);console.log('PASS Electron computer tool render: Chinese summaries, batch plan/result distinction, stopped state, light/dark, no overflow');app.exit(0);
}catch(e){console.error(e);clearTimeout(deadline);app.exit(1)}});
`)
  const electron = createRequire(import.meta.url)('electron'), env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const processView = spawn(electron, [entry], { env, stdio: 'inherit', windowsHide: false })
  const code = await new Promise((done, fail) => { processView.once('error', fail); processView.once('exit', done) })
  assert.equal(code, 0)
  report.checks.push('Electron renders real ToolRecord in light/dark: Chinese actions, planned sequence, actual output and Esc cancellation, no horizontal overflow')
  if (process.platform === 'win32') report.checks.push('Selected DSH Windows backend through real McpManager returns screenshot/OCR images, clicks and types Unicode in an isolated Electron window; task cancellation, close and refresh discard queued input')
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  helper?.stdin.end()
  if (helper?.exitCode === null) helper.kill()
  await rm(temporary, { recursive: true, force: true })
}
