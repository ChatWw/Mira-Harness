import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { resolveMiraRipgrepPath } from '../electron/services/miraRuntimeTools'
import { createMiraFlowWorld } from '../electron/services/flows/miraFlowWorld'
import { WORLD_READ_CAPS } from '../packages/mira-flow-kit/src/mira-index'

let root: string, appPath: string, resourcesPath: string, workspacePath: string, emptyPath: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mira-bundled-search-'))
  appPath = join(root, 'app'); resourcesPath = join(root, 'resources'); workspacePath = join(root, 'workspace'); emptyPath = join(root, 'empty-path')
  await Promise.all([mkdir(workspacePath), mkdir(emptyPath)])
  execFileSync(process.execPath, ['--input-type=module', '-e', 'import {buildMiraTools} from "./scripts/build-mira-tools.mjs"; await buildMiraTools({output: process.argv[1]});', join(appPath, 'dist/mira-tools')], { cwd: resolve('.') })
  await cp(join(appPath, 'dist/mira-tools'), join(resourcesPath, 'tools'), { recursive: true })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

describe('Mira app-owned search runtime', () => {
  it('resolves development, packaged and Windows paths without consulting PATH', () => {
    expect(resolveMiraRipgrepPath({ appPath, platform: 'darwin' })).toBe(join(appPath, 'dist/mira-tools/ripgrep/rg'))
    expect(resolveMiraRipgrepPath({ appPath, isPackaged: true, resourcesPath, platform: 'win32' })).toBe(join(resourcesPath, 'tools/ripgrep/rg.exe'))
    expect(() => resolveMiraRipgrepPath({ appPath, isPackaged: true })).toThrow('resources path')
  })

  it.each([false, true])('runs actual Unicode/newline searches and invalid regex with empty PATH (packaged=%s)', async isPackaged => {
    vi.stubEnv('PATH', emptyPath)
    // Reproduce the former system-only failure before checking the app-owned executable.
    const systemOnly = await createMiraFlowWorld({ workspacePath })
    await expect(systemOnly.executeWorldRead('grep', ['你好'])).rejects.toMatchObject({ code: 'DriverError', message: expect.stringContaining('Unable to run rg:') })
    const ripgrepPath = resolveMiraRipgrepPath({ appPath, resourcesPath, isPackaged })
    await writeFile(join(workspacePath, '问\n答.md'), 'Mira 你好\nsecond\n')
    const world = await createMiraFlowWorld({ workspacePath, ripgrepPath })
    expect(await world.executeWorldRead('grep', ['你好', '*.md'])).toEqual([{ path: '问\n答.md', line: 1, text: 'Mira 你好' }])
    expect(await world.executeWorldRead('grep', ['absent'])).toEqual([])
    await expect(world.executeWorldRead('grep', ['['])).rejects.toMatchObject({ code: 'DriverError' })
  })

  it('rejects excess matches with empty PATH instead of silently truncating', async () => {
    vi.stubEnv('PATH', emptyPath)
    await writeFile(join(workspacePath, 'large.txt'), 'bounded-hit\n'.repeat(WORLD_READ_CAPS.grepMaxMatches + 1))
    const world = await createMiraFlowWorld({ workspacePath, ripgrepPath: resolveMiraRipgrepPath({ appPath }) })
    await expect(world.executeWorldRead('grep', ['bounded-hit'])).rejects.toMatchObject({ code: 'WorldReadCapExceeded' })
    await writeFile(join(workspacePath, 'large.txt'), 'bounded-hit\n'.repeat(WORLD_READ_CAPS.grepMaxMatches))
    expect(await world.executeWorldRead('grep', ['bounded-hit'])).toHaveLength(WORLD_READ_CAPS.grepMaxMatches)
  })

  it('cancels after the real search subprocess has been spawned', async () => {
    vi.stubEnv('PATH', emptyPath)
    const controller = new AbortController()
    const add = controller.signal.addEventListener.bind(controller.signal)
    let attached = false
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation((type, listener, options) => {
      add(type, listener, options)
      if (type === 'abort') { attached = true; queueMicrotask(() => controller.abort()) }
    })
    const world = await createMiraFlowWorld({ workspacePath, signal: controller.signal, ripgrepPath: resolveMiraRipgrepPath({ appPath }) })
    await expect(world.executeWorldRead('grep', ['你好'])).rejects.toMatchObject({ code: 'Cancelled' })
    expect(attached).toBe(true)
  })

  it('preserves explicit overrides and diagnoses missing/unexecutable resources without a PATH fallback', async () => {
    vi.stubEnv('PATH', emptyPath)
    const missing = join(root, 'missing-rg')
    const world = await createMiraFlowWorld({ workspacePath, ripgrepPath: missing })
    await expect(world.executeWorldRead('grep', ['你好'])).rejects.toMatchObject({ code: 'DriverError', message: expect.stringContaining(missing) })
    if (process.platform === 'win32') return
    const broken = join(root, 'broken-rg')
    await writeFile(broken, 'not executable'); await chmod(broken, 0o600)
    const unavailable = await createMiraFlowWorld({ workspacePath, ripgrepPath: broken })
    await expect(unavailable.executeWorldRead('grep', ['你好'])).rejects.toMatchObject({ code: 'DriverError', message: expect.stringContaining(broken) })
  })

  it('copies upstream notices next to the actual executable and rejects an unavailable target before packaging', async () => {
    const directory = join(resourcesPath, 'tools/ripgrep')
    expect(await readFile(join(directory, 'VSCODE-RIPGREP-LICENSE'), 'utf8')).toContain('Microsoft Corporation')
    expect(await readFile(join(directory, 'licenses/RIPGREP-LICENSE-MIT'), 'utf8')).toContain('Andrew Gallant')
    expect(await readFile(join(directory, 'licenses/PCRE2-LICENCE.md'), 'utf8')).toContain('BSD-3-Clause WITH PCRE2-exception')
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', 'import {buildMiraTools} from "./scripts/build-mira-tools.mjs"; await buildMiraTools({platform: "missing", arch: "target", output: process.argv[1]});', join(root, 'invalid')], { cwd: resolve('.'), stdio: 'pipe' })).toThrow('Mira search tool missing for missing-target')
    const manifest = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
    expect(manifest.build.beforePack).toBe('./scripts/build-mira-tools.mjs')
    expect(manifest.build.extraResources).toContainEqual({ from: 'dist/mira-tools/ripgrep', to: 'tools/ripgrep', filter: ['**/*'] })
  })
})
