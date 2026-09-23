import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalMicroAppServer } from '../electron/adapters/localMicroAppServer'

const handle = vi.fn((_subpath, _request, response) => response.writeHead(200).end('ok'))
const server = new LocalMicroAppServer({
  apiHandlers: new Map([
    ['novel', { capability: 'models:text.generate', handle }],
    ['other', { capability: 'models:text.generate', handle }],
  ]),
})

afterEach(async () => {
  await server.stop()
  vi.clearAllMocks()
})

describe('local micro-app API grants', () => {
  it('rejects unauthenticated, wrong-app, and insufficient-capability calls', async () => {
    await server.start([])
    const novelUrl = `${server.getApiBaseUrl('novel')}authoring`
    const call = (token?: string) => fetch(novelUrl, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    expect((await call()).status).toBe(403)
    const otherToken = server.issueApiToken('other', ['models:text.generate'])
    expect((await call(otherToken)).status).toBe(403)
    const weakToken = server.issueApiToken('novel', ['storage:novel-projects'])
    expect((await call(weakToken)).status).toBe(403)
    expect(handle).not.toHaveBeenCalled()
  })

  it('passes only a matching grant to the handler and revokes it', async () => {
    await server.start([])
    const token = server.issueApiToken('novel', ['models:text.generate'])
    const url = `${server.getApiBaseUrl('novel')}authoring`
    const call = () => fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })

    const response = await call()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
    expect(handle).toHaveBeenCalledOnce()
    expect(handle.mock.calls[0][0]).toBe('authoring')

    server.revokeApiToken(token)
    expect((await call()).status).toBe(403)
    expect(handle).toHaveBeenCalledOnce()
  })

  it('allows Authorization in approved preflight without using CORS as authentication', async () => {
    await server.start([])
    const url = `${server.getApiBaseUrl('novel')}authoring`
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://localhost:4173' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization')
    expect((await fetch(url, { method: 'POST', headers: { Origin: 'http://localhost:4173' } })).status).toBe(403)
    expect(handle).not.toHaveBeenCalled()
  })
})
