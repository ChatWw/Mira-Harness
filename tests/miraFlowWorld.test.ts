import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmod, mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { rgPath } from '@vscode/ripgrep'
import { createMiraFlowWorld, type MiraFlowCommandRequest } from '../electron/services/flows/miraFlowWorld'
import { ARTIFACT_CAPS, WORLD_READ_CAPS } from '../packages/mira-flow-kit/src/mira-index'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mira-flow-world-'))
  roots.push(root)
  const workspacePath = join(root, 'workspace')
  await mkdir(workspacePath)
  return { root, workspacePath, artifactRoot: join(root, 'artifacts'), ripgrepPath: rgPath }
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: 'Mira', GIT_AUTHOR_EMAIL: 'mira@example.test', GIT_COMMITTER_NAME: 'Mira', GIT_COMMITTER_EMAIL: 'mira@example.test' }, encoding: 'utf8' })
const publication = (overrides = {}) => ({ runId: 'run/one', siteId: 'site', ordinal: 0, op: 'markdown' as const, id: 'report', version: 1, content: '# Report', ...overrides })

describe('real Mira flow world', () => {
  it('reads, globs and greps real files with sorted workspace-relative paths', async () => {
    const deps = await fixture()
    await mkdir(join(deps.workspacePath, 'notes'))
    await writeFile(join(deps.workspacePath, 'notes/b.md'), 'alpha\nbeta alpha\n')
    await writeFile(join(deps.workspacePath, 'a.md'), 'beta\n')
    const world = await createMiraFlowWorld(deps)
    expect(await world.executeWorldRead('glob', ['**/*.md'])).toEqual(['a.md', 'notes/b.md'])
    expect(await world.executeWorldRead('read', ['notes/b.md'])).toBe('alpha\nbeta alpha\n')
    expect(await world.executeWorldRead('grep', ['alpha', '**/*.md'])).toEqual([
      { path: 'notes/b.md', line: 1, text: 'alpha' }, { path: 'notes/b.md', line: 2, text: 'beta alpha' },
    ])
    expect(await world.executeWorldRead('grep', ['absent'])).toEqual([])
    await expect(world.executeWorldRead('grep', ['['])).rejects.toMatchObject({ code: 'DriverError' })
  })

  it('rejects outside paths, symlink files/directories and invalid argument shapes', async () => {
    const deps = await fixture()
    await writeFile(join(deps.root, 'secret'), 'private')
    await symlink(join(deps.root, 'secret'), join(deps.workspacePath, 'linked'))
    await symlink(deps.root, join(deps.workspacePath, 'outside'))
    const world = await createMiraFlowWorld(deps)
    for (const path of ['../secret', '/secret', 'C:\\secret', 'linked', 'outside/secret']) {
      await expect(world.executeWorldRead('read', [path])).rejects.toMatchObject({ code: 'DriverError' })
    }
    expect(await world.executeWorldRead('glob', ['**/*'])).toEqual([])
    await expect(world.executeWorldRead('read', [undefined])).rejects.toMatchObject({ code: 'DriverError' })
    await expect(world.executeWorldRead('git-status', ['extra'])).rejects.toMatchObject({ code: 'DriverError' })
    await expect(world.executeWorldRead('git-diff', ['--help'])).rejects.toMatchObject({ code: 'DriverError' })
    await expect(world.executeWorldRead('git-diff', [undefined, ':(top)secret'])).rejects.toMatchObject({ code: 'DriverError' })
  })

  it('rejects grep overflow rather than returning a truncated world view', async () => {
    const deps = await fixture()
    await writeFile(join(deps.workspacePath, 'large.txt'), 'hit\n'.repeat(WORLD_READ_CAPS.grepMaxMatches + 1))
    const world = await createMiraFlowWorld(deps)
    await expect(world.executeWorldRead('grep', ['hit'])).rejects.toMatchObject({ code: 'WorldReadCapExceeded' })
    await writeFile(join(deps.workspacePath, 'large.txt'), 'hit\n'.repeat(WORLD_READ_CAPS.grepMaxMatches))
    expect(await world.executeWorldRead('grep', ['hit'])).toHaveLength(WORLD_READ_CAPS.grepMaxMatches)
  })

  it('keeps Unicode/newline paths and long multi-byte matching lines intact', async () => {
    const deps = await fixture()
    const text = '你'.repeat(40_000)
    await writeFile(join(deps.workspacePath, '问\n答.md'), text)
    const world = await createMiraFlowWorld(deps)
    expect(await world.executeWorldRead('grep', ['.'])).toEqual([{ path: '问\n答.md', line: 1, text }])
  })

  it('observes real nested Git status, rename and untracked paths without leaking other folders', async () => {
    const deps = await fixture()
    git(deps.workspacePath, 'init', '-b', 'main')
    await mkdir(join(deps.workspacePath, 'nested'))
    await writeFile(join(deps.workspacePath, 'nested/旧\n文档.md'), 'old\n')
    await writeFile(join(deps.workspacePath, 'nested/change.txt'), 'initial\n')
    await writeFile(join(deps.workspacePath, 'outside.txt'), 'initial\n')
    git(deps.workspacePath, 'add', '.')
    git(deps.workspacePath, 'commit', '-m', 'Initial')
    git(deps.workspacePath, 'mv', 'nested/旧\n文档.md', 'nested/新\n文档.md')
    await writeFile(join(deps.workspacePath, 'nested/change.txt'), 'modified\n')
    await writeFile(join(deps.workspacePath, 'outside.txt'), 'outside\n')
    await writeFile(join(deps.workspacePath, 'nested/new.txt'), 'untracked\n')
    const world = await createMiraFlowWorld({ workspacePath: join(deps.workspacePath, 'nested') })
    expect(await world.executeWorldRead('git-status', [])).toEqual({ branch: 'main', clean: false, staged: ['新\n文档.md'], unstaged: ['change.txt'], untracked: ['new.txt'] })
    expect(await world.executeWorldRead('git-changed-files', [])).toEqual(['change.txt', 'new.txt', '新\n文档.md'])
    expect(await world.executeWorldRead('git-changed-files', ['HEAD'])).toEqual(['change.txt', '新\n文档.md'])
    const diff = await world.executeWorldRead('git-diff', [undefined, 'change.txt'])
    expect(diff).toContain('a/change.txt')
    expect(diff).not.toContain('outside.txt')
    expect(await world.executeWorldRead('git-log', [1])).toEqual([expect.objectContaining({ subject: 'Initial', author: 'Mira', hash: expect.stringMatching(/^[a-f0-9]{40}$/), date: expect.any(String) })])
    git(deps.workspacePath, 'checkout', '--detach')
    expect(await world.executeWorldRead('git-status', [])).not.toHaveProperty('branch')
    await expect(world.executeWorldRead('git-log', [101])).rejects.toMatchObject({ code: 'WorldReadCapExceeded' })
  })

  it('runs commands only through declared, explicitly approved execution with actual argv', async () => {
    const deps = await fixture()
    const approve = vi.fn(async (_request: MiraFlowCommandRequest) => true)
    const execute = vi.fn(async () => ({ exitCode: 7, stdout: 'failed test', stderr: 'detail' }))
    const world = await createMiraFlowWorld({ ...deps, declaredRunCommands: new Set(['node']), commandPort: { approve, execute } })
    expect(await world.executeWorldRead('run', ['node', ['-e', 'process.exit(7)'], { timeoutMs: 500 }])).toEqual({ exitCode: 7, stdout: 'failed test', stderr: 'detail' })
    expect(approve.mock.calls[0]?.[0]).toMatchObject({ command: 'node', args: ['-e', 'process.exit(7)'], cwd: await realpath(deps.workspacePath), timeoutMs: 500 })
    await expect(world.executeWorldRead('run', ['sh'])).rejects.toMatchObject({ code: 'DriverError' })
    approve.mockResolvedValue(false)
    await expect(world.executeWorldRead('run', ['node'])).rejects.toMatchObject({ code: 'DriverError' })
    expect(execute).toHaveBeenCalledTimes(1)
    const closed = await createMiraFlowWorld({ ...deps, commandPort: { approve, execute } })
    await expect(closed.executeWorldRead('run', ['node'])).rejects.toMatchObject({ code: 'DriverError' })
  })

  it('bounds output, respects timeout and cancels in-flight command approvals', async () => {
    const deps = await fixture()
    const execute = vi.fn(async () => ({ exitCode: 0, stdout: 'x'.repeat(WORLD_READ_CAPS.runStdoutMaxBytes + 1), stderr: '' }))
    const world = await createMiraFlowWorld({ ...deps, declaredRunCommands: new Set(['node']), commandPort: { approve: async () => true, execute } })
    await expect(world.executeWorldRead('run', ['node'])).rejects.toMatchObject({ code: 'WorldReadCapExceeded' })
    const slow = await createMiraFlowWorld({ ...deps, declaredRunCommands: new Set(['node']), commandPort: { approve: async () => true, execute: () => new Promise(() => {}) } })
    await expect(slow.executeWorldRead('run', ['node', [], { timeoutMs: 10 }])).rejects.toMatchObject({ code: 'DriverError' })
    const controller = new AbortController()
    const blocked = await createMiraFlowWorld({ ...deps, signal: controller.signal, declaredRunCommands: new Set(['node']), commandPort: { approve: () => new Promise(() => {}), execute } })
    const pending = blocked.executeWorldRead('run', ['node'])
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'Cancelled' })
  })

  it('executes a real controlled command as argv and resolves its nonzero exit', async () => {
    const deps = await fixture()
    const world = await createMiraFlowWorld({ ...deps, declaredRunCommands: new Set([process.execPath]), commandPort: {
      approve: async request => request.command === process.execPath,
      execute: request => new Promise((resolveResult, reject) => {
        execFile(request.command, [...request.args], { cwd: request.cwd, signal: request.signal, encoding: 'utf8', maxBuffer: request.stdoutMaxBytes }, (error, stdout, stderr) => {
          if (error && typeof error.code !== 'number') { reject(error); return }
          resolveResult({ exitCode: error?.code as number | undefined ?? 0, stdout, stderr })
        })
      }),
    } })
    const literal = '$(echo unsafe); && not-a-shell'
    expect(await world.executeWorldRead('run', [process.execPath, ['-e', 'process.stdout.write(process.argv[1]); process.stderr.write("detail"); process.exit(3)', literal]])).toEqual({ exitCode: 3, stdout: literal, stderr: 'detail' })
  })

  it('rejects cap+1 glob/files and unavailable ripgrep with structured errors', async () => {
    const deps = await fixture()
    await Promise.all(Array.from({ length: WORLD_READ_CAPS.globMaxFiles }, (_, i) => writeFile(join(deps.workspacePath, `f-${i}.txt`), '')))
    const world = await createMiraFlowWorld(deps)
    expect(await world.executeWorldRead('glob', ['*.txt'])).toHaveLength(WORLD_READ_CAPS.globMaxFiles)
    await writeFile(join(deps.workspacePath, 'one-more.txt'), '')
    await expect(world.executeWorldRead('glob', ['*.txt'])).rejects.toMatchObject({ code: 'WorldReadCapExceeded' })
    await writeFile(join(deps.workspacePath, 'too-large.bin'), Buffer.alloc(ARTIFACT_CAPS.maxFileBytes + 1))
    await expect(world.executeArtifactPublish(publication({ op: 'file' as const, path: 'too-large.bin' }))).rejects.toMatchObject({ code: 'ArtifactTooLarge' })
    await expect(world.executeWorldRead('read', ['too-large.bin'])).rejects.toMatchObject({ code: 'WorldReadCapExceeded' })
    const noSearch = await createMiraFlowWorld({ ...deps, ripgrepPath: join(deps.root, 'missing-rg') })
    await expect(noSearch.executeWorldRead('grep', ['pattern'])).rejects.toMatchObject({ code: 'DriverError' })
  })

  it('publishes immutable binary bytes and atomic receipts; collisions do not overwrite', async () => {
    const deps = await fixture()
    const bytes = Buffer.from([0, 255, 13, 10, 42])
    await writeFile(join(deps.workspacePath, 'result.pdf'), bytes)
    const world = await createMiraFlowWorld(deps)
    const request = publication({ op: 'file' as const, path: 'result.pdf', content: undefined, opts: { title: 'PDF result' } })
    const receipt = await world.executeArtifactPublish(request)
    expect(receipt).toMatchObject({ contentType: 'application/pdf', bytes: 5, sourcePath: 'result.pdf', title: 'PDF result', uri: expect.stringMatching(/^mira-artifact:\/\/[a-f0-9]{64}$/) })
    const key = receipt.uri!.split('//')[1]!
    expect(await readFile(join(deps.artifactRoot, key, 'payload'))).toEqual(bytes)
    expect(JSON.parse(await readFile(join(deps.artifactRoot, key, 'metadata.json'), 'utf8')).record).toEqual(receipt)
    expect(await world.executeArtifactPublish(request)).toEqual(receipt)
    await writeFile(join(deps.workspacePath, 'result.pdf'), 'replaced')
    await expect(world.executeArtifactPublish(request)).rejects.toMatchObject({ code: 'ArtifactStoreUnavailable' })
    expect(await readFile(join(deps.artifactRoot, key, 'payload'))).toEqual(bytes)
  })

  it('publishes markdown and rejects oversized content, unsafe sources, invalid MIME and symlink stores', async () => {
    const deps = await fixture()
    const world = await createMiraFlowWorld(deps)
    expect(await world.executeArtifactPublish(publication())).toMatchObject({ contentType: 'text/markdown', bytes: 8, kind: 'markdown' })
    await expect(world.executeArtifactPublish(publication({ version: 2, content: 'x'.repeat(ARTIFACT_CAPS.maxMarkdownBytes + 1) }))).rejects.toMatchObject({ code: 'ArtifactTooLarge' })
    await expect(world.executeArtifactPublish(publication({ opts: { title: 'x'.repeat(121) } }))).rejects.toMatchObject({ code: 'ArtifactTooLarge' })
    await expect(world.executeArtifactPublish(publication({ op: 'file' as const, path: '../secret' }))).rejects.toMatchObject({ code: 'ArtifactPathOutsideWorkspace' })
    await expect(world.executeArtifactPublish(publication({ op: 'file' as const, path: 'absent' }))).rejects.toMatchObject({ code: 'ArtifactSourceMissing' })
    await expect(world.executeArtifactPublish(publication({ op: 'file' as const, path: 'absent', opts: { contentType: 'text/plain; charset=utf-8' } }))).rejects.toMatchObject({ code: 'DriverError' })
    const missingStore = await createMiraFlowWorld({ workspacePath: deps.workspacePath })
    await expect(missingStore.executeArtifactPublish(publication())).rejects.toMatchObject({ code: 'ArtifactStoreUnavailable' })
    await symlink(deps.artifactRoot, join(deps.root, 'linked-store'))
    const linked = await createMiraFlowWorld({ ...deps, artifactRoot: join(deps.root, 'linked-store') })
    await expect(linked.executeArtifactPublish(publication())).rejects.toMatchObject({ code: 'ArtifactStoreUnavailable' })
  })

  it('deduplicates concurrent publication atomically and rejects corrupted immutable receipts', async () => {
    const deps = await fixture()
    const world = await createMiraFlowWorld(deps)
    const records = await Promise.all(Array.from({ length: 4 }, () => world.executeArtifactPublish(publication())))
    expect(records.every(record => JSON.stringify(record) === JSON.stringify(records[0]))).toBe(true)
    const next = await world.executeArtifactPublish(publication({ version: 2, content: '# Revision' }))
    expect(next.uri).not.toBe(records[0]!.uri)
    const metadataPath = join(deps.artifactRoot, records[0]!.uri!.split('//')[1]!, 'metadata.json')
    const saved = JSON.parse(await readFile(metadataPath, 'utf8'))
    saved.record.uri = 'mira-artifact://wrong'
    await chmod(metadataPath, 0o600)
    await writeFile(metadataPath, JSON.stringify(saved))
    await expect(world.executeArtifactPublish(publication())).rejects.toMatchObject({ code: 'ArtifactStoreUnavailable' })
  })

  it('rejects a replaced workspace identity and pre-cancelled reads', async () => {
    const deps = await fixture()
    await writeFile(join(deps.workspacePath, 'a.txt'), 'old')
    const world = await createMiraFlowWorld(deps)
    await rename(deps.workspacePath, join(deps.root, 'original'))
    await mkdir(deps.workspacePath)
    await writeFile(join(deps.workspacePath, 'a.txt'), 'replacement')
    await expect(world.executeWorldRead('read', ['a.txt'])).rejects.toMatchObject({ code: 'DriverError' })
    const controller = new AbortController()
    controller.abort()
    const stopped = await createMiraFlowWorld({ ...deps, signal: controller.signal })
    await expect(stopped.executeWorldRead('read', ['a.txt'])).rejects.toMatchObject({ code: 'Cancelled' })
    await expect(stopped.executeArtifactPublish(publication())).rejects.toMatchObject({ code: 'Cancelled' })
  })
})
