import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

const run = promisify(execFile)
it('keeps reference chips atomic during native mouse selection, arrow movement, typing and deletion', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'mira-prompt-atomic-'))
  let child: ReturnType<typeof execFile> | undefined
  try {
    await build({ stdin: { contents: renderer, resolveDir: process.cwd(), loader: 'tsx' }, outfile: resolve(directory, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl' } })
    await writeFile(resolve(directory, 'main.cjs'), main)
    await writeFile(resolve(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><style>body{padding:40px;font:18px system-ui}[contenteditable=true]{border:1px solid #888;min-height:100px;padding:16px}.mira-prompt-reference{color:purple}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>')
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
    const execution = run(createRequire(import.meta.url)('electron'), [resolve(directory, 'main.cjs')], { env, detached: true, timeout: 20000 })
    child = execution.child
    const { stdout } = await execution
    const prefix = 'MIRA_PROMPT_ATOMIC='
    const result = JSON.parse(stdout.split('\n').find(line => line.startsWith(prefix))!.slice(prefix.length))
    expect(result.errors).toEqual([])
    for (const item of result.cases) {
      expect(item, item.kind).toMatchObject({ clickInside: false, right: true, left: true, typed: true, backspace: true, undo: true, copy: true, delete: true })
    }
  } finally {
    if (child?.pid) { try { if (process.platform === 'win32') child.kill(); else process.kill(-child.pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)

const renderer = `
import React,{useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {MiraPromptEditor} from ${JSON.stringify(resolve('apps/harness-react/src/components/composer/MiraPromptEditor.tsx'))}
import {serializeMiraPromptDocument} from ${JSON.stringify(resolve('apps/harness-react/src/lib/prompt-editor-document.ts'))}
window.errors=[];window.addEventListener('error',e=>window.errors.push(e.message))
const references={
 file:{id:'file',kind:'file',label:'readme.md',value:'src/readme.md',text:'@src/readme.md'},
 folder:{id:'folder',kind:'file',label:'documents',value:'docs',text:'@docs/'},
 skill:{id:'skill',kind:'skill',label:'impeccable',value:'impeccable',text:'[$impeccable](mira-skill:impeccable)'},
 plugin:{id:'plugin',kind:'plugin',label:'review-kit',value:'review-kit@local',text:'[@review-kit](plugin://review-kit@local)'},
 session:{id:'session',kind:'session',label:'相关对话',value:'session',text:'用户：需求\\n助手：回复\\n'},
 command:{id:'command',kind:'command',label:'持续目标',value:'builtin:goal',text:'/goal'},
 agent:{id:'agent',kind:'agent',label:'审查智能体',value:'reviewer',text:'@reviewer'},
}
function Fixture(){
 const [scenario,setScenario]=useState({kind:'file',revision:0})
 window.reset=kind=>setScenario(s=>({kind,revision:s.revision+1}))
 return <Editor key={scenario.revision} reference={references[scenario.kind]} />
}
function Editor({reference}){
 const [document,setDocument]=useState({version:1,parts:[{type:'text',text:'A'},{type:'reference',reference},{type:'text',text:'B'}]}),ref=useRef(null)
 window.prompt=ref;window.documentState=document;window.promptText=serializeMiraPromptDocument(document);window.reference=reference
 return <MiraPromptEditor ref={ref} text={window.promptText} document={document} aria-label="任务内容" onChange={setDocument} onError={e=>window.errors.push(e.message)} />
}
createRoot(document.getElementById('root')).render(<Fixture />)
`

const main = `
const {app,BrowserWindow}=require('electron'),{join}=require('node:path')
app.setPath('userData',join(__dirname,'profile'))
app.whenReady().then(async()=>{
 try{
  const win=new BrowserWindow({width:1000,height:600,show:false,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}})
  await win.loadFile(join(__dirname,'index.html'))
  const inspect=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(done=>setTimeout(done,ms))
  const wait=async code=>{const deadline=Date.now()+5000;while(Date.now()<deadline){if(await inspect(code))return;await pause(10)}throw Error('Timeout: '+code)}
  await wait('window.prompt?.current&&document.querySelector("[data-mira-prompt-reference]")')
  win.webContents.debugger.attach('1.3')
  const key=async(name,code)=>{const event={key:name,code:name,windowsVirtualKeyCode:code};await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',...event});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',...event});await pause(30)}
  const select=async offset=>{await inspect('window.prompt.current.focus();window.prompt.current.setSelectionRange('+offset+','+offset+')');await pause(20)}
  const cases=[]
  for(const kind of ['file','folder','skill','plugin','session','command','agent']){
   await inspect('window.reset('+JSON.stringify(kind)+')');await pause(40)
   const at=await inspect('(()=>{const r=document.querySelector("[data-mira-prompt-reference]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
   await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...at,button:'left',clickCount:1})
   await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...at,button:'left',clickCount:1});await pause(30)
   const clickInside=await inspect('(()=>{const s=getSelection(),e=document.querySelector("[data-mira-prompt-reference]");return s.isCollapsed&&e.contains(s.focusNode)&&s.focusOffset>0&&s.focusOffset<s.focusNode.textContent.length})()')
   const end=await inspect('1+window.reference.text.length')
   await select(1);await key('ArrowRight',39)
   const right=await inspect('window.prompt.current.getSelectionRange().start==='+end)
   await key('ArrowLeft',37)
   const left=await inspect('window.prompt.current.getSelectionRange().start===1')
   await select(end);await win.webContents.debugger.sendCommand('Input.insertText',{text:'X'});await pause(30)
   const typed=await inspect('window.promptText==="A"+window.reference.text+"XB"&&window.documentState.parts.filter(p=>p.type==="reference").length===1')
   await inspect('window.reset('+JSON.stringify(kind)+')');await pause(40)
   await select(end);await key('Backspace',8)
   const backspace=await inspect('window.promptText==="AB"&&!document.querySelector("[data-mira-prompt-reference]")')
   await inspect('document.querySelector("[role=textbox]").dispatchEvent(new CustomEvent("mira-prompt-history",{detail:"undo"}))');await pause(30)
   const undo=await inspect('window.promptText==="A"+window.reference.text+"B"&&!!document.querySelector("[data-mira-prompt-reference]")')
   await inspect('window.prompt.current.setSelectionRange(0,'+(end+1)+')');await pause(20)
   const copied=await inspect('(()=>{const e=new Event("copy",{bubbles:true,cancelable:true});let text="";Object.defineProperty(e,"clipboardData",{value:{setData:(type,value)=>{if(type==="text/plain")text=value}}});document.querySelector("[role=textbox]").dispatchEvent(e);return text})()')
   const copy=copied===await inspect('"A"+window.reference.text+"B"')
   await select(1);await key('Delete',46)
   const deleted=await inspect('window.promptText==="AB"&&!document.querySelector("[data-mira-prompt-reference]")')
   cases.push({kind,clickInside,right,left,typed,backspace,undo,copy,delete:deleted})
  }
  console.log('MIRA_PROMPT_ATOMIC='+JSON.stringify({cases,errors:await inspect('window.errors')}))
  win.destroy();app.exit(0)
 }catch(error){console.error(error);app.exit(1)}
})
`
