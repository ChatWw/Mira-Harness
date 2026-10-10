import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { HarnessStore } from '../electron/storage/harnessStore'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import { assertHarnessAttachmentTotals, decodeHarnessAttachmentImport, HARNESS_ATTACHMENT_LIMITS, harnessAttachmentFromBytes } from '../electron/services/harnessAttachmentContent'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+sMioAAAAASUVORK5CYII=', 'base64')
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const cleanups: Array<() => void> = []
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()) })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mira-attachments-'))
  const database = new Database(join(root, 'state.sqlite'))
  database.exec(`
    CREATE TABLE harness_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'FolderOpened', directory TEXT NOT NULL UNIQUE, default_model_provider_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_session_at INTEGER);
    CREATE TABLE harness_sessions (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, model_provider_id TEXT, model_id TEXT, permission_mode TEXT NOT NULL, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0, archived_at INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL, working_directory TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE harness_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  cleanups.push(() => { database.close(); rmSync(root, { recursive: true, force: true }) })
  const store = new HarnessStore(database, root)
  const session = store.createSession()
  return { root, database, store, session }
}

function input(name = 'image.png', bytes = PNG, mediaType = 'image/png') {
  return { name, mediaType, data: bytes.toString('base64') }
}

function restartFixture() {
  const root = mkdtempSync(join(tmpdir(), 'mira-attachment-restart-'))
  let platform = new PlatformDatabase(root)
  const preferenceKey = 'first-party.mira-harness.harness-react-composer-drafts'
  cleanups.push(() => { platform.close(); rmSync(root, { recursive: true, force: true }) })
  return {
    root, preferenceKey,
    get platform() { return platform },
    restart() { platform.close(); platform = new PlatformDatabase(root); return platform },
    rawPreference(value: string) {
      const database = new Database(new MiraPaths(root).stateDatabase())
      try { database.prepare('INSERT OR REPLACE INTO preferences(key, value) VALUES (?, ?)').run(preferenceKey, value) } finally { database.close() }
    },
    mutateRaw(fn: (database: Database.Database) => void) {
      const database = new Database(new MiraPaths(root).stateDatabase())
      try { fn(database) } finally { database.close() }
    },
  }
}

function pngWithTextBytes(size: number) {
  const chunkData = Buffer.alloc(size - PNG.length - 12, 65)
  Buffer.from('Mira\0').copy(chunkData)
  const type = Buffer.from('tEXt'), length = Buffer.alloc(4), crc = Buffer.alloc(4)
  length.writeUInt32BE(chunkData.length)
  crc.writeUInt32BE(crc32(chunkData, crc32(type)))
  return Buffer.concat([PNG.subarray(0, -12), length, type, chunkData, crc, PNG.subarray(-12)])
}

describe('Harness attachment content admission', () => {
  it.each([[PNG, 'image/png'], [GIF, 'image/gif']] as const)('derives %s media from bytes despite a false client MIME', (bytes, mediaType) => {
    expect(harnessAttachmentFromBytes('p', 'renamed.bin', bytes, 'text/plain')).toEqual({ path: 'p', name: 'renamed.bin', content: bytes.toString('base64'), mediaType, size: bytes.length })
  })

  it('rejects a claimed image with false magic or a truncated real container', () => {
    expect(() => harnessAttachmentFromBytes('p', 'a.png', Buffer.from('fake image'), 'image/png')).toThrow('图片附件签名无效')
    expect(() => harnessAttachmentFromBytes('p', 'a.png', PNG.subarray(0, 30))).toThrow('图片附件内容不完整')
  })

  it.each(['aGVsbG8', 'aGVsbG8=\n', 'aGVsbG8===', 'aGVs=bG8', 'Zh==', 'data:text/plain;base64,aGVsbG8='])('rejects noncanonical base64 %s before storing any content', data => {
    expect(() => decodeHarnessAttachmentImport({ name: 'n.txt', mediaType: 'text/plain', data })).toThrow('规范的 base64')
  })

  it('retains UTF-8 text while rejecting non-text control bytes and malformed UTF-8', () => {
    const text = '\ufeffMira\n中文\t文本\r\n'
    expect(harnessAttachmentFromBytes('p', 'a.txt', Buffer.from(text)).content).toBe(text)
    for (const bytes of [Buffer.from([0]), Buffer.from([1, 2]), Buffer.from([0xc3, 0x28])]) expect(() => harnessAttachmentFromBytes('p', 'a.dat', bytes)).toThrow('二进制文件')
  })

  it('checks raw image and text byte limits rather than MIME or metadata sizes', () => {
    expect(() => harnessAttachmentFromBytes('p', 'a.txt', Buffer.alloc(HARNESS_ATTACHMENT_LIMITS.textFileBytes + 1, 65))).toThrow('256 KiB')
    const bytes = Buffer.alloc(HARNESS_ATTACHMENT_LIMITS.imageFileBytes + 1)
    PNG.copy(bytes)
    expect(() => harnessAttachmentFromBytes('p', 'a.png', bytes)).toThrow('20 MiB')
    const content = Buffer.alloc(14 * 1024 * 1024).toString('base64')
    expect(() => assertHarnessAttachmentTotals(Array.from({ length: 3 }, (_, index) => ({ path: String(index), name: 'a.png', mediaType: 'image/png' as const, size: 1, content })))).toThrow('40 MiB')
  })
})

describe('Harness immutable session attachments', () => {
  it('imports into a personal session with host MIME and opaque references', () => {
    const { store, session } = fixture()
    const [reference] = store.importMessageAttachments(session.id, [input('renamed.txt', PNG, 'text/plain')])
    expect(reference).toMatchObject({ path: expect.stringMatching(/^mira-attachment:[a-f0-9-]{36}$/), name: 'renamed.txt', mediaType: 'image/png', size: PNG.length })
    expect(store.getMessageAttachment(session.id, reference!.path)).toEqual({ ...reference, content: PNG.toString('base64') })
    expect(store.resolveMessageAttachments(session.id, [{ ...reference!, name: 'forged.jpg', mediaType: 'image/jpeg', size: 0 }])).toEqual([{ ...reference, content: PNG.toString('base64') }])
  })

  it('freezes chosen external bytes without broadening personal path reads', () => {
    const { root, store, session } = fixture()
    const filePath = join(root, 'selected.txt')
    writeFileSync(filePath, '选中时的内容')
    const [reference] = store.selectMessageAttachments(session.id, [filePath])
    writeFileSync(filePath, '后来改变的内容')
    expect(store.getMessageAttachment(session.id, reference!.path).content).toBe('选中时的内容')
    expect(() => store.getMessageAttachment(session.id, filePath)).toThrow('相对路径')
    const changed = store.getMessageAttachment(session.id, reference!.path)
    changed.content = '伪造'; changed.name = '伪造'
    expect(store.getMessageAttachment(session.id, reference!.path)).toMatchObject({ name: 'selected.txt', content: '选中时的内容' })
  })

  it('keeps imports across a store reopen and deletes them with their owner session', () => {
    const { root, database, store, session } = fixture()
    const [reference] = store.importMessageAttachments(session.id, [input('notes.md', Buffer.from('冻结文本'), 'text/markdown')])
    const reopened = new Database(join(root, 'state.sqlite'))
    try {
      const second = new HarnessStore(reopened, root)
      expect(second.getMessageAttachment(session.id, reference!.path)).toMatchObject({ content: '冻结文本' })
    } finally { reopened.close() }
    store.deleteSession(session.id)
    expect(database.prepare('SELECT COUNT(*) AS count FROM harness_attachments').get()).toEqual({ count: 0 })
  })

  it('rejects cross-session tokens and malformed tokens without revealing payloads', () => {
    const { store, session } = fixture()
    const other = store.createSession()
    const [reference] = store.importMessageAttachments(session.id, [input()])
    for (const path of [reference!.path, 'mira-attachment:../invalid']) expect(() => store.getMessageAttachment(other.id, path)).toThrow('不属于当前会话')
  })

  it('previews a frozen token without resolving a removed project or working directory', () => {
    const { store, database, session } = fixture()
    const [reference] = store.importMessageAttachments(session.id, [input()])
    database.prepare('UPDATE harness_sessions SET working_directory = NULL, project_id = ? WHERE id = ?').run('removed-project', session.id)
    const structured = store.getSession(session.id)
    store.updateSession({ ...structured, projectId: 'removed-project', workingDirectory: undefined })
    expect(store.getMessageAttachment(session.id, reference!.path)).toMatchObject({ content: PNG.toString('base64'), mediaType: 'image/png' })
  })

  it('publishes no partial batch when later content or aggregate size fails', () => {
    const { store, database, session } = fixture()
    expect(() => store.importMessageAttachments(session.id, [input(), input('binary.dat', Buffer.from([0, 1]), 'application/octet-stream')])).toThrow('二进制文件')
    const large = input('large.txt', Buffer.alloc(230 * 1024, 65), 'text/plain')
    expect(() => store.importMessageAttachments(session.id, Array.from({ length: 5 }, () => large))).toThrow('总大小')
    expect(database.prepare('SELECT COUNT(*) AS count FROM harness_attachments').get()).toEqual({ count: 0 })
  })

  it('rechecks the aggregate of tokens imported in separate batches at send time', () => {
    const { store, session } = fixture()
    const references = Array.from({ length: 5 }, (_, index) => store.importMessageAttachments(session.id, [input(`note-${index}.txt`, Buffer.alloc(230 * 1024, 65), 'text/plain')])[0]!)
    expect(() => store.resolveMessageAttachments(session.id, references)).toThrow('总大小')
  })

  it('rejects new attachments for an archived session while keeping existing previews readable', () => {
    const { store, session } = fixture()
    const [reference] = store.importMessageAttachments(session.id, [input()])
    store.archiveSessions([session.id])
    expect(() => store.importMessageAttachments(session.id, [input()])).toThrow('归档会话')
    expect(() => store.selectMessageAttachments(session.id, [])).toThrow('归档会话')
    expect(store.getMessageAttachment(session.id, reference!.path).content).toBe(PNG.toString('base64'))
  })

  it('supports a real workspace image by bytes without trusting its reference metadata', () => {
    const { store, session } = fixture()
    writeFileSync(join(session.workingDirectory!, 'renamed.dat'), PNG)
    expect(store.resolveMessageAttachments(session.id, [{ path: 'renamed.dat', name: 'bad.txt' }])).toEqual([{ path: 'renamed.dat', name: 'renamed.dat', mediaType: 'image/png', size: PNG.length, content: PNG.toString('base64') }])
  })

  it('freezes workspace references before preview or sending and keeps external paths blocked', () => {
    const { store, root, session } = fixture()
    const target = join(session.workingDirectory!, 'snapshot.png')
    writeFileSync(target, PNG)
    const reference = store.stageMessageAttachment(session.id, 'snapshot.png')
    writeFileSync(target, GIF)
    expect(store.getMessageAttachment(session.id, reference.path)).toMatchObject({ mediaType: 'image/png', content: PNG.toString('base64') })
    expect(store.resolveMessageAttachments(session.id, [reference])).toMatchObject([{ content: PNG.toString('base64') }])
    expect(() => store.stageMessageAttachment(session.id, join(root, 'outside.png'))).toThrow('相对路径')
    expect(() => store.stageMessageAttachment(session.id, 'mira-attachment:anything')).toThrow('相对路径')
  })

  it('keeps a 20 MiB image out of streamed session snapshots, message rows and session JSON', () => {
    const { store, database, session } = fixture()
    const bytes = pngWithTextBytes(HARNESS_ATTACHMENT_LIMITS.imageFileBytes)
    const [reference] = store.importMessageAttachments(session.id, [input('large.png', bytes)])
    const frozen = store.getMessageAttachment(session.id, reference!.path)
    const started = store.addMessage(session.id, 'user', '', [frozen])
    const metadata = { ...reference, content: '' }
    expect(started.messages[0]!.attachments).toEqual([metadata])
    store.appendAssistantDelta(session.id, '第一段')
    store.appendAssistantDelta(session.id, '第二段')
    store.setStatus(session.id, 'completed')
    const current = store.getSession(session.id)
    const json = JSON.stringify(current)
    expect(Buffer.byteLength(json)).toBeLessThan(5000)
    expect((database.prepare('SELECT length(payload) AS bytes FROM harness_session_state WHERE session_id = ?').get(session.id) as { bytes: number }).bytes).toBeLessThan(5000)
    expect((database.prepare('SELECT MAX(length(payload)) AS bytes FROM harness_messages WHERE session_id = ?').get(session.id) as { bytes: number }).bytes).toBeLessThan(5000)
    const { path } = database.prepare('SELECT path FROM harness_sessions WHERE id = ?').get(session.id) as { path: string }
    expect(statSync(path).size).toBeLessThan(5000)
    expect(readFileSync(path, 'utf8')).not.toContain(bytes.toString('base64').slice(0, 48))
    expect(database.prepare('SELECT COUNT(*) AS count FROM harness_attachments').get()).toEqual({ count: 1 })
    const hydrated = store.hydrateMessageAttachments(session.id, current.messages[0]!)
    expect(hydrated.attachments).toEqual([frozen])
    expect(store.getSession(session.id).messages[0]!.attachments).toEqual([metadata])
    store.updateSession({ ...current, messages: [hydrated, ...current.messages.slice(1)] })
    expect(database.prepare('SELECT COUNT(*) AS count FROM harness_attachments').get()).toEqual({ count: 1 })
    expect(store.getMessageAttachment(session.id, reference!.path).content).toBe(bytes.toString('base64'))
  })

  it('migrates a previously inline image once without changing frozen bytes or historical dates', () => {
    const { store, database, session } = fixture()
    const legacy = { ...session, messages: [{ id: 'legacy-image', role: 'user' as const, content: '旧图', createdAt: 123, attachments: [{ path: 'original.png', name: 'original.png', mediaType: 'image/png' as const, content: PNG.toString('base64') }] }] }
    database.prepare('UPDATE harness_session_state SET payload = ? WHERE session_id = ?').run(JSON.stringify(legacy), session.id)
    const migrated = store.getSession(session.id)
    expect(migrated.updatedAt).toBe(session.updatedAt)
    expect(migrated.messages[0]).toMatchObject({ id: 'legacy-image', createdAt: 123, attachments: [{ path: expect.stringMatching(/^mira-attachment:/), content: '', mediaType: 'image/png' }] })
    expect(store.hydrateMessageAttachments(session.id, migrated.messages[0]!).attachments?.[0]?.content).toBe(PNG.toString('base64'))
    expect(store.getSession(session.id)).toEqual(migrated)
    expect(database.prepare('SELECT COUNT(*) AS count FROM harness_attachments').get()).toEqual({ count: 1 })
  })

  it('enforces 40 MiB at send time for images imported in separate batches', () => {
    const { store, session } = fixture()
    const bytes = pngWithTextBytes(14 * 1024 * 1024)
    const references = Array.from({ length: 3 }, (_, index) => store.importMessageAttachments(session.id, [input(`image-${index}.png`, bytes)])[0]!)
    expect(() => store.resolveMessageAttachments(session.id, references)).toThrow('40 MiB')
  })
})

describe('Harness staged attachment startup reclamation', () => {
  const submission = (references: ReturnType<HarnessStore['importMessageAttachments']>) => ({ id: 'pending-submit', text: '', planning: false, references, selection: { providerId: 'provider', modelId: 'model' } })

  it('keeps a prepared metadata owner hidden and retains only its explicitly referenced attachments on restart', () => {
    const context = restartFixture(), session = context.platform.harness.createSession(undefined, 'default', true)
    const [keep, removed] = context.platform.harness.importMessageAttachments(session.id, [input('keep.png'), input('removed.png')])
    context.platform.savePreference(context.preferenceKey, { draft: { id: 'anonymous', groupId: 'group', sessionId: session.id }, drafts: {}, fileDrafts: { [session.id]: [keep] } })
    const restarted = context.restart()
    expect(restarted.harness.listSessions()).toEqual([])
    expect(restarted.harness.getSession(session.id).draftState).toBe('prepared')
    expect(restarted.harness.getMessageAttachment(session.id, keep!.path).content).toBe(PNG.toString('base64'))
    expect(() => restarted.harness.getMessageAttachment(session.id, removed!.path)).toThrow('不属于当前会话')
    const foreign = restarted.harness.createSession(undefined, 'default', true)
    expect(() => restarted.harness.getMessageAttachment(foreign.id, keep!.path)).toThrow('不属于当前会话')
  })

  it('uses draft metadata only as a session root, not an attachment retention root', () => {
    const context = restartFixture(), session = context.platform.harness.createSession(undefined, 'default', true)
    const [unused] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.platform.savePreference(context.preferenceKey, { draft: { id: 'anonymous', sessionId: session.id, visible: false }, drafts: {}, fileDrafts: {} })
    const restarted = context.restart()
    expect(restarted.harness.getSession(session.id).draftState).toBe('prepared')
    expect(restarted.harness.listSessions()).toEqual([])
    expect(() => restarted.harness.getMessageAttachment(session.id, unused!.path)).toThrow('不属于当前会话')
  })

  it('accepts a cleared draft marker and submission placement without treating them as unknown attachment roots', () => {
    const context = restartFixture(), session = context.platform.harness.createSession(undefined, 'default', true)
    const [keep, unused] = context.platform.harness.importMessageAttachments(session.id, [input('keep.png'), input('unused.png')])
    context.platform.savePreference(context.preferenceKey, { draft: null, drafts: {}, fileDrafts: {}, submissions: { [session.id]: { ...submission([keep!]), draft: { id: 'anonymous', groupId: 'group', sessionId: session.id } } } })
    expect(context.platform.hasUnconfirmedHarnessSubmission(session.id)).toBe(true)
    const restarted = context.restart()
    expect(restarted.harness.listSessions()).toEqual([])
    expect(restarted.harness.getMessageAttachment(session.id, keep!.path).content).toBe(PNG.toString('base64'))
    expect(() => restarted.harness.getMessageAttachment(session.id, unused!.path)).toThrow('不属于当前会话')
  })

  it.each(['fileDrafts', 'recoveries', 'submissions'] as const)('retains attachment-only %s and its empty owner on restart while reclaiming removed files', kind => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [keep, orphan] = context.platform.harness.importMessageAttachments(session.id, [input('keep.png'), input('removed.png')])
    const item = submission([keep!])
    const root = kind === 'fileDrafts' ? [keep] : kind === 'submissions' ? item : [{ ...item, submissionId: item.id, sessionId: session.id, permissionMode: 'default', createdAt: 1 }]
    context.platform.savePreference(context.preferenceKey, { drafts: {}, fileDrafts: {}, [kind]: { [session.id]: root } })
    const restarted = context.restart()
    expect(restarted.harness.getSession(session.id).messages).toEqual([])
    expect(restarted.harness.getMessageAttachment(session.id, keep!.path).content).toBe(PNG.toString('base64'))
    expect(() => restarted.harness.getMessageAttachment(session.id, orphan!.path)).toThrow('不属于当前会话')
    expect(context.restart().harness.getMessageAttachment(session.id, keep!.path).content).toBe(PNG.toString('base64'))
  })

  it('keeps archived historical image/text bytes and releases unreferenced staged content after restart', () => {
    const context = restartFixture(), store = context.platform.harness, session = store.createSession()
    const [image, text, orphan] = store.importMessageAttachments(session.id, [input(), input('notes.md', Buffer.from('历史文本'), 'text/markdown'), input('removed.png')])
    store.addMessage(session.id, 'user', '', store.resolveMessageAttachments(session.id, [image!, text!]))
    store.archiveSessions([session.id])
    const restarted = context.restart()
    expect(restarted.harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
    expect(restarted.harness.getMessageAttachment(session.id, text!.path).content).toBe('历史文本')
    expect(() => restarted.harness.getMessageAttachment(session.id, orphan!.path)).toThrow('不属于当前会话')
    expect(restarted.harness.hydrateMessageAttachments(session.id, restarted.harness.getSession(session.id).messages[0]!).attachments?.[0]?.content).toBe(PNG.toString('base64'))
  })

  it.each(['recoveries', 'submissions'] as const)('keeps the empty owner of a text-only %s root while reclaiming removed attachments', kind => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [orphan] = context.platform.harness.importMessageAttachments(session.id, [input()])
    const item = { ...submission([]), text: '未确认的文字提交' }
    const root = kind === 'submissions' ? item : [{ ...item, submissionId: item.id, sessionId: session.id, permissionMode: 'default', createdAt: 1 }]
    context.platform.savePreference(context.preferenceKey, { [kind]: { [session.id]: root } })
    const restarted = context.restart()
    expect(restarted.harness.getSession(session.id).messages).toEqual([])
    expect(() => restarted.harness.getMessageAttachment(session.id, orphan!.path)).toThrow('不属于当前会话')
  })

  it('retains image attachments in assistant-only history', () => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.platform.harness.addMessage(session.id, 'assistant', '历史回复', context.platform.harness.resolveMessageAttachments(session.id, [image!]))
    const restarted = context.restart()
    expect(restarted.harness.getSession(session.id).messages[0]?.role).toBe('assistant')
    expect(restarted.harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
  })

  it('retains message-table history even when a stale state snapshot has no messages', () => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image, orphan] = context.platform.harness.importMessageAttachments(session.id, [input(), input('removed.png')])
    context.platform.harness.addMessage(session.id, 'user', '', context.platform.harness.resolveMessageAttachments(session.id, [image!]))
    context.mutateRaw(database => database.prepare('UPDATE harness_session_state SET payload = ? WHERE session_id = ?').run(JSON.stringify(session), session.id))
    const restarted = context.restart()
    expect(restarted.harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
    expect(() => restarted.harness.getMessageAttachment(session.id, orphan!.path)).toThrow('不属于当前会话')
  })

  it('retains legacy session-file attachment roots when structured state is unavailable', () => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.platform.harness.addMessage(session.id, 'user', '', context.platform.harness.resolveMessageAttachments(session.id, [image!]))
    context.mutateRaw(database => {
      database.prepare('DELETE FROM harness_session_state WHERE session_id = ?').run(session.id)
      database.prepare('DELETE FROM harness_messages WHERE session_id = ?').run(session.id)
    })
    expect(context.restart().harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
  })

  it('does not retain another owner’s token from a draft or historical message', () => {
    const context = restartFixture(), store = context.platform.harness
    const source = store.createSession(), other = store.createSession()
    const [image] = store.importMessageAttachments(source.id, [input()])
    store.addMessage(source.id, 'user', '本任务没有使用该附件')
    store.updateSession({ ...other, messages: [{ id: 'foreign', role: 'user', content: '其他任务', createdAt: 1, attachments: [{ ...image!, content: '' }] }] })
    context.platform.savePreference(context.preferenceKey, { fileDrafts: { [other.id]: [image] } })
    const restarted = context.restart()
    for (const id of [source.id, other.id]) expect(() => restarted.harness.getMessageAttachment(id, image!.path)).toThrow('不属于当前会话')
  })

  it.each(['{', '[]', 'null', '{"nextVersionReferences":{}}', '{"fileDrafts":[]}'])('skips destructive startup cleanup for unknown or damaged draft preference %s', raw => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.rawPreference(raw)
    const restarted = context.restart()
    expect(restarted.harness.getSession(session.id).messages).toEqual([])
    expect(restarted.harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
  })

  it('skips startup cleanup when sidebar retention preferences have an unknown structure', () => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.platform.savePreference('first-party.mira-harness.session-drawer', { groups: 'unknown' })
    expect(context.restart().harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
  })

  it('reclaims an unused attachment while preserving the unsent task in a valid grouped root order', () => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.platform.savePreference('first-party.mira-harness.session-drawer', { groupedRootOrder: [{ type: 'session', id: session.id }] })
    const restarted = context.restart()
    expect(restarted.harness.getSession(session.id).messages).toEqual([])
    expect(() => restarted.harness.getMessageAttachment(session.id, image!.path)).toThrow('不属于当前会话')
  })

  it.each([null, {}, [null], [{ type: 'future', id: 'task' }], [{ type: 'session', id: 123 }]])('preserves staged attachments when root order uses an unknown structure: %j', groupedRootOrder => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.platform.savePreference('first-party.mira-harness.session-drawer', { groupedRootOrder })
    expect(context.restart().harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
  })

  it.each([
    { fileDrafts: [null] },
    { recoveries: [{ sessionId: 'wrong-owner', references: [] }] },
    { submissions: { references: null } },
    { submissions: { references: [], futureReference: 'unknown' } },
  ])('preserves a malformed owner while reclaiming a healthy owner’s orphan: %j', malformed => {
    const context = restartFixture(), store = context.platform.harness
    const damaged = store.createSession(), healthy = store.createSession()
    const [damagedImage] = store.importMessageAttachments(damaged.id, [input()])
    const [orphan] = store.importMessageAttachments(healthy.id, [input()])
    store.addMessage(healthy.id, 'user', '正常历史')
    context.platform.savePreference(context.preferenceKey, Object.fromEntries(Object.entries(malformed).map(([key, value]) => [key, { [damaged.id]: value }])))
    const restarted = context.restart()
    expect(restarted.harness.getMessageAttachment(damaged.id, damagedImage!.path).content).toBe(PNG.toString('base64'))
    expect(() => restarted.harness.getMessageAttachment(healthy.id, orphan!.path)).toThrow('不属于当前会话')
  })

  it.each(['state', 'message'] as const)('preserves all attachments for an owner with damaged %s history', source => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.platform.harness.addMessage(session.id, 'user', '历史')
    context.mutateRaw(database => database.prepare(`UPDATE ${source === 'state' ? 'harness_session_state' : 'harness_messages'} SET payload = ? WHERE session_id = ?`).run('{', session.id))
    expect(context.restart().harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
  })

  it('preserves staged content for an owner with an unknown history version', () => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.mutateRaw(database => database.prepare('UPDATE harness_session_state SET payload = ? WHERE session_id = ?').run(JSON.stringify({ ...session, version: 2 }), session.id))
    expect(context.restart().harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
  })

  it('preserves an empty owner and its staged attachment when the state payload belongs to another session', () => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.mutateRaw(database => database.prepare('UPDATE harness_session_state SET payload = ? WHERE session_id = ?').run(JSON.stringify({ ...session, id: 'another-owner', messages: [] }), session.id))
    expect(context.restart().harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
    context.mutateRaw(database => expect(database.prepare('SELECT id FROM harness_sessions WHERE id = ?').get(session.id)).toEqual({ id: session.id }))
  })

  it('reclaims removed draft attachments only at restart, without withdrawing live blobs', () => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.platform.harness.addMessage(session.id, 'user', '任务历史')
    context.platform.savePreference(context.preferenceKey, { fileDrafts: { [session.id]: [image] } })
    context.platform.savePreference(context.preferenceKey, { fileDrafts: { [session.id]: [] } })
    expect(context.platform.harness.getMessageAttachment(session.id, image!.path).content).toBe(PNG.toString('base64'))
    expect(() => context.restart().harness.getMessageAttachment(session.id, image!.path)).toThrow('不属于当前会话')
  })

  it('reclaims unowned rows without recreating deleted tasks', () => {
    const context = restartFixture(), session = context.platform.harness.createSession()
    const [image] = context.platform.harness.importMessageAttachments(session.id, [input()])
    context.mutateRaw(database => {
      database.prepare('DELETE FROM harness_sessions WHERE id = ?').run(session.id)
      database.prepare('DELETE FROM harness_session_state WHERE session_id = ?').run(session.id)
    })
    const restarted = context.restart()
    expect(restarted.harness.listSessions()).toEqual([])
    expect(() => restarted.harness.getMessageAttachment(session.id, image!.path)).toThrow('未找到会话')
    context.mutateRaw(database => expect(database.prepare('SELECT COUNT(*) AS count FROM harness_attachments').get()).toEqual({ count: 0 }))
  })
})

describe('Harness attachment request contract', () => {
  const references = [{ path: 'mira-attachment:8ba45489-36c1-4c0f-aa58-f97a8bcb5f08', name: 'a.png', mediaType: 'image/png', size: PNG.length }]
  it('validates prepared creation without coercion or forwarding draft metadata', () => {
    expect(parseFirstPartyHarnessCall('session.create', { prepared: true, draft: { groupId: 'group' } })).toEqual({ method: 'session.create', projectId: undefined, prepared: true })
    expect(parseFirstPartyHarnessCall('session.create', { prepared: false })).toEqual({ method: 'session.create', projectId: undefined, prepared: false })
    for (const prepared of ['true', 0, 1, null, {}]) expect(() => parseFirstPartyHarnessCall('session.create', { prepared })).toThrow('草稿准备状态无效')
  })
  it.each(['message.submit', 'message.run', 'plan.continue'])('permits attachment-only %s while rejecting empty/no-attachment and NUL text', method => {
    const params = { sessionId: 's', submissionId: 'submission', planId: 'plan', text: '', message: '', references, planning: false, selection: { providerId: 'p', modelId: 'm' } }
    expect(parseFirstPartyHarnessCall(method, params)).toMatchObject({ references })
    expect(() => parseFirstPartyHarnessCall(method, { ...params, references: [] })).toThrow('任务内容无效')
    expect(() => parseFirstPartyHarnessCall(method, { ...params, text: '\0', message: '\0' })).toThrow('任务内容无效')
  })

  it('exposes the bounded session-scoped import/select/get methods without forwarding extra fields', () => {
    expect(parseFirstPartyHarnessCall('attachments.import', { sessionId: 's', files: [{ ...input(), physicalPath: '/private/path' }] })).toEqual({ method: 'attachments.import', sessionId: 's', files: [input()] })
    expect(parseFirstPartyHarnessCall('attachments.select', { sessionId: 's', projectId: 'ignored' })).toEqual({ method: 'attachments.select', sessionId: 's' })
    expect(parseFirstPartyHarnessCall('attachments.stage', { sessionId: 's', path: 'picture.png' })).toEqual({ method: 'attachments.stage', sessionId: 's', path: 'picture.png' })
    expect(() => parseFirstPartyHarnessCall('attachments.stage', { sessionId: 's', path: '/outside.png' })).toThrow('路径')
    expect(parseFirstPartyHarnessCall('attachments.get', { sessionId: 's', path: references[0]!.path, otherSessionId: 'ignored' })).toEqual({ method: 'attachments.get', sessionId: 's', path: references[0]!.path })
    expect(() => parseFirstPartyHarnessCall('attachments.import', { sessionId: 's', files: Array.from({ length: 13 }, () => input()) })).toThrow('12 个文件')
  })
})
