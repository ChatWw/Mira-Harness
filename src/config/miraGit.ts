export interface MiraGitFile {
  path: string
  staged: boolean
  unstaged: boolean
  conflict: boolean
}
export interface MiraGitDiff { path: string; patch: string; added: number; removed: number; binary: boolean }
export interface MiraGitSnapshot {
  projectId: string
  directory: string
  repository: string
  branch?: string
  head?: string
  token: string
  files: MiraGitFile[]
  added: number
  removed: number
  stagedFiles?: MiraGitDiff[]
  unstagedFiles?: MiraGitDiff[]
  stagedPatch: string
  unstagedPatch: string
  ahead: number
  behind: number
  upstream?: string
  canPush: boolean
  mutationBlocked: boolean
}
export type MiraGitAction = 'commit' | 'commit-and-push' | 'push'
export interface MiraGitCommit {
  hash: string
  parents: string[]
  subject: string
  author: string
  date: string
  refs: string
}
export interface MiraGitGraph { commits: MiraGitCommit[]; hasMore: boolean }
export interface MiraGitActionResult { committed: boolean; pushed: boolean; error?: string }
