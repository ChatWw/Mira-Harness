import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type Database from 'better-sqlite3'
import {
  DEFAULT_PERMISSION_CONFIG,
  DEFAULT_PROJECT_ICON,
  PROJECT_ICON_OPTIONS,
  type HarnessMessage,
  type HarnessProject,
  type HarnessSession,
  type HarnessSessionSummary,
  type PermissionConfig,
  type PermissionMode,
  type ToolCallRecord,
} from '../src/config/harness'

type ProjectRow = { id: string, name: string, icon: string, directory: string, default_model_provider_id: string | null, created_at: number, updated_at: number, last_session_at: number | null }
type SessionRow = { id: string, project_id: string | null, title: string, model_provider_id: string | null, model_id: string | null, permission_mode: PermissionMode, status: HarnessSession['status'], path: string, working_directory: string | null, created_at: number, updated_at: number }

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function now() { return Date.now() }
function createSessionId() { return randomUUID() }
function titleFor(content: string) { return content.trim().replace(/\s+/g, ' ').slice(0, 42) || '新对话' }
function projectIcon(value?: string) { return PROJECT_ICON_OPTIONS.includes(value as typeof PROJECT_ICON_OPTIONS[number]) ? value! : DEFAULT_PROJECT_ICON }
function validateProjectIcon(value?: string) {
  if (value !== undefined && !PROJECT_ICON_OPTIONS.includes(value as typeof PROJECT_ICON_OPTIONS[number])) throw new Error('项目图标无效')
  return value || DEFAULT_PROJECT_ICON
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

  private saveSession(session: HarnessSession) {
    const path = this.sessionPath(session)
    mkdirSync(dirname(path), { recursive: true })
    session.updatedAt = now()
    writeFileSync(path, JSON.stringify(session, null, 2), 'utf8')
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
      lastSessionAt: row.last_session_at || undefined, defaultModelProviderId: row.default_model_provider_id || undefined, sessionCount: countMap.get(row.id) || 0,
    }))
  }

  getProject(id: string): HarnessProject {
    const row = this.database.prepare('SELECT * FROM harness_projects WHERE id = ?').get(id) as ProjectRow | undefined
    if (!row) throw new Error('未找到项目')
    const sessionCount = (this.database.prepare('SELECT COUNT(*) AS count FROM harness_sessions WHERE project_id = ?').get(id) as { count: number }).count
    return { id: row.id, name: row.name, icon: projectIcon(row.icon), directory: row.directory, createdAt: row.created_at, updatedAt: row.updated_at, lastSessionAt: row.last_session_at || undefined, defaultModelProviderId: row.default_model_provider_id || undefined, sessionCount }
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

  renameProject(id: string, name: string) {
    if (!name.trim()) throw new Error('项目名称不能为空')
    this.database.prepare('UPDATE harness_projects SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), now(), id)
    return this.getProject(id)
  }

  deleteProject(id: string, removeMira = false) {
    const project = this.getProject(id)
    if (removeMira) rmSync(this.projectMira(project), { recursive: true, force: true })
    this.database.prepare('DELETE FROM harness_sessions WHERE project_id = ?').run(id)
    this.database.prepare('DELETE FROM harness_projects WHERE id = ?').run(id)
  }

  createSession(projectId?: string, permissionMode: PermissionMode = DEFAULT_PERMISSION_CONFIG.globalDefaultMode) {
    const project = projectId ? this.getProject(projectId) : this.listProjects()[0]
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

  addMessage(id: string, role: HarnessMessage['role'], content: string) {
    const session = this.getSession(id)
    session.messages.push({ id: randomUUID(), role, content, createdAt: now() })
    if (role === 'user' && session.title === '新对话') session.title = titleFor(content)
    return this.saveSession(session)
  }

  appendAssistantText(id: string, content: string) {
    const session = this.getSession(id)
    const last = session.messages.at(-1)
    if (last?.role === 'assistant') last.content += content
    else session.messages.push({ id: randomUUID(), role: 'assistant', content, createdAt: now() })
    return this.saveSession(session)
  }

  setStatus(id: string, status: HarnessSession['status']) {
    const session = this.getSession(id); session.status = status; return this.saveSession(session)
  }

  setPermission(id: string, permissionMode: PermissionMode) {
    const session = this.getSession(id); session.permissionMode = permissionMode; return this.saveSession(session)
  }

  attachDirectory(sessionId: string, directory: string) {
    const session = this.getSession(sessionId)
    const project = this.createProject(directory)
    session.projectId = project.id; session.workingDirectory = project.directory
    return this.saveSession(session)
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
    try { return { ...DEFAULT_PERMISSION_CONFIG, ...(row?.value ? JSON.parse(row.value) : {}) } } catch { return clone(DEFAULT_PERMISSION_CONFIG) }
  }

  savePermissionConfig(config: PermissionConfig) {
    this.database.prepare('INSERT OR REPLACE INTO harness_settings(key, value) VALUES (?, ?)').run('permission', JSON.stringify(config))
    return this.getPermissionConfig()
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
