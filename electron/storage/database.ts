import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import {
  AI_NOVEL_MENU,
  mainMenus as defaultsMenus,
  PROTECTED_MAIN_MENU_IDS,
} from '../../src/config/menus'
import { microApps as defaultMicroApps, withBuiltInMicroApps } from '../../src/config/microApps'
import { NovelStore } from './novelStore'
import { HarnessStore } from './harnessStore'
import { ModelConfigStore } from './modelConfigStore'
import { FileMemoryStore } from './fileMemoryStore'
import { InstructionStore } from './instructionStore'
import { RunLogStore } from './runLogStore'
import { SkillStore } from './skillStore'
import { AutomationStore } from './automationStore'
import { MiraPaths } from './miraPaths'
import { validateSnapshot } from '../../src/config/platformValidation'
import { DEFAULT_ASSISTANT_TONE, isModelProviderAvailable, type HarnessHistoryPage, type HarnessHistoryQuery, type HarnessUsageStats } from '../../src/config/harness'
import type { MenuItem, MicroApp, PlatformSnapshot } from '../../src/types'

const CURRENT_SCHEMA_VERSION = 28
const PROTECTED_MENU_ID_SET = new Set(PROTECTED_MAIN_MENU_IDS)
const REMOVED_BUILT_IN_MAIN_MENU_IDS = new Set(['dashboard', 'functional-components', 'system-management'])
const DEFAULT_PREFERENCES = { loadingStyle: 'cube-grid', showContextUsage: true, sendShortcut: 'enter', assistantTone: DEFAULT_ASSISTANT_TONE }
const REMOVED_LAYOUT_KEYS = new Set(['mode', 'sidebarWidth', 'collapsedWidth', 'headerHeight', 'showBreadcrumb', 'breadcrumbIcon', 'breadcrumbStyle', 'showFooter', 'footerStyle', 'footerHeight', 'footerCopyright', 'footerYearMode', 'footerYearStart', 'footerYearEnd', 'footerIcp', 'footerIcpLink', 'footerLinks'])
const HARNESS_COMPOSER_PREFERENCE = 'first-party.mira-harness.harness-react-composer-drafts'
const HARNESS_SIDEBAR_PREFERENCE = 'first-party.mira-harness.session-drawer'

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function removeProtectedMenus(menus: MenuItem[]): MenuItem[] {
  return menus
    .filter(menu => !PROTECTED_MENU_ID_SET.has(menu.id) && !REMOVED_BUILT_IN_MAIN_MENU_IDS.has(menu.id))
    .map(menu => ({ ...menu, children: menu.children ? removeProtectedMenus(menu.children) : undefined }))
}

export function normalizeProtectedMainMenus(menus: MenuItem[]): MenuItem[] {
  return [clone(AI_NOVEL_MENU), ...removeProtectedMenus(clone(menus))]
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

function assertProtectedMenus(menus: MenuItem[]) {
  const novel = menus.find(menu => menu.id === AI_NOVEL_MENU.id)
  if (stableSerialize(novel) !== stableSerialize(AI_NOVEL_MENU)) {
    throw new Error('AI 小说创作为内置菜单，不能修改或删除')
  }
}

export class PlatformDatabase {
  private readonly database: Database.Database
  private readonly filePath: string
  private readonly paths: MiraPaths
  readonly novels: NovelStore
  readonly harness: HarnessStore
  readonly models: ModelConfigStore
  readonly memories: FileMemoryStore
  readonly instructions: InstructionStore
  readonly logs: RunLogStore
  readonly skills: SkillStore
  readonly automations: AutomationStore
  private readonly deletedHarnessDraftOwners = new Set<string>()

  constructor(paths: MiraPaths | string) {
    this.paths = typeof paths === 'string' ? new MiraPaths(paths) : paths
    this.paths.ensure()
    this.filePath = this.paths.stateDatabase()
    this.database = new Database(this.filePath)
    this.novels = new NovelStore(this.database)
    this.models = new ModelConfigStore(this.database, this.paths)
    this.harness = new HarnessStore(this.database, this.paths)
    this.memories = new FileMemoryStore(this.paths)
    this.instructions = new InstructionStore(this.paths)
    this.logs = new RunLogStore(this.paths)
    this.skills = new SkillStore(this.paths)
    this.automations = new AutomationStore(this.database)
    this.database.pragma('journal_mode = WAL')
    this.migrate()
    // 选择附件会先创建会话；未发送的持久草稿仍需通过原会话恢复，不能当作旧空白会话清理。
    const roots = this.harnessDraftRoots()
    if (roots) {
      this.harness.removeEmptySessions(roots.sessionIds)
      // 只在 Runtime 启动前回收：运行中的队列/未确认提交可能还没有写入持久草稿。
      this.harness.reclaimStagedAttachments(roots.references, roots.protectedOwners)
    }
  }

  private harnessDraftRoots() {
    const retained = new Set<string>()
    const references = new Map<string, Set<string>>()
    const protectedOwners = new Set<string>()
    const protect = (owner: string) => { retained.add(owner); protectedOwners.add(owner) }
    const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
    const sidebarRow = this.database.prepare('SELECT value FROM preferences WHERE key = ?').get(HARNESS_SIDEBAR_PREFERENCE) as { value: string } | undefined
    try {
      if (sidebarRow) {
        const sidebar: unknown = JSON.parse(sidebarRow.value)
        if (!isObject(sidebar) || Object.keys(sidebar).some(key => !['expandedProjectIds', 'collapsedProjectIds', 'view', 'projectView', 'sort', 'groups', 'hiddenProjectIds', 'ungroupedSessionOrder', 'groupedRootOrder'].includes(key))) return
        const retain = (ids: unknown) => {
          if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('未知分组格式')
          ids.forEach(id => { if (id) retained.add(id) })
        }
        if (sidebar.groups !== undefined) {
          if (!Array.isArray(sidebar.groups)) return
          for (const group of sidebar.groups) {
            if (!isObject(group)) return
            retain(group.sessionIds)
          }
        }
        if (sidebar.ungroupedSessionOrder !== undefined) retain(sidebar.ungroupedSessionOrder)
        if (sidebar.groupedRootOrder !== undefined) {
          if (!Array.isArray(sidebar.groupedRootOrder)) return
          for (const item of sidebar.groupedRootOrder) {
            if (!isObject(item) || !['group', 'session'].includes(String(item.type)) || typeof item.id !== 'string' || !item.id || Object.keys(item).some(key => !['type', 'id'].includes(key))) return
            if (item.type === 'session') retained.add(item.id)
          }
        }
      }
    } catch { return }
    const row = this.database.prepare('SELECT value FROM preferences WHERE key = ?').get('first-party.mira-harness.harness-react-composer-drafts') as { value: string } | undefined
    let snapshot: Record<string, unknown> = {}
    if (row) {
      try {
        const value: unknown = JSON.parse(row.value)
        // 未来版本可能增加新的引用根；不认识的格式不等于没有附件。
        if (!isObject(value) || Object.keys(value).some(key => !['drafts', 'fileDrafts', 'config', 'recoveries', 'submissions', 'draft'].includes(key))) return
        snapshot = value
      } catch { return }
    }
    for (const key of ['drafts', 'fileDrafts', 'recoveries', 'submissions']) {
      if (snapshot[key] !== undefined && !isObject(snapshot[key])) return
    }
    const entries = (value: unknown) => isObject(value) ? Object.entries(value) : []
    if (snapshot.draft !== undefined && snapshot.draft !== null) {
      const draft = snapshot.draft
      if (!isObject(draft) || typeof draft.id !== 'string' || !draft.id.trim() || Object.keys(draft).some(key => !['id', 'groupId', 'sessionId', 'visible'].includes(key))
        || draft.groupId !== undefined && (typeof draft.groupId !== 'string' || !draft.groupId.trim())
        || draft.sessionId !== undefined && (typeof draft.sessionId !== 'string' || !draft.sessionId.trim())
        || draft.visible !== undefined && typeof draft.visible !== 'boolean') return
      if (typeof draft.sessionId === 'string') retained.add(draft.sessionId)
    }
    const submissionKeys = ['id', 'text', 'planning', 'references', 'selection', 'options', 'draft']
    const retainFiles = (owner: string, value: unknown) => {
      if (!Array.isArray(value)) { protect(owner); return }
      for (const file of value) {
        if (!isObject(file) || typeof file.path !== 'string' || !file.path.trim() || typeof file.name !== 'string' || !file.name.trim()) { protect(owner); continue }
        if (Object.keys(file).some(key => !['path', 'name', 'mediaType', 'size'].includes(key))) protect(owner)
        retained.add(owner)
        const paths = references.get(owner) ?? new Set<string>()
        paths.add(file.path)
        references.set(owner, paths)
      }
    }
    for (const [id, text] of entries(snapshot?.drafts)) {
      if (typeof text !== 'string') protect(id)
      else if (text.trim()) retained.add(id)
    }
    for (const [id, files] of entries(snapshot?.fileDrafts)) {
      retainFiles(id, files)
    }
    for (const [id, items] of entries(snapshot.recoveries)) {
      if (!Array.isArray(items)) { protect(id); continue }
      for (const item of items) {
        retained.add(id)
        if (!isObject(item) || item.sessionId !== id || Object.keys(item).some(key => ![...submissionKeys, 'submissionId', 'sessionId', 'permissionMode', 'createdAt', 'delivery', 'targetRunId', 'requestedDelivery', 'fallbackReason'].includes(key))) { protect(id); continue }
        retainFiles(id, item.references)
      }
    }
    for (const [id, item] of entries(snapshot.submissions)) {
      retained.add(id)
      if (!isObject(item) || Object.keys(item).some(key => !submissionKeys.includes(key))) { protect(id); continue }
      retainFiles(id, item.references)
    }
    return { sessionIds: retained, references, protectedOwners }
  }

  private migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS menus (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS micro_apps (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS novel_projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS novel_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS model_providers (id TEXT PRIMARY KEY, provider_key TEXT, name TEXT NOT NULL, endpoint TEXT NOT NULL, api_key BLOB, models TEXT NOT NULL, enabled INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS model_role_bindings (role TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS harness_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'FolderOpened', directory TEXT NOT NULL UNIQUE, default_model_provider_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_session_at INTEGER);
      CREATE TABLE IF NOT EXISTS harness_sessions (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, model_provider_id TEXT, model_id TEXT, permission_mode TEXT NOT NULL, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0, archived_at INTEGER, draft_state TEXT, sort_order INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL, working_directory TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS harness_session_state (session_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS harness_messages (session_id TEXT NOT NULL, message_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id, message_id));
      CREATE TABLE IF NOT EXISTS harness_tool_calls (session_id TEXT NOT NULL, tool_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id, tool_id));
      CREATE TABLE IF NOT EXISTS harness_plans (session_id TEXT NOT NULL, plan_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(session_id, plan_id));
      CREATE TABLE IF NOT EXISTS harness_interactions (session_id TEXT NOT NULL, interaction_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id, interaction_id));
      CREATE TABLE IF NOT EXISTS harness_runs (session_id TEXT NOT NULL, run_id TEXT NOT NULL, payload TEXT NOT NULL, started_at INTEGER NOT NULL, PRIMARY KEY(session_id, run_id));
      CREATE TABLE IF NOT EXISTS harness_run_activities (session_id TEXT NOT NULL, run_id TEXT NOT NULL, activity_id TEXT NOT NULL, payload TEXT NOT NULL, started_at INTEGER NOT NULL, PRIMARY KEY(session_id, run_id, activity_id));
      CREATE TABLE IF NOT EXISTS harness_subtasks (session_id TEXT NOT NULL, run_id TEXT NOT NULL, subtask_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id, run_id, subtask_id));
      CREATE TABLE IF NOT EXISTS harness_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS automation_tasks (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, trigger_type TEXT NOT NULL, cron_expression TEXT,
        trigger_scheduled_at INTEGER, trigger_human_label TEXT,
        project_id TEXT NOT NULL, target_type TEXT NOT NULL, target_session_id TEXT, prompt TEXT NOT NULL,
        provider_id TEXT NOT NULL, model_id TEXT NOT NULL, thinking_level TEXT, permission_mode TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1, template_id TEXT, valid_from INTEGER, valid_until INTEGER, ended_at INTEGER,
        last_run_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL,
        scheduled_at INTEGER, started_at INTEGER, completed_at INTEGER, session_id TEXT, snapshot TEXT NOT NULL,
        result_summary TEXT, error TEXT, retried_from TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_automation_runs_task_time ON automation_runs(task_id, completed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);
    `)
    const projectColumns = this.database.prepare('PRAGMA table_info(harness_projects)').all() as Array<{ name: string }>
    if (!projectColumns.some(column => column.name === 'icon')) {
      this.database.exec("ALTER TABLE harness_projects ADD COLUMN icon TEXT NOT NULL DEFAULT 'FolderOpened'")
    }
    const sessionColumns = this.database.prepare('PRAGMA table_info(harness_sessions)').all() as Array<{ name: string }>
    if (!sessionColumns.some(column => column.name === 'pinned')) {
      this.database.exec('ALTER TABLE harness_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
    }
    if (!sessionColumns.some(column => column.name === 'unread')) {
      this.database.exec('ALTER TABLE harness_sessions ADD COLUMN unread INTEGER NOT NULL DEFAULT 0')
    }
    if (!sessionColumns.some(column => column.name === 'archived_at')) {
      this.database.exec('ALTER TABLE harness_sessions ADD COLUMN archived_at INTEGER')
    }
    if (!sessionColumns.some(column => column.name === 'draft_state')) this.database.exec('ALTER TABLE harness_sessions ADD COLUMN draft_state TEXT')
    const projectOrderMissing = !projectColumns.some(column => column.name === 'sort_order')
    const sessionOrderMissing = !sessionColumns.some(column => column.name === 'sort_order')
    if (projectOrderMissing || sessionOrderMissing) {
      this.backup()
      this.database.transaction(() => {
        if (projectOrderMissing) this.database.exec('ALTER TABLE harness_projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
        if (sessionOrderMissing) this.database.exec('ALTER TABLE harness_sessions ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
      })()
    }
    const providerColumns = this.database.prepare('PRAGMA table_info(model_providers)').all() as Array<{ name: string }>
    if (!providerColumns.some(column => column.name === 'provider_key')) {
      this.database.exec('ALTER TABLE model_providers ADD COLUMN provider_key TEXT')
    }
    const automationTaskColumns = this.database.prepare('PRAGMA table_info(automation_tasks)').all() as Array<{ name: string }>
    const addAutomationTaskColumn = (name: string, type: string) => {
      if (!automationTaskColumns.some(column => column.name === name)) this.database.exec(`ALTER TABLE automation_tasks ADD COLUMN ${name} ${type}`)
    }
    addAutomationTaskColumn('trigger_scheduled_at', 'INTEGER')
    addAutomationTaskColumn('trigger_human_label', 'TEXT')
    addAutomationTaskColumn('template_id', 'TEXT')
    addAutomationTaskColumn('valid_from', 'INTEGER')
    addAutomationTaskColumn('valid_until', 'INTEGER')
    addAutomationTaskColumn('ended_at', 'INTEGER')
    const automationRunColumns = this.database.prepare('PRAGMA table_info(automation_runs)').all() as Array<{ name: string }>
    if (!automationRunColumns.some(column => column.name === 'retried_from')) this.database.exec('ALTER TABLE automation_runs ADD COLUMN retried_from TEXT')
    this.models.migrateLegacyBindings()
    this.models.migrateLegacyProviderReferences()
    const seeded = Boolean(this.database.prepare('SELECT 1 FROM meta WHERE key = ?').get('seeded'))
    if (!seeded) {
      this.writeSnapshot({ mainMenus: clone(defaultsMenus), microApps: clone(defaultMicroApps), preferences: clone(DEFAULT_PREFERENCES) })
      this.database.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('seeded', '1')
    } else {
      const versionRow = this.database.prepare('SELECT value FROM meta WHERE key = ?').get('schemaVersion') as { value?: string } | undefined
      const version = Number(versionRow?.value || 1)
      if (version < 22) this.database.exec('DROP TABLE IF EXISTS memories; DROP TABLE IF EXISTS memory_settings;')
      if (version < 11) {
        const snapshot = this.getSnapshot()
        this.backup()
        this.writeSnapshot({
          ...snapshot,
          // 开发预览阶段不兼容旧菜单结构，升级时直接使用当前默认菜单。
          mainMenus: clone(defaultsMenus),
          microApps: version < 3 ? [] : snapshot.microApps,
        })
        this.database.prepare("DELETE FROM preferences WHERE key IN ('tabs', 'recentCommands')").run()
      }
      if (version < 12) {
        const hasNovelApp = this.database.prepare('SELECT 1 FROM micro_apps WHERE code = ?').get('ai-novel')
        if (!hasNovelApp) {
          this.backup()
          const insertApp = this.database.prepare('INSERT INTO micro_apps(id, code, payload) VALUES (?, ?, ?)')
          for (const app of defaultMicroApps) {
            if (app.code === 'ai-novel') insertApp.run(app.id, app.code, JSON.stringify(app))
          }
        }
      }
      if (version < 13) {
        const row = this.database.prepare('SELECT payload FROM micro_apps WHERE code = ?').get('ai-novel') as { payload?: string } | undefined
        const builtin = defaultMicroApps.find(app => app.code === 'ai-novel')
        if (row?.payload && builtin) {
          const current = JSON.parse(row.payload) as MicroApp
          this.backup()
          this.database.prepare('UPDATE micro_apps SET payload = ? WHERE code = ?').run(JSON.stringify({
            ...current,
            // legacy 小说页面使用全局 CSS/DOM，必须用 iframe 做完整隔离。
            entry: builtin.entry,
            integrationMode: builtin.integrationMode,
            runtimeConfig: builtin.runtimeConfig,
          }), 'ai-novel')
        }
      }
      if (version < 14) {
        const row = this.database.prepare('SELECT payload FROM micro_apps WHERE code = ?').get('ai-novel') as { payload?: string } | undefined
        if (row?.payload) {
          const current = JSON.parse(row.payload) as MicroApp
          const menus = (current.menus || []).map(menu =>
            menu.id === 'ai_novel_home' ? { ...menu, showPageHeader: false } : menu,
          )
          this.backup()
          this.database.prepare('UPDATE micro_apps SET payload = ? WHERE code = ?').run(JSON.stringify({ ...current, menus }), 'ai-novel')
        }
      }
      if (version < 15) {
        const row = this.database.prepare('SELECT payload FROM micro_apps WHERE code = ?').get('ai-novel') as { payload?: string } | undefined
        const builtin = defaultMicroApps.find(app => app.code === 'ai-novel')
        if (row?.payload && builtin) {
          const current = JSON.parse(row.payload) as MicroApp
          // 编辑器往返曾把根级菜单路径拼成 /micro/ai-novel/ai-novel 并误改状态，
          // 缺少首页菜单时按内置配置恢复，保证 showPageHeader 等菜单配置可命中。
          const builtinHomePath = builtin.menus?.find(menu => menu.target?.type === 'microapp')?.path
          const hasHomeMenu = builtinHomePath
            ? (current.menus || []).some(menu => menu.path === builtinHomePath)
            : false
          if (builtinHomePath && !hasHomeMenu) {
            this.backup()
            this.database.prepare('UPDATE micro_apps SET payload = ? WHERE code = ?').run(
              JSON.stringify({ ...current, menus: builtin.menus }),
              'ai-novel',
            )
          }
        }
      }
      if (version < 16) {
        const snapshot = this.getSnapshot()
        this.backup()
        this.writeSnapshot({
          ...snapshot,
          mainMenus: normalizeProtectedMainMenus(snapshot.mainMenus),
          microApps: snapshot.microApps.filter(app => app.code !== 'ai-novel'),
        })
      }
      if (version < 17) {
        const snapshot = this.getSnapshot()
        this.backup()
        this.writeSnapshot({ ...snapshot, mainMenus: normalizeProtectedMainMenus(snapshot.mainMenus) })
        this.savePreference('novelModelProfilesMigratedAt', Date.now())
      }
      if (version < 25) this.harness.migrateStructuredSessions()
    }
    const layoutRow = this.database.prepare('SELECT value FROM preferences WHERE key = ?').get('layout') as { value?: string } | undefined
    if (layoutRow?.value) {
      try {
        const layout = JSON.parse(layoutRow.value) as Record<string, unknown>
        if (layout && typeof layout === 'object' && !Array.isArray(layout)) {
          const normalizedLayout = Object.fromEntries(Object.entries(layout).filter(([key]) => !REMOVED_LAYOUT_KEYS.has(key)))
          if (Object.keys(normalizedLayout).length !== Object.keys(layout).length) this.savePreference('layout', normalizedLayout)
        }
      } catch {
        // Ignore malformed legacy layout preferences and let the renderer use defaults.
      }
    }
    let workspaceSettings = this.novels.getSettings()
    if (workspaceSettings.modelSelection) {
      const provider = this.models.get(workspaceSettings.modelSelection.providerId)
      if (!provider) workspaceSettings = this.novels.saveSettings({ ...workspaceSettings, modelSelection: undefined })
      else if (provider.id !== workspaceSettings.modelSelection.providerId) workspaceSettings = this.novels.saveSettings({ ...workspaceSettings, modelSelection: { ...workspaceSettings.modelSelection, providerId: provider.id } })
    }
    if (!workspaceSettings.modelSelection) {
      const provider = this.models.list().find(item => isModelProviderAvailable(item))
      const model = provider?.models.find(item => item.enabled)
      if (provider && model) this.novels.saveSettings({ ...workspaceSettings, modelSelection: { providerId: provider.id, modelId: model.id } })
    }
    const insertPreference = this.database.prepare('INSERT OR IGNORE INTO preferences(key, value) VALUES (?, ?)')
    Object.entries(DEFAULT_PREFERENCES).forEach(([key, value]) => insertPreference.run(key, JSON.stringify(value)))
    this.database.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('schemaVersion', ?)").run(String(CURRENT_SCHEMA_VERSION))
  }

  getSnapshot(): PlatformSnapshot {
    const mainMenus = this.database.prepare('SELECT payload FROM menus ORDER BY rowid').all().map((row: { payload: string }) => JSON.parse(row.payload)) as MenuItem[]
    const microApps = this.database.prepare('SELECT payload FROM micro_apps ORDER BY rowid').all().map((row: { payload: string }) => JSON.parse(row.payload)) as MicroApp[]
    const preferences = Object.fromEntries(this.database.prepare('SELECT key, value FROM preferences').all().map((row: { key: string; value: string }) => [row.key, JSON.parse(row.value)]))
    return { mainMenus, microApps: withBuiltInMicroApps(microApps), preferences }
  }

  private writeSnapshot(snapshot: PlatformSnapshot) {
    snapshot = { ...snapshot, microApps: withBuiltInMicroApps(snapshot.microApps) }
    validateSnapshot(snapshot)
    assertProtectedMenus(snapshot.mainMenus)
    const write = this.database.transaction(() => {
      this.database.prepare('DELETE FROM menus').run()
      this.database.prepare('DELETE FROM micro_apps').run()
      const insertMenu = this.database.prepare('INSERT INTO menus(id, payload) VALUES (?, ?)')
      const insertApp = this.database.prepare('INSERT INTO micro_apps(id, code, payload) VALUES (?, ?, ?)')
      snapshot.mainMenus.forEach(menu => insertMenu.run(menu.id, JSON.stringify(menu)))
      snapshot.microApps.forEach(app => insertApp.run(app.id, app.code, JSON.stringify(app)))
    })
    write()
  }

  saveMenus(mainMenus: MenuItem[]) {
    const next = { ...this.getSnapshot(), mainMenus }
    this.writeSnapshot(next)
    return this.getSnapshot()
  }

  saveMicroApps(microApps: MicroApp[]) {
    const next = { ...this.getSnapshot(), microApps }
    this.writeSnapshot(next)
    return this.getSnapshot()
  }

  savePreference(key: string, value: unknown) {
    if (key === HARNESS_COMPOSER_PREFERENCE) value = this.withoutDeletedHarnessDrafts(value)
    if (key === HARNESS_SIDEBAR_PREFERENCE && value && typeof value === 'object' && !Array.isArray(value) && this.deletedHarnessDraftOwners.size) {
      const sidebar = value as Record<string, unknown>
      if (Array.isArray(sidebar.groupedRootOrder)) value = {
        ...sidebar,
        groupedRootOrder: sidebar.groupedRootOrder.filter(item => !item || typeof item !== 'object' || item.type !== 'session' || !this.deletedHarnessDraftOwners.has(item.id)),
      }
    }
    this.database.prepare('INSERT OR REPLACE INTO preferences(key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
  }

  hasUnconfirmedHarnessSubmission(id: string) {
    const row = this.database.prepare('SELECT value FROM preferences WHERE key = ?').get(HARNESS_COMPOSER_PREFERENCE) as { value: string } | undefined
    if (!row) return false
    const value: unknown = JSON.parse(row.value)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无法确认待发送草稿状态')
    if (Object.keys(value).some(key => !['drafts', 'fileDrafts', 'recoveries', 'submissions', 'config', 'draft'].includes(key))) throw new Error('无法确认待发送草稿状态')
    const submissions = (value as Record<string, unknown>).submissions
    if (submissions === undefined) return false
    if (!submissions || typeof submissions !== 'object' || Array.isArray(submissions)) throw new Error('无法确认待发送草稿状态')
    return Object.prototype.hasOwnProperty.call(submissions, id) && (submissions as Record<string, unknown>)[id] != null
  }

  removeHarnessDraftOwners(ids: readonly string[]) {
    if (!ids.length) return
    ids.forEach(id => this.deletedHarnessDraftOwners.add(id))
    for (const key of [HARNESS_COMPOSER_PREFERENCE, HARNESS_SIDEBAR_PREFERENCE]) {
      const row = this.database.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as { value: string } | undefined
      if (row) {
        try { this.savePreference(key, JSON.parse(row.value)) }
        catch { /* A damaged concurrent snapshot stays intact; future valid saves still strip deleted owners. */ }
      }
    }
  }

  private withoutDeletedHarnessDrafts(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !this.deletedHarnessDraftOwners.size) return value
    const next = { ...value } as Record<string, unknown>
    for (const key of ['drafts', 'fileDrafts', 'recoveries', 'submissions']) {
      const entries = next[key]
      if (entries && typeof entries === 'object' && !Array.isArray(entries)) next[key] = Object.fromEntries(Object.entries(entries).filter(([id]) => !this.deletedHarnessDraftOwners.has(id)))
    }
    if (next.draft && typeof next.draft === 'object' && !Array.isArray(next.draft) && this.deletedHarnessDraftOwners.has((next.draft as Record<string, unknown>).sessionId as string)) delete next.draft
    return next
  }

  backup() {
    this.database.pragma('wal_checkpoint(TRUNCATE)')
    if (existsSync(this.filePath)) copyFileSync(this.filePath, `${this.filePath}.${Date.now()}.bak`)
  }

  queryHarnessHistory(query: HarnessHistoryQuery = {}): HarnessHistoryPage {
    return this.harness.queryHistory(query, new Map(this.models.list().map(provider => [provider.id, provider.providerKey])))
  }

  queryHarnessUsage(): HarnessUsageStats {
    return this.harness.usageStats(new Map(this.models.list().map(provider => [provider.id, provider.name])))
  }

  close() {
    this.database.close()
  }

  importSnapshot(raw: string) {
    let snapshot: PlatformSnapshot
    try { snapshot = JSON.parse(raw) as PlatformSnapshot } catch { throw new Error('导入文件不是有效 JSON') }
    if (!snapshot || !Array.isArray(snapshot.mainMenus) || !Array.isArray(snapshot.microApps)) throw new Error('配置快照格式无效')
    snapshot = { ...snapshot, mainMenus: normalizeProtectedMainMenus(snapshot.mainMenus) }
    validateSnapshot(snapshot)
    assertProtectedMenus(snapshot.mainMenus)
    this.backup()
    const write = this.database.transaction(() => {
      this.writeSnapshot(snapshot)
      this.database.prepare('DELETE FROM preferences').run()
      const insert = this.database.prepare('INSERT INTO preferences(key, value) VALUES (?, ?)')
      Object.entries(snapshot.preferences || {}).forEach(([key, value]) => insert.run(key, JSON.stringify(value)))
    })
    write()
    return this.getSnapshot()
  }

  exportSnapshot() { return JSON.stringify(this.getSnapshot(), null, 2) }

  restoreDefaults() {
    return this.importSnapshot(JSON.stringify({ mainMenus: defaultsMenus, microApps: defaultMicroApps, preferences: DEFAULT_PREFERENCES }))
  }
}
