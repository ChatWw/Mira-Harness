import { channel } from 'node:diagnostics_channel'
import type { ClientRequest } from 'node:http'
import type { MiraNetworkSnapshot } from '../../src/config/resourceManager'
// URL sanitizer adapted from ZCode packages/shared/src/networkCapture.ts.
// Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
// Mira uses its own request capture lifecycle below.
export function sanitizeResourceUrl(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return
    url.username = ''; url.password = ''; url.hash = ''
    for (const key of new Set(url.searchParams.keys())) url.searchParams.set(key, '[redacted]')
    return url.href.slice(0, 2048)
  } catch { return }
}
export function createResourceNetwork() {
  let active = false, nextId = 0, dropped = 0
  let records: MiraNetworkSnapshot['records'] = []
  function record(method: string, rawUrl: string, pid = process.pid, processType = 'main') {
    if (!active || method === 'CONNECT') return
    const url = sanitizeResourceUrl(rawUrl)
    if (!url) return
    records.push({ id: ++nextId, timestamp: Date.now(), method: method.slice(0, 32), url, pid, processType })
    if (records.length > 1000) { records.shift(); dropped++ }
  }
  function undici(message: unknown) {
    try { const { request } = message as { request: { method: string; path: string; origin: string } }; record(request.method, new URL(request.path, request.origin).href) } catch { /* Observation must not break a request. */ }
  }
  function http(message: unknown) {
    try { const { request } = message as { request: ClientRequest }; record(request.method, new URL(request.path, `${request.protocol}//${request.getHeader('host') ?? request.host}`).href) } catch { /* Observation must not break a request. */ }
  }
  function clear() { records = []; dropped = 0 }
  function start() { if (active) return; active = true; clear(); channel('undici:request:create').subscribe(undici); channel('http.client.request.start').subscribe(http) }
  function stop() { active = false; clear(); channel('undici:request:create').unsubscribe(undici); channel('http.client.request.start').unsubscribe(http) }
  return { start, stop, clear, record, snapshot: (): MiraNetworkSnapshot => ({ records: [...records], dropped }) }
}
