import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  createNovelProject,
  DEFAULT_NOVEL_WORKSPACE_SETTINGS,
  type NovelProjectDocument,
  type NovelProjectSummary,
  type NovelWorkspaceSettings,
  toNovelProjectSummary,
} from '../src/config/novel'

type ProjectRow = {
  id: string
  title: string
  created_at: number
  updated_at: number
  payload: string
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function parseProject(raw: string): NovelProjectDocument {
  const parsed = JSON.parse(raw) as Partial<NovelProjectDocument>
  if (!parsed || parsed.version !== 1 || typeof parsed.id !== 'string' || typeof parsed.title !== 'string') {
    throw new Error('小说项目格式无效')
  }
  const base = createNovelProject(parsed.title)
  return {
    ...base,
    ...parsed,
    story: { ...base.story, ...(parsed.story || {}) },
    chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
    knowledge: Array.isArray(parsed.knowledge) ? parsed.knowledge : [],
    prompts: Array.isArray(parsed.prompts) ? parsed.prompts : base.prompts,
    assistantMessages: Array.isArray(parsed.assistantMessages) ? parsed.assistantMessages : [],
    generatedIdeas: Array.isArray(parsed.generatedIdeas) ? parsed.generatedIdeas : [],
    mindMap: parsed.mindMap && typeof parsed.mindMap === 'object' ? parsed.mindMap : base.mindMap,
    optimizer: { ...base.optimizer, ...(parsed.optimizer || {}) },
  } as NovelProjectDocument
}

export class NovelStore {
  constructor(private readonly database: Database.Database) {}

  listProjects(): NovelProjectSummary[] {
    return this.database.prepare('SELECT id, title, created_at, updated_at, payload FROM novel_projects ORDER BY updated_at DESC').all()
      .map((row: ProjectRow) => {
        const project = parseProject(row.payload)
        return { ...toNovelProjectSummary(project), id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }
      })
  }

  getProject(id: string): NovelProjectDocument {
    const row = this.database.prepare('SELECT payload FROM novel_projects WHERE id = ?').get(id) as { payload?: string } | undefined
    if (!row?.payload) throw new Error('未找到该小说项目')
    return parseProject(row.payload)
  }

  createProject(title?: string): NovelProjectDocument {
    const project = createNovelProject(title?.trim() || '未命名作品')
    this.saveProject(project)
    return project
  }

  saveProject(input: NovelProjectDocument): NovelProjectDocument {
    const project = parseProject(JSON.stringify(input))
    project.title = project.title.trim() || '未命名作品'
    project.updatedAt = Date.now()
    this.database.prepare(`
      INSERT INTO novel_projects(id, title, created_at, updated_at, payload)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at, payload = excluded.payload
    `).run(project.id, project.title, project.createdAt, project.updatedAt, JSON.stringify(project))
    return clone(project)
  }

  deleteProject(id: string) {
    const result = this.database.prepare('DELETE FROM novel_projects WHERE id = ?').run(id)
    if (!result.changes) throw new Error('未找到该小说项目')
  }

  exportProject(id: string) {
    return JSON.stringify(this.getProject(id), null, 2)
  }

  importProject(raw: string): NovelProjectDocument {
    let project: NovelProjectDocument
    try { project = parseProject(raw) } catch { throw new Error('导入文件不是有效的小说项目 JSON') }
    const importedAt = Date.now()
    project.id = randomUUID()
    project.createdAt = importedAt
    project.updatedAt = importedAt
    project.title = `${project.title || '未命名作品'}（导入）`
    return this.saveProject(project)
  }

  getSettings(): NovelWorkspaceSettings {
    const row = this.database.prepare('SELECT value FROM novel_settings WHERE key = ?').get('workspace') as { value?: string } | undefined
    if (!row?.value) return clone(DEFAULT_NOVEL_WORKSPACE_SETTINGS)
    try {
      const parsed = JSON.parse(row.value) as Partial<NovelWorkspaceSettings>
      return { shortcuts: Array.isArray(parsed.shortcuts) ? parsed.shortcuts.filter(item => typeof item === 'string') : [] }
    } catch {
      return clone(DEFAULT_NOVEL_WORKSPACE_SETTINGS)
    }
  }

  saveSettings(settings: NovelWorkspaceSettings) {
    const value = { shortcuts: settings.shortcuts.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean) }
    this.database.prepare('INSERT OR REPLACE INTO novel_settings(key, value) VALUES (?, ?)').run('workspace', JSON.stringify(value))
    return value
  }
}
