import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const electron = createRequire(import.meta.url)('electron') as string

describe('sidebar virtual lists in real Chromium layout and Radix interactions', () => {
  it('bounds mounted rows, measures nested shared-scroll lists and keeps focused/menu/drag rows without resetting the viewport', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'mira-sidebar-virtual-list-'))
    let child: ReturnType<typeof execFile> | undefined
    try {
      await build({ stdin: { contents: fixture(), resolveDir: process.cwd(), loader: 'tsx' }, outfile: resolve(directory, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } })
      await run(resolve('node_modules/.bin/tailwindcss'), ['-i', resolve('apps/harness-react/src/styles/app.css'), '-o', resolve(directory, 'fixture.css'), '--minify'])
      await writeFile(resolve(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link id="sidebar-style" rel="stylesheet" href="fixture.css" media="not all"><style>body{margin:0}.fixture-row button{box-sizing:border-box;height:32px}#viewport{width:264px;height:320px;overflow:auto;overflow-anchor:none}#before{height:128px}.fixture-row{height:32px;display:flex}.fixture-header{height:40px}</style></head><body><div id="viewport"><div id="before"></div><div id="root" style="height:12000px"></div></div><button id="outside">outside</button><script src="fixture.js"></script></body></html>')
      await writeFile(resolve(directory, 'main.cjs'), main)
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
      const execution = run(electron, [resolve(directory, 'main.cjs')], { env, detached: true, timeout: 25000, maxBuffer: 1024 * 1024 }); child = execution.child
      const { stdout } = await execution
      const result = JSON.parse(stdout.split('\n').find(line => line.startsWith('MIRA_VIRTUAL_RESULT='))!.slice('MIRA_VIRTUAL_RESULT='.length))
      expect(result.errors).toEqual([])
      expect(result.initial.scroll).toBe(4096)
      expect(result.initial.count).toBeGreaterThan(10); expect(result.initial.count).toBeLessThan(40)
      expect(result.initial.keys).toContain('row-124')
      expect(result.initial.firstTop).toBeCloseTo(result.initial.firstIndex * 32 + 128 - 4096, 1)
      expect(result.initial.height).toBe(240 * 32)
      expect(result.remounted.scroll).toBe(4096)
      expect(result.focused, JSON.stringify(result)).toMatchObject({ retained: true, active: 'input-row-124', scroll: 0 })
      expect(result.focused.count).toBeLessThan(40)
      expect(result.blurred.retained).toBe(false)
      expect(result.menu).toMatchObject({ retained: true, open: true, portal: true, scroll: 0 })
      expect(result.menu.count).toBeLessThan(40)
      expect(result.menuClosed).toMatchObject({ retained: false, open: false })
      expect(result.retained.keys).toContain('row-200'); expect(result.retained.keys).toContain('row-201')
      expect(result.retained.count).toBeLessThan(40)
      expect(result.released.keys).not.toContain('row-200')
      expect(result.variable.height).toBe(240 * 32 + 32)
      expect(result.variable.secondTop - result.variable.firstTop).toBe(64)
      expect(result.margin.scroll).toBe(4096)
      expect(result.margin.keys).toContain('row-115')
      expect(result.margin.firstTop).toBeCloseTo(result.margin.firstIndex * 32 + 448 - 4096, 1)
      expect(result.nested.scroll).toBe(4096)
      expect(result.nested.rootKeys).toContain('group')
      expect(result.nested.rootCount).toBeLessThan(30); expect(result.nested.innerCount).toBeLessThan(40)
      expect(result.nested.innerKeys).toContain('row-122')
      expect(result.nested.height).toBe(40 + 240 * 32 + 99 * 32)
      expect(result.nestedRemount.scroll).toBe(4096)
      expect(result.nestedResized.scroll).toBe(4096)
      expect(result.nestedResized.innerKeys).toContain('row-120')
      expect(result.nestedResized.height).toBe(104 + 240 * 32 + 99 * 32)
      expect(result.nestedFocused).toMatchObject({ rootRetained: true, innerRetained: true, active: 'input-row-120' })
      expect(result.nestedFocused.rootCount).toBeLessThan(40); expect(result.nestedFocused.innerCount).toBeLessThan(40)
      expect(result.small).toMatchObject({ wrappers: 0, rows: 80 })
      expect(result.rebound.scroll).toBe(4096)
      expect(result.pendingAction).toMatchObject({ mounted: true, busy: true, calls: ['row-0'], rootRetained: true })
      expect(result.pendingAction.rows).toBeLessThan(80)
      expect(result.pendingReturned).toMatchObject({ mounted: true, busy: true, calls: ['row-0'] })
      expect(result.failedAction).toMatchObject({ mounted: true, busy: false, calls: ['row-0'], error: '文件树加载失败', rootRetained: true })
      expect(result.failedReturned).toMatchObject({ error: '文件树加载失败', calls: ['row-0'] })
      expect(result.retriedAction).toMatchObject({ busy: false, error: '', calls: ['row-0', 'row-0'] })
      expect(result.releasedAction).toMatchObject({ mounted: false, rootRetained: false })
      expect(result.cleanup).toMatchObject({ content: '' })
    } finally {
      if (child?.pid) {
        if (process.platform === 'win32') child.kill()
        else { try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
      }
      await rm(directory, { recursive: true, force: true })
    }
  }, 30000)
})

function fixture() {
  return `
import React from 'react'
import { createRoot } from 'react-dom/client'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MiraSidebarVirtualList } from ${JSON.stringify(resolve('apps/harness-react/src/components/session/MiraSidebarVirtualList.tsx'))}
import { SessionSidebar } from ${JSON.stringify(resolve('apps/harness-react/src/components/session/SessionSidebar.tsx'))}
import { SidebarPreferenceStore } from ${JSON.stringify(resolve('apps/harness-react/src/components/session/sidebar-preferences.ts'))}
const viewport=document.getElementById('viewport'), mount=document.getElementById('root'), before=document.getElementById('before')
const root=createRoot(mount), errors=[]
window.addEventListener('error',event=>errors.push(event.error?.stack||event.message))
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)))
const items=Array.from({length:240},(_,index)=>({id:'row-'+index})), nodes=[{id:'group',group:true},...Array.from({length:99},(_,index)=>({id:'node-'+index}))]
const key=item=>item.id
let mode='single', count=240, version=0, retained=[], variable=false, enabled=true, bound=true
let failAction, actionMode='pending'
const actionCalls=[]
const sidebarState={sessions:[...items,...Array.from({length:200},(_,index)=>({id:'root-'+index}))].map((item,index)=>({...item,title:item.id,workingDirectory:'/tmp/mira',status:'active',createdAt:1,updatedAt:index+1})),projects:[],runningSessionIds:[],unreadSessionIds:[],pendingPermissions:{}}
const sidebarController={getSnapshot:()=>sidebarState,reportError:error=>errors.push(error.message)}
const sidebarStore=new SidebarPreferenceStore(async()=>({view:'group',sort:'manual',groups:[{id:'async',name:'异步操作',color:'blue',collapsed:false,sessionIds:items.map(item=>item.id)}]}),async()=>{})
const openFiles=id=>{actionCalls.push(id);return actionMode==='pending'?new Promise((resolve,reject)=>{failAction=reject}):Promise.resolve()}
function Row({item}) {return <div className="fixture-row" data-fixture-row={item.id} style={{height:variable&&item.id==='row-0'?64:32}}><input aria-label={'input-'+item.id}/><DropdownMenu.Root><DropdownMenu.Trigger aria-label={'menu-'+item.id}>menu</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content><DropdownMenu.Item aria-label={'action-'+item.id}>action</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>}
function list(id,entries,render,estimate,keep=retained,instanceKey=version) {return <MiraSidebarVirtualList key={instanceKey} listId={id} items={entries} getItemKey={key} renderItem={render} estimateSize={estimate} scrollElement={bound?viewport:null} enabled={enabled} retainedKeys={keep}/>}
function App(){React.useLayoutEffect(()=>{mount.style.height=''},[]);if(mode==='sidebar')return <div className="pilot-workbench" style={{height:520}}><SessionSidebar state={sidebarState} controller={sidebarController} width={264} onClose={()=>{}} preferenceStore={sidebarStore} onOpenSessionFiles={openFiles}/></div>;return mode==='nested'?list('root',nodes,item=>item.group?<section data-fixture-group="group"><div className="fixture-header">group</div>{list('inner',items,item=><Row item={item}/>,undefined,retained,version)}</section>:<div className="fixture-row" data-fixture-row={item.id}>{item.id}</div>,item=>item.group?808:32,[],0):list('single',items.slice(0,count),item=><Row item={item}/>)}
function render(){root.render(<App/>)}
function single(){const list=document.querySelector('[data-sidebar-virtual-list="single"]'),rows=[...list?.children||[]],first=rows[0];return{scroll:viewport.scrollTop,count:rows.length,keys:rows.map(row=>row.dataset.sidebarVirtualKey),firstIndex:Number(first?.dataset.index),firstTop:first?.getBoundingClientRect().top,height:list?.getBoundingClientRect().height,retained:!!document.querySelector('[data-fixture-row="row-124"]'),active:document.activeElement?.getAttribute('aria-label'),secondTop:rows[1]?.getBoundingClientRect().top}}
function nested(){const outer=document.querySelector('[data-sidebar-virtual-list="root"]'),inner=document.querySelector('[data-sidebar-virtual-list="inner"]');return{scroll:viewport.scrollTop,rootCount:outer?.children.length,rootKeys:[...outer?.children||[]].map(row=>row.dataset.sidebarVirtualKey),innerCount:inner?.children.length,innerKeys:[...inner?.children||[]].map(row=>row.dataset.sidebarVirtualKey),height:outer?.getBoundingClientRect().height,rootRetained:!!document.querySelector('[data-sidebar-virtual-list="root"]>[data-sidebar-virtual-key="group"]'),innerRetained:!!document.querySelector('[data-fixture-row="row-120"]'),active:document.activeElement?.getAttribute('aria-label')}}
function actionSnapshot(){const row=document.querySelector('[data-sidebar-session-id="row-0"]');return{mounted:!!row,busy:row?.getAttribute('aria-busy')==='true',calls:[...actionCalls],error:row?.querySelector('[role=alert]')?.textContent||'',rows:document.querySelectorAll('[data-sidebar-session-id]').length,rootRetained:!!document.querySelector('[data-sidebar-virtual-key="sidebar-group:async"]')}}
window.virtualFixture={errors,render,single,nested,actionSnapshot,scroll:offset=>{viewport.scrollTop=offset;viewport.dispatchEvent(new Event('scroll'))},remount:()=>{version++;render()},retain:keys=>{retained=keys;render()},setVariable:()=>{variable=true;render()},setMargin:height=>{before.style.height=height+'px'},setEnabled:value=>{enabled=value;render()},setBound:value=>{bound=value;render()},configure:options=>{mode=options.mode||'single';count=options.count||240;variable=false;retained=[];enabled=true;bound=true;version++;before.style.height='128px';viewport.scrollTop=0;render()},startSidebar:async()=>{await sidebarStore.load();mode='sidebar';document.getElementById('sidebar-style').media='all';viewport.style.height='600px';viewport.scrollTop=0;before.style.height='0px';render()},scrollSidebar:offset=>{const scroll=document.querySelector('.mira-session-list');scroll.scrollTop=offset;scroll.dispatchEvent(new Event('scroll'))},runAction:()=>document.querySelector('button[aria-label="显示 row-0 的文件树"]').click(),failAction:()=>{failAction(new Error('文件树加载失败'));actionMode='resolved'},unmount:()=>{root.unmount();mount.style.height='12000px'}}
viewport.scrollTop=4096;render()
`
}

const main = `
const {app,BrowserWindow}=require('electron'),path=require('node:path')
app.setPath('userData',path.join(__dirname,'profile'))
let window
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const inspect=async expression=>{try{return await window.webContents.executeJavaScript(expression)}catch(error){throw Error(expression+'\\n'+error.message)}}
const frames=async()=>{await inspect('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');await pause(20)}
const wait=async expression=>{const end=Date.now()+3000;while(Date.now()<end){if(await inspect(expression))return;await pause(10)}throw Error('Did not settle: '+expression)}
const click=async selector=>{const point=await inspect('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');for(const type of ['mouseMoved','mousePressed','mouseReleased'])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:type==='mouseMoved'?0:1})}
app.whenReady().then(async()=>{try{
  window=new BrowserWindow({show:false,width:900,height:600,webPreferences:{backgroundThrottling:false}})
  await window.loadFile(path.join(__dirname,'index.html'));window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true})
  await wait('!!window.virtualFixture && document.querySelectorAll("[data-sidebar-virtual-key]").length>10');await frames()
  const result={initial:await inspect('window.virtualFixture.single()')}
  await inspect('window.virtualFixture.remount()');await frames();result.remounted=await inspect('window.virtualFixture.single()')
  await inspect('document.querySelector("input[aria-label=input-row-124]").focus()');await frames();result.beforeFocused=await inspect('window.virtualFixture.single()');await inspect('window.virtualFixture.scroll(0)');await frames();result.focused=await inspect('window.virtualFixture.single()')
  await inspect('document.getElementById("outside").focus()');await frames();result.blurred=await inspect('window.virtualFixture.single()')
  await inspect('window.virtualFixture.scroll(4096)');await frames()
  await click('button[aria-label=menu-row-124]')
  await wait('!!document.querySelector("[role=menu]")');await frames();await inspect('window.virtualFixture.scroll(0)');await frames()
  result.menu=await inspect('({...window.virtualFixture.single(),open:!!document.querySelector("[role=menu]"),portal:!!document.querySelector("[role=menu]")&&!document.getElementById("root").contains(document.querySelector("[role=menu]"))})')
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await inspect('document.getElementById("outside").focus()');await frames();result.menuClosed=await inspect('({...window.virtualFixture.single(),open:!!document.querySelector("[role=menu]")})')
  await inspect('window.virtualFixture.retain(["row-200","row-201"])');await frames();result.retained=await inspect('window.virtualFixture.single()')
  await inspect('window.virtualFixture.retain([])');await frames();result.released=await inspect('window.virtualFixture.single()')
  await inspect('window.virtualFixture.setVariable()');await frames();result.variable=await inspect('window.virtualFixture.single()')
  await inspect('window.virtualFixture.configure({})');await frames();await inspect('window.virtualFixture.scroll(4096)');await frames()
  await inspect('window.virtualFixture.setMargin(448)');await frames();result.margin=await inspect('window.virtualFixture.single()')
  await inspect('window.virtualFixture.configure({mode:"nested"})');await frames();await inspect('window.virtualFixture.scroll(4096)');await frames();result.nested=await inspect('window.virtualFixture.nested()')
  await inspect('window.virtualFixture.remount()');await frames();result.nestedRemount=await inspect('window.virtualFixture.nested()')
  await inspect('document.querySelector(".fixture-header").style.height="104px"');await frames();result.nestedResized=await inspect('window.virtualFixture.nested()')
  await inspect('document.querySelector("input[aria-label=input-row-120]").focus()');await frames();await inspect('window.virtualFixture.scroll(11000)');await frames();result.nestedFocused=await inspect('window.virtualFixture.nested()')
  await inspect('document.getElementById("outside").focus();window.virtualFixture.configure({count:80})');await frames();result.small=await inspect('({wrappers:document.querySelectorAll("[data-sidebar-virtual-list]").length,rows:document.querySelectorAll("[data-fixture-row]").length})')
  await inspect('window.virtualFixture.configure({})');await frames();await inspect('window.virtualFixture.scroll(4096)');await frames()
  await inspect('window.virtualFixture.setEnabled(false)');await frames();await inspect('window.virtualFixture.setEnabled(true)');await frames()
  await inspect('window.virtualFixture.setBound(false)');await frames();await inspect('window.virtualFixture.setBound(true)');await frames();result.rebound=await inspect('window.virtualFixture.single()')
  await inspect('window.virtualFixture.startSidebar()');await frames();await wait('!!document.querySelector("[data-sidebar-session-id=row-0]")')
  await inspect('window.virtualFixture.runAction()');await frames();await inspect('document.getElementById("outside").focus();window.virtualFixture.scrollSidebar(11000)');await frames();result.pendingAction=await inspect('window.virtualFixture.actionSnapshot()')
  await inspect('window.virtualFixture.scrollSidebar(0)');await frames();await inspect('window.virtualFixture.runAction()');await frames();result.pendingReturned=await inspect('window.virtualFixture.actionSnapshot()')
  await inspect('window.virtualFixture.scrollSidebar(11000)');await frames();await inspect('window.virtualFixture.failAction()');await frames();result.failedAction=await inspect('window.virtualFixture.actionSnapshot()')
  await inspect('window.virtualFixture.scrollSidebar(0)');await frames();result.failedReturned=await inspect('window.virtualFixture.actionSnapshot()')
  await inspect('window.virtualFixture.runAction()');await frames();result.retriedAction=await inspect('window.virtualFixture.actionSnapshot()')
  await inspect('document.getElementById("outside").focus();window.virtualFixture.scrollSidebar(11000)');await frames();result.releasedAction=await inspect('window.virtualFixture.actionSnapshot()')
  await inspect('window.virtualFixture.unmount();window.virtualFixture.scroll(4096);window.dispatchEvent(new Event("resize"))');await frames();result.cleanup=await inspect('({content:document.getElementById("root").innerHTML,scroll:document.getElementById("viewport").scrollTop})')
  result.errors=await inspect('window.virtualFixture.errors');process.stdout.write('MIRA_VIRTUAL_RESULT='+JSON.stringify(result)+'\\n');window.destroy();app.quit()
}catch(error){console.error(error.stack);app.exit(1)}})
`
