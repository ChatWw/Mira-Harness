import assert from 'node:assert/strict'
import { copyFile, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/esbuild/lib/main.js'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import sharp from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs'

const root = '/Volumes/VrenDisk/project/Mira/Mira-Harness'
const evidence = resolve(root, 'docs/assets/mira-zcode-alignment-2026-10-08/image-preview-headless')
await mkdir(evidence, { recursive: true })
const project = await mkdtemp(resolve(tmpdir(), 'mira-image-headless-'))
const backend = await build({ entryPoints: [resolve(root, 'electron/services/harnessWorkspaceFiles.ts')], bundle: true, platform: 'node', format: 'esm', write: false })
const files = await import(`data:text/javascript;base64,${Buffer.from(backend.outputFiles[0].contents).toString('base64')}`)
const parserBuild = await build({ entryPoints: [resolve(root, 'src/platform/firstPartyHarness.ts')], bundle: true, platform: 'node', format: 'esm', write: false })
const { parseFirstPartyHarnessCall } = await import(`data:text/javascript;base64,${Buffer.from(parserBuild.outputFiles[0].contents).toString('base64')}`)
const transparent = await sharp({ create: { width: 640, height: 320, channels: 4, background: { r: 30, g: 138, b: 62, alpha: 0.55 } } }).png().toBuffer()
await writeFile(resolve(project, 'mira-transparent@2x.png'), transparent)
await sharp({ create: { width: 3200, height: 100, channels: 4, background: '#2276d2' } }).png().toFile(resolve(project, 'mira-wide.png'))
await sharp({ create: { width: 80, height: 3000, channels: 4, background: '#ca436a' } }).png().toFile(resolve(project, 'mira-tall.png'))
await writeFile(resolve(project, 'mira-broken.png'), 'not a PNG')
await writeFile(resolve(project, 'mira-svg.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><rect width="240" height="120" fill="#2276d2"/><text x="20" y="65" fill="white" font-size="24">Mira fixture</text></svg>')
await writeFile(resolve(project, 'mira-unsafe.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" onload="window.__miraSvgExecuted=true"><script>window.__miraSvgExecuted=true</script><image href="https://mira-svg-should-not-load.invalid/pixel.png"/><rect width="240" height="120" fill="#2276d2"/></svg>')
await writeFile(resolve(project, 'mira-broken.svg'), '<svg malformed')
for (const [extension, format] of [['jpeg', 'jpeg'], ['jpg', 'jpeg'], ['webp', 'webp'], ['gif', 'gif'], ['avif', 'avif']]) {
  await sharp({ create: { width: 64, height: 32, channels: 4, background: '#2276d2' } }).toFormat(format).toFile(resolve(project, `mira-format.${extension}`))
}
await copyFile(resolve(root, 'src/asset/mira.ico'), resolve(project, 'mira-format.ico'))
await copyFile(resolve(root, 'build/installerHeader.bmp'), resolve(project, 'mira-format.bmp'))
const session = { version: 1, id: 'image-fixture', projectId: 'image-project', title: 'Mira 图片预览验收夹具', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false }
const preferences = new Map([['active-session', session.id]])
const requests = [], checks = [], pageErrors = [], remoteRequests = []
const record = (name, details) => { const item = { at: new Date().toISOString(), name, ...details }; checks.push(item); console.log(JSON.stringify(item)) }
async function invoke(method, raw) {
  if (method === 'preferences.get') return preferences.get(raw.key) ?? null
  if (method === 'preferences.set') { preferences.set(raw.key, raw.value); return }
  const call = parseFirstPartyHarnessCall(method.replace(/^harness\./, ''), raw)
  if ('sessionId' in call) assert.equal(call.sessionId, session.id)
  switch (call.method) {
    case 'sessions.list': return [session]
    case 'projects.list': return [{ id: 'image-project', name: 'Mira 图片夹具', icon: 'FolderOpened', directory: project, directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 1 }]
    case 'providers.list': case 'permissions.pending': case 'skills.list': case 'mcp.list': case 'editors.list': return []
    case 'session.get': return session
    case 'session.set-unread': return
    case 'files.list': return files.listHarnessWorkspaceFiles(project, call.path)
    case 'files.read': return files.readHarnessWorkspaceFile(project, call.path)
    case 'files.read-image': return files.readHarnessWorkspaceImage(project, call.path)
    case 'files.watch': return { watchId: 'image-fixture-watch' }
    case 'files.unwatch': return
    default: throw new Error(`Fixture method not implemented: ${call.method}`)
  }
}
const parentHtml = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe id="app" src="/app/index.html" sandbox="allow-scripts allow-forms allow-downloads" allow="clipboard-write"></iframe><script>
const app=document.getElementById('app');app.addEventListener('load',()=>{const channel=new MessageChannel();window.fixturePort=channel.port1;channel.port1.onmessage=async event=>{const data=event.data;if(data.type!=='mira:request')return;try{const response=await fetch('/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});channel.port1.postMessage({type:'mira:response',id:data.id,...await response.json()})}catch(error){channel.port1.postMessage({type:'mira:response',id:data.id,ok:false,error:{message:error.message}})}};app.contentWindow.postMessage({type:'mira:connect',apiVersion:{major:1}},'*',[channel.port2]);window.theme=theme=>channel.port1.postMessage({type:'mira:context',context:{theme}});window.watch=()=>channel.port1.postMessage({type:'mira:harness-event',event:{type:'workspace-files-changed',sessionId:'image-fixture',payload:{watchId:'image-fixture-watch',directory:${JSON.stringify(project)},paths:['']}}})})</script>`
const server = createServer(async (request, response) => {
  try {
    response.setHeader('Access-Control-Allow-Origin', '*')
    if (request.url === '/invoke') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk)
      const { id, method, params } = JSON.parse(Buffer.concat(chunks))
      requests.push({ id, method, params, at: new Date().toISOString() })
      try { const value = await invoke(method, params); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ ok: true, value })) }
      catch (error) { response.end(JSON.stringify({ ok: false, error: { message: error.message } })) }
      return
    }
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(parentHtml); return }
    const relative = decodeURIComponent(new URL(request.url, 'http://fixture.invalid').pathname).replace(/^\/app\//, '')
    const path = resolve(root, 'dist/harness-react-app', relative)
    if (!path.startsWith(resolve(root, 'dist/harness-react-app') + '/')) { response.writeHead(403); response.end(); return }
    response.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(path)] || 'application/octet-stream')
    response.end(await readFile(path))
  } catch (error) { response.writeHead(500); response.end(String(error.message)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:') && !request.url().startsWith('data:')) remoteRequests.push(request.url()) })
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const frame = page.frameLocator('#app')
  await frame.locator('.mira-session-row__open[aria-current="page"]').waitFor()
  await frame.getByRole('button', { name: '查看文件', exact: true }).click()
  async function open(path) { await frame.locator(`[data-file-tree-path="${path}"]`).click(); await frame.locator('.mira-file-preview:visible').waitFor() }
  const preview = frame.locator('.mira-file-preview:visible')
  const picture = () => preview.locator('.mira-image-preview img')
  async function loaded() { await picture().waitFor(); await picture().evaluate(image => image.decode()); await preview.locator('img:not(.is-loading)').waitFor() }
  async function capture(name) {
    await preview.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.waitForTimeout(250)
    const state = await frame.locator('html').evaluate(html => ({ dark: html.classList.contains('dark'), alert: html.querySelector('.mira-file-preview [role="alert"]')?.textContent, selectedPath: html.querySelector('[data-file-tree-path][aria-selected="true"]')?.getAttribute('data-file-tree-path') }))
    const screenshot = await page.screenshot({ path: resolve(evidence, name), animations: 'disabled' })
    const pixel = await sharp(screenshot).extract({ left: 640, top: 200, width: 1, height: 1 }).removeAlpha().raw().toBuffer()
    assert.ok(state.dark ? pixel[0] < 40 : pixel[0] > 230, `Screenshot theme is stale: ${name}`)
    if (name.includes('error')) assert.ok(state.alert, `Screenshot error state is missing: ${name}`)
    record('capture', { name, type: 'headless-browser-fixture-not-native-electron', ...state, threadPixel: [...pixel] })
  }
  await open('mira-transparent@2x.png'); await loaded()
  const frameGeometry = await preview.evaluate(panel => ({ padding: getComputedStyle(panel).padding, borderBottomWidth: getComputedStyle(panel).borderBottomWidth, panelWidth: panel.getBoundingClientRect().width, toolbarWidth: panel.querySelector('header').getBoundingClientRect().width, toolbarHeight: panel.querySelector('header').getBoundingClientRect().height, canvasPadding: getComputedStyle(panel.querySelector('.mira-image-preview')).padding }))
  assert.equal(frameGeometry.padding, '0px'); assert.equal(frameGeometry.borderBottomWidth, '0px'); assert.equal(frameGeometry.toolbarHeight, 40); assert.equal(frameGeometry.panelWidth, frameGeometry.toolbarWidth); assert.equal(frameGeometry.canvasPadding, '40px'); record('preview-cascade-isolation', frameGeometry)
  const dimensions = await picture().evaluate(image => ({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, cssWidth: image.style.width, cssHeight: image.style.height }))
  assert.equal(dimensions.naturalWidth, 640); assert.equal(dimensions.cssWidth, '320px'); assert.equal(dimensions.cssHeight, '160px'); assert.ok(dimensions.width <= 320 && dimensions.height <= 160)
  assert.equal(await preview.getByRole('button', { name: '将当前文件加入对话', exact: true }).count(), 0)
  await preview.getByRole('button', { name: '文件预览选项', exact: true }).click()
  assert.equal(await frame.getByRole('menuitem', { name: '复制文件内容', exact: true }).count(), 0)
  await page.keyboard.press('Escape'); await capture('mira-image-light.png'); record('bitmap-retina-and-text-actions', dimensions)
  await page.evaluate(() => window.theme('dark'))
  await frame.locator('html.dark').waitFor(); await capture('mira-image-dark.png')
  for (const extension of ['jpeg', 'jpg', 'webp', 'gif', 'avif', 'ico', 'bmp']) {
    await open(`mira-format.${extension}`); await loaded()
    record('bitmap-format-decoded', { extension, ...(await picture().evaluate(image => ({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }))) })
  }
  await open('mira-wide.png'); await loaded()
  await open('mira-tall.png'); await loaded()
  const fit = await picture().evaluate(image => { const imageBox = image.getBoundingClientRect(), parent = image.parentElement.getBoundingClientRect(); return { height: imageBox.height, width: imageBox.width, parentHeight: parent.height, parentWidth: parent.width } })
  assert.ok(fit.height <= fit.parentHeight - 80 + 1 && fit.width <= fit.parentWidth - 80 + 1); record('large-image-fit', fit)
  await open('mira-broken.png'); await preview.getByRole('alert').waitFor(); assert.match(await preview.innerText(), /图片.*(无法|失败)|解码/)
  const decodeStyle = await preview.getByRole('alert').evaluate(notice => ({ color: getComputedStyle(notice).color, bodyColor: getComputedStyle(notice.querySelector('p')).color, fontSize: getComputedStyle(notice.querySelector('p')).fontSize }))
  assert.equal(decodeStyle.bodyColor, decodeStyle.color); assert.equal(decodeStyle.fontSize, '13px'); record('decode-error-cascade', decodeStyle)
  await capture('mira-image-decode-error.png')
  await writeFile(resolve(project, 'mira-broken.png'), transparent)
  await preview.getByRole('button', { name: '重试', exact: true }).click(); await loaded(); record('decode-error-retry', { recovered: true })
  await open('mira-svg.svg'); await loaded(); await capture('mira-svg-preview.png')
  await preview.getByRole('button', { name: '文件预览选项', exact: true }).click()
  await frame.getByRole('menuitemradio', { name: '源码', exact: true }).click()
  await preview.getByRole('region', { name: /文件源码/ }).waitFor(); assert.match(await preview.innerText(), /Mira fixture/); await capture('mira-svg-source.png')
  assert.equal(await preview.getByRole('button', { name: '将当前文件加入对话', exact: true }).isEnabled(), true)
  await preview.getByRole('button', { name: '文件预览选项', exact: true }).click(); await frame.getByRole('menuitemradio', { name: '预览', exact: true }).click(); await loaded(); record('svg-preview-source', { switched: true })
  await open('mira-broken.svg'); await preview.getByRole('alert').waitFor()
  await preview.getByRole('button', { name: '文件预览选项', exact: true }).click(); await frame.getByRole('menuitemradio', { name: '源码', exact: true }).click(); assert.match(await preview.innerText(), /malformed/)
  assert.equal(await preview.getByRole('button', { name: '将当前文件加入对话', exact: true }).isEnabled(), true)
  await preview.getByRole('button', { name: '将当前文件加入对话', exact: true }).click()
  assert.equal(await frame.locator('.mira-file-preview:visible').getByRole('region', { name: /文件源码/ }).count(), 1)
  record('broken-svg-source', { sourceAccessible: true, readableTextCanBeAdded: true })
  await open('mira-unsafe.svg'); await loaded()
  assert.equal(await picture().evaluate(image => image.ownerDocument.defaultView.__miraSvgExecuted), undefined)
  assert.equal(remoteRequests.length, 0); record('svg-isolated-image', { remoteRequests, executed: false })
  await open('mira-transparent@2x.png'); await loaded()
  const imageReads = () => requests.filter(item => item.method === 'harness.files.read-image').length
  const before = imageReads()
  await frame.getByRole('button', { name: '工作区', exact: true }).click()
  await writeFile(resolve(project, 'mira-transparent@2x.png'), await sharp({ create: { width: 600, height: 240, channels: 4, background: '#ca436a' } }).png().toBuffer())
  await page.evaluate(() => window.watch()); await page.waitForTimeout(450)
  assert.equal(imageReads(), before)
  await frame.getByRole('button', { name: '工作区', exact: true }).click()
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await picture().evaluateAll(images => images[0]?.naturalWidth === 600)) break
    await page.waitForTimeout(50)
  }
  await loaded(); assert.equal(await picture().evaluate(image => image.naturalWidth), 600)
  record('hidden-watch-reload', { before, after: imageReads() })
  await page.evaluate(() => window.theme('light')); await frame.locator('html:not(.dark)').waitFor()
  await rm(resolve(project, 'mira-transparent@2x.png')); await preview.getByRole('button', { name: '刷新文件', exact: true }).click(); await preview.getByRole('alert').waitFor()
  const readStyle = await preview.getByRole('alert').evaluate(notice => ({ color: getComputedStyle(notice).color, bodyColor: getComputedStyle(notice.querySelector('p')).color, fontSize: getComputedStyle(notice.querySelector('p')).fontSize }))
  assert.equal(readStyle.bodyColor, readStyle.color); assert.equal(readStyle.fontSize, '13px'); record('read-error-cascade', readStyle)
  await capture('mira-image-read-error.png')
  await writeFile(resolve(project, 'mira-transparent@2x.png'), transparent); await preview.getByRole('button', { name: '重试', exact: true }).click(); await loaded(); record('missing-bitmap-restored', { restored: true })
  assert.equal(pageErrors.length, 0)
  record('result', { passed: true, browserVersion: browser.version(), project, pageErrors, desktopMouseKeyboard: false, electronGrant: 'unit-tests-only', screenshots: 'headless-fixture-only' })
} catch (error) { record('result', { passed: false, error: error.stack, pageErrors }); throw error }
finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  await writeFile(resolve(evidence, 'results.json'), JSON.stringify({ checks, requests, pageErrors, remoteRequests }, null, 2))
  await rm(project, { recursive: true, force: true })
}
