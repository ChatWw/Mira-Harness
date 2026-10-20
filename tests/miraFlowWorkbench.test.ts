import { describe, expect, it } from 'vitest'
import { parseMiraFlowWorkbenchRequest } from '../src/config/miraFlowWorkbench'

const start = { action: 'runs.start', projectId: 'project', name: 'review', scope: 'project', revision: 'a'.repeat(64), selection: { providerId: 'provider', modelId: 'org/model', thinkingLevel: 'high' } }
describe('serializable Mira workflow workbench contract', () => {
  it('artifact access accepts only journal identities and bounded version', () => {
    const request = { action: 'artifacts.read', sessionId: 'session', runId: 'run', artifactId: 'draft.md', version: 1 }
    expect(parseMiraFlowWorkbenchRequest(request)).toEqual(request)
    expect(parseMiraFlowWorkbenchRequest({ ...request, action: 'artifacts.save' }).action).toBe('artifacts.save')
    for (const value of [{ path: '/tmp/private' }, { uri: 'file:///tmp/private' }, { artifactId: '../secret' }, { version: 0 }, { version: 17 }]) expect(() => parseMiraFlowWorkbenchRequest({ ...request, ...value })).toThrow('请求无效')
  })
  it('detaches arguments/model selection before any host async boundary', () => {
    const original = { ...start, args: { nested: { value: 1 } } }
    const parsed = parseMiraFlowWorkbenchRequest(original)
    original.args.nested.value = 2
    original.selection.modelId = 'changed'
    expect(parsed).toMatchObject({ args: { nested: { value: 1 } }, selection: { modelId: 'org/model', thinkingLevel: 'high' } })
  })
  it.each(['loweredJs', 'driver', 'cwd', 'path', 'source', 'signal'])('rejects renderer-owned %s', field => {
    expect(() => parseMiraFlowWorkbenchRequest({ ...start, [field]: '/private/host-secret' })).toThrow('工作流请求无效')
  })
  it('requires a saved revision, project, scope and current model for launch', () => {
    for (const field of ['revision', 'projectId', 'scope', 'selection']) {
      const value: Record<string, unknown> = { ...start }; delete value[field]
      expect(() => parseMiraFlowWorkbenchRequest(value)).toThrow('工作流请求无效')
    }
    expect(() => parseMiraFlowWorkbenchRequest({ ...start, revision: 'stale' })).toThrow()
    expect(() => parseMiraFlowWorkbenchRequest({ ...start, name: '../script' })).toThrow()
    expect(() => parseMiraFlowWorkbenchRequest({ ...start, selection: { ...start.selection, apiKey: 'secret' } })).toThrow()
  })
  it('enforces strict definition writes and project scope without accepting a raw root', () => {
    const input = { name: 'review', scope: 'global', meta: { description: 'Review files', args: { enabled: { type: 'boolean', default: true } } }, script: 'return 1;' }
    expect(parseMiraFlowWorkbenchRequest({ action: 'definitions.preview', input })).toMatchObject({ input })
    expect(() => parseMiraFlowWorkbenchRequest({ action: 'definitions.save', input: { ...input, root: '/private/tmp' } })).toThrow()
    expect(() => parseMiraFlowWorkbenchRequest({ action: 'definitions.save', input: { ...input, scope: 'project' } })).toThrow()
    expect(() => parseMiraFlowWorkbenchRequest({ action: 'definitions.save', input: { ...input, meta: { description: 'x', args: { enabled: { type: 'boolean', default: 'yes' } } } } })).toThrow()
  })
  it('caps event pagination while allowing zero-based cursor and unbounded positive concurrency', () => {
    const snapshot = { action: 'runs.snapshot', sessionId: 'session', runId: 'run' }
    expect(parseMiraFlowWorkbenchRequest({ ...snapshot, afterSequence: -1, limit: 500 })).toMatchObject({ afterSequence: -1, limit: 500 })
    for (const limit of [0, 501, 1.5]) expect(() => parseMiraFlowWorkbenchRequest({ ...snapshot, limit })).toThrow()
    expect(() => parseMiraFlowWorkbenchRequest({ ...snapshot, afterSequence: -2 })).toThrow()
    expect(parseMiraFlowWorkbenchRequest({ action: 'runs.concurrency', sessionId: 'session', runId: 'run', maxConcurrency: 128 })).toMatchObject({ maxConcurrency: 128 })
    expect(() => parseMiraFlowWorkbenchRequest({ action: 'runs.concurrency', sessionId: 'session', runId: 'run', maxConcurrency: 0 })).toThrow()
  })
  it('rejects cycles, getters, prototype pollution, nonfinite arguments and oversized payloads', () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
    for (const args of [cyclic, { value: Infinity }, { value: new Date() }, { value: undefined }, { value: new Array(2) }, JSON.parse('{"__proto__":{"polluted":true}}'), { value: 'x'.repeat(33 * 1024) }]) {
      expect(() => parseMiraFlowWorkbenchRequest({ ...start, args })).toThrow('工作流请求无效')
    }
    const getter = Object.defineProperty({}, 'secret', { enumerable: true, get: () => { throw new Error('should not execute') } })
    expect(() => parseMiraFlowWorkbenchRequest({ ...start, args: getter })).toThrow('工作流请求无效')
  })
})


describe('saved workflow removal and move request boundaries', () => {
  it('requires a selected project and a reviewed source revision', () => {
    const revision = 'a'.repeat(64)
    expect(parseMiraFlowWorkbenchRequest({ action: 'definitions.delete', scope: 'global', name: 'review', expectedRevision: revision })).toMatchObject({ action: 'definitions.delete' })
    expect(parseMiraFlowWorkbenchRequest({ action: 'definitions.move', projectId: 'project', name: 'review', expectedRevision: revision })).toMatchObject({ action: 'definitions.move' })
    for (const value of [
      { action: 'definitions.delete', scope: 'project', name: 'review', expectedRevision: revision },
      { action: 'definitions.delete', scope: 'global', name: 'review' },
      { action: 'definitions.move', name: 'review', expectedRevision: revision },
      { action: 'definitions.move', projectId: 'project', name: '../review', expectedRevision: revision },
    ]) expect(() => parseMiraFlowWorkbenchRequest(value)).toThrow()
  })
})
