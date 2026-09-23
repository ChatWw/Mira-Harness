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
  } as unknown as PlatformApi
  const navigate = vi.fn()
  const options = { manifest: { ...manifest, ...overrides }, api, context, route: '/chapter/1', navigate }
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
    expect(other.api.listNovelProjects).not.toHaveBeenCalled()
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
    expect(entry.api.saveNovelProject).not.toHaveBeenCalled()
  })

  it('sends only validated model selection fields to the host model channel', async () => {
    const entry = bridge()
    await expect(entry.request('models.generateText', { role: 'authoring', prompt: 'text', selection: { providerId: 'p', modelId: 'm', apiKey: 'injected' } })).resolves.toBe('generated')
    expect(entry.api.generateFirstPartyText).toHaveBeenCalledWith('mira-novel-studio', 'authoring', 'text', { providerId: 'p', modelId: 'm' })
    await expect(entry.request('models.generateText', { role: 'authoring', prompt: 'text', selection: { providerId: 'p' } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})
