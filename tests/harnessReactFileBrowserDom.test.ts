import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

const run = promisify(execFile)
it('opens the HTML file menu in a real Electron browser with local CSS, scripts and images', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'mira-file-browser-dom-'))
  let child: ReturnType<typeof execFile> | undefined
  try {
    await build({ stdin: { contents: renderer, resolveDir: process.cwd(), loader: 'tsx' }, outfile: resolve(directory, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl' } })
    await build({ stdin: { contents: main, resolveDir: process.cwd(), loader: 'ts' }, outfile: resolve(directory, 'main.cjs'), bundle: true, platform: 'node', external: ['electron'] })
    await run(resolve('node_modules/.bin/tailwindcss'), ['-i', resolve('apps/harness-react/src/styles/app.css'), '-o', resolve(directory, 'fixture.css'), '--minify'])
    await writeFile(resolve(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>')
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    const execution = run(createRequire(import.meta.url)('electron'), [resolve(directory, 'main.cjs')], { env, detached: true, timeout: 20000 })
    child = execution.child
    const { stdout } = await execution
    const result = JSON.parse(stdout.split('\n').find(line => line.startsWith('MIRA_FILE_BROWSER='))!.slice(18))
    expect(result.errors).toEqual([])
    expect(result.menu).toContain('用内置浏览器打开')
    expect(result.menu).toContain('在 Finder 中显示')
    expect(result.cssMenu).not.toContain('用内置浏览器打开')
    expect(result.calls).toEqual(['原型 #/index.HTML'])
    expect(result.page).toEqual({ title: '本地原型就绪', color: 'rgb(180, 20, 40)', image: true, node: 'undefined' })
    expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    expect(result.referenceHover).toEqual({ guestVisible: true, sameGuest: true, pageRetained: true })
    expect(result.fileHover).toEqual({ guestVisible: true, previewVisible: true, samePreview: true, reads: 1 })
    expect(result.previewWatch.registration).toEqual({ samePreview: true, scrollTop: 160, loading: false })
    expect(result.previewWatch.expansion).toEqual({ samePreview: true, scrollTop: 160, loading: false })
    expect(result.previewWatch.afterExpansion).toEqual({ samePreview: true, scrollTop: 160, loading: false })
    expect(result.previewWatch.changed).toBe(true)
    expect(result.modalHidden).toBe(true)
  } finally {
    if (child?.pid) { try { if (process.platform === 'win32') child.kill(); else process.kill(-child.pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)

const renderer = `
import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {ProjectFileDrawer} from ${JSON.stringify(resolve('apps/harness-react/src/components/workspace/ProjectFileDrawer.tsx'))}
import {MiraBrowserPanel} from ${JSON.stringify(resolve('apps/harness-react/src/components/workspace/MiraBrowserPanel.tsx'))}
import {MiraHostedBrowsers} from ${JSON.stringify(resolve('src/platform/miraHostedBrowsers.ts'))}
import {applyHostTheme} from ${JSON.stringify(resolve('apps/harness-react/src/platform/theme.ts'))}
import {MiraBrowserContexts} from ${JSON.stringify(resolve('apps/harness-react/src/components/composer/MiraBrowserContexts.tsx'))}
import {MiraMessageReference} from ${JSON.stringify(resolve('apps/harness-react/src/components/conversation/MiraMessageReference.tsx'))}
import {FilePreviewPanel} from ${JSON.stringify(resolve('apps/harness-react/src/components/workspace/FilePreviewPanel.tsx'))}
import {WorkspaceWatchDataSource} from ${JSON.stringify(resolve('apps/harness-react/src/lib/workspace-watch.ts'))}
window.errors=[];window.calls=[];window.states=[];window.theme=dark=>applyHostTheme(document.getElementById('root'),{theme:dark?'dark':'light'})
window.addEventListener('error',e=>window.errors.push(e.message))
const listeners=new Set(),hosted=new MiraHostedBrowsers(()=>document.getElementById('stage'),state=>{window.states.push(state);listeners.forEach(fn=>fn(state))})
const controller={
 listFilesFor:async()=>({entries:[{path:'原型 #/index.HTML',name:'index.HTML',type:'file'},{path:'style.css',name:'style.css',type:'file'}]}),
 supportsWorkspaceGit:false,getPreference:async()=>null,setPreference:async()=>{},registerBeforeNavigation:()=>()=>{},
 supportsWorkspaceWatch:true,watchFilesFor:async()=>({watchId:'preview-watch'}),unwatchFilesFor:async()=>{},onWorkspaceFilesChanged:fn=>{window.emitFileChange=fn;return()=>{}},
 onBrowserEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
 navigateBrowserFor:async(sessionId,url,bounds,browserId,visible)=>hosted.request({method:'browser.navigate',sessionId,url,bounds,browserId,visible},async()=>{}),
 setBrowserViewportFor:async(sessionId,geometry,browserId)=>hosted.request({method:'browser.viewport',sessionId,...geometry,browserId},async()=>({desktopZoomFactor:1})),
 controlBrowserFor:async(sessionId,action,browserId)=>hosted.control(sessionId,action,browserId),closeBrowserFor:async(sessionId,browserId)=>hosted.control(sessionId,'close',browserId),
 pickBrowserElementFor:async()=>({status:'cancelled'}),revealWorkspaceFile:async()=>{}
}
window.fileReads=0;window.previewContent='# File preview retained'+Array.from({length:100},(_,i)=>'\\n\\nParagraph '+i).join('');controller.readFileFor=async()=>{window.fileReads++;window.previewReadPending=true;const content=window.previewContent;if(window.previewReadDelay)await new Promise(done=>setTimeout(done,window.previewReadDelay));window.previewReadPending=false;return {path:'note.md',content}}
const workspaceWatch=window.previewWatchSource=new WorkspaceWatchDataSource(controller,'a');workspaceWatch.activate()
const webReference={id:'web',kind:'web',label:'网页元素',value:'https://mira.test',text:''}
function Fixture(){const [url,setUrl]=useState(''),[preview,setPreview]=useState(false);return <><div className="pilot-workbench" style={{height:'100vh'}}><div style={{width:520,flexShrink:0,height:'100vh'}}>{preview?<FilePreviewPanel controller={controller} sessionId="a" path="note.md" directory="/project" workspaceWatch={workspaceWatch} active />:<ProjectFileDrawer controller={controller} sessionId="a" directory="/project" expandedPaths={[]} onExpandedPathsChange={()=>{}} onOpenFile={()=>setPreview(true)} onOpenBrowser={async path=>{window.calls.push(path);setUrl(new URLSearchParams(location.search).get('preview'))}} onBack={()=>{}} onOpenDirectory={()=>{}} />}</div><section style={{flex:1,display:'flex',minWidth:0}}>{url?<MiraBrowserPanel controller={controller} sessionId="a" browserId="browser:html" active initialUrl={url} onRequestHandled={()=>{}} onUrlChange={()=>{}} />:<p style={{padding:32}}>右键 HTML 文件，在内置浏览器中预览。</p>}</section></div><div style={{position:'fixed',bottom:20,left:12,width:220,zIndex:5}}><MiraBrowserContexts references={[webReference]} /><span data-test-file-reference><MiraMessageReference reference={{id:'file',kind:'file',label:'note.md',value:'note.md',text:'note.md'}} /></span><span data-test-folder-reference><MiraMessageReference reference={{id:'folder',kind:'file',label:'docs',value:'docs/',text:'docs/'}} /></span><button onClick={()=>setPreview(true)}>预览说明</button></div><div id="stage" style={{position:'fixed',inset:0,pointerEvents:'none'}} /></>}
applyHostTheme(document.getElementById('root'),{theme:'light'});createRoot(document.getElementById('root')).render(<Fixture />)
`

const main = `
import {app,BrowserWindow,webContents} from 'electron'
import {mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {MiraWorkspaceHtml} from ${JSON.stringify(resolve('electron/services/miraWorkspaceHtml.ts'))}
import {HOSTED_BROWSER_PARTITION,isAllowedHostedBrowserUrl} from ${JSON.stringify(resolve('electron/security/hostedBrowser.ts'))}
app.setPath('userData',join(__dirname,'profile'))
const previews=new MiraWorkspaceHtml()
app.whenReady().then(async()=>{
 try{
  const root=join(__dirname,'site');await mkdir(join(root,'原型 #'),{recursive:true})
  await writeFile(join(root,'原型 #','index.HTML'),'<html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"><script src="main.js"></script></head><body><h1>本地 HTML 原型</h1><img id="sample" src="mark.svg"></body></html>')
  await writeFile(join(root,'原型 #','style.css'),'body{font-family:system-ui;padding:28px}h1{color:rgb(180,20,40)}img{width:40px;height:40px}')
  await writeFile(join(root,'原型 #','main.js'),'document.title="本地原型就绪"')
  await writeFile(join(root,'原型 #','mark.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>')
  const url=await previews.open(root,'原型 #/index.HTML',{grantId:'test',webContentsId:1},()=>{})
  const win=new BrowserWindow({width:1440,height:900,show:false,webPreferences:{webviewTag:true,contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}})
  win.webContents.on('will-attach-webview',(event,prefs,params)=>{if(params.partition!==HOSTED_BROWSER_PARTITION||!isAllowedHostedBrowserUrl(params.src)){event.preventDefault();return}delete prefs.preload;prefs.nodeIntegration=false;prefs.sandbox=true;prefs.contextIsolation=true;prefs.webSecurity=true})
  await win.loadFile(join(__dirname,'index.html'),{query:{preview:url}})
  const inspect=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(r=>setTimeout(r,ms))
  const wait=async code=>{const deadline=Date.now()+7000;while(Date.now()<deadline){if(await inspect(code))return;await pause(20)}throw Error('Timeout: '+code+' '+JSON.stringify(await inspect('({errors:window.errors,body:document.body.innerText})'))) }
  await wait('!!document.querySelector("[data-file-tree-path]")')
  const menu=async path=>{await inspect('document.querySelector('+JSON.stringify('[data-file-tree-path="'+path+'"]')+').dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:180,clientY:180}))');await wait('!!document.querySelector("[role=menu]")');return inspect('[...document.querySelectorAll("[role=menuitem]")].map(e=>e.textContent)')}
  const capture=async name=>{if(process.env.MIRA_FILE_CAPTURE_DIR){await mkdir(process.env.MIRA_FILE_CAPTURE_DIR,{recursive:true});await writeFile(join(process.env.MIRA_FILE_CAPTURE_DIR,name+'.png'),(await win.webContents.capturePage()).toPNG())}}
  const htmlMenu=await menu('原型 #/index.HTML');await pause(180);await capture('menu-light')
  await inspect('window.theme(true)');await pause(180);await capture('menu-dark')
  win.webContents.debugger.attach('1.3')
  const at=await inspect('(() => {const r=[...document.querySelectorAll("[role=menuitem]")].find(e=>e.textContent.includes("用内置浏览器打开")).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...at,button:'left',clickCount:1})
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...at,button:'left',clickCount:1})
  await wait('!document.querySelector("[role=menu][data-state=open]")')
  await wait('window.states.some(s=>s.ready&&s.title==="本地原型就绪"&&!s.loading)')
  const id=await inspect('document.querySelector("webview").getWebContentsId()'),guest=webContents.fromId(id)
  const page=await guest.executeJavaScript('({title:document.title,color:getComputedStyle(document.querySelector("h1")).color,image:document.querySelector("#sample").naturalWidth===40,node:typeof require})')
  await pause(250);await capture('browser-dark')
  if(process.env.MIRA_FILE_CAPTURE_DIR)await writeFile(join(process.env.MIRA_FILE_CAPTURE_DIR,'browser-page.png'),(await guest.capturePage()).toPNG())
  const cssMenu=await menu('style.css')
  await inspect('document.querySelector("[role=menu]").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
  await wait('!document.querySelector("[role=menu][data-state=open]")')
  const hover=async selector=>{const at=await inspect('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',...at});await pause(150)}
  const visible=()=>inspect('(()=>{const e=document.querySelector("webview");return getComputedStyle(e).display!=="none"&&getComputedStyle(e.parentElement).display!=="none"})()')
  await hover('.mira-browser-contexts__trigger');await wait('!!document.querySelector("[data-mira-browser-context-details][data-state=open]")')
  const referenceHover={guestVisible:await visible(),sameGuest:await inspect('document.querySelector("webview").getWebContentsId()')===id,pageRetained:await guest.executeJavaScript('document.title')==='本地原型就绪'}
  await hover('[data-test-file-reference]');await wait('!document.querySelector("[data-mira-browser-context-details][data-state=open]")')
  await inspect('[...document.querySelectorAll("button")].find(b=>b.textContent==="预览说明").click()')
  await wait('!!document.querySelector(".mira-file-preview__markdown")')
  await inspect('window.previewNode=document.querySelector(".mira-file-preview__markdown")')
  await hover('.mira-browser-contexts__trigger');await wait('!!document.querySelector("[data-mira-browser-context-details][data-state=open]")')
  await hover('[data-test-file-reference]');await hover('[data-test-folder-reference]')
  const fileHover=await inspect('(()=>{const n=document.querySelector(".mira-file-preview__markdown"),e=document.querySelector("webview");return {guestVisible:getComputedStyle(e).display!=="none"&&getComputedStyle(e.parentElement).display!=="none",previewVisible:n.getClientRects().length>0&&n.textContent.includes("File preview retained"),samePreview:n===window.previewNode,reads:window.fileReads}})()')
  const previewState=()=>inspect('({samePreview:document.querySelector(".mira-file-preview__markdown")===window.previewNode,scrollTop:window.previewNode.scrollTop,loading:document.querySelector(".mira-file-preview__body").textContent.includes("正在读取文件")})')
  await inspect('window.previewNode.scrollTop=160;window.previewReadDelay=150;window.previewWatchSource.setPaths([""])')
  await wait('window.previewReadPending')
  const registration=await previewState()
  await wait('!window.previewReadPending')
  await inspect('window.previewWatchSource.setPaths(["","other"])')
  await wait('window.previewReadPending')
  const expansion=await previewState()
  await wait('!window.previewReadPending')
  const afterExpansion=await previewState()
  await inspect('window.previewContent="# Updated preview";window.emitFileChange({sessionId:"a",watchId:"preview-watch",directory:"/project",paths:[""]})')
  await wait('document.querySelector(".mira-file-preview__markdown")?.textContent.includes("Updated preview")')
  const previewWatch={registration,expansion,afterExpansion,changed:true}
  await inspect('(()=>{const d=document.createElement("div");d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");d.style.cssText="position:fixed;left:20px;top:20px;width:100px;height:100px";document.getElementById("root").append(d)})()')
  await wait('getComputedStyle(document.querySelector("webview")).display==="none"')
  const modalHidden=!await visible()
  console.log('MIRA_FILE_BROWSER='+JSON.stringify({menu:htmlMenu,cssMenu,page,url:guest.getURL(),referenceHover,fileHover,previewWatch,modalHidden,calls:await inspect('window.calls'),errors:await inspect('window.errors')}))
  previews.closeAll();win.destroy();app.exit(0)
 }catch(error){console.error(error);previews.closeAll();app.exit(1)}
})
`
