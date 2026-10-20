// Actual shell + built React app (HTML, JS and CSS) + MessagePort bridge; isolated Electron profile and mocked platform persistence. Run npm run harness:build first.
import { createServer } from 'vite'
import electronPath from 'electron'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
const { _electron } = await import(pathToFileURL(process.env.MIRA_PLAYWRIGHT_MODULE || '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href)
const root = process.cwd(), output = await mkdtemp(join(tmpdir(), 'mira-full-view-ui-'))
const fixture = resolve('node_modules/.cache/mira-full-view'); await mkdir(fixture, { recursive: true })
await writeFile(join(fixture, 'index.html'), '<html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module" src="/fixture.ts"></script></body></html>')
await writeFile(join(fixture, 'fixture.ts'), `
import {createApp,h} from 'vue';import {createPinia} from 'pinia';import {createRouter,createMemoryHistory} from 'vue-router';import ElementPlus from 'element-plus';import 'element-plus/dist/index.css';
import {createWorkspaceSession,createWorkspaceTaskTab,placeWorkspaceTask} from '${root}/apps/harness-react/src/state/workspace-state.ts';
import Layout from '${root}/src/layouts/index.vue';import FirstPartyFrame from '${root}/src/pages/frontend/microAppHost/FirstPartyFrame.vue';import AppIcon from '${root}/src/components/AppIcon/index.vue';import '${root}/src/styles/index.scss';
window.project={id:'project',name:'Mira-Novel-Studio',icon:'FolderOpened',directory:'/workspace/Mira-Novel-Studio',roots:[{rootPath:'/workspace/Mira-Novel-Studio',isPrimary:true},{rootPath:'/workspace/shared',isPrimary:false}],directoryExists:true,createdAt:1,updatedAt:1,sessionCount:0};window.saves=[];window.choice=null;window.calls=[];window.listeners=new Set();window.emit=event=>window.listeners.forEach(fn=>fn(event));window.records=['a','b'].map(id=>({version:1,id,title:'验真任务 '+id,projectId:'project',workingDirectory:window.project.directory,permissionMode:'default',messages:[{id:id+'-u',role:'user',content:'初始问题',createdAt:1},{id:id+'-a',role:'assistant',content:'历史回答',createdAt:2}],toolCalls:[],createdAt:Date.now(),updatedAt:Date.now(),status:'active',pinned:false}));
window.prefs={'first-party.mira-harness.session-drawer':{view:'project'}};if(location.search.includes('split=1')){window.prefs['first-party.mira-harness.active-session']='a';window.prefs['first-party.mira-harness.harness-react-workspace']={a:placeWorkspaceTask(createWorkspaceSession(),createWorkspaceTaskTab('b','验真任务 b'),'$primary','right')}};
window.platform={windowChrome:'macos-overlay',getSnapshot:async()=>({preferences:window.prefs}),savePreference:async(key,value)=>{window.prefs[key]=value},createFirstPartyGrant:async()=> 'fixture-grant',revokeFirstPartyGrant:async()=>{},onHarnessEvent:fn=>{window.listeners.add(fn);return()=>window.listeners.delete(fn)},invokeFirstPartyHarness:async(grant,method,params)=>{
 window.calls.push({method,params});
 if(method==='projects.list')return[window.project,...(window.created?[window.created]:[])];
 if(method==='sessions.list')return window.records;
 if(method==='session.get')return window.records.find(record=>record.id===params.id);
 if(method==='session.set-unread'||method==='permission.respond')return;
 if(method==='terminal.open')return {terminalId:'fixture-terminal'};
 if(['terminal.write','terminal.resize','terminal.close'].includes(method))return;
 if(method==='permissions.pending')return [];
 if(method==='attachments.select')return [{path:'attachment.pdf',name:'attachment.pdf',mediaType:'application/pdf'}];
 if(method==='attachments.get')return {path:'attachment.pdf',name:'attachment.pdf',mediaType:'application/pdf',content:'JVBERi0xLjcK'};
 if(method==='queue.list')return {items:[],revision:0,paused:false};
 if(method==='browser.viewport')return {desktopZoomFactor:1};
 if(['browser.navigate','browser.bounds','browser.control'].includes(method))return null;
 if(['providers.list','workflows.request','editors.list','skills.list','input-history.list'].includes(method))return[];
 if(method==='files.list')return {path:params.path,entries:params.path?[]:[{path:'note.md',name:'note.md',type:'file'}]};
 if(method==='files.read')return {path:params.path,content:'# '+(params.rootPath||'session')+'\\n\\nSelected folder preview'};
 if(method==='files.git-status')return {available:false,entries:[]};
 if(method==='files.git-ignored')return [];
 if(method==='files.watch')return {watchId:Math.random().toString()};
 if(method==='files.unwatch')return;
 if(method==='composer.preferences')return{sendShortcut:'enter',showContextUsage:true};
 if(method==='permissions.config')return{globalDefaultMode:'default',autoApproveEnabled:true,fullAccessEnabled:true,dangerousCommands:[],trashRetentionDays:30,trashDirName:'.mira-trash'};
 if(method==='projects.select-directories')return window.choice?[window.choice]:[];
 if(method==='projects.update'){window.saves.push(params.input);window.project={...window.project,name:params.input.name,directory:params.input.primaryRoot,roots:params.input.roots.map(rootPath=>({rootPath,isPrimary:rootPath===params.input.primaryRoot}))};return window.project}
 if(method==='projects.create'){window.creates=(window.creates||[]);window.creates.push(params.input);window.created={...window.project,id:'new-project',name:params.input.name,directory:params.input.primaryRoot,roots:params.input.roots.map(rootPath=>({rootPath,isPrimary:rootPath===params.input.primaryRoot}))};return window.created}
 throw Error('Unexpected method '+method)
}};

const manifest={appId:'mira-harness',legacyIds:[],enabled:true,trustedSource:{type:'builtin',packagePath:'harness-react-app'},entry:{path:'index.html'},shellCompatibility:{minVersion:'0.0.10'},apiCompatibility:{major:1},capabilities:['harness:workbench']};
const context={version:1,theme:'light',language:'zh-CN',user:{id:'fixture',name:'Mira'}};
const Frame={render:()=>h(FirstPartyFrame,{url:'/built/index.html',title:'React 工作台',manifest,api:window.platform,context,route:'/workspace/harness-react',navigate:()=>{}})};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Layout,children:[{path:'workspace/harness-react',component:Frame,meta:{noPageTransition:true}}]}]});
import{RouterView}from'vue-router';const actualApp=createApp({render:()=>h(RouterView)});actualApp.use(createPinia()).use(router).use(ElementPlus).component('AppIcon',AppIcon);router.push('/workspace/harness-react').then(()=>router.isReady()).then(()=>{actualApp.mount('#app');window.ready=true});
`)
// Use the production Vue compiler, aliases and Sass configuration.
const builtRoot = resolve('dist/harness-react-app')
const builtAssets = { name: 'serve-built-harness', configureServer(server) {
 server.middlewares.use(async (request, response, next) => {
  const url = new URL(request.url || '/', 'http://localhost')
  if (!url.pathname.startsWith('/built/')) return next()
  const path = resolve(builtRoot, decodeURIComponent(url.pathname.slice('/built/'.length)))
  if (!path.startsWith(builtRoot + sep)) { response.writeHead(403); response.end(); return }
  try {
   const body = await readFile(path)
   const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
   response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); response.end(body)
  } catch { response.writeHead(404); response.end() }
 })
} }
const server = await createServer({ root: fixture, configFile: resolve('vite.config.ts'), plugins: [builtAssets], server: { port: 0, strictPort: false, cors: true, headers: { 'Access-Control-Allow-Origin': '*' }, fs: { allow: [root] } } })
await server.listen();const port=server.httpServer.address().port
await writeFile(join(fixture,'guest.html'), '<html><body style="margin:0;background:#2563eb;color:white;height:100vh;font:24px sans-serif"><h1>Native browser acceptance</h1><button id="guest-button" onclick="this.textContent=String(Number(this.textContent)+1)">0</button></body></html>')
await writeFile(join(fixture,'main.cjs'), `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(output,'profile'))});app.whenReady().then(()=>new BrowserWindow({width:1280,height:900,show:false,webPreferences:{webviewTag:true}}).loadURL('http://localhost:${port}'));`)
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
let app;const report={output,checks:[],errors:[]};const assert=(ok,message)=>{if(!ok)throw Error(message);report.checks.push(message)}
try {
 app=await _electron.launch({executablePath:electronPath,args:[join(fixture,'main.cjs')],env});const page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.waitForFunction(()=>window.ready);
 const frame=page.frameLocator('iframe[title="React 工作台"]');
 await frame.locator('[data-collection-header]').hover();
 await frame.getByRole('button',{name:'显示 Mira-Novel-Studio 的文件树',exact:true}).click();
 assert(await frame.getByRole('menuitem',{name:'查看文件 · /workspace/shared',exact:true}).isVisible(),'multiple roots open anchored folder dropdown');
 await frame.getByRole('menuitem',{name:'查看文件 · /workspace/shared',exact:true}).click();
 const files=frame.locator('[data-file-manager-root="/workspace/shared"]');await files.waitFor();
 assert(await frame.locator('[data-collection-id="sidebar-project:project"]').count()===1,'opening files preserves the left project/task sidebar');
 await files.getByRole('treeitem').filter({hasText:'note.md'}).dblclick();
 await files.locator('.mira-file-preview__markdown').waitFor();
 assert((await files.locator('.mira-file-preview__markdown').innerText()).includes('/workspace/shared'),'selected secondary root reaches preview read');
 const editor=frame.getByRole('textbox',{name:'任务内容',exact:true});await editor.fill('保留同一份草稿和光标');
 await editor.evaluate(el=>window.savedEditor=el);
 await frame.getByRole('button',{name:'进入完整视图',exact:true}).click();
 const host=frame.locator('.mira-full-view-host');await page.waitForTimeout(240);
 const bounds=await host.boundingBox(),preview=await files.boundingBox();
 assert(bounds.width>500&&bounds.width<=560&&preview.width>800,'full view expands resources and presents a bounded floating conversation');
 assert(await editor.evaluate(el=>el===window.savedEditor),'entering full view preserves the editor DOM');
 assert((await editor.innerText()).includes('保留同一份草稿'),'entering full view preserves draft');
 await page.screenshot({path:join(output,'full-view-light.png')});
 await editor.focus();await frame.getByRole('button',{name:'展开消息流',exact:true}).click();
 assert(await host.getAttribute('data-floating')==='expanded','floating conversation expands message history');
 await frame.getByRole('button',{name:'最小化编辑器',exact:true}).click();
 assert(await host.getAttribute('data-floating')==='minimized','floating conversation minimizes');
 await frame.getByRole('button',{name:'恢复对话输入框',exact:true}).click();
 assert(await host.getAttribute('data-floating')==='collapsed','minimized conversation restores input');
 const handle=frame.getByRole('button',{name:'拖动以移动 · 点击查看选项',exact:true});await editor.focus();
 await page.waitForTimeout(180);report.viewport=await page.evaluate(()=>({w:innerWidth,h:innerHeight,dpr:devicePixelRatio}));report.handle=await handle.evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),active:document.activeElement.outerHTML.slice(0,200),host:el.closest('.mira-full-view-host').outerHTML.slice(0,500),iframeSize:{w:innerWidth,h:innerHeight}}));const handleBounds=await handle.boundingBox();await page.mouse.move(handleBounds.x+10,handleBounds.y+10);await page.mouse.down();report.started=await host.getAttribute('data-dragging');await page.mouse.move(handleBounds.x-300,handleBounds.y-400,{steps:10});report.moving=await host.getAttribute('data-dragging');await page.mouse.up();
 report.drag={before:handleBounds,after:await host.getAttribute('data-anchor')};assert(await host.getAttribute('data-anchor')!=='bottom-right','floating conversation drags and snaps to another anchor');
 await frame.locator('.mira-conversation-tab button').click();
 assert(await host.getAttribute('data-mode')==='conversation','fixed first conversation tab restores full conversation');
 assert(await editor.evaluate(el=>el===window.savedEditor),'conversation tab uses same editor DOM');
 await frame.locator('.pilot-side-tab').filter({hasText:'note.md'}).getByRole('button',{name:'note.md',exact:true}).click();
 assert(await host.getAttribute('data-mode')==='floating','resource tab restores floating conversation');
 await frame.getByRole('button',{name:'退出完整视图',exact:true}).click();await page.waitForTimeout(240);
 assert(await host.getAttribute('data-mode')==='docked','exit returns to ordinary columns');
 assert(await editor.evaluate(el=>el===window.savedEditor),'exit preserves the editor DOM');
 await files.getByRole('button',{name:'收起目录',exact:true}).click();
 await page.waitForTimeout(100);report.tree=await files.locator('.mira-file-manager__tree').evaluate(e=>({html:e.outerHTML.slice(0,900),width:e.getBoundingClientRect().width,style:getComputedStyle(e).visibility}));assert(await files.locator('.mira-file-manager__tree').evaluate(e=>e.getBoundingClientRect().width<1),'file directory can collapse');
 await files.getByRole('button',{name:'展开目录',exact:true}).click();
 await page.waitForTimeout(100);assert(await files.locator('.mira-file-manager__tree').evaluate(e=>e.getBoundingClientRect().width>=160),'file directory restores');
 report.treeRestored=await files.locator('.mira-file-manager__tree').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),parent:el.parentElement.outerHTML.slice(0,650)}));
 await page.screenshot({path:join(output,'files-split-light.png')});
 // Exercise the actual session controller, streamed lifecycle and native hosted browser.
 await frame.locator('.mira-collection-title').filter({hasText:'Mira-Novel-Studio'}).click();
 await frame.locator('[data-sidebar-session-id="a"] .mira-session-row__open').first().click();
 await frame.locator('.mira-thread-panel').filter({hasText:'初始问题'}).first().waitFor();
 await frame.locator('[data-collection-header]').hover();
 await frame.getByRole('button',{name:'显示 Mira-Novel-Studio 的文件树',exact:true}).click();
 await frame.getByRole('menuitem',{name:'查看文件 · /workspace/shared',exact:true}).click();
 await frame.getByRole('button',{name:'进入完整视图',exact:true}).click();await page.waitForTimeout(200);
 assert(await frame.locator('.mira-floating-answer').count()===0,'historical answers do not trigger a new-answer bubble');
 await page.evaluate(()=>{const task=window.records[0];task.messages.push({id:'new-u',role:'user',content:'新的问题',createdAt:3});task.activeRun={id:'run',messageId:'new-a',startedAt:Date.now()-2000,activities:[],subtasks:[]};window.emit({type:'run-start',sessionId:'a',runId:'run',sequence:1,payload:{messageId:'new-a',startedAt:task.activeRun.startedAt}})});
 await frame.locator('.mira-prompt-editor[data-placeholder^="工作中"]').waitFor();
 assert(true,'running placeholder reflects the active timeline run');
 await page.evaluate(()=>{const task=window.records[0];task.messages.push({id:'new-a',role:'assistant',content:'本轮任务已完成，文件已整理。',createdAt:4,runId:'run',run:{status:'completed',startedAt:task.activeRun.startedAt,completedAt:Date.now(),durationMs:2300,activities:[]}});delete task.activeRun;window.emit({type:'status',sessionId:'a',runId:'run',sequence:2,payload:{state:'completed'}})});
 await frame.getByRole('button',{name:'展开最新回答',exact:true}).waitFor();
 assert((await frame.getByRole('button',{name:'展开最新回答',exact:true}).innerText()).includes('本轮任务已完成'),'completed answer creates the latest reply bubble');
 await frame.getByRole('button',{name:'展开最新回答',exact:true}).click();
 await frame.getByRole('button',{name:'收起消息流',exact:true}).click();
 assert(await frame.locator('.mira-floating-answer').count()===0,'opening the latest reply dismisses its bubble');
 await editor.focus();await page.waitForTimeout(180);await frame.getByRole('button',{name:'最小化编辑器',exact:true}).click();
 await page.evaluate(()=>window.emit({type:'memory-status',sessionId:'a',payload:{status:'needs_confirmation',requestId:'memory',content:'这是一条需要确认的记忆'}}));
 await frame.getByRole('region',{name:'记忆确认',exact:true}).waitFor();await page.waitForTimeout(200);
 report.memory=await host.evaluate(el=>({host:el.getBoundingClientRect().toJSON(),composer:el.querySelector('.mira-composer-region').getBoundingClientRect().toJSON(),content:el.querySelector('.mira-full-view-host__content').getBoundingClientRect().toJSON(),memory:el.querySelector('[aria-label="记忆确认"]').getBoundingClientRect().toJSON(),html:el.outerHTML.slice(0,500)}));
 const memoryBounds=await frame.getByRole('region',{name:'记忆确认',exact:true}).boundingBox();const floatBounds=await host.boundingBox();
 assert(await host.getAttribute('data-floating')==='collapsed'&&memoryBounds.y>=floatBounds.y&&memoryBounds.y+memoryBounds.height<=floatBounds.y+floatBounds.height+1,'new pending confirmation restores the floating dock and remains inside its visible area');
 await page.evaluate(()=>window.emit({type:'memory-status',sessionId:'a',payload:{status:'saved',requestId:'memory'}}));
 await editor.focus();await page.waitForTimeout(180);await frame.getByRole('button',{name:'最小化编辑器',exact:true}).click();
 await page.evaluate(()=>window.emit({type:'permission-request',sessionId:'a',payload:{requestId:'permission',title:'允许读取目录？',detail:'ls workspace'}}));
 const permission=frame.getByRole('region',{name:'权限确认',exact:true});await permission.waitFor();await page.waitForTimeout(200);
 const permissionBounds=await permission.boundingBox(),permissionHost=await host.boundingBox();
 assert(await host.getAttribute('data-floating')==='collapsed'&&permissionBounds.y>=permissionHost.y&&permissionBounds.y+permissionBounds.height<=permissionHost.y+permissionHost.height+1,'permission request automatically restores a fully visible floating confirmation');
 await permission.getByRole('button',{name:'允许',exact:true}).click();await permission.waitFor({state:'detached'});

 // Use the real tabs menu to open a browser, then navigate the native guest locally.
 await frame.getByRole('button',{name:'打开工作内容',exact:true}).click();
 await frame.getByRole('menuitem',{name:'浏览器',exact:true}).click();
 const address=frame.getByRole('textbox',{name:'浏览器地址',exact:true});await address.fill('http://localhost:'+port+'/guest.html');await address.press('Enter');
 await page.waitForFunction(()=>{const guest=document.querySelector('webview');return guest&&guest.getURL().includes('/guest.html')&&guest.parentElement.style.clipPath.startsWith('path(')});
 await page.waitForTimeout(250);await editor.focus();await editor.fill('在原生网页上继续输入');
 const guestProof=await page.evaluate(async()=>{const guest=document.querySelector('webview'),rect=guest.getBoundingClientRect();const button=await guest.executeJavaScript('document.querySelector("#guest-button").getBoundingClientRect().toJSON()');return {rect:rect.toJSON(),button,clips:guest.parentElement.style.clipPath}});
 await page.mouse.click(guestProof.rect.x+guestProof.button.x+10,guestProof.rect.y+guestProof.button.y+10);
 assert(await page.evaluate(async()=>document.querySelector('webview').executeJavaScript('document.querySelector("#guest-button").textContent'))==='1','native browser remains clickable outside floating overlays');
 const floatingCenter=await host.boundingBox();
 assert(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName==='IFRAME',{x:floatingCenter.x+floatingCenter.width/2,y:floatingCenter.y+floatingCenter.height/2}),'floating input receives hit testing above the native browser guest');
 await page.waitForTimeout(220);await editor.focus();await page.waitForTimeout(180);await page.screenshot({path:join(output,'browser-floating-light.png')});
 await frame.locator('.mira-conversation-tab button').click();await page.waitForTimeout(200);
 assert(await page.locator('webview').evaluate(el=>getComputedStyle(el.parentElement).display==='none'),'conversation tab hides the retained native guest');
 await frame.locator('.pilot-side-tab').filter({hasText:'localhost'}).locator('.pilot-side-tab__select').click();await page.waitForTimeout(220);
 assert(await page.evaluate(async()=>document.querySelector('webview').executeJavaScript('document.querySelector("#guest-button").textContent'))==='1','switching back restores the same guest and document state');
 await frame.getByRole('button',{name:'退出完整视图',exact:true}).click();await page.waitForTimeout(200);
 assert(await page.locator('webview').evaluate(el=>el.parentElement.style.clipPath===''),'exiting full view removes the native browser cutouts');
 const taskEditor=frame.getByRole('textbox',{name:'任务内容',exact:true});
 await taskEditor.fill('undo base');await taskEditor.press('End');await taskEditor.type(' extra');
 await taskEditor.evaluate(el=>{window.taskEditor=el;window.caretBefore=getSelection().anchorOffset});
 await frame.getByRole('button',{name:'进入完整视图',exact:true}).click();await page.waitForTimeout(200);
 assert(await taskEditor.evaluate(el=>el===window.taskEditor&&getSelection().anchorOffset===window.caretBefore),'full view preserves the live editor and caret');
 await taskEditor.press('Meta+z');
 assert(!(await taskEditor.innerText()).includes(' extra'),'editor undo history survives entering full view');
 await frame.getByRole('button',{name:'退出完整视图',exact:true}).click();await page.waitForTimeout(200);
 await frame.getByRole('button',{name:'添加上下文',exact:true}).click();
 await frame.locator('[data-suggestion-id="attach-files"]').click();
 await frame.locator('[aria-label="待发送附件"]').waitFor();
 const attachment=frame.locator('[aria-label="待发送附件"]');await attachment.evaluate(el=>window.savedAttachment=el);
 await frame.getByRole('button',{name:'进入完整视图',exact:true}).click();await page.waitForTimeout(180);
 assert(await attachment.evaluate(el=>el===window.savedAttachment),'pending attachments retain the same DOM in floating mode');
 const floatComposer=frame.locator('.mira-composer-region');const floatSize=await host.boundingBox(),attachedSize=await attachment.boundingBox();
 assert(attachedSize.y>=floatSize.y&&attachedSize.y+attachedSize.height<=floatSize.y+floatSize.height+1,'floating input includes the entire attachment row');
 await taskEditor.focus();await page.waitForTimeout(180);
 const grip=await handle.boundingBox(),slot=await frame.locator('.pilot-inspector__body').boundingBox();
 report.topDrag={grip,slot,anchor:await host.getAttribute('data-anchor')};
 await page.mouse.move(grip.x+10,grip.y+10);await page.mouse.down();await page.mouse.move(slot.x+26,slot.y+26,{steps:10});await page.mouse.up();await page.waitForTimeout(180);
 report.topDrag.after=await host.getAttribute('data-anchor');
 assert((await host.getAttribute('data-anchor')).startsWith('top'),'floating editor snaps to a top anchor');
 await taskEditor.focus();await frame.getByRole('button',{name:'展开消息流',exact:true}).click();await page.waitForTimeout(180);
 const expandedHost=await host.boundingBox(),toolbar=await frame.locator('.mira-floating-toolbar').boundingBox();
 assert(toolbar.y>=slot.y&&toolbar.y+toolbar.height<=expandedHost.y+expandedHost.height&&expandedHost.y+expandedHost.height<=slot.y+slot.height,'top-anchored expansion keeps toolbar and history inside the resource slot');
 await page.screenshot({path:join(output,'full-view-expanded-light.png')});
 await frame.locator('html').evaluate(el=>{el.classList.add('dark');document.getElementById('root').dataset.theme='dark'});await page.screenshot({path:join(output,'full-view-expanded-dark.png')});
 await frame.locator('html').evaluate(el=>{el.classList.remove('dark');document.getElementById('root').dataset.theme='light'});
 await frame.locator('.mira-workspace-open').click();await page.waitForTimeout(240);
 assert((await frame.locator('.pilot-inspector').boundingBox()).width>1200,'full view follows sidebar collapse');
 await frame.locator('.mira-workspace-open').click();await page.waitForTimeout(240);
 await frame.getByRole('button',{name:'退出完整视图',exact:true}).click();await page.waitForTimeout(200);



 // Bottom-terminal state and PTY are retained while only the floating chat is visible.
 await frame.getByRole('button',{name:'打开终端',exact:true}).click();
 const terminal=frame.getByRole('region',{name:'底部终端',exact:true});await terminal.waitFor();await terminal.evaluate(el=>window.savedTerminal=el);
 await frame.getByRole('button',{name:'进入完整视图',exact:true}).click();await page.waitForTimeout(200);
 assert(await terminal.isVisible()===false,'floating conversation hides the retained bottom terminal');
 const dockBounds=await frame.locator('.mira-composer-region').boundingBox(),dockHost=await host.boundingBox();
 report.terminalGeometry=await frame.locator('.mira-composer-region').evaluate(el=>{const nodes=[];for(let node=el;node;node=node.parentElement){const rect=node.getBoundingClientRect(),css=getComputedStyle(node);nodes.push({class:node.className,id:node.id,y:rect.y,height:rect.height,display:css.display,flex:css.flex})}return nodes});report.terminalDock={dockBounds,dockHost};
 assert(Math.abs(dockBounds.y+dockBounds.height-dockHost.y-dockHost.height)<2,'open bottom terminal does not leave blank space under the floating editor');
 await frame.locator('.mira-conversation-tab button').click();await page.waitForTimeout(180);
 assert(await terminal.evaluate(el=>el===window.savedTerminal)&&await terminal.isVisible(),'full conversation tab restores the same terminal instance');
 await frame.getByRole('button',{name:'退出完整视图',exact:true}).click();await page.waitForTimeout(180);
 assert(await terminal.isVisible(),'ordinary view preserves bottom-terminal open state');
 // Rehydrate a layout saved before split entry retirement.
 await page.goto('http://localhost:'+port+'/?split=1');await page.waitForFunction(()=>window.ready);
 const splitFrame=page.frameLocator('iframe[title="React 工作台"]');await splitFrame.locator('[data-task-pane-count="2"]').waitFor();
 const side=splitFrame.locator('[data-side-session-id="b"]');await side.getByRole('textbox',{name:'任务内容',exact:true}).waitFor();
 assert(true,'existing split layout restores both conversations');
 const sideEditor=side.getByRole('textbox',{name:'任务内容',exact:true});await sideEditor.fill('旧分屏草稿');await sideEditor.evaluate(el=>window.savedSideEditor=el);
 await splitFrame.getByRole('button',{name:'切换面板',exact:true}).click();await splitFrame.getByRole('button',{name:'进入完整视图',exact:true}).click();await page.waitForTimeout(200);
 assert(await sideEditor.evaluate(el=>el===window.savedSideEditor&&el.innerText.includes('旧分屏草稿')),'full view reuses the focused existing split editor');
 assert(await splitFrame.locator('.mira-task-grid__pane[data-focused="false"]').isVisible()===false,'full view hides unfocused split conversation');
 await splitFrame.getByRole('button',{name:'退出完整视图',exact:true}).click();await page.waitForTimeout(200);
 assert(await splitFrame.locator('[data-task-pane-count="2"]').isVisible(),'exiting full view restores the existing split layout');
 await side.getByRole('button',{name:'关闭侧面任务窗格',exact:true}).click();await splitFrame.locator('[data-task-pane-count="1"]').waitFor();
 assert(true,'existing secondary split can still close');
 assert(report.errors.length===0,'built app has no uncaught renderer errors');
} catch(error) {report.failure=String(error);if(app){const page=await app.firstWindow();await page.screenshot({animations:'disabled',path:join(output,'failure.png')});report.frames=await Promise.all(page.frames().map(async frame=>({url:frame.url(),text:(await frame.locator('body').innerText().catch(()=>'' )).slice(0,5000)})));}throw error}
finally {await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));await app?.close();await server.close();console.log(JSON.stringify(report,null,2))}
