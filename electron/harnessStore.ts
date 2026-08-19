import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type Database from 'better-sqlite3'
import {
  DEFAULT_PERMISSION_CONFIG,
  DEFAULT_HARNESS_GIT_CONFIG,
  DEFAULT_PROJECT_ICON,
  isProjectIcon,
  type HarnessMessage,
  type HarnessFileReference,
  type HarnessGitBranch,
  type HarnessGitConfig,
  type HarnessMessageAttachment,
  type HarnessProject,
  type HarnessRunSummary,
  type HarnessSession,
  type HarnessSessionSummary,
  type PermissionConfig,
  type PermissionMode,
  type ToolCallRecord,
} from '../src/config/harness'

type ProjectRow = { id: string, name: string, icon: string, directory: string, default_model_provider_id: string | null, created_at: number, updated_at: number, last_session_at: number | null }
type SessionRow = { id: string, project_id: string | null, title: string, model_provider_id: string | null, model_id: string | null, permission_mode: PermissionMode, status: HarnessSession['status'], path: string, working_directory: string | null, created_at: number, updated_at: number }

const IGNORED_FILE_DIRECTORIES = new Set(['.git', '.mira', 'node_modules', 'dist', 'build', 'coverage'])
const MAX_FILE_REFERENCES = 12
const MAX_ATTACHMENT_FILE_BYTES = 256 * 1024
const MAX_ATTACHMENT_TOTAL_BYTES = 1024 * 1024
const MAX_LISTED_PROJECT_FILES = 240

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function now() { return Date.now() }
function createSessionId() { return randomUUID() }
function titleFor(content: string) { return content.trim().replace(/\s+/g, ' ').slice(0, 42) || '新对话' }
function projectIcon(value?: string) { return isProjectIcon(value) ? value : DEFAULT_PROJECT_ICON }
function validateProjectIcon(value?: string) {
  if (value !== undefined && !isProjectIcon(value)) throw new Error('项目图标无效')
  return value || DEFAULT_PROJECT_ICON
}
function runGit(directory: string, args: string[]) {
  try {
    return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 })
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '').trim() : ''
    throw new Error(stderr || (error instanceof Error ? error.message : 'Git 命令执行失败'))
  }
}
function isGitRepository(directory: string) {
  try {
    return runGit(directory, ['rev-parse', '--is-inside-work-tree']).trim() === 'true'
  } catch {
    return false
  }
}
function gitBranch(directory: string) {
  try { return runGit(directory, ['branch', '--show-current']).trim() || undefined } catch { return undefined }
}
function gitMetadata(directory: string) {
  const isRepository = isGitRepository(directory)
  return { isGitRepository: isRepository || undefined, gitBranch: isRepository ? gitBranch(directory) : undefined }
}
function isValidGitPrefix(value: string) {
  return !value || (value.endsWith('/') && !/[\s~^:?*[\\]/.test(value) && !value.includes('//') && !value.includes('..') && !value.includes('@{') && !/(?:^|\/)\.|\.lock(?:\/|$)/.test(value))
}
function gitPrefix(value: unknown, fallback = DEFAULT_HARNESS_GIT_CONFIG.branchPrefix) {
  const prefix = typeof value === 'string' ? value.trim() : fallback
  if (!isValidGitPrefix(prefix)) throw new Error('分支前缀无效')
  return prefix
}

export class HarnessStore {
  constructor(private readonly database: Database.Database, private readonly userDataPath: string) {
    mkdirSync(this.tempSessionsDir(), { recursive: true })
  }

  private tempSessionsDir() { return join(this.userDataPath, '.mira', 'sessions') }
  private projectMira(project: HarnessProject) { return join(project.directory, '.mira') }
  private sessionPath(session: HarnessSession) {
    if (!session.projectId) return join(this.tempSessionsDir(), `${session.id}.json`)
    const project = this.getProject(session.projectId)
    return join(this.projectMira(project), 'sessions', `${session.id}.json`)
  }

  private ensureInside(root: string, candidate: string) {
    const rootPath = resolve(root)
    const target = resolve(candidate)
    if (target !== rootPath && !target.startsWith(`${rootPath}${sep}`)) throw new Error('路径不在项目目录内')
    return target
  }

  private projectFilePath(project: HarnessProject, filePath: string) {
    if (!filePath || isAbsolute(filePath)) throw new Error('引用文件路径无效')
    const candidate = this.ensureInside(project.directory, join(project.directory, filePath))
    if (!existsSync(candidate) || !lstatSync(candidate).isFile()) throw new Error(`引用文件不存在：${filePath}`)
    const root = realpathSync(project.directory)
    const resolved = realpathSync(candidate)
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw new Error('引用文件不能通过符号链接离开项目目录')
    return resolved
  }

  private isTextProjectFile(path: string) {
    try {
      const stat = lstatSync(path)
      return stat.size <= MAX_ATTACHMENT_FILE_BYTES && !readFileSync(path).includes(0)
    } catch {
      return false
    }
  }

  private saveSession(session: HarnessSession) {
    const path = this.sessionPath(session)
    mkdirSync(dirname(path), { recursive: true })
    session.updatedAt = now()
    const temporaryPath = `${path}.${process.pid}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(session, null, 2), 'utf8')
    renameSync(temporaryPath, path)
    this.database.prepare(`INSERT INTO harness_sessions(id, project_id, title, model_provider_id, model_id, permission_mode, status, path, working_directory, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, title = excluded.title, model_provider_id = excluded.model_provider_id,
      model_id = excluded.model_id, permission_mode = excluded.permission_mode, status = excluded.status, path = excluded.path,
      working_directory = excluded.working_directory, updated_at = excluded.updated_at`)
      .run(session.id, session.projectId || null, session.title, session.modelProviderId || null, session.modelId || null, session.permissionMode,
        session.status, path, session.workingDirectory || null, session.createdAt, session.updatedAt)
    if (session.projectId) this.database.prepare('UPDATE harness_projects SET updated_at = ?, last_session_at = ? WHERE id = ?').run(session.updatedAt, session.updatedAt, session.projectId)
    return clone(session)
  }

  private parseSession(raw: string): HarnessSession {
    const value = JSON.parse(raw) as Partial<HarnessSession>
    if (value.version !== 1 || !value.id || !Array.isArray(value.messages) || !Array.isArray(value.toolCalls)) throw new Error('会话文件格式无效')
    return value as HarnessSession
  }

  listProjects(): HarnessProject[] {
    const counts = this.database.prepare('SELECT project_id, COUNT(*) AS count FROM harness_sessions WHERE project_id IS NOT NULL GROUP BY project_id').all() as Array<{ project_id: string, count: number }>
    const countMap = new Map(counts.map(row => [row.project_id, row.count]))
    return (this.database.prepare('SELECT * FROM harness_projects ORDER BY COALESCE(last_session_at, updated_at) DESC').all() as ProjectRow[]).map(row => ({
      id: row.id, name: row.name, icon: projectIcon(row.icon), directory: row.directory, createdAt: row.created_at, updatedAt: row.updated_at,
      ...gitMetadata(row.directory), lastSessionAt: row.last_session_at || undefined, defaultModelProviderId: row.default_model_provider_id || undefined, sessionCount: countMap.get(row.id) || 0,
    }))
  }

  getProject(id: string): HarnessProject {
    const row = this.database.prepare('SELECT * FROM harness_projects WHERE id = ?').get(id) as ProjectRow | undefined
    if (!row) throw new Error('未找到项目')
    const sessionCount = (this.database.prepare('SELECT COUNT(*) AS count FROM harness_sessions WHERE project_id = ?').get(id) as { count: number }).count
    return { id: row.id, name: row.name, icon: projectIcon(row.icon), directory: row.directory, ...gitMetadata(row.directory), createdAt: row.created_at, updatedAt: row.updated_at, lastSessionAt: row.last_session_at || undefined, defaultModelProviderId: row.default_model_provider_id || undefined, sessionCount }
  }

  listGitBranches(projectId: string): HarnessGitBranch[] {
    const project = this.getProject(projectId)
    if (!project.isGitRepository) throw new Error('项目不是 Git 仓库')
    const current = gitBranch(project.directory)
    const names = runGit(project.directory, ['for-each-ref', '--format=%(refname:short)', '--sort=refname', 'refs/heads']).trim().split('\n').filter(Boolean)
    const status = runGit(project.directory, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    let uncommittedFileCount = 0
    const records = status.split('\0')
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index]
      if (!record || record[2] !== ' ') continue
      uncommittedFileCount += 1
      if (record.slice(0, 2).includes('R') || record.slice(0, 2).includes('C')) index += 1
    }
    return names.map(name => ({ name, current: name === current, ...(name === current && uncommittedFileCount ? { uncommittedFileCount } : {}) }))
  }

  private validateGitBranchName(project: HarnessProject, value: string) {
    const name = value.trim()
    if (!name) throw new Error('分支名称不能为空')
    if (name.endsWith('/')) throw new Error('分支名不能以“/”结尾')
    try { runGit(project.directory, ['check-ref-format', '--branch', name]) } catch { throw new Error('分支名称无效') }
    if (this.listGitBranches(project.id).some(branch => branch.name === name)) throw new Error('分支已存在')
    return name
  }

  checkoutGitBranch(projectId: string, branchName: string) {
    const project = this.getProject(projectId)
    if (!project.isGitRepository) throw new Error('项目不是 Git 仓库')
    if (!this.listGitBranches(projectId).some(branch => branch.name === branchName)) throw new Error('未找到本地分支')
    runGit(project.directory, ['switch', branchName])
    return this.listGitBranches(projectId)
  }

  createAndCheckoutGitBranch(projectId: string, branchName: string) {
    const project = this.getProject(projectId)
    if (!project.isGitRepository) throw new Error('项目不是 Git 仓库')
    const name = this.validateGitBranchName(project, branchName)
    runGit(project.directory, ['switch', '-c', name])
    return this.listGitBranches(projectId)
  }

  createProject(directory: string, name?: string, icon?: string) {
    const selectedIcon = validateProjectIcon(icon)
    const canonical = resolve(directory)
    if (!existsSync(canonical)) throw new Error('项目目录不存在')
    const existing = this.database.prepare('SELECT id FROM harness_projects WHERE directory = ?').get(canonical) as { id: string } | undefined
    if (existing) return this.getProject(existing.id)
    const id = randomUUID(); const createdAt = now()
    const displayName = name?.trim() || canonical.split(sep).filter(Boolean).pop() || '未命名项目'
    mkdirSync(join(canonical, '.mira', 'sessions'), { recursive: true })
    this.database.prepare('INSERT INTO harness_projects(id, name, icon, directory, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, displayName, selectedIcon, canonical, createdAt, createdAt)
    return this.getProject(id)
  }

  renameProject(id: string, name: string, icon?: string) {
    if (!name.trim()) throw new Error('项目名称不能为空')
    if (icon === undefined) this.database.prepare('UPDATE harness_projects SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), now(), id)
    else this.database.prepare('UPDATE harness_projects SET name = ?, icon = ?, updated_at = ? WHERE id = ?').run(name.trim(), validateProjectIcon(icon), now(), id)
    return this.getProject(id)
  }

  deleteProject(id: string, removeMira = false) {
    const project = this.getProject(id)
    if (removeMira) rmSync(this.projectMira(project), { recursive: true, force: true })
    this.database.prepare('DELETE FROM harness_sessions WHERE project_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_projects WHERE id = ?').run(id)
  }

  createSession(projectId?: string, permissionMode: PermissionMode = this.getPermissionConfig().globalDefaultMode) {
    const project = projectId ? this.getProject(projectId) : undefined
    const time = now()
    const session: HarnessSession = {
      version: 1, id: createSessionId(), title: '新对话', projectId: project?.id, workingDirectory: project?.directory,
      permissionMode, messages: [], toolCalls: [], createdAt: time, updatedAt: time, status: 'active',
    }
    return this.saveSession(session)
  }

  listSessions(query = ''): HarnessSessionSummary[] {
    const text = `%${query.trim()}%`
    const rows = this.database.prepare(`SELECT s.*, p.name AS project_name FROM harness_sessions s LEFT JOIN harness_projects p ON p.id = s.project_id
      WHERE s.title LIKE ? ORDER BY s.updated_at DESC`).all(text) as Array<SessionRow & { project_name: string | null }>
    return rows.map(row => ({ id: row.id, title: row.title, projectId: row.project_id || undefined, projectName: row.project_name || undefined,
      modelProviderId: row.model_provider_id || undefined, modelId: row.model_id || undefined, permissionMode: row.permission_mode,
      status: row.status, workingDirectory: row.working_directory || undefined, createdAt: row.created_at, updatedAt: row.updated_at }))
  }

  getSession(id: string) {
    const row = this.database.prepare('SELECT path FROM harness_sessions WHERE id = ?').get(id) as { path?: string } | undefined
    if (!row?.path || !existsSync(row.path)) throw new Error('未找到会话')
    return this.parseSession(readFileSync(row.path, 'utf8'))
  }

  updateSession(session: HarnessSession) { return this.saveSession(session) }

  addMessage(id: string, role: HarnessMessage['role'], content: string, attachments?: HarnessMessageAttachment[]) {
    const session = this.getSession(id)
    session.messages.push({ id: randomUUID(), role, content, ...(attachments?.length ? { attachments } : {}), createdAt: now() })
    if (role === 'user' && session.title === '新对话') session.title = titleFor(content)
    return this.saveSession(session)
  }

  appendAssistantDelta(id: string, content: string) {
    if (!content) return this.getSession(id)
    const session = this.getSession(id)
    const last = session.messages.at(-1)
    if (last?.role === 'assistant') last.content += content
    else session.messages.push({ id: randomUUID(), role: 'assistant', content, createdAt: now() })
    return this.saveSession(session)
  }

  finalizeAssistantMessage(id: string, options: { run?: HarnessRunSummary, usage?: HarnessMessage['usage'], interrupted?: boolean } = {}) {
    const session = this.getSession(id)
    const last = session.messages.at(-1)
    if (!last || last.role !== 'assistant') throw new Error('没有可完成的助手回复')
    if (options.run) last.run = options.run
    if (options.usage) last.usage = options.usage
    if (options.interrupted) last.interrupted = true
    else delete last.interrupted
    return this.saveSession(session)
  }

  appendAssistantText(id: string, content: string, run?: HarnessRunSummary, usage?: HarnessMessage['usage'], interrupted?: boolean) {
    if (content) this.appendAssistantDelta(id, content)
    return this.finalizeAssistantMessage(id, { run, usage, interrupted })
  }

  regenerate(id: string) {
    const session = this.getSession(id)
    const last = session.messages.at(-1)
    if (last?.role === 'assistant') session.messages.pop()
    return this.saveSession(session)
  }

  editUserMessageAndTruncate(id: string, messageId: string, content: string) {
    const value = content.trim()
    if (!value) throw new Error('消息不能为空')
    const session = this.getSession(id)
    const index = session.messages.findIndex(message => message.id === messageId)
    if (index < 0 || session.messages[index].role !== 'user') throw new Error('只能编辑用户消息')
    session.messages[index].content = value
    session.messages = session.messages.slice(0, index + 1)
    session.context = undefined
    return this.saveSession(session)
  }

  setStatus(id: string, status: HarnessSession['status']) {
    const session = this.getSession(id); session.status = status; return this.saveSession(session)
  }

  setPermission(id: string, permissionMode: PermissionMode) {
    if (!['default', 'auto-approve', 'full'].includes(permissionMode)) throw new Error('无效的权限档位')
    const config = this.getPermissionConfig()
    if (permissionMode === 'auto-approve' && !config.autoApproveEnabled) throw new Error('自动审核权限未启用')
    if (permissionMode === 'full' && !config.fullAccessEnabled) throw new Error('完全访问权限未启用')
    const session = this.getSession(id); session.permissionMode = permissionMode; return this.saveSession(session)
  }

  attachDirectory(sessionId: string, directory: string) {
    const session = this.getSession(sessionId)
    const project = this.createProject(directory)
    session.projectId = project.id; session.workingDirectory = project.directory
    return this.saveSession(session)
  }

  listProjectFiles(projectId: string, query = ''): HarnessFileReference[] {
    const project = this.getProject(projectId)
    const term = query.trim().toLocaleLowerCase()
    const files: HarnessFileReference[] = []
    const visit = (directory: string) => {
      if (files.length >= MAX_LISTED_PROJECT_FILES) return
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (files.length >= MAX_LISTED_PROJECT_FILES) return
        if (entry.isDirectory()) {
          if (!IGNORED_FILE_DIRECTORIES.has(entry.name)) visit(join(directory, entry.name))
          continue
        }
        if (!entry.isFile()) continue
        const target = join(directory, entry.name)
        if (!this.isTextProjectFile(target)) continue
        const path = relative(project.directory, target)
        if (!term || path.toLocaleLowerCase().includes(term)) files.push({ path, name: entry.name })
      }
    }
    visit(project.directory)
    return files.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
  }

  resolveMessageAttachments(sessionId: string, references: HarnessFileReference[] = []): HarnessMessageAttachment[] {
    if (!references.length) return []
    if (references.length > MAX_FILE_REFERENCES) throw new Error(`一次最多引用 ${MAX_FILE_REFERENCES} 个文件`)
    const session = this.getSession(sessionId)
    if (!session.projectId) throw new Error('请先选择项目后再引用文件')
    const project = this.getProject(session.projectId)
    const uniquePaths = new Set<string>()
    let totalBytes = 0
    return references.map(reference => {
      if (!reference || typeof reference.path !== 'string' || uniquePaths.has(reference.path)) throw new Error('引用文件重复或无效')
      uniquePaths.add(reference.path)
      const target = this.projectFilePath(project, reference.path)
      const content = readFileSync(target)
      if (content.includes(0)) throw new Error(`不支持引用二进制文件：${reference.path}`)
      if (content.byteLength > MAX_ATTACHMENT_FILE_BYTES) throw new Error(`引用文件过大：${reference.path}`)
      totalBytes += content.byteLength
      if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error('引用文件总大小超过限制')
      return { path: reference.path, name: basename(target), content: content.toString('utf8') }
    })
  }

  removeEmptySessions() {
    const rows = this.database.prepare('SELECT id, path FROM harness_sessions').all() as Array<{ id: string, path: string }>
    const emptyIds = rows.flatMap(row => {
      try {
        const session = this.parseSession(readFileSync(row.path, 'utf8'))
        return session.messages.some(message => message.role === 'user') ? [] : [row.id]
      } catch {
        return []
      }
    })
    if (!emptyIds.length) return 0
    this.deleteSessions(emptyIds)
    this.database.prepare(`UPDATE harness_projects SET last_session_at = (
      SELECT MAX(updated_at) FROM harness_sessions WHERE project_id = harness_projects.id
    )`).run()
    return emptyIds.length
  }

  deleteSession(id: string) {
    const row = this.database.prepare('SELECT path FROM harness_sessions WHERE id = ?').get(id) as { path?: string } | undefined
    if (row?.path) rmSync(row.path, { force: true })
    this.database.prepare('DELETE FROM harness_sessions WHERE id = ?').run(id)
  }

  deleteSessions(ids: string[]) {
    const uniqueIds = [...new Set(ids.filter(id => typeof id === 'string' && id))]
    if (!uniqueIds.length) return
    const placeholders = uniqueIds.map(() => '?').join(', ')
    const rows = this.database.prepare(`SELECT path FROM harness_sessions WHERE id IN (${placeholders})`).all(...uniqueIds) as Array<{ path: string }>
    const remove = this.database.transaction(() => {
      rows.forEach(row => rmSync(row.path, { force: true }))
      this.database.prepare(`DELETE FROM harness_sessions WHERE id IN (${placeholders})`).run(...uniqueIds)
    })
    remove()
  }

  recordTool(id: string, record: ToolCallRecord) {
    const session = this.getSession(id); session.toolCalls.push(record); return this.saveSession(session)
  }

  updateTool(id: string, toolId: string, patch: Partial<ToolCallRecord>) {
    const session = this.getSession(id); const tool = session.toolCalls.find(item => item.id === toolId)
    if (tool) Object.assign(tool, patch)
    return this.saveSession(session)
  }

  getPermissionConfig(): PermissionConfig {
    const row = this.database.prepare('SELECT value FROM harness_settings WHERE key = ?').get('permission') as { value?: string } | undefined
    try {
      const stored = row?.value ? JSON.parse(row.value) as Partial<PermissionConfig> : {}
      return {
        ...DEFAULT_PERMISSION_CONFIG,
        ...stored,
        autoApproveEnabled: typeof stored.autoApproveEnabled === 'boolean' ? stored.autoApproveEnabled : DEFAULT_PERMISSION_CONFIG.autoApproveEnabled,
        fullAccessEnabled: typeof stored.fullAccessEnabled === 'boolean' ? stored.fullAccessEnabled : DEFAULT_PERMISSION_CONFIG.fullAccessEnabled,
        globalDefaultMode: 'default',
      }
    } catch { return clone(DEFAULT_PERMISSION_CONFIG) }
  }

  savePermissionConfig(config: PermissionConfig) {
    const current = this.getPermissionConfig()
    const next: PermissionConfig = {
      ...current,
      autoApproveEnabled: typeof config.autoApproveEnabled === 'boolean' ? config.autoApproveEnabled : current.autoApproveEnabled,
      fullAccessEnabled: typeof config.fullAccessEnabled === 'boolean' ? config.fullAccessEnabled : current.fullAccessEnabled,
      globalDefaultMode: 'default',
    }
    this.database.prepare('INSERT OR REPLACE INTO harness_settings(key, value) VALUES (?, ?)').run('permission', JSON.stringify(next))
    return this.getPermissionConfig()
  }

  getGitConfig(): HarnessGitConfig {
    const row = this.database.prepare('SELECT value FROM harness_settings WHERE key = ?').get('git') as { value?: string } | undefined
    try {
      const stored = row?.value ? JSON.parse(row.value) as Partial<HarnessGitConfig> : {}
      return {
        branchPrefix: gitPrefix(stored.branchPrefix),
        pullRequestMergeMethod: stored.pullRequestMergeMethod === 'squash' ? 'squash' : 'merge',
        alwaysForcePush: typeof stored.alwaysForcePush === 'boolean' ? stored.alwaysForcePush : DEFAULT_HARNESS_GIT_CONFIG.alwaysForcePush,
        createDraftPullRequest: typeof stored.createDraftPullRequest === 'boolean' ? stored.createDraftPullRequest : DEFAULT_HARNESS_GIT_CONFIG.createDraftPullRequest,
        reviewDelivery: stored.reviewDelivery === 'separate' ? 'separate' : 'inline',
        commitInstructions: typeof stored.commitInstructions === 'string' ? stored.commitInstructions : '',
        pullRequestInstructions: typeof stored.pullRequestInstructions === 'string' ? stored.pullRequestInstructions : '',
      }
    } catch { return clone(DEFAULT_HARNESS_GIT_CONFIG) }
  }

  saveGitConfig(config: HarnessGitConfig) {
    const current = this.getGitConfig()
    const next: HarnessGitConfig = {
      branchPrefix: gitPrefix(config.branchPrefix),
      pullRequestMergeMethod: config.pullRequestMergeMethod === 'squash' ? 'squash' : 'merge',
      alwaysForcePush: typeof config.alwaysForcePush === 'boolean' ? config.alwaysForcePush : current.alwaysForcePush,
      createDraftPullRequest: typeof config.createDraftPullRequest === 'boolean' ? config.createDraftPullRequest : current.createDraftPullRequest,
      reviewDelivery: config.reviewDelivery === 'separate' ? 'separate' : 'inline',
      commitInstructions: typeof config.commitInstructions === 'string' ? config.commitInstructions : current.commitInstructions,
      pullRequestInstructions: typeof config.pullRequestInstructions === 'string' ? config.pullRequestInstructions : current.pullRequestInstructions,
    }
    this.database.prepare('INSERT OR REPLACE INTO harness_settings(key, value) VALUES (?, ?)').run('git', JSON.stringify(next))
    return this.getGitConfig()
  }

  moveToTrash(sessionId: string, relativePath: string) {
    const session = this.getSession(sessionId)
    if (!session.projectId || !session.workingDirectory) throw new Error('请先选择项目目录')
    const project = this.getProject(session.projectId)
    const source = this.ensureInside(project.directory, join(project.directory, relativePath))
    if (!existsSync(source)) throw new Error('文件不存在')
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const destination = join(project.directory, this.getPermissionConfig().trashDirName, stamp, relativePath)
    mkdirSync(dirname(destination), { recursive: true }); renameSync(source, destination)
    return { token: stamp, path: relativePath }
  }

  listTrash(projectId: string) {
    const project = this.getProject(projectId); const root = join(project.directory, this.getPermissionConfig().trashDirName)
    if (!existsSync(root)) return [] as string[]
    return readdirSync(root)
  }

  restoreTrash(projectId: string, token: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(token)) throw new Error('回收站记录无效')
    const project = this.getProject(projectId); const root = join(project.directory, this.getPermissionConfig().trashDirName, token)
    if (!existsSync(root)) throw new Error('未找到回收站记录')
    for (const entry of readdirSync(root)) cpSync(join(root, entry), join(project.directory, entry), { recursive: true, force: false })
    rmSync(root, { recursive: true, force: true })
  }
}
