import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { MiraModelCall } from '../src/config/miraModelTrace'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraModelTraceStore, miraTraceValue } from '../electron/storage/miraModelTraceStore'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function store() { const root = await mkdtemp(join(tmpdir(), 'mira-trace-')); roots.push(root); return new MiraModelTraceStore(new MiraPaths(root).ensure()) }
const record = (overrides: Partial<MiraModelCall> = {}): MiraModelCall => ({ id: 'call', sessionId: 'task', runId: 'run', source: 'main', providerId: 'local', providerName: '本地', modelId: 'model', startedAt: 10, status: 'running', ...overrides })

describe('Mira local model calls', () => {
  it('merges requests and terminal responses, flushes pending writes and survives restart without crossing owners', async () => {
    const current = await store()
    current.write(record({ request: { messages: [{ role: 'user', content: 'actual input' }] } }))
    current.write(record({ status: 'completed', completedAt: 20, response: { content: [{ type: 'text', text: 'actual output' }] } }))
    current.write(record({ sessionId: 'another', request: { content: 'private other task' } }))
    const result = await current.read('task')
    expect(result.records).toEqual([record({ request: { messages: [{ role: 'user', content: 'actual input' }] }, status: 'completed', completedAt: 20, response: { content: [{ type: 'text', text: 'actual output' }] } })])
    expect(JSON.stringify(result)).not.toContain('private other task')
    expect((await new MiraModelTraceStore(new MiraPaths(roots[0])).read('task')).records).toEqual(result.records)
    expect(await current.read('never-run')).toMatchObject({ records: [], truncated: false })
    await current.read('another')
  })
  it('redacts secrets and media while preserving tool names, reasoning, and token usage', async () => {
    const current = await store()
    current.write(record({ request: { authorization: 'plain auth', apiKey: 'plain key', messages: [{ content: 'configured-secret password=private sk-123456789012345 data:video/mp4;base64,AQID' }], tools: [{ name: 'read_file' }], max_tokens: 1024 }, response: { thinking: 'real thought', usage: { input: 100, total_tokens: 123 }, access_token: 'plain token' } }), ['configured-secret'])
    const data = await current.read('task'), persisted = await readFile(current.path('task'), 'utf8')
    for (const secret of ['plain auth', 'plain key', 'plain token', 'configured-secret', 'password=private', 'sk-123456789012345', 'base64,AQID']) expect(persisted).not.toContain(secret)
    expect(data.records[0]).toMatchObject({ request: { tools: [{ name: 'read_file' }], max_tokens: 1024 }, response: { thinking: 'real thought', usage: { input: 100, total_tokens: 123 } } })
    expect(persisted).toContain('媒体 video/mp4')
  })
  it('limits the latest calls, skips partial/corrupt input and exact-matches the session stored inside a file', async () => {
    const current = await store()
    for (let n = 0; n < 205; n++) current.write(record({ id: `call-${n}`, startedAt: n }))
    await current.read('task')
    await appendFile(current.path('task'), `${JSON.stringify(record({ id: 'foreign', sessionId: 'other' }))}\nnot-json\n{"partial":`)
    const result = await current.read('task')
    expect(result.records).toHaveLength(200)
    expect(result.records[0].id).toBe('call-5')
    expect(result.records.at(-1)?.id).toBe('call-204')
    expect(result.truncated).toBe(true)
    expect(result.warning).toContain('不完整')
  })
  it('reads only a bounded tail of a large file', async () => {
    const current = await store()
    await mkdir(current.directory, { recursive: true })
    await writeFile(current.path('task'), `${'x'.repeat(9 * 1024 * 1024)}\n${JSON.stringify(record())}\n`)
    const result = await current.read('task')
    expect(result.records).toEqual([record()])
    expect(result.truncated).toBe(true)
  })
  it('marks payload truncation and prevents filenames from escaping the model-call directory', async () => {
    const current = await store()
    expect(current.path('../outside')).toBe(join(current.directory, `${Buffer.from('../outside').toString('base64url')}.jsonl`))
    expect(() => current.path('bad\nidentity')).toThrow('ID')
    const value = JSON.stringify(miraTraceValue({ text: '中'.repeat(100000), messages: Array.from({ length: 10000 }, () => ({ content: 'x'.repeat(100) })) }))
    expect(value).toContain('内容超出记录上限')
    expect(value.length).toBeLessThan(300000)
  })
  it('does not reject a model call when logging fails, and exposes the recording failure', async () => {
    const current = await store()
    await writeFile(current.directory, 'blocked directory')
    expect(() => current.write(record())).not.toThrow()
    await expect(current.read('task')).rejects.toThrow('读取失败')
    await rm(current.directory)
    const result = await current.read('task')
    expect(result.records).toEqual([])
    expect(result.warning).toContain('未能写入')
  })
})
