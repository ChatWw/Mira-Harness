import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createHarnessEventPublisher } from '../electron/services/harnessEventPublisher'
import { MiraNotifications } from '../electron/services/miraNotifications'
import { registerNotificationIpc } from '../electron/ipc/notificationIpc'
import { readDesktopNotifications } from '../src/config/desktopNotifications'
import type { HarnessEvent } from '../src/config/harness'
import { FirstPartyHarnessHost } from '../apps/harness-react/src/platform/first-party-host'
import { readMiraHarnessControlCommand } from '../src/platform/harnessControls'

const native = vi.hoisted(() => ({ supported: true, created: [] as any[], external: vi.fn(), owner: {} as any, handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({
  Notification: class extends EventEmitter {
    static isSupported = () => native.supported
    constructor(public options: any) { super(); native.created.push(this) }
    show = vi.fn()
    close = vi.fn()
  },
  shell: { openExternal: native.external },
  BrowserWindow: { fromWebContents: () => native.owner },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => native.handlers.set(channel, handler) },
}))

beforeEach(() => { native.supported = true; native.created = []; native.external.mockReset(); native.owner = {}; native.handlers.clear() })
function fixture() {
  const preferences: Record<string, unknown> = {}, session: any = { title: '分析项目' }
  const window = { isDestroyed: () => false, isFocused: vi.fn(() => false), isVisible: vi.fn(() => true) }
  const open = vi.fn()
  const notifications = new MiraNotifications({ getSnapshot: () => ({ preferences }), harness: { getSession: () => session } } as any, () => window as any, open)
  const publish = createHarnessEventPublisher(undefined, event => notifications.handle(event))
  const send = (type: HarnessEvent['type'], payload: Record<string, unknown>, sender?: any) => publish(sender, { sessionId: 's', type, payload })
  const complete = (messageId = 'm') => send('message-complete', { messageId, run: { status: 'completed' } })
  return { preferences, session, window, open, notifications, send, complete }
}

describe('desktop notification delivery', () => {
  it('uses safe defaults and normalizes old or malformed stored values', () => {
    expect(readDesktopNotifications(undefined)).toEqual({ completion: 'unfocused', permissions: true, questions: true, sound: 'default' })
    expect(readDesktopNotifications({ completion: 'garbage', sound: 'garbage', questions: false })).toMatchObject({ completion: 'unfocused', sound: 'default', questions: false })
  })
  it('applies the completion focus policy, hidden windows, live preferences and silent sound', () => {
    const f = fixture()
    f.window.isFocused.mockReturnValue(true); f.complete(); expect(native.created).toHaveLength(0)
    f.window.isVisible.mockReturnValue(false); f.complete()
    expect(native.created[0].options).toMatchObject({ title: 'Mira · 轮次已完成', body: '分析项目', silent: false })
    f.preferences.desktopNotifications = { completion: 'never' }; f.complete('two'); expect(native.created).toHaveLength(1)
    f.preferences.desktopNotifications = { completion: 'always', sound: 'silent' }; f.window.isVisible.mockReturnValue(true); f.complete('three')
    expect(native.created[1].options.silent).toBe(true)
  })
  it('delivers sender and background events once, and opens the exact session on click', () => {
    const f = fixture(), sender = { isDestroyed: () => false, send: vi.fn() }
    f.send('permission-request', { requestId: 'p', title: '允许执行命令？' }, sender)
    f.send('permission-request', { requestId: 'p', title: '允许执行命令？' })
    expect(native.created).toHaveLength(1); expect(sender.send).toHaveBeenCalledOnce()
    expect(native.created[0].options.body).toBe('分析项目\n允许执行命令？')
    native.created[0].emit('click'); expect(f.open).toHaveBeenCalledExactlyOnceWith('s')
  })
  it('maps questions and plan review independently from completion and suppresses false completion', () => {
    const f = fixture()
    f.session.pendingInteraction = { id: 'q', kind: 'question', status: 'waiting', questions: [{ question: '选择哪个目录？' }] }
    f.send('interaction-created', { interaction: f.session.pendingInteraction }); f.complete()
    expect(native.created).toHaveLength(1); expect(native.created[0].options.title).toBe('Mira · 需要你回答问题')
    f.preferences.desktopNotifications = { questions: false, permissions: false }
    f.send('interaction-created', { interaction: { ...f.session.pendingInteraction, id: 'q2' } })
    f.send('permission-request', { requestId: 'p' })
    f.send('interaction-created', { interaction: { id: 'plan', kind: 'plan-review', status: 'waiting' } })
    expect(native.created).toHaveLength(1)
    f.preferences.desktopNotifications = { permissions: true }
    f.send('interaction-created', { interaction: { id: 'plan', kind: 'plan-review', status: 'waiting' } })
    expect(native.created[1].options.title).toBe('Mira · 需要确认方案')
    f.session.pendingInteraction = undefined
    f.send('message-complete', { messageId: 'failed', run: { status: 'failed' } })
    f.send('message-complete', { messageId: 'stopped', run: { status: 'interrupted' } })
    expect(native.created).toHaveLength(2)
  })
  it('isolates native delivery failure and stops on shutdown or unsupported systems', () => {
    const f = fixture(); f.complete()
    native.created[0].emit('failed', {}, 'denied')
    expect(f.notifications.status().error).toContain('通知未能送达')
    native.supported = false; f.complete('two'); expect(native.created).toHaveLength(1)
    native.supported = true; f.notifications.dispose(); f.complete('three'); expect(native.created).toHaveLength(1)
  })
})

it('opens fixed OS notification settings, without claiming authorization status', async () => {
  const db = {} as any
  const mac = new MiraNotifications(db, () => undefined, () => undefined, 'darwin')
  expect(mac.status()).toEqual({ supported: true, settingsAvailable: true })
  await mac.openSettings(); expect(native.external).toHaveBeenLastCalledWith('x-apple.systempreferences:com.apple.Notifications-Settings.extension')
  await new MiraNotifications(db, () => undefined, () => undefined, 'win32').openSettings()
  expect(native.external).toHaveBeenLastCalledWith('ms-settings:notifications')
  await expect(new MiraNotifications(db, () => undefined, () => undefined, 'linux').openSettings()).rejects.toThrow('不支持')
})

it('exposes notification settings only to a desktop main frame', async () => {
  const f = fixture(); registerNotificationIpc(f.notifications)
  const mainFrame = {}, sender = { mainFrame }
  const status = native.handlers.get('notifications:status')!
  expect(() => status({ senderFrame: {}, sender })).toThrow('主窗口')
  expect(status({ senderFrame: mainFrame, sender })).toMatchObject({ supported: true })
  native.owner = null; expect(() => status({ senderFrame: mainFrame, sender })).toThrow('主窗口')
})

it('transports the notification session to the workbench and rejects malformed control commands', () => {
  const port = { onmessage: undefined as any, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
  const host = new FirstPartyHarnessHost(port as any), listener = vi.fn()
  host.onHarnessControl(listener)
  const command = { type: 'mira:harness-control', action: 'open-session', sessionId: 'task' }
  expect(readMiraHarnessControlCommand(command)).toEqual(command)
  port.onmessage({ data: command }); expect(listener).toHaveBeenCalledExactlyOnceWith('open-session', 'task')
  for (const sessionId of ['', 1, '\0', 'x'.repeat(129)]) expect(readMiraHarnessControlCommand({ ...command, sessionId })).toBeUndefined()
  expect(readMiraHarnessControlCommand({ ...command, extra: true })).toBeUndefined()
  expect(readMiraHarnessControlCommand({ type: command.type, action: command.action })).toBeUndefined()
  host.close()
})
