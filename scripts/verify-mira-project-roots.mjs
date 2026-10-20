// Actual shell + built React app (HTML, JS and CSS) + MessagePort bridge; isolated Electron profile and mocked platform persistence. Run npm run harness:build first.
import { createServer } from 'vite'
import electronPath from 'electron'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
const { _electron } = await import(pathToFileURL(process.env.MIRA_PLAYWRIGHT_MODULE || '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href)
const root = process.cwd(), output = await mkdtemp(join(tmpdir(), 'mira-project-roots-ui-'))
const fixture = resolve('node_modules/.cache/mira-project-roots'); await mkdir(fixture, { recursive: true })
await writeFile(join(fixture, 'index.html'), '<html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module" src="/fixture.ts"></script></body></html>')
await writeFile(join(fixture, 'fixture.ts'), `
import {createApp,h} from 'vue';import {createPinia} from 'pinia';import {createRouter,createMemoryHistory} from 'vue-router';import ElementPlus from 'element-plus';import 'element-plus/dist/index.css';
import Layout from '${root}/src/layouts/index.vue';import FirstPartyFrame from '${root}/src/pages/frontend/microAppHost/FirstPartyFrame.vue';import AppIcon from '${root}/src/components/AppIcon/index.vue';import '${root}/src/styles/index.scss';
window.project={id:'project',name:'Mira-Novel-Studio',icon:'FolderOpened',directory:'/workspace/Mira-Novel-Studio',roots:[{rootPath:'/workspace/Mira-Novel-Studio',isPrimary:true}],directoryExists:true,createdAt:1,updatedAt:1,sessionCount:0};window.saves=[];window.choice=null;window.calls=[];
window.prefs={'first-party.mira-harness.session-drawer':{view:'project'}};
window.platform={windowChrome:'macos-overlay',getSnapshot:async()=>({preferences:window.prefs}),savePreference:async(key,value)=>{window.prefs[key]=value},createFirstPartyGrant:async()=> 'fixture-grant',revokeFirstPartyGrant:async()=>{},onHarnessEvent:()=>()=>{},invokeFirstPartyHarness:async(grant,method,params)=>{
 window.calls.push(method);
 if(method==='projects.list')return[window.project,...(window.created?[window.created]:[])];
 if(['sessions.list','providers.list','workflows.request','editors.list','skills.list','input-history.list'].includes(method))return[];
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
await writeFile(join(fixture,'main.cjs'), `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(output,'profile'))});app.whenReady().then(()=>new BrowserWindow({width:1280,height:900,show:false}).loadURL('http://localhost:${port}'));`)
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
let app;const report={output,checks:[],errors:[]};const assert=(ok,message)=>{if(!ok)throw Error(message);report.checks.push(message)}
try {
 app=await _electron.launch({executablePath:electronPath,args:[join(fixture,'main.cjs')],env});const page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')console.error(message.text())});
 await page.waitForFunction(()=>window.ready);
 const frame=page.frameLocator('iframe[title="React 工作台"]');
 const openEditor=async()=>{await frame.locator('[data-collection-header]').hover();await frame.getByRole('button',{name:/的菜单$/}).click();assert(await frame.getByRole('menuitem',{name:'重命名',exact:true}).count()===0,'project menu has no duplicate rename');await frame.getByRole('menuitem',{name:'编辑项目',exact:true}).click()};
 assert(await page.locator('.workspace-navigation').count()===0,'actual shell runs without the legacy sidebar');
 await openEditor();
 const dialog=frame.locator('.mira-project-editor').first();await dialog.waitFor({state:'visible'});
 assert(await dialog.getByRole('button',{name:'移除源文件夹 /workspace/Mira-Novel-Studio',exact:true}).isDisabled(),'last folder cannot be removed');
 assert(await frame.locator('[data-radix-dialog-overlay]').count()===0&&await page.locator('.el-overlay:visible').count()===0,'editor has no dimming overlay');
 await dialog.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})))});
 const geometry=await dialog.evaluate(el=>{const style=getComputedStyle(el),rect=el.getBoundingClientRect();return{position:style.position,shadow:style.boxShadow,x:rect.x,y:rect.y,width:rect.width,height:rect.height,viewportWidth:innerWidth,viewportHeight:innerHeight}});
 assert(geometry.position==='fixed','built stylesheet positions editor as a floating dialog');
 assert(Math.abs(geometry.x+geometry.width/2-geometry.viewportWidth/2)<2&&Math.abs(geometry.y+geometry.height/2-geometry.viewportHeight/2)<2,'built editor is centered in the actual app viewport');
 assert(geometry.shadow!=='none','editor retains shadow');
 await page.evaluate(()=>window.choice='/workspace/shared');await dialog.getByRole('button',{name:'添加文件夹',exact:true}).click();
 await dialog.getByRole('button',{name:'将 /workspace/shared 设为主要',exact:true}).click();
 assert(await page.evaluate(()=>window.saves.length)===0,'draft changes do not persist before save');
 await page.screenshot({animations:'disabled',path:join(output,'editor-light.png')});
 await dialog.getByRole('button',{name:'取消',exact:true}).click();await dialog.waitFor({state:'hidden'});await openEditor();await dialog.waitFor({state:'visible'});
 assert(await dialog.locator('.mira-project-editor__root').count()===1,'cancel discards folder draft');
 await dialog.getByRole('button',{name:'添加文件夹',exact:true}).click();await dialog.getByRole('button',{name:'将 /workspace/shared 设为主要',exact:true}).click();
 await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert(await page.evaluate(()=>window.saves.length===1&&window.saves[0].primaryRoot==='/workspace/shared'&&window.saves[0].roots.length===2),'save sends source folders and selected primary');
 await openEditor();await dialog.waitFor({state:'visible'});
 assert(await dialog.locator('.mira-project-editor__root').filter({hasText:'shared'}).locator('.mira-project-editor__primary').count()===1,'reopening restores saved primary');
 await dialog.getByRole('button',{name:'移除源文件夹 /workspace/shared',exact:true}).click();
 assert(await dialog.locator('.mira-project-editor__primary').count()===1,'removing primary falls back to remaining folder');
 await frame.locator('html').evaluate(el=>el.classList.add('dark'));await page.screenshot({animations:'disabled',path:join(output,'editor-dark.png')});
 await dialog.getByRole('button',{name:'取消',exact:true}).click();await dialog.waitFor({state:'hidden'});
 // Creation shares the same native React form, and trust is explicit.
 await frame.getByRole('button',{name:'添加项目',exact:true}).click();await dialog.waitFor({state:'visible'});
 await dialog.getByRole('textbox',{name:'项目名称'}).fill('New Project');
 await page.evaluate(()=>window.choice='/workspace/new');await dialog.getByRole('button',{name:'选择文件夹',exact:true}).click();
 await dialog.getByRole('button',{name:'创建项目',exact:true}).click();
 const trust=frame.getByRole('dialog',{name:'信任此文件夹吗？'});await trust.waitFor({state:'visible'});
 assert(await page.evaluate(()=>!window.creates?.length),'create does not persist before explicit trust');
 assert(await trust.getByRole('button',{name:'取消',exact:true}).evaluate(el=>el===document.activeElement),'trust dialog initially focuses cancel');
 await trust.getByRole('button',{name:'取消',exact:true}).click();await trust.waitFor({state:'hidden'});
 assert(await dialog.getByRole('textbox',{name:'项目名称'}).inputValue()==='New Project','cancel trust retains creation draft');
 await dialog.getByRole('button',{name:'创建项目',exact:true}).click();await trust.waitFor({state:'visible'});
 await page.screenshot({animations:'disabled',path:join(output,'trust-dark.png')});
 await trust.getByRole('button',{name:'信任文件夹并创建',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert(await page.evaluate(()=>window.creates.length===1&&window.creates[0].primaryRoot==='/workspace/new'),'explicit trust creates project once');
 await frame.locator('[data-collection-id="sidebar-project:new-project"]').waitFor({state:'visible'});
 assert(await frame.locator('[data-collection-id="sidebar-project:new-project"]').count()===1,'new project is visible in actual React sidebar');
 assert(report.errors.length===0,'renderer has no uncaught errors');
} catch(error) {report.failure=String(error);if(app){const page=await app.firstWindow();await page.screenshot({animations:'disabled',path:join(output,'failure.png')});report.frames=await Promise.all(page.frames().map(async frame=>({url:frame.url(),text:(await frame.locator('body').innerText().catch(()=>'' )).slice(0,5000)})));}throw error}
finally {await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));await app?.close();await server.close();console.log(JSON.stringify(report,null,2))}
