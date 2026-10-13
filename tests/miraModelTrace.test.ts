import { createAssistantMessageEventStream, type ProviderStreams } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { miraTracedModelApi } from '../electron/adapters/miraModelTrace'
import type { ModelProviderSummary } from '../src/config/harness'
import type { MiraModelCall } from '../src/config/miraModelTrace'

const provider = { id: 'provider', name: '本地模型' } as ModelProviderSummary
const model = { id: 'model' } as any
function api(stopReason = 'stop') {
  const stream = createAssistantMessageEventStream()
  const response: any = { role: 'assistant', content: [{ type: 'text', text: 'UNCHANGED_OUTPUT' }], stopReason, ...(stopReason === 'error' ? { errorMessage: 'UPSTREAM_ERROR' } : {}) }
  const method: ProviderStreams['stream'] = (_model, _context, options) => {
    void Promise.resolve(options?.onPayload?.({ messages: [{ role: 'user', content: 'RAW' }] }, model)).then(() => { stream.push(stopReason === 'error' || stopReason === 'aborted' ? { type: 'error', reason: stopReason as any, error: response } : { type: 'done', reason: 'stop', message: response }); stream.end() })
    return stream
  }
  return { providerApi: { stream: method, streamSimple: method }, stream, response }
}
describe('Mira provider observation', () => {
  it('preserves stream identity, events and result-only consumers while observing the final callback payload', async () => {
    const fixture = api(), records: MiraModelCall[] = []
    const observed = miraTracedModelApi(fixture.providerApi, provider, ['fake-key'], { sessionId: 'task', runId: 'run', source: 'main', store: { write: value => { records.push(structuredClone(value)) } } })
    const source = observed.streamSimple(model, { messages: [] }, { sessionId: 'task', onPayload: value => ({ ...(value as object), converted: 'FINAL_PAYLOAD' }) })
    expect(source).toBe(fixture.stream)
    expect(await source.result()).toBe(fixture.response)
    await Promise.resolve()
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ sessionId: 'task', runId: 'run', source: 'main', status: 'running', request: { converted: 'FINAL_PAYLOAD' } })
    expect(records[1]).toMatchObject({ status: 'completed', response: fixture.response })
    const events = []; for await (const event of source) events.push(event)
    expect(events).toEqual([{ type: 'done', reason: 'stop', message: fixture.response }])
  })
  it.each([['error', 'failed'], ['aborted', 'aborted'], ['stop', 'completed']])('records %s without changing the SDK terminal response', async (reason, status) => {
    const fixture = api(reason), records: MiraModelCall[] = []
    const observed = miraTracedModelApi(fixture.providerApi, provider, [], { sessionId: 'task', source: 'main', store: { write: value => { records.push(structuredClone(value)) } } })
    const stream = observed.stream(model, { messages: [] })
    expect(await stream.result()).toBe(fixture.response)
    await Promise.resolve()
    expect(records.at(-1)).toMatchObject({ status, response: fixture.response })
  })
  it.each([['task', 'main'], ['task:title:1', 'title'], ['task:summary', 'summary'], ['task:memory', 'memory'], ['task:child:one', 'subagent']])('classifies source %s while retaining the actual parent task', async (sessionId, source) => {
    const fixture = api(), records: MiraModelCall[] = []
    const observed = miraTracedModelApi(fixture.providerApi, provider, [], { sessionId: 'task', source: 'main', store: { write: value => { records.push(structuredClone(value)) } } })
    await observed.streamSimple(model, { messages: [] }, { sessionId }).result()
    await Promise.resolve()
    expect(records[0]).toMatchObject({ sessionId: 'task', agentSessionId: sessionId, source })
  })
  it('keeps provider output available when a recording sink fails', async () => {
    const fixture = api()
    const observed = miraTracedModelApi(fixture.providerApi, provider, [], { sessionId: 'task', source: 'main', store: { write: () => { throw Error('disk failure') } } })
    expect(await observed.streamSimple(model, { messages: [] }).result()).toBe(fixture.response)
  })
})
