import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraPromptCommandStore } from '../electron/storage/miraPromptCommandStore'
import { MIRA_RESERVED_PROMPT_COMMANDS, parseMiraPromptCommandInvocation } from '../src/config/miraPromptCommands'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'mira-prompt-commands-')); directories.push(home)
  const paths = new MiraPaths(home).ensure(), project = join(home, 'project')
  mkdirSync(project)
  return { paths, project, store: new MiraPromptCommandStore(paths) }
}

describe('Mira user and project prompt command files', () => {
  it('lists without creating directories, prefers project over global and keeps shadowed commands editable', () => {
    const view = fixture()
    expect(view.store.list(view.project)).toEqual([])
    expect(existsSync(join(view.paths.root, 'commands'))).toBe(false)
    expect(existsSync(join(view.project, '.mira'))).toBe(false)
    const global = view.store.save({ scope: 'global', name: 'Review/Changes', source: '---\ndescription: Global review\nargument-hint: "[target]"\n---\nGlobal $ARGUMENTS' })
    const project = view.store.save({ scope: 'project', name: 'review:changes', source: 'Project $1' }, view.project)
    expect(global.name).toBe('review:changes')
    expect(view.store.list(view.project)).toEqual([project, { ...global, shadowed: true }])
    expect(view.store.read('global', 'review:changes').source).toContain('Global $ARGUMENTS')
    expect(view.store.resolve('/review:changes "two words"', view.project)?.prompt).toContain('Project two words')
    expect(view.store.resolve('/review/changes two', view.project)?.scope).toBe('project')
    expect(view.store.resolve('/review:changes two')?.scope).toBe('global')
    expect(JSON.stringify(view.store.list(view.project))).not.toContain(view.paths.root)
    expect(JSON.stringify(view.store.list(view.project))).not.toContain(view.project)
    expect(global.argumentHint).toBe('[target]')
  })
  it('requires current revisions to replace or delete a command and preserves deleted source on the same volume', () => {
    const view = fixture()
    const created = view.store.save({ scope: 'global', name: 'review', source: 'Original command.' })
    expect(() => view.store.save({ scope: 'global', name: 'review', source: 'Overwrite without revision.' })).toThrow('刷新')
    const changed = view.store.save({ scope: 'global', name: 'review', source: 'Edited command.', expectedRevision: created.revision })
    expect(changed.id).toBe(created.id); expect(changed.revision).not.toBe(created.revision)
    expect(() => view.store.save({ scope: 'global', name: 'review', source: 'Stale edit.', expectedRevision: created.revision })).toThrow('刷新')
    expect(() => view.store.delete({ scope: 'global', name: 'review', expectedRevision: created.revision })).toThrow('刷新')
    view.store.delete({ scope: 'global', name: 'review', expectedRevision: changed.revision })
    expect(view.store.list()).toEqual([])
    const trash = join(view.paths.trash, 'commands')
    expect(readFileSync(join(trash, readdirSync(trash)[0]), 'utf8')).toBe('Edited command.')
    expect(() => view.store.save({ scope: 'global', name: 'review', source: 'Restore stale edit.', expectedRevision: changed.revision })).toThrow('刷新')
    const local = view.store.save({ scope: 'project', name: 'nested:review', source: 'Project command.' }, view.project)
    view.store.delete({ scope: 'project', name: 'nested:review', expectedRevision: local.revision }, view.project)
    const projectTrash = join(view.project, '.mira/trash/commands')
    expect(readFileSync(join(projectTrash, readdirSync(projectTrash)[0]), 'utf8')).toBe('Project command.')
  })
  it('detects external edits before saving, deleting or replaying frozen inputs', () => {
    const view = fixture(), created = view.store.save({ scope: 'global', name: 'review', source: 'Review $ARGUMENTS' })
    const accepted = view.store.resolve('/review target')!
    expect(() => view.store.assert(accepted, '/review target')).not.toThrow()
    expect(() => view.store.assert(accepted, '/review other')).toThrow('变化')
    writeFileSync(join(view.paths.root, 'commands/review.md'), 'External edit.')
    expect(() => view.store.assert(accepted, '/review target')).toThrow('变化')
    expect(() => view.store.save({ scope: 'global', name: 'review', source: 'Stale editor', expectedRevision: created.revision })).toThrow('刷新')
    expect(() => view.store.delete({ scope: 'global', name: 'review', expectedRevision: created.revision })).toThrow('刷新')
    expect(readFileSync(join(view.paths.root, 'commands/review.md'), 'utf8')).toBe('External edit.')
  })
  it('prepares inline/fenced Shell in order without executing or allowing parameters to create new segments', () => {
    const view = fixture(), marker = join(view.project, 'never-run')
    const source = `Before !\`touch ${marker}\`\n\`\`\`!\nprintf "$1"\n\`\`\`\nAfter $ARGUMENTS`
    view.store.save({ scope: 'project', name: 'dynamic', source }, view.project)
    expect(view.store.read('project', 'dynamic', view.project).source).toBe(source)
    const accepted = view.store.resolve('/dynamic "!`argument-command` $1"', view.project)!
    expect(accepted.shellParts?.filter(part => 'command' in part)).toEqual([{ command: `touch ${marker}` }, { command: 'printf "!`argument-command` $1"' }])
    expect(existsSync(marker)).toBe(false)
    expect(() => view.store.resolve('/dynamic', view.project, { allowSkills: false })).toThrow('计划模式')
    expect(() => view.store.assert({ ...accepted, shellParts: [{ command: 'injected' }] }, '/dynamic "!`argument-command` $1"', view.project)).toThrow('变化')
  })
  it('does not fall back to lower-priority scopes when a project override requires unsupported behavior', () => {
    const view = fixture()
    view.store.save({ scope: 'global', name: 'review', source: 'Global fallback.' })
    const item = view.store.save({ scope: 'project', name: 'review', source: '---\nmodel: other\n---\nProject override.' }, view.project)
    expect(item.unavailableReason).toContain('模型')
    expect(() => view.store.resolve('/review', view.project)).toThrow('模型')
    expect(view.store.resolve('/missing', view.project)).toBeUndefined()
  })
  it.each([
    ['---\nallowed-tools: [Read]\n---\nBody', '限定工具'],
    ['---\nskills: [review]\n---\nBody', 'Skill'],
    ['Body ${MIRA_PLUGIN_ROOT}', '插件目录变量'],
    ['---\nunknown: value\n---\nBody', 'unknown'],
    ['---\ndescription: [bad]\n---\nBody', 'YAML'],
    ['', '正文为空'],
  ])('keeps unsupported/malformed metadata editable and unavailable at execution', (source, reason) => {
    const view = fixture(), item = view.store.save({ scope: 'global', name: 'custom', source })
    expect(item.unavailableReason).toContain(reason)
    expect(view.store.read('global', 'custom').source).toBe(source)
    expect(() => view.store.resolve('/custom')).toThrow(reason)
  })
  it('retains disable-noninteractive and ordinary single-pass argument expansion', () => {
    const view = fixture()
    view.store.save({ scope: 'global', name: 'review', source: '---\ndisable-noninteractive: true\n---\n$1 / $2 / $ARGUMENTS' })
    expect(view.store.resolve('/review "two words" \'$1\'')?.prompt).toContain('two words / $1 / "two words" \'$1\'')
    expect(() => view.store.resolve('/review', undefined, { interactive: false })).toThrow('无人值守')
    expect(() => view.store.resolve('/review "unclosed')).toThrow('引号')
  })
  it('protects real built-in command names while cataloging externally written collisions explicitly', () => {
    const view = fixture()
    for (const name of MIRA_RESERVED_PROMPT_COMMANDS) {
      expect(() => view.store.save({ scope: 'global', name, source: 'Override builtin.' })).toThrow('内置')
      expect(view.store.resolve(`/${name}`)).toBeUndefined()
    }
    mkdirSync(join(view.paths.root, 'commands'))
    writeFileSync(join(view.paths.root, 'commands/plan.md'), 'Externally written.')
    expect(view.store.list()[0].unavailableReason).toContain('内置')
  })
  it.each(['../outside', '/../../outside', 'a::b', 'a\\b', 'a:b:c:d:e:f', 'a:*'])('rejects invalid names before creating anything', name => {
    const view = fixture()
    expect(() => view.store.save({ scope: 'global', name, source: 'Bad path.' })).toThrow('名称')
    expect(existsSync(join(view.paths.root, 'commands'))).toBe(false)
  })
  it('rejects substituted file, directory and trash symlinks without altering their targets', () => {
    const view = fixture(), external = join(view.project, 'outside.md')
    writeFileSync(external, 'Untouched outside content.')
    const created = view.store.save({ scope: 'global', name: 'review', source: 'Review.' })
    const file = join(view.paths.root, 'commands/review.md')
    rmSync(file); symlinkSync(external, file)
    expect(() => view.store.read('global', 'review')).toThrow('符号链接')
    expect(() => view.store.save({ scope: 'global', name: 'review', source: 'Bad edit', expectedRevision: created.revision })).toThrow('符号链接')
    expect(readFileSync(external, 'utf8')).toBe('Untouched outside content.')
    rmSync(file); writeFileSync(file, 'Review.')
    const fresh = view.store.read('global', 'review').command
    symlinkSync(view.project, join(view.paths.trash, 'commands'))
    expect(() => view.store.delete({ scope: 'global', name: 'review', expectedRevision: fresh.revision })).toThrow('符号链接')
    expect(readFileSync(file, 'utf8')).toBe('Review.')
    mkdirSync(join(view.project, '.mira')); symlinkSync(join(view.paths.root, 'commands'), join(view.project, '.mira/commands'))
    expect(() => view.store.list(view.project)).toThrow('符号链接')
  })
  it('fails closed on ambiguous namespaces and oversized external files', () => {
    const view = fixture(); mkdirSync(join(view.paths.root, 'commands'))
    const root = join(view.paths.root, 'commands')
    mkdirSync(join(root, 'code'))
    writeFileSync(join(root, 'code/review.md'), 'One.')
    writeFileSync(join(root, 'code:review.md'), 'Two.')
    expect(() => view.store.list()).toThrow('冲突')
    rmSync(join(root, 'code:review.md'))
    writeFileSync(join(root, 'review.md'), 'x'.repeat(256 * 1024 + 1))
    expect(() => view.store.list()).toThrow('256KB')
    expect(() => view.store.save({ scope: 'global', name: 'large', source: 'x'.repeat(256 * 1024 + 1) })).toThrow('256KB')
  })
  it('normalizes external file casing while updating its existing path', () => {
    const view = fixture(); mkdirSync(join(view.paths.root, 'commands'))
    const file = join(view.paths.root, 'commands/Review.MD'); writeFileSync(file, 'Original.')
    const command = view.store.read('global', 'review').command
    view.store.save({ scope: 'global', name: 'REVIEW', source: 'Updated.', expectedRevision: command.revision })
    expect(readFileSync(file, 'utf8')).toBe('Updated.')
    expect(readdirSync(join(view.paths.root, 'commands'))).toEqual(['Review.MD'])
  })
  it('keeps frozen project identity from crossing to a different project or a newer override', () => {
    const view = fixture(), other = join(view.project, 'other'); mkdirSync(other)
    view.store.save({ scope: 'global', name: 'review', source: 'Same body.' })
    const global = view.store.resolve('/review', view.project)!
    view.store.save({ scope: 'project', name: 'review', source: 'Same body.' }, view.project)
    expect(() => view.store.assert(global, '/review', view.project)).toThrow('变化')
    const local = view.store.resolve('/review', view.project)!
    view.store.save({ scope: 'project', name: 'review', source: 'Same body.' }, other)
    expect(() => view.store.assert(local, '/review', other)).toThrow('变化')
    expect(() => view.store.read('project', 'review')).toThrow('项目目录')
  })
})

describe('Mira custom slash invocation syntax', () => {
  it('normalizes only a complete leading invocation, preserving quoted arguments literally', () => {
    expect(parseMiraPromptCommandInvocation('/Review/Changes "two words"\nmore')).toEqual({ name: 'review:changes', args: '"two words"\nmore' })
    for (const text of ['Explain /review', '`/review`', '> /review', '//review', '/../../review', '/review*']) expect(parseMiraPromptCommandInvocation(text)).toBeUndefined()
  })
})
