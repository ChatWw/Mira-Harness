import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { listHarnessWorkspaceFiles, readHarnessWorkspaceFile } from '../electron/services/harnessWorkspaceFiles'

const roots: string[] = []
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'mira-workspace-files-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Harness workspace files', () => {
  it('lists a directory and reads only its regular text files', async () => {
    const root = await workspace()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'note.md'), '# Mira\n')
    const listing = await listHarnessWorkspaceFiles(root, '')
    expect(listing.entries).toEqual([{ name: 'src', path: 'src', type: 'directory' }])
    expect((await listHarnessWorkspaceFiles(root, 'src')).entries).toEqual([{ name: 'note.md', path: 'src/note.md', type: 'file' }])
    expect(await readHarnessWorkspaceFile(root, 'src/note.md')).toEqual({ path: 'src/note.md', content: '# Mira\n' })
  })

  it('rejects traversal, absolute paths and links outside the workspace', async () => {
    const root = await workspace()
    const outside = await workspace()
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(outside, join(root, 'external'))
    await expect(listHarnessWorkspaceFiles(root, '../')).rejects.toThrow('路径无效')
    await expect(readHarnessWorkspaceFile(root, '/etc/passwd')).rejects.toThrow('路径无效')
    await expect(readHarnessWorkspaceFile(root, 'external/secret.txt')).rejects.toThrow('工作目录')
    expect((await listHarnessWorkspaceFiles(root, '')).entries).toEqual([])
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret')
  })

  it('refuses binary and oversized files', async () => {
    const root = await workspace()
    await writeFile(join(root, 'binary.dat'), Buffer.from([0, 1, 2]))
    await writeFile(join(root, 'large.txt'), 'x'.repeat(1_000_001))
    await expect(readHarnessWorkspaceFile(root, 'binary.dat')).rejects.toThrow('二进制')
    await expect(readHarnessWorkspaceFile(root, 'large.txt')).rejects.toThrow('过大')
  })
})
