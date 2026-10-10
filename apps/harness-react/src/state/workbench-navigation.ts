import { readMiraAppNavigationCommand, readMiraAppNavigationSnapshot, readMiraAppNavigationTarget, type MiraAppNavigationCommand, type MiraAppNavigationSnapshot, type MiraAppNavigationState, type MiraAppNavigationTarget } from '../../../../src/platform/appNavigation'
import { detachMiraNavigation, emptyMiraNavigationHistory, planMiraNavigation, recordMiraNavigation, removeMiraNavigationAutomation, removeMiraNavigationSession } from '../lib/app-navigation-history'

export type MiraNavigationAction = (target: MiraAppNavigationTarget | undefined, isCurrent: () => boolean, draft?: 'conversation' | 'automations') => Promise<boolean>

/** Owns navigation transactions; the caller applies its existing save/open guards. */
export class MiraWorkbenchNavigation {
  private state: MiraAppNavigationState = { type: 'mira:app-navigation-state', revision: 0, canGoBack: false, canGoForward: false, busy: false, snapshot: emptyMiraNavigationHistory() }
  private listeners = new Set<() => void>()
  private connected = false
  private initialized = false
  private generation = 0

  constructor(private readonly publish: (state: MiraAppNavigationState) => void) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  get ready() { return this.initialized }
  get busy() { return this.state.busy }

  connect() {
    if (this.connected) return
    this.connected = true
    this.update()
  }
  disconnect() {
    if (!this.connected) return
    this.connected = false
    this.generation++
    if (this.busy) this.update(this.state.snapshot, false)
  }

  async initialize(snapshot: MiraAppNavigationSnapshot | undefined, fallback: MiraAppNavigationTarget | undefined, execute: MiraNavigationAction): Promise<boolean> {
    if (this.ready) return true
    if (!this.connected || this.busy) return false
    const history = readMiraAppNavigationSnapshot(snapshot)
    const fallbackTarget = readMiraAppNavigationTarget(fallback)
    let next = fallbackTarget ? recordMiraNavigation(emptyMiraNavigationHistory(), fallbackTarget) : emptyMiraNavigationHistory()
    const current = this.begin()
    if (history) {
      const target = history.detached ? undefined : history.entries[history.cursor]
      try {
        if (!target && !history.detached || await execute(target, current, history.detached ? history.draft ?? 'conversation' : undefined)) next = history
      } catch { /* An unavailable restored target leaves the caller's real fallback in place. */ }
    }
    if (!current()) return false
    this.initialized = true
    this.update(next, false)
    return true
  }

  async visit(target: MiraAppNavigationTarget | undefined, execute: MiraNavigationAction, draftKind: 'conversation' | 'automations' = 'conversation'): Promise<boolean> {
    if (!this.connected || !this.ready) return false
    const entry = target === undefined ? undefined : readMiraAppNavigationTarget(target)
    if (target !== undefined && !entry) return false
    const history = this.state.snapshot
    return this.transition(entry, target === undefined ? draftKind : undefined, execute, () => entry ? recordMiraNavigation(history, entry) : detachMiraNavigation(history, draftKind))
  }

  async go(command: MiraAppNavigationCommand, execute: MiraNavigationAction): Promise<boolean> {
    if (!this.connected) return false
    const message = readMiraAppNavigationCommand(command)
    const plan = message && this.ready && !this.busy && message.expectedRevision === this.state.revision ? planMiraNavigation(this.state.snapshot, message.direction) : undefined
    if (!plan) { this.update(); return false }
    return this.transition(plan.target, undefined, execute, () => plan.history)
  }

  record(target: MiraAppNavigationTarget) {
    if (!this.ready || this.busy || !this.connected) return
    const history = recordMiraNavigation(this.state.snapshot, target)
    if (history !== this.state.snapshot) this.update(history)
  }
  detach(draftKind: 'conversation' | 'automations' = 'conversation') {
    if (!this.ready || this.busy || !this.connected) return
    const history = detachMiraNavigation(this.state.snapshot, draftKind)
    if (history !== this.state.snapshot) this.update(history)
  }
  removeSession(id: string) { this.remove(removeMiraNavigationSession(this.state.snapshot, id)) }
  removeAutomation(id: string) { this.remove(removeMiraNavigationAutomation(this.state.snapshot, id)) }

  private remove(history: MiraAppNavigationSnapshot) {
    if (history === this.state.snapshot && !this.busy) return
    this.generation++
    this.update(history, false)
  }
  private begin() {
    const generation = ++this.generation
    this.update(this.state.snapshot, true)
    return () => this.connected && generation === this.generation
  }
  private async transition(target: MiraAppNavigationTarget | undefined, draft: 'conversation' | 'automations' | undefined, execute: MiraNavigationAction, next: () => MiraAppNavigationSnapshot): Promise<boolean> {
    const current = this.begin()
    try {
      const success = await execute(target, current, draft)
      if (!current()) return false
      this.update(success ? next() : this.state.snapshot, false)
      return success
    } catch {
      if (current()) this.update(this.state.snapshot, false)
      return false
    }
  }
  private update(snapshot = this.state.snapshot, busy = this.busy) {
    this.state = { type: 'mira:app-navigation-state', revision: this.state.revision + 1, canGoBack: this.ready && !busy && Boolean(planMiraNavigation(snapshot, 'back')), canGoForward: this.ready && !busy && Boolean(planMiraNavigation(snapshot, 'forward')), busy, snapshot }
    this.listeners.forEach(listener => listener())
    if (this.connected) this.publish(this.state)
  }
}
