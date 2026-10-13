import { randomUUID } from 'node:crypto'
import type { ProviderStreams } from '@earendil-works/pi-ai'
import type { MiraModelCall, MiraModelCallSource } from '../../src/config/miraModelTrace'
import type { ModelProviderSummary } from '../../src/config/harness'
import type { MiraModelTraceStore } from '../storage/miraModelTraceStore'

export interface MiraModelTraceContext { sessionId: string; runId?: string; source: MiraModelCallSource; store: Pick<MiraModelTraceStore, 'write'> }

/** Observe the final provider payload and SDK response without consuming or replacing its stream. */
export function miraTracedModelApi(api: ProviderStreams, provider: ModelProviderSummary, secrets: string[], trace: MiraModelTraceContext): ProviderStreams {
  const observe = (method: 'stream' | 'streamSimple'): ProviderStreams[typeof method] => (model, context, options) => {
    const agentSessionId = options?.sessionId
    const source = agentSessionId?.startsWith(`${trace.sessionId}:title:`) ? 'title'
      : agentSessionId === `${trace.sessionId}:summary` ? 'summary'
      : agentSessionId === `${trace.sessionId}:memory` ? 'memory'
      : agentSessionId && agentSessionId !== trace.sessionId && trace.source === 'main' ? 'subagent' : trace.source
    const record: MiraModelCall = { id: randomUUID(), sessionId: trace.sessionId, runId: trace.runId, agentSessionId, source, providerId: provider.id, providerName: provider.name, modelId: model.id, startedAt: Date.now(), status: 'running' }
    const write = (value: MiraModelCall) => { try { trace.store.write(value, secrets) } catch { /* Recording must not change model execution. */ } }
    const stream = api[method](model, context, { ...options, onPayload: async (payload, currentModel) => {
      const changed = await options?.onPayload?.(payload, currentModel)
      record.request = changed ?? payload
      write(record)
      return record.request
    } })
    void stream.result().then(response => {
      write({ ...record, request: undefined, completedAt: Date.now(), response, status: response.stopReason === 'aborted' ? 'aborted' : response.stopReason === 'error' ? 'failed' : 'completed', ...(response.errorMessage ? { error: response.errorMessage } : {}) })
    })
    return stream
  }
  return { stream: observe('stream'), streamSimple: observe('streamSimple') }
}
