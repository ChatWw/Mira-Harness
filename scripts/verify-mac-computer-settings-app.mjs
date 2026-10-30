// Complete Vue shell -> React workbench -> authorized Electron IPC -> persisted native configuration.
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

if (process.platform !== 'darwin') throw new Error('This acceptance script targets the macOS desktop.')
const require = createRequire(import.meta.url)
const { _electron } = require(process.env.MIRA_PLAYWRIGHT_PATH || 'playwright')
const root = process.cwd(), home = await mkdtemp(join(tmpdir(), 'mira-mac-settings-app-'))
const output = resolve(process.env.MIRA_SETTINGS_EVIDENCE_DIR || 'docs/evidence/computer-use/macos')
await mkdir(output, { recursive: true })
const configPath = join(home, '.mira/config/computer-use.json')
const report = { boundary: 'Real built Electron application with an isolated profile; real Vue/React/MessageChannel/granted IPC/native helper; persisted cursor setting across app restart. No permission changes, external model requests or installer acceptance.', checks: [], errors: [], hoverColors: [] }
let app
async function launch() {
  app = await _electron.launch({ executablePath: require('electron'), args: [root], cwd: root, env: { ...process.env, MIRA_TEST_HOME: home, ELECTRON_RENDERER_URL: '', ELECTRON_RUN_AS_NODE: '' } })
  const page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.errors.push(error.message))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960))
  await page.waitForFunction(() => Boolean(window.platform))
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(frame => frame.src.includes('/apps/micro-mira-harness/')))
  const frame = page.frames().find(value => value.url().includes('/apps/micro-mira-harness/')) || await page.waitForEvent('framenavigated', { predicate: value => value.url().includes('/apps/micro-mira-harness/') })
  assert.ok(frame, 'React workbench frame')
  const market = frame.getByRole('button', { name: '插件市场', exact: true })
  await market.click()
  await frame.locator('[data-market-entry="plugin-strip:computer-use@mira-builtin"]').click()
  await frame.getByRole('heading', { name: '电脑控制', exact: true }).waitFor()
  await frame.getByRole('region', { name: 'macOS 电脑控制设置', exact: true }).waitFor()
  const toggle = frame.getByRole('switch', { name: '在屏幕上显示 Mira 光标', exact: true })
  await toggle.waitFor({ state: 'visible' })
  await frame.getByRole('button', { name: '重新检测', exact: true }).waitFor()
  return { page, frame, toggle }
}
try {
  let view = await launch()
  assert.equal(await view.toggle.getAttribute('aria-checked'), 'true')
  const state = await view.frame.locator('.mira-computer-settings').innerText()
  assert.ok(state.includes('屏幕录制权限') && state.includes('辅助功能权限'))
  report.checks.push('Builtin computer-use detail exposes actual native component and permission status through the complete desktop bridge')
  for (const theme of ['light', 'dark']) {
    if (await view.page.evaluate(() => document.documentElement.dataset.theme) !== theme) { await view.toggle.focus(); await view.page.keyboard.press('Meta+Shift+L') }
    await view.page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
    await view.frame.waitForFunction(theme => document.documentElement.classList.contains('dark') === (theme === 'dark'), theme)
    await view.page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running'))
    await view.frame.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running'))
    await view.page.mouse.move(0, 0)
    const beforeHover = await view.toggle.evaluate(element => getComputedStyle(element).backgroundColor)
    await view.toggle.hover()
    await view.frame.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running'))
    const colors = await view.toggle.evaluate(element => { const track = getComputedStyle(element).backgroundColor; element.style.backgroundColor = 'var(--mira-primary)'; const primary = getComputedStyle(element).backgroundColor; element.style.backgroundColor = ''; return { track, primary } })
    assert.equal(colors.track, colors.primary)
    assert.equal(colors.track, beforeHover)
    assert.equal(await view.toggle.evaluate(element => element.matches(':hover')), true)
    report.hoverColors.push({ theme, beforeHover, duringHover: colors.track, primary: colors.primary })
    const name = 'app-' + theme + '.png'
    await view.page.screenshot({ path: join(output, name) })
  }
  await view.toggle.click()
  await view.toggle.waitFor({ state: 'visible' })
  await view.frame.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'false')
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).showCursor, false)
  report.checks.push('Actual UI switch persists to the isolated Mira config; checked switch remains visible under hover in both themes')
  await app.close(); app = undefined
  view = await launch()
  assert.equal(await view.toggle.getAttribute('aria-checked'), 'false')
  await view.toggle.click()
  await view.frame.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true')
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).showCursor, true)
  report.checks.push('Saved cursor preference survives a full Electron restart and can be enabled again through the actual plugin page')
  assert.deepEqual(report.errors, [])
  await writeFile(join(output, 'app-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally { await app?.close(); await rm(home, { recursive: true, force: true }) }
