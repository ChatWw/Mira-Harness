import { beforeEach, expect, it, vi } from 'vitest'
import { showMiraAboutDialog } from '../electron/bootstrap/miraAbout'
import { createMiraAboutDialogHtml } from '../electron/bootstrap/miraAboutWindow'

const state = vi.hoisted(() => ({ windows: [] as any[], failure: false }))
vi.mock('electron', () => ({
  app: { getVersion: () => '1.2.3' },
  nativeImage: { createFromPath: () => ({ toDataURL: () => 'data:image/png;base64,bWlyYQ==' }) },
  BrowserWindow: class {
    constructor(public options: any) { state.windows.push(this) }
    events: Record<string, () => void> = {}
    once(event: string, callback: () => void) { this.events[event] = callback }
    isDestroyed = () => false
    focus = vi.fn()
    show = vi.fn()
    destroy = vi.fn()
    setMenuBarVisibility = vi.fn()
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() }
    loadURL = vi.fn(async (_url: string) => { if (state.failure) throw new Error('load failed') })
  },
}))
beforeEach(() => { state.windows.at(-1)?.events.closed(); state.windows = []; state.failure = false })

it('opens one sandboxed modal with real branding, focuses it again and recreates after close', async () => {
  const parent = { isDestroyed: () => false } as any
  await showMiraAboutDialog(parent)
  const window = state.windows[0]
  expect(window.options).toMatchObject({ width: 256, height: 312, parent, modal: true, frame: false, resizable: false, show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } })
  expect(window.show).not.toHaveBeenCalled()
  window.events['ready-to-show']()
  expect(window.show).toHaveBeenCalledOnce()
  const html = decodeURIComponent(window.loadURL.mock.calls[0][0])
  expect(html).toContain('Mira Desktop App'); expect(html).toContain('版本 1.2.3')
  expect(html).toContain('Powered by Tuyn53'); expect(html).toContain('data:image/png;base64,bWlyYQ==')
  await showMiraAboutDialog(parent)
  expect(state.windows).toHaveLength(1); expect(window.focus).toHaveBeenCalledOnce()
  window.events.closed()
  await showMiraAboutDialog({ isDestroyed: () => true } as any)
  expect(state.windows[1].options).toMatchObject({ parent: undefined, modal: false })
})

it('cleans up failed loads so About can be retried', async () => {
  state.failure = true
  await expect(showMiraAboutDialog()).rejects.toThrow('load failed')
  expect(state.windows[0].destroy).toHaveBeenCalledOnce()
  state.failure = false
  await showMiraAboutDialog()
  expect(state.windows).toHaveLength(2)
})

it('escapes metadata and closes with the button, Enter and Escape', () => {
  const html = createMiraAboutDialogHtml({ applicationName: '<Mira>', appVersion: '1&2', credit: 'Tuyn53', optimizationLine: '', versionLabel: '版本', okButtonLabel: '确定', iconDataUrl: 'data:image/png;base64,test' })
  expect(html).toContain('&lt;Mira&gt;'); expect(html).toContain('1&amp;2'); expect(html).not.toContain('<Mira>')
  const close = vi.fn(), listeners: Record<string, (event?: any) => void> = {}
  const button = { addEventListener: (type: string, handler: () => void) => { listeners[type] = handler } }
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]
  new Function('window', 'document', script)({ close, addEventListener: (type: string, handler: () => void) => { listeners[type] = handler } }, { querySelector: () => button })
  listeners.click(); listeners.keydown({ key: 'Enter' }); listeners.keydown({ key: 'Escape' }); listeners.keydown({ key: 'a' })
  expect(close).toHaveBeenCalledTimes(3)
})
