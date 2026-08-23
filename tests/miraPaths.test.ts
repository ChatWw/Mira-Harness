import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { MiraPaths } from '../electron/miraPaths'

describe('MiraPaths', () => {
  it('derives the macOS hidden data directory from a home directory', () => {
    const paths = new MiraPaths('/Users/mira')
    expect(paths.root).toBe(join('/Users/mira', '.mira'))
    expect(paths.stateDatabase()).toBe(join('/Users/mira', '.mira', 'state.sqlite'))
    expect(paths.globalAgents()).toBe(join('/Users/mira', '.mira', 'AGENTS.md'))
    expect(paths.globalMemory()).toBe(join('/Users/mira', '.mira', 'memories', 'MEMORY.md'))
  })

  it('uses platform path joining for a Windows home directory', () => {
    const paths = new MiraPaths('C:\\Users\\Mira')
    expect(paths.root).toContain('.mira')
    expect(paths.sessions).toContain('sessions')
    expect(paths.globalAgents()).toContain('AGENTS.md')
    expect(paths.projectMemory('project-1')).toContain('project-1')
  })
})
