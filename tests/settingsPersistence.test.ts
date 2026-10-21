// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { platformPreferences } from '../src/config/runtime'
import { DEFAULT_PERMISSION_CONFIG } from '../src/config/harness'
import { usePermissionSettings } from '../src/pages/backend/settings/usePermissionSettings'
import { useSettingsPreference } from '../src/pages/backend/settings/useSettingsPreference'

const error = vi.hoisted(() => vi.fn())
vi.mock('element-plus', () => ({ ElMessage: { error } }))
const cleanup: Array<() => void> = []
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); vi.clearAllMocks(); delete (window as any).platform; Object.keys(platformPreferences).forEach(key => delete platformPreferences[key]) })
function mountPermissions() {
  let state!: ReturnType<typeof usePermissionSettings>
  const element = document.createElement('div')
  const app = createApp(defineComponent({ setup() { state = usePermissionSettings(); return () => h('div') } }))
  app.mount(element); cleanup.push(() => app.unmount())
  return state
}

describe('settings persistence and failures', () => {
  it('keeps the old value on failure and permits retry', async () => {
    platformPreferences.sendShortcut = 'enter'
    const write = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(undefined)
    ;(window as any).platform = { savePreference: write }
    const state = useSettingsPreference()
    expect(await state.save('sendShortcut', 'mod-enter')).toBe(false)
    expect(platformPreferences.sendShortcut).toBe('enter')
    expect(error).toHaveBeenCalledWith('disk full')
    expect(state.saving.value).toBe('')
    expect(await state.save('sendShortcut', 'mod-enter')).toBe(true)
    expect(platformPreferences.sendShortcut).toBe('mod-enter')
  })

  it('does not report success or allow a permission write after load failure', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('read failed')).mockResolvedValue({ ...DEFAULT_PERMISSION_CONFIG })
    const write = vi.fn().mockImplementation(value => Promise.resolve(value))
    ;(window as any).platform = { getHarnessPermissionConfig: read, saveHarnessPermissionConfig: write }
    const state = mountPermissions()
    await vi.waitFor(() => expect(state.error.value).toBe('read failed'))
    expect(state.loaded.value).toBe(false)
    await state.save({ globalDefaultMode: 'full' })
    expect(write).not.toHaveBeenCalled()
    await state.load()
    expect(state.loaded.value).toBe(true)
    await state.save({ globalDefaultMode: 'full' })
    expect(state.config.globalDefaultMode).toBe('full')
  })

  it('preserves changes made on the other page and retries failed writes without optimistic state', async () => {
    let stored = { ...DEFAULT_PERMISSION_CONFIG }
    const write = vi.fn().mockRejectedValueOnce(new Error('write failed')).mockImplementation(value => { stored = value; return Promise.resolve(value) })
    ;(window as any).platform = { getHarnessPermissionConfig: vi.fn(async () => ({ ...stored })), saveHarnessPermissionConfig: write }
    const state = mountPermissions()
    await vi.waitFor(() => expect(state.loaded.value).toBe(true))
    stored = { ...stored, globalDefaultMode: 'auto-approve' }
    await state.save({ trashRetentionDays: 14 })
    expect(state.config.trashRetentionDays).toBe(7)
    expect(state.error.value).toBe('write failed')
    await state.save({ trashRetentionDays: 14 })
    expect(stored.globalDefaultMode).toBe('auto-approve')
    expect(stored.trashRetentionDays).toBe(14)
    expect(state.error.value).toBe('')
    await nextTick()
  })
})
