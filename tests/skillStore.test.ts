import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/miraPaths'
import { parseSkill, SkillStore } from '../electron/skillStore'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

describe('SkillStore', () => {
  it('parses frontmatter and rejects empty Skill files', () => {
    expect(parseSkill('/skill/SKILL.md', '---\nname: Review\ndescription: Finds risks\n---\nCheck real regressions.').valid).toBe(true)
    expect(parseSkill('/skill/SKILL.md', '').error).toContain('为空')
  })

  it('scans configured directories and resolves only enabled session selections', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-skills-')); directories.push(directory)
    const paths = new MiraPaths(directory).ensure(); const skillDirectory = join(directory, 'shared', 'review'); mkdirSync(skillDirectory, { recursive: true })
    writeFileSync(join(skillDirectory, 'SKILL.md'), '# Code review\n\nFind real regressions.', 'utf8')
    const store = new SkillStore(paths); store.saveSettings({ directories: [join(directory, 'shared')] })
    const skill = store.list()[0]
    expect(skill.enabled).toBe(false)
    store.setEnabled(skill.id, true)
    expect(store.resolve([skill.id]).map(item => item.name)).toEqual(['Code review'])
    expect(store.resolve([])).toEqual([])
  })
})
