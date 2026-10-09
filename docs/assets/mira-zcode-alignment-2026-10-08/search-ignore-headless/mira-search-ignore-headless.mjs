import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { build } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/esbuild/lib/main.js'
import { createServer } from '/Volumes/VrenDisk/project/Mira/Mira-Harness/node_modules/vite/dist/node/index.js'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

// Isolated Vue source render + real file helpers. No Electron, native input, grant or user database.
const root = '/Volumes/VrenDisk/project/Mira/Mira-Harness'
const evidence = dirname(fileURLToPath(import.meta.url))
const fixture = await mkdtemp(resolve(tmpdir(), 'mira-search-ignore-ui-'))
const project = resolve(fixture, 'project-a')
const personal = resolve(fixture, 'personal-b')
await mkdir(project)
await mkdir(personal)
await mkdir(resolve(project, 'node_modules'))
await writeFile(resolve(project, '.gitignore'), '*.log\n')
await writeFile(resolve(project, 'needle.md'), 'ordinary file')
await writeFile(resolve(project, 'needle.log'), 'ignored file')
await writeFile(resolve(project, 'node_modules/needle.md'), 'dependency file')
await writeFile(resolve(personal, 'personal.md'), 'personal file')
async function module(path) {
  const result = await build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
}
const rules = await module('electron/services/harnessWorkspaceIgnore.ts')
const files = await module('electron/services/harnessWorkspaceFiles.ts')
const records = []
const pageErrors = []
let fault = ''
let requests = 0
const directories = { 'project:a': project, 'session:b': personal }
let server
const serveFixture = async (request, response, next) => {
  if (request.url === '/__mira-ignore-fixture') {
    response.setHeader('content-type', 'text/html')
    response.end(await server.transformIndexHtml('/__mira-ignore-fixture', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Mira ignore fixture</title></head><body><div id="app"></div><script type="module">
      import { createApp, h } from 'vue';
      import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
      import ElementPlus, { ElTooltip } from 'element-plus';
      import '/node_modules/element-plus/dist/index.css';
      import '/src/styles/index.scss';
      import AppIcon from '/src/components/AppIcon/index.vue';
      import FileSearch from '/src/pages/backend/fileSearch/index.vue';
      async function call(action, params = {}) {
        const response = await fetch('/__mira-ignore-api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...params }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
      }
      window.platform = { windowChrome: 'standard',
        listHarnessProjects: () => call('projects'), listHarnessSessions: () => call('sessions'),
        readHarnessWorkspaceSearchIgnore: target => call('read', { target }),
        transformHarnessWorkspaceSearchIgnore: (target, content, transform) => call('transform', { target, content, transform }),
        writeHarnessWorkspaceSearchIgnore: (target, content, revision) => call('write', { target, content, revision }) };
      ElTooltip.props.showAfter.default = 550; ElTooltip.props.showArrow.default = false; ElTooltip.props.popperClass.default = 'mira-tooltip';
      const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/settings/file-search', component: FileSearch }, { path: '/settings/general', component: { render: () => h('h1', '常规') } }] });
      const app = createApp({ render: () => h(RouterView) }); app.component('AppIcon', AppIcon); app.use(router); app.use(ElementPlus); await router.push('/settings/file-search'); await router.isReady(); app.mount('#app'); window.fixtureRouter = router;
    </script></body></html>`))
    return
  }
  if (request.url !== '/__mira-ignore-api') return next()
  response.setHeader('content-type', 'application/json')
  try {
    let body = ''
    for await (const chunk of request) { body += chunk; if (body.length > 1_100_000) throw new Error('fixture body too large') }
    const input = JSON.parse(body)
    requests++
    if (fault === input.action) { fault = ''; throw new Error('没有权限读取或保存忽略规则') }
    const directory = input.target && directories[`${input.target.kind}:${input.target.id}`]
    let result
    switch (input.action) {
      case 'projects': result = [{ id: 'a', name: 'Mira fixture project', directory: project }]; break
      case 'sessions': result = [{ id: 'b', title: '个人工作区', workingDirectory: personal }]; break
      case 'read': assert.ok(directory); result = await rules.readHarnessWorkspaceSearchIgnore(directory); break
      case 'transform': assert.ok(directory); result = await rules.transformHarnessWorkspaceSearchIgnore(directory, input.content, input.transform); break
      case 'write': assert.ok(directory); result = await rules.writeHarnessWorkspaceSearchIgnore(directory, input.content, input.revision); break
      default: throw new Error('unknown fixture action')
    }
    response.end(JSON.stringify(result))
  } catch (error) {
    response.statusCode = 400
    response.end(JSON.stringify({ error: error.message }))
  }
}
server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), plugins: [{ name: 'mira-ignore-fixture', configureServer(vite) { vite.middlewares.use(serveFixture) } }], server: { host: '127.0.0.1', port: 0, strictPort: false } })
let browser
async function checkpoint(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(12, 850)
  await page.waitForTimeout(350)
  await page.screenshot()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const layout = await page.evaluate(() => {
    const main = document.querySelector('.settings-main')
    const editor = document.querySelector('textarea')
    const style = editor && getComputedStyle(editor)
    const error = document.querySelector('.search-ignore__error')
    return { viewport: { width: innerWidth, height: innerHeight }, documentOverflow: document.documentElement.scrollWidth > innerWidth, mainOverflow: main.scrollWidth > main.clientWidth, editor: editor && { width: editor.clientWidth, height: editor.clientHeight, disabled: editor.disabled, fontSize: style.fontSize, lineHeight: style.lineHeight, color: style.color, background: style.backgroundColor }, error: error && { color: getComputedStyle(error).color, background: getComputedStyle(document.querySelector('.settings-page')).backgroundColor }, icons: document.querySelectorAll('.search-ignore svg').length }
  })
  assert.equal(layout.documentOverflow, false)
  assert.equal(layout.mainOverflow, false)
  assert.ok(layout.icons >= 6)
  await page.screenshot({ path: resolve(evidence, `${name}.png`) })
  records.push({ step: name, layout })
}
try {
  await server.listen()
  const address = server.httpServer.address()
  const url = `http://127.0.0.1:${address.port}/__mira-ignore-fixture`
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(10_000)
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()) })
  await page.goto(url)
  await page.getByRole('heading', { name: '文件搜索', exact: true }).waitFor()
  const editor = page.getByRole('textbox', { name: '搜索忽略规则' })
  const save = page.getByRole('button', { name: '保存', exact: true })
  await editor.waitFor()
  await page.waitForFunction(() => !document.querySelector('textarea')?.disabled)
  const initial = await editor.inputValue()
  assert.ok(initial.includes('*.log') && initial.includes('node_modules/'))
  await assert.rejects(readFile(resolve(project, '.miraignore')), { code: 'ENOENT' })
  assert.equal(await save.isEnabled(), true)
  await checkpoint(page, 'light-template-1440')
  await save.click()
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor()
  assert.equal(await readFile(resolve(project, '.miraignore'), 'utf8'), initial)
  assert.equal(await save.isDisabled(), true)
  const result = await files.searchHarnessWorkspaceFiles(project, 'needle')
  assert.deepEqual(result.entries.map(entry => entry.path), ['needle.md'])
  assert.ok((await files.listHarnessWorkspaceFiles(project, '')).entries.some(entry => entry.path === 'node_modules'))
  assert.equal((await files.readHarnessWorkspaceFile(project, 'node_modules/needle.md')).content, 'dependency file')
  records.push({ step: 'saved-rules-search-browse-preview', result })
  const custom = initial + 'needle.md\n'
  await editor.fill(custom)
  await writeFile(resolve(project, '.gitignore'), '*.tmp\n')
  await page.getByRole('button', { name: '从 .gitignore 同步' }).click()
  await page.waitForFunction(() => document.querySelector('textarea').value.startsWith('*.tmp'))
  const synced = await editor.inputValue()
  assert.ok(synced.endsWith('needle.md\n'))
  assert.equal(await readFile(resolve(project, '.miraignore'), 'utf8'), initial)
  await page.getByRole('button', { name: '恢复默认规则' }).click()
  await page.waitForFunction(() => !document.querySelector('textarea').disabled)
  assert.ok((await editor.inputValue()).endsWith('needle.md\n'))
  await save.click()
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor()
  const filtered = await files.searchHarnessWorkspaceFiles(project, 'needle')
  assert.deepEqual(filtered.entries, [{ name: 'needle.log', path: 'needle.log', type: 'file' }])
  records.push({ step: 'draft-partitions-save-cache-invalidated', filtered })
  await editor.fill((await editor.inputValue()) + '# unsaved draft\n')
  await page.getByRole('button', { name: '常规', exact: true }).click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  assert.ok((await editor.inputValue()).endsWith('# unsaved draft\n'))
  await page.getByRole('button', { name: '撤销修改' }).click()
  assert.equal(await save.isDisabled(), true)
  fault = 'write'
  await editor.fill((await editor.inputValue()) + '# retained after failure\n')
  await save.click()
  await page.getByRole('alert').filter({ hasText: '没有权限读取或保存忽略规则' }).waitFor()
  assert.ok((await editor.inputValue()).includes('retained after failure'))
  await checkpoint(page, 'light-save-error-1440')
  await save.click()
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor()
  const saved = await editor.inputValue()
  await writeFile(resolve(project, '.miraignore'), saved + '# external edit\n')
  await editor.fill(saved + '# local edit\n')
  await save.click()
  await page.getByRole('alert').filter({ hasText: '忽略规则已被修改，请重新载入' }).waitFor()
  assert.ok((await editor.inputValue()).endsWith('# local edit\n'))
  assert.ok((await readFile(resolve(project, '.miraignore'), 'utf8')).endsWith('# external edit\n'))
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await checkpoint(page, 'dark-conflict-1440')
  await page.getByRole('button', { name: '重新读取规则' }).click()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('textarea').value.endsWith('# external edit\n'))
  records.push({ step: 'route-cancel-revert-save-failure-retry-external-conflict', passed: true })
  await page.getByRole('combobox', { name: '选择工作区' }).click()
  await page.getByRole('option', { name: '个人工作区', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('textarea').disabled)
  assert.ok(!(await editor.inputValue()).includes('external edit'))
  await assert.rejects(readFile(resolve(personal, '.miraignore')), { code: 'ENOENT' })
  fault = 'read'
  await page.getByRole('button', { name: '重新读取规则' }).click()
  await page.getByRole('alert').filter({ hasText: '没有权限读取或保存忽略规则' }).waitFor()
  assert.equal(await editor.isDisabled(), true)
  await checkpoint(page, 'dark-load-error-1440')
  await page.getByRole('button', { name: '重新读取规则' }).click()
  await page.waitForFunction(() => !document.querySelector('textarea').disabled)
  await checkpoint(page, 'dark-personal-template-1440')
  await page.setViewportSize({ width: 1280, height: 800 })
  await checkpoint(page, 'dark-personal-template-1280')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.setViewportSize({ width: 1710, height: 992 })
  await checkpoint(page, 'light-personal-template-1710')
  await editor.fill('custom rules without partition markers\n')
  await page.getByRole('button', { name: '恢复默认规则' }).click()
  await page.getByRole('alert').filter({ hasText: '忽略规则分区标记缺失或重复' }).waitFor()
  assert.equal(await editor.inputValue(), 'custom rules without partition markers\n')
  await page.getByRole('button', { name: '常规', exact: true }).click()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.getByRole('heading', { name: '常规', exact: true }).waitFor()
  records.push({ step: 'personal-root-isolated-load-retry-missing-markers-route-discard', passed: true })
  assert.deepEqual(pageErrors, [])
  await writeFile(resolve(evidence, 'results.json'), JSON.stringify({ timestamp: new Date().toISOString(), validation: 'headless Vue source + isolated real helpers; not native Electron', requests, records, pageErrors, passed: true }, null, 2) + '\n')
  console.log(JSON.stringify({ passed: true, requests, records: records.length, pageErrors }))
} catch (error) {
  await writeFile(resolve(evidence, 'failure-results.json'), JSON.stringify({ timestamp: new Date().toISOString(), requests, records, pageErrors, error: error.stack }, null, 2) + '\n')
  throw error
} finally {
  await browser?.close()
  await server.close()
  await rm(fixture, { recursive: true, force: true })
}
