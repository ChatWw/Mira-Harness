import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createBashTool, getOrThrow, type ExecutionEnv } from '@earendil-works/pi-agent-core'
import { afterEach, describe, expect, it } from 'vitest'
import { createSandboxedEnv, publicHarnessToolOutput } from '../electron/services/agentTools'

const directories: string[] = []
const environments: ExecutionEnv[] = []
function environment() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-tool-sandbox-')))
  directories.push(root)
  const env = createSandboxedEnv(root)
  environments.push(env)
  return { root, env }
}
async function logFile(env: ExecutionEnv) {
  const path = getOrThrow(await env.createTempFile({ prefix: 'mira-test-', suffix: '.log' }))
  directories.push(dirname(path))
  return path
}
afterEach(async () => {
  for (const env of environments.splice(0)) await env.cleanup()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('tool-owned temporary output in the project filesystem guard', () => {
  it('captures a real command beyond 2000 lines, preserves the full log and reports the bounded tail honestly', async () => {
    const { env } = environment()
    const result = await createBashTool().execute('large-output', { command: "for mira_line in $(seq 1 2005); do printf 'L%04d\\n' \"$mira_line\"; done" }, undefined, undefined, { env })
    const path = result.details?.fullOutputPath!
    expect(path).toBeTruthy()
    directories.push(dirname(path))
    const full = getOrThrow(await env.readTextFile(path))
    expect(full).toBe(Array.from({ length: 2005 }, (_, index) => `L${String(index + 1).padStart(4, '0')}\n`).join(''))
    const output = publicHarnessToolOutput(result)!
    expect(result.details?.truncation?.truncated).toBe(true)
    expect(output.truncated).toBe(true)
    expect(Buffer.byteLength(output.text)).toBeLessThan(64 * 1024)
    expect(output.text).toContain('L2005')
    expect(output.text).not.toContain('L0001')
  })

  it('preserves a Unicode line beyond the byte limit and captures stderr as well as stdout', async () => {
    const { env } = environment()
    const result = await createBashTool().execute('large-unicode', { command: "printf 'STDERR-MARKER\\n' >&2; for mira_index in $(seq 1 18000); do printf '汉'; done; printf 'TAIL-MARKER\\n'" }, undefined, undefined, { env })
    const path = result.details?.fullOutputPath!
    expect(path).toBeTruthy()
    directories.push(dirname(path))
    const full = getOrThrow(await env.readTextFile(path))
    expect(full).toContain('汉'.repeat(18000))
    expect(full).toContain('STDERR-MARKER')
    expect(full).toContain('TAIL-MARKER')
    const output = publicHarnessToolOutput(result)!
    expect(output.truncated).toBe(true)
    expect(output.text).not.toContain('\uFFFD')
    expect(output.text).toContain('TAIL-MARKER')
  })

  it('grants only the allocated file and revokes its access on cleanup without deleting the retained log', async () => {
    const { env, root } = environment()
    const path = await logFile(env)
    expect(path).toBe(realpathSync(path))
    expect((await env.appendFile(path, 'owned output')).ok).toBe(true)
    expect(getOrThrow(await env.readTextFile(path))).toBe('owned output')
    const sibling = join(dirname(path), 'sibling.txt')
    writeFileSync(sibling, 'untouched')
    expect((await env.readTextFile(sibling)).ok).toBe(false)
    expect((await env.appendFile(sibling, 'denied')).ok).toBe(false)
    expect((await env.listDir(dirname(path))).ok).toBe(false)
    expect((await env.remove(dirname(path), { recursive: true })).ok).toBe(false)
    expect((await createSandboxedEnv(root).readTextFile(path)).ok).toBe(false)
    expect(readFileSync(sibling, 'utf8')).toBe('untouched')
    await env.cleanup()
    expect((await env.readTextFile(path)).ok).toBe(false)
    expect(existsSync(path)).toBe(true)
  })

  it('rejects replacement symlinks and directories rather than granting a directory tree or an external file', async () => {
    const { env } = environment()
    const { root: outside } = environment()
    const sentinel = join(outside, 'sentinel.txt')
    writeFileSync(sentinel, 'untouched')
    const path = await logFile(env)
    rmSync(path)
    symlinkSync(sentinel, path)
    expect((await env.appendFile(path, 'denied')).ok).toBe(false)
    expect((await env.readTextFile(path)).ok).toBe(false)
    expect(readFileSync(sentinel, 'utf8')).toBe('untouched')
    rmSync(path)
    expect((await env.appendFile(path, 'must not recreate')).ok).toBe(false)
    expect(existsSync(path)).toBe(false)
    mkdirSync(path)
    writeFileSync(join(path, 'child.txt'), 'retain')
    expect((await env.remove(path, { recursive: true })).ok).toBe(false)
    expect((await env.listDir(path)).ok).toBe(false)
    expect(readFileSync(join(path, 'child.txt'), 'utf8')).toBe('retain')
  })
})
