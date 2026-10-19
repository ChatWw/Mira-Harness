import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

// Real Electron guest + MCP smoke; only local fixture pages and an ephemeral browser partition.
const folder = await mkdtemp(resolve('node_modules/.cache/mira-browser-smoke-'))
const output = join(folder, 'smoke.cjs')
try {
  const renderer = await build({ stdin: { contents: `
import { MiraHostedBrowsers } from './src/platform/miraHostedBrowsers'
const { ipcRenderer } = window.require('electron')
const stage = document.createElement('div'); stage.style.cssText = 'position:fixed;inset:0'; document.body.append(stage)
const browsers = new MiraHostedBrowsers(() => stage, () => {}, async (sessionId, browserId, guestId) => ipcRenderer.invoke('smoke:bind', { sessionId, browserId, guestId }))
ipcRenderer.on('harness:event', (_event, message) => {
  void browsers.navigate(message.sessionId, message.payload.url, { x: 0, y: 0, width: 900, height: 600 }, message.payload.browserId).catch(console.error)
})
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', format: 'iife', write: false })
  await build({ stdin: { contents: `
import { app, BrowserWindow, ipcMain, webContents } from 'electron'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { MiraBrowserAutomation } from './electron/services/miraBrowserAutomation'
import { createMiraBrowserTransport } from './electron/services/miraBrowserMcp'

let server, window, client
const timeout = setTimeout(() => { console.error('Browser smoke timed out'); app.exit(1) }, 45000)
app.whenReady().then(async () => {
 try {
  server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<title>Mira browser fixture</title><body><label>Name<input id="field" aria-label="Name"></label><button onclick="document.getElementById(&quot;result&quot;).textContent=document.getElementById(&quot;field&quot;).value">Apply</button><p id="result">Not applied</p><div style="height:2000px"></div>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = 'http://127.0.0.1:' + server.address().port + '/'
  const service = new MiraBrowserAutomation()
  window = new BrowserWindow({ show: false, width: 1000, height: 700, webPreferences: { nodeIntegration: true, contextIsolation: false, webviewTag: true, backgroundThrottling: false } })
  ipcMain.handle('smoke:bind', (event, binding) => {
    if (event.sender !== window.webContents) throw Error('Foreign host')
    service.bind(event.sender, binding.sessionId, binding.browserId, webContents.fromId(binding.guestId))
  })
  await window.loadURL('data:text/html,<html><body></body></html>')
  await window.webContents.executeJavaScript(${JSON.stringify(renderer.outputFiles[0].text)})
  client = new Client({ name: 'smoke', version: '1' })
  await client.connect(await createMiraBrowserTransport(window.webContents, 'task-a', service))
  const call = async (name, args) => { const result = await client.callTool({ name, arguments: args }); assert.notEqual(result.isError, true, JSON.stringify(result)); return result.content[0].type === 'text' ? JSON.parse(result.content[0].text) : result.content[0] }
  const opened = await call('browser_open', { url })
  const browserId = opened.browserId
  const snapshot = await call('browser_snapshot', { browserId })
  assert.equal(snapshot.title, 'Mira browser fixture')
  const input = snapshot.elements.find(element => element.name === 'Name' && element.tag === 'input')
  const button = snapshot.elements.find(element => element.tag === 'button')
  assert.ok(input); assert.ok(button)
  await call('browser_fill', { browserId, ref: input.ref, text: 'Mira embedded success' })
  await call('browser_click', { browserId, ref: button.ref })
  let after
  for (let attempt=0;attempt<30;attempt++) {
    after = await call('browser_snapshot', { browserId })
    if (after.text.includes('Mira embedded success')) break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  assert.match(after.text, /Mira embedded success/)
  const stale = await client.callTool({ name: 'browser_click', arguments: { browserId, ref: button.ref } })
  assert.equal(stale.isError, true)
  await assert.rejects(service.execute(window.webContents, 'task-b', 'browser_snapshot', { browserId }))
  const beforeMutation = await call('browser_snapshot', { browserId })
  await webContents.getAllWebContents().find(w=>w.getType()==='webview').executeJavaScript('document.querySelector("button").textContent="Updated"')
  assert.equal((await client.callTool({ name: 'browser_click', arguments: { browserId, ref: beforeMutation.elements.find(element=>element.tag==='button').ref } })).isError, true)
  const shot = await call('browser_screenshot', { browserId })
  assert.equal(shot.type, 'image'); assert.equal(shot.mimeType, 'image/png')
  const bytes = Buffer.from(shot.data, 'base64'); assert.ok(bytes.length > 1000)
  await writeFile(process.argv[2], bytes)
  await call('browser_scroll', { browserId, deltaY: 300 })
  assert.ok(await webContents.getAllWebContents().find(w=>w.getType()==='webview').executeJavaScript('window.scrollY > 0'))
  await call('browser_navigate', { browserId, url: url + '?next=1' })
  const afterNavigation = await client.callTool({ name: 'browser_click', arguments: { browserId, ref: after.elements.find(element => element.tag === 'button').ref } })
  assert.equal(afterNavigation.isError, true)
  window.destroy()
  assert.deepEqual(await service.execute({ isDestroyed: () => false }, 'task-a', 'browser_list', {}), [])
  console.log('PASS: Electron webview + MCP open/snapshot/fill/click/scroll/screenshot/navigation/stale refs/task isolation')
  await client.close(); server.close(); clearTimeout(timeout); app.exit(0)
 } catch (error) { console.error(error); server?.close(); clearTimeout(timeout); app.exit(1) }
})
`, resolveDir: process.cwd(), loader: 'ts', sourcefile: 'mira-browser-smoke.ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', packages: 'external' })
  const electron = createRequire(import.meta.url)('electron')
  const image = resolve(process.argv[2] || 'node_modules/.cache/mira-browser-smoke.png')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [output, image], { stdio: 'inherit', env })
  const code = await new Promise((done, fail) => { child.once('error', fail); child.once('exit', done) })
  if (code !== 0) throw new Error(`Electron browser smoke failed: ${code}`)
  console.log(`Screenshot: ${image}`)
} finally { await rm(folder, { recursive: true, force: true }) }
