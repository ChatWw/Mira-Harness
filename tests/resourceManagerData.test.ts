import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { channel } from 'node:diagnostics_channel'
import { insideResourceRoot, scanResourceStorage } from '../electron/bootstrap/resourceStorage'
import { createResourceNetwork, sanitizeResourceUrl } from '../electron/bootstrap/resourceNetwork'
let temporary: string | undefined
afterEach(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }) })
it('counts Mira storage without following links out of its root and supports cancellation', async () => {
  temporary = await mkdtemp(join(tmpdir(), 'mira-storage-'))
  const root = join(temporary, 'data'); await mkdir(join(root, 'sessions'), { recursive: true })
  await writeFile(join(root, 'sessions', 'task.json'), '12345'); await writeFile(join(root, 'state.sqlite'), '123')
  await writeFile(join(temporary, 'outside'), 'outside-data'); await symlink(join(temporary, 'outside'), join(root, 'external'))
  const snapshot = await scanResourceStorage(root, new AbortController().signal)
  expect(snapshot.totalBytes).toBe(8); expect(snapshot.categories.find(row => row.id === 'sessions')?.files).toBe(2)
  expect(insideResourceRoot(root, join(root, 'sessions'))).toBe(true); expect(insideResourceRoot(root, join(root, '..', 'outside'))).toBe(false)
  const controller = new AbortController(); controller.abort(); await expect(scanResourceStorage(root, controller.signal)).rejects.toThrow()
})
it('redacts credentials and query values, bounds records, clears them, and unsubscribes Node capture', () => {
  expect(sanitizeResourceUrl('https://user:password@example.com/api?token=secret#private')).toBe('https://example.com/api?token=%5Bredacted%5D')
  expect(sanitizeResourceUrl('file:///private')).toBeUndefined()
  const network = createResourceNetwork(); network.start()
  try {
    channel('undici:request:create').publish({ request: { method: 'POST', origin: 'https://example.com', path: '/api?key=secret' } })
    expect(network.snapshot().records[0]).toMatchObject({ method: 'POST', processType: 'main' })
    expect(network.snapshot().records[0].url).not.toContain('secret')
    for (let index = 0; index < 1000; index++) network.record('GET', `https://example.com/${index}`)
    expect(network.snapshot().records).toHaveLength(1000); expect(network.snapshot().dropped).toBe(1)
    network.clear(); expect(network.snapshot().records).toHaveLength(0)
  } finally { network.stop() }
  channel('undici:request:create').publish({ request: { method: 'GET', origin: 'https://example.com', path: '/' } })
  expect(network.snapshot().records).toHaveLength(0)
})
