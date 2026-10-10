import { describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import type { HarnessMessageSubmissionOptions, HarnessQueuedMessage } from '../src/config/harness'
import { HarnessMessageQueue, type HarnessMessageQueueDependencies } from '../electron/services/harnessMessageQueue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const sender = {} as WebContents
const input = (submissionId = 'one', sessionId = 's'): Omit<HarnessQueuedMessage, 'id' | 'createdAt'> => ({
  submissionId, sessionId, text: submissionId, references: [{ path: 'a.txt', name: 'a.txt' }],
  selection: { providerId: 'p', modelId: 'm', thinkingLevel: 'high' }, planning: true, permissionMode: 'default',
})
const attachments = [{ path: 'a.txt', name: 'a.txt', content: 'frozen contents' }]
const scope = { projectId: 'project', workingDirectory: '/workspace' }
const recoverableError = '待发送消息执行失败，请重试或撤回后重新发送。'

function setup() {
  let running = false
  let blocked = false
  const deps: HarnessMessageQueueDependencies = {
    isRunning: vi.fn(() => running), blocked: vi.fn(() => blocked),
    reserve: vi.fn(() => Symbol('queue')), release: vi.fn(),
    currentRunId: vi.fn(() => running ? 'current-run' : undefined),
    preemptAndWait: vi.fn(async () => { running = false }),
    accept: vi.fn((_id, persist) => { persist?.() }),
    guideFallback: vi.fn(() => undefined),
    execute: vi.fn(async (_item, _attachments, _token, _sender, started) => { started(); return {} }),
    publish: vi.fn(), settled: vi.fn(),
  }
  const queue = new HarnessMessageQueue(deps)
  const submit = (id = 'one', session = 's') => queue.submit(sender, input(id, session), attachments, scope)
  return { queue, deps, submit, setRunning: (value: boolean) => { running = value }, setBlocked: (value: boolean) => { blocked = value } }
}

async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

describe('HarnessMessageQueue', () => {
  it('commits admission before ordinary ACK and replays without a second lifecycle commit', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const receipt = submit()
    expect(deps.accept).toHaveBeenCalledExactlyOnceWith('s')
    expect(queue.replay('s', 'one', input())).toMatchObject({ id: receipt.id })
    expect(submit().id).toBe(receipt.id)
    expect(deps.accept).toHaveBeenCalledOnce()
    setRunning(false); queue.onRunSettled('s', 'completed'); await flush()
    expect(deps.accept).toHaveBeenCalledOnce()
  })

  it('releases reservation without an item or receipt when durable ordinary admission fails', async () => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.accept!).mockImplementationOnce(() => { throw new Error('storage failed') })
    expect(() => submit()).toThrow(recoverableError)
    expect(queue.hasPending('s')).toBe(false)
    expect(queue.get('s').items).toEqual([])
    expect(queue.replay('s', 'one', input())).toBeUndefined()
    expect(deps.release).toHaveBeenCalledOnce()
    await flush(); expect(deps.execute).not.toHaveBeenCalled()
    submit(); await flush(); expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('admits immediate input with its persistence callback and rejects a failed commit without a receipt', async () => {
    const { queue, deps } = setup()
    const persist = vi.fn(), ready = deferred<void>()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _files, _token, _sender, started) => { await ready.promise; started(persist); return {} })
    vi.mocked(deps.accept!).mockImplementationOnce(() => { throw new Error('storage failed') })
    const options: HarnessMessageSubmissionOptions = { delivery: 'immediate', expectedRunId: null }
    const pending = queue.submit(sender, input(), attachments, scope, options)
    await flush(); expect(deps.accept).not.toHaveBeenCalled()
    ready.resolve()
    await expect(pending).rejects.toThrow(recoverableError)
    expect(persist).not.toHaveBeenCalled()
    expect(queue.hasPending('s')).toBe(false)
    expect(queue.replayWithOptions('s', 'one', input(), options)).toBeUndefined()
    expect(deps.release).toHaveBeenCalledOnce()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _files, _token, _sender, started) => { started(persist); return {} })
    const accepted = await queue.submit(sender, input(), attachments, scope, options)
    expect('id' in accepted).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
    expect(deps.accept).toHaveBeenLastCalledWith('s', persist)
  })

  it('keeps guidance pending and withdrawable before the engine stages it, replaying its actual delivery receipt', () => {
    const { queue, deps, setRunning } = setup()
    setRunning(true)
    const value = { ...input('guide'), planning: false, references: [] }
    const options: HarnessMessageSubmissionOptions = { delivery: 'guide', expectedRunId: 'current-run' }
    const receipt = queue.submit(sender, value, [], scope, options) as any
    expect(receipt).toMatchObject({ delivery: 'guide', queue: { items: [{ delivery: 'guide', requestedDelivery: 'guide', targetRunId: 'current-run' }] } })
    expect(queue.submit(sender, value, [], scope, options)).toMatchObject({ id: receipt.id, delivery: 'guide' })
    expect(deps.reserve).not.toHaveBeenCalled()
    expect(deps.preemptAndWait).not.toHaveBeenCalled()
    queue.withdraw('s', receipt.id)
    expect(queue.stageGuide('s', 'current-run')).toBeUndefined()
  })

  it('locks only the engine delivery boundary and removes the item only after successful public-message persistence', async () => {
    const { queue, deps, setRunning } = setup()
    setRunning(true)
    const receipt = queue.submit(sender, { ...input('guide'), planning: false, references: [] }, [], scope, { delivery: 'guide', expectedRunId: 'current-run' }) as any
    expect(queue.stageGuide('s', 'wrong')).toBeUndefined()
    expect(queue.stageGuide('s', 'current-run')?.item.id).toBe(receipt.id)
    expect(queue.get('s').promotingItemId).toBe(receipt.id)
    expect(() => queue.withdraw('s', receipt.id)).toThrow('已开始')
    expect(() => queue.reorder('s', receipt.id, null)).toThrow('已开始')
    await expect(queue.sendNow('s', receipt.id)).rejects.toThrow('正在提升')
    expect(queue.stageGuide('s', 'current-run')).toBeUndefined()
    const commit = vi.fn()
    expect(queue.consumeGuide('s', receipt.id, 'wrong', commit)).toBe(false)
    expect(() => queue.consumeGuide('s', receipt.id, 'current-run', () => { throw new Error('save failed') })).toThrow('save failed')
    expect(queue.get('s').items).toHaveLength(1)
    expect(queue.consumeGuide('s', receipt.id, 'current-run', commit)).toBe(true)
    expect(queue.consumeGuide('s', receipt.id, 'current-run', commit)).toBe(false)
    expect(commit).toHaveBeenCalledOnce()
    expect(queue.get('s').items).toEqual([])
    expect(deps.execute).not.toHaveBeenCalled()
  })

  it.each(['attachments', 'planning', 'model-mismatch', 'permission-mismatch', 'run-unavailable', 'confirmation'] as const)('explicitly falls back while retaining the entire frozen input (%s)', reason => {
    const { queue, deps, setRunning } = setup()
    setRunning(true)
    vi.mocked(deps.guideFallback!).mockReturnValue(reason)
    const value = input('guide')
    const receipt = queue.submit(sender, value, attachments, scope, { delivery: 'guide', expectedRunId: 'current-run' }) as any
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ ...value, requestedDelivery: 'guide', fallbackReason: reason }] } })
    expect(receipt.queue.items[0].delivery).toBeUndefined()
    expect(queue.stageGuide('s', 'current-run')).toBeUndefined()
    expect(deps.preemptAndWait).not.toHaveBeenCalled()
  })

  it.each(['aborted', 'failed', 'completed'] as const)('converts an unconsumed staged guide only after full idle and requires explicit resume (%s)', async status => {
    const { queue, deps, setRunning } = setup()
    setRunning(true)
    const receipt = queue.submit(sender, { ...input('guide'), planning: false, references: [] }, [], scope, { delivery: 'guide', expectedRunId: 'current-run' }) as any
    queue.stageGuide('s', 'current-run')
    queue.onRunSettled('s', status)
    expect(queue.get('s').items[0]?.delivery).toBe('guide')
    setRunning(false); queue.onRunSettled('s', status)
    expect(queue.get('s')).toMatchObject({ paused: status === 'aborted' ? 'stopped' : status === 'failed' ? 'failed' : 'confirmation', items: [{ id: receipt.id, requestedDelivery: 'guide', fallbackReason: 'run-ended' }] })
    expect(queue.get('s').items[0]?.delivery).toBeUndefined()
    expect(queue.get('s').promotingItemId).toBeUndefined()
    await flush(); expect(deps.execute).not.toHaveBeenCalled()
    queue.resume('s'); await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('requires an authoritative paused-queue choice without accepting, stopping or clearing anything', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true); submit('old'); queue.pause('s', 'stopped'); setRunning(false)
    const before = queue.get('s')
    expect(queue.submit(sender, input('new'), attachments, scope, {})).toEqual({ confirmationRequired: true, queue: before })
    expect(queue.get('s')).toEqual(before)
    expect(queue.replay('s', 'new', input('new'))).toBeUndefined()
    expect(deps.preemptAndWait).not.toHaveBeenCalled()
    await flush(); expect(deps.execute).not.toHaveBeenCalled()
  })

  it('rejects changed run identities and re-confirms stale complete queue identities before any mutation', () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true); const old = submit('old'); queue.pause('s', 'stopped'); setRunning(false); queue.onRunSettled('s', 'aborted')
    const before = queue.get('s')
    const options: HarnessMessageSubmissionOptions = { pausedQueueDecision: 'discard', expectedRunId: null, expectedQueueRevision: before.revision, expectedQueueItemIds: [old.id] }
    for (const change of [{ expectedQueueRevision: before.revision - 1 }, { expectedQueueItemIds: [] }, { expectedQueueItemIds: ['other'] }]) {
      expect(queue.submit(sender, input('new'), attachments, scope, { ...options, ...change })).toEqual({ confirmationRequired: true, queue: before })
    }
    expect(queue.submit(sender, input('new'), attachments, scope, { ...options, expectedRunId: 'old-run' })).toEqual({ retryRequired: true, queue: before })
    expect(queue.get('s')).toEqual(before)
    expect(deps.preemptAndWait).not.toHaveBeenCalled()
  })

  it('atomically retains a paused queue and freezes the new input while same-id requests share its admission', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true); const old = submit('old'); queue.pause('s', 'stopped'); setRunning(false); queue.onRunSettled('s', 'aborted')
    const snapshot = queue.get('s')
    const options: HarnessMessageSubmissionOptions = { pausedQueueDecision: 'retain', expectedRunId: null, expectedQueueRevision: snapshot.revision, expectedQueueItemIds: [old.id] }
    const ready = deferred<void>(), done = deferred<{}>()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _files, _token, _sender, started) => { await ready.promise; started(); return done.promise })
    const draft = input('new'), files = structuredClone(attachments), copiedScope = { ...scope }
    const accepted = queue.submit(sender, draft, files, copiedScope, options)
    expect(queue.submit(sender, structuredClone(draft), files, copiedScope, structuredClone(options))).toBe(accepted)
    expect(queue.replayWithOptions('s', 'new', draft, options)).toBe(accepted)
    expect(() => queue.submit(sender, { ...draft, text: 'Different' }, files, copiedScope, options)).toThrow('内容不同')
    expect(() => queue.withdraw('s', old.id)).toThrow('正在提升')
    expect(() => queue.reorder('s', old.id, null)).toThrow('正在提升')
    expect(() => submit('other')).toThrow('正在提升')
    draft.text = 'Changed'; draft.selection.modelId = 'Changed'; files[0]!.content = 'Changed'; copiedScope.workingDirectory = '/changed'; options.expectedQueueItemIds![0] = 'Changed'
    await flush()
    expect(deps.execute).toHaveBeenCalledWith(expect.objectContaining({ text: 'new', selection: expect.objectContaining({ modelId: 'm' }) }), attachments, expect.any(Symbol), sender, expect.any(Function), scope)
    expect(queue.get('s').items.map(item => item.id)).toEqual([old.id])
    ready.resolve()
    const receipt = await accepted
    expect('confirmationRequired' in receipt).toBe(false)
    if (!('id' in receipt)) throw new Error('Unexpected rejection')
    expect(receipt.queue).toMatchObject({ paused: 'stopped', items: [{ id: old.id }] })
    const original = { pausedQueueDecision: 'retain' as const, expectedRunId: null, expectedQueueRevision: snapshot.revision, expectedQueueItemIds: [old.id] }
    expect(await queue.submit(sender, input('new'), attachments, scope, original)).toMatchObject({ id: receipt.id })
    expect(deps.execute).toHaveBeenCalledOnce()
    expect(vi.mocked(deps.publish).mock.calls.every(([, state]) => state.items.every(item => item.submissionId !== 'new'))).toBe(true)
    done.resolve({}); await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'stopped', items: [{ id: old.id }] })
  })

  it('discards only the confirmed old queue after the new input actually starts', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true); const old = submit('old'); queue.pause('s', 'stopped'); setRunning(false); queue.onRunSettled('s', 'aborted')
    const snapshot = queue.get('s'), ready = deferred<void>(), done = deferred<{}>()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _files, _token, _sender, started) => { await ready.promise; started(); return done.promise })
    const accepted = queue.submit(sender, input('new'), attachments, scope, { pausedQueueDecision: 'discard', expectedRunId: null, expectedQueueRevision: snapshot.revision, expectedQueueItemIds: [old.id] })
    await flush(); expect(queue.get('s').items.map(item => item.id)).toEqual([old.id])
    ready.resolve(); const receipt = await accepted
    expect(receipt.queue.items).toEqual([])
    expect(receipt.queue.paused).toBeUndefined()
    done.resolve({}); await flush(); expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('keeps the previous queue and no new receipt when preparation fails before admission', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true); const old = submit('old'); queue.pause('s', 'stopped'); setRunning(false); queue.onRunSettled('s', 'aborted')
    const snapshot = queue.get('s')
    vi.mocked(deps.execute).mockRejectedValueOnce(new Error('请先选择一个可用模型'))
    const options: HarnessMessageSubmissionOptions = { pausedQueueDecision: 'discard', expectedRunId: null, expectedQueueRevision: snapshot.revision, expectedQueueItemIds: [old.id] }
    await expect(queue.submit(sender, input('new'), attachments, scope, options)).rejects.toThrow('请先选择一个可用模型')
    expect(queue.get('s').items.map(item => item.id)).toEqual([old.id])
    expect(queue.replayWithOptions('s', 'new', input('new'), options)).toBeUndefined()
    expect(queue.get('s').promotingItemId).toBeUndefined()
  })

  it('accepts a new immediate input only after old teardown, without ever enqueuing that input', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true); const old = submit('old')
    const teardown = deferred<void>(), done = deferred<{}>()
    vi.mocked(deps.preemptAndWait).mockImplementationOnce(async () => { await teardown.promise; setRunning(false) })
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _files, _token, _sender, started) => { started(); return done.promise })
    const options: HarnessMessageSubmissionOptions = { delivery: 'immediate', expectedRunId: 'current-run' }
    const accepted = queue.submit(sender, input('immediate'), attachments, scope, options)
    expect(queue.submit(sender, input('immediate'), attachments, scope, options)).toBe(accepted)
    await flush(); expect(deps.execute).not.toHaveBeenCalled()
    expect(queue.get('s').items.map(item => item.id)).toEqual([old.id])
    teardown.resolve(); await flush(); expect(deps.execute).not.toHaveBeenCalled()
    queue.onRunSettled('s', 'aborted')
    const receipt = await accepted
    expect(receipt.queue.items.map(item => item.id)).toEqual([old.id])
    expect(deps.execute).toHaveBeenCalledOnce()
    done.resolve({}); await flush(); expect(deps.execute).toHaveBeenCalledTimes(2)
    expect(queue.get('s').items).toEqual([])
  })

  it('blocks immediate submissions both before and after teardown when confirmation is pending', async () => {
    const { queue, deps, setBlocked, setRunning } = setup()
    setBlocked(true)
    expect(() => queue.submit(sender, input('new'), attachments, scope, { delivery: 'immediate', expectedRunId: null })).toThrow('处理当前任务的确认')
    expect(deps.preemptAndWait).not.toHaveBeenCalled()
    setBlocked(false); setRunning(true)
    vi.mocked(deps.preemptAndWait).mockImplementationOnce(async () => { setRunning(false); setBlocked(true) })
    await expect(queue.submit(sender, input('new'), attachments, scope, { delivery: 'immediate', expectedRunId: 'current-run' })).rejects.toThrow('处理当前任务的确认')
    expect(queue.get('s').items).toEqual([])
    expect(deps.execute).not.toHaveBeenCalled()
  })

  it('cancels an immediate draft without retaining it as a ghost queued input', async () => {
    const { queue, deps, setRunning } = setup()
    setRunning(true)
    const teardown = deferred<void>()
    vi.mocked(deps.preemptAndWait).mockImplementationOnce(async () => { await teardown.promise; setRunning(false) })
    const options: HarnessMessageSubmissionOptions = { delivery: 'immediate', expectedRunId: 'current-run' }
    const accepted = queue.submit(sender, input('new'), attachments, scope, options)
    const rejected = expect(accepted).rejects.toThrow('立即发送已取消')
    expect(queue.hasPending('s')).toBe(true)
    expect(queue.pendingSessionIds()).toEqual(['s'])
    expect(queue.cancelPromotion('s', 'current-run')).toBe(true)
    expect(queue.hasPending('s')).toBe(true)
    expect(queue.pendingSessionIds()).toEqual(['s'])
    teardown.resolve(); await rejected
    expect(queue.get('s').items).toEqual([])
    expect(queue.hasPending('s')).toBe(false)
    expect(queue.pendingSessionIds()).toEqual([])
    expect(queue.replayWithOptions('s', 'new', input('new'), options)).toBeUndefined()
    expect(deps.execute).not.toHaveBeenCalled()
  })

  it('reorders existing frozen entries before an anchor or to the end without resubmission', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const a = submit('a'), b = submit('b'), c = submit('c')
    expect(queue.reorder('s', c.id, a.id).items.map(item => item.id)).toEqual([c.id, a.id, b.id])
    expect(queue.reorder('s', c.id, null).items.map(item => item.id)).toEqual([a.id, b.id, c.id])
    const previous = queue.get('s')
    expect(queue.reorder('s', a.id, a.id)).toEqual(previous)
    expect(() => queue.reorder('s', b.id, 'missing')).toThrow('已开始或已撤回')
    expect(queue.get('s')).toEqual(previous)
    expect(queue.replay('s', 'b', input('b'))?.id).toBe(b.id)
    await flush()
    expect(deps.execute).not.toHaveBeenCalled()
  })

  it('reserves a promotion, waits real outer teardown, and admits its full frozen intent once', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const a = submit('a'), b = submit('b'), c = submit('c')
    const barrier = deferred<void>()
    vi.mocked(deps.preemptAndWait).mockImplementation(async () => { await barrier.promise; setRunning(false) })
    const run = deferred<{}>()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, started) => { started(); return run.promise })
    const promoted = queue.sendNow('s', c.id, 'current-run')
    await flush()
    expect(queue.get('s').items.map(item => item.id)).toEqual([a.id, b.id, c.id])
    expect(queue.get('s').promotingItemId).toBe(c.id)
    expect(vi.mocked(deps.publish).mock.calls.at(-1)?.[1].promotingItemId).toBe(c.id)
    expect(() => queue.withdraw('s', c.id)).toThrow('正在提升')
    expect(() => queue.reorder('s', c.id, a.id)).toThrow('正在提升')
    await expect(queue.sendNow('s', c.id, 'current-run')).rejects.toThrow('正在提升')
    expect(deps.execute).not.toHaveBeenCalled()
    barrier.resolve()
    await flush()
    expect(deps.execute).not.toHaveBeenCalled()
    queue.onRunSettled('s', 'aborted')
    const snapshot = await promoted
    expect(snapshot.items.map(item => item.id)).toEqual([a.id, b.id])
    expect(snapshot.paused).toBeUndefined()
    expect(snapshot.promotingItemId).toBeUndefined()
    expect(deps.execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ...input('c'), id: c.id }), attachments, expect.any(Symbol), sender, expect.any(Function), scope)
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
    run.resolve({})
    await flush()
    expect(vi.mocked(deps.execute).mock.calls.map(([item]) => item.submissionId)).toEqual(['c', 'a', 'b'])
    expect(deps.reserve).toHaveBeenCalledOnce()
    expect(deps.release).toHaveBeenCalledOnce()
  })

  it('waits the prior queue dispatch cleanup before executing a promoted item', async () => {
    const { queue, deps, submit, setRunning } = setup()
    const old = deferred<{ interrupted: boolean }>()
    const preempted = deferred<void>()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, started) => { setRunning(true); started(); return old.promise })
    const a = submit('a'), b = submit('b'), c = submit('c')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
    vi.mocked(deps.preemptAndWait).mockImplementation(async () => { await preempted.promise; setRunning(false) })
    const promoted = queue.sendNow('s', c.id, 'current-run')
    preempted.resolve()
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
    old.resolve({ interrupted: true })
    await promoted
    await flush()
    expect(vi.mocked(deps.execute).mock.calls.map(([item]) => item.id)).toEqual([a.id, c.id, b.id])
    expect(queue.get('s').paused).toBeUndefined()
  })

  it.each(['preemption', 'admission'] as const)('preserves the selected item at its original position if %s fails before start', async failure => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const a = submit('a'), b = submit('b'), c = submit('c')
    if (failure === 'preemption') vi.mocked(deps.preemptAndWait).mockRejectedValueOnce(new Error('Private failure /private/path key=secret'))
    else {
      vi.mocked(deps.preemptAndWait).mockImplementation(async () => { setRunning(false); queue.onRunSettled('s', 'aborted') })
      vi.mocked(deps.execute).mockRejectedValueOnce(new Error('工作目录已变化，请撤回消息后重新发送'))
    }
    await expect(queue.sendNow('s', c.id, 'current-run')).rejects.toThrow(failure === 'preemption' ? recoverableError : '工作目录已变化')
    expect(queue.get('s')).toMatchObject({ paused: 'failed' })
    expect(queue.get('s').items.map(item => item.id)).toEqual([a.id, b.id, c.id])
    expect(deps.release).toHaveBeenCalledOnce()
    expect(queue.replay('s', 'c', input('c'))?.id).toBe(c.id)
  })

  it('lets manual Stop cancel promotion during teardown and preserves unstarted input', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const a = submit('a'), b = submit('b')
    const barrier = deferred<void>()
    vi.mocked(deps.preemptAndWait).mockImplementation(async () => { await barrier.promise; setRunning(false); queue.onRunSettled('s', 'aborted') })
    const promoted = queue.sendNow('s', b.id, 'current-run')
    expect(queue.cancelPromotion('s', 'stale-run')).toBe(false)
    expect(queue.cancelPromotion('s', 'current-run')).toBe(true)
    queue.pause('s', 'stopped')
    barrier.resolve()
    await expect(promoted).rejects.toThrow('立即发送已取消')
    expect(deps.execute).not.toHaveBeenCalled()
    expect(queue.get('s')).toMatchObject({ paused: 'stopped', items: [{ id: a.id }, { id: b.id }] })
    expect(deps.release).toHaveBeenCalledOnce()
    const selected = await queue.sendNow('s', b.id)
    expect(selected.items.map(item => item.id)).toEqual([a.id])
    expect(selected.paused).toBe('stopped')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('rejects stale run identity, missing items and waiting approvals without changing queue order', async () => {
    const { queue, deps, submit, setRunning, setBlocked } = setup()
    setRunning(true)
    const a = submit('a'), b = submit('b')
    const previous = queue.get('s')
    await expect(queue.sendNow('s', b.id, 'old-run')).rejects.toThrow('当前任务已变化')
    await expect(queue.sendNow('s', 'missing')).rejects.toThrow('已开始或已撤回')
    setBlocked(true)
    await expect(queue.sendNow('s', a.id, 'current-run')).rejects.toThrow('请先处理当前任务的确认')
    expect(queue.get('s')).toEqual(previous)
    expect(deps.preemptAndWait).not.toHaveBeenCalled()
  })

  it('counts a preparing promoted item once at the 32-item pending bound and clears its promotion after Stop', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const receipts = Array.from({ length: 32 }, (_, index) => submit(String(index)))
    let started!: () => void
    const finish = deferred<{ interrupted: boolean }>()
    vi.mocked(deps.preemptAndWait).mockImplementation(async () => { setRunning(false); queue.onRunSettled('s', 'aborted') })
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, admit) => { started = admit; return finish.promise })
    const promoted = queue.sendNow('s', receipts[31]!.id, 'current-run')
    const rejected = expect(promoted).rejects.toThrow('立即发送已取消')
    await flush()
    expect(started).toBeTypeOf('function')
    expect(queue.get('s')).toMatchObject({ promotingItemId: receipts[31]!.id })
    expect(queue.get('s').items).toHaveLength(32)
    expect(() => submit('33rd')).toThrow('32 条上限')
    queue.withdraw('s', receipts[0]!.id)
    expect(() => submit('replacement')).not.toThrow()
    expect(queue.get('s').items).toHaveLength(32)
    queue.cancelPromotion('s')
    finish.resolve({ interrupted: true })
    await rejected
    expect(queue.get('s').promotingItemId).toBeUndefined()
    expect(queue.get('s').items.map(item => item.id).slice(0, 31)).toEqual(receipts.slice(1).map(item => item.id))
  })

  it('never restores an admitted promotion after execution fails and pauses the unchanged remaining intents', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const a = submit('a'), b = submit('b'), c = submit('c')
    const remainder = queue.get('s').items.slice(0, 2)
    const output = deferred<{}>()
    vi.mocked(deps.preemptAndWait).mockImplementation(async () => { setRunning(false); queue.onRunSettled('s', 'aborted') })
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, started) => { started(); return output.promise })
    const snapshot = await queue.sendNow('s', c.id, 'current-run')
    expect(snapshot.items).toEqual(remainder)
    output.reject(new Error('Private failure /private/key'))
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: recoverableError, items: remainder })
    expect(() => queue.withdraw('s', c.id)).toThrow('已开始或已撤回')
    expect(queue.replay('s', 'c', input('c'))?.id).toBe(c.id)
    await expect(queue.sendNow('s', c.id)).rejects.toThrow('已开始或已撤回')
    expect(deps.execute).toHaveBeenCalledOnce()
    expect(queue.get('s').items.map(item => item.id)).toEqual([a.id, b.id])
  })

  it('returns a synchronous receipt and reserves before execution enters history', async () => {
    const { queue, deps, submit } = setup()
    const receipt = submit()
    expect(receipt).not.toBeInstanceOf(Promise)
    expect(receipt.queue.items).toHaveLength(1)
    expect(deps.reserve).toHaveBeenCalledOnce()
    expect(deps.execute).not.toHaveBeenCalled()
    expect(queue.hasPending('s')).toBe(true)
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
    expect(queue.get('s').items).toEqual([])
    expect(queue.hasPending('s')).toBe(false)
    expect(deps.release).toHaveBeenCalledOnce()
  })

  it('waits for the previous outer run teardown, not merely isRunning becoming false', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    submit()
    await flush()
    expect(deps.execute).not.toHaveBeenCalled()
    setRunning(false)
    submit('two')
    await flush()
    expect(deps.execute).not.toHaveBeenCalled()
    expect(deps.reserve).toHaveBeenCalledOnce()
    queue.onRunSettled('s', 'completed')
    await flush()
    expect(deps.execute).toHaveBeenCalledTimes(2)
  })

  it('executes FIFO as independent turns, keeps the lane reserved between them, and never reenters', async () => {
    const { queue, deps, submit } = setup()
    const first = deferred<{}>()
    const second = deferred<{}>()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, started) => { started(); return first.promise })
      .mockImplementationOnce(async (_item, _refs, _token, _sender, started) => { started(); return second.promise })
    const firstReceipt = submit()
    submit('two')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
    expect(() => queue.withdraw('s', firstReceipt.id)).toThrow('已开始或已撤回')
    queue.onRunSettled('s', 'completed')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
    first.resolve({})
    await flush()
    expect(deps.execute).toHaveBeenCalledTimes(2)
    expect(vi.mocked(deps.execute).mock.calls.map(([item]) => item.text)).toEqual(['one', 'two'])
    expect(deps.release).not.toHaveBeenCalled()
    expect(deps.reserve).toHaveBeenCalledOnce()
    second.resolve({})
    await flush()
    expect(deps.release).toHaveBeenCalledOnce()
  })

  it('freezes references, attachment content, model selection, permission and project/root scope', async () => {
    const { queue, deps } = setup()
    const draft = input()
    const refs = structuredClone(attachments)
    const binding = { ...scope }
    const receipt = queue.submit(sender, draft, refs, binding)
    draft.text = 'changed'
    draft.references[0]!.path = 'changed.txt'
    draft.selection.modelId = 'other'
    refs[0]!.content = 'changed'
    binding.workingDirectory = '/other'
    receipt.queue.items[0]!.text = 'mutated receipt'
    await flush()
    expect(deps.execute).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'one', references: [{ path: 'a.txt', name: 'a.txt' }], selection: { providerId: 'p', modelId: 'm', thinkingLevel: 'high' }, planning: true, permissionMode: 'default' }),
      attachments, expect.any(Symbol), sender, expect.any(Function), scope,
    )
  })

  it('deduplicates accepted input before and after execution and rejects changed payloads', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const first = submit()
    const retry = submit()
    expect(retry.id).toBe(first.id)
    expect(queue.get('s').items).toHaveLength(1)
    expect(() => queue.submit(sender, { ...input(), text: 'changed' }, attachments, scope)).toThrow('已存在且内容不同')
    expect(() => queue.submit(sender, { ...input(), references: [{ path: 'other.txt', name: 'other.txt' }] }, attachments, scope)).toThrow('已存在且内容不同')
    expect(() => queue.submit(sender, { ...input(), selection: { providerId: 'p', modelId: 'other' } }, attachments, scope)).toThrow('已存在且内容不同')
    setRunning(false)
    queue.onRunSettled('s', 'completed')
    await flush()
    expect(submit().id).toBe(first.id)
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('replays before resolving changed server dependencies and keeps the first accepted snapshot', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const accepted = submit()
    expect(queue.replay('s', 'one', input())).toMatchObject({ id: accepted.id })
    expect(queue.replay('s', 'new', input('new'))).toBeUndefined()
    expect(() => queue.replay('other-session', 'one', input())).toThrow('已存在且内容不同')
    const retry = queue.submit(sender, { ...input(), permissionMode: 'full' }, [], { projectId: 'other', workingDirectory: '/moved' })
    expect(retry.id).toBe(accepted.id)
    setRunning(false)
    queue.onRunSettled('s', 'completed')
    await flush()
    expect(deps.execute).toHaveBeenCalledWith(expect.objectContaining({ permissionMode: 'default' }), attachments, expect.any(Symbol), sender, expect.any(Function), scope)
  })

  it('ignores selection and scope property insertion order for duplicate submissions', () => {
    const { queue, submit } = setup()
    const receipt = submit()
    const draft = input()
    draft.selection = { thinkingLevel: 'high', modelId: 'm', providerId: 'p' }
    expect(queue.submit(sender, draft, attachments, { workingDirectory: '/workspace', projectId: 'project' }).id).toBe(receipt.id)
  })

  it('limits each session to 32 pending items without consuming a receipt for rejection', () => {
    const { queue, submit, setRunning } = setup()
    setRunning(true)
    const receipts = Array.from({ length: 32 }, (_, index) => submit(`item-${index}`))
    expect(() => submit('overflow')).toThrow('32')
    expect(queue.get('s').items).toHaveLength(32)
    queue.withdraw('s', receipts[0]!.id)
    expect(submit('overflow').queue.items).toHaveLength(32)
  })

  it.each([false, true])('counts an active preflight as pending until it is admitted to history, started=%s', async started => {
    const { queue, deps, submit } = setup()
    const first = deferred<{}>()
    let admit!: () => void
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _attachments, _token, _sender, callback) => { admit = callback; return first.promise })
    const receipt = submit()
    await flush()
    for (let index = 0; index < 31; index++) submit(`item-${index}`)
    expect(() => submit('overflow')).toThrow('32')
    if (started) {
      admit()
      expect(submit('overflow').queue.items).toHaveLength(32)
    }
    first.reject(new Error('Preflight failed'))
    await flush()
    expect(queue.get('s').items).toHaveLength(32)
    expect(queue.get('s').items.some(item => item.id === receipt.id)).toBe(!started)
    expect(queue.get('s').paused).toBe('failed')
  })

  it('bounds settled receipts at 64 while retaining deduplication for older pending entries', async () => {
    const { queue, submit, setRunning } = setup()
    setRunning(true)
    const original = submit('old', 'held')
    setRunning(false)
    for (let index = 0; index < 65; index++) { submit(`done-${index}`, `session-${index}`); await flush() }
    expect((queue as any).receipts.size).toBe(64)
    expect(submit('old', 'held').id).toBe(original.id)
    expect(queue.get('held').items).toHaveLength(1)
  })

  it('withdraws only a pending stable ID and returns all original Composer fields', () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const receipt = submit()
    const withdrawal = queue.withdraw('s', receipt.id)
    expect(withdrawal.item).toMatchObject(input())
    expect(withdrawal.queue.items).toEqual([])
    expect(withdrawal.queue.revision).toBeGreaterThan(receipt.queue.revision)
    expect(queue.pendingSessionIds()).toEqual([])
    expect(deps.release).toHaveBeenCalledOnce()
    expect(() => queue.withdraw('s', receipt.id)).toThrow('已开始或已撤回')
    expect(submit().id).toBe(receipt.id)
    expect(queue.get('s').items).toEqual([])
  })

  it('restores an unstarted failed item to the head, pauses it, and allows withdrawal', async () => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.execute).mockRejectedValueOnce(new Error('当前 Agent 模型不可用，请检查 Provider 配置'))
    const one = submit()
    submit('two')
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: '当前 Agent 模型不可用，请检查 Provider 配置', items: [{ id: one.id }, { text: 'two' }] })
    expect(deps.execute).toHaveBeenCalledOnce()
    expect(deps.release).toHaveBeenCalledOnce()
    expect(queue.withdraw('s', one.id).item.text).toBe('one')
    queue.resume('s')
    await flush()
    expect(vi.mocked(deps.execute).mock.calls.map(([item]) => item.text)).toEqual(['one', 'two'])
  })

  it('never puts an already-started failed item back into the queue', async () => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, started) => { started(); throw new Error('Network failed') })
    const first = submit()
    submit('two')
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', items: [{ text: 'two' }] })
    expect(() => queue.withdraw('s', first.id)).toThrow('已开始或已撤回')
    queue.resume('s')
    await flush()
    expect(vi.mocked(deps.execute).mock.calls.map(([item]) => item.text)).toEqual(['one', 'two'])
  })

  it.each(['aborted', 'failed'] as const)('pauses accepted backlog after an old run is %s and does not resume on a later completed event', async status => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    submit()
    setRunning(false)
    queue.onRunSettled('s', status)
    await flush()
    expect(queue.get('s').paused).toBe(status === 'aborted' ? 'stopped' : 'failed')
    expect(deps.release).toHaveBeenCalledOnce()
    queue.onRunSettled('s', 'completed')
    submit('two')
    await flush()
    expect(deps.execute).not.toHaveBeenCalled()
    queue.resume('s')
    await flush()
    expect(deps.execute).toHaveBeenCalledTimes(2)
  })

  it('pauses future inputs when the active queued turn returns interrupted', async () => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, started) => { started(); return { interrupted: true } })
    submit()
    submit('two')
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'stopped', items: [{ text: 'two' }] })
    expect(deps.execute).toHaveBeenCalledOnce()
    queue.resume('s')
    await flush()
    expect(deps.execute).toHaveBeenCalledTimes(2)
  })

  it('restores the same pending item when Stop interrupts preparation before history admission', async () => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.execute).mockResolvedValueOnce({ interrupted: true })
    const first = submit()
    submit('two')
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'stopped', items: [{ id: first.id }, { text: 'two' }] })
    expect(deps.execute).toHaveBeenCalledOnce()
    expect(deps.release).toHaveBeenCalledOnce()
    queue.resume('s')
    await flush()
    expect(vi.mocked(deps.execute).mock.calls.map(([item]) => item.text)).toEqual(['one', 'one', 'two'])
    expect(vi.mocked(deps.execute).mock.calls[1]![0].id).toBe(first.id)
  })

  it('releases the lane for a confirmation and requires an explicit unblocked resume', async () => {
    const { queue, deps, submit, setBlocked } = setup()
    setBlocked(true)
    submit()
    await flush()
    expect(queue.get('s').paused).toBe('confirmation')
    expect(deps.release).toHaveBeenCalledOnce()
    expect(deps.execute).not.toHaveBeenCalled()
    expect(queue.hasPending('s')).toBe(true)
    expect(() => queue.resume('s')).toThrow('处理当前任务的确认')
    setBlocked(false)
    queue.onRunSettled('s', 'completed')
    await flush()
    expect(deps.execute).not.toHaveBeenCalled()
    queue.resume('s')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('does not promote the next item when a completed turn created a pending interaction', async () => {
    const { queue, deps, submit, setBlocked } = setup()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, started) => { started(); setBlocked(true); return {} })
    submit()
    submit('two')
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'confirmation', items: [{ text: 'two' }] })
    expect(deps.execute).toHaveBeenCalledOnce()
    expect(deps.release).toHaveBeenCalledOnce()
  })

  it('clears an empty paused queue so a new submission can start normally', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const first = submit()
    queue.pause('s', 'stopped')
    queue.withdraw('s', first.id)
    setRunning(false)
    queue.onRunSettled('s', 'aborted')
    expect(queue.get('s').paused).toBeUndefined()
    submit('new')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('publishes final queue/reservation state before notifying public completion', async () => {
    const { queue, deps, submit } = setup()
    const observations: unknown[] = []
    vi.mocked(deps.settled).mockImplementation(sessionId => { observations.push({ pending: queue.hasPending(sessionId), released: vi.mocked(deps.release).mock.calls.length, snapshot: queue.get(sessionId) }) })
    submit()
    await flush()
    expect(observations).toEqual([{ pending: false, released: 1, snapshot: expect.objectContaining({ items: [] }) }])
    expect(deps.publish).toHaveBeenLastCalledWith(sender, expect.objectContaining({ items: [] }))
  })

  it.each(['release', 'settled'] as const)('does not leave internal processing busy when %s cleanup throws', async method => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps[method]).mockImplementationOnce(() => { throw new Error('Cleanup failed') })
    submit()
    await flush()
    expect(queue.hasPending('s')).toBe(false)
    submit('retry')
    await flush()
    expect(deps.execute).toHaveBeenCalledTimes(2)
    expect(queue.hasPending('s')).toBe(false)
  })

  it('retains the failed cleanup backlog for explicit retry and does not duplicate its first turn', async () => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.settled).mockImplementationOnce(() => { throw new Error('Observer failed') })
    submit()
    submit('two')
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: recoverableError, items: [{ text: 'two' }] })
    expect(deps.release).toHaveBeenCalledOnce()
    queue.resume('s')
    await flush()
    expect(vi.mocked(deps.execute).mock.calls.map(([item]) => item.text)).toEqual(['one', 'two'])
  })

  it('retains and releases an acknowledged item when the session disappears before dispatch', async () => {
    const { queue, deps, submit } = setup()
    const receipt = submit()
    vi.mocked(deps.blocked).mockImplementationOnce(() => { throw new Error('未找到会话') })
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: '未找到会话', items: [{ id: receipt.id }] })
    expect(deps.execute).not.toHaveBeenCalled()
    expect(deps.release).toHaveBeenCalledWith('s', vi.mocked(deps.reserve).mock.results[0]!.value)
    expect(deps.settled).toHaveBeenCalledOnce()
    expect(deps.publish).toHaveBeenLastCalledWith(sender, queue.get('s'))
    expect(queue.withdraw('s', receipt.id).item).toMatchObject(input())
  })

  it('handles a failed running lookup after admission and permits an explicit retry', async () => {
    const { queue, deps, submit } = setup()
    const receipt = submit()
    vi.mocked(deps.isRunning).mockImplementationOnce(() => { throw new Error('lookup /Users/private/config api-key=fake-secret') })
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: recoverableError, items: [{ id: receipt.id }] })
    expect(deps.release).toHaveBeenCalledOnce()
    expect(deps.execute).not.toHaveBeenCalled()
    queue.resume('s')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('does not mask the completed run when its queued session lookup throws', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const receipt = submit()
    setRunning(false)
    vi.mocked(deps.blocked).mockImplementation(() => { throw new Error('deleted /private/session.json token=fake-token') })
    expect(() => queue.onRunSettled('s', 'completed')).not.toThrow()
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: recoverableError, items: [{ id: receipt.id }] })
    expect(deps.release).toHaveBeenCalledOnce()
    expect(deps.settled).toHaveBeenCalledOnce()
    expect(deps.execute).not.toHaveBeenCalled()
  })

  it('attempts public completion even when failed-session lookup and lease cleanup both throw', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const receipt = submit()
    setRunning(false)
    vi.mocked(deps.blocked).mockImplementationOnce(() => { throw new Error('未找到会话') })
    vi.mocked(deps.release).mockImplementationOnce(() => { throw new Error('/private/lease api-key=fake-secret') })
    expect(() => queue.onRunSettled('s', 'completed')).not.toThrow()
    expect(deps.settled).toHaveBeenCalledOnce()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: recoverableError, items: [{ id: receipt.id }] })
    queue.resume('s')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
    expect(queue.hasPending('s')).toBe(false)
  })

  it('does not let a completion observer mask a legacy run or start the accepted backlog', async () => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const receipt = submit()
    setRunning(false)
    vi.mocked(deps.settled).mockImplementationOnce(() => { throw new Error('/Users/private/observer token=fake-token') })
    expect(() => queue.onRunSettled('s', 'completed')).not.toThrow()
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: recoverableError, items: [{ id: receipt.id }] })
    expect(deps.release).toHaveBeenCalledOnce()
    expect(deps.execute).not.toHaveBeenCalled()
    queue.resume('s')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('handles a completion observer failure with no existing queue', () => {
    const { queue, deps } = setup()
    vi.mocked(deps.settled).mockImplementationOnce(() => { throw new Error('Observer failed') })
    expect(() => queue.onRunSettled('s', 'failed')).not.toThrow()
    expect(queue.get('s')).toEqual({ sessionId: 's', revision: 0, items: [] })
  })

  it('retains the unstarted head when dispatch reservation fails', async () => {
    const { queue, deps, submit } = setup()
    const receipt = submit()
    const state = (queue as any).sessions.get('s')
    deps.release('s', state.token)
    state.token = undefined
    vi.mocked(deps.reserve).mockImplementationOnce(() => { throw new Error('reservation /Users/private token=fake-token') })
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: recoverableError, items: [{ id: receipt.id }] })
    expect(deps.execute).not.toHaveBeenCalled()
    expect(deps.settled).toHaveBeenCalledOnce()
    queue.resume('s')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('rejects failed reservation before ACK without leaving a receipt or an accepted item', async () => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.reserve).mockImplementationOnce(() => { throw new Error('reserve /private/workspace api-key=fake-secret') })
    expect(() => submit()).toThrow(recoverableError)
    expect(queue.hasPending('s')).toBe(false)
    expect(queue.replay('s', 'one', input())).toBeUndefined()
    submit()
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('releases pre-ACK reservation if the following running check fails', () => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.isRunning).mockImplementationOnce(() => { throw new Error('/private/storage db-password=fake-secret') })
    expect(() => submit()).toThrow(recoverableError)
    expect(queue.get('s').items).toEqual([])
    expect(deps.release).toHaveBeenCalledOnce()
    expect(queue.replay('s', 'one', input())).toBeUndefined()
  })

  it.each(['blocked', 'reserve'] as const)('retains a paused item if resume %s dependency fails', async method => {
    const { queue, deps, submit, setRunning } = setup()
    setRunning(true)
    const receipt = submit()
    queue.pause('s', 'stopped')
    setRunning(false)
    vi.mocked(deps[method]).mockImplementationOnce(() => { throw new Error('resume /private/settings api-key=fake-secret') })
    expect(() => queue.resume('s')).toThrow(recoverableError)
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: recoverableError, items: [{ id: receipt.id }] })
    expect(deps.execute).not.toHaveBeenCalled()
    queue.resume('s')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it.each([false, true])('redacts sensitive execution failures with started=%s without duplicating admitted history', async started => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, admit) => {
      if (started) admit()
      throw new Error('当前 Agent 模型不可用，请检查 Provider 配置 /Users/private/api-key=fake-secret')
    })
    submit()
    submit('two')
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: recoverableError })
    expect(queue.get('s').items.map(item => item.text)).toEqual(started ? ['two'] : ['one', 'two'])
    expect(deps.release).toHaveBeenCalledOnce()
    expect(deps.settled).toHaveBeenCalledOnce()
    for (const [, snapshot] of vi.mocked(deps.publish).mock.calls) expect(snapshot.error ?? '').not.toMatch(/private|fake-secret|api-key/)
  })

  it.each(['工作目录已变化，请撤回消息后重新发送', '目标会话不可用', '所选模型不属于当前供应商'])('preserves only an exact known host business failure: %s', async message => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.execute).mockRejectedValueOnce(new Error(message))
    const receipt = submit()
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'failed', error: message, items: [{ id: receipt.id }] })
  })

  it('sanitizes externally supplied pause reasons before putting them in snapshots', () => {
    const { queue, submit, setRunning } = setup()
    setRunning(true)
    submit()
    queue.pause('s', 'failed', 'filesystem /Users/private api-key=fake-secret')
    expect(queue.get('s').error).toBe(recoverableError)
  })

  it('keeps backlog stopped when Stop occurs while its active queued turn is settling', async () => {
    const { queue, deps, submit } = setup()
    const completion = deferred<{}>()
    vi.mocked(deps.execute).mockImplementationOnce(async (_item, _refs, _token, _sender, started) => { started(); return completion.promise })
    submit()
    const pending = submit('two')
    await flush()
    queue.pause('s', 'stopped')
    queue.onRunSettled('s', 'aborted')
    completion.resolve({})
    await flush()
    expect(queue.get('s')).toMatchObject({ paused: 'stopped', items: [{ id: pending.id }] })
    expect(deps.execute).toHaveBeenCalledOnce()
    expect(deps.release).toHaveBeenCalledOnce()
    queue.onRunSettled('s', 'completed')
    await flush()
    expect(deps.execute).toHaveBeenCalledOnce()
    queue.resume('s')
    await flush()
    expect(deps.execute).toHaveBeenCalledTimes(2)
  })

  it('cannot let a detached renderer reject admitted input or stall processing', async () => {
    const { queue, deps, submit } = setup()
    vi.mocked(deps.publish).mockImplementation(() => { throw new Error('Renderer destroyed') })
    expect(() => submit()).not.toThrow()
    await flush()
    expect(queue.hasPending('s')).toBe(false)
    expect(deps.execute).toHaveBeenCalledOnce()
  })

  it('keeps independent session queues and reports only pending sessions', async () => {
    const { queue, submit, setRunning } = setup()
    setRunning(true)
    const first = submit('one', 'first')
    submit('two', 'second')
    expect(queue.pendingSessionIds()).toEqual(['first', 'second'])
    queue.withdraw('first', first.id)
    expect(queue.pendingSessionIds()).toEqual(['second'])
    expect(queue.get('unknown')).toEqual({ sessionId: 'unknown', revision: 0, items: [] })
  })
})
