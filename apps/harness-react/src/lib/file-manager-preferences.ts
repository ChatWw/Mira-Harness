import type { PilotController } from '../state/pilot-state'
type Preferences = Record<string, { open?: boolean; width?: number }>
const stores = new WeakMap<PilotController, FileManagerPreferences>()
export function fileManagerPreferences(controller: PilotController) {
  let store = stores.get(controller)
  if (!store) { store = new FileManagerPreferences(controller); stores.set(controller, store) }
  return store
}
class FileManagerPreferences {
  private value: Preferences = {}
  ready = false
  private listeners = new Set<() => void>()
  private loading?: Promise<void>
  private saving = Promise.resolve()
  private changed = new Set<string>()
  constructor(private controller: PilotController) {}
  getSnapshot = () => this.value
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish() { this.listeners.forEach(listener => listener()) }
  load() {
    return this.loading ||= this.controller.getPreference('mira-file-manager-navigation').then(stored => {
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        const restored: Preferences = {}
        Object.entries(stored).forEach(([root, value]) => {
          if (!value || typeof value !== 'object') return
          const { open, width } = value as { open?: unknown; width?: unknown }
          restored[root] = { ...(typeof open === 'boolean' ? { open } : {}), ...(typeof width === 'number' && Number.isFinite(width) && width >= 160 ? { width } : {}) }
        })
        this.changed.forEach(root => { restored[root] = { ...restored[root], ...this.value[root] } })
        this.value = restored
      }
      this.ready = true; this.publish()
    }).catch(error => { this.ready = true; this.controller.reportError(error); this.publish() })
  }
  update(root: string, patch: { open?: boolean; width?: number }) {
    if (Object.entries(patch).every(([key, value]) => this.value[root]?.[key as 'open' | 'width'] === value)) return
    this.changed.add(root); this.value = { ...this.value, [root]: { ...this.value[root], ...patch } }; this.publish()
    this.saving = this.saving.catch(() => undefined).then(() => this.load()).then(() => this.controller.setPreference('mira-file-manager-navigation', this.value, true)).then(() => undefined)
    void this.saving.catch(error => this.controller.reportError(error))
  }
  flush = () => this.saving
}
