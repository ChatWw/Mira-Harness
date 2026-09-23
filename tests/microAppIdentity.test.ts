import { describe, expect, it } from 'vitest'
import { canonicalMicroAppCode, MIRA_NOVEL_STUDIO_CODE } from '../src/config/microApps'
import { findRuntimeMicroApp, runtimeNavigation } from '../src/config/runtime'
import type { MicroApp } from '../src/types'

describe('micro-app identity compatibility', () => {
  it('maps the legacy novel code to the first-party identity', () => {
    expect(canonicalMicroAppCode('ai-novel')).toBe(MIRA_NOVEL_STUDIO_CODE)
    expect(canonicalMicroAppCode(MIRA_NOVEL_STUDIO_CODE)).toBe(MIRA_NOVEL_STUDIO_CODE)
    expect(canonicalMicroAppCode('other-app')).toBe('other-app')
  })

  it('resolves a legacy code against a canonical runtime entry', () => {
    const app = { code: MIRA_NOVEL_STUDIO_CODE } as MicroApp
    runtimeNavigation.microApps.push(app)
    try {
      expect(findRuntimeMicroApp('ai-novel')?.code).toBe(MIRA_NOVEL_STUDIO_CODE)
    } finally {
      runtimeNavigation.microApps.splice(runtimeNavigation.microApps.indexOf(app), 1)
    }
  })
})
