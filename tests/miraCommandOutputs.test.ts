import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraCommandOutputs, MIRA_COMMAND_OUTPUT_BYTES } from '../electron/storage/miraCommandOutputs'

const roots: string[] = []
const first = { sessionId: 'task', runId: 'run', toolId: 'tool' }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mira-full-output-')); roots.push(root)
  return { root, outputs: new MiraCommandOutputs(root) }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('private complete command output', () => {
  it('retains merged stdout/stderr beyond the model snapshot and survives a fresh store', async () => {
    const { root, outputs } = fixture()
    const content = `first\n${'完整输出\n'.repeat(10000)}last stderr\n`
    outputs.begin(first, []); outputs.append(first, content)
    expect(await outputs.read(first)).toBe(content)
    await outputs.finish(first)
    expect(readdirSync(root)).toHaveLength(1)
    expect(await new MiraCommandOutputs(root).read(first)).toBe(content)
  })
  it('withholds split credentials live and persists only redacted content including a stopped prefix', async () => {
    const { root, outputs } = fixture()
    outputs.begin(first, ['private-long-key'])
    outputs.append(first, 'before private-long')
    expect(await outputs.read(first)).toBe('before ')
    outputs.append(first, '-key\nAuthorization: Bearer abc123\npassword=hidden\nprivate-long')
    await outputs.finish(first)
    const directory = join(root, readdirSync(root)[0])
    const stored = readFileSync(join(directory, readdirSync(directory)[0]), 'utf8')
    expect(stored).not.toMatch(/private-long|abc123|hidden/)
    expect(stored).toContain('[已隐藏]')
    expect(await new MiraCommandOutputs(root).read(first)).toBe(stored)
  })
  it('keeps exact session/run/tool identities distinct without treating IDs as paths', async () => {
    const { outputs } = fixture()
    for (const [index, identity] of [first, { ...first, runId: 'other' }, { ...first, sessionId: '../../other' }, { ...first, toolId: '../../other' }].entries()) {
      outputs.begin(identity, []); outputs.append(identity, `record-${index}`); await outputs.finish(identity)
      expect(await outputs.read(identity)).toBe(`record-${index}`)
    }
    expect(await outputs.read(first)).toBe('record-0')
    await expect(outputs.read({ ...first, toolId: 'missing' })).rejects.toThrow()
  })
  it('preserves the accepted UTF-8 prefix when output exceeds the shared budget', async () => {
    const { outputs } = fixture()
    outputs.begin(first, [])
    outputs.append(first, 'x'.repeat(MIRA_COMMAND_OUTPUT_BYTES - 2))
    expect(() => outputs.append(first, '中文')).toThrow('16 MiB')
    await outputs.finish(first)
    const text = await outputs.read(first)
    expect(text.length).toBe(MIRA_COMMAND_OUTPUT_BYTES - 2)
    expect(text).not.toContain('\ufffd')
  })
  it('records empty successful or stopped execution without inventing tool-status text', async () => {
    const { outputs } = fixture(); outputs.begin(first, []); await outputs.finish(first)
    expect(outputs.available(first)).toBe(true); expect(await outputs.read(first)).toBe('')
  })
  it('rejects a replaced file symlink instead of following a private output path', async () => {
    const { root, outputs } = fixture(); outputs.begin(first, []); outputs.append(first, 'original'); await outputs.finish(first)
    const directory = join(root, readdirSync(root)[0]), path = join(directory, readdirSync(directory)[0]); unlinkSync(path); symlinkSync(join(root, 'outside'), path)
    await expect(outputs.read(first)).rejects.toThrow()
  })
  it('removes only the deleted task logs, keeping a sibling task available', async () => {
    const { outputs } = fixture(), other = { ...first, sessionId: 'other' }
    for (const identity of [first, other]) { outputs.begin(identity, []); outputs.append(identity, identity.sessionId); await outputs.finish(identity) }
    outputs.removeSession(first.sessionId)
    await expect(outputs.read(first)).rejects.toThrow()
    expect(await outputs.read(other)).toBe('other')
  })
})
