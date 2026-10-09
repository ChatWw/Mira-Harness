import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const evidence = dirname(fileURLToPath(import.meta.url)), root = resolve(evidence, '../../../..')
await mkdir(evidence, { recursive: true })
const source = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { HarnessWorkbench } from './apps/harness-react/src/components/workbench/HarnessWorkbench'
import { PilotController } from './apps/harness-react/src/state/pilot-state'
import { applyHostTheme } from './apps/harness-react/src/platform/theme'
import { DEFAULT_PERMISSION_CONFIG } from './src/config/harness'
const now = Date.now()
const messages = [{ id: 'question', role: 'user', content: '保持项目 A 的任务，浏览其他项目时不要切换对话。', createdAt: now }, { id: 'answer', role: 'assistant', content: '项目文件树应独立于当前任务。', createdAt: now + 1 }]
const session = { version: 1, id: 'active-a', title: '项目 A 当前任务', projectId: 'project-a', workingDirectory: '/mira/isolated/project-a', messages, toolCalls: [], permissionMode: 'default', status: 'active', createdAt: now, updatedAt: now }
const projects = [['project-a', '项目 A'], ['project-b', '项目 B'], ['empty-project', '空项目']].map(([id, name]) => ({ id, name, directory: '/mira/isolated/' + id, directoryExists: true, isGitRepository: id !== 'empty-project', sessionCount: id === 'project-a' ? 1 : 0, createdAt: now, updatedAt: now }))
const fixture = window.fixture = { calls: [], controller: null, theme: theme => applyHostTheme(document.getElementById('root'), { theme }) }
const call = (method, args, value) => { fixture.calls.push({ method, args }); return value }
const reject = (method, args) => { fixture.calls.push({ method, args }); throw new Error('Unexpected session fixture call: ' + method) }
const rows = path => path === '' ? [{ name: 'docs', path: 'docs', type: 'directory' }, { name: 'README.md', path: 'README.md', type: 'file' }] : [{ name: 'notes.md', path: 'docs/notes.md', type: 'file' }]
const host = {
  listSessions: async () => [session], listProjects: async () => projects,
  listProviders: async () => [{ id: 'provider', providerKey: 'custom', name: '隔离验证模型', endpoint: 'https://fixture.invalid', enabled: true, hasApiKey: false, authMode: 'none', models: [{ id: 'fixture-model', enabled: true }], createdAt: now, updatedAt: now }],
  getSession: async id => call('getSession', [id], session), createSession: async projectId => reject('createSession', [projectId]),
  listPendingPermissions: async () => [], onEvent: () => () => {}, onBrowserEvent: () => () => {},
  getPreference: async key => key === 'active-session' ? 'active-a' : JSON.parse(localStorage.getItem(key) || 'null'),
  setPreference: async (key, value) => { localStorage.setItem(key, JSON.stringify(value)) },
  getComposerPreferences: async () => ({ sendShortcut: 'mod-enter', showContextUsage: true }),
  listSkills: async () => [], listMcp: async () => [], listEditors: async () => [],
  listProjectFiles: async (id, path) => call('listProjectFiles', [id, path], { path, entries: id === 'empty-project' ? [] : rows(path) }),
  searchProjectFiles: async (id, query, refresh) => call('searchProjectFiles', [id, query, refresh], { entries: id === 'empty-project' ? [] : [{ name: 'notes.md', path: 'docs/notes.md', type: 'file' }], truncated: false }),
  getProjectWorkspaceGit: async id => call('getProjectWorkspaceGit', [id], { available: id !== 'empty-project', entries: id === 'empty-project' ? [] : [{ path: 'docs/notes.md', status: 'modified' }] }),
  getProjectWorkspaceIgnored: async (id, paths) => call('getProjectWorkspaceIgnored', [id, paths], paths.includes('README.md') ? ['README.md'] : []),
  listFiles: async (...args) => reject('listFiles', args), searchFiles: async (...args) => reject('searchFiles', args),
  getWorkspaceGit: async (...args) => reject('getWorkspaceGit', args), getWorkspaceIgnored: async (...args) => reject('getWorkspaceIgnored', args),
  watchFiles: async (...args) => reject('watchFiles', args), unwatchFiles: async (...args) => reject('unwatchFiles', args),
  openProject: async id => call('openProject', [id], ''),
  listAutomationTasks: async () => [], getAutomationOverview: async () => ({ enabledCount: 0, runningCount: 0, failedLastDayCount: 0 }), getHarnessPermissionConfig: async () => DEFAULT_PERMISSION_CONFIG,
}
localStorage.setItem('session-drawer', JSON.stringify({ view: 'project', projectView: 'collections', expandedProjectIds: projects.map(project => project.id), collapsedProjectIds: [], groups: [] }))
const controller = fixture.controller = new PilotController(host)
fixture.theme('light')
createRoot(document.getElementById('root')).render(<HarnessWorkbench controller={controller} />)
void controller.start()
`
const built = await build({ stdin: { contents: source, loader: 'tsx', resolveDir: root, sourcefile: 'mira-project-sidebar-isolated-fixture.tsx' }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false, outdir: resolve(evidence, 'fixture-bundle'), minify: true, define: { MIRA_HIGHLIGHT_WORKER_PATH: JSON.stringify('./mira-code-highlight.worker.js') } })
const script = built.outputFiles.find(file => file.path.endsWith('.js')).contents
execFileSync(resolve(root, 'node_modules/.bin/tailwindcss'), ['-i', resolve(root, 'apps/harness-react/src/styles/app.css'), '-o', resolve(evidence, 'fixture.css'), '--minify'], { cwd: root, stdio: 'inherit' })
const css = await readFile(resolve(evidence, 'fixture.css'))
const report = { startedAt: new Date().toISOString(), passed: false, boundary: 'Current Workbench/Drawer source bundled in an isolated esbuild test entry, real React/assistant-ui/Radix/TanStack virtual tree and current Tailwind CSS. Explicit in-browser PilotHost + localStorage fixtures only. Not production app entry, MessageChannel, preload/IPC, filesystem, native Electron, actual Git or same-state ZCode comparison. Headless desktop 1440x900, no desktop input.', checks: [], errors: [], captures: [], calls: [] }
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script) }
  else if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css) }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>') }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
let browser, page
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.address().port)
  await page.getByRole('heading', { name: '项目 A 当前任务', exact: true }).waitFor()
  const textarea = page.getByRole('textbox', { name: '任务内容', exact: true })
  const calls = () => page.evaluate(() => fixture.calls)
  const sessionState = () => page.evaluate(() => ({ id: fixture.controller.getSnapshot().session?.id, projectId: fixture.controller.getSnapshot().session?.projectId }))
  const treeRow = path => page.locator('[data-file-tree-path="' + path + '"]')
  const capture = async name => { await page.waitForTimeout(120); await page.screenshot({ path: resolve(evidence, name + '.png'), animations: 'disabled' }); report.captures.push({ path: name + '.png', width: 1440, height: 900, theme: await page.locator('html').evaluate(element => element.classList.contains('dark') ? 'dark' : 'light') }) }
  const openProject = async name => { await page.getByRole('button', { name, exact: true }).hover(); await page.getByRole('button', { name: '显示 ' + name + ' 的文件树', exact: true }).click(); await page.getByRole('textbox', { name: '搜索文件', exact: true }).waitFor() }
  const back = async () => { await page.getByRole('button', { name: '返回任务', exact: true }).click(); await page.getByRole('button', { name: '新建任务', exact: true }).waitFor() }
  assert.equal(await page.locator('.harness-thread-header .pilot-inspector__state').count(), 0)
  assert.equal(await page.locator('.harness-thread-header').getByRole('button', { name: '查看文件', exact: true }).count(), 0)
  await textarea.fill('项目 A 尚未发送的草稿')
  const baseline = (await calls()).length
  await openProject('项目 B')
  await treeRow('docs').waitFor(); await treeRow('README.md').waitFor()
  await treeRow('docs').click(); await treeRow('docs/notes.md').waitFor()
  await page.waitForFunction(() => document.querySelector('[data-file-tree-path="docs/notes.md"] [data-file-git-status="modified"]'))
  await treeRow('README.md').click({ button: 'right' })
  assert.equal(await page.getByRole('menuitem', { name: '打开', exact: true }).getAttribute('aria-disabled'), 'true')
  assert.equal(await page.getByRole('menuitem', { name: '加入对话', exact: true }).getAttribute('aria-disabled'), 'true')
  await page.keyboard.press('Escape')
  const search = page.getByRole('textbox', { name: '搜索文件', exact: true })
  await search.fill('notes'); await treeRow('docs/notes.md').waitFor()
  await page.waitForFunction(() => fixture.calls.some(call => call.method === 'searchProjectFiles' && call.args[0] === 'project-b' && call.args[1] === 'notes'))
  await search.fill(''); await treeRow('README.md').waitFor()
  await page.getByRole('button', { name: '只看变更', exact: true }).click()
  await treeRow('README.md').waitFor({ state: 'hidden' }); await treeRow('docs/notes.md').waitFor()
  await page.getByRole('button', { name: '显示全部文件', exact: true }).click()
  await treeRow('README.md').waitFor()
  const beforeRefresh = (await calls()).filter(call => call.method === 'listProjectFiles').length
  await page.getByRole('button', { name: '刷新文件', exact: true }).click()
  await page.waitForFunction(count => fixture.calls.filter(call => call.method === 'listProjectFiles').length > count, beforeRefresh)
  await treeRow('docs/notes.md').waitFor()
  assert.equal(await textarea.inputValue(), '项目 A 尚未发送的草稿')
  assert.deepEqual(await sessionState(), { id: 'active-a', projectId: 'project-a' })
  assert.equal(await page.getByRole('button', { name: '工作区', exact: true }).getAttribute('aria-expanded'), 'false')
  await capture('project-b-active-a-light')
  await page.evaluate(() => fixture.theme('dark')); await page.locator('html.dark').waitFor(); await capture('project-b-active-a-dark')
  await page.evaluate(() => fixture.theme('light'))
  await back(); assert.equal(await textarea.inputValue(), '项目 A 尚未发送的草稿')
  await openProject('空项目'); await page.getByText('此目录为空', { exact: true }).waitFor(); await back()
  await openProject('项目 A'); await treeRow('README.md').waitFor(); await treeRow('README.md').click({ button: 'right' })
  assert.equal(await page.getByRole('menuitem', { name: '打开', exact: true }).getAttribute('aria-disabled'), null)
  assert.equal(await page.getByRole('menuitem', { name: '加入对话', exact: true }).getAttribute('aria-disabled'), null)
  await page.keyboard.press('Escape'); await back()
  const activeCalls = (await calls()).slice(baseline)
  assert.equal(activeCalls.filter(call => ['createSession', 'getSession', 'listFiles', 'searchFiles', 'getWorkspaceGit', 'getWorkspaceIgnored', 'watchFiles'].includes(call.method)).length, 0)
  report.checks.push('Header has no status badge/file-list button; active A and its unsent draft remain during B/empty-project tree, expansion/search/Git/filter/manual-refresh/return; no session calls or right workspace opening')
  report.checks.push('Different project preview/add are disabled; same active project preview/add remain enabled, without extending project-scope read/image/editor permissions')

  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await textarea.fill('新任务尚未发送的草稿')
  const emptyBaseline = (await calls()).length
  await openProject('项目 B'); await treeRow('README.md').waitFor(); await back()
  await openProject('空项目'); await page.getByText('此目录为空', { exact: true }).waitFor(); await back()
  assert.equal(await textarea.inputValue(), '新任务尚未发送的草稿')
  assert.deepEqual(await sessionState(), { id: undefined, projectId: undefined })
  await page.getByRole('button', { name: '搜索会话', exact: true }).click()
  await page.getByRole('button', { name: '命令', exact: true }).click()
  const commandSearch = page.getByRole('combobox', { name: '搜索命令、对话和文件' })
  await commandSearch.fill('项目文件')
  await page.getByRole('option').filter({ hasText: '项目文件' }).click()
  await page.getByRole('dialog', { name: '全局搜索' }).waitFor({ state: 'hidden' })
  await page.getByText('请先在侧栏选择项目', { exact: true }).waitFor()
  assert.equal(await textarea.inputValue(), '新任务尚未发送的草稿')
  assert.deepEqual(await sessionState(), { id: undefined, projectId: undefined })
  assert.equal((await calls()).slice(emptyBaseline).filter(call => ['createSession', 'getSession', 'listFiles', 'searchFiles', 'getWorkspaceGit', 'getWorkspaceIgnored'].includes(call.method)).length, 0)
  report.checks.push('Empty chat draft browses B/empty project and file command does not prepare/create/open a task')

  await page.getByRole('button', { name: '自动化', exact: true }).click()
  await page.getByRole('button', { name: '新建自动化', exact: true }).waitFor()
  await openProject('项目 B'); await treeRow('README.md').waitFor()
  await page.getByRole('button', { name: '新建自动化', exact: true }).waitFor()
  assert.equal(await textarea.isVisible(), false)
  assert.deepEqual(await sessionState(), { id: undefined, projectId: undefined })
  await capture('project-b-automations-light')
  await page.evaluate(() => fixture.theme('dark')); await page.locator('html.dark').waitFor(); await capture('project-b-automations-dark')
  await back(); await page.getByRole('button', { name: '返回对话', exact: true }).click()
  assert.equal(await textarea.inputValue(), '新任务尚未发送的草稿')
  report.checks.push('Automation main view remains active while browsing project sidebar; return restores same unsent chat draft')
  report.calls = await calls()
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  report.failure = error.stack
  const failureIdentity = 'project-sidebar-browser-failure-' + report.startedAt.replace(/[:.]/g, '-')
  report.failureCapture = failureIdentity + '.png'
  if (page) { report.calls = await page.evaluate(() => window.fixture?.calls || []).catch(() => []); await page.screenshot({ path: resolve(evidence, report.failureCapture), animations: 'disabled' }).catch(() => undefined) }
  await writeFile(resolve(evidence, failureIdentity + '.json'), JSON.stringify(report, null, 2))
  throw error
} finally {
  report.completedAt = new Date().toISOString()
  await writeFile(resolve(evidence, 'project-sidebar-browser-results.json'), JSON.stringify(report, null, 2))
  await browser?.close(); await new Promise(done => server.close(done))
}
console.log(JSON.stringify(report, null, 2))
