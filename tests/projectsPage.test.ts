import { describe, expect, it } from 'vitest'
import type { HarnessProject } from '../src/config/harness'
import { ACTIVE_PROJECT_WINDOW_MS, filterProjects, projectStatus } from '../src/pages/frontend/harness/projects/projectUtils'

const now = Date.now()
const projects: HarnessProject[] = [
  { id: 'active', name: 'Alpha', icon: 'FolderOpened', directory: '/work/alpha', directoryExists: true, createdAt: 20, updatedAt: 30, lastSessionAt: now - 1_000, sessionCount: 3 },
  { id: 'idle', name: 'Beta', icon: 'FolderOpened', directory: '/archive/beta', directoryExists: true, createdAt: 40, updatedAt: 50, lastSessionAt: now - ACTIVE_PROJECT_WINDOW_MS - 1, sessionCount: 1 },
  { id: 'new', name: 'Gamma', icon: 'FolderOpened', directory: '/work/gamma', directoryExists: true, createdAt: 60, updatedAt: 70, sessionCount: 0 },
]

describe('project page helpers', () => {
  it('marks only projects with a recent session as active', () => {
    expect(projectStatus(projects[0], now)).toBe('active')
    expect(projectStatus(projects[1], now)).toBe('idle')
    expect(projectStatus(projects[2], now)).toBe('idle')
  })

  it('intersects text and status filters before sorting', () => {
    expect(filterProjects(projects, 'work', 'idle', 'name').map(project => project.id)).toEqual(['new'])
    expect(filterProjects(projects, '', 'all', 'createdAt').map(project => project.id)).toEqual(['new', 'idle', 'active'])
    expect(filterProjects(projects, '', 'all', 'lastActive').map(project => project.id)).toEqual(['active', 'idle', 'new'])
  })
})
