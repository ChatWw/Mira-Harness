import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

const run = promisify(execFile)
it('scrolls conversation text with native arrow keys while preserving input and nested scrolling', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'mira-conversation-keys-'))
  let child: ReturnType<typeof execFile> | undefined
  try {
    await build({ stdin: { contents: renderer, resolveDir: process.cwd(), loader: 'tsx' }, outfile: resolve(directory, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic' })
    await writeFile(resolve(directory, 'main.cjs'), main)
    await writeFile(resolve(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}#root{display:flex;flex-direction:column;height:100vh}.mira-message-viewport{flex:1;min-height:0;overflow:auto}.mira-message-column{padding:20px}p{height:70px;margin:0}#command{height:100px;overflow:auto}#composer{height:80px;white-space:pre-wrap}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>')
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    const execution = run(createRequire(import.meta.url)('electron'), [resolve(directory, 'main.cjs')], { env, detached: true, timeout: 20000 })
    child = execution.child
    const { stdout } = await execution
    const result = JSON.parse(stdout.split('\n').find(line => line.startsWith('MIRA_CONVERSATION_KEYS='))!.slice(23))
    expect(result.errors).toEqual([])
    expect(result.textClickFocus).toBe(true)
    expect(result.arrowUp).toBe(true)
    expect(result.arrowDown).toBe(true)
    expect(result.retainsReadingOnGrowth).toBe(true)
    expect(result.tabFocus).toBe(true)
    expect(result.composerCaret).toBe(true)
    expect(result.composerRetainsScroll).toBe(true)
    expect(result.nestedScroll).toBe(true)
    expect(result.nestedRetainsScroll).toBe(true)
  } finally {
    if (child?.pid) { try { if (process.platform === 'win32') child.kill(); else process.kill(-child.pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)

const renderer = `
import React,{useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {MiraConversationViewport} from ${JSON.stringify(resolve('apps/harness-react/src/components/conversation/MiraConversationViewport.tsx'))}
window.errors=[];window.addEventListener('error',e=>window.errors.push(e.message))
function Fixture(){
 const [count,setCount]=useState(30),[bottom,setBottom]=useState(true)
 const viewportRef=useRef(null),actionsRef=useRef(null),timelineRef=useRef(null)
 window.viewport=viewportRef;window.actions=actionsRef;window.appendReply=()=>setCount(n=>n+1)
 return <><button id="before">前一个控件</button><MiraConversationViewport memoryKey="keyboard" viewportRef={viewportRef} actionsRef={actionsRef} timelineRef={timelineRef} active ready hasContent onBottomChange={setBottom}><div className="mira-message-column">{Array.from({length:count},(_,i)=><p key={i}>对话正文第 {i+1} 段</p>)}<button>消息操作</button><div id="command" tabIndex={0} role="region" aria-label="命令输出">{Array.from({length:12},(_,i)=><p key={i}>命令行 {i}</p>)}</div></div></MiraConversationViewport><div id="composer" contentEditable suppressContentEditableWarning role="textbox" aria-label="任务内容">{'第一行输入\\n第二行输入'}</div><output>{bottom?'底部':'阅读历史'}</output></>
}
createRoot(document.getElementById('root')).render(<Fixture />)
`

const main = `
const {app,BrowserWindow}=require('electron'),{join}=require('node:path')
app.setPath('userData',join(__dirname,'profile'))
app.whenReady().then(async()=>{
 try{
  const win=new BrowserWindow({width:1000,height:800,show:false,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}})
  await win.loadFile(join(__dirname,'index.html'))
  const inspect=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(done=>setTimeout(done,ms))
  const wait=async code=>{const deadline=Date.now()+5000;while(Date.now()<deadline){if(await inspect(code))return;await pause(20)}throw Error('Timeout: '+code)}
  await wait('window.actions?.current&&!window.actions.current.isRestoring()')
  win.webContents.debugger.attach('1.3')
  const key=async(name,code)=>{const event={key:name,code:name,windowsVirtualKeyCode:code};await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',...event});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',...event});await pause(220)}
  const click=async selector=>{const at=await inspect('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+20,y:r.y+20}})()');await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...at,button:'left',clickCount:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...at,button:'left',clickCount:1});await pause(50)}
  await inspect('document.getElementById("composer").focus()')
  await click('.mira-message-column p:nth-child(25)')
  const textClickFocus=await inspect('document.activeElement===window.viewport.current')
  const beforeUp=await inspect('window.viewport.current.scrollTop')
  await key('ArrowUp',38)
  const afterUp=await inspect('window.viewport.current.scrollTop'),arrowUp=afterUp<beforeUp
  await inspect('window.appendReply()');await pause(150)
  const retainsReadingOnGrowth=await inspect('!window.actions.current.isFollowing()&&Math.abs(window.viewport.current.scrollTop-'+afterUp+')<1')
  await key('ArrowDown',40)
  const arrowDown=await inspect('window.viewport.current.scrollTop>'+afterUp)
  await inspect('document.getElementById("before").focus()');await key('Tab',9)
  const tabFocus=await inspect('document.activeElement===window.viewport.current')
  await inspect('(()=>{const e=document.getElementById("composer");e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})()')
  await inspect('window.caretOffset=()=>{const r=document.createRange();r.selectNodeContents(document.getElementById("composer"));r.setEnd(getSelection().focusNode,getSelection().focusOffset);return r.toString().length};undefined')
  const composerBefore=await inspect('({top:window.viewport.current.scrollTop,offset:window.caretOffset()})')
  await key('ArrowUp',38)
  const composerCaret=await inspect('window.caretOffset()<'+composerBefore.offset),composerRetainsScroll=await inspect('window.viewport.current.scrollTop==='+composerBefore.top)
  await inspect('document.getElementById("command").focus()');await pause(50)
  const nestedBefore=await inspect('({top:window.viewport.current.scrollTop,inner:document.getElementById("command").scrollTop})')
  await key('ArrowDown',40)
  const nestedScroll=await inspect('document.getElementById("command").scrollTop>'+nestedBefore.inner),nestedRetainsScroll=await inspect('window.viewport.current.scrollTop==='+nestedBefore.top)
  console.log('MIRA_CONVERSATION_KEYS='+JSON.stringify({textClickFocus,arrowUp,arrowDown,retainsReadingOnGrowth,tabFocus,composerCaret,composerRetainsScroll,nestedScroll,nestedRetainsScroll,errors:await inspect('window.errors')}))
  win.destroy();app.exit(0)
 }catch(error){console.error(error);app.exit(1)}
})
`
