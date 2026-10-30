import { describe, expect, it } from 'vitest'
import { getApplicationEntryPath, getMenusForApp, getMicroAppChildPath } from '../src/config/navigation'
import { findRuntimeMicroApp, runtimeNavigation } from '../src/config/runtime'
import type { MenuItem, MicroApp } from '../src/types'

describe('application navigation identity', () => {
  it('opens the formal Harness entry for the desktop application', () => {
    expect(getApplicationEntryPath('main')).toBe('/workspace/harness-react')
    expect(getApplicationEntryPath('mira-harness')).toBe('/workspace/harness-react')
  })
  it('resolves only the registered application code and child path', () => {
    const code = 'test-app'
    const menu: MenuItem = { id: 'test-home', title: '首页', path: `/micro/${code}`, type: 'menu', target: { type: 'microapp', childPath: '/' } }
    const app = { code, menus: [menu] } as MicroApp
    runtimeNavigation.microApps.push(app)
    try {
      expect(getMenusForApp(code)).toEqual([menu])
      expect(getApplicationEntryPath(code)).toBe(`/micro/${code}`)
      expect(findRuntimeMicroApp(code)).toBeDefined()
      expect(findRuntimeMicroApp('ai-novel')).toBeUndefined()
      expect(getMenusForApp('ai-novel')).toEqual([])
      expect(getMicroAppChildPath(app, `/micro/${code}/chapters`)).toBe('/chapters')
      expect(getMicroAppChildPath(app, '/micro/ai-novel/chapters')).toBe('')
      expect(getMicroAppChildPath(app, `/micro/${code}-other/chapters`)).toBe('')
    } finally { runtimeNavigation.microApps.splice(runtimeNavigation.microApps.indexOf(app), 1) }
  })
})
