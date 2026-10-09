import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, '../../../..')
const production = resolve(root, 'dist/harness-react-app')
const temporary = await realpath(await mkdtemp(resolve(tmpdir(), 'mira-worker-browser-')))
assert.match(temporary, /^\/private\/var\/folders\/[^/]+\/[^/]+\/T\/mira-worker-browser-[A-Za-z0-9]+$/)
const report = { startedAt: new Date().toISOString(), passed: false, errors: [], network: [], boundary: 'Isolated desktop headless Chrome, opaque iframe, real current React components/client and exact built production Worker. Independent WASM reference is fixture-only. Not native input, Electron preload/IPC, installed app, Windows, ZCode GUI, INP, process cold start or whole-goal acceptance.' }
let server
let browser
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createMiraCodeHighlighter,miraCodeThemes} from './apps/harness-react/src/lib/code-highlighter';
import {miraCodeHighlightWorker} from './apps/harness-react/src/lib/code-highlight-worker-client';
import {MessageMarkdown} from './apps/harness-react/src/components/conversation/markdown';
import {FilePreviewSource} from './apps/harness-react/src/components/workspace/FilePreviewPanel';
import {applyHostTheme} from './apps/harness-react/src/platform/theme';
import {createBundledHighlighter} from 'shiki/core';
import {createOnigurumaEngine} from 'shiki/engine/oniguruma';
import {bundledLanguages,bundledLanguagesInfo} from 'shiki/langs';
const createReference=createBundledHighlighter({langs:bundledLanguages,themes:{'github-light':()=>import('shiki/themes/github-light.mjs'),'github-dark':()=>import('shiki/themes/github-dark.mjs')},engine:()=>createOnigurumaEngine(import('shiki/wasm'))});
let reference;
const aliases=new Map(bundledLanguagesInfo.flatMap(item=>(item.aliases||[]).map(alias=>[alias,item.id])));
const themes=miraCodeThemes;
const NativeWorker=window.Worker;
const owners=[];
window.Worker=class extends NativeWorker { constructor(...args){super(...args);owners.push({name:args[1]?.name,terminated:false});this.record=owners.at(-1);}terminate(){this.record.terminated=true;super.terminate();} };
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const serialize=value=>JSON.stringify(canonical(value));
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialize(value))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
async function fullReference(input){ reference??=createReference({themes,langs:[]}); const instance=await reference; const name=input.language.trim().toLowerCase(); const language=aliases.get(name)||name; const lang=language in bundledLanguages?language:'text'; if(lang!=='text')await instance.loadLanguage(lang); const pair=input.themes||themes; const {grammarState,...plain}=instance.codeToTokens(input.code,{lang,themes:{light:pair[0],dark:pair[1]},tokenizeTimeLimit:0,tokenizeMaxLineLength:0});return plain; }
const summarize=async result=>({digest:await digest(result),lines:result.tokens.length,tokens:result.tokens.flat().length,hasGrammarState:'grammarState' in result,themedTokens:result.tokens.flat().filter(token=>token.htmlStyle?.color&&token.htmlStyle['--shiki-dark']).length});
async function measure(run){const tasks=[];const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())tasks.push({start:entry.startTime,duration:entry.duration});});observer.observe({type:'longtask'});const gaps=[];let last=performance.now();const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now;},5);await pause(20);const started=performance.now();try{const result=await run();const finished=performance.now();await pause(30);return {...await summarize(result),elapsedMs:finished-started,maxTimerGapMs:Math.max(...gaps),longTasks:tasks.filter(task=>task.start<=finished&&task.start+task.duration>=started)};}finally{clearInterval(timer);observer.disconnect();}}
const appContainer=document.getElementById('root');
applyHostTheme(appContainer,{theme:'light'});
const view=createRoot(document.getElementById('view'));
window.miraWorkerBrowser={
 owners, origin:globalThis.origin,
 theme(theme){applyHostTheme(appContainer,{theme});},
 async equivalence(inputs){const highlighter=createMiraCodeHighlighter();const results=[];for(const input of inputs){const options={...input,themes:input.themes||themes};const expected=await fullReference(input);const actual=await highlighter.highlight(options);if(serialize(actual)!==serialize(expected))throw new Error('Token/style/offset mismatch: '+input.language);if('grammarState' in actual)throw new Error('GrammarState escaped worker');for(const token of actual.tokens.flat())if(input.code.slice(token.offset,token.offset+token.content.length)!==token.content)throw new Error('Offset mismatch');results.push({language:input.language,characters:input.code.length,equal:true,...await summarize(actual)});}return results;},
 async compare(input){miraCodeHighlightWorker.dispose();const highlighter=createMiraCodeHighlighter();const baseline=await measure(()=>fullReference(input));const actual=await measure(()=>highlighter.highlight({...input,themes:input.themes||themes}));if(baseline.digest!==actual.digest)throw new Error('Reference digest mismatch');return {referenceMainThread:baseline,productionWorker:actual,equal:true};},
 async growth(){const inputs=Array.from({length:16},(_,i)=>({language:'typescript',code:Array.from({length:(i+1)*64},(_,j)=>'export const grow'+j+': string = "Mira '+j+'";').join('\\n')}));const highlighter=createMiraCodeHighlighter();const actual=await measure(async()=>({tokens:(await Promise.all(inputs.map(input=>highlighter.highlight({...input,themes})))).flatMap(result=>result.tokens)}));const expected=await measure(async()=>({tokens:(await Promise.all(inputs.map(fullReference))).flatMap(result=>result.tokens)}));if(actual.digest!==expected.digest)throw new Error('Growth digest mismatch');return {requests:16,referenceMainThread:expected,productionWorker:actual,equal:true};},
 async sharedCancel(){const highlighter=createMiraCodeHighlighter();const cancellation=new AbortController();const options={code:'/* shared cancellation */\\nconst shared = 42;',language:'typescript',themes};const first=highlighter.highlight(options,cancellation.signal).then(()=>({unexpected:true}),error=>({name:error.name}));const second=highlighter.highlight(options);cancellation.abort();const aborted=await first;const result=await second;if(aborted.name!=='AbortError'||!result.tokens.flat().some(token=>token.htmlStyle?.color))throw new Error('Shared cancellation isolation failed');return {aborted,survived:true};},
 async invalidThemeRetry(){const highlighter=createMiraCodeHighlighter();const input={code:'const retry = 42;',language:'typescript'};let rejected=false;try{await highlighter.highlight({...input,themes:['missing-theme','github-dark']});}catch{rejected=true;}if(!rejected)throw new Error('Fake theme success');const result=await highlighter.highlight({...input,themes});return {rejected,retryThemed:result.tokens.flat().some(token=>token.htmlStyle?.color)};},
 async renderedStyles(input){
  const result=await createMiraCodeHighlighter().highlight({...input,themes});
  const body=document.querySelector('[data-highlight-state="ready"]');
  const actual=body.querySelector('.shiki');
  const expected=actual.cloneNode(true);
  const escape=value=>value.replace(/[&<>\"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[character]));
  expected.querySelector('code').innerHTML=result.tokens.map(line=>'<span class="line">'+line.map(token=>'<span style="'+escape(Object.entries(token.htmlStyle||{}).map(([key,value])=>key+':'+value).join(';'))+'">'+escape(token.content)+'</span>').join('')+'</span>').join('\\n');
  expected.style.position='absolute';expected.style.visibility='hidden';body.append(expected);
  const runs=element=>{const walker=document.createTreeWalker(element.querySelector('code'),NodeFilter.SHOW_TEXT);const values=[];let offset=0;while(walker.nextNode()){const node=walker.currentNode;if(!node.data.length)continue;const style=getComputedStyle(node.parentElement);const signature=['color','fontStyle','fontWeight','textDecorationLine','backgroundColor','fontFamily','fontSize','lineHeight'].map(key=>style[key]).join('|');values.push({start:offset,end:offset+node.data.length,signature});offset+=node.data.length;}return values;};
  const checks=[];
  try{for(const theme of ['light','dark']){applyHostTheme(appContainer,{theme});const text=result.tokens.map(line=>line.map(token=>token.content).join('')).join('\\n');if(actual.querySelector('code').textContent!==text||expected.querySelector('code').textContent!==text)throw new Error('Rendered source changed: actual='+actual.querySelector('code').textContent.length+', expected='+text.length);const reference=runs(expected);const rendered=runs(actual);let index=0;for(const run of rendered){while(reference[index]?.end<=run.start)index++;let cursor=index;while(reference[cursor]?.start<run.end){if(run.signature!==reference[cursor].signature)throw new Error('Rendered style changed at '+theme+':'+Math.max(run.start,reference[cursor].start));cursor++;}}checks.push({theme,equal:true,characters:text.length,renderedTextRuns:rendered.length,referenceTextRuns:reference.length});}return {checks,tokenCount:result.tokens.flat().length,elements:actual.querySelectorAll('*').length+1};}
  finally{expected.remove();applyHostTheme(appContainer,{theme:'light'});}
 },
 render(content,streaming=true){view.render(React.createElement(MessageMarkdown,{content,streaming}));},
 async file(code){const highlighter=createMiraCodeHighlighter();const result=await highlighter.highlight({code,language:'typescript',themes});view.render(React.createElement(FilePreviewSource,{content:code,language:'typescript',highlighted:result,wrap:false,active:true}));return summarize(result);},
 startUIProfile(content){const tasks=[];const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())tasks.push({start:entry.startTime,duration:entry.duration});});observer.observe({type:'longtask'});const gaps=[];let last=performance.now();const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now;},5);const input=document.getElementById('probe-input');let count=0;input.oninput=()=>count++;const started=performance.now();this.render(content,true);this.finishUIProfile=async()=>{await pause(30);clearInterval(timer);observer.disconnect();return {elapsedMs:performance.now()-started,maxTimerGapMs:Math.max(...gaps),longTasks:tasks,inputEvents:count,value:input.value};};},
 dispose(){view.unmount();miraCodeHighlightWorker.dispose();}
};
`

try {
  const corsModule = await build({ entryPoints: [resolve(root, 'electron/adapters/localMicroAppServer.ts')], bundle: true, platform: 'node', format: 'esm', write: false })
  const { corsHeadersFor } = await import(`data:text/javascript;base64,${Buffer.from(corsModule.outputFiles[0].contents).toString('base64')}`)
  await build({ stdin: { contents: fixture, sourcefile: 'mira-worker-browser.tsx', resolveDir: root, loader: 'tsx' }, bundle: true, format: 'esm', splitting: true, platform: 'browser', target: ['chrome110'], jsx: 'automatic', minify: true, outdir: resolve(temporary, 'fixture'), logLevel: 'silent' })
  let failWorker = false
  server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://127.0.0.1').pathname
      if (path === '/favicon.ico') { response.writeHead(204); response.end(); return }
      if (path === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><iframe sandbox="allow-scripts allow-forms" src="/frame.html" style="width:1400px;height:850px;border:0"></iframe>'); return }
      if (path === '/frame.html') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"><label>Input <input id="probe-input"></label><div id="view" style="height:700px;overflow:auto"></div></div><script type="module" src="/fixture/stdin.js"></script></body></html>'); return }
      if (path === '/mira-code-highlight.worker.js' && failWorker) { failWorker = false; report.network.push({ path, injectedFailure: 404 }); response.writeHead(404, corsHeadersFor(request)); response.end(); return }
      const base = path.startsWith('/fixture/') ? resolve(temporary, 'fixture') : production
      const file = resolve(base, '.' + (path.startsWith('/fixture/') ? path.slice('/fixture'.length) : path))
      if (!file.startsWith(base + sep) || !['.js', '.css'].includes(extname(file))) throw new Error('unknown resource')
      response.writeHead(200, { ...corsHeadersFor(request), 'Content-Type': extname(file) === '.css' ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store' })
      report.network.push({ path, origin: request.headers.origin || null, cors: corsHeadersFor(request), production: base === production })
      response.end(await readFile(file))
    } catch { response.writeHead(404); response.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  report.runtime = await browser.version()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', error => report.errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const frame = page.frames().find(frame => frame.parentFrame())
  await frame.waitForFunction(() => !!window.miraWorkerBrowser)
  async function captureTheme(name, theme, background) {
    const computed = await frame.evaluate(() => {
      const root = document.getElementById('root')
      const styles = element => element ? { background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color } : null
      return { theme: root.dataset.theme, dark: document.documentElement.classList.contains('dark'), root: styles(root), view: styles(document.getElementById('view')), gutter: styles(document.querySelector('.mira-file-source__number')), code: styles(document.querySelector('.mira-file-source__code .shiki')), themedTokens: document.querySelectorAll('.shiki span[style*="--shiki-dark"]').length }
    })
    assert.equal(computed.theme, theme)
    assert.equal(computed.dark, theme === 'dark')
    assert.equal(computed.root.background, `rgb(${background.join(', ')})`)
    assert.equal(computed.view.foreground, computed.root.foreground)
    assert.notEqual(computed.root.foreground, computed.root.background)
    assert.ok(computed.themedTokens > 0)
    if (computed.gutter) assert.equal(computed.gutter.background, computed.root.background)
    const screenshot = await frame.locator('#root').screenshot({ path: resolve(evidence, name) })
    const pixels = await page.evaluate(async ({ encoded, background }) => {
      const image = new Image()
      image.src = 'data:image/png;base64,' + encoded
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      const colors = new Set(); let backgroundPixels = 0
      for (let offset = 0; offset < data.length; offset += 4) {
        colors.add((data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2])
        if (data[offset] === background[0] && data[offset + 1] === background[1] && data[offset + 2] === background[2]) backgroundPixels++
      }
      const totalPixels = canvas.width * canvas.height
      return { width: canvas.width, height: canvas.height, distinctColors: colors.size, backgroundPixels, totalPixels, nonBackgroundPixels: totalPixels - backgroundPixels }
    }, { encoded: screenshot.toString('base64'), background })
    assert.equal(pixels.width, 1400); assert.equal(pixels.height, 850)
    assert.ok(pixels.backgroundPixels > pixels.totalPixels * 0.5)
    assert.ok(pixels.nonBackgroundPixels > 1000); assert.ok(pixels.distinctColors > 16)
    return { path: name, computed, pixels, sha256: createHash('sha256').update(screenshot).digest('hex'), boundary: 'Isolated current React component canvas with production CSS and applyHostTheme/root contract. Not the whole native Mira workbench.' }
  }
  report.sandbox = await page.locator('iframe').getAttribute('sandbox')
  report.effectiveOrigin = await frame.evaluate(() => window.miraWorkerBrowser.origin)
  assert.equal(report.sandbox, 'allow-scripts allow-forms'); assert.equal(report.effectiveOrigin, 'null')
  const inputs = [
    { language: 'typescript', code: '/* open\ncomment */\nconst title: string = "Mira";\n' },
    { language: 'vue', code: '<template>\n<p>{{ title }}</p>\n</template>\n<script setup lang="ts">\n/* open\ncomment */\nconst title = "Mira"\n</script>\n<style>p { color: red; }</style>\n' },
    { language: 'python', code: 's = """first\nsecond\nlast"""\nprint(s)\n' },
    { language: 'shell', code: 'cat <<EOF\nhello\nworld\nEOF\nprintf ready\n' },
    { language: 'markdown', code: '# Mira\n\n```typescript\n/* open\ncomment */\nconst answer = 42;\n```\n' },
    { language: 'json', code: '{\n  "nested": { "enabled": true }\n}\n' },
    { language: ' TS ', code: '/* 设定\r\n角色 */\r\nconst title = "你好";\r\n' },
    { language: 'javascript', code: 'const inverse = 42;\n', themes: ['github-dark', 'github-light'] },
    { language: 'mira-unknown', code: '<img src=x onerror="bad()">\n& <script>bad()</script>\n' },
  ]
  report.equivalence = await frame.evaluate(inputs => window.miraWorkerBrowser.equivalence(inputs), inputs)
  console.log('Production opaque Worker equivalence passed.')
  const singleLine = Array.from({ length: 2100 }, (_, index) => `export const single${index}: string = "Mira ${index}";`).join('')
  report.longLine = await frame.evaluate(input => window.miraWorkerBrowser.compare(input), { language: 'typescript', code: singleLine })
  assert.equal(report.longLine.productionWorker.tokens, 27_300)
  assert.equal(report.longLine.productionWorker.hasGrammarState, false)
  const manyLines = Array.from({ length: 8000 }, (_, index) => `export const row${index}: string = "Mira ${index}";`).join('\n') + '\n'
  report.file8001 = await frame.evaluate(input => window.miraWorkerBrowser.compare(input), { language: 'typescript', code: manyLines })
  assert.equal(report.file8001.productionWorker.lines, 8001)
  report.growth = await frame.evaluate(() => window.miraWorkerBrowser.growth())
  report.sharedCancel = await frame.evaluate(() => window.miraWorkerBrowser.sharedCancel())
  report.themeRetry = await frame.evaluate(() => window.miraWorkerBrowser.invalidThemeRetry())
  console.log('Production long-line, file, growth, cancel and retry passed.')
  // Exercise the real streaming component and real Worker while entering text in the browser.
  const fenced = '```typescript\n' + singleLine + '\n```'
  await frame.evaluate(content => window.miraWorkerBrowser.startUIProfile(content), fenced)
  const input = frame.locator('#probe-input'); await input.click(); await input.pressSequentially('Mira input stays live', { delay: 15 })
  await frame.waitForFunction(() => document.querySelector('[data-highlight-state="ready"] .shiki code')?.textContent?.includes('single2099'), null, { timeout: 30_000 })
  report.realReactLongLine = await frame.evaluate(() => window.miraWorkerBrowser.finishUIProfile())
  assert.equal(report.realReactLongLine.value, 'Mira input stays live')
  report.realReactLongLine.retainedFinalIdentifier = await frame.locator('[data-streamdown="code-block-body"]').textContent().then(value => value.includes('single2099'))
  assert.equal(report.realReactLongLine.retainedFinalIdentifier, true)
  report.realReactLongLine.renderedStyles = await frame.evaluate(code => window.miraWorkerBrowser.renderedStyles({ code, language: 'typescript' }), singleLine + '\n')
  assert.equal(report.realReactLongLine.renderedStyles.tokenCount, 27_300)
  assert.ok(report.realReactLongLine.renderedStyles.elements < 20_000)
  report.lightScreenshot = await captureTheme('worker-long-line-light.png', 'light', [248, 248, 248])
  const changed = '```typescript\nconst current: string = "LATEST";\n```'
  await frame.evaluate(content => { window.miraWorkerBrowser.render('```typescript\nconst stale = "OLD";\n```', true); window.miraWorkerBrowser.render(content, true) }, changed)
  await frame.waitForFunction(() => document.querySelector('[data-streamdown="code-block-body"]')?.textContent?.includes('LATEST') && document.querySelector('[data-streamdown="code-block-body"] .shiki span[style*="--shiki-dark"]'))
  report.streamingLatest = await frame.locator('[data-streamdown="code-block-body"]').textContent()
  assert.ok(!report.streamingLatest.includes('OLD'))
  const completed = Array.from({ length: 300 }, (_, index) => '```json\n{"item":' + index + '}\n```').join('\n\n')
  await frame.evaluate(content => window.miraWorkerBrowser.render(content, false), completed)
  await frame.waitForFunction(() => document.querySelectorAll('.pilot-markdown .shiki').length === 300, null, { timeout: 30_000 })
  report.completedFences = await frame.locator('.pilot-markdown .shiki').count(); assert.equal(report.completedFences, 300)
  report.fileRendered = await frame.evaluate(code => window.miraWorkerBrowser.file(code), manyLines)
  await frame.waitForFunction(() => document.querySelector('.mira-file-source__code .shiki'))
  report.fileMountedRows = await frame.locator('.mira-file-source__row').count(); assert.ok(report.fileMountedRows < 150)
  await frame.locator('.mira-file-source').evaluate(element => { element.scrollTop = element.scrollHeight })
  await frame.waitForFunction(() => [...document.querySelectorAll('.mira-file-source__number')].some(element => element.textContent === '8001'))
  report.fileFinalVisible = true
  await frame.evaluate(() => window.miraWorkerBrowser.theme('dark'))
  report.darkScreenshot = await captureTheme('worker-file-dark.png', 'dark', [22, 22, 22])
  assert.notEqual(report.darkScreenshot.computed.root.foreground, report.lightScreenshot.computed.root.foreground)
  // Actual Worker entry failure, not a highlighter mock; next request must create a clean owner.
  await frame.evaluate(() => window.miraWorkerBrowser.dispose())
  const retryPage = await browser.newPage()
  await retryPage.goto(`http://127.0.0.1:${server.address().port}/`)
  const retryFrame = retryPage.frames().find(frame => frame.parentFrame())
  await retryFrame.waitForFunction(() => !!window.miraWorkerBrowser)
  failWorker = true
  report.loaderRetry = await retryFrame.evaluate(async () => {
    const api = window.miraWorkerBrowser
    let failed = false
    try { await api.equivalence([{ language: 'typescript', code: 'const first = 1;' }]) } catch { failed = true }
    const retry = await api.equivalence([{ language: 'typescript', code: 'const retry = 2;' }])
    return { failed, retryPassed: retry[0].equal, owners: api.owners }
  })
  assert.equal(report.loaderRetry.failed, true); assert.equal(report.loaderRetry.retryPassed, true)
  await retryFrame.evaluate(() => window.miraWorkerBrowser.dispose())
  report.workerArtifact = { path: 'dist/harness-react-app/mira-code-highlight.worker.js', sha256: createHash('sha256').update(await readFile(resolve(production, 'mira-code-highlight.worker.js'))).digest('hex') }
  report.sources = await Promise.all(['code-highlighter.ts', 'code-highlight-core.ts', 'code-highlight-worker-client.ts', 'code-highlight-protocol.ts', 'file-preview-highlighter.ts'].map(async name => ({ path: 'apps/harness-react/src/lib/' + name, sha256: createHash('sha256').update(await readFile(resolve(root, 'apps/harness-react/src/lib', name))).digest('hex') })))
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) { report.failure = error.stack || String(error); throw error }
finally {
  report.finishedAt = new Date().toISOString()
  await browser?.close()
  await new Promise(resolve => server ? server.close(resolve) : resolve())
  await rm(temporary, { recursive: true, force: true })
  if (!report.passed) await writeFile(resolve(evidence, `mira-worker-browser-failure-${report.finishedAt.replaceAll(':', '-')}.json`), JSON.stringify(report, null, 2))
  await writeFile(resolve(evidence, 'mira-worker-browser-results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, at: report.finishedAt, longLine: report.longLine, realReactLongLine: report.realReactLongLine, failure: report.failure }, null, 2))
}
