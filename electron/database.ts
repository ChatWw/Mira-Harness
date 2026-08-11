import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import {
  DASHBOARD_MENU,
  mainMenus as defaultsMenus,
  PROTECTED_MAIN_MENU_IDS,
} from '../src/config/menus'
import { microApps as defaultMicroApps } from '../src/config/microApps'
import { validateSnapshot } from '../src/config/platformValidation'
import type { MenuItem, MicroApp, PlatformSnapshot } from '../src/types'

const CURRENT_SCHEMA_VERSION = 15
const PROTECTED_MENU_ID_SET = new Set(PROTECTED_MAIN_MENU_IDS)
const REMOVED_BUILT_IN_MAIN_MENU_IDS = new Set(['functional-components', 'system-management'])
const DEFAULT_PREFERENCES = { loadingStyle: 'cube-grid' }

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function removeProtectedMenus(menus: MenuItem[]): MenuItem[] {
  return menus
    .filter(menu => !PROTECTED_MENU_ID_SET.has(menu.id) && !REMOVED_BUILT_IN_MAIN_MENU_IDS.has(menu.id))
    .map(menu => ({ ...menu, children: menu.children ? removeProtectedMenus(menu.children) : undefined }))
}

export function normalizeProtectedMainMenus(menus: MenuItem[]): MenuItem[] {
  return [clone(DASHBOARD_MENU), ...removeProtectedMenus(clone(menus))]
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

function assertProtectedMenus(menus: MenuItem[]) {
  const dashboard = menus.find(menu => menu.id === DASHBOARD_MENU.id)
  if (stableSerialize(dashboard) !== stableSerialize(DASHBOARD_MENU)) {
    throw new Error('概览为内置菜单，不能修改或删除')
  }
}

export class PlatformDatabase {
  private readonly database: Database.Database
  private readonly filePath: string

  constructor(userDataPath: string) {
    mkdirSync(userDataPath, { recursive: true })
    this.filePath = join(userDataPath, 'mira.sqlite')
    this.database = new Database(this.filePath)
    this.database.pragma('journal_mode = WAL')
    this.migrate()
  }

  private migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS menus (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS micro_apps (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
    const seeded = Boolean(this.database.prepare('SELECT 1 FROM meta WHERE key = ?').get('seeded'))
    if (!seeded) {
      this.writeSnapshot({ mainMenus: clone(defaultsMenus), microApps: clone(defaultMicroApps), preferences: clone(DEFAULT_PREFERENCES) })
      this.database.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('seeded', '1')
    } else {
      const versionRow = this.database.prepare('SELECT value FROM meta WHERE key = ?').get('schemaVersion') as { value?: string } | undefined
      const version = Number(versionRow?.value || 1)
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
    }
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
