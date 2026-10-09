import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@earendil-works/pi-agent-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import type { HarnessEvent } from '../src/config/harness'

const resources: Array<{ root: string; database: PlatformDatabase; finish: () => void; run: Promise<unknown> }> = []
afterEach(async () => {
  for (const item of resources) item.finish()
  await Promise.allSettled(resources.map(item => item.run))
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const item of resources.splice(0)) { item.database.close(); rmSync(item.root, { recursive: true, force: true }) }
})

async function setup() {
  vi.useFakeTimers()
  const root = mkdtempSync(join(tmpdir(), 'mira-live-session-'))
  const database = new PlatformDatabase(root)
  const directory = join(root, 'project')
  mkdirSync(directory)
  const project = database.harness.createProject(directory)
  const session = database.harness.createSession(project.id)
  database.harness.renameSession(session.id, 'Snapshot test')
  database.models.save({ id: 'fixture', name: 'Fixture', endpoint: 'http://127.0.0.1:1/v1', authMode: 'none', models: [{ id: 'model', enabled: true, reasoning: true }], enabled: true })
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any)
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, value) => value)
  let notify!: (event: any) => void
  let started!: () => void
  let finish!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const pending = new Promise<void>(resolve => { finish = resolve })
  vi.spyOn(Agent.prototype, 'subscribe').mockImplementation(listener => { notify = event => { void listener(event, new AbortController().signal) }; return () => {} })
  vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async () => { started(); await pending })
  const events: HarnessEvent[] = []
  const sender: any = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => events.push(structuredClone(event)) }
  const run = runtime.runMessage(sender, session.id, 'Stream fixture', [], { providerId: 'fixture', modelId: 'model', thinkingLevel: 'medium' })
  resources.push({ root, database, finish, run })
  await ready
  notify({ type: 'message_start', message: { role: 'assistant' } })
  const update = (type: string, delta?: string, contentIndex = 0) => notify({ type: 'message_update', assistantMessageEvent: { type, delta, contentIndex } })
  const append = vi.spyOn(database.harness, 'appendAssistantDelta')
  return { database, runtime, events, sessionId: session.id, update, append, finish, run }
}

describe('on-demand authoritative assistant snapshots', () => {
  it('includes streamed thinking and text before the 250 ms write deadline without extra events', async () => {
    const fixture = await setup()
    fixture.update('thinking_start')
    fixture.update('thinking_delta', 'Public reasoning')
    fixture.update('thinking_end')
    fixture.update('text_delta', 'First reply', 1)
    expect(fixture.database.harness.getSession(fixture.sessionId).messages).toHaveLength(1)
    const eventCount = fixture.events.length
    const snapshot = fixture.runtime.getSession(fixture.sessionId)
    expect(snapshot.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'First reply', parts: [expect.objectContaining({ type: 'reasoning', text: 'Public reasoning' }), expect.objectContaining({ type: 'text', text: 'First reply' })] })
    expect(fixture.append).toHaveBeenCalledTimes(1)
    expect(fixture.events).toHaveLength(eventCount)
    expect(fixture.runtime.getSession(fixture.sessionId)).toEqual(snapshot)
    expect(fixture.append).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(250)
    expect(fixture.append).toHaveBeenCalledTimes(1)
    fixture.finish()
    await fixture.run
    expect(fixture.runtime.getSession(fixture.sessionId).messages.at(-1)?.id).toBe(snapshot.messages.at(-1)?.id)
  })

  it('retains ordinary 250 ms batching when no snapshot is requested and after a read', async () => {
    const fixture = await setup()
    fixture.update('text_delta', 'A')
    fixture.update('text_delta', 'B')
    await vi.advanceTimersByTimeAsync(249)
    expect(fixture.append).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fixture.append).toHaveBeenCalledTimes(1)
    expect(fixture.database.harness.getSession(fixture.sessionId).messages.at(-1)?.content).toBe('AB')
    fixture.update('text_delta', 'C')
    expect(fixture.runtime.getSession(fixture.sessionId).messages.at(-1)?.content).toBe('ABC')
    fixture.update('text_delta', 'D')
    fixture.update('text_delta', 'E')
    await vi.advanceTimersByTimeAsync(249)
    expect(fixture.append).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fixture.append).toHaveBeenCalledTimes(3)
    expect(fixture.database.harness.getSession(fixture.sessionId).messages.at(-1)?.content).toBe('ABCDE')
  })

  it.each(['completed', 'stopped', 'failed'] as const)('releases the snapshot callback when a run is %s', async outcome => {
    const fixture = await setup()
    fixture.update('text_delta', 'Final content')
    expect(fixture.runtime.getSession(fixture.sessionId).messages.at(-1)?.content).toBe('Final content')
    if (outcome === 'stopped') fixture.runtime.abort(fixture.sessionId)
    if (outcome === 'failed') {
      const agent = (fixture.runtime as any).runCoordinator.running.get(fixture.sessionId).agent
      agent.state.errorMessage = 'Fixture failure'
    }
    fixture.finish()
    if (outcome === 'failed') await expect(fixture.run).rejects.toThrow('Fixture failure')
    else await fixture.run
    expect((fixture.runtime as any).assistantSnapshotFlushers.size).toBe(0)
    expect(fixture.runtime.getSession(fixture.sessionId).messages.at(-1)?.run?.status).toBe(outcome)
  })

  it('does not invoke a pending snapshot callback for a missing or archived session', async () => {
    const fixture = await setup()
    const missing = vi.fn(), archived = vi.fn()
    const saved = fixture.database.harness.createSession()
    fixture.database.harness.archiveSessions([saved.id])
    const callbacks = (fixture.runtime as any).assistantSnapshotFlushers
    callbacks.set('missing-session', missing)
    callbacks.set(saved.id, archived)
    expect(() => fixture.runtime.getSession('missing-session')).toThrow('未找到会话')
    expect(fixture.runtime.getSession(saved.id).archivedAt).toEqual(expect.any(Number))
    expect(missing).not.toHaveBeenCalled()
    expect(archived).not.toHaveBeenCalled()
    callbacks.delete('missing-session')
    callbacks.delete(saved.id)
  })
})
