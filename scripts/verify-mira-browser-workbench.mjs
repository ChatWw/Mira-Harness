import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const root = process.cwd(), folder = await mkdtemp(resolve('node_modules/.cache/mira-browser-workbench-'))
const image = resolve('node_modules/.cache/mira-browser-workbench.png')
try {
  await build({ stdin: { contents: `
import { app, BrowserWindow, webContents } from 'electron'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
app.setAppPath(${JSON.stringify(root)})
const timeout = setTimeout(() => { console.error('Workbench smoke timed out'); app.exit(1) }, 60000)
const waitFor = async fn => { for (let i=0;i<200;i++) { const value = await fn(); if (value) return value; await new Promise(resolve=>setTimeout(resolve,100)) } throw Error('Workbench state did not settle') }
let server
process.on('unhandledRejection', error=>{console.error(error);server?.close();app.exit(1)})
void (async () => {
await import(pathToFileURL(${JSON.stringify(resolve('out/main/main.js'))}).href)
await app.whenReady()
try {
 const window = await waitFor(()=>BrowserWindow.getAllWindows()[0])
 await waitFor(async()=>{try{return await window.webContents.executeJavaScript('Boolean(window.platform?.createHarnessSession)')}catch{return false}})
 const session = await window.webContents.executeJavaScript('(async()=>{const s=await window.platform.createHarnessSession();await window.platform.savePreference("first-party.mira-harness.active-session",s.id);return s})()')
 window.webContents.reload()
 await waitFor(async()=>{try {const frames=window.webContents.mainFrame.framesInSubtree;for(const frame of frames){if(frame.url.includes('/apps/micro-mira-harness/') && await frame.executeJavaScript(${JSON.stringify(`Boolean(document.querySelector('[aria-label="任务内容"]'))`)}))return true}}catch{}return false})
 server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<title>Mira 内置浏览器验收</title><h1>Mira 内置浏览器验收</h1><label>名称 <input aria-label="名称"></label><button>确认</button><p>此页面由当前任务的内置浏览器显示。</p>')})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const url='http://127.0.0.1:'+server.address().port+'/'
 window.webContents.send('harness:event',{sessionId:session.id,type:'browser-open',payload:{browserId:'browser:smoke',url}})
 const guest=await waitFor(()=>webContents.getAllWebContents().find(w=>w.getType()==='webview'&&w.getURL()===url&&!w.isLoadingMainFrame()))
 assert.equal(guest.hostWebContents,window.webContents)
 assert.equal(guest.getTitle(),'Mira 内置浏览器验收')
 const binding=await waitFor(async()=>{const value=await window.webContents.executeJavaScript(${JSON.stringify(`(()=>{const g=document.querySelector('webview[data-browser-resource-id="browser:smoke"]');return g?{sessionId:g.dataset.browserSessionId,rect:{width:g.getBoundingClientRect().width,height:g.getBoundingClientRect().height}}:null})()`)});return value?.rect.width>200&&value?.rect.height>100?value:undefined})
 assert.equal(binding.sessionId,session.id);assert.ok(binding.rect.width>200&&binding.rect.height>100)
 await writeFile(${JSON.stringify(image)},(await window.webContents.capturePage()).toPNG())
 console.log('PASS: built Mira Vue shell + React workbench + browser-open + actual webview + task identity + visible geometry')
 console.log('Screenshot: '+${JSON.stringify(image)})
 clearTimeout(timeout);server.close();app.exit(0)
} catch(error){console.error(error);clearTimeout(timeout);server?.close();app.exit(1)}
})()
`, loader:'ts',resolveDir:root },outfile:join(folder,'main.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external' })
  const env = {...process.env,MIRA_TEST_HOME:join(folder,'home')}; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  const child=spawn(createRequire(import.meta.url)('electron'),[join(folder,'main.cjs')],{stdio:'inherit',env})
  const code=await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',done)})
  if(code!==0)throw Error(`Workbench smoke failed: ${code}`)
} finally { await rm(folder,{recursive:true,force:true}) }
