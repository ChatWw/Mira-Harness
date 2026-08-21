import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { InstructionStore } from '../electron/instructionStore'
import { MiraPaths } from '../electron/miraPaths'

describe('InstructionStore', () => {
  it('loads global, parent, and more specific override instructions in order', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-instruction-store-'))
    const project = join(root, 'project')
    const nested = join(project, 'src')
    mkdirSync(nested, { recursive: true })
    const paths = new MiraPaths(root).ensure()
    writeFileSync(paths.globalAgents(), 'global', 'utf8')
    writeFileSync(join(project, 'AGENTS.md'), 'project', 'utf8')
    writeFileSync(join(project, 'AGENTS.override.md'), 'override', 'utf8')
    writeFileSync(join(nested, 'AGENTS.md'), 'nested', 'utf8')
    const store = new InstructionStore(paths)

    expect(store.resolve(nested).map(item => item.content)).toEqual(['global', 'project', 'override', 'nested'])
    expect(store.resolve(nested).map(item => item.path)).toContain(join(nested, 'AGENTS.md'))
    rmSync(root, { recursive: true, force: true })
  })

  it('keeps the global file after saving empty content atomically', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-instruction-empty-'))
    const paths = new MiraPaths(root).ensure()
    const store = new InstructionStore(paths)
    store.saveGlobal('')
    expect(readFileSync(paths.globalAgents(), 'utf8')).toBe('')
    rmSync(root, { recursive: true, force: true })
  })
})
