import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/storage/miraPaths'
import { parseSkill, SkillStore } from '../electron/storage/skillStore'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

describe('SkillStore', () => {
  it('parses frontmatter and rejects empty Skill files', () => {
    expect(parseSkill('/skill/SKILL.md', '---\nname: Review\ndescription: Finds risks\n---\nCheck real regressions.').valid).toBe(true)
    expect(parseSkill('/skill/SKILL.md', '').error).toContain('为空')
  })

  it.each(['>', '>-', '|', '|-'])('reads real multiline Skill descriptions using %s frontmatter', marker => {
    const parsed = parseSkill('/skill/SKILL.md', `---\nname: discernment-nudge\ndescription: ${marker}\n  Append follow-up questions\n  to help check key facts.\nmetadata:\n  name: nested-metadata\n---\n# Questions\n\nRead the answer and ask useful questions.`)
    expect(parsed.valid).toBe(true)
    expect(parsed.name).toBe('discernment-nudge')
    expect(parsed.description.replace(/\s+/g, ' ').trim()).toBe('Append follow-up questions to help check key facts.')
    expect(parsed.instructions).toBe('Read the answer and ask useful questions.')
  })

  it('rejects invalid YAML without throwing or exposing its source', () => {
    const parsed = parseSkill('/skill/SKILL.md', '---\nname: review\ndescription: [unfinished private-secret\n---\n# Review\n\nRead source.')
    expect(parsed.valid).toBe(false)
    expect(parsed.error).not.toContain('private-secret')
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

  it('activates exact prompt references without persisting them or reading arbitrary destinations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-skills-')); directories.push(directory)
    const paths = new MiraPaths(directory).ensure()
    const first = join(paths.skills, 'one'), second = join(paths.skills, 'two')
    mkdirSync(first, { recursive: true }); mkdirSync(second, { recursive: true })
    writeFileSync(join(first, 'SKILL.md'), '# Review\n\nFirst review instructions.')
    writeFileSync(join(second, 'SKILL.md'), '# Review\n\nSecond review instructions.')
    const store = new SkillStore(paths)
    const [one, two] = store.list(); store.setEnabled(one.id, true); store.setEnabled(two.id, true)
    const reference = `[$Review](mira-skill:${two.id})`
    expect(store.resolvePrompt([], reference).map(skill => skill.id)).toEqual([two.id])
    expect(store.resolvePrompt([one.id], `${reference} ${reference}`).map(skill => skill.id)).toEqual([one.id, two.id])
    expect(store.resolvePrompt([], `\`${reference}\`\n\n> ${reference}\n\n\`\`\`text\n${reference}\n\`\`\``)).toEqual([])
    expect(store.resolvePrompt([], '[$Review](/tmp/unregistered/SKILL.md)')).toEqual([])
    expect(store.resolve([])).toEqual([])
    store.setEnabled(two.id, false)
    expect(() => store.resolvePrompt([], reference)).toThrow('引用的技能已停用或不可用')
    expect(store.resolvePrompt([], 'Next normal message')).toEqual([])
  })
})
