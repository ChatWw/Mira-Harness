import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMainWindow, handleWindowCommand, setupApplicationMenu } from '../electron/bootstrap/windowManager'
import { miraTrafficLightPosition } from '../electron/bootstrap/miraDesktopZoom'
import { windowApi } from '../electron/preload/windowApi'

const about = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('../electron/bootstrap/miraAbout', () => ({ showMiraAboutDialog: about }))

const electron = vi.hoisted(() => ({ menu: [] as any[], focused: undefined as any, on: vi.fn(), off: vi.fn() }))
vi.mock('electron', () => ({
  app: { isPackaged: true }, BrowserWindow: class {
    static getFocusedWindow() { return electron.focused }
    static fromWebContents() { return electron.focused }
    constructor(public options: any) {}
    on = vi.fn()
    once = vi.fn()
    maximize = vi.fn()
    show = vi.fn()
    setFullScreen = vi.fn()
    getNormalBounds = vi.fn(() => ({ x: 100, y: 100, width: 1200, height: 800 }))
    isMaximized = vi.fn(() => false)
    isFullScreen = vi.fn(() => false)
    setWindowButtonPosition = vi.fn()
    loadURL = vi.fn()
    loadFile = vi.fn()
    webContents = {
      on: vi.fn(), setWindowOpenHandler: vi.fn(), setZoomFactor: vi.fn(), send: vi.fn(),
      session: { webRequest: { onBeforeSendHeaders: vi.fn() } },
    }
  },
  Menu: { buildFromTemplate: (template: any[]) => template, setApplicationMenu: (template: any[]) => { electron.menu = template } },
  screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
  nativeImage: {}, shell: {}, Tray: class {}, webUtils: {}, webFrame: { getZoomFactor: () => 1.1 },
  ipcRenderer: { on: electron.on, removeListener: electron.off },
}))
afterEach(() => vi.restoreAllMocks())
beforeEach(() => { electron.menu = []; electron.focused = undefined; vi.clearAllMocks() })

it('reapplies the latest saved zoom after every main-page reload rather than the creation value', () => {
  let level: unknown = 1
  const window = createMainWindow({
    getCloseWindowBehavior: () => 'quit', isQuitting: () => false,
    legacyNovelApi: { baseUrl: 'http://127.0.0.1:1234/', token: 'test' },
    getDesktopZoomLevel: () => level,
  })
  expect((window as any).options.webPreferences.zoomFactor).toBeCloseTo(1.1)
  const loaded = (window.webContents.on as any).mock.calls.find(([event]: any[]) => event === 'did-finish-load')?.[1]
  expect(loaded).toBeTypeOf('function')
  level = 0
  loaded()
  expect(window.webContents.setZoomFactor).toHaveBeenLastCalledWith(1)
  expect(window.webContents.send).toHaveBeenLastCalledWith('window:zoom-changed', 1)
  level = -3
  loaded()
  expect(window.webContents.setZoomFactor).toHaveBeenLastCalledWith(1.1 ** -3)
  level = 'invalid'
  loaded()
  expect(window.webContents.setZoomFactor).toHaveBeenLastCalledWith(1)
})

it('provides bounded display zoom through native menus and the Windows command path', () => {
  setupApplicationMenu()
  const items = electron.menu.flatMap(menu => menu.submenu || [])
  const larger = items.find(item => item.id === 'mira-zoom-in'), smaller = items.find(item => item.id === 'mira-zoom-out'), reset = items.find(item => item.id === 'mira-zoom-reset')
  expect(larger).toMatchObject({ accelerator: 'CmdOrCtrl+Plus' })
  expect(items.find(item => item.id === 'mira-zoom-in-equal')).toMatchObject({ accelerator: 'CmdOrCtrl+=', visible: false })
  expect(smaller).toMatchObject({ accelerator: 'CmdOrCtrl+-' }); expect(reset).toMatchObject({ accelerator: 'CmdOrCtrl+0' })
  let factor = 1
  const owner = { isDestroyed: () => false, setWindowButtonPosition: vi.fn(), webContents: { getZoomFactor: () => factor, setZoomFactor: vi.fn((next: number) => { factor = next }), send: vi.fn() } }
  electron.focused = owner
  larger.click(larger, owner); expect(factor).toBeCloseTo(1.1)
  expect(owner.webContents.send).toHaveBeenLastCalledWith('window:zoom-changed', 1.1)
  smaller.click(smaller, owner); expect(factor).toBeCloseTo(1)
  for (let index = 0; index < 20; index++) larger.click(larger, owner)
  expect(factor).toBeCloseTo(1.1 ** 5)
  for (let index = 0; index < 20; index++) smaller.click(smaller, owner)
  expect(factor).toBeCloseTo(1.1 ** -3)
  reset.click(reset, owner); expect(factor).toBe(1)
  handleWindowCommand({ sender: {} } as any, 'zoomIn'); expect(factor).toBeCloseTo(1.1)
  handleWindowCommand({ sender: {} } as any, 'resetZoom'); expect(factor).toBe(1)
  handleWindowCommand({ sender: {} } as any, 'zoomOut'); expect(factor).toBeCloseTo(1 / 1.1)
  electron.focused = undefined
  expect(() => larger.click(larger, undefined)).not.toThrow()
  const destroyed = { ...owner, isDestroyed: () => true }; owner.webContents.setZoomFactor.mockClear()
  larger.click(larger, destroyed); expect(owner.webContents.setZoomFactor).not.toHaveBeenCalled()
})

it('reports the actual renderer zoom and removes its zoom-change listener', () => {
  expect(windowApi.getDesktopZoomFactor()).toBe(1.1)
  const listener = vi.fn(), remove = windowApi.onDesktopZoomChanged(listener)
  const [channel, callback] = electron.on.mock.lastCall!
  expect(channel).toBe('window:zoom-changed'); callback({}, 1.21); expect(listener).toHaveBeenCalledWith(1.21)
  remove(); expect(electron.off).toHaveBeenCalledExactlyOnceWith(channel, callback)
})

it('routes Cmd/Ctrl+W through the supplied window renderer, leaving close preferences to the Shell', () => {
  setupApplicationMenu()
  const item = electron.menu.flatMap(menu => menu.submenu || []).find(item => item.accelerator === 'CmdOrCtrl+W')
  expect(item).toBeDefined(); expect(item.role).toBeUndefined()
  const owner = { webContents: { send: vi.fn() }, close: vi.fn() }, focused = { webContents: { send: vi.fn() }, close: vi.fn() }
  electron.focused = focused
  item.click(item, owner)
  expect(owner.webContents.send).toHaveBeenCalledExactlyOnceWith('window:close-context')
  expect(owner.close).not.toHaveBeenCalled(); expect(focused.webContents.send).not.toHaveBeenCalled()
  item.click(item, undefined); expect(focused.webContents.send).toHaveBeenCalledExactlyOnceWith('window:close-context')
  electron.focused = undefined; expect(() => item.click(item, undefined)).not.toThrow()
})

it('exposes the native close notification only through a removable preload listener', () => {
  const listener = vi.fn(), remove = windowApi.onWindowCloseContext(listener)
  const [channel, callback] = electron.on.mock.lastCall!
  expect(channel).toBe('window:close-context'); callback(); expect(listener).toHaveBeenCalledOnce()
  remove(); expect(electron.off).toHaveBeenCalledExactlyOnceWith(channel, callback)
})


it.each([-3, 0, 2, 5])('centers native macOS traffic lights on the scaled header at zoom level %s', level => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
  const factor = 1.1 ** level
  const window = createMainWindow({
    getCloseWindowBehavior: () => 'quit', isQuitting: () => false,
    legacyNovelApi: { baseUrl: 'http://127.0.0.1:1234/', token: 'test' },
    getDesktopZoomLevel: () => level,
  })
  expect((window as any).options.trafficLightPosition).toEqual(miraTrafficLightPosition(factor))
  expect(Math.abs((window as any).options.trafficLightPosition.y + 7 - 18 * factor)).toBeLessThanOrEqual(0.5)
  const loaded = (window.webContents.on as any).mock.calls.find(([event]: any[]) => event === 'did-finish-load')[1]
  loaded()
  expect(window.setWindowButtonPosition).toHaveBeenCalledWith(miraTrafficLightPosition(factor))
})


it.each([['CmdOrCtrl+,', '/settings/general'], ['CmdOrCtrl+I', '/settings/about']])('registers global %s on startup and targets the window independently of renderer focus', (accelerator, path) => {
  setupApplicationMenu()
  const item = electron.menu.flatMap(menu => menu.submenu || []).find(item => item.accelerator === accelerator)
  expect(item).toBeDefined()
  const owner = { webContents: { send: vi.fn() } }, focused = { webContents: { send: vi.fn() } }
  electron.focused = focused
  item.click(item, owner)
  expect(owner.webContents.send).toHaveBeenCalledExactlyOnceWith('window:navigate', path)
  expect(focused.webContents.send).not.toHaveBeenCalled()
  item.click(item, undefined)
  expect(focused.webContents.send).toHaveBeenCalledExactlyOnceWith('window:navigate', path)
})


it('shares the About dialog across native menu and command while retaining the separate settings shortcut', async () => {
  setupApplicationMenu()
  const item = electron.menu.flatMap(menu => menu.submenu || []).find(item => item.label === '关于 Mira')
  expect(item.accelerator).toBeUndefined()
  const owner = { webContents: { send: vi.fn() } }
  electron.focused = owner
  item.click(item, owner)
  await handleWindowCommand({ sender: {} } as any, 'about')
  expect(about).toHaveBeenCalledTimes(2)
  expect(about).toHaveBeenLastCalledWith(owner)
  expect(owner.webContents.send).not.toHaveBeenCalled()
})

it('maximizes by default and restores saved normal bounds only when selected', () => {
  const options = { getCloseWindowBehavior: () => 'quit' as const, isQuitting: () => false, legacyNovelApi: { baseUrl: 'http://127.0.0.1/', token: 'test' } }
  const first = createMainWindow(options)
  ;(first.once as any).mock.calls.find(([event]: any[]) => event === 'ready-to-show')[1]()
  expect(first.maximize).toHaveBeenCalledOnce()
  const save = vi.fn()
  const restored = createMainWindow({ ...options, getStartupWindowBehavior: () => 'restore', getMainWindowState: () => ({ bounds: { x: 9000, y: 9000, width: 1200, height: 800 }, maximized: false, fullScreen: false }), saveMainWindowState: save })
  expect((restored as any).options).toMatchObject({ x: 720, y: 280, width: 1200, height: 800 })
  ;(restored.once as any).mock.calls.find(([event]: any[]) => event === 'ready-to-show')[1]()
  expect(restored.maximize).not.toHaveBeenCalled()
  ;(restored.on as any).mock.calls.find(([event]: any[]) => event === 'close')[1]({ preventDefault: vi.fn() })
  expect(save).toHaveBeenCalledWith({ bounds: { x: 100, y: 100, width: 1200, height: 800 }, maximized: false, fullScreen: false })
})
