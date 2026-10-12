import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HarnessHooks, matchesMiraHook } from '../electron/services/harnessHooks'
import { MiraHookStore } from '../electron/storage/miraHookStore'
import { MiraPaths } from '../electron/storage/miraPaths'
import type { MiraHookEvent, MiraHookWrite } from '../src/config/miraHooks'
import type { ToolCallRecord } from '../src/config/harness'

const homes: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'mira-hooks-coordinator-')); homes.push(home)
  const paths = new MiraPaths(home).ensure(); const directory = join(home, 'project'); mkdirSync(directory)
  const store = new MiraHookStore(paths); const controller = new AbortController(); const records: ToolCallRecord[] = []
  const create = () => new HarnessHooks({ store, directory, signal: controller.signal, secrets: ['model-secret'], inputBase: { sessionId: 'session', cwd: directory, runId: 'run', mode: 'default' }, onRecord: record => records.push(record) })
  const save = (output: unknown, event: MiraHookEvent = 'PreToolUse', fields: Partial<MiraHookWrite> = {}) => store.save({ scope: 'global', name: 'Fixture', event, type: 'process', command: process.execPath, args: ['-e', `console.log(${JSON.stringify(JSON.stringify(output))})`], ...fields })
  return { directory, paths, store, controller, records, create, save }
}

describe('Mira Hook matcher semantics', () => {
  it.each([
    [undefined, undefined, true], [undefined, '*', true], ['write', 'write|edit', true], ['rewrite', 'write|edit', false],
    [undefined, 'write', false], ['mira_write', '^mira_(?:write|edit)$', true], ['mira_read', '^mira_(?:write|edit)$', false], ['write', '[', false],
  ] as const)('matches %s against %s = %s', (value, matcher, matched) => { expect(matchesMiraHook(value, matcher)).toBe(matched) })
})

describe('Mira Hook foreground/background coordinator with actual processes and store', () => {
  it('publishes running and actual terminal records with stable IDs, run owner and redacted input/output', async () => {
    const view = fixture(); view.save({ additionalContext: 'context model-secret', hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { text: 'updated' } } })
    const result = await view.create().run('PreToolUse', { toolName: 'mira_read', toolInput: { text: 'model-secret', apiKey: 'other-secret' } }, 'mira_read')
    expect(result).toMatchObject({ contexts: ['context [已隐藏]'], updatedInput: { text: 'updated' } })
    expect(view.records).toHaveLength(2)
    expect(view.records[0]).toMatchObject({ status: 'running', runId: 'run', tool: 'hook' })
    expect(view.records[1]).toMatchObject({ id: view.records[0].id, status: 'ok', completedAt: expect.any(Number) })
    expect(JSON.stringify(view.records)).not.toContain('model-secret'); expect(JSON.stringify(view.records)).not.toContain('other-secret')
    expect(view.records[1].output?.text).toContain('stdout')
  })

  it('skips disabled, different-event and unmatched hooks without processes or records', async () => {
    const view = fixture(); view.save({}, 'PreToolUse', { enabled: false }); view.save({}, 'Stop'); view.save({}, 'PreToolUse', { matcher: 'mira_write|mira_edit' })
    expect(await view.create().run('PreToolUse', {}, 'mira_read')).toEqual({ contexts: [], stopShouldContinue: false })
    expect(view.records).toEqual([])
  })

  it('does not execute untrusted declarations and reports a single clear skipped record', async () => {
    const view = fixture(); const marker = join(view.directory, 'must-not-exist')
    view.save({}, 'UserPromptSubmit', { args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'unsafe')`] })
    const file = join(view.paths.root, 'hooks.json'); const data = JSON.parse(readFileSync(file, 'utf8')); data.hooks[0].name = 'changed'; writeFileSync(file, JSON.stringify(data))
    const coordinator = view.create()
    expect((await coordinator.run('UserPromptSubmit')).blocked).toBeUndefined()
    await coordinator.run('UserPromptSubmit')
    expect(view.records).toHaveLength(1); expect(view.records[0]).toMatchObject({ status: 'cancelled', skipReason: expect.stringContaining('信任') })
    expect(view.records[0].error).toBeUndefined()
    expect(() => readFileSync(marker)).toThrow()
  })

  it('blocks a changed accepted declaration before another event can execute it', async () => {
    const view = fixture(); const item = view.save({ additionalContext: 'accepted' })
    const coordinator = view.create()
    view.store.save({ ...item, scope: 'global', name: 'edited', expectedRevision: item.revision })
    expect(await coordinator.run('PreToolUse')).toMatchObject({ blocked: expect.stringContaining('变化'), contexts: [] })
    expect(view.records).toHaveLength(1); expect(view.records[0].status).toBe('failed')
  })

  it('rechecks trust immediately before spawning even when it changes during stdin preparation', async () => {
    const view = fixture(); const item = view.save({ additionalContext: 'accepted' })
    const coordinator = view.create(); const original = view.store.assert.bind(view.store)
    let calls = 0
    vi.spyOn(view.store, 'assert').mockImplementation((accepted, directory) => {
      calls++
      if (calls === 2) view.store.setEnabled({ scope: item.scope, id: item.id, expectedRevision: item.revision, enabled: false })
      original(accepted, directory)
    })
    expect(await coordinator.run('PreToolUse')).toMatchObject({ blocked: expect.stringContaining('变化') })
    expect(view.records.map(record => record.status)).toEqual(['running', 'failed'])
  })

  it('applies block/approve/context aliases and makes deny and ask dominate allow across hooks', async () => {
    const view = fixture()
    view.save({ decision: 'approve', additionalContext: 'first' })
    view.save({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'confirm', updatedInput: { text: 2 } }, additional_context: 'second' })
    view.save({ continue: false, stopReason: 'blocked model-secret' })
    view.save({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } })
    const outcome = await view.create().run('PreToolUse')
    expect(outcome).toMatchObject({ permission: 'deny', blocked: 'blocked [已隐藏]', contexts: ['first', 'second'], permissionReason: 'confirm', updatedInput: { text: 2 } })
  })

  it('preserves permission request updates/interrupt and denies cannot be overwritten by later allow', async () => {
    const view = fixture()
    view.save({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedInput: { path: 'safe' }, permissionUpdates: [{ type: 'addRules', behavior: 'ask', rules: [{ toolName: 'mira_write' }] }] } } }, 'PermissionRequest')
    const allowed = await view.create().run('PermissionRequest')
    expect(allowed).toMatchObject({ permission: 'allow', updatedInput: { path: 'safe' }, permissionRequest: { behavior: 'allow', permissionUpdates: expect.any(Array) } })
    view.save({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'denied', interrupt: true } } }, 'PermissionRequest')
    view.save({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } }, 'PermissionRequest')
    expect(await view.create().run('PermissionRequest')).toMatchObject({ permission: 'deny', permissionRequest: { behavior: 'deny', interrupt: true, message: 'denied' } })
  })

  it('keeps post-action failures diagnostic without replaying or undoing the tool', async () => {
    const view = fixture(); view.save({ continue: false, reason: 'post failed', additionalContext: 'feedback' }, 'PostToolUse')
    expect(await view.create().run('PostToolUse')).toEqual({ contexts: ['feedback'], stopShouldContinue: false })
    expect(view.records[1]).toMatchObject({ status: 'failed', error: 'post failed' })
  })

  it('maps Stop block into continuation/context and ordinary Stop false into a normal finish', async () => {
    const view = fixture(); const item = view.save({ decision: 'block', reason: 'continue reason', systemMessage: 'system', additional_context: 'context' }, 'Stop')
    expect(await view.create().run('Stop')).toEqual({ stopShouldContinue: true, stopReason: 'continue reason', contexts: ['system', 'continue reason', 'context'] })
    view.store.save({ ...item, args: ['-e', 'console.log(JSON.stringify({continue:false}))'], expectedRevision: item.revision })
    expect(await view.create().run('Stop')).toEqual({ contexts: [], stopShouldContinue: false })
    expect(view.records.at(-1)?.status).toBe('ok')
  })

  it('records command failures and JSON event errors while allowing ordinary foreground execution to continue', async () => {
    const view = fixture(); view.save({}, 'PreToolUse', { args: ['-e', 'console.error("diagnostic model-secret");process.exit(1)'] })
    view.save({ hookSpecificOutput: { hookEventName: 'Stop' } })
    expect(await view.create().run('PreToolUse')).toEqual({ contexts: [], stopShouldContinue: false })
    expect(view.records.map(record => record.status)).toEqual(['running', 'failed', 'running', 'failed'])
    expect(view.records[1].output?.text).toContain('diagnostic [已隐藏]')
  })

  it('launches command async Hooks without foreground decisions and drains their real terminal output', async () => {
    const view = fixture()
    const script = `setTimeout(()=>console.log(JSON.stringify({continue:false,additionalContext:'ignored'})),250)`
    view.save({}, 'UserPromptSubmit', { type: 'command', command: `"${process.execPath}" -e ${JSON.stringify(script)}`, async: true, args: [] })
    const coordinator = view.create()
    expect(await coordinator.run('UserPromptSubmit')).toEqual({ contexts: [], stopShouldContinue: false })
    expect(view.records.map(record => record.status)).toEqual(['running'])
    await coordinator.drain()
    expect(view.records.map(record => record.status)).toEqual(['running', 'ok'])
    expect(view.records[1].output?.text).toContain('ignored')
  })

  it('retains ownership of async processes and fully closes them on parent cancellation', async () => {
    const view = fixture(); const marker = join(view.directory, 'pid')
    const script = `require('fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000)`
    view.save({}, 'UserPromptSubmit', { type: 'command', command: `"${process.execPath}" -e ${JSON.stringify(script)}`, async: true, args: [] })
    const coordinator = view.create(); await coordinator.run('UserPromptSubmit')
    const deadline = Date.now() + 2000
    let pid = 0
    while (!pid && Date.now() < deadline) { try { pid = Number(readFileSync(marker, 'utf8')) } catch { await new Promise(resolve => setTimeout(resolve, 10)) } }
    expect(pid).toBeGreaterThan(0); view.controller.abort(); await coordinator.close()
    expect(view.records.at(-1)?.status).toBe('cancelled')
    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('treats process async flags as foreground, matching ZCode execution semantics', async () => {
    const view = fixture(); view.save({ additionalContext: 'foreground' }, 'UserPromptSubmit', { async: true })
    expect(await view.create().run('UserPromptSubmit')).toMatchObject({ contexts: ['foreground'] })
    expect(view.records.map(record => record.status)).toEqual(['running', 'ok'])
  })

  it('can close background work after a runtime failure without aborting the parent run', async () => {
    const view = fixture()
    view.save({}, 'UserPromptSubmit', { type: 'command', command: `"${process.execPath}" -e "setInterval(()=>{},1000)"`, async: true, args: [] })
    const coordinator = view.create(); await coordinator.run('UserPromptSubmit')
    await coordinator.close()
    expect(view.controller.signal.aborted).toBe(false)
    expect(view.records.at(-1)?.status).toBe('cancelled')
  })

  it('does nothing after the parent signal is already stopped', async () => {
    const view = fixture(); view.save({ additionalContext: 'never' }); const coordinator = view.create(); view.controller.abort()
    expect(await coordinator.run('PreToolUse')).toEqual({ contexts: [], stopShouldContinue: false }); expect(view.records).toEqual([])
  })

  it('runs global Hooks for personal tasks without reading a project catalog', async () => {
    const view = fixture(); view.save({ additionalContext: 'personal' }, 'UserPromptSubmit')
    const list = vi.spyOn(view.store, 'list')
    const assert = vi.spyOn(view.store, 'assert')
    const records: ToolCallRecord[] = []
    const coordinator = new HarnessHooks({ store: view.store, signal: view.controller.signal, inputBase: { sessionId: 'personal', cwd: view.directory, runId: 'personal-run' }, onRecord: record => records.push(record) })
    expect(await coordinator.run('UserPromptSubmit')).toMatchObject({ contexts: ['personal'] })
    expect(list).toHaveBeenCalledWith(undefined)
    expect(assert.mock.calls.every(([, directory]) => directory === undefined)).toBe(true)
    expect(records.at(-1)).toMatchObject({ runId: 'personal-run', status: 'ok' })
    await coordinator.close()
  })
})
