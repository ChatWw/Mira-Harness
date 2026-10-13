import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBashTool } from '@earendil-works/pi-agent-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiraCommandJobs } from '../electron/services/miraCommandJobs'
import { createSandboxedEnv, publicHarnessToolOutput } from '../electron/services/agentTools'
import type { MiraCommandJob } from '../src/config/miraCommandJobs'

const resources: Array<{ root: string; jobs: MiraCommandJobs }> = []
afterEach(async () => { for (const { root, jobs } of resources.splice(0)) { await jobs.dispose(); rmSync(root, { recursive: true, force: true }) } })
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mira-command-jobs-')), jobs = new MiraCommandJobs()
  resources.push({ root, jobs })
  const env = createSandboxedEnv(root), tool = createBashTool(), parent = new AbortController(), snapshots: MiraCommandJob[] = []
  const identity = { sessionId: 'task-A', runId: 'run-one', toolId: 'canonical-command', directory: root }
  const execute = (source: string, options: { explicit?: boolean; deadlineSeconds?: number; allowBackground?: boolean } = {}) => jobs.execute(identity, {
    explicit: options.explicit ?? false, deadlineSeconds: options.deadlineSeconds, signal: parent.signal,
    allowBackground: options.allowBackground,
    run: (signal, update) => tool.execute('provider-id', { command: quote(process.execPath) + ' -e ' + quote(source) }, signal, update, { env }),
    output: result => publicHarnessToolOutput(result, ['sensitive-key']), publish: job => snapshots.push(job),
  })
  const waiting = `const fs=require('node:fs');fs.writeFileSync('started','yes');console.log('sensitive-key first');const t=setInterval(()=>{if(fs.existsSync('done')){console.error('last');clearInterval(t)}},20);setTimeout(()=>clearInterval(t),10000).unref()`
  return { root, jobs, parent, snapshots, identity, execute, waiting }
}

describe('real independent command lifecycle', () => {
  it('rejects explicit background before execution and blocks manual/automatic background for unattended jobs', async () => {
    const f = fixture()
    await expect(f.execute(f.waiting, { explicit: true, allowBackground: false })).rejects.toThrow('自动化')
    expect(existsSync(join(f.root, 'started'))).toBe(false)
    const execution = f.execute(f.waiting, { deadlineSeconds: 0.001, allowBackground: false })
    await vi.waitFor(() => expect(existsSync(join(f.root, 'started'))).toBe(true))
    expect(() => f.jobs.background('task-A', 'run-one', 'canonical-command')).toThrow()
    expect(f.snapshots.at(-1)).toMatchObject({ mode: 'foreground', backgroundAllowed: false })
    writeFileSync(join(f.root, 'done'), ''); await execution
    expect(f.snapshots.at(-1)?.mode).toBe('foreground')
  })
  it('drains only the exact registry-owned processes, leaving sibling background work running', async () => {
    const f = fixture(), sibling = new AbortController()
    await f.execute(f.waiting, { explicit: true })
    await f.jobs.execute({ ...f.identity, toolId: 'sibling' }, { explicit: true, run: signal => new Promise((_done, fail) => signal.addEventListener('abort', () => { sibling.abort(); fail(new Error('stopped')) }, { once: true })), output: () => undefined, publish: () => {} })
    await f.jobs.stopOwned('task-A', 'wrong-run', ['canonical-command'])
    expect(f.jobs.identities()).toHaveLength(2)
    await f.jobs.stopOwned('task-A', 'run-one', ['canonical-command'])
    expect(f.jobs.identities().map(identity => identity.toolId)).toEqual(['sibling'])
    expect(sibling.signal.aborted).toBe(false)
  })
  it('keeps foreground output/results and terminal snapshots in one execution', async () => {
    const f = fixture(), result = await f.execute("console.log('sensitive-key stdout');console.error('stderr')")
    expect(result.content[0].text).toContain('stdout')
    expect(f.snapshots.at(-1)).toMatchObject({ mode: 'foreground', status: 'completed', output: { text: '[已隐藏] stdout\nstderr\n' } })
    expect(f.jobs.identities()).toEqual([])
  })
  it('moves the same real process to background, releases its caller and survives parent abort', async () => {
    const f = fixture(), result = f.execute(f.waiting)
    await vi.waitFor(() => expect(existsSync(join(f.root, 'started'))).toBe(true))
    f.jobs.background('task-A', 'run-one', 'canonical-command')
    expect((await result).details).toEqual({ miraBackgroundCommand: 'canonical-command' })
    f.parent.abort()
    expect(f.jobs.identities()).toHaveLength(1)
    writeFileSync(join(f.root, 'done'), '')
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.status).toBe('completed'))
    expect(f.snapshots.at(-1)?.output?.text).toContain('last')
    expect(f.snapshots.filter(job => job.mode === 'background').map(job => job.revision)).toEqual([...new Set(f.snapshots.filter(job => job.mode === 'background').map(job => job.revision))])
    expect(JSON.stringify(f.snapshots)).not.toContain('sensitive-key')
    expect(() => f.jobs.background('task-A', 'run-one', 'canonical-command')).toThrow()
  })
  it('runs explicitly in background and rejects wrong session/run control before stopping its real process', async () => {
    const f = fixture()
    await f.execute(f.waiting, { explicit: true })
    await vi.waitFor(() => expect(existsSync(join(f.root, 'started'))).toBe(true))
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.output?.text).toContain('first'))
    await expect(f.jobs.stop('task-B', 'run-one', 'canonical-command')).rejects.toThrow()
    await expect(f.jobs.stop('task-A', 'other-run', 'canonical-command')).rejects.toThrow()
    await f.jobs.stop('task-A', 'run-one', 'canonical-command')
    expect(f.snapshots.at(-1)).toMatchObject({ mode: 'background', status: 'cancelled', output: { text: '[已隐藏] first\n' } })
    expect(f.jobs.identities()).toEqual([])
    writeFileSync(join(f.root, 'done'), '')
    expect(f.snapshots.at(-1)?.output?.text).not.toContain('last')
  })
  it('automatically releases a slow foreground command and lets it really finish later', async () => {
    const f = fixture()
    const result = await f.execute(f.waiting, { deadlineSeconds: 0.05 })
    expect(result.details.miraBackgroundCommand).toBe('canonical-command')
    writeFileSync(join(f.root, 'done'), '')
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.status).toBe('completed'))
  })
  it('cancels foreground execution with its parent and shutdown drains background processes', async () => {
    const f = fixture(), foreground = f.execute(f.waiting)
    const settled = foreground.catch(error => error)
    await vi.waitFor(() => expect(existsSync(join(f.root, 'started'))).toBe(true))
    f.parent.abort(); expect(await settled).toBeInstanceOf(Error)
    expect(f.snapshots.at(-1)?.status).toBe('cancelled')
    const next = fixture(); await next.execute(next.waiting, { explicit: true })
    await vi.waitFor(() => expect(existsSync(join(next.root, 'started'))).toBe(true))
    await next.jobs.dispose()
    expect(next.snapshots.at(-1)?.status).toBe('cancelled')
    await expect(next.execute('')).rejects.toThrow('退出')
  })
  it('reports execution failure independently from the successful background launch', async () => {
    const f = fixture(), result = await f.execute("console.error('failure');process.exit(7)", { explicit: true })
    expect(result.details.miraBackgroundCommand).toBeTruthy()
    await vi.waitFor(() => expect(f.snapshots.at(-1)?.status).toBe('failed'))
    expect(f.snapshots.at(-1)?.error).toContain('code 7')
  })
  it('refuses duplicate live identity and invalid waiting deadlines', async () => {
    const f = fixture(); await f.execute(f.waiting, { explicit: true })
    await expect(f.execute('')).rejects.toThrow('已经')
    const invalid = fixture()
    await expect(invalid.execute('', { deadlineSeconds: NaN })).rejects.toThrow('等待时间')
    expect(invalid.jobs.identities()).toEqual([])
  })
  it('drains the started execution when explicit background publication fails', async () => {
    const f = fixture(), tool = createBashTool()
    let drained = false
    const outcome = f.jobs.execute(f.identity, {
      explicit: true,
      run: (signal, update) => tool.execute('provider-id', { command: quote(process.execPath) + ' -e ' + quote(f.waiting) }, signal, update, { env: createSandboxedEnv(f.root) }).finally(() => { drained = true }),
      output: result => publicHarnessToolOutput(result),
      publish: job => {
        f.snapshots.push(job)
        if (job.mode === 'background' && job.status === 'running') throw new Error('background snapshot failed')
      },
    })
    await expect(outcome).rejects.toThrow('background snapshot failed')
    await vi.waitFor(() => { expect(drained).toBe(true); expect(f.jobs.identities()).toEqual([]) })
    expect(f.snapshots.at(-1)?.status).toBe('cancelled')
  })
})
