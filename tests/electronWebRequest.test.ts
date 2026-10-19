import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { electronWebRequest } from '../electron/adapters/electronWebRequest'

const { netRequest } = vi.hoisted(() => ({ netRequest: vi.fn() }))
vi.mock('electron', () => ({ net: { request: netRequest } }))

function setup() {
  const request = Object.assign(new EventEmitter(), { end: vi.fn(), abort: vi.fn() })
  request.abort.mockImplementation(() => { request.emit('abort'); request.emit('close') })
  netRequest.mockReturnValue(request)
  return request
}

afterEach(() => vi.clearAllMocks())

describe('Electron web transport', () => {
  it('returns manual redirects for URL checks without following them in Chromium', async () => {
    const request = setup()
    const pending = electronWebRequest('https://example.com/', { headers: { Accept: 'text/html' } })
    request.emit('redirect', 302, 'GET', 'https://example.com/article', {})
    const response = await pending
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://example.com/article')
    expect(request.abort).toHaveBeenCalledOnce()
    expect(netRequest).toHaveBeenCalledWith({ url: 'https://example.com/', redirect: 'manual', credentials: 'omit', headers: { accept: 'text/html' } })
  })

  it('streams the response and aborts the underlying request when the consumer cancels', async () => {
    const request = setup()
    const pending = electronWebRequest('https://example.com/', {})
    const message = Object.assign(new PassThrough(), { statusCode: 200, headers: { 'content-type': ['text/plain; charset=utf-8'] } })
    request.emit('response', message)
    const response = await pending
    const reader = response.body!.getReader()
    message.write('正文')
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('正文')
    await reader.cancel()
    await vi.waitFor(() => expect(request.abort).toHaveBeenCalledOnce())
  })

  it('cancels in-flight requests and rejects requests cancelled before starting', async () => {
    const request = setup(), controller = new AbortController()
    const pending = electronWebRequest('https://example.com/', { signal: controller.signal })
    const outcome = expect(pending).rejects.toThrow('用户停止')
    controller.abort(new Error('用户停止'))
    await outcome
    expect(request.abort).toHaveBeenCalledOnce()
    await expect(electronWebRequest('https://example.com/', { signal: controller.signal })).rejects.toThrow('用户停止')
    expect(netRequest).toHaveBeenCalledOnce()
  })

  it('preserves Chromium connection errors and incomplete response failures', async () => {
    const request = setup()
    const pending = electronWebRequest('https://example.com/', {})
    const outcome = expect(pending).rejects.toThrow('net::ERR_NAME_NOT_RESOLVED')
    request.emit('error', new Error('net::ERR_NAME_NOT_RESOLVED'))
    await outcome

    const next = setup()
    const responsePending = electronWebRequest('https://example.com/', {})
    const message = Object.assign(new PassThrough(), { statusCode: 200, headers: {} })
    next.emit('response', message)
    const response = await responsePending
    const body = expect(response.text()).rejects.toThrow('网页响应在读取完成前中断')
    message.emit('aborted')
    await body
  })
})
