import { reactive, type ComputedRef, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneValue } from '../src/pages/backend/platformManagement'
import type { MenuItem } from '../src/types'
import { applyPlatformSnapshot, platformPreferences } from '../src/config/runtime'
import GeneralSettings from '../src/pages/backend/general/index.vue'

const feedback = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: feedback }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: {} }))
vi.mock('vue', async importOriginal => ({
  ...await importOriginal<typeof import('vue')>(),
  onMounted: vi.fn(),
  useSSRContext: () => ({ modules: new Set<string>() }),
}))

vi.mock('@/router', () => ({
  default: { currentRoute: { value: { path: '/settings/menu-management' } }, replace: vi.fn() },
  syncBusinessRoutes: vi.fn(),
}))

describe('platform management IPC values', () => {
  it('converts reactive menu trees into structured-cloneable values', () => {
    const menus = reactive<MenuItem[]>([
      {
        id: 'links',
        title: '链接',
        type: 'dir',
        path: '/links',
        children: [
          {
            id: 'links_docs',
            title: '文档',
            type: 'menu',
            path: '/links/docs',
            target: { type: 'iframe', url: 'https://example.com' },
          },
        ],
      },
    ])

    expect(() => structuredClone(menus)).toThrow()

    const payload = cloneValue(menus)

    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload).toEqual(menus)
  })
})

describe('global running-input settings', () => {
  function setup() {
    return (GeneralSettings as unknown as {
      setup: (props: object, context: object) => {
        followupMode: ComputedRef<'queue' | 'guide'>
        followupSaving: Ref<boolean>
        setFollowupMode: (value: string) => Promise<void>
      }
    }).setup({}, { expose: vi.fn() })
  }

  beforeEach(() => {
    feedback.error.mockClear()
    for (const key of Object.keys(platformPreferences)) delete platformPreferences[key]
  })
  afterEach(() => vi.unstubAllGlobals())

  it('uses queue for missing legacy preferences without writing defaults', () => {
    const savePreference = vi.fn()
    vi.stubGlobal('window', { platform: { savePreference } })
    const settings = setup()
    expect(settings.followupMode.value).toBe('queue')
    expect(savePreference).not.toHaveBeenCalled()
    platformPreferences.followupMode = 'unknown'
    expect(settings.followupMode.value).toBe('queue')
  })

  it('persists both modes and restores them after a fresh platform snapshot', async () => {
    const preferences = { sendShortcut: 'mod-enter', showContextUsage: false, followupMode: 'queue' }
    const savePreference = vi.fn(async (key: string, value: unknown) => { Object.assign(preferences, { [key]: value }) })
    vi.stubGlobal('window', { platform: { savePreference } })
    applyPlatformSnapshot({ mainMenus: [], microApps: [], preferences: { ...preferences } })
    const settings = setup()
    for (const mode of ['guide', 'queue'] as const) {
      await settings.setFollowupMode(mode)
      expect(savePreference).toHaveBeenLastCalledWith('followupMode', mode)
      for (const key of Object.keys(platformPreferences)) delete platformPreferences[key]
      applyPlatformSnapshot({ mainMenus: [], microApps: [], preferences: { ...preferences } })
      expect(setup().followupMode.value).toBe(mode)
      expect(platformPreferences.sendShortcut).toBe('mod-enter')
      expect(platformPreferences.showContextUsage).toBe(false)
    }
  })

  it('disables duplicate saves until persistence succeeds', async () => {
    let finish!: () => void
    const savePreference = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    vi.stubGlobal('window', { platform: { savePreference } })
    const settings = setup()
    const saving = settings.setFollowupMode('guide')
    expect(settings.followupSaving.value).toBe(true)
    expect(settings.followupMode.value).toBe('queue')
    await settings.setFollowupMode('guide')
    expect(savePreference).toHaveBeenCalledOnce()
    finish()
    await saving
    expect(settings.followupSaving.value).toBe(false)
    expect(settings.followupMode.value).toBe('guide')
  })

  it('retains the previous selection and exposes a failed-save error for retry', async () => {
    const savePreference = vi.fn().mockRejectedValueOnce(new Error('磁盘写入失败')).mockResolvedValueOnce(undefined)
    vi.stubGlobal('window', { platform: { savePreference } })
    const settings = setup()
    await settings.setFollowupMode('guide')
    expect(settings.followupMode.value).toBe('queue')
    expect(settings.followupSaving.value).toBe(false)
    expect(feedback.error).toHaveBeenCalledExactlyOnceWith('磁盘写入失败')
    await settings.setFollowupMode('guide')
    expect(settings.followupMode.value).toBe('guide')
  })

  it('ignores invalid UI choices and reports unavailable desktop persistence', async () => {
    const savePreference = vi.fn()
    vi.stubGlobal('window', { platform: { savePreference } })
    const settings = setup()
    await settings.setFollowupMode('start-now')
    expect(savePreference).not.toHaveBeenCalled()
    vi.stubGlobal('window', {})
    await settings.setFollowupMode('guide')
    expect(settings.followupMode.value).toBe('queue')
    expect(feedback.error).toHaveBeenCalledExactlyOnceWith('运行中消息设置仅在桌面端中可用')
  })
})
