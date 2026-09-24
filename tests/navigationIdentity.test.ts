import { describe, expect, it } from 'vitest'
import { getApplicationEntryPath, getMenusForApp, getMicroAppChildPath } from '../src/config/navigation'
import { MIRA_NOVEL_STUDIO_CODE } from '../src/config/microApps'
import { runtimeNavigation } from '../src/config/runtime'
import type { MenuItem, MicroApp } from '../src/types'

describe('legacy micro-app navigation', () => {
  it('opens Mira through the Harness entry rather than a legacy main menu', () => {
    expect(getApplicationEntryPath('main')).toBe('/workspace/chat')
  })

  it('uses canonical menus and entry paths for a legacy app code', () => {
    const menu: MenuItem = { id: 'novel-home', title: '首页', path: `/micro/${MIRA_NOVEL_STUDIO_CODE}`, type: 'menu', target: { type: 'microapp', childPath: '/' } }
    const app = { code: MIRA_NOVEL_STUDIO_CODE, menus: [menu] } as MicroApp
    runtimeNavigation.microApps.push(app)
    try {
      expect(getMenusForApp('ai-novel')).toEqual([menu])
      expect(getApplicationEntryPath('ai-novel')).toBe(`/micro/${MIRA_NOVEL_STUDIO_CODE}`)
      expect(getMicroAppChildPath(app, '/micro/ai-novel/chapters')).toBe('/chapters')
      expect(getMicroAppChildPath(app, '/micro/ai-novelty/chapters')).toBe('')
    } finally {
      runtimeNavigation.microApps.splice(runtimeNavigation.microApps.indexOf(app), 1)
    }
  })

  it('keeps menus from an old snapshot entry addressable', () => {
    const menu: MenuItem = { id: 'legacy-home', title: '旧首页', path: '/micro/ai-novel', type: 'menu', target: { type: 'microapp', childPath: '/' } }
    const app = { code: 'ai-novel', menus: [menu] } as MicroApp
    runtimeNavigation.microApps.push(app)
    try {
      expect(getMenusForApp('ai-novel')).toEqual([menu])
      expect(getApplicationEntryPath('ai-novel')).toBe('/micro/ai-novel')
    } finally {
      runtimeNavigation.microApps.splice(runtimeNavigation.microApps.indexOf(app), 1)
    }
  })
})
