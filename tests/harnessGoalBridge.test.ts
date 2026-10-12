import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import { handleFirstPartyRequest } from '../src/platform/firstPartyBridge'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
import type { PlatformIpcDependencies } from '../electron/ipc/platformIpc'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => electron.handlers.set(channel, handler) }, BrowserWindow: {}, dialog: {}, shell: {} }))
import { registerPlatformIpcHandlers } from '../electron/ipc/platformIpc'

const manifest = firstPartyAppManifests.find(item => item.appId === 'mira-harness')!
const common = { sessionId: 'session', expectedRevision: 7, expectedGoalId: 'goal' }
const selection = { providerId: 'provider', modelId: 'model', thinkingLevel: 'high' as const }

describe('Goal controls across both first-party authority boundaries', () => {
  beforeEach(() => { electron.handlers.clear(); vi.clearAllMocks() })
  it.each([
    ['pause', {}, 'pauseGoal', ['session', 7, 'goal']],
    ['resume', { selection, permissionMode: 'full' }, 'resumeGoal', ['session', 7, selection, 'full', 'goal']],
    ['budget', { tokenBudget: null }, 'updateGoalBudget', ['session', null, 7, 'goal']],
    ['clear', {}, 'clearGoal', ['session', 7, 'goal']],
  ] as const)('preserves identity, revision and authorization for %s', async (action, extra, method, args) => {
    const value = { id: 'goal', revision: 8 }, runtime = { [method]: vi.fn(() => value) }
    registerPlatformIpcHandlers({ database: {}, localMicroAppServer: {}, harnessRuntime: runtime } as unknown as PlatformIpcDependencies)
    const sender = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false })
    const invoke = (channel: string, ...values: unknown[]) => electron.handlers.get(channel)!({ sender }, ...values)
    const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
    const invokeFirstPartyHarness = vi.fn(async (grant: string, call: string, params: unknown) => invoke('platform:first-party-harness', grant, call, params))
    const raw = { ...common, ...extra, injectedStatus: 'complete', injectedUsage: 0 }
    const options = { manifest, grantId, api: { invokeFirstPartyHarness } as never, context: {} as never, route: '/workspace/harness-react', navigate: vi.fn() }
    await expect(handleFirstPartyRequest(options, { type: 'mira:request', id: '1', method: `harness.goal.${action}`, params: raw })).resolves.toEqual(value)
    expect(invokeFirstPartyHarness).toHaveBeenCalledExactlyOnceWith(grantId, `goal.${action}`, { ...common, ...extra })
    expect(runtime[method]).toHaveBeenCalledExactlyOnceWith(sender, ...args)
    expect(() => invoke('platform:first-party-harness', 'forged', `goal.${action}`, raw)).toThrow('授权无效')
    await expect(handleFirstPartyRequest({ ...options, manifest: { ...manifest, appId: 'mira-novel-studio' } }, { type: 'mira:request', id: '2', method: `harness.goal.${action}`, params: raw })).rejects.toThrow('不能使用 Harness')
  })
  it.each([undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid revision %s', expectedRevision => {
    expect(() => parseFirstPartyHarnessCall('goal.pause', { ...common, expectedRevision })).toThrow('目标版本')
  })
  it.each([undefined, '', '\0', 123])('requires the actual goal identity %s', expectedGoalId => {
    expect(() => parseFirstPartyHarnessCall('goal.clear', { ...common, expectedGoalId })).toThrow('目标 ID')
  })
  it.each([0, -1, 1.2, '10', Number.MAX_SAFE_INTEGER + 1])('rejects invalid budget %s', tokenBudget => {
    expect(() => parseFirstPartyHarnessCall('goal.budget', { ...common, tokenBudget })).toThrow('预算')
  })
  it('preserves explicit queue and structured-context intent instead of promoting it into native Goal input', () => {
    const raw = { sessionId: 'session', submissionId: 'submission', text: '/goal quoted agent context', references: [], selection, planning: false, options: { delivery: 'queue', expectedRunId: 'run', hasStructuredContext: true } }
    expect(parseFirstPartyHarnessCall('message.submit', raw)).toEqual({ method: 'message.submit', ...raw })
    expect(() => parseFirstPartyHarnessCall('message.submit', { ...raw, options: { ...raw.options, hasStructuredContext: 'true' } })).toThrow('结构化上下文')
  })
})
