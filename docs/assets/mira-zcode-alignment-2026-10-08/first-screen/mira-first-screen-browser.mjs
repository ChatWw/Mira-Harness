import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, '../../../..')
const home = await mkdtemp(resolve(tmpdir(), 'mira-first-screen-browser-'))
const project = resolve(home, 'project')
await mkdir(project)
await writeFile(resolve(project, 'README.md'), '# Mira isolated first-screen fixture\n')
const loadModule = async path => {
  const result = await build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
}
const { handleFirstPartyRequest } = await loadModule('src/platform/firstPartyBridge.ts')
const { SkillMarketplaceService } = await loadModule('electron/services/skillMarketplace.ts')
const { SkillStore } = await loadModule('electron/storage/skillStore.ts')
const { MiraPaths } = await loadModule('electron/storage/miraPaths.ts')
const { DEFAULT_PERMISSION_CONFIG } = await loadModule('src/config/harness.ts')
const { validateCronExpression } = await loadModule('electron/services/cronSchedule.ts')
const paths = new MiraPaths(home).ensure(), skills = new SkillStore(paths)
const proxyUrl = process.env.MIRA_MARKET_PROXY
const { fetch: proxyFetch, ProxyAgent } = proxyUrl ? await import('undici') : {}
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined
const market = new SkillMarketplaceService(paths, skills, proxyAgent ? (url, options) => proxyFetch(url, { ...options, dispatcher: proxyAgent }) : fetch)
const now = Date.now()
const messages = [
  { id: 'question-1', role: 'user', content: '查看项目说明，整理下一步的任务。', attachments: [{ path: resolve(project, 'README.md'), name: 'README.md', content: '# Mira isolated fixture' }], createdAt: now - 10000 },
  { id: 'answer-1', role: 'assistant', content: '已读取项目说明。先确认任务范围，再检查执行结果。', createdAt: now - 9000, run: { status: 'completed', startedAt: now - 10000, completedAt: now - 9000, durationMs: 1000, activities: [{ id: 'read-1', kind: 'tool', label: '读取项目说明', status: 'completed' }] } },
  { id: 'question-2', role: 'user', content: '保持任务历史，补齐侧栏和输入交互。', createdAt: now - 8000 },
  { id: 'answer-2', role: 'assistant', content: '侧栏、对话区与输入框会一同验证。\n\n- 保留任务上下文\n- 明确操作结果\n- 记录剩余问题', createdAt: now - 7000, run: { status: 'stopped', startedAt: now - 8000, completedAt: now - 7000, durationMs: 1000, activities: [{ id: 'inspect-2', kind: 'tool', label: '检查项目', status: 'completed' }] } },
]
const session = (id, title, archived = false) => ({ version: 1, id, title, projectId: 'project', workingDirectory: project, messages: id === 'active' ? messages : [], toolCalls: [{ id: 'tool-read', tool: 'read', target: 'README.md', status: 'ok', createdAt: now - 9500 }], permissionMode: 'default', createdAt: now - 12000, updatedAt: now - 6000, status: 'active', ...(archived ? { archivedAt: now - 5000 } : {}) })
const sessions = [session('active', '补齐 Harness 首屏交互'), session('secondary', '整理项目资料'), session('archived', '已归档的研究任务', true)]
const automationTasks = [], automationRuns = []
const projects = [{ id: 'project', name: 'Mira 首屏验收', directory: project, directoryExists: true, createdAt: now, updatedAt: now, sessionCount: 3 }]
const preferences = new Map([['first-party.mira-harness.active-session', 'active']])
const requests = [], checks = [], errors = [], captures = []
const report = { startedAt: new Date().toISOString(), home, boundary: 'Exact built production React app in an isolated opaque headless-Chrome iframe, real MessageChannel and bridge/parser; explicit session/permissions/automation fixtures. Market uses actual public source and isolated real SkillStore. Not Electron grants/preload/IPC, native mouse/keyboard, scheduler/model execution, ZCode same-state comparison or performance acceptance.', passed: false, checks, requests, errors, captures }
report.publicSourceTransport = proxyUrl ? `explicit fixture proxy ${new URL(proxyUrl).hostname}:${new URL(proxyUrl).port}` : 'Node direct fetch; production uses Electron net.fetch and system proxy settings'
report.artifacts = []
for (const path of ['dist/harness-react-app/app.js', 'dist/harness-react-app/app.css', 'dist/harness-react-app/mira-code-highlight.worker.js']) report.artifacts.push({ path, sha256: createHash('sha256').update(await readFile(resolve(root, path))).digest('hex') })
let readFailure = false
async function invoke(_grant, method, params = {}) {
  const current = sessions.find(item => item.id === (params.id || params.sessionId))
  switch (method) {
    case 'sessions.list': return sessions.filter(item => !item.archivedAt)
    case 'projects.list': return projects
    case 'projects.rename': projects.find(item => item.id === params.id).name = params.name; return
    case 'projects.open': return ''
    case 'sessions.search': return sessions.filter(item => !item.archivedAt).flatMap(item => { const message = item.messages.find(message => !message.internal && message.content.includes(params.query)); return message ? [{ id: item.id, title: item.title, messageId: message.id, snippet: message.content, updatedAt: item.updatedAt }] : [] })
    case 'session.create': { const next = session(`created-${sessions.length}`, '新任务'); sessions.push(next); return next }
    case 'providers.list': return [{ id: 'fixture-provider', providerKey: 'custom', name: '隔离验证模型', endpoint: 'https://fixture.invalid', enabled: true, hasApiKey: false, authMode: 'none', models: [{ id: 'fixture-model', enabled: true, reasoning: true, contextWindow: 128000 }], createdAt: now, updatedAt: now }]
    case 'session.get': assert.ok(current); return current
    case 'session.set-unread': current.unread = params.unread; return
    case 'composer.preferences': return { sendShortcut: 'mod-enter', showContextUsage: true }
    case 'permissions.pending': return []
    case 'skills.list': return [...skills.list(), { id: 'fixture-skill', name: '资料整理', description: '隔离候选', enabled: true, valid: true }]
    case 'mcp.list': return [{ id: 'fixture-mcp', name: '资料工具', enabled: true }]
    case 'session.set-skills': current.activeSkillIds = params.skillIds; return
    case 'session.set-mcp-servers': current.activeMcpServerIds = params.serverIds; return
    case 'editors.list': return []
    case 'sessions.history': {
      if (readFailure) { readFailure = false; throw new Error('隔离归档读取失败，请重试') }
      const rows = sessions.filter(item => Boolean(item.archivedAt) === (params.query.archiveView === 'archived'))
      return { rows, total: rows.length, page: params.query.page, pageSize: params.query.pageSize, stats: {}, facets: { projects: [], models: [] } }
    }
    case 'session.restore': delete current.archivedAt; return
    case 'session.archive': current.archivedAt = Date.now(); return
    case 'session.delete': sessions.splice(sessions.indexOf(current), 1); return
    case 'files.search': return { entries: params.query && !'README.md'.toLowerCase().includes(params.query.toLowerCase()) ? [] : [{ name: 'README.md', path: 'README.md', type: 'file' }], truncated: false }
    case 'files.list': return { path: params.path, entries: [{ name: 'README.md', path: 'README.md', type: 'file' }] }
    case 'files.watch': return { watchId: 'fixture-watch' }
    case 'files.unwatch': return
    case 'marketplace.browse': return market.browse(params.refresh)
    case 'marketplace.detail': return market.detail(params.id)
    case 'marketplace.install': return market.install(params.id)
    case 'marketplace.installed': return market.installed()
    case 'permissions.config': return DEFAULT_PERMISSION_CONFIG
    case 'automations.list': return automationTasks
    case 'automations.overview': return { enabledCount: automationTasks.filter(task => task.enabled).length, failedLastDayCount: 0, runningCount: 0 }
    case 'automations.next-runs': return validateCronExpression(params.expression)
    case 'automations.save': { const saved = { ...params.input, id: params.input.id || `automation-${automationTasks.length}`, createdAt: now, updatedAt: Date.now() }; const previous = automationTasks.findIndex(task => task.id === saved.id); if (previous < 0) automationTasks.push(saved); else automationTasks[previous] = saved; return saved }
    case 'automations.runs': return automationRuns.filter(run => run.taskId === params.id && (!params.status || run.status === params.status))
    case 'automations.set-enabled': { const task = automationTasks.find(task => task.id === params.id); task.enabled = params.enabled; return task }
    default: throw new Error(`Explicit fixture does not implement ${method}`)
  }
}
const bridge = { manifest: { appId: 'mira-harness', enabled: true, capabilities: ['harness:workbench'] }, grantId: 'isolated-first-screen-fixture', context: { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'fixture', name: 'Mira' } }, route: '/workspace/harness-react', navigate: path => { checks.push({ name: 'navigation-request', path }) }, api: { invokeFirstPartyHarness: invoke, getSnapshot: async () => ({ preferences: Object.fromEntries(preferences) }), savePreference: async (key, value) => { preferences.set(key, value) } } }
const parent = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style></head><body><iframe id="app" sandbox="allow-scripts allow-forms allow-downloads" src="/app/index.html"></iframe><script>document.getElementById('app').addEventListener('load',()=>{const c=new MessageChannel();window.port=c.port1;c.port1.onmessage=async e=>{if(e.data.type!=='mira:request')return;try{const r=await fetch('/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(e.data)});c.port1.postMessage({type:'mira:response',id:e.data.id,...await r.json()})}catch(error){c.port1.postMessage({type:'mira:response',id:e.data.id,ok:false,error:{message:error.message}})}};document.getElementById('app').contentWindow.postMessage({type:'mira:connect',apiVersion:{major:1}},'*',[c.port2]);window.theme=theme=>c.port1.postMessage({type:'mira:context',context:{theme}})})</script></body></html>`
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  try {
    if (request.url === '/invoke') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk)
      const call = JSON.parse(Buffer.concat(chunks)); requests.push(call)
      response.setHeader('Content-Type', 'application/json')
      try { response.end(JSON.stringify({ ok: true, value: await handleFirstPartyRequest(bridge, call) })) }
      catch (error) { response.end(JSON.stringify({ ok: false, error: { message: error.message } })) }
      return
    }
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(parent); return }
    const relative = decodeURIComponent(new URL(request.url, 'http://fixture.invalid').pathname).replace(/^\/app\//, '')
    const file = resolve(root, 'dist/harness-react-app', relative)
    assert.ok(file.startsWith(resolve(root, 'dist/harness-react-app') + '/'))
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream')
    response.end(await readFile(file))
  } catch (error) { response.writeHead(500); response.end(error.message) }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
let browser
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } }) })
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const frame = page.frameLocator('#app')
  const capture = async name => { await page.waitForTimeout(200); await page.screenshot({ path: resolve(evidence, `${name}.png`), animations: 'disabled' }); captures.push({ name, width: page.viewportSize().width, theme: await frame.locator('html').evaluate(html => html.classList.contains('dark') ? 'dark' : 'light') }) }
  await frame.getByRole('heading', { name: '补齐 Harness 首屏交互' }).waitFor()
  await frame.getByRole('navigation', { name: '对话轮次' }).getByRole('button', { name: '跳转到第 1 轮' }).hover()
  await frame.getByRole('tooltip').filter({ hasText: '查看项目说明' }).waitFor()
  await capture('thread-light-1440')
  assert.equal(await frame.locator('.mira-message-attachments').count(), 1)
  checks.push({ name: 'thread-and-real-turn-preview', attachments: await frame.locator('.mira-message-attachments').count() })

  const textarea = frame.getByRole('textbox', { name: '任务内容' })
  await textarea.fill('已有草稿 后续正文')
  await textarea.evaluate(element => element.setSelectionRange(5, 5))
  const add = frame.getByRole('button', { name: '添加上下文', exact: true })
  await add.focus(); await add.press('Enter')
  await frame.locator('#mira-composer-suggestions').waitFor()
  await capture('composer-context-light')
  await frame.locator('.mira-composer-suggestions__footer').getByRole('button', { name: '/ 命令' }).click()
  await assert.equal(await textarea.inputValue(), '已有草稿 /后续正文')
  await textarea.press('Escape')
  await add.click(); await frame.locator('#mira-composer-suggestions').waitFor(); await add.click()
  await frame.locator('#mira-composer-suggestions').waitFor({ state: 'hidden' })
  checks.push({ name: 'keyboard-add-preserves-caret-and-mouse-toggle-closes' })

  await textarea.fill('请使用 @')
  await textarea.press('ArrowLeft'); await textarea.press('ArrowRight')
  await frame.locator('#mira-composer-suggestions').waitFor()
  await frame.getByRole('option').filter({ hasText: 'README.md' }).first().click()
  await frame.locator('.harness-composer__attachment').filter({ hasText: 'README.md' }).waitFor()
  assert.equal(await textarea.inputValue(), '请使用 ')
  checks.push({ name: 'caret-file-reference-real-candidate' })

  readFailure = true
  await frame.getByRole('button', { name: '查看已归档任务', exact: true }).click()
  await frame.getByRole('alert').filter({ hasText: '隔离归档读取失败' }).waitFor()
  await frame.getByRole('button', { name: '重试', exact: true }).click()
  await frame.getByRole('button', { name: '恢复 已归档的研究任务', exact: true }).waitFor()
  await capture('sidebar-archive-light')
  await frame.getByRole('button', { name: '恢复 已归档的研究任务', exact: true }).click()
  await frame.getByText('没有已归档任务', { exact: true }).waitFor()
  assert.equal(sessions.find(item => item.id === 'archived').archivedAt, undefined)
  await frame.getByRole('button', { name: '返回任务列表', exact: true }).click()
  await frame.getByRole('button', { name: '已归档的研究任务', exact: true }).waitFor()
  checks.push({ name: 'archive-error-retry-restore-active-list' })

  await frame.getByRole('button', { name: '搜索会话', exact: true }).click()
  const search = frame.getByRole('combobox', { name: '搜索命令、对话和文件' })
  await search.fill('保持任务历史')
  await frame.getByRole('option').filter({ hasText: '保持任务历史' }).waitFor()
  await capture('command-center-light')
  await search.press('Enter')
  await frame.getByRole('dialog', { name: '全局搜索' }).waitFor({ state: 'hidden' })
  await page.evaluate(() => window.port.postMessage({ type: 'mira:command-center-open' }))
  await search.waitFor(); await search.press('Escape')
  checks.push({ name: 'shared-sidebar-host-command-center-content-result' })

  await frame.getByRole('button', { name: '分组', exact: true }).click()
  await frame.getByRole('button', { name: '新建分组', exact: true }).click()
  const groupName = frame.getByRole('textbox', { name: '重命名分组', exact: true })
  await groupName.fill('首屏研究'); await groupName.press('Enter')
  await frame.getByRole('button', { name: '首屏研究', exact: true }).hover()
  await frame.getByRole('button', { name: '首屏研究 的菜单' }).click()
  await frame.getByRole('menuitem', { name: '更改颜色', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await frame.getByRole('button', { name: '首屏研究 的颜色' }).click()
  await frame.getByRole('menuitemradio', { name: '蓝色', exact: true }).click()
  await frame.getByRole('button', { name: '整理项目资料', exact: true }).hover()
  await frame.getByRole('button', { name: '整理项目资料 的操作', exact: true }).click()
  await frame.getByRole('menuitem', { name: '移动到分组', exact: true }).hover()
  await frame.getByRole('menuitem', { name: '首屏研究', exact: true }).click()
  await frame.locator('[data-collection-id]').filter({ has: frame.getByRole('button', { name: '首屏研究', exact: true }) }).getByRole('button', { name: '整理项目资料', exact: true }).waitFor()
  await capture('sidebar-groups-light')
  await frame.getByRole('button', { name: '首屏研究', exact: true }).hover()
  await frame.getByRole('button', { name: '首屏研究 的菜单' }).click()
  await frame.getByRole('menuitem', { name: '解散「首屏研究」', exact: true }).click()
  await frame.getByRole('group', { name: '未分组任务', exact: true }).getByRole('button', { name: '整理项目资料', exact: true }).waitFor()
  assert.equal(sessions.length, 3)
  checks.push({ name: 'custom-group-name-color-dissolve-retains-sessions' })
  await frame.getByRole('button', { name: '项目', exact: true }).click()

  await frame.getByRole('button', { name: '自动化', exact: true }).click()
  await frame.getByRole('button', { name: '新建自动化' }).waitFor()
  await capture('automations-light')
  await frame.getByRole('button', { name: '新建自动化' }).click()
  await frame.getByRole('textbox', { name: '任务名称' }).fill('隔离自动化草稿')
  await frame.getByRole('textbox', { name: '任务指令' }).fill('只读整理任务资料，不执行外部操作。')
  await frame.getByRole('checkbox', { name: '保存后启用自动化' }).uncheck()
  await capture('automation-editor-light')
  await frame.getByRole('button', { name: '保存自动化' }).click()
  await frame.getByRole('button', { name: '查看自动化 隔离自动化草稿' }).waitFor()
  assert.equal(automationTasks.length, 1); assert.equal(automationTasks[0].enabled, false); assert.equal(automationTasks[0].permissionMode, 'default')
  await page.evaluate(() => window.theme('dark'))
  await frame.locator('html.dark').waitFor(); await capture('automations-dark')
  await page.evaluate(() => window.theme('light')); await frame.locator('html:not(.dark)').waitFor()
  checks.push({ name: 'react-automation-save-validated-contract-fixture', boundary: 'Records UI save via real bridge/parser; scheduler/model execution is not invoked in this browser fixture.' })

  await frame.getByRole('button', { name: '插件市场', exact: true }).click()
  await frame.getByRole('heading', { name: '插件市场', exact: true }).waitFor()
  await frame.getByRole('searchbox', { name: '搜索插件' }).fill('brand-guidelines')
  await frame.getByRole('button', { name: /brand-guidelines/ }).first().waitFor({ timeout: 60000 })
  await capture('market-light')
  await frame.getByRole('button', { name: /brand-guidelines/ }).first().click()
  await frame.getByRole('button', { name: '安装', exact: true }).click()
  await frame.getByText('已启用', { exact: true }).first().waitFor({ timeout: 60000 })
  assert.ok(skills.list().some(skill => skill.enabled && skill.valid && skill.name.includes('brand')))
  checks.push({ name: 'real-public-market-isolated-install', source: 'anthropics/skills', home })
  await capture('market-installed-light')
  await page.evaluate(() => window.theme('dark'))
  await frame.locator('html.dark').waitFor(); await capture('market-installed-dark')
  await page.evaluate(() => window.theme('light')); await frame.locator('html:not(.dark)').waitFor()
  await frame.getByRole('button', { name: '返回对话', exact: true }).click()
  assert.equal(await textarea.inputValue(), '请使用 ')
  await textarea.fill('请使用 $')
  await frame.getByRole('option').filter({ hasText: 'brand-guidelines' }).first().click()
  assert.ok(sessions.find(item => item.id === 'active').activeSkillIds.length)
  checks.push({ name: 'installed-public-skill-available-to-composer' })
  await textarea.fill('继续整理任务资料')
  await page.evaluate(() => window.theme('dark'))
  await frame.locator('html.dark').waitFor(); await capture('thread-dark-1440')
  await page.setViewportSize({ width: 1024, height: 680 })
  const closeSidebar = frame.getByRole('button', { name: '关闭会话', exact: true })
  await closeSidebar.waitFor(); await closeSidebar.click()
  await frame.locator('#pilot-sessions').waitFor({ state: 'hidden' })
  await capture('thread-dark-1024')
  assert.equal(errors.length, 0)
  report.passed = true
} catch (error) { report.error = error.stack; if (browser) { try { const pages = browser.contexts().flatMap(context => context.pages()); await pages[0]?.screenshot({ path: resolve(evidence, 'failure.png') }) } catch {} }; throw error }
finally { report.finishedAt = new Date().toISOString(); await browser?.close(); await proxyAgent?.close(); await new Promise(done => server.close(done)); await writeFile(resolve(evidence, 'results.json'), JSON.stringify(report, null, 2)); if (!report.passed) await writeFile(resolve(evidence, `failure-${report.finishedAt.replaceAll(':', '-')}.json`), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: checks.length, captures: captures.length, error: report.error, home })) }
