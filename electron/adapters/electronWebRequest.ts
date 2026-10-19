import { net } from 'electron'
import { Readable } from 'node:stream'
import type { WebRequest } from './webTools'

// net.fetch 的 manual 重定向会拒绝 Promise，使用 request 将重定向交给网页工具逐跳检查。
export const electronWebRequest: WebRequest = (url, init) => new Promise((resolve, reject) => {
  const signal = init.signal
  if (signal?.aborted) { reject(signal.reason); return }
  const request = net.request({ url, redirect: 'manual', credentials: 'omit', headers: Object.fromEntries(new Headers(init.headers)) })
  const abort = () => { request.abort(); reject(signal?.reason) }
  signal?.addEventListener('abort', abort, { once: true })
  request.on('close', () => signal?.removeEventListener('abort', abort))
  request.on('error', reject)
  request.on('redirect', (status, _method, location) => {
    resolve(new Response(null, { status, headers: { location } }))
    request.abort()
  })
  request.on('response', message => {
    const headers = new Headers()
    for (const [name, values] of Object.entries(message.headers)) {
      for (const value of Array.isArray(values) ? values : [values]) headers.append(name, value)
    }
    const incoming = message as unknown as Readable
    message.on('aborted', () => incoming.destroy(new Error('网页响应在读取完成前中断')))
    incoming.on('close', () => request.abort())
    const body = [204, 205, 304].includes(message.statusCode) ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>
    resolve(new Response(body, { status: message.statusCode, headers }))
  })
  request.end()
})
