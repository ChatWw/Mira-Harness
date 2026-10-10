import { describe, expect, it } from 'vitest'
import { miraAppNavigationShortcut, readMiraAppNavigationCommand, readMiraAppNavigationSnapshot, readMiraAppNavigationState, readMiraAppNavigationTarget } from '../src/platform/appNavigation'

const snapshot = () => ({ entries: [{ kind: 'conversation', sessionId: 'session-a' }], cursor: 0, detached: false })
const state = () => ({ type: 'mira:app-navigation-state', revision: 0, canGoBack: false, canGoForward: false, busy: false, snapshot: snapshot() })
const command = () => ({ type: 'mira:app-navigation-command', direction: 'back', expectedRevision: 0 })
const key = (overrides = {}) => ({ key: '[', metaKey: true, ctrlKey: false, ...overrides })

describe('Mira application navigation contract', () => {
  it('reads bounded conversation and extension targets without sharing mutable input', () => {
    const input = snapshot()
    const result = readMiraAppNavigationSnapshot(input)!
    expect(result).toEqual(input)
    expect(result).not.toBe(input)
    expect(result.entries).not.toBe(input.entries)
    expect(result.entries[0]).not.toBe(input.entries[0])
    expect(readMiraAppNavigationTarget({ kind: 'extensions' })).toEqual({ kind: 'extensions' })
    expect(readMiraAppNavigationTarget({ kind: 'conversation', sessionId: 'a'.repeat(128) })).toBeDefined()
  })

  it('normalizes omitted, undefined and explicit automation defaults to the same target', () => {
    const expected = { kind: 'automations' }
    expect(readMiraAppNavigationTarget(expected)).toEqual(expected)
    expect(readMiraAppNavigationTarget({ ...expected, taskId: undefined, tab: undefined, runTaskId: undefined })).toEqual(expected)
    expect(readMiraAppNavigationTarget({ ...expected, tab: 'settings', section: 'tasks', filter: 'all', runStatus: 'all' })).toEqual(expected)
    const detail = { kind: 'automations', taskId: 'automation-a', tab: 'history', section: 'runs', filter: 'ended', runTaskId: 'automation-b', runStatus: 'skipped' }
    expect(readMiraAppNavigationTarget(detail)).toEqual(detail)
  })

  it.each(['running', 'completed', 'failed', 'interrupted', 'skipped'])('preserves the actual automation run status %s', runStatus => {
    expect(readMiraAppNavigationTarget({ kind: 'automations', runStatus })).toEqual({ kind: 'automations', runStatus })
  })

  it.each(['', ' ', ' a', 'a ', 'a\n', 'a\u0000', 'a'.repeat(129), 1, null])('rejects an invalid target ID %j in every ID field', id => {
    expect(readMiraAppNavigationTarget({ kind: 'conversation', sessionId: id })).toBeUndefined()
    expect(readMiraAppNavigationTarget({ kind: 'automations', taskId: id })).toBeUndefined()
    expect(readMiraAppNavigationTarget({ kind: 'automations', runTaskId: id })).toBeUndefined()
  })

  it.each([
    null, [], {}, { kind: 'draft' }, { kind: 'conversation' },
    { kind: 'conversation', sessionId: 'a', projectId: 'injected' }, { kind: 'extensions', sessionId: 'a' },
    { kind: 'automations', tab: 'workflow' }, { kind: 'automations', section: 'unknown' },
    { kind: 'automations', filter: 'running' }, { kind: 'automations', runStatus: 'cancelled' },
    { kind: 'automations', filter: null }, { kind: 'automations', path: '/arbitrary' },
  ])('rejects unsupported target fields %j', target => { expect(readMiraAppNavigationTarget(target)).toBeUndefined() })

  it('accepts empty and 50-entry histories with a valid cursor, including a detached draft', () => {
    expect(readMiraAppNavigationSnapshot({ entries: [], cursor: -1, detached: false })).toBeDefined()
    expect(readMiraAppNavigationSnapshot({ entries: [], cursor: -1, detached: true })).toBeDefined()
    expect(readMiraAppNavigationSnapshot({ entries: Array.from({ length: 50 }, (_, index) => ({ kind: 'conversation', sessionId: String(index) })), cursor: 49, detached: true })).toBeDefined()
  })

  it('restores both draft views while preserving snapshots that predate draft metadata', () => {
    for (const draft of ['conversation', 'automations'] as const) {
      const input = { ...snapshot(), detached: true, draft }
      expect(readMiraAppNavigationSnapshot(input)).toEqual(input)
      expect(readMiraAppNavigationState({ ...state(), snapshot: input })?.snapshot.draft).toBe(draft)
    }
    expect(readMiraAppNavigationSnapshot({ ...snapshot(), detached: true })).toEqual({ ...snapshot(), detached: true })
    expect(readMiraAppNavigationSnapshot({ entries: [], cursor: -1, detached: true, draft: 'automations' })).toBeDefined()
  })

  it.each(['extensions', '', null, 1, {}, []])('rejects an invalid draft kind %j', draft => {
    expect(readMiraAppNavigationSnapshot({ ...snapshot(), detached: true, draft })).toBeUndefined()
  })

  it.each(['conversation', 'automations'])('rejects attached histories marked as a %s draft', draft => {
    expect(readMiraAppNavigationSnapshot({ ...snapshot(), draft })).toBeUndefined()
  })

  it.each([
    undefined, {}, { ...snapshot(), cursor: -1 }, { ...snapshot(), cursor: 1 }, { ...snapshot(), cursor: 0.5 },
    { ...snapshot(), cursor: NaN }, { ...snapshot(), cursor: Infinity }, { ...snapshot(), detached: 0 },
    { entries: [], cursor: 0, detached: false }, { ...snapshot(), entries: new Array(1) },
    { ...snapshot(), entries: Array.from({ length: 51 }, () => ({ kind: 'extensions' })) },
    { ...snapshot(), entries: [{ kind: 'conversation', sessionId: '' }] }, { ...snapshot(), unknown: true },
  ])('rejects malformed snapshots %j', input => { expect(readMiraAppNavigationSnapshot(input)).toBeUndefined() })

  it('requires a valid snapshot instead of treating a missing snapshot as empty', () => {
    expect(readMiraAppNavigationState(state())).toEqual(state())
    const { snapshot: _omitted, ...missing } = state()
    expect(readMiraAppNavigationState(missing)).toBeUndefined()
    expect(readMiraAppNavigationState({ ...state(), snapshot: undefined })).toBeUndefined()
    expect(readMiraAppNavigationState({ ...state(), snapshot: { entries: [], cursor: -1, detached: false } })).toBeDefined()
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', null])('rejects an unsafe revision %j in both directions', revision => {
    expect(readMiraAppNavigationState({ ...state(), revision })).toBeUndefined()
    expect(readMiraAppNavigationCommand({ ...command(), expectedRevision: revision })).toBeUndefined()
  })

  it('rejects malformed state and command payloads and unknown fields', () => {
    for (const field of ['canGoBack', 'canGoForward', 'busy']) expect(readMiraAppNavigationState({ ...state(), [field]: 1 })).toBeUndefined()
    expect(readMiraAppNavigationState({ ...state(), type: 'mira:browser-event' })).toBeUndefined()
    expect(readMiraAppNavigationState({ ...state(), appId: 'mira-novel-studio' })).toBeUndefined()
    expect(readMiraAppNavigationCommand(command())).toEqual(command())
    expect(readMiraAppNavigationCommand({ ...command(), direction: 'forward', expectedRevision: Number.MAX_SAFE_INTEGER })).toBeDefined()
    for (const input of [null, [], {}, { ...command(), direction: 'reload' }, { ...command(), type: 'mira:request' }, { ...command(), path: '/settings' }]) expect(readMiraAppNavigationCommand(input)).toBeUndefined()
  })
})

describe('Mira history navigation shortcuts', () => {
  it('uses only the platform modifier, leaving macOS terminal Ctrl+[ unchanged', () => {
    expect(miraAppNavigationShortcut(key(), 'MacIntel')).toBe('back')
    expect(miraAppNavigationShortcut(key({ metaKey: false, ctrlKey: true }), 'MacIntel')).toBeUndefined()
    expect(miraAppNavigationShortcut(key({ ctrlKey: true }), 'MacIntel')).toBeUndefined()
    expect(miraAppNavigationShortcut(key({ metaKey: false, ctrlKey: true }), 'Win32')).toBe('back')
    expect(miraAppNavigationShortcut(key(), 'Win32')).toBeUndefined()
    expect(miraAppNavigationShortcut(key({ ctrlKey: true }), 'Linux x86_64')).toBeUndefined()
  })

  it('supports Cmd/Ctrl bracket keys and physical bracket positions on other layouts', () => {
    expect(miraAppNavigationShortcut(key(), '')).toBe('back')
    expect(miraAppNavigationShortcut(key({ key: ']', metaKey: false, ctrlKey: true }), '')).toBe('forward')
    expect(miraAppNavigationShortcut(key({ key: 'å', code: 'BracketLeft' }), '')).toBe('back')
    expect(miraAppNavigationShortcut(key({ key: 'Dead', code: 'BracketRight' }), '')).toBe('forward')
  })

  it.each([
    { metaKey: false }, { shiftKey: true }, { altKey: true }, { repeat: true },
    { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }, { key: 'n' },
  ])('leaves other shortcuts, repeats and IME input alone %j', overrides => {
    expect(miraAppNavigationShortcut(key(overrides))).toBeUndefined()
  })
})
