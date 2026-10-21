// Run against an isolated Electron profile, never the user's regular settings.
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { _electron } = require(process.env.MIRA_PLAYWRIGHT_PATH || 'playwright')
const root = process.cwd(), home = await mkdtemp(join(tmpdir(), 'mira-settings-navigation-'))
const output = resolve(process.env.MIRA_SETTINGS_EVIDENCE_DIR || 'node_modules/.cache/mira-settings-navigation')
await mkdir(output, { recursive: true })
let app, page
const checks = [], errors = []
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS', name) }
try {
  app = await _electron.launch({ executablePath: join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [root], cwd: root, env: { ...process.env, MIRA_TEST_HOME: home, ELECTRON_RENDERER_URL: '' } })
  page = await app.firstWindow(); page.setDefaultTimeout(12000)
  page.on('pageerror', error => errors.push(error.message))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
  await page.waitForFunction(() => Boolean(window.platform))
  await page.evaluate(() => location.hash = '/settings/general')
  await page.getByRole('heading', { name: '常规', exact: true }).waitFor()
  const menu = page.locator('.settings-menu-scroll')
  const layout = async () => menu.evaluate(scroll => ({
    scroll: scroll.scrollTop, height: scroll.scrollHeight, viewport: scroll.clientHeight,
    back: document.querySelector('.back-button').getBoundingClientRect().top,
    titleY: scroll.querySelector('h2').getBoundingClientRect().top,
  }))
  const initial = await layout()
  check('four quiet groups and eighteen destinations', await menu.locator('h2').count() === 4 && await menu.locator('button').count() === 18 && await menu.locator('h3').count() === 0)
  check('all menu icons use approved sixteen pixel line artwork', await menu.locator('button svg').evaluateAll(icons => icons.length === 18 && icons.every(icon => icon.getBoundingClientRect().width === 16 && getComputedStyle(icon).strokeWidth === '1.65px')))
  check('no artificial bottom padding', await menu.locator('.settings-nav-layer').last().evaluate(el => getComputedStyle(el).paddingBottom === '0px'))
  await page.screenshot({ path: join(output, '01-four-groups-light.png') })
  await menu.evaluate(el => { el.scrollTop = el.scrollHeight })
  const scrolled = await layout()
  check('headings scroll naturally and return region stays fixed', scrolled.titleY < initial.titleY && scrolled.back === initial.back)
  const rightScroll = await page.locator('.settings-main__scroll').evaluate(el => el.scrollTop)
  await menu.hover(); await page.mouse.wheel(0, 600)
  check('sidebar scrolling does not scroll page content', await page.locator('.settings-main__scroll').evaluate(el => el.scrollTop) === rightScroll)
  await page.getByRole('button', { name: '对话设置', exact: true }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '对话设置', exact: true }).click()
  await page.getByRole('heading', { name: '对话设置', exact: true }).waitFor()
  await page.getByRole('combobox', { name: '发送快捷键', exact: true }).locator('xpath=ancestor::div[contains(@class,"el-select__wrapper")]').click()
  await page.getByRole('option', { name: /⌘.*Enter/ }).click()
  await page.waitForFunction(async () => (await window.platform.getSnapshot()).preferences.sendShortcut === 'mod-enter')
  check('migrated conversation setting persists through real host', true)
  await page.getByRole('button', { name: '文件回收站', exact: true }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '文件回收站', exact: true }).click()
  await page.getByRole('heading', { name: '文件回收站', exact: true }).waitFor()
  await page.getByRole('spinbutton', { name: '回收站保留天数', exact: true }).fill('14')
  await page.getByRole('spinbutton', { name: '回收站保留天数', exact: true }).press('Tab')
  await page.waitForFunction(async () => (await window.platform.getHarnessPermissionConfig()).trashRetentionDays === 14)
  check('migrated trash policy persists through real host', true)
  const beforeRoute = await layout()
  await page.getByRole('button', { name: '文件搜索', exact: true }).click()
  await page.getByRole('heading', { name: '文件搜索', exact: true }).waitFor()
  check('menu scroll survives page navigation', Math.abs((await layout()).scroll - beforeRoute.scroll) < 1)
  await page.evaluate(async () => { await window.platform.savePreference('themeMode', 'dark') }); await page.reload()
  await page.locator('.settings-menu-scroll').waitFor()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.getByRole('button', { name: '对话设置', exact: true }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '对话设置', exact: true }).click()
  await page.getByRole('heading', { name: '对话设置', exact: true }).waitFor()
  await page.screenshot({ path: join(output, '02-four-groups-dark.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '关于Mira', exact: true }).focus(); await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'Mira', exact: true }).waitFor()
  check('last menu reachable with keyboard in compact desktop', true)
  check('sidebar has no horizontal overflow', await page.locator('.settings-sidebar').evaluate(el => el.scrollWidth === el.clientWidth))
  await page.screenshot({ path: join(output, '03-compact-reduced-motion.png') })
  check('no renderer errors', errors.length === 0)
} catch (error) {
  await page?.screenshot({ path: join(output, 'failure.png') }); throw error
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify({ checks, errors, home, output }, null, 2))
  await app?.close()
}
