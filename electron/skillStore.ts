import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { HarnessSkill, HarnessSkillSettings } from '../src/config/harness'
import { MiraPaths } from './miraPaths'

type StoredSettings = HarnessSkillSettings & { enabledIds: string[] }
const MAX_SKILL_FILE_BYTES = 256 * 1024

function skillId(path: string) { return createHash('sha256').update(path).digest('hex').slice(0, 16) }

export function parseSkill(path: string, source: string, enabled = false): HarnessSkill {
  if (!source.trim()) return { id: skillId(path), name: '', description: '', instructions: '', path, enabled, valid: false, error: 'Skill 文件为空' }
  let body = source.trim()
  let name = ''; let description = ''
  const frontmatter = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(body)
  if (frontmatter) {
    body = body.slice(frontmatter[0].length).trim()
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const match = /^\s*([a-zA-Z][\w-]*)\s*:\s*(.+?)\s*$/.exec(line)
      if (!match) continue
      if (match[1] === 'name') name = match[2].replace(/^['"]|['"]$/g, '').trim()
      if (match[1] === 'description') description = match[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
  const heading = /^#\s+(.+)$/m.exec(body)
  if (!name && heading) name = heading[1].trim()
  if (heading) body = body.replace(heading[0], '').trim()
  if (!description) description = body.split(/\n\s*\n/).map(value => value.trim()).find(Boolean)?.replace(/\n/g, ' ').slice(0, 240) || ''
  if (!name || !description || !body) return { id: skillId(path), name, description, instructions: body, path, enabled, valid: false, error: 'Skill 需要名称、描述和指令内容' }
  return { id: skillId(path), name, description, instructions: body, path, enabled, valid: true }
}

export class SkillStore {
  constructor(private readonly paths: MiraPaths) {}

  private readSettings(): StoredSettings {
    try {
      const value = JSON.parse(readFileSync(this.paths.skillSettings(), 'utf8')) as Partial<StoredSettings>
      const directories = Array.isArray(value.directories) ? value.directories.filter((item): item is string => typeof item === 'string' && isAbsolute(item)).map(item => resolve(item)) : [this.paths.skills]
      return { directories: directories.length ? [...new Set(directories)] : [this.paths.skills], enabledIds: Array.isArray(value.enabledIds) ? value.enabledIds.filter((item): item is string => typeof item === 'string') : [] }
    } catch { return { directories: [this.paths.skills], enabledIds: [] } }
  }

  private write(settings: StoredSettings) {
    this.paths.ensure()
    const file = this.paths.skillSettings(); const temporary = `${file}.${randomUUID()}.tmp`
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8'); renameSync(temporary, file)
  }

  settings(): HarnessSkillSettings { return { directories: this.readSettings().directories } }
  saveSettings(input: HarnessSkillSettings) {
    const directories = [...new Set((input.directories || []).filter((item): item is string => typeof item === 'string' && isAbsolute(item)).map(item => resolve(item)))]
    if (!directories.length) throw new Error('至少保留一个 Skill 目录')
    const current = this.readSettings(); this.write({ directories, enabledIds: current.enabledIds }); return { directories }
  }

  list(): HarnessSkill[] {
    const settings = this.readSettings(); const enabled = new Set(settings.enabledIds); const files: string[] = []
    const visit = (directory: string, depth = 0) => {
      if (depth > 4 || !existsSync(directory)) return
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) visit(path, depth + 1)
        else if (entry.isFile() && entry.name === 'SKILL.md') files.push(path)
      }
    }
    settings.directories.forEach(directory => visit(directory))
    return files.sort().map(path => {
      try {
        const source = readFileSync(path, 'utf8')
        if (Buffer.byteLength(source) > MAX_SKILL_FILE_BYTES) return { id: skillId(path), name: '', description: '', instructions: '', path, enabled: false, valid: false, error: 'Skill 文件超过 256KB' }
        return parseSkill(path, source, enabled.has(skillId(path)))
      } catch { return { id: skillId(path), name: '', description: '', instructions: '', path, enabled: false, valid: false, error: '无法读取 Skill 文件' } }
    })
  }

  setEnabled(id: string, enabled: boolean) {
    const skills = this.list(); const skill = skills.find(item => item.id === id)
    if (!skill?.valid) throw new Error('Skill 不存在或格式无效')
    const settings = this.readSettings(); const ids = new Set(settings.enabledIds)
    if (enabled) ids.add(id); else ids.delete(id)
    this.write({ ...settings, enabledIds: [...ids] }); return this.list()
  }

  resolve(ids: string[]) {
    const selected = new Set(ids)
    return this.list().filter(skill => skill.valid && skill.enabled && selected.has(skill.id))
  }
}
