// Render the real market component with a fixture host; this is not Electron/IPC proof.
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.MIRA_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.MIRA_PLAYWRIGHT_MODULE).href : 'playwright')
const temporary = await mkdtemp(resolve(tmpdir(), 'mira-market-render-'))
const output = resolve('docs/assets/mira-plugin-market')
await mkdir(output, { recursive: true })
const catalog = JSON.parse(await readFile('resources/plugins/marketplace.json', 'utf8'))
const items = catalog.plugins.map(item => ({ ...item, id: `${item.name}@mira-builtin`, marketplace: 'mira-builtin', sourceName: 'Mira 内置插件', repositoryUrl: '', commit: item.version, skills: [{ name: item.name, description: item.description }], unsupported: [], installed: true, enabled: true }))
const source = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { SkillMarketView } from './apps/harness-react/src/components/extensions/SkillMarketView'
const items = ${JSON.stringify(items)}
let sources = []
const inventory = () => items.filter(item => item.installed).map(item => ({ ...item, conflicts: [] }))
const host = {
  supportsPluginMarket: true,
  browseSkillMarket: async () => { throw Error('Legacy network must not be used') },
  listInstalledMarketSkills: async () => [],
  browsePluginMarket: async () => ({ sourceName: '公共插件', items: [...items] }),
  getPluginMarketDetail: async id => ({ ...items.find(item => item.id === id), files: [], totalBytes: 0, licenses: [] }),
  installMarketPlugin: async id => { const item = items.find(item => item.id === id); item.installed = true; return item },
  listPlugins: async () => inventory(), importLocalPlugin: async () => null,
  setPluginEnabled: async (id, enabled) => { items.find(item => item.id === id).enabled = enabled; return inventory() },
  removePlugin: async id => { items.find(item => item.id === id).installed = false; return inventory() },
  listPluginMarketplaces: async () => sources,
  addPluginMarketplace: async source => { sources = [{ id: 'local-test', name: '本地测试市场', source }]; return sources },
  removePluginMarketplace: async id => { sources = sources.filter(item => item.id !== id); return sources },
}
window.trials = []
createRoot(document.getElementById('root')).render(<SkillMarketView host={host} onManageSkills={() => {}} onTryPlugin={async (id, prompt) => { window.trials.push({ id, prompt }) }} />)
`
const bundled = await build({ stdin: { contents: source, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false, outdir: output })
const js = bundled.outputFiles.find(file => file.path.endsWith('.js')).contents
execFileSync(process.execPath, ['node_modules/@tailwindcss/cli/dist/index.mjs', '-i', 'apps/harness-react/src/styles/app.css', '-o', resolve(temporary, 'fixture.css'), '--minify'], { windowsHide: true, stdio: 'pipe' })
const css = await readFile(resolve(temporary, 'fixture.css'))
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js) }
  else if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css) }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{height:100%;margin:0}body{font-family:Arial,"Microsoft YaHei",sans-serif}#root{display:flex}</style></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>') }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const browser = await chromium.launch({ ...(process.env.MIRA_CHROME_PATH ? { executablePath: process.env.MIRA_CHROME_PATH } : {}), headless: true })
const report = { boundary: 'Real React market component and application CSS with a fixture host; no native Electron, IPC, external package runtime or actual computer/browser actions.', errors: [], geometry: {}, checks: [] }
try {
  const page = await browser.newPage({ viewport: { width: 928, height: 900 } })
  page.on('pageerror', error => report.errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.getByRole('heading', { name: '办公文档', exact: true }).waitFor()
  await page.screenshot({ path: resolve(output, 'market-light.png') })
  const pdfIcon = page.locator('[data-market-entry="plugin-strip:pdf@mira-builtin"]')
  if (await pdfIcon.getAttribute('title')) throw Error('Installed icon still uses a native title')
  await pdfIcon.hover()
  await page.getByRole('tooltip', { name: 'PDF', exact: true }).waitFor()
  if (await page.getByRole('tooltip', { name: 'PDF', exact: true }).getAttribute('data-side') !== 'top') throw Error('Icon tooltip must appear above')
  await page.screenshot({ path: resolve(output, 'market-icon-tooltip.png') })
  const sourcesButton = page.getByRole('button', { name: '市场来源设置', exact: true })
  await sourcesButton.hover()
  const sourceHint = page.getByRole('tooltip', { name: '市场源', exact: true })
  await sourceHint.waitFor()
  if (await sourceHint.getAttribute('data-side') !== 'top' || !await sourcesButton.locator('svg.lucide-settings').count()) throw Error('Source icon or tooltip mismatch')
  await page.screenshot({ path: resolve(output, 'market-source-tooltip.png') })
  await page.mouse.move(0, 0)
  report.geometry = await page.evaluate(() => {
    const box = selector => { const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect(); return { x, y, width, height } }
    return { header: box('.mira-market-header'), search: box('.mira-market-search'), card: box('.mira-market-item'), avatar: box('.mira-market-item .mira-market-avatar'), overflow: document.documentElement.scrollWidth > innerWidth }
  })
  if (report.geometry.avatar.width !== 40 || report.geometry.overflow) throw Error('Market geometry mismatch')
  const scrolling = await page.evaluate(() => {
    const market = document.querySelector('.mira-market')
    const scroll = document.querySelector('.mira-market-scroll')
    scroll.scrollTop = scroll.scrollHeight
    const result = { bounded: market.getBoundingClientRect().bottom <= innerHeight, pageOverflow: document.documentElement.scrollHeight > innerHeight + 1, pageHeight: document.documentElement.scrollHeight, scrollbar: getComputedStyle(scroll).scrollbarWidth, canScroll: scroll.scrollTop > 0 }
    scroll.scrollTop = 0
    return result
  })
  if (!scrolling.bounded || scrolling.pageOverflow || scrolling.scrollbar !== 'none' || !scrolling.canScroll) throw Error(`Market scroll bounds mismatch: ${JSON.stringify(scrolling)}`)
  report.geometry.scrolling = scrolling
  await page.getByRole('button', { name: '查看插件 pdf', exact: true }).click()
  await page.getByText('高级信息', { exact: true }).click()
  await page.getByRole('button', { name: '把这份资料整理成一份 PDF 报告。', exact: true }).click()
  if (!(await page.evaluate(() => window.trials.some(item => item.id === 'pdf@mira-builtin' && item.prompt)))) throw Error('Example prompt was not passed')
  await page.getByRole('button', { name: '返回插件市场', exact: true }).click()
  await page.getByRole('button', { name: '市场来源设置', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.screenshot({ path: resolve(output, 'market-sources.png') })
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('tab', { name: '本地', exact: true }).click()
  await page.getByRole('button', { name: 'PDF', exact: true }).last().click()
  await page.getByRole('button', { name: '返回插件市场', exact: true }).waitFor()
  const detailGeometry = await page.evaluate(() => {
    const hero = document.querySelector('.mira-plugin-detail-hero')
    const avatar = hero.querySelector('.mira-market-avatar').getBoundingClientRect()
    const title = hero.querySelector('h1').getBoundingClientRect()
    return { avatarWidth: avatar.width, stacked: title.top >= avatar.bottom, listHeaderAbsent: !document.querySelector('.mira-market-header'), infoPresent: Boolean(document.querySelector('.mira-plugin-detail-info')), advancedCollapsed: !document.querySelector('.mira-plugin-detail-advanced').open }
  })
  if (detailGeometry.avatarWidth !== 64 || !detailGeometry.stacked || !detailGeometry.listHeaderAbsent || !detailGeometry.infoPresent || !detailGeometry.advancedCollapsed) throw Error(`Detail layout mismatch: ${JSON.stringify(detailGeometry)}`)
  report.geometry.detail = detailGeometry
  await page.screenshot({ path: resolve(output, 'market-local-detail.png') })
  await page.getByRole('button', { name: '返回插件市场', exact: true }).click()
  await page.getByRole('tab', { name: '公共', exact: true }).click()
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(500); await page.screenshot({ path: resolve(output, 'market-dark.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: resolve(output, 'market-narrow.png') })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Narrow page overflow ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})).slice(0,12))))
  report.checks = ['40px avatars and no horizontal overflow', 'Viewport-bounded content, hidden scrollbar and working scrolling', 'Public/local navigation', 'Example prompt forwards plugin and text without sending', 'Source management dialog', 'Local plugin detail', 'Light/dark/narrow rendering']
  if (report.errors.length) throw Error(report.errors.join('\n'))
} finally {
  await writeFile(resolve(output, 'verification.json'), JSON.stringify(report, null, 2))
  await browser.close(); await new Promise(done => server.close(done)); await rm(temporary, { recursive: true, force: true })
}
console.log(JSON.stringify(report, null, 2))






