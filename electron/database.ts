import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import {
  AI_NOVEL_MENU,
  mainMenus as defaultsMenus,
  PROTECTED_MAIN_MENU_IDS,
} from '../src/config/menus'
import { microApps as defaultMicroApps } from '../src/config/microApps'
import { NovelStore } from './novelStore'
import { HarnessStore } from './harnessStore'
import { ModelConfigStore } from './modelConfigStore'
import { FileMemoryStore } from './fileMemoryStore'
import { InstructionStore } from './instructionStore'
import { RunLogStore } from './runLogStore'
import { SkillStore } from './skillStore'
import { AutomationStore } from './automationStore'
import { MiraPaths } from './miraPaths'
import { validateSnapshot } from '../src/config/platformValidation'
import { DEFAULT_ASSISTANT_TONE, type HarnessHistoryPage, type HarnessHistoryQuery, type HarnessUsageStats } from '../src/config/harness'
import type { MenuItem, MicroApp, PlatformSnapshot } from '../src/types'

const CURRENT_SCHEMA_VERSION = 24
const PROTECTED_MENU_ID_SET = new Set(PROTECTED_MAIN_MENU_IDS)
const REMOVED_BUILT_IN_MAIN_MENU_IDS = new Set(['dashboard', 'functional-components', 'system-management'])
const DEFAULT_PREFERENCES = { loadingStyle: 'cube-grid', showContextUsage: true, sendShortcut: 'mod-enter', assistantTone: DEFAULT_ASSISTANT_TONE }

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
    this.harness.removeEmptySessions()
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
      CREATE TABLE IF NOT EXISTS harness_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'FolderOpened', directory TEXT NOT NULL UNIQUE, default_model_provider_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_session_at INTEGER);
      CREATE TABLE IF NOT EXISTS harness_sessions (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, model_provider_id TEXT, model_id TEXT, permission_mode TEXT NOT NULL, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, archived_at INTEGER, path TEXT NOT NULL, working_directory TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
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
    if (!sessionColumns.some(column => column.name === 'archived_at')) {
      this.database.exec('ALTER TABLE harness_sessions ADD COLUMN archived_at INTEGER')
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
    }
    let workspaceSettings = this.novels.getSettings()
    if (workspaceSettings.modelSelection && !this.models.get(workspaceSettings.modelSelection.providerId)) {
      workspaceSettings = this.novels.saveSettings({ ...workspaceSettings, modelSelection: undefined })
    }
    if (!workspaceSettings.modelSelection) {
      const provider = this.models.list().find(item => item.enabled && item.hasApiKey && item.models.length)
      if (provider) this.novels.saveSettings({ ...workspaceSettings, modelSelection: { providerId: provider.id, modelId: provider.models[0] } })
    }
    const insertPreference = this.database.prepare('INSERT OR IGNORE INTO preferences(key, value) VALUES (?, ?)')
    Object.entries(DEFAULT_PREFERENCES).forEach(([key, value]) => insertPreference.run(key, JSON.stringify(value)))
    this.database.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('schemaVersion', ?)").run(String(CURRENT_SCHEMA_VERSION))
  }

  getSnapshot(): PlatformSnapshot {
    const mainMenus = this.database.prepare('SELECT payload FROM menus ORDER BY rowid').all().map((row: { payload: string }) => JSON.parse(row.payload)) as MenuItem[]
    const microApps = this.database.prepare('SELECT payload FROM micro_apps ORDER BY rowid').all().map((row: { payload: string }) => JSON.parse(row.payload)) as MicroApp[]
    const preferences = Object.fromEntries(this.database.prepare('SELECT key, value FROM preferences').all().map((row: { key: string; value: string }) => [row.key, JSON.parse(row.value)]))
    return { mainMenus, microApps, preferences }
  }

  private writeSnapshot(snapshot: PlatformSnapshot) {
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
    this.database.prepare('INSERT OR REPLACE INTO preferences(key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
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
