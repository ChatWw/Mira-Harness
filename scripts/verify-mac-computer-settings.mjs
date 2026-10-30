// Native Mac overlay and permissions, plus real React/CSS in Electron with explicit permission fixtures.
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'

if (process.platform !== 'darwin') throw new Error('Run this verification on macOS after building the native helpers and Harness renderer.')
const output = resolve(process.argv[2] || 'docs/evidence/computer-use/macos')
await mkdir(output, { recursive: true })
const temporary = await mkdtemp(resolve('node_modules/.cache/mira-mac-settings-'))
const root = process.cwd()
try {
  const renderer = await build({ stdin: { contents: `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MiraPluginDetail } from './apps/harness-react/src/components/extensions/MiraPluginDetail'
const item = {id:'computer-use@mira-builtin',name:'computer-use',description:'通过桌面应用界面完成操作。',version:'0.4.0',enabled:true,conflicts:[],skills:[{name:'computer-use',description:'通过截图、OCR 和桌面输入操作 Windows 或 macOS 应用。'}],unsupported:[],listing:{displayName:'电脑控制',author:'Yu-tao-Li / OrderG-X / Mira',category:'效率工具'}}
let status = {platform:'darwin',engineAvailable:true,cursorAvailable:true,screenRecording:false,accessibility:false,showCursor:true}
window.calls = []
const host = {getComputerUseStatus:async()=>({...status}),setComputerUseCursor:async value=>{status.showCursor=value;window.calls.push(['cursor',value])},openComputerUsePermission:async permission=>{window.calls.push(['permission',permission])}}
window.setFixture = value => {status={...status,...value};window.dispatchEvent(new Event('focus'))}
createRoot(document.getElementById('root')).render(<main style={{maxWidth:940,padding:40,margin:'0 auto'}}><MiraPluginDetail item={item} computerSettings={host} actions={<button className="mira-plugin-try-now">立即试用</button>} /></main>)
`, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'browser', jsx: 'automatic', format: 'iife', write: false, loader: { '.svg': 'dataurl' } })
  const css = await readFile(resolve('dist/harness-react-app/app.css'), 'utf8')
  await writeFile(join(temporary, 'fixture.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>' + css + '</style><body><div id="root"></div><script>' + renderer.outputFiles[0].text.replaceAll('</script', '<\\/script') + '</script></body></html>')
  await build({ entryPoints: ['electron/services/miraComputerSettings.ts'], outfile: join(temporary, 'settings.mjs'), bundle: true, platform: 'node', format: 'esm' })
  const entry = join(temporary, 'verify.cjs')
  await writeFile(entry, `
const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawn,execFileSync}=require('node:child_process');const {pathToFileURL}=require('node:url');
const output=${JSON.stringify(output)},temporary=${JSON.stringify(temporary)},root=${JSON.stringify(root)};
const delay=ms=>new Promise(r=>setTimeout(r,ms));const report={boundary:'macOS arm64 native Swift compilation; actual helper permission probe from Electron; native NSPanel first-show/hide and session switch/cleanup. React/CSS permission states are fixtures in a real Electron renderer. Desktop input targets only an owned test window when both native permissions are granted. No TCC changes, external apps, model task or signed installer acceptance.',checks:[],screenshots:[]};
let win,overlay,backend;const deadline=setTimeout(()=>app.exit(1),45000);
app.whenReady().then(async()=>{try{
 const {MiraComputerSettings}=await import('./settings.mjs');const configPath=path.join(temporary,'computer-use.json');const resourceRoot=path.join(root,'resources/plugins/computer-use');
 const settings=new MiraComputerSettings({resourceRoot,configPath,openExternal:async()=>{throw Error('Verification must not open settings')}});
 report.nativeStatus=await settings.status();assert.equal(report.nativeStatus.engineAvailable,true);assert.equal(report.nativeStatus.cursorAvailable,true);assert.equal(typeof report.nativeStatus.screenRecording,'boolean');assert.equal(typeof report.nativeStatus.accessibility,'boolean');report.checks.push('Actual native permission probe under Electron returns both permission states without requesting access');
 const overlayPath=path.join(resourceRoot,'macos/plugin/bin/dsh-cursor-overlay'),fifo=path.join(temporary,'native.fifo');let diagnostics='';
 overlay=spawn(overlayPath,['--fifo',fifo],{stdio:['ignore','pipe','pipe']});overlay.stderr.on('data',value=>diagnostics+=value);
 for(let i=0;i<60&&!fs.existsSync(fifo);i++)await delay(25);assert.ok(fs.existsSync(fifo));
 function send(value){const fd=fs.openSync(fifo,fs.constants.O_WRONLY|fs.constants.O_NONBLOCK);fs.writeSync(fd,value+'\\n');fs.closeSync(fd)}
 send('show-current\\nlabel 首次按键\\nping');for(let i=0;i<40&&!diagnostics.includes('visible=1');i++)await delay(25);assert.ok(diagnostics.includes('visible=1'),diagnostics);report.overlayFirstShow=diagnostics;
 send('hide\\nping');for(let i=0;i<40&&!diagnostics.includes('visible=0');i++)await delay(25);assert.ok(diagnostics.includes('visible=0'),diagnostics);overlay.kill('SIGTERM');await new Promise(r=>overlay.once('exit',r));overlay=undefined;report.checks.push('Native NSPanel becomes visible for the first non-coordinate operation and hides on request');
 process.env.MIRA_CU_CONFIG=configPath;backend=await import(pathToFileURL(path.join(resourceRoot,'macos/plugin/index.js')).href);
 await backend.prepareFeedback('desktop_key');const sessionFifo=process.env.MIRA_CU_FIFO;assert.ok(fs.existsSync(sessionFifo));
 const owned=()=>{try{return execFileSync('/usr/bin/pgrep',['-P',String(process.pid),'-f',overlayPath],{encoding:'utf8'}).trim().split('\\n').filter(Boolean).map(Number)}catch{return[]}};
 assert.equal(owned().length,1);settings.setCursor(false);for(let i=0;i<40&&owned().length;i++)await delay(25);assert.equal(owned().length,0);
 settings.setCursor(true);await backend.prepareFeedback('desktop_type');assert.equal(owned().length,1);await backend.close();backend=undefined;assert.equal(fs.existsSync(path.dirname(sessionFifo)),false);for(let i=0;i<40&&owned().length;i++)await delay(25);assert.equal(owned().length,0);report.checks.push('Existing backend follows persisted off/on switch, restarts its own overlay, and removes native children and session files on close');
 win=new BrowserWindow({show:false,width:1100,height:960,webPreferences:{backgroundThrottling:false}});await win.loadFile(path.join(temporary,'fixture.html'));await delay(250);
 for(const theme of ['light','dark'])for(const ready of [false,true]){
  await win.webContents.executeJavaScript('document.documentElement.classList.toggle("dark",'+(theme==='dark')+');window.setFixture({screenRecording:'+ready+',accessibility:'+ready+'})');await delay(80);
  const info=await win.webContents.executeJavaScript('({text:document.body.innerText,width:document.documentElement.scrollWidth,viewport:innerWidth,buttons:[...document.querySelectorAll("button")].filter(b=>b.innerText.includes("前往授权")).length,switch:document.querySelector("[role=switch]")?.getAttribute("aria-checked")})');
  assert.ok(info.text.includes(ready?'已就绪，可以控制电脑':'还需要完成设置'));assert.equal(info.buttons,ready?0:2);assert.ok(info.width<=info.viewport);assert.equal(info.switch,'true');
  const name=theme+'-'+(ready?'ready':'permissions')+'.png';fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage()).toPNG());report.screenshots.push(name);
 }
 await win.webContents.executeJavaScript('document.querySelector("[role=switch]").click()');await delay(80);assert.equal(await win.webContents.executeJavaScript('document.querySelector("[role=switch]").getAttribute("aria-checked")'),'false');
 report.checks.push('Real React detail and application CSS render missing/ready permissions in both themes without horizontal overflow; cursor switch saves through the host');
 if(report.nativeStatus.screenRecording && report.nativeStatus.accessibility){
  await win.loadURL('data:text/html,'+encodeURIComponent('<meta charset="utf-8"><body style="font:18px -apple-system;padding:32px;background:#fafafa"><h2>Mira 电脑控制验证</h2><p>仅操作此测试窗口</p><button style="width:220px;height:44px" onclick="document.body.dataset.clicked=1">测试点击</button><input style="display:block;margin-top:18px;width:300px;height:36px;font-size:18px" aria-label="测试输入"></body>'));
  win.setSize(600,380);win.center();win.show();win.focus();await delay(300);
  const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
  const client=new Client({name:'mira-mac-native-verification',version:'1'});const transport=new StdioClientTransport({command:process.execPath,args:[path.join(resourceRoot,'macos/server.mjs')],env:{...process.env,ELECTRON_RUN_AS_NODE:'1',MIRA_CU_CONFIG:configPath},stderr:'ignore'});
  try{
   await client.connect(transport);
   const content=win.getContentBounds();const rect=await win.webContents.executeJavaScript('(()=>{const r=document.querySelector("button").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
   const click=await client.callTool({name:'desktop_click',arguments:{pid:process.pid,x:content.x+rect.x,y:content.y+rect.y}});assert.ok(!click.isError,JSON.stringify(click));await delay(120);assert.equal(await win.webContents.executeJavaScript('document.body.dataset.clicked'),'1');
   await win.webContents.executeJavaScript('document.querySelector("input").focus()');
   const type=await client.callTool({name:'desktop_type',arguments:{pid:process.pid,text:'Mira 光标测试'}});assert.ok(!type.isError,JSON.stringify(type));await delay(120);assert.equal(await win.webContents.executeJavaScript('document.querySelector("input").value'),'Mira 光标测试');
   const key=await client.callTool({name:'desktop_key',arguments:{pid:process.pid,keycode:123}});assert.ok(!key.isError,JSON.stringify(key));
   const shot=await client.callTool({name:'desktop_screenshot',arguments:{pid:process.pid}});assert.ok(!shot.isError,JSON.stringify(shot));assert.ok(shot.content.some(block=>block.type==='image'));
   const bounds=win.getContentBounds();execFileSync('/usr/sbin/screencapture',['-x','-R'+[bounds.x,bounds.y,bounds.width,bounds.height].join(','),path.join(output,'native-mira-cursor.png')]);report.screenshots.push('native-mira-cursor.png');
   report.checks.push('Real bundled MCP performs coordinate click, Chinese text input, key and screenshot only in its owned Electron test window; screen crop captures native Mira cursor');
  }finally{await transport.send({jsonrpc:'2.0',method:'mira/shutdown'}).catch(()=>{});await client.close()}
 }else report.checks.push('Real desktop input skipped because native TCC permissions are missing');
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error);process.exitCode=1}finally{overlay?.kill('SIGTERM');await backend?.close();win?.destroy();clearTimeout(deadline);app.exit(process.exitCode||0)}});
`)
  const electron = (await import('electron')).default
  const child = spawn(electron, [entry], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } })
  const code = await new Promise((done, fail) => { child.once('error', fail); child.once('exit', done) })
  if (code !== 0) throw new Error('macOS computer settings verification failed: ' + code)
} finally { await rm(temporary, { recursive: true, force: true }) }
