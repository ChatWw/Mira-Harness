import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/esbuild/lib/main.js'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, '../../../..')
const errors = []
const report = { startedAt: new Date().toISOString(), scope: 'Real current React Markdown components in isolated headless Chromium. Deliberately delayed highlighter fixture, not production Worker performance, Electron, native input, user database or ZCode acceptance.', errors, passed: false }
let server
let browser
const source = `
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MessageMarkdown } from './markdown';
import { MiraStreamingCode } from './MiraStreamingCode';
import { miraCodeHighlighter } from '../../lib/code-highlighter';
const pending = [], requests = [], unhandled = [], copied = [];
window.addEventListener('unhandledrejection', event => unhandled.push(String(event.reason)));
Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => copied.push(text) }, configurable: true });
miraCodeHighlighter.getCached = () => undefined;
miraCodeHighlighter.highlight = (options, signal) => new Promise((resolve, reject) => {
  const id = pending.length;
  const item = { id, code: options.code, language: options.language, signal, resolve, reject, aborted: !!signal?.aborted };
  signal?.addEventListener('abort', () => { item.aborted = true; }, { once: true });
  pending.push(item); requests.push(item);
});
const mount = createRoot(document.getElementById('root'));
window.miraStreamingFixture = {
  render(code, language = 'javascript') { flushSync(() => mount.render(<MiraStreamingCode code={code} language={language} />)); },
  markdown(content, streaming = true, sources) { flushSync(() => mount.render(<MessageMarkdown content={content} streaming={streaming} sources={sources} />)); },
  clear() { flushSync(() => mount.render(null)); },
  settle(id, mode = 'resolve') {
    const item = pending[id];
    if (!item) throw new Error('No request '+id);
    if (mode === 'reject') item.reject(new Error('fixture tokenizer failure'));
    else if (mode === 'abort') item.reject(new DOMException('fixture abort', 'AbortError'));
    else item.resolve({ tokens: item.code.split(/\\r?\\n/).map(content => [{content, offset:0, htmlStyle:{color:'#D73A49','--shiki-dark':'#F97583'}}]) });
  },
  state() { return {requests:requests.map(({id,code,language,aborted})=>({id,code,language,aborted})), copied:[...copied], unhandled:[...unhandled]}; }
};
`

try {
  const bundled = await build({ stdin: { contents: source, resolveDir: resolve(root, 'apps/harness-react/src/components/conversation'), sourcefile: 'mira-streaming-regression.tsx', loader: 'tsx' }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false, target: ['chrome110'], logLevel: 'silent' })
  const script = bundled.outputFiles[0].contents
  const stylesheet = await readFile(resolve(root, 'dist/harness-react-app/app.css'))
  report.productionCssSha256 = createHash('sha256').update(stylesheet).digest('hex')
  server = createServer((request, response) => {
    if (request.url === '/fixture.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(script); return }
    if (request.url === '/fixture.css') { response.writeHead(200, { 'Content-Type': 'text/css' }).end(stylesheet); return }
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html><head><meta charset="utf-8"><title>Mira streaming regression fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script type="module" src="/fixture.js"></script></body></html>')
  })
  await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady))
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => !!window.miraStreamingFixture)
  const render = async (code, language) => page.evaluate(({ code, language }) => window.miraStreamingFixture.render(code, language), { code, language })
  const settle = async (id, mode) => page.evaluate(({ id, mode }) => window.miraStreamingFixture.settle(id, mode), { id, mode })
  const state = async () => page.evaluate(() => window.miraStreamingFixture.state())
  const lastRequest = async () => (await state()).requests.at(-1).id
  const body = page.locator('[data-streamdown="code-block-body"] code')
  const tick = async () => page.evaluate(() => new Promise(resolveTick => setTimeout(resolveTick, 0)))
  const geometry = () => page.locator('[data-streamdown="code-block-body"]').evaluate(element => {
    const pre = element.querySelector('pre')
    const line = element.querySelector('.line')
    const token = line.querySelector('span')
    const rect = element.getBoundingClientRect()
    const before = getComputedStyle(line, '::before')
    return { state: element.dataset.highlightState, bodyWidth: rect.width, bodyHeight: rect.height, preHeight: pre.getBoundingClientRect().height, textInset: token.getBoundingClientRect().x - rect.x, gutterWidth: before.width, gutterMargin: before.marginRight, lineHeight: getComputedStyle(pre).lineHeight, rows: element.querySelectorAll('.line').length }
  })

  const first = 'const answer = "old";\n\n'
  const second = 'const answer = "new";\n\n'
  await render(first)
  assert.equal(await body.textContent(), first)
  const firstId = await lastRequest()
  await render(second)
  const secondId = await lastRequest()
  assert.equal((await state()).requests[firstId].aborted, true)
  assert.equal(await body.textContent(), second)
  const rawGeometry = await geometry()
  assert.equal(rawGeometry.state, 'loading')
  assert.equal(rawGeometry.gutterWidth, '24px')
  assert.equal(rawGeometry.gutterMargin, '16px')
  await settle(secondId)
  await page.waitForFunction(() => document.querySelector('[data-streamdown="code-block-body"] .line span')?.getAttribute('style')?.includes('#D73A49'))
  const readyGeometry = await geometry()
  assert.equal(readyGeometry.state, 'ready')
  assert.deepEqual({ ...rawGeometry, state: 'ready' }, readyGeometry)
  report.layoutStability = { raw: rawGeometry, ready: readyGeometry, unchanged: true, completeTailLinesPreserved: true }
  await settle(firstId)
  await tick()
  assert.equal(await body.textContent(), second)
  await page.locator('[data-streamdown="code-block-copy-button"]').click()
  assert.equal((await state()).copied.at(-1), second)
  report.outOfOrder = { earlierAborted: true, latestVisible: true, exactCopy: true, sourceIncludesTrailingNewlines: true }

  await render('const incomplete =')
  const incompleteId = await lastRequest()
  assert.equal(await body.textContent(), 'const incomplete =')
  await settle(incompleteId)
  await page.waitForFunction(() => document.querySelector('[data-streamdown="code-block-body"] .line span')?.getAttribute('style')?.includes('#D73A49'))
  report.incomplete = { visibleAndHighlightedBeforeCompletion: true }

  await render('const aborted = 1;')
  const abortedId = await lastRequest()
  await render('const latest = 2;')
  const latestId = await lastRequest()
  await settle(abortedId, 'abort')
  await settle(latestId)
  await tick()
  assert.equal(await body.textContent(), 'const latest = 2;')
  assert.equal(await page.locator('[role="alert"]').count(), 0)

  await render('const fail = "<safe>";\n')
  const failedId = await lastRequest()
  const failureRawGeometry = await geometry()
  await settle(failedId, 'reject')
  await page.locator('[role="alert"]').waitFor()
  assert.equal(await body.textContent(), 'const fail = "<safe>";\n')
  const failureGeometry = await geometry()
  assert.deepEqual({ ...failureRawGeometry, state: 'error' }, failureGeometry)
  const failureAppearance = () => page.locator('[role="alert"]').evaluate(element => ({ height: element.getBoundingClientRect().height, color: getComputedStyle(element).color, lineHeight: getComputedStyle(element).lineHeight, codeColor: getComputedStyle(document.querySelector('[data-streamdown="code-block-body"] code')).color }))
  const lightFailure = await failureAppearance()
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  const darkFailure = await failureAppearance()
  assert.equal(darkFailure.height, lightFailure.height)
  assert.notEqual(darkFailure.color, lightFailure.color)
  assert.deepEqual({ ...failureGeometry }, await geometry())
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.getByRole('button', { name: '重试代码高亮' }).click()
  const retriedId = await lastRequest()
  assert.ok(retriedId > failedId)
  await settle(retriedId)
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'))
  assert.deepEqual({ ...failureRawGeometry, state: 'ready' }, await geometry())
  const lightReadyColor = await page.locator('[data-streamdown="code-block-body"] .line span').first().evaluate(element => getComputedStyle(element).color)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  const darkReadyColor = await page.locator('[data-streamdown="code-block-body"] .line span').first().evaluate(element => getComputedStyle(element).color)
  assert.equal(lightReadyColor, 'rgb(215, 58, 73)')
  assert.equal(darkReadyColor, 'rgb(249, 117, 131)')
  assert.deepEqual({ ...failureRawGeometry, state: 'ready' }, await geometry())
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  report.streamingError = { completeEscapedSourcePreserved: true, retryStartedNewRequest: true, retryRecovered: true, codeBodyGeometryUnchangedAcrossFailureRetryAndTheme: true, raw: failureRawGeometry, failed: failureGeometry, lightFailure, darkFailure, lightReadyColor, darkReadyColor }

  await render('const unmounted = 3;')
  const unmountedId = await lastRequest()
  await page.evaluate(() => window.miraStreamingFixture.clear())
  assert.equal((await state()).requests[unmountedId].aborted, true)
  await settle(unmountedId, 'reject')
  await tick()
  assert.equal(await page.locator('[data-streamdown="code-block"]').count(), 0)
  report.cleanup = { supersededAbortHasNoAlert: true, unmountedRequestAborted: true, lateUnmountFailureIgnored: true }

  const sources = [{ index: 1, title: '来源', url: 'https://example.com', snippet: 'fixture citation' }]
  const staticCode = '  const staticValue = "<safe>";\n\n'
  const completed = '结论[1]，未知[9]。\n\n```javascript\n' + staticCode + '```'
  await page.evaluate(({ completed, sources }) => window.miraStreamingFixture.markdown(completed, false, sources), { completed, sources })
  const staticId = await lastRequest()
  await settle(staticId, 'reject')
  await page.locator('[role="alert"]').waitFor()
  assert.equal(await page.locator('.pilot-markdown code').textContent(), staticCode)
  await page.locator('.markdown-code-copy').click()
  assert.equal((await state()).copied.at(-1), staticCode)
  const citationGeometry = await page.locator('.citation-marker button').evaluate(button => ({ height: button.getBoundingClientRect().height, lineHeight: getComputedStyle(button).lineHeight }))
  assert.ok(citationGeometry.height > 0)
  await page.locator('.citation-marker button').click()
  assert.equal(await page.locator('.pilot-citation strong').textContent(), '来源')
  await page.getByRole('button', { name: '重试代码高亮' }).click()
  const staticRetryId = await lastRequest()
  await settle(staticRetryId)
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'))
  assert.equal(await page.locator('.pilot-markdown code').textContent(), staticCode)
  report.staticError = { sourceAndExactCopyPreserved: true, citationClickable: true, citationGeometry, unknownCitationPlain: (await page.locator('.pilot-markdown').textContent()).includes('未知[9]'), retryRecovered: true }

  await page.evaluate(() => window.miraStreamingFixture.markdown('```typescript\nconst staticOld = 1;\n```', false))
  const oldStaticId = await lastRequest()
  await page.evaluate(() => window.miraStreamingFixture.markdown('```typescript\nconst staticNew = 2;\n```', false))
  const newStaticId = await lastRequest()
  assert.equal((await state()).requests[oldStaticId].aborted, true)
  await settle(newStaticId)
  await settle(oldStaticId)
  await tick()
  assert.equal(await page.locator('.pilot-markdown code').textContent(), 'const staticNew = 2;\n')
  report.staticOutOfOrder = { oldRequestAborted: true, newestSourcePreserved: true }

  await page.evaluate(() => window.miraStreamingFixture.markdown('正文 `inline`。\n\n```\n<plain>\n```', true))
  assert.equal(await page.locator('[data-streamdown="inline-code"]').textContent(), 'inline')
  assert.equal(await page.locator('[data-streamdown="code-block"]').getAttribute('data-language'), 'text')
  await page.evaluate(() => window.miraStreamingFixture.clear())
  const final = await state()
  for (const request of final.requests) await settle(request.id)
  await tick()
  report.requestCount = final.requests.length
  report.unhandled = (await state()).unhandled
  assert.deepEqual(errors, [])
  assert.deepEqual(report.unhandled, [])
  report.passed = true
} catch (error) {
  report.failure = error.stack || String(error)
  process.exitCode = 1
} finally {
  await browser?.close()
  if (server) await new Promise(resolveClosed => server.close(resolveClosed))
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(evidence, 'mira-streaming-regression-results.json'), JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}
