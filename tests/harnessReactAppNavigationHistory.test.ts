import { describe, expect, it } from 'vitest'
import type { MiraAppNavigationSnapshot, MiraAppNavigationTarget } from '../src/platform/appNavigation'
import { detachMiraNavigation, emptyMiraNavigationHistory, planMiraNavigation, recordMiraNavigation, removeMiraNavigationAutomation, removeMiraNavigationSession } from '../apps/harness-react/src/lib/app-navigation-history'

const conversation = (sessionId: string): MiraAppNavigationTarget => ({ kind: 'conversation', sessionId })
const stack = (...targets: MiraAppNavigationTarget[]) => targets.reduce(recordMiraNavigation, emptyMiraNavigationHistory())

describe('Mira guarded application navigation history', () => {
  it('has no targets in an empty or detached empty history', () => {
    const empty = emptyMiraNavigationHistory()
    expect(empty).toEqual({ entries: [], cursor: -1, detached: false })
    expect(planMiraNavigation(empty, 'back')).toBeUndefined()
    expect(planMiraNavigation(empty, 'forward')).toBeUndefined()
    expect(planMiraNavigation(detachMiraNavigation(empty), 'back')).toBeUndefined()
  })

  it('deduplicates adjacent targets and explicit default automation views', () => {
    const history = stack(conversation('a'))
    expect(recordMiraNavigation(history, conversation('a'))).toBe(history)
    const automation = recordMiraNavigation(history, { kind: 'automations' })
    expect(recordMiraNavigation(automation, { kind: 'automations', tab: 'settings', section: 'tasks', filter: 'all', runStatus: 'all' })).toBe(automation)
  })

  it('distinguishes automation details, tabs, sections and filters', () => {
    const history = stack({ kind: 'automations' }, { kind: 'automations', taskId: 'a' }, { kind: 'automations', taskId: 'a', tab: 'history' }, { kind: 'automations', section: 'runs', runTaskId: 'a' }, { kind: 'automations', section: 'runs', runTaskId: 'a', runStatus: 'failed' }, { kind: 'extensions' })
    expect(history.entries).toHaveLength(6)
  })

  it('plans back and forward without mutating or prematurely committing the current cursor', () => {
    const history = stack(conversation('a'), conversation('b'), conversation('c'))
    Object.freeze(history); Object.freeze(history.entries)
    const plan = planMiraNavigation(history, 'back')!
    expect(plan.target).toEqual(conversation('b'))
    expect(plan.history.cursor).toBe(1)
    expect(history.cursor).toBe(2)
    expect(planMiraNavigation(plan.history, 'forward')!.target).toEqual(conversation('c'))
    // A failed save/open simply keeps history; the same retry still targets b.
    expect(planMiraNavigation(history, 'back')!.target).toEqual(conversation('b'))
    expect(plan.history.entries).toBe(history.entries)
  })

  it('truncates forward history only after a new destination succeeds', () => {
    const history = stack(conversation('a'), conversation('b'), conversation('c'))
    const previous = planMiraNavigation(history, 'back')!.history
    const next = recordMiraNavigation(previous, { kind: 'extensions' })
    expect(next.entries).toEqual([conversation('a'), conversation('b'), { kind: 'extensions' }])
    expect(planMiraNavigation(next, 'forward')).toBeUndefined()
    expect(history.entries).toHaveLength(3)
  })

  it('caps history at 50 targets and keeps the cursor on the newest target', () => {
    let history = emptyMiraNavigationHistory()
    for (let index = 0; index < 80; index++) history = recordMiraNavigation(history, conversation(String(index)))
    expect(history.entries).toHaveLength(50)
    expect(history.cursor).toBe(49)
    expect(history.entries[0]).toEqual(conversation('30'))
    expect(history.entries[49]).toEqual(conversation('79'))
    for (let index = 0; index < 49; index++) history = planMiraNavigation(history, 'back')!.history
    expect(planMiraNavigation(history, 'back')).toBeUndefined()
  })

  it('leaves a draft outside the stack and first backs to the entry at the original cursor', () => {
    const history = stack(conversation('a'), conversation('b'))
    const draft = detachMiraNavigation(history)
    expect(draft.entries).toBe(history.entries)
    expect(draft.cursor).toBe(1)
    expect(detachMiraNavigation(draft)).toBe(draft)
    expect(planMiraNavigation(draft, 'forward')).toBeUndefined()
    const plan = planMiraNavigation(draft, 'back')!
    expect(plan.target).toEqual(conversation('b'))
    expect(plan.history).toEqual(history)
    expect(draft.detached).toBe(true)
  })

  it('returns to a single existing task from a draft without creating a new entry', () => {
    const history = stack(conversation('a'))
    const draft = detachMiraNavigation(history)
    const returned = recordMiraNavigation(draft, conversation('a'))
    expect(returned).toEqual(history)
    expect(returned.entries).toHaveLength(1)
    expect(planMiraNavigation(draft, 'back')!.target).toEqual(conversation('a'))
  })

  it('keeps the currently displayed target identity when deleting earlier task entries', () => {
    const history = stack(conversation('a'), { kind: 'automations' }, conversation('a'), conversation('b'), { kind: 'extensions' })
    const current = planMiraNavigation(history, 'back')!.history
    const filtered = removeMiraNavigationSession(current, 'a')
    expect(filtered.entries).toEqual([{ kind: 'automations' }, conversation('b'), { kind: 'extensions' }])
    expect(filtered.entries[filtered.cursor]).toBe(current.entries[current.cursor])
    expect(filtered.detached).toBe(false)
    expect(planMiraNavigation(filtered, 'forward')!.target).toEqual({ kind: 'extensions' })
  })

  it('detaches after deleting the current target so back must actually open a remaining target', () => {
    const history = stack(conversation('a'), conversation('b'), { kind: 'extensions' })
    const current = planMiraNavigation(history, 'back')!.history
    const filtered = removeMiraNavigationSession(current, 'b')
    expect(filtered.detached).toBe(true)
    expect(planMiraNavigation(filtered, 'forward')).toBeUndefined()
    expect(planMiraNavigation(filtered, 'back')!.target).toEqual(filtered.entries[filtered.cursor])
    expect(current.detached).toBe(false)
  })

  it('handles deleting the only target and preserves an already detached draft', () => {
    const removed = removeMiraNavigationSession(stack(conversation('a')), 'a')
    expect(removed).toEqual({ entries: [], cursor: -1, detached: true })
    expect(planMiraNavigation(removed, 'back')).toBeUndefined()
    const draft = detachMiraNavigation(stack(conversation('a'), conversation('b')))
    expect(removeMiraNavigationSession(draft, 'a')).toEqual({ entries: [conversation('b')], cursor: 0, detached: true, draft: 'conversation' })
  })

  it('preserves an automation draft across unrelated deletion and switches its draft identity explicitly', () => {
    const history = stack(conversation('a'), conversation('b'))
    const draft = detachMiraNavigation(history, 'automations')
    expect(draft.draft).toBe('automations')
    expect(detachMiraNavigation(draft, 'automations')).toBe(draft)
    expect(removeMiraNavigationSession(draft, 'a').draft).toBe('automations')
    expect(detachMiraNavigation(draft).draft).toBe('conversation')
  })

  it('clears draft metadata on committed or planned navigation without inventing drafts for deletion', () => {
    const history = stack(conversation('a'), conversation('b'))
    const draft = detachMiraNavigation(history, 'automations')
    expect(recordMiraNavigation(draft, conversation('b'))).not.toHaveProperty('draft')
    expect(recordMiraNavigation(draft, { kind: 'extensions' })).not.toHaveProperty('draft')
    expect(planMiraNavigation(draft, 'back')!.history).not.toHaveProperty('draft')
    expect(removeMiraNavigationSession(history, 'b')).not.toHaveProperty('draft')
    expect(draft.draft).toBe('automations')
  })

  it('prunes deleted automation details and their filtered run views while retaining other pages', () => {
    const history = stack({ kind: 'automations' }, { kind: 'automations', taskId: 'a', tab: 'history' }, { kind: 'automations', section: 'runs', runTaskId: 'a' }, { kind: 'automations', taskId: 'b' }, conversation('a'), { kind: 'extensions' })
    const filtered = removeMiraNavigationAutomation(history, 'a')
    expect(filtered.entries).toEqual([{ kind: 'automations' }, { kind: 'automations', taskId: 'b' }, conversation('a'), { kind: 'extensions' }])
    expect(filtered.cursor).toBe(3)
    expect(filtered.detached).toBe(false)
  })

  it('does not alter history for an unrelated deleted ID', () => {
    const history: MiraAppNavigationSnapshot = stack(conversation('a'), { kind: 'automations' })
    expect(removeMiraNavigationSession(history, 'missing')).toBe(history)
    expect(removeMiraNavigationAutomation(history, 'missing')).toBe(history)
  })
})
