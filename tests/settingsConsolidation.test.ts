import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '..')
const readSource = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8')

describe('Mira shell settings consolidation', () => {
  it('removes the workspace tabs surface from the main layout', () => {
    const layout = readSource('src/layouts/index.vue')

    expect(layout).not.toContain('TabsBar')
    expect(existsSync(resolve(repositoryRoot, 'src/layouts/components/TabsBar.vue'))).toBe(false)
    expect(existsSync(resolve(repositoryRoot, 'src/stores/tabs.ts'))).toBe(false)
  })

  it('keeps only the supported settings entries and light/dark appearance modes', () => {
    const settingsMenu = readSource('src/pages/backend/settings/components/SettingsSiderMenu.vue')
    const appearance = readSource('src/pages/backend/appearance/components/AppearanceSettings.vue')

    expect(settingsMenu).toContain("label: '基础能力'")
    expect(settingsMenu).toContain("label: '平台能力'")
    expect(settingsMenu).toContain("label: '应用'")
    for (const removedPath of ['/settings/loading-effects', '/settings/icon-library', '/settings/menu-management', '/settings/micro-apps']) {
      expect(settingsMenu).not.toContain(removedPath)
    }
    expect(appearance).toContain("{ value: 'light', label: '浅色' }")
    expect(appearance).toContain("{ value: 'dark', label: '深色' }")
    expect(appearance).not.toContain("value: 'system'")
    expect(appearance).not.toContain('主题颜色')
    expect(appearance).not.toContain('多标签页')
  })

  it('redirects retired settings routes to the general settings page', () => {
    const router = readSource('src/router/index.ts')

    for (const legacyPath of ['/system/components/loading', '/system/components/icon-selector', '/system/menus', '/system/micro-apps']) {
      expect(router).toContain(`path: '${legacyPath}'`)
    }
    expect(router.match(/redirect: '\/settings\/general'/g)).toHaveLength(4)
    expect(router).not.toContain("path: '/settings/menu-management'")
    expect(router).not.toContain("path: '/settings/micro-apps'")
  })
})
