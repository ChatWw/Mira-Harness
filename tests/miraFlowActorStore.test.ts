import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MiraFlowActorStore } from '../electron/storage/miraFlowActorStore'

const paths: string[] = [], databases: Database.Database[] = []
afterEach(() => { for (const db of databases.splice(0)) if (db.open) db.close(); for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture(path = ':memory:') {
  const database = new Database(path); databases.push(database)
  const store = new MiraFlowActorStore(database); store.initialize()
  return { database, store }
}
const user = (content: string) => ({ role: 'user' as const, content, timestamp: 1 })

describe('durable independent workflow actor contexts', () => {
  it('preserves real message and tool shapes after close/reopen without sharing parent conversations', async () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'mira-flow-actor-store-'))); paths.push(directory)
    const path = join(directory, 'state.sqlite'), first = fixture(path)
    await first.store.loadOrCreate('actor')
    const context = { messages: [user('first'), { role: 'toolResult' as const, toolCallId: 'call', toolName: 'read', content: [{ type: 'text' as const, text: 'actual file' }], isError: false, timestamp: 2 }], resolvedModel: 'provider/model' }
    await first.store.save('actor', context); first.database.close()
    const second = fixture(path)
    expect(await second.store.loadOrCreate('actor')).toEqual(context)
    expect(await second.store.loadOrCreate('another')).toEqual({ messages: [] })
  })
  it('copies only the approved seed prefix and model pin, idempotently', async () => {
    const { store } = fixture()
    await store.loadOrCreate('source'); await store.save('source', { messages: [user('first'), user('later')], resolvedModel: 'p/m' })
    const seed = { sourceSessionId: 'source', messageCount: 1, resolvedModel: 'p/m' }
    expect(await store.loadOrCreate('target', seed)).toEqual({ messages: [user('first')], resolvedModel: 'p/m' })
    await store.save('target', { messages: [user('first'), user('target ask')], resolvedModel: 'p/m' })
    expect((await store.loadOrCreate('target', seed)).messages).toEqual([user('first'), user('target ask')])
    expect((await store.loadOrCreate('source')).messages).toEqual([user('first'), user('later')])
  })
  it('refuses nonexistent/truncated or differently pinned seeds and leaves no partial target', async () => {
    const { store, database } = fixture()
    await store.loadOrCreate('source'); await store.save('source', { messages: [user('first')], resolvedModel: 'p/m' })
    for (const seed of [{ sourceSessionId: 'missing', messageCount: 1 }, { sourceSessionId: 'source', messageCount: 2 }, { sourceSessionId: 'source', messageCount: -1 }, { sourceSessionId: 'source', messageCount: 0.5 }, { sourceSessionId: 'source', messageCount: 1, resolvedModel: 'different/model' }]) {
      await expect(store.loadOrCreate('target', seed)).rejects.toThrow()
      expect(database.prepare("SELECT 1 FROM mira_flow_actor_contexts WHERE session_id = 'target'").get()).toBeUndefined()
    }
  })
  it('rejects unknown-session saves and model changes without replacing stored transcripts', async () => {
    const { store } = fixture()
    await expect(store.save('missing', { messages: [] })).rejects.toThrow('不存在')
    await store.loadOrCreate('actor'); await store.save('actor', { messages: [user('original')], resolvedModel: 'p/m' })
    for (const resolvedModel of ['p/changed', undefined]) await expect(store.save('actor', { messages: [user('overwrite')], resolvedModel })).rejects.toThrow('不能切换')
    expect(await store.loadOrCreate('actor')).toEqual({ messages: [user('original')], resolvedModel: 'p/m' })
  })
})
