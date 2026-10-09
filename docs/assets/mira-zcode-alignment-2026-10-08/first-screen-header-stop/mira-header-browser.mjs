import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, '../../../..')
await mkdir(evidence, { recursive: true })
const source = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { HarnessWorkbench } from './apps/harness-react/src/components/workbench/HarnessWorkbench'
import { PilotController } from './apps/harness-react/src/state/pilot-state'
import { applyHostTheme } from './apps/harness-react/src/platform/theme'
const now = Date.now()
const messages = [{ id: 'question', role: 'user', content: '验证 Header 与侧栏分组同步', createdAt: now }, { id: 'answer', role: 'assistant', content: '保留当前任务与项目上下文。', createdAt: now + 1 }]
const task = (id, title, projectId) => ({ version: 1, id, title, projectId, workingDirectory: '/mira/isolated-header', messages, toolCalls: [], permissionMode: 'default', status: 'active', createdAt: now, updatedAt: now })
const sessions = [task('active', 'Header 回归任务', 'project'), task('personal', '个人工作区任务')]
const projects = [{ id: 'project', name: 'Mira Header 隔离项目', directory: '/mira/isolated-header', directoryExists: true, isGitRepository: true, gitBranch: 'codex/header-fixture', sessionCount: 1, createdAt: now, updatedAt: now }]
const defaults = { view: 'group', projectView: 'timeline', expandedProjectIds: [], collapsedProjectIds: ['project'], groups: [{ id: 'research', name: '研究', color: 'blue', collapsed: false, sessionIds: ['active'] }, { id: 'writing', name: '写作', color: 'green', collapsed: true, sessionIds: [] }] }
if (!localStorage.getItem('session-drawer')) localStorage.setItem('session-drawer', JSON.stringify(defaults))
const fixture = window.fixture = { branchCalls: 0, branchMode: 'wait', branchResolve: null, branchReject: null, writes: [] }
const host = {
  listSessions: async () => sessions, listProjects: async () => projects, listProviders: async () => [],
  getSession: async id => sessions.find(task => task.id === id), listPendingPermissions: async () => [],
  onEvent: () => () => {}, onBrowserEvent: () => () => {},
  getPreference: async key => key === 'active-session' ? 'active' : JSON.parse(localStorage.getItem(key) || 'null'),
  setPreference: async (key, value) => { fixture.writes.push({ key, value }); localStorage.setItem(key, JSON.stringify(value)) },
  getComposerPreferences: async () => ({ sendShortcut: 'mod-enter', showContextUsage: true }),
  listSkills: async () => [], listMcp: async () => [], listEditors: async () => [],
  openSessionProject: async () => '',
  listGitBranches: async () => { fixture.branchCalls++; if (fixture.branchMode === 'error') throw new Error('隔离 Git 读取失败'); if (fixture.branchMode === 'ok') return [{ name: 'codex/header-fixture', current: true, uncommittedFileCount: 3 }]; return new Promise((resolve, reject) => { fixture.branchResolve = resolve; fixture.branchReject = reject }) },
}
const controller = fixture.controller = new PilotController(host)
const container = document.getElementById('root')
applyHostTheme(container, { theme: 'light' })
createRoot(container).render(<HarnessWorkbench controller={controller} />)
void controller.start()
`
const bundle = await build({ stdin: { contents: source, loader: 'tsx', resolveDir: root, sourcefile: 'mira-header-isolated-fixture.tsx' }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', minify: true, write: false, outdir: resolve(evidence, 'fixture-bundle'), define: { MIRA_HIGHLIGHT_WORKER_PATH: JSON.stringify('./mira-code-highlight.worker.js') } })
const script = bundle.outputFiles.find(file => file.path.endsWith('.js')).contents
execFileSync(resolve(root, 'node_modules/.bin/tailwindcss'), ['-i', resolve(root, 'apps/harness-react/src/styles/app.css'), '-o', resolve(evidence, 'fixture.css'), '--minify'], { stdio: 'inherit', cwd: root })
const css = await readFile(resolve(evidence, 'fixture.css'))
const report = { startedAt: new Date().toISOString(), passed: false, boundary: 'Current source bundled through an isolated esbuild test entry with real React, assistant-ui and Radix DOM, current Tailwind CSS. Explicit in-browser PilotHost fixtures and localStorage, not production app entry, MessageChannel, preload/IPC, native Electron, Git filesystem or ZCode same-state comparison. Headless only; no desktop input.', checks: [], errors: [], captures: [] }
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script) }
  else if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css) }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>') }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
let browser
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.address().port)
  await page.getByRole('heading', { name: 'Header 回归任务', exact: true }).waitFor()
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('session-drawer')))
  const collection = name => page.locator('[data-collection-id]').filter({ has: page.getByRole('button', { name, exact: true }) })
  const move = async name => {
    await page.getByRole('button', { name: '当前任务菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '移动到分组', exact: true }).hover()
    await page.getByRole('menuitem', { name, exact: true }).click()
  }
  await collection('研究').getByRole('button', { name: 'Header 回归任务', exact: true }).waitFor()
  await move('写作')
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('session-drawer')).groups.find(group => group.id === 'writing').sessionIds.includes('active'))
  assert.equal(await collection('研究').getByRole('button', { name: 'Header 回归任务', exact: true }).count(), 0)
  assert.equal(await collection('写作').getByRole('button', { name: '写作', exact: true }).getAttribute('aria-expanded'), 'false')
  await page.getByRole('button', { name: '会话', exact: true }).click()
  await page.locator('#pilot-sessions').waitFor({ state: 'hidden' })
  await move('研究')
  await page.getByRole('button', { name: '会话', exact: true }).click()
  await collection('研究').getByRole('button', { name: 'Header 回归任务', exact: true }).waitFor()
  assert.equal((await saved()).groups.find(group => group.id === 'writing').collapsed, true)
  report.checks.push('Real Header submenu updates same sidebar grouping store while sidebar open and closed; collapsed destination remains collapsed')
  await move('写作')
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('session-drawer')).groups.find(group => group.id === 'writing').sessionIds.includes('active'))
  await page.reload()
  await page.getByRole('heading', { name: 'Header 回归任务', exact: true }).waitFor()
  await collection('写作').getByRole('button', { name: '写作', exact: true }).click()
  await collection('写作').getByRole('button', { name: 'Header 回归任务', exact: true }).waitFor()
  await move('移出分组')
  await page.getByRole('group', { name: '未分组任务', exact: true }).getByRole('button', { name: 'Header 回归任务', exact: true }).waitFor()
  assert.deepEqual((await saved()).collapsedProjectIds, ['project'])
  assert.equal((await saved()).projectView, 'timeline')
  report.checks.push('Header grouping survives reload and ungroup returns task to sidebar without resetting timeline/project-collapse preferences')
  await page.screenshot({ path: resolve(evidence, 'header-group-ungroup-light.png'), animations: 'disabled' })
  report.captures.push('header-group-ungroup-light.png')

  const context = page.getByRole('button', { name: '工作目录信息', exact: true })
  await context.hover()
  await page.getByRole('tooltip').filter({ hasText: 'codex/header-fixture' }).waitFor()
  await page.getByLabel('正在读取 Git 分支', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => fixture.branchCalls), 1)
  await context.click()
  await page.getByRole('menuitem', { name: '刷新分支信息', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => fixture.branchCalls), 1)
  await page.evaluate(() => fixture.branchResolve([{ name: 'codex/header-fixture', current: true, uncommittedFileCount: 3 }]))
  await page.getByText('3 个未提交文件', { exact: true }).waitFor()
  report.checks.push('Context lazy real tooltip/menu keeps known branch, exposes loading and deduplicates in-flight requests; displays real response count')
  await page.evaluate(() => { fixture.branchMode = 'error' })
  await page.getByRole('menuitem', { name: '刷新分支信息', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '隔离 Git 读取失败' }).waitFor()
  await page.evaluate(() => { fixture.branchMode = 'ok' })
  await page.getByRole('menuitem', { name: '重试读取分支', exact: true }).click()
  await page.getByRole('alert').waitFor({ state: 'hidden' })
  await page.getByText('3 个未提交文件', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(evidence, 'header-project-git-light.png'), animations: 'disabled' })
  report.captures.push('header-project-git-light.png')
  report.checks.push('Context failure is visible and in-menu retry recovers without losing project or task')
  await page.keyboard.press('Escape')
  const calls = await page.evaluate(() => fixture.branchCalls)
  await page.evaluate(() => fixture.controller.open('personal'))
  await page.getByRole('heading', { name: '个人工作区任务', exact: true }).waitFor()
  await context.click()
  await page.getByText('个人工作区', { exact: true }).waitFor()
  assert.equal(await page.getByRole('menuitem', { name: '刷新分支信息', exact: true }).count(), 0)
  assert.equal(await page.locator('.mira-context-menu .mira-context-branch').count(), 0)
  assert.equal(await page.evaluate(() => fixture.branchCalls), calls)
  report.checks.push('Personal working directory queries and shows no invented Git branch')
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) { report.failure = error.stack; throw error }
finally {
  report.completedAt = new Date().toISOString()
  await writeFile(resolve(evidence, 'header-browser-results.json'), JSON.stringify(report, null, 2))
  await browser?.close()
  await new Promise(done => server.close(done))
}
console.log(JSON.stringify(report, null, 2))
