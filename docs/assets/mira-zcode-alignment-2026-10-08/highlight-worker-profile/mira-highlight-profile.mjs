import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { build } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/esbuild/lib/main.js'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, '../../../..')
const temporary = await realpath(await mkdtemp(resolve(tmpdir(), 'mira-highlight-profile-')))
assert.match(temporary, /^\/private\/var\/folders\/[^/]+\/[^/]+\/T\/mira-highlight-profile-[A-Za-z0-9]+$/)
const output = resolve(temporary, 'assets')
const module = await build({ entryPoints: [resolve(root, 'electron/adapters/localMicroAppServer.ts')], bundle: true, platform: 'node', format: 'esm', write: false })
const { corsHeadersFor } = await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].contents).toString('base64')}`)
const errors = []
const network = []
const messages = []
const report = { startedAt: new Date().toISOString(), scope: 'Isolated headless desktop Chromium profile of current source; Worker prototype only. No production source/build mutation, Electron, native input, user database or ZCode GUI acceptance.', errors, network, messages, passed: false }
let browser
let server

const probeSource = `
import { miraCodeHighlighter, miraCodeThemes } from './code-highlighter';
import { highlightFilePreview } from './file-preview-highlighter';
import {createBundledHighlighter} from 'shiki/core';
import {createOnigurumaEngine} from 'shiki/engine/oniguruma';
import {bundledLanguages} from 'shiki/langs';
const createWasmHighlighter=createBundledHighlighter({langs:bundledLanguages,themes:{'github-light':()=>import('shiki/themes/github-light.mjs'),'github-dark':()=>import('shiki/themes/github-dark.mjs')},engine:()=>createOnigurumaEngine(import('shiki/wasm'))});
let wasm;
export async function tokenize(input) {
  let result;
  if(input.wasm){wasm??=createWasmHighlighter({themes:miraCodeThemes,langs:[]});const highlighter=await wasm;await highlighter.loadLanguage(input.language);const themes=input.themes||miraCodeThemes;result=highlighter.codeToTokens(input.code,{lang:input.language,themes:{light:themes[0],dark:themes[1]},tokenizeTimeLimit:0});}
  else result = input.file ? await highlightFilePreview(input.code, input.language) : await miraCodeHighlighter.highlight({code:input.code,language:input.language,themes:input.themes || miraCodeThemes});
  const { grammarState, ...plain } = result;
  return plain;
}
`
const pageSource = probeSource + `
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2,'0')).join(''); }
async function measure(run, input) {
  const longTasks = [];
  const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push({start:entry.startTime,duration:entry.duration}); });
  observer.observe({type:'longtask'});
  const gaps = []; let last = performance.now();
  const timer = setInterval(() => { const now=performance.now(); gaps.push(now-last);last=now; },5);
  await pause(20);
  const started = performance.now(); const result=await run(input); const finished=performance.now();
  await pause(30);clearInterval(timer);observer.disconnect();
  return {result,metrics:{elapsedMs:finished-started,maxTimerGapMs:Math.max(0,...gaps),timerSamples:gaps.length,longTasks:longTasks.filter(item=>item.start<=finished&&item.start+item.duration>=started)}};
}
let worker; let sequence=0; let pending=new Map(); let bootstrap;
async function loaderTest(module,imports,dynamic=false,direct=false) {
  const entry=new URL('./worker.js',location.href).href;
  const source=imports?(dynamic?'import('+JSON.stringify(entry)+').catch(error=>postMessage({type:"loader-error",name:error.name,message:error.message}))':'import '+JSON.stringify(entry)):'globalThis.postMessage({type:"ready"})';
  const url=direct?entry:URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
  let candidate;
  try {
    candidate=new Worker(url,module?{type:'module'}:undefined);
    return await new Promise(resolve=>{const timeout=setTimeout(()=>resolve({ready:false,error:'timeout'}),3000);candidate.onerror=event=>{clearTimeout(timeout);resolve({ready:false,error:'worker-error',message:event.message||''});};candidate.onmessage=event=>{clearTimeout(timeout);resolve({ready:event.data.type==='ready',...(event.data.type==='loader-error'?{error:event.data.name,message:event.data.message}:{})});};});
  }catch(error){return {ready:false,error:error.name,message:error.message};}
  finally{candidate?.terminate();if(!direct)URL.revokeObjectURL(url);}
}
async function prepareWorker(classic=false) {
  const entry=new URL('./worker.js',location.href).href;
  const source=classic?'import('+JSON.stringify(entry)+').catch(error=>postMessage({type:"loader-error",name:error.name,message:error.message}))':'import '+JSON.stringify(entry);
  bootstrap=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
  worker=new Worker(bootstrap,classic?undefined:{type:'module'});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Worker bootstrap timeout')),10000);
    worker.onerror=event=>{clearTimeout(timeout);reject(new Error(event.message));};
    worker.onmessage=event=>{if(event.data.type==='ready'){clearTimeout(timeout);resolve();}else if(event.data.type==='loader-error'){clearTimeout(timeout);reject(new Error(event.data.message));}};
  });
  URL.revokeObjectURL(bootstrap);bootstrap=undefined;
  worker.onmessage=event=>{const current=pending.get(event.data.id);if(!current)return;pending.delete(event.data.id);event.data.error?current.reject(new Error(event.data.error)):current.resolve(event.data.result);};
  worker.onerror=event=>{for(const current of pending.values())current.reject(new Error(event.message));pending.clear();};
  return {ready:true,bootstrapType:classic?'classic-blob-dynamic-import':'module-blob-static-import',effectiveOrigin:globalThis.origin,urlOrigin:location.origin,iframe:window.top!==window};
}
function remote(input) { return new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Worker request deadline exceeded'));},20000);pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});worker.postMessage({id,input});}); }
async function summarize(entry,input) {
  return {...entry.metrics,codeCharacters:input.code.length,lineCount:entry.result.tokens.length,tokenCount:entry.result.tokens.flat().length,themedTokens:entry.result.tokens.flat().filter(token=>token.htmlStyle?.color&&token.htmlStyle['--shiki-dark']).length,digest:await digest(entry.result)};
}
window.miraHighlightProfile={
  prepareWorker,
  async loaders(){return {effectiveOrigin:globalThis.origin,urlOrigin:location.origin,iframe:window.top!==window,directModule:await loaderTest(true,true,false,true),classicBlob:await loaderTest(false,false),moduleBlob:await loaderTest(true,false),moduleImport:await loaderTest(true,true),classicDynamicImport:await loaderTest(false,true,true)};},
  async baseline(input){const entry=await measure(tokenize,input);return summarize(entry,input);},
  async prototype(input){const entry=await measure(remote,input);const baseline=await tokenize(input);return {...await summarize(entry,input),equal:JSON.stringify(baseline)===JSON.stringify(entry.result)};},
  async run(input) { const local=await measure(tokenize,input);const remoteResult=await measure(remote,input);if(JSON.stringify(local.result)!==JSON.stringify(remoteResult.result))throw new Error('Worker token/style mismatch');return {baseline:await summarize(local,input),workerPrototype:await summarize(remoteResult,input),equal:true}; },
  async growth() {const inputs=Array.from({length:16},(_,i)=>({language:'typescript',code:Array.from({length:(i+1)*64},(_,j)=>'export const growth'+j+': string = "Mira '+j+'";').join('\\n')}));const input={code:inputs.at(-1).code};const local=await measure(async()=>({tokens:(await Promise.all(inputs.map(tokenize))).flatMap(result=>result.tokens)}),input);const remoteResult=await measure(async()=>({tokens:(await Promise.all(inputs.map(remote))).flatMap(result=>result.tokens)}),input);if(JSON.stringify(local.result)!==JSON.stringify(remoteResult.result))throw new Error('Growth token mismatch');return {baseline:await summarize(local,input),workerPrototype:await summarize(remoteResult,input),requests:inputs.length,equal:true};},
  async equivalence(inputs) {const results=[];for(const input of inputs){const local=await tokenize(input);const result=await remote(input);if(JSON.stringify(local)!==JSON.stringify(result))throw new Error('Mismatch: '+input.language);results.push({language:input.language,file:!!input.file,characters:input.code.length,lines:result.tokens.length,digest:await digest(result),equal:true});}return results;},
  dispose(){worker?.terminate();if(bootstrap)URL.revokeObjectURL(bootstrap);}
};
`
const workerSource = probeSource + `
globalThis.onmessage=async event=>{const {id,input}=event.data;try{globalThis.postMessage({id,result:await tokenize(input)});}catch(error){globalThis.postMessage({id,error:error.message});}};
globalThis.postMessage({type:'ready'});
`
try {
  const options = { bundle: true, format: 'esm', splitting: true, platform: 'browser', target: ['chrome110'], minify: true, outdir: output, logLevel: 'silent' }
  await build({ ...options, stdin: { contents: pageSource, resolveDir: resolve(root, 'apps/harness-react/src/lib'), sourcefile: 'mira-profile-page.ts', loader: 'ts' } })
  await build({ ...options, stdin: { contents: workerSource, resolveDir: resolve(root, 'apps/harness-react/src/lib'), sourcefile: 'mira-profile-worker.ts', loader: 'ts' }, outExtension: { '.js': '.mjs' } })
  server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://127.0.0.1').pathname
      if(path==='/favicon.ico'){response.writeHead(204);response.end();return}
      if (path === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><html><head><meta charset="utf-8"><title>Mira isolated performance fixture</title></head><body><iframe sandbox="allow-scripts allow-forms" src="/frame.html"></iframe><script type="module" src="/stdin.js"></script></body></html>');return }
      if (path === '/frame.html') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><input aria-label="fixture input"><script type="module" src="/stdin.js"></script></body></html>');return }
      const mapped = path === '/worker.js' ? '/stdin.mjs' : path
      const file = resolve(output, '.' + mapped)
      if (!file.startsWith(output + sep) || !['.js', '.mjs'].includes(extname(file))) { response.writeHead(404);response.end();return }
      response.writeHead(200, { ...corsHeadersFor(request), 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
      network.push({ path, origin: request.headers.origin || null, headers: corsHeadersFor(request), status: 200 })
      response.end(await readFile(file))
    } catch { response.writeHead(404);response.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => messages.push({ type: message.type(), message: message.text() }))
  page.on('requestfailed', request => network.push({ failedUrl: request.url(), failure: request.failure() }))
  await page.goto(`http://127.0.0.1:${address.port}/`)
  const frame = page.frames().find(frame => frame.parentFrame())
  await frame.waitForFunction(() => !!window.miraHighlightProfile)
  await page.waitForFunction(() => !!window.miraHighlightProfile)
  const evaluate=(target,callback,argument)=>Promise.race([target.evaluate(callback,argument),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Profile operation deadline exceeded')),25000);timer.unref();})])
  report.runtime = await browser.version()
  report.loaders = { sandboxAttribute: await page.locator('iframe').getAttribute('sandbox'), opaque: await frame.evaluate(() => window.miraHighlightProfile.loaders()), host: await page.evaluate(() => window.miraHighlightProfile.loaders()) }
  assert.equal(report.loaders.sandboxAttribute,'allow-scripts allow-forms')
  assert.equal(report.loaders.opaque.effectiveOrigin,'null')
  const workerOwner=report.loaders.opaque.classicDynamicImport.ready?frame:page
  report.loader = await workerOwner.evaluate(classic => window.miraHighlightProfile.prepareWorker(classic), workerOwner===frame)
  assert.equal(report.loader.ready, true)
  report.cases = []
  const cases = [
    { name: 'cold-typescript', language: 'typescript', code: 'const answer: number = 42;\nconsole.log(answer);' },
    { name: 'warm-typescript', language: 'typescript', code: 'const warm: string = "Mira";\nconsole.log(warm);' },
    { name: 'single-line-2100-statements', language: 'typescript', code: Array.from({ length: 2100 }, (_, i) => `export const single${i}: string = "Mira ${i}";`).join('') },
    { name: 'single-line-2100-statements-wasm-unlimited-reference', wasm: true, language: 'typescript', code: Array.from({ length: 2100 }, (_, i) => `export const single${i}: string = "Mira ${i}";`).join('') },
    { name: 'file-preview-8001-lines', language: 'typescript', file: true, code: Array.from({ length: 8000 }, (_, i) => `export const file${i}: string = "Mira ${i}";`).join('\n') + '\n' },
  ]
  for (const input of cases) {
    console.log('Profiling '+input.name)
    report.activeCase=input.name
    const baseline = await evaluate(frame,input => window.miraHighlightProfile.baseline(input), input)
    const workerPrototype = await evaluate(workerOwner,input => window.miraHighlightProfile.prototype(input), input)
    report.cases.push({ name: input.name, wasmUnlimitedReference:!!input.wasm, baseline, workerPrototype, equal:baseline.digest===workerPrototype.digest&&workerPrototype.equal })
  }
  report.activeCase='growth'
  console.log('Profiling growth')
  report.growth = await evaluate(workerOwner,() => window.miraHighlightProfile.growth())
  report.activeCase='equivalence'
  report.equivalence = await evaluate(workerOwner,inputs => window.miraHighlightProfile.equivalence(inputs), [
    { language: 'typescript', file: true, code: '/* open\ncontinue\nclose */\nconst value = `first\nsecond`;\n' },
    { language: 'vue', file: true, code: '<template>\n<p>{{ value }}</p>\n</template>\n<script setup lang="ts">\n/* open\nclose */\nconst value = "Mira"\n</script>\n' },
    { language: 'python', file: true, code: 's = """first\nsecond"""\nprint(s)\n' },
    { language: 'shell', file: true, code: 'cat <<EOF\nMira\nEOF\nprintf ready\n' },
    { language: 'markdown', file: true, code: '# Mira\n\n```typescript\n/* open\nclose */\nconst value = 42;\n```\n' },
    { language: 'json', file: true, code: '{\n "nested": { "enabled": true }\n}\n' },
    { language: ' TS ', file: true, code: '/* 设定\r\n角色 */\r\nconst title = "Mira 你好";\r\n' },
    { language: 'javascript', themes: ['github-dark', 'github-light'], code: 'const swapped = 42;\n' },
    { language: 'mira-unknown', code: '<img src=x onerror="alert(1)">\n<script>safe text</script>\n' },
  ])
  await workerOwner.evaluate(() => window.miraHighlightProfile.dispose())
  const inputs = ['apps/harness-react/src/lib/code-highlighter.ts', 'apps/harness-react/src/lib/file-preview-highlighter.ts', 'src/pages/frontend/microAppHost/FirstPartyFrame.vue', 'electron/adapters/localMicroAppServer.ts']
  report.sources = await Promise.all(inputs.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(resolve(root, path))).digest('hex') })))
  assert.deepEqual(errors, [])
  assert.ok(report.cases.filter(item=>item.name!=='single-line-2100-statements').every(item => item.equal))
  assert.ok(report.equivalence.every(item => item.equal))
  report.allCurrentDefaultCasesEqual=report.cases.filter(item=>!item.wasmUnlimitedReference).every(item=>item.equal)
  report.productionWorkerImplemented=false
  report.measurementBoundary='Timer gaps and Long Tasks around tokenizer/request completion only; not INP, real native input, React rendering, first paint, memory budget or production worker release. Default Shiki 500ms per-line budget can change long-line tokens between runs; wasm-unlimited-reference is explicitly a different engine diagnostic variant, not current production configuration or a direct speedup comparison.'
  report.passed = true
} catch (error) {
  report.error = error.stack
  process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server ? server.close(resolve) : resolve())
  await rm(temporary, { recursive: true, force: true })
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(evidence, 'profile-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
