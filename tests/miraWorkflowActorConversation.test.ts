import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { WebContents } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraFlowController, type MiraFlowControllerRuntime } from '../electron/services/flows/miraFlowController'
import { miraFlowConversationLimits } from '../electron/storage/miraFlowActorStore'
import { parseMiraFlowWorkbenchRequest, type MiraFlowActorConversationPage } from '../src/config/miraFlowWorkbench'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'mira-actor-conversation-'))), paths = new MiraPaths(home), database = new PlatformDatabase(paths)
  const parent = database.harness.createSession(), foreign = database.harness.createSession()
  const runtime: MiraFlowControllerRuntime = { assertFlowAdmission: vi.fn(), setWorkflowActivityGuard: vi.fn(), prepareMiraFlowDriver: vi.fn(), publishMiraFlowEvent: vi.fn() }
  const controller = new MiraFlowController({ database, paths, runtime, resourceRoot: resolve('dist/mira-flow-host') })
  cleanups.push(async () => { await controller.dispose(); database.close(); rmSync(home, { recursive: true, force: true }) })
  database.flowJournal.createRun({ runId: 'run', parentSessionId: parent.id, caps: { maxConcurrency: 1 }, spentTokens: 0, status: 'completed' })
  database.flowJournal.putActor({ runId: 'run', siteId: 'agent#1', ordinal: 1, name: '核验助手', sessionId: 'private-internal-actor' })
  const request = { action: 'actors.conversation' as const, sessionId: parent.id, runId: 'run', siteId: 'agent#1', ordinal: 1 }
  const read = (input = request, authorize?: () => void) => controller.request({} as WebContents, parseMiraFlowWorkbenchRequest(input), authorize) as Promise<MiraFlowActorConversationPage>
  return { database, parent, foreign, controller, request, read, store: database.flowActors }
}
const user = (content: string) => ({ role: 'user' as const, content, timestamp: 1 })
describe('journal-owned workflow actor conversation reads', () => {
  it('accepts actor keys and pagination, never renderer session ids, host paths or invalid cursors', () => {
    const base = { action: 'actors.conversation', sessionId: 'parent', runId: 'run', siteId: 'agent#1', ordinal: 1 }
    expect(parseMiraFlowWorkbenchRequest({ ...base, offset: 0, limit: 100 })).toMatchObject(base)
    for (const change of [{ actorSessionId: 'secret' }, { path: '/tmp/secret' }, { ordinal: 0 }, { ordinal: .5 }, { siteId: '../private' }, { limit: 101 }, { limit: 0 }, { offset: -1 }, { offset: .5 }]) expect(() => parseMiraFlowWorkbenchRequest({ ...base, ...change })).toThrow('请求无效')
  })
  it('reads actual persisted Pi roles without returning internal ids, model config, signatures or credentials', async () => {
    const view = fixture()
    await view.store.loadOrCreate('private-internal-actor')
    await view.store.save('private-internal-actor', { resolvedModel: 'provider/model', messages: [user('检查文件'), {
      role: 'assistant', content: [{ type: 'thinking', thinking: '核验内容', thinkingSignature: 'PRIVATE-SIGNATURE' }, { type: 'text', text: '实际回复' }, { type: 'toolCall', id: 'call', name: 'read', arguments: { path: 'README.md', apiKey: 'DO-NOT-SHOW' } }],
      timestamp: 2, provider: 'p', model: 'm', api: 'openai-completions', stopReason: 'toolUse', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    }, { role: 'toolResult', toolName: 'read', toolCallId: 'call', content: [{ type: 'text', text: '{"authorization":"Bearer SECRET-CREDENTIAL"}' }], details: { access_token: 'DETAILS-SECRET' }, isError: true, timestamp: 3 }] })
    const page = await view.read()
    expect(page).toMatchObject({ state: 'available', actorName: '核验助手', total: 3, nextOffset: 3, hasMore: false })
    expect(page.messages.map(message => message.role)).toEqual(['user', 'assistant', 'toolResult'])
    expect(page.messages[1]!.parts.map(part => part.kind)).toEqual(['thinking', 'text', 'tool-call'])
    expect(page.messages[2]!.parts[0]).toMatchObject({ kind: 'tool-result', toolName: 'read', toolCallId: 'call', isError: true })
    const serialized = JSON.stringify(page)
    for (const secret of ['private-internal-actor', 'provider/model', 'PRIVATE-SIGNATURE', 'DO-NOT-SHOW', 'SECRET-CREDENTIAL', 'DETAILS-SECRET']) expect(serialized).not.toContain(secret)
    expect(serialized).toContain('README.md')
    expect(serialized).toContain('已隐藏')
  })
  it('requires the existing parent/run/actor and never creates missing transcripts', async () => {
    const view = fixture()
    await expect(view.read({ ...view.request, sessionId: view.foreign.id })).rejects.toThrow()
    await expect(view.read({ ...view.request, ordinal: 2 })).rejects.toThrow('智能体不存在')
    await expect(view.read()).rejects.toThrow('对话记录不可读取')
    expect(view.store.readConversation('private-internal-actor')).toBeUndefined()
    view.database.flowJournal.putActor({ runId: 'run', siteId: 'agent#2', ordinal: 1, name: '等待助手' })
    expect(await view.read({ ...view.request, siteId: 'agent#2' })).toMatchObject({ state: 'not-started', messages: [], total: 0 })
  })
  it('guards authorization immediately before actual store read and before releasing the result', async () => {
    const view = fixture(), spy = vi.spyOn(view.store, 'readConversation')
    await view.store.loadOrCreate('private-internal-actor')
    let calls = 0
    await expect(view.read(view.request, () => { if (++calls === 2) throw new Error('revoked') })).rejects.toThrow('revoked')
    expect(spy).not.toHaveBeenCalled()
    calls = 0
    await expect(view.read(view.request, () => { if (++calls === 3) throw new Error('revoked') })).rejects.toThrow('revoked')
    expect(spy).toHaveBeenCalledOnce()
  })
  it('paginates real records without skipping and bounds large unicode messages and serialized pages', async () => {
    const view = fixture()
    await view.store.loadOrCreate('private-internal-actor')
    await view.store.save('private-internal-actor', { messages: Array.from({ length: 20 }, (_, index) => user(`消息${index}\n${'长🙂'.repeat(30000)}`)) })
    let offset = 0
    const indexes: number[] = []
    do {
      const page = view.store.readConversation('private-internal-actor', offset, 100)!
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(miraFlowConversationLimits.pageBytes)
      for (const message of page.messages) { expect(Buffer.byteLength(JSON.stringify(message))).toBeLessThanOrEqual(miraFlowConversationLimits.messageBytes); expect(message.truncated).toBe(true); indexes.push(message.index) }
      expect(page.nextOffset).toBeGreaterThan(offset)
      offset = page.nextOffset
      if (!page.hasMore) break
    } while (offset < 20)
    expect(indexes).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(() => view.store.readConversation('private-internal-actor', 21)).toThrow('对话已变化')
    expect(view.store.readConversation('private-internal-actor', 20)).toMatchObject({ total: 20, hasMore: false, messages: [] })
  })
})
