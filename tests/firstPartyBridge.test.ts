import { describe, expect, it, vi } from 'vitest'
import type { FirstPartyAppManifest } from '../src/config/firstPartyApps'
import { handleFirstPartyRequest, isFirstPartyRequest } from '../src/platform/firstPartyBridge'
import type { PlatformApi, PlatformContext } from '../src/types'

const manifest: FirstPartyAppManifest = {
  appId: 'mira-novel-studio',
  legacyIds: ['ai-novel'],
  enabled: true,
  trustedSource: { type: 'builtin', packagePath: 'novel-studio' },
  entry: { path: 'index.html' },
  shellCompatibility: { minVersion: '0.0.10' },
  apiCompatibility: { major: 1 },
  capabilities: ['models:text.generate', 'storage:novel-projects'],
}
const context: PlatformContext = { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'platform', name: 'Mira' } }

function bridge(overrides: Partial<FirstPartyAppManifest> = {}) {
  const api = {
    generateFirstPartyText: vi.fn(async () => 'generated'),
    listNovelProjects: vi.fn(async () => []),
    saveNovelProject: vi.fn(async project => project),
    listFirstPartyNovelProjects: vi.fn(async () => []),
    getFirstPartyNovelProject: vi.fn(async () => ({ id: 'project-1' })),
    saveFirstPartyNovelProject: vi.fn(async (_grantId, project) => project),
    invokeFirstPartyHarness: vi.fn(async (_grantId, method) => ({ method })),
    getSnapshot: vi.fn(async () => ({ mainMenus: [], microApps: [], preferences: { 'first-party.mira-novel-studio.draft': { text: 'hi' } } })),
    savePreference: vi.fn(async (_key: string, _value: unknown) => undefined),
  } as unknown as PlatformApi
  const navigate = vi.fn()
  const options = { manifest: { ...manifest, ...overrides }, grantId: 'grant-for-novel', api, context, route: '/chapter/1', navigate }
  const request = (method: string, params?: unknown) => handleFirstPartyRequest(options, { type: 'mira:request', id: 'request-1', method, params })
  return { api, navigate, request }
}

describe('first-party capability bridge', () => {
  it('accepts only bounded request envelopes and reports the host API version', async () => {
    expect(isFirstPartyRequest({ type: 'mira:request', id: '1', method: 'context.get' })).toBe(true)
    expect(isFirstPartyRequest({ type: 'mira:request', id: '1', method: '' })).toBe(false)
    expect(isFirstPartyRequest({ type: 'mira:request', id: '1', method: 'x'.repeat(129) })).toBe(false)
    await expect(bridge().request('context.get')).resolves.toMatchObject({ appId: 'mira-novel-studio', apiVersion: { major: 1, minor: 0 }, route: '/chapter/1' })
    await expect(bridge().request('getModelProviderApiKey')).rejects.toMatchObject({ code: 'UNKNOWN_METHOD' })
  })

  it('rejects missing capabilities and access to another app\'s projects', async () => {
    const missing = bridge({ capabilities: [] })
    await expect(missing.request('models.generateText', { role: 'authoring', prompt: 'text', selection: { providerId: 'p', modelId: 'm' } })).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' })
    expect(missing.api.generateFirstPartyText).not.toHaveBeenCalled()

    const other = bridge({ appId: 'other-app' })
    await expect(other.request('novel.list')).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' })
    expect(other.api.listFirstPartyNovelProjects).not.toHaveBeenCalled()
  })

  it('confines navigation to app paths and rejects malformed projects', async () => {
    const entry = bridge()
    for (const path of ['//example.com', '/../../settings', '/%2e%2e/settings', '/%2fsettings', '/a\\b']) {
      await expect(entry.request('navigation.open', { path })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
    expect(entry.navigate).not.toHaveBeenCalled()
    await expect(entry.request('navigation.open', { path: '/chapters/1' })).resolves.toBeNull()
    expect(entry.navigate).toHaveBeenCalledWith('/chapters/1')

    await expect(entry.request('novel.save', { project: { version: 1, title: 'Untitled' } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(entry.api.saveFirstPartyNovelProject).not.toHaveBeenCalled()
  })

  it('sends only validated model selection fields to the host model channel', async () => {
    const entry = bridge()
    await expect(entry.request('models.generateText', { role: 'authoring', prompt: 'text', selection: { providerId: 'p', modelId: 'm', apiKey: 'injected' } })).resolves.toBe('generated')
    expect(entry.api.generateFirstPartyText).toHaveBeenCalledWith('grant-for-novel', 'authoring', 'text', { providerId: 'p', modelId: 'm' })
    await expect(entry.request('models.generateText', { role: 'authoring', prompt: 'text', selection: { providerId: 'p' } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('routes novel storage through the grant-bound host API', async () => {
    const entry = bridge()
    await expect(entry.request('novel.list')).resolves.toEqual([])
    await expect(entry.request('novel.get', { id: 'project-1' })).resolves.toEqual({ id: 'project-1' })
    await expect(entry.request('novel.save', { project: { version: 1, id: 'project-1', title: 'Untitled' } })).resolves.toMatchObject({ id: 'project-1' })
    expect(entry.api.listFirstPartyNovelProjects).toHaveBeenCalledWith('grant-for-novel')
    expect(entry.api.getFirstPartyNovelProject).toHaveBeenCalledWith('grant-for-novel', 'project-1')
    expect(entry.api.saveFirstPartyNovelProject).toHaveBeenCalledWith('grant-for-novel', expect.objectContaining({ id: 'project-1' }))
  })

  it('namespaces app preferences away from shell preference keys', async () => {
    const entry = bridge()
    await expect(entry.request('preferences.get', { key: 'draft' })).resolves.toEqual({ text: 'hi' })
    await expect(entry.request('preferences.get', { key: 'missing' })).resolves.toBeNull()
    await expect(entry.request('preferences.set', { key: 'draft', value: { text: 'next' } })).resolves.toBeNull()
    expect(entry.api.savePreference).toHaveBeenCalledWith('first-party.mira-novel-studio.draft', { text: 'next' })
    await expect(entry.request('preferences.set', { key: '../escape', value: 1 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(entry.api.savePreference).toHaveBeenCalledTimes(1)
    await expect(entry.request('preferences.set', { key: 'big', value: 'x'.repeat(262_145) })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('routes only the validated Harness surface through the owning grant', async () => {
    const entry = bridge({ appId: 'mira-harness', capabilities: ['harness:workbench'] })
    await expect(entry.request('harness.sessions.list')).resolves.toEqual({ method: 'sessions.list' })
    expect(entry.api.invokeFirstPartyHarness).toHaveBeenCalledWith('grant-for-novel', 'sessions.list', {})
    await expect(entry.request('harness.message.run', { sessionId: 's', text: 'run', planning: false, selection: { providerId: 'p', modelId: 'm' }, extra: 'ignored' })).resolves.toEqual({ method: 'message.run' })
    await expect(entry.request('harness.message.run', { sessionId: 's', text: 'run', planning: false, selection: { providerId: 'p' } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.files.list', { sessionId: 's', path: 'src' })).resolves.toEqual({ method: 'files.list' })
    expect(entry.api.invokeFirstPartyHarness).toHaveBeenLastCalledWith('grant-for-novel', 'files.list', { sessionId: 's', path: 'src' })
    await expect(entry.request('harness.files.read', { sessionId: 's', path: '../secret' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    const bounds = { x: 10, y: 20, width: 400, height: 300 }
    await expect(entry.request('harness.browser.navigate', { sessionId: 's', url: 'https://example.com', bounds })).resolves.toEqual({ method: 'browser.navigate' })
    await expect(entry.request('harness.browser.navigate', { sessionId: 's', url: 'file:///etc/passwd', bounds })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.browser.navigate', { sessionId: 's', url: 'https://example.com', bounds: { ...bounds, x: -1 } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.browser.control', { sessionId: 's', action: 'reload' })).resolves.toEqual({ method: 'browser.control' })
    await expect(entry.request('harness.browser.control', { sessionId: 's', action: 'hide' })).resolves.toEqual({ method: 'browser.control' })
    await expect(entry.request('harness.browser.control', { sessionId: 's', action: 'show' })).resolves.toEqual({ method: 'browser.control' })
    await expect(entry.request('harness.browser.control', { sessionId: 's', action: 'openDevTools' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(entry.request('harness.terminal.resize', { sessionId: 's', terminalId: 't', columns: 100, rows: 30 })).resolves.toEqual({ method: 'terminal.resize' })
    await expect(entry.request('harness.terminal.resize', { sessionId: 's', terminalId: 't', columns: 1, rows: 30 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})
