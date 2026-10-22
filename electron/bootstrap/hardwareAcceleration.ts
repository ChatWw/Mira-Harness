import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'

/** Read before app.ready: Electron cannot disable hardware acceleration later. */
export function applyHardwareAcceleration(app: { disableHardwareAcceleration(): void }, statePath: string) {
  if (!existsSync(statePath)) return
  let database: Database.Database | undefined
  try {
    database = new Database(statePath, { readonly: true })
    const table = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'preferences'").get()
    if (!table) return
    const row = database.prepare('SELECT value FROM preferences WHERE key = ?').get('desktopChromiumHardwareAccelerationEnabled') as { value: string } | undefined
    if (row?.value === 'false') app.disableHardwareAcceleration()
  } catch {
    console.warn('[Mira] 无法读取硬件加速设置，使用默认配置')
  } finally {
    database?.close()
  }
}
