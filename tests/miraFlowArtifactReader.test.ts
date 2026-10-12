import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NodeRecord } from '../packages/mira-flow-kit/src/engine/mira-types'
import { createMiraFlowArtifacts } from '../electron/services/flows/miraFlowArtifacts'
import { readMiraFlowArtifact } from '../electron/services/flows/miraFlowArtifactReader'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'mira-artifact-read-'))); roots.push(root)
  const store = join(root, 'store')
  let original = Buffer.from('Original immutable content')
  const publisher = createMiraFlowArtifacts({ artifactRoot: store, readWorkspaceFile: async () => original })
  const record = await publisher.executeArtifactPublish({ runId: 'run', siteId: 'publish', ordinal: 0, id: 'draft', version: 1, op: 'file', path: 'draft.txt' })
  const node: NodeRecord = { runId: 'run', siteId: 'publish', ordinal: 0, kind: 'artifact', inputHash: 'input', status: 'completed', artifactId: 'draft', result: { ...record, primary: true } }
  const directory = join(store, record.uri!.slice('mira-artifact://'.length))
  return { root, store, node, directory, changeSource: () => { original = Buffer.from('Changed workspace file') } }
}
describe('published workflow artifact immutable reader', () => {
  it('reads published bytes after source changes; accepts engine primary annotation', async () => {
    const view = await fixture(); view.changeSource()
    const value = await readMiraFlowArtifact(view.store, 'run', view.node)
    expect(value.payload.toString()).toBe('Original immutable content')
    expect(value.record).not.toHaveProperty('primary')
  })
  it('rejects another run and altered journal identity', async () => {
    const view = await fixture()
    await expect(readMiraFlowArtifact(view.store, 'foreign', view.node)).rejects.toThrow('不可读取')
    await expect(readMiraFlowArtifact(view.store, 'run', { ...view.node, artifactId: 'other' })).rejects.toThrow('不可读取')
    await expect(readMiraFlowArtifact(view.store, 'run', { ...view.node, ordinal: 1 })).rejects.toThrow('不可读取')
  })
  it('detects payload corruption and altered metadata independently', async () => {
    const view = await fixture(), path = join(view.directory, 'payload'), bytes = await readFile(path)
    await unlink(path); await writeFile(path, Buffer.alloc(bytes.length, 65))
    await expect(readMiraFlowArtifact(view.store, 'run', view.node)).rejects.toThrow('不可读取')
    await writeFile(path, bytes)
    const meta = JSON.parse(await readFile(join(view.directory, 'metadata.json'), 'utf8'))
    meta.record.contentType = 'text/html'
    await unlink(join(view.directory, 'metadata.json')); await writeFile(join(view.directory, 'metadata.json'), JSON.stringify(meta))
    await expect(readMiraFlowArtifact(view.store, 'run', view.node)).rejects.toThrow('不可读取')
  })
  it.each(['payload', 'metadata.json'])('rejects %s symlink rather than reading outside store', async name => {
    const view = await fixture(), path = join(view.directory, name), outside = join(view.root, 'external')
    await writeFile(outside, await readFile(path)); await unlink(path); await symlink(outside, path)
    await expect(readMiraFlowArtifact(view.store, 'run', view.node)).rejects.toThrow('不可读取')
  })
  it('rejects swapped version directory and store-root symlinks', async () => {
    const view = await fixture(), saved = join(view.root, 'moved')
    const { rename } = await import('node:fs/promises')
    await rename(view.directory, saved); await symlink(saved, view.directory)
    await expect(readMiraFlowArtifact(view.store, 'run', view.node)).rejects.toThrow('不可读取')
    await unlink(view.directory); await rename(saved, view.directory)
    const store = join(view.root, 'store-copy'); await rename(view.store, store); await symlink(store, view.store)
    await expect(readMiraFlowArtifact(view.store, 'run', view.node)).rejects.toThrow('不可读取')
  })
  it('does not pretend that report/table presets have published bytes', async () => {
    const view = await fixture()
    await expect(readMiraFlowArtifact(view.store, 'run', { ...view.node, result: { id: 'table', kind: 'table', version: 1, spec: {} } })).rejects.toThrow('预置看板')
  })
  it('rechecks authorization after awaited disk operations', async () => {
    const view = await fixture(); let calls = 0
    await expect(readMiraFlowArtifact(view.store, 'run', view.node, () => { if (++calls > 2) throw new Error('第一方授权无效或应用已停用') })).rejects.toThrow('第一方授权无效或应用已停用')
  })
})
