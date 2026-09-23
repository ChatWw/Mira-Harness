import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { MiraPaths } from './miraPaths'

const MARKER_FILE = 'storage-v2-migrated.json'

function copyIfMissing(source: string, target: string) {
  if (!existsSync(source) || existsSync(target)) return false
  mkdirSync(join(target, '..'), { recursive: true })
  cpSync(source, target, { recursive: true, preserveTimestamps: true })
  return existsSync(target)
}

/** Moves the old Electron user-data files into the stable ~/.mira layout before stores open them. */
export function prepareMiraDataMigration(paths: MiraPaths, legacyUserDataPath: string) {
  paths.ensure()
  const marker = join(paths.root, MARKER_FILE)
  if (existsSync(marker) || legacyUserDataPath === paths.root) return false

  const copied = [
    ['mira.sqlite', basename(paths.stateDatabase())],
    ['mira.sqlite-wal', `${basename(paths.stateDatabase())}-wal`],
    ['mira.sqlite-shm', `${basename(paths.stateDatabase())}-shm`],
    ['models.json', join('config', 'models.json')],
    ['mcp-servers.json', join('config', 'mcp-servers.json')],
  ].some(([from, to]) => copyIfMissing(join(legacyUserDataPath, from), join(paths.root, to)))

  // The database may still reference this directory; HarnessStore resolves those records after opening it.
  copyIfMissing(join(legacyUserDataPath, '.mira', 'sessions'), paths.sessions)

  return copied
}

export function completeMiraDataMigration(paths: MiraPaths, legacyUserDataPath: string) {
  writeFileSync(join(paths.root, MARKER_FILE), JSON.stringify({ version: 2, legacyUserDataPath, completedAt: Date.now() }, null, 2), 'utf8')
}

export function removeLegacyUserDataFiles(legacyUserDataPath: string) {
  for (const name of ['mira.sqlite', 'mira.sqlite-wal', 'mira.sqlite-shm', 'models.json', 'mcp-servers.json', '.mira']) {
    const target = join(legacyUserDataPath, name)
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  }
}

export function atomicMove(source: string, target: string) {
  if (!existsSync(source)) return false
  mkdirSync(join(target, '..'), { recursive: true })
  try { renameSync(source, target) } catch { cpSync(source, target, { recursive: true, preserveTimestamps: true }); rmSync(source, { recursive: true, force: true }) }
  return existsSync(target)
}
