import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness project expansion', () => {
  it('persists only user-expanded project ids and defaults new projects to collapsed', () => {
    const source = readFileSync(new URL('../src/layouts/components/WorkspaceNavigation.vue', import.meta.url), 'utf8')

    expect(source).toContain("const EXPANDED_PROJECTS_PREFERENCE_KEY = 'harnessExpandedProjectIds'")
    expect(source).toContain('expandedProjectIds.value = storedExpandedProjectIds().filter(id => store.projects.some(project => project.id === id))')
    expect(source).toContain('function setExpandedProjectIds(ids: string[])')
    expect(source).toContain('savePreference(EXPANDED_PROJECTS_PREFERENCE_KEY, ids)')
    expect(source).toContain('setExpandedProjectIds([...expandedProjectIds.value, id])')
    expect(source).toContain('setExpandedProjectIds(expandedProjectIds.value.filter(id => id !== projectId))')
  })
})
