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

  it('keeps drag sorting inside each sidebar column and expands a project for a new session', () => {
    const source = readFileSync(new URL('../src/layouts/components/WorkspaceNavigation.vue', import.meta.url), 'utf8')

    expect(source).toContain(":group=\"fixedDragGroup('pinned')\"")
    expect(source).toContain(":group=\"fixedDragGroup('projects')\"")
    expect(source).toContain(':group="fixedDragGroup(`project-${project.id}`)"')
    expect(source).toContain(":group=\"fixedDragGroup('recent')\"")
    expect(source.match(/:model-value=/g)).toHaveLength(4)
    expect(source).not.toContain('<Draggable :list=')
    expect(source).not.toContain('<Draggable v-if="projectsExpanded" :list=')
    expect(source).not.toContain('<Draggable v-if="isProjectExpanded(project.id)" :list=')
    expect(source).not.toContain('<Draggable v-if="sessionsExpanded" :list=')
    expect(source).toContain("if (!knownSessionIds.has(session.id) && session.projectId) expandProjectForNewSession(session.projectId)")
    expect(source).toContain('async function createProjectSession(projectId: string) { expandProjectForNewSession(projectId);')
  })
})
