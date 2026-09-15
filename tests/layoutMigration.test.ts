import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatformDatabase } from '../electron/database'

const directories: string[] = []

afterEach(() => {
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
})

describe('layout preference cleanup', () => {
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

  it('removes legacy breadcrumb fields while preserving active layout fields', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-layout-migration-'))
    directories.push(directory)
    const database = new PlatformDatabase(directory)
    database.savePreference('layout', {
      sidebarStyle: 'floating',
      enableTabs: false,
      showBreadcrumb: true,
      breadcrumbIcon: true,
      breadcrumbStyle: 'card',
    })
    database.close()

    const reopened = new PlatformDatabase(directory)
    expect(reopened.getSnapshot().preferences.layout).toEqual({
      sidebarStyle: 'floating',
      enableTabs: false,
    })
    reopened.close()
  })
})
