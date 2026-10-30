import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MODEL_PROVIDER_BUILTIN_INSTANCES } from '../src/config/harness'

const directories: string[] = []

afterEach(() => {
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
})

describe('first-release platform initialization', () => {
  it('defaults new installations to sending with Enter while preserving an explicit shortcut preference', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-send-shortcut-default-'))
    directories.push(directory)
    const database = new PlatformDatabase(directory)
    expect(database.getSnapshot().preferences.sendShortcut).toBe('enter')

    database.savePreference('sendShortcut', 'mod-enter')
    database.close()

    const reopened = new PlatformDatabase(directory)
    expect(reopened.getSnapshot().preferences.sendShortcut).toBe('mod-enter')
    reopened.close()
  })

  it('creates current tables and defaults directly and reopens configured sessions without migration artifacts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-first-install-'))
    directories.push(directory)
    let database = new PlatformDatabase(directory)
    const paths = new MiraPaths(directory)
    try {
      expect(database.getSnapshot().mainMenus.map(menu => menu.id)).toEqual(['ai-novel'])
      expect(database.getSnapshot().microApps.map(app => app.code)).toEqual(['mira-harness'])
      database.models.ensureBuiltinInstances()
      const preset = MODEL_PROVIDER_BUILTIN_INSTANCES[0]
      const configured = database.models.save({ ...database.models.get(preset.id)!, apiKey: 'isolated-test-key', models: [{ id: 'fixture', enabled: true, reasoning: false, contextWindow: 64000 }], enabled: true })
      const session = database.harness.createSession()
      database.harness.addMessage(session.id, 'user', '首次发行持久化验证')
      database.harness.addMessage(session.id, 'assistant', '保存当前会话')
      const saved = database.harness.getSession(session.id)
      const tables = database.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
      expect(tables.map(table => table.name)).not.toContain('model_providers')
      expect(tables.map(table => table.name)).not.toContain('model_role_bindings')
      expect(database.database.prepare("SELECT value FROM meta WHERE key = 'schemaVersion'").get()).toBeUndefined()
      database.close()
      database = new PlatformDatabase(directory)
      database.models.ensureBuiltinInstances()
      expect(database.models.list()).toHaveLength(MODEL_PROVIDER_BUILTIN_INSTANCES.length)
      expect(database.models.get(preset.id)).toEqual(configured)
      expect(database.models.getSecret(preset.id)).toBe('isolated-test-key')
      expect(database.harness.getSession(session.id)).toEqual(saved)
      expect(JSON.parse(readFileSync(paths.session(session.id), 'utf8'))).toEqual(saved)
      expect(existsSync(`${paths.modelsConfig()}.v1.bak`)).toBe(false)
      expect(existsSync(`${paths.session(session.id)}.legacy.bak`)).toBe(false)
    } finally { database.close() }
  })

})
