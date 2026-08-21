import type { HarnessProject } from '@/config/harness'

export type ProjectStatus = 'all' | 'active' | 'idle'
export type ProjectSort = 'lastActive' | 'createdAt' | 'name'

export const ACTIVE_PROJECT_WINDOW_MS = 48 * 60 * 60 * 1000

export function projectStatus(project: HarnessProject, timestamp = Date.now()): Exclude<ProjectStatus, 'all'> {
  return project.sessionCount > 0 && project.lastSessionAt !== undefined && timestamp - project.lastSessionAt <= ACTIVE_PROJECT_WINDOW_MS
    ? 'active'
    : 'idle'
}

export function filterProjects(projects: HarnessProject[], query: string, status: ProjectStatus, sort: ProjectSort): HarnessProject[] {
  const keyword = query.trim().toLocaleLowerCase()
  return projects.filter(project => {
    const matchesKeyword = !keyword || project.name.toLocaleLowerCase().includes(keyword) || project.directory.toLocaleLowerCase().includes(keyword)
    return matchesKeyword && (status === 'all' || projectStatus(project) === status)
  }).sort((left, right) => {
    if (sort === 'name') return left.name.localeCompare(right.name, 'zh-CN')
    if (sort === 'createdAt') return right.createdAt - left.createdAt
    return (right.lastSessionAt || right.updatedAt) - (left.lastSessionAt || left.updatedAt)
  })
}
