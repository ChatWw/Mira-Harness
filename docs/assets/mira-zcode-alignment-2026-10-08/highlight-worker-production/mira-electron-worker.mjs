import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { build } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/esbuild/lib/main.js'

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, '../../../..')
const assets = await realpath(resolve(root, 'dist/harness-react-app'))
const temporary = await realpath(await mkdtemp(resolve(tmpdir(), 'mira-electron-highlight-')))
assert.match(temporary, /^\/private\/var\/folders\/[^/]+\/[^/]+\/T\/mira-electron-highlight-[A-Za-z0-9]+$/)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const sources = ['apps/harness-react/src/lib/code-highlight-worker-client.ts', 'apps/harness-react/src/lib/code-highlight-protocol.ts', 'apps/harness-react/src/lib/code-highlight-core.ts', 'apps/harness-react/src/workers/mira-code-highlight.worker.ts', 'electron/adapters/localMicroAppServer.ts']
const report = {
  startedAt: new Date().toISOString(), passed: false,
  scope: 'Real project Electron hidden renderer fixture with isolated temporary userData, contextIsolation/sandbox/webSecurity enabled and an opaque iframe. Current client source and exact production dist Worker/chunks; not full Mira preload/IPC, native mouse/keyboard/screenshots, packaged release, Windows, React rendering, INP or whole-goal acceptance.',
  network: [], stdout: '', stderr: '',
}
let server
let child

const probeSource = `
import { createMiraHighlightWorkerClient } from './code-highlight-worker-client';
const result={passed:false,effectiveOrigin:globalThis.origin,urlOrigin:location.origin,iframe:window.top!==window,workers:[],cases:[]};
const check=(condition,message)=>{if(!condition)throw new Error(message)};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const text=entry=>entry.tokens.map(line=>line.map(token=>token.content).join('')).join('\\n');
const themes=['github-light','github-dark'];
const blobURLs=new Set();
const nativeCreate=URL.createObjectURL.bind(URL),nativeRevoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=nativeCreate(blob);blobURLs.add(url);return url};
URL.revokeObjectURL=url=>{blobURLs.delete(url);nativeRevoke(url)};
const NativeWorker=Worker;
class ObservedWorker extends NativeWorker {
  constructor(...args){super(...args);this.record={created:true,terminated:false,messages:[],responses:[]};result.workers.push(this.record);this.addEventListener('message',event=>this.record.responses.push({type:event.data.type,id:event.data.id}));}
  postMessage(message,...args){this.record.messages.push({type:message.type,id:message.id,characters:message.options?.code.length});return super.postMessage(message,...args)}
  terminate(){this.record.terminated=true;return super.terminate()}
}
globalThis.Worker=ObservedWorker;
async function waitFor(predicate){const start=performance.now();while(!predicate()){if(performance.now()-start>10000)throw new Error('Fixture observation timeout');await pause(1)}}
async function verify(client,language,code){const entry=await client.highlight({code,language,themes});check(text(entry)===code.replace(/\\r\\n/g,'\\n'),'Source mismatch: '+language);check(!('grammarState' in entry),'Grammar class crossed transport');const tokens=entry.tokens.flat();check(tokens.some(token=>token.htmlStyle?.color&&token.htmlStyle['--shiki-dark']),'Missing two-theme styles: '+language);check(tokens.every(token=>code.slice(token.offset,token.offset+token.content.length)===token.content),'Offset mismatch: '+language);return {language,characters:code.length,lines:entry.tokens.length,tokens:tokens.length,themedTokens:tokens.filter(token=>token.htmlStyle?.color&&token.htmlStyle['--shiki-dark']).length}}
const client=createMiraHighlightWorkerClient();
try {
  check(globalThis.origin==='null','Iframe origin is not opaque');
  result.cases.push(await verify(client,' TS ','/* \\u8bbe\\u5b9a\\r\\n\\u89d2\\u8272 */\\r\\nconst title = "Mira \\u4f60\\u597d";\\r\\n'));
  result.cases.push(await verify(client,'vue','<template>\\n<p>{{ msg }}</p>\\n</template>\\n<script setup lang="ts">\\n/* first\\ncontinue */\\nconst msg = "Mira"\\n</script>\\n<style>\\np { color: red; }\\n</style>\\n'));
  result.cases.push(await verify(client,' SHELL ','cat <<EOF\\nMira\\nEOF\\nprintf "%s\\\\n" "ready"\\n'));
  const code=Array.from({length:2100},(_,index)=>'export const single'+index+': string = "Mira '+index+'";').join('');
  const gaps=[];let last=performance.now();const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now},5);
  let highlighted;const started=performance.now();
  try{highlighted=await client.highlight({code,language:'typescript',themes});await pause(20)}finally{clearInterval(timer)}
  const tokens=highlighted.tokens.flat(),identifiers=new Map(tokens.filter(token=>/^single\\d+$/.test(token.content)).map(token=>[token.content,token]));
  check(code.length===94380&&highlighted.tokens.length===1&&tokens.length===27300,'Long-line token count');
  check(tokens.filter(token=>token.content==='const').length===2100&&tokens.filter(token=>token.content==='export').length===2100,'Long-line keyword completeness');
  check(Array.from({length:2100},(_,index)=>identifiers.get('single'+index)).every(token=>token?.htmlStyle?.color&&token.htmlStyle['--shiki-dark']),'Long-line identifiers lost styles');
  check(tokens.every(token=>code.slice(token.offset,token.offset+token.content.length)===token.content)&&text(highlighted)===code,'Long-line source/offset mismatch');
  result.longLine={characters:code.length,lines:highlighted.tokens.length,tokens:tokens.length,constKeywords:2100,exports:2100,identifiers:identifiers.size,fullSource:true,exactOffsets:true,elapsedMs:performance.now()-started,maxTimerGapMs:Math.max(...gaps),measurement:'Renderer timer proxy around actual Worker completion; not INP or rendered DOM performance'};
  const cancelled=new AbortController();cancelled.abort();
  result.preAbort=await client.highlight({code:'const stale = 1;',language:'typescript',themes},cancelled.signal).then(()=> 'fulfilled',error=>error.name);
  check(result.preAbort==='AbortError','Pre-aborted request resolved');
  const multiline=Array.from({length:8000},(_,index)=>'export const cancel'+index+' = "Mira";').join('\\n');
  const controller=new AbortController(),beforeCancelled=result.workers[0].responses.filter(message=>message.type==='cancelled').length;
  const pending=client.highlight({code:multiline,language:'typescript',themes},controller.signal).then(()=> 'fulfilled',error=>error.name);
  await pause(1);controller.abort();result.activeAbort=await pending;
  check(result.activeAbort==='AbortError','Active cancellation resolved');
  await waitFor(()=>result.workers[0].responses.filter(message=>message.type==='cancelled').length>beforeCancelled);
  result.cases.push(await verify(client,'typescript','const recovered = 42;\\n'));
  check(result.workers.length===1&&!result.workers[0].terminated,'Cancellation restarted warm Worker');
  result.unsupportedTheme=await client.highlight({code:'const theme = 1;',language:'typescript',themes:['mira-unregistered-theme','github-dark']}).then(()=> 'fulfilled',error=>error.message);
  check(result.unsupportedTheme!=='fulfilled','Unsupported theme became fake success');
  result.cases.push(await verify(client,'typescript','const themeRecovered = 42;\\n'));
  const beforeDispose=result.workers[0].messages.filter(message=>message.type==='highlight').length;
  const disposed=client.highlight({code:multiline,language:'typescript',themes}).then(()=> 'fulfilled',error=>error.name);
  await waitFor(()=>result.workers[0].messages.filter(message=>message.type==='highlight').length>beforeDispose);
  client.dispose();result.disposeAbort=await disposed;
  check(result.disposeAbort==='AbortError'&&result.workers[0].terminated,'Dispose failed to settle active work');
  result.cases.push(await verify(client,'typescript','const freshOwner = 42;\\n'));
  check(result.workers.length===2,'Retry did not initialize fresh owner');
  client.dispose();
  check(result.workers.every(worker=>worker.terminated),'Worker remained live after dispose');
  check(blobURLs.size===0,'Bootstrap Blob URLs leaked');
  result.blobURLsRemaining=blobURLs.size;result.passed=true;
}catch(error){result.error=error.stack;client.dispose();}
window.top.postMessage({type:'mira-electron-worker-result',result},'*');
`

try {
  report.sources = await Promise.all(sources.map(async path => ({ path, sha256: sha256(await readFile(resolve(root, path))) })))
  const corsModule = await build({ entryPoints: [resolve(root, 'electron/adapters/localMicroAppServer.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  const { corsHeadersFor } = await import(`data:text/javascript;base64,${Buffer.from(corsModule.outputFiles[0].contents).toString('base64')}`)
  const probe = await build({ stdin: { contents: probeSource, resolveDir: resolve(root, 'apps/harness-react/src/lib'), loader: 'ts', sourcefile: 'mira-electron-worker-fixture.ts' }, bundle: true, platform: 'browser', format: 'esm', target: ['chrome110'], define: { MIRA_HIGHLIGHT_WORKER_PATH: JSON.stringify('./mira-code-highlight.worker.js') }, write: false, logLevel: 'silent' })
  const fixture = Buffer.from(probe.outputFiles[0].contents)
  report.clientFixtureSha256 = sha256(fixture)
  report.productionWorkerSha256 = sha256(await readFile(resolve(assets, 'mira-code-highlight.worker.js')))
  server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url || '/', 'http://127.0.0.1').pathname
      if (path === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<!doctype html><html><head><meta charset="utf-8"><title>Mira isolated Electron Worker fixture</title></head><body><iframe id="fixture" sandbox="allow-scripts allow-forms" src="/apps/mira-harness/fixture.html"></iframe><script>window.miraElectronWorkerResult=new Promise(resolve=>window.addEventListener("message",event=>{if(event.source===document.getElementById("fixture").contentWindow&&event.data?.type==="mira-electron-worker-result")resolve({...event.data.result,hostMessageOrigin:event.origin,sandboxAttribute:document.getElementById("fixture").getAttribute("sandbox")})}));</script></body></html>')
        return
      }
      if (path === '/apps/mira-harness/fixture.html') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="./fixture.js"></script></body></html>')
        return
      }
      if (!path.startsWith('/apps/mira-harness/')) { response.writeHead(404).end(); return }
      const asset = path === '/apps/mira-harness/fixture.js' ? undefined : await realpath(resolve(assets, path.slice('/apps/mira-harness/'.length)))
      if (asset && (!asset.startsWith(assets + sep) || extname(asset) !== '.js')) { response.writeHead(404).end(); return }
      const body = asset ? await readFile(asset) : fixture
      const headers = corsHeadersFor(request)
      report.network.push({ path, origin: request.headers.origin ?? null, corsHeaders: headers, sha256: sha256(body), bytes: body.length, productionAsset: !!asset })
      response.writeHead(200, { ...headers, 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(body)
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const mainSource = `
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const userData=${JSON.stringify(resolve(temporary, 'user-data'))},sessionData=${JSON.stringify(resolve(temporary, 'session-data'))};
fs.mkdirSync(userData,{recursive:true});fs.mkdirSync(sessionData,{recursive:true});
app.setPath('userData',userData);app.setPath('sessionData',sessionData);
app.name='Mira Isolated Worker Evidence';
let window;
(async()=>{const result={runtime:process.versions,windowPreferences:{show:false,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true},console:[],rendererFailures:[]};try{
  await app.whenReady();app.dock?.hide();
  window=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  window.webContents.on('console-message',details=>result.console.push({level:details.level,message:details.message,lineNumber:details.lineNumber,sourceId:details.sourceId}));
  window.webContents.on('render-process-gone',(_event,details)=>result.rendererFailures.push(details));
  result.actualPreferences=window.webContents.getLastWebPreferences();
  await window.loadURL(${JSON.stringify(`http://127.0.0.1:${address.port}/`)});
  result.fixture=await Promise.race([window.webContents.executeJavaScript('window.miraElectronWorkerResult'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Electron renderer fixture exceeded 35 seconds')),35000))]);
  result.passed=result.fixture.passed&&result.rendererFailures.length===0&&!result.console.some(entry=>entry.level==='error');
}catch(error){result.passed=false;result.error=error.stack;}finally{process.stdout.write('MIRA_ELECTRON_WORKER_RESULT='+JSON.stringify(result)+'\\n');window?.destroy();app.quit();}})();
`
  const mainPath = resolve(temporary, 'electron-main.cjs')
  await writeFile(mainPath, mainSource)
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  child = spawn(resolve(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), [mainPath], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
  report.childPid = child.pid
  child.stdout.on('data', data => { report.stdout += data.toString() })
  child.stderr.on('data', data => { report.stderr += data.toString() })
  const exit = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => { report.deadlineExceeded = true; child.kill('SIGTERM') }, 45_000)
    const force = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') }, 50_000)
    child.on('error', error => { clearTimeout(deadline); clearTimeout(force); reject(error) })
    child.on('close', (code, signal) => { clearTimeout(deadline); clearTimeout(force); resolve({ code, signal }) })
  })
  report.exit = exit
  const line = report.stdout.split('\n').find(line => line.startsWith('MIRA_ELECTRON_WORKER_RESULT='))
  assert.ok(line, 'Electron did not return an authoritative renderer result')
  report.electron = JSON.parse(line.slice('MIRA_ELECTRON_WORKER_RESULT='.length))
  assert.equal(exit.code, 0)
  assert.equal(report.electron.passed, true)
  assert.equal(report.electron.fixture.hostMessageOrigin, 'null')
  assert.equal(report.electron.fixture.sandboxAttribute, 'allow-scripts allow-forms')
  for (const name of ['contextIsolation', 'sandbox', 'webSecurity']) assert.equal(report.electron.actualPreferences[name], true)
  assert.equal(report.electron.actualPreferences.nodeIntegration, false)
  const workerLoads = report.network.filter(entry => entry.path.endsWith('/mira-code-highlight.worker.js'))
  assert.ok(workerLoads.length >= 2, 'Retry did not reload the production Worker')
  assert.ok(workerLoads.every(entry => entry.productionAsset && entry.sha256 === report.productionWorkerSha256 && entry.origin === 'null' && entry.corsHeaders['Access-Control-Allow-Origin'] === 'null'))
  assert.ok(report.network.some(entry => /\/wasm-/.test(entry.path) && entry.productionAsset))
  report.sourcesUnchanged = (await Promise.all(report.sources.map(async entry => sha256(await readFile(resolve(root, entry.path))) === entry.sha256))).every(Boolean)
  assert.equal(report.sourcesUnchanged, true)
  report.passed = true
} catch (error) {
  report.error = error.stack
  process.exitCode = 1
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await new Promise(resolve => server ? server.close(resolve) : resolve())
  await rm(temporary, { recursive: true, force: true })
  report.finishedAt = new Date().toISOString()
  report.temporaryDirectoryRemoved = true
  await writeFile(resolve(evidence, 'mira-electron-worker-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: report.passed, exit: report.exit, runtime: report.electron?.runtime, fixture: report.electron?.fixture, error: report.error, result: resolve(evidence, 'mira-electron-worker-results.json') }, null, 2))
}
