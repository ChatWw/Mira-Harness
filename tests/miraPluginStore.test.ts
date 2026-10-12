import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MiraPluginStore, miraPluginPromptIds } from '../electron/storage/miraPluginStore'
import { prepareMiraPluginCommand } from '../electron/storage/miraPluginCommands'
import { parseMiraPluginAgent } from '../electron/storage/miraPluginAgents'
import { miraPluginItems } from '../src/config/miraPlugins'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
import { miraPluginReference, restoreMiraPluginReferences } from '../apps/harness-react/src/lib/mira-plugin-reference'
import { serializeMiraPromptDocument, validateMiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
function fixture(manifest: Record<string, unknown> = {}, flavor = '.claude-plugin') {
  const home = mkdtempSync(join(tmpdir(), 'mira-plugins-')); directories.push(home)
  const paths = new MiraPaths(home).ensure(), root = join(home, 'package')
  mkdirSync(join(root, flavor), { recursive: true }); mkdirSync(join(root, 'skills/review'), { recursive: true })
  writeFileSync(join(root, flavor, 'plugin.json'), JSON.stringify({ name: 'review-kit', description: 'Review code', version: '1.0', ...manifest }))
  const file = join(root, 'skills/review/SKILL.md')
  writeFileSync(file, '---\nname: review\ndescription: Finds regressions\n---\nReview actual changed behavior.')
  return { home, paths, root, file, store: new MiraPluginStore(paths) }
}

describe('plugin Agent parent MCP declarations', () => {
  it('publishes named requirements and preserves them in the frozen execution capability', () => {
    const view = fixture(); mkdirSync(join(view.root, 'agents'))
    const file = join(view.root, 'agents/auditor.md')
    writeFileSync(file, '---\nname: auditor\ndescription: Review\nmcpServers: ["plugin:Probe:Echo", Search]\n---\nPrivate review instructions.')
    view.store.register(view.root)
    const snapshots = view.store.snapshots()
    expect(snapshots[0].agents?.[0]).toMatchObject({ name: 'review-kit:auditor', mcpServers: ['plugin:Probe:Echo', 'Search'] })
    const accepted = view.store.resolveAgent(snapshots, 'review-kit:auditor')
    expect(accepted.mcpServers).toEqual(['plugin:Probe:Echo', 'Search'])
    expect(() => view.store.assertAgent(snapshots, accepted)).not.toThrow()
    expect(() => view.store.assertAgent(snapshots, { ...accepted, mcpServers: ['Search'] })).toThrow('变化')
    writeFileSync(file, '---\nname: auditor\ndescription: Review\nmcpServers: []\n---\nPrivate review instructions.')
    expect(() => view.store.assertAgent(snapshots, accepted)).toThrow('变化')
  })
})

describe('Mira real local plugin packages', () => {
  it('discovers namespaced plugin agents and resolves instructions without leaking host paths or body', () => {
    const view = fixture({ agents: ['profiles'] })
    rmSync(join(view.root, 'skills'), { recursive: true })
    mkdirSync(join(view.root, 'profiles/nested'), { recursive: true })
    writeFileSync(join(view.root, 'profiles/nested/review.md'), '---\nname: Audit:Review\ndescription: >-\n  Audit actual\n  behavior\ntools: [Read, Glob, Bash]\ndisallowedTools: Bash\n---\nMIRA_AGENT_BODY: inspect the task.')
    const listed = view.store.register(view.root)
    expect(listed[0]).toMatchObject({ agents: [{ name: 'review-kit:Audit:Review', description: 'Audit actual behavior', tools: ['read', 'list_files', 'bash'], disallowedTools: ['bash'] }], unsupported: [] })
    const frozen = view.store.snapshots(), catalog = view.store.catalog(frozen)
    expect(JSON.stringify(catalog)).not.toContain(view.root)
    expect(JSON.stringify(catalog)).not.toContain('MIRA_AGENT_BODY')
    const accepted = view.store.resolveAgent(frozen, 'review-kit:audit:review')
    expect(accepted).toMatchObject({ pluginId: 'review-kit@local', name: 'review-kit:Audit:Review', sourceRoot: frozen[0].root, body: 'MIRA_AGENT_BODY: inspect the task.', tools: ['read', 'list_files', 'bash'], disallowedTools: ['bash'] })
    expect(() => view.store.assertAgent(frozen, accepted)).not.toThrow()
    expect(() => view.store.resolveAgent(frozen, 'Audit:Review')).toThrow('不属于当前会话')
  })
  it('keeps unsupported agent behavior explicit and leaves other agents in the same package usable', () => {
    const view = fixture(); mkdirSync(join(view.root, 'agents'))
    writeFileSync(join(view.root, 'agents/unsafe.md'), '---\nname: unsafe\ndescription: Custom behavior\nmodel: another\nallowed-tools: [Read]\npermissionMode: auto\nskills: [review]\nmcpServers: [search]\n---\nDo not silently execute defaults.')
    writeFileSync(join(view.root, 'agents/review.md'), '---\nname: review\ndescription: Review changes\n---\nInspect actual behavior.')
    view.store.register(view.root); const frozen = view.store.snapshots()
    const unsafe = view.store.catalog(frozen)[0].agents?.find(agent => agent.name.endsWith(':unsafe'))
    for (const field of ['model', 'allowed-tools', 'permissionMode', 'skills']) expect(unsafe?.unavailableReason).toContain(field)
    expect(unsafe?.mcpServers).toEqual(['search'])
    expect(() => view.store.resolveAgent(frozen, 'review-kit:unsafe')).toThrow('尚未支持')
    expect(view.store.resolveAgent(frozen, 'review-kit:review').tools).toBeUndefined()
  })
  it('freezes agent identity and rechecks enabled, source root, profile body and tool limits', () => {
    const view = fixture(); mkdirSync(join(view.root, 'agents'))
    const path = join(view.root, 'agents/review.md')
    const profile = (body: string, tools = 'Read') => `---\nname: review\ndescription: Review changes\ntools: [${tools}]\n---\n${body}`
    writeFileSync(path, profile('Original instructions'))
    view.store.register(view.root); const frozen = view.store.snapshots(), accepted = view.store.resolveAgent(frozen, 'review-kit:review')
    expect(() => view.store.assertAgent(frozen, { ...accepted, sourceRoot: '/other/root' })).toThrow('变化')
    writeFileSync(path, profile('Changed instructions'))
    expect(() => view.store.assertAgent(frozen, accepted)).toThrow('变化')
    writeFileSync(path, profile('Original instructions', 'Read, Bash'))
    expect(() => view.store.assertAgent(frozen, accepted)).toThrow('变化')
    writeFileSync(join(view.root, 'agents/later.md'), '---\nname: later\ndescription: Added later\n---\nNew agent.')
    expect(() => view.store.resolveAgent(frozen, 'review-kit:later')).toThrow('不属于当前会话')
    view.store.setEnabled('review-kit@local', false)
    expect(() => view.store.resolveAgent(frozen, 'review-kit:review')).toThrow('已停用')
    view.store.setEnabled('review-kit@local', true)
    expect(() => view.store.resolveAgent([{ ...frozen[0], root: '/replacement/root' }], 'review-kit:review')).toThrow('已停用')
    expect(() => view.store.resolveAgent([...frozen, { ...frozen[0], id: 'review-kit@other' }], 'review-kit:review')).toThrow('冲突')
    expect(view.store.resolveAgent([{ ...frozen[0], id: 'review-kit@other', enabled: false }, ...frozen], 'review-kit:review').pluginId).toBe('review-kit@local')
    writeFileSync(path, '---\nname: renamed\ndescription: Replaced identity\n---\nAnother agent.')
    expect(view.store.catalog(frozen)[0].agents?.find(agent => agent.name.endsWith(':review'))?.unavailableReason).toContain('已移除')
    expect(() => view.store.resolveAgent(frozen, 'review-kit:review')).toThrow('已移除')
  })
  it('rejects ambiguous names, escapes, symlinks and oversized agent files', () => {
    const duplicate = fixture(); mkdirSync(join(duplicate.root, 'agents'))
    writeFileSync(join(duplicate.root, 'agents/a.md'), '---\nname: Review\ndescription: Review\n---\nFirst profile.')
    writeFileSync(join(duplicate.root, 'agents/b.md'), '---\nname: review\ndescription: Review\n---\nSecond profile.')
    expect(() => duplicate.store.register(duplicate.root)).toThrow('重复')
    const outside = fixture({ agents: '../outside.md' })
    expect(() => outside.store.register(outside.root)).toThrow('超出')
    const linked = fixture(); mkdirSync(join(linked.root, 'agents'))
    symlinkSync(duplicate.file, join(linked.root, 'agents/review.md'))
    expect(() => linked.store.register(linked.root)).toThrow('符号链接')
    const bounded = fixture(); mkdirSync(join(bounded.root, 'agents'))
    writeFileSync(join(bounded.root, 'agents/review.md'), 'a'.repeat(256 * 1024 + 1))
    expect(() => bounded.store.register(bounded.root)).toThrow('256KB')
  })
  it('rejects a substituted agent symlink after freezing and never runs a cataloged instruction', () => {
    const view = fixture(); mkdirSync(join(view.root, 'agents'))
    const path = join(view.root, 'agents/review.md'), marker = join(view.root, 'not-executed')
    writeFileSync(path, `---\nname: review\ndescription: Review\n---\n!\`touch ${marker}\``)
    view.store.register(view.root); const frozen = view.store.snapshots()
    expect(view.store.resolveAgent(frozen, 'review-kit:review').body).toContain('touch')
    expect(() => readFileSync(marker)).toThrow()
    rmSync(path); symlinkSync(view.file, path)
    expect(() => view.store.resolveAgent(frozen, 'review-kit:review')).toThrow('已停用')
  })
  it('requires declared plugin skills, keeps planning restrictions explicit and does not expose command paths', () => {
    const view = fixture(); mkdirSync(join(view.root, 'commands'))
    writeFileSync(join(view.root, 'commands/check.md'), '---\nskills: [review]\n---\nCheck $ARGUMENTS with the declared skill.')
    view.store.register(view.root); const frozen = view.store.snapshots()
    expect(view.store.resolveCommand(frozen, '/review-kit:check target')?.prompt).toContain('Required skills: review-kit:review')
    expect(() => view.store.resolveCommand(frozen, '/review-kit:check', true, false)).toThrow('计划模式')
    expect(JSON.stringify(view.store.catalog(frozen))).not.toContain(view.root)
    writeFileSync(join(view.root, 'commands/check.md'), '---\nskills: [missing]\n---\nCheck target.')
    expect(() => view.store.resolveCommand(frozen, '/review-kit:check')).toThrow('需要的 Skill')
  })
  it('registers command-only packages, discovers namespaced Markdown and expands quoted arguments without recursive substitution', () => {
    const view = fixture({ commands: ['prompt-commands'] })
    rmSync(join(view.root, 'skills'), { recursive: true })
    mkdirSync(join(view.root, 'prompt-commands/check'), { recursive: true })
    writeFileSync(join(view.root, 'prompt-commands/check/review.md'), '---\ndescription: >-\n  Review actual\n  behavior\nargument-hint: "[target] [scope]"\n---\nTarget=$1; scope=$2; all=$ARGUMENTS; missing=$3')
    expect(view.store.register(view.root)[0]).toMatchObject({ commands: [{ name: 'check:review', description: 'Review actual behavior', argumentHint: '[target] [scope]' }], skills: [], unsupported: [] })
    const frozen = view.store.snapshots()
    expect(view.store.resolveCommand(frozen, '/review-kit:check:review "two words" \'$1\'')?.prompt).toContain('Target=two words; scope=$1; all="two words" \'$1\'; missing=')
    expect(view.store.resolveCommand(frozen, 'Explain /review-kit:check:review')).toBeUndefined()
    expect(view.store.resolveCommand(frozen, '`/review-kit:check:review`')).toBeUndefined()
    expect(view.store.resolveCommand(frozen, '> /review-kit:check:review')).toBeUndefined()
  })
  it('appends arguments when no placeholder exists, exposes unsupported semantics and rechecks enabled same-root commands', () => {
    const view = fixture(); mkdirSync(join(view.root, 'commands'))
    writeFileSync(join(view.root, 'commands/check.md'), 'Review actual behavior.')
    writeFileSync(join(view.root, 'commands/dynamic.md'), 'Inspect !`pwd`.')
    writeFileSync(join(view.root, 'commands/model.md'), '---\nmodel: other-model\n---\nUse another model.')
    view.store.register(view.root); const frozen = view.store.snapshots()
    expect(view.store.resolveCommand(frozen, '/review-kit:check target')?.prompt).toContain('User arguments:\ntarget')
    expect(view.store.list()[0].commands).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'dynamic' }), expect.objectContaining({ name: 'model', unavailableReason: expect.stringContaining('模型') })]))
    expect(view.store.resolveCommand(frozen, '/review-kit:dynamic')?.shellParts).toEqual([{ text: expect.stringContaining('Inspect ') }, { command: 'pwd' }, { text: '.' }])
    expect(() => view.store.resolveCommand(frozen, '/review-kit:dynamic', true, false)).toThrow('计划模式')
    view.store.setEnabled('review-kit@local', false)
    expect(() => view.store.resolveCommand(frozen, '/review-kit:check')).toThrow('已停用')
    view.store.setEnabled('review-kit@local', true)
    const accepted = view.store.resolveCommand(frozen, '/review-kit:check target')!
    writeFileSync(join(view.root, 'commands/check.md'), 'Changed command body.')
    expect(() => view.store.assertCommand(frozen, '/review-kit:check target', accepted)).toThrow('变化')
    writeFileSync(join(view.root, 'commands/later.md'), 'Not in frozen catalog.')
    expect(() => view.store.resolveCommand(frozen, '/review-kit:later')).toThrow('不属于当前会话')
  })

  it('prepares inline and fenced shell segments in original order without executing or recursively expanding arguments', () => {
    const args = '\'!`argument-command` $1 $ARGUMENTS ${MIRA_PLUGIN_ROOT}\''
    const prepared = prepareMiraPluginCommand('review-kit:check', 'Before $1\n!`echo $1`\n```!\nprintf "$ARGUMENTS"\necho !`inside-fence`\n```\nAfter ${MIRA_PLUGIN_ROOT}', args, '/frozen/root', ['review-kit:review'])
    expect(prepared.shellParts).toEqual([
      { text: expect.stringContaining('Before !`argument-command` $1 $ARGUMENTS ${MIRA_PLUGIN_ROOT}\n') },
      { command: 'echo !`argument-command` $1 $ARGUMENTS ${MIRA_PLUGIN_ROOT}' },
      { text: '\n' },
      { command: `printf "${args}"\necho !\`inside-fence\`` },
      { text: '\nAfter /frozen/root' },
    ])
    expect(prepared.shellParts?.filter(part => 'command' in part)).toHaveLength(2)
    expect(prepared.prompt).toContain('Required skills: review-kit:review')
    expect(prepared.prompt).toContain('!`echo !`argument-command` $1 $ARGUMENTS ${MIRA_PLUGIN_ROOT}`')
    expect(prepared.prompt).toContain('```!')
  })

  it('keeps empty and multiline shell syntax, appends literal arguments and leaves static argument syntax inert', () => {
    const prepared = prepareMiraPluginCommand('review-kit:empty', 'A!`  `B```!\r\n\r\n```C!`printf first\nprintf second`D', '!`argument-command` $1', '/root', [])
    expect(prepared.shellParts).toEqual([
      { text: expect.stringContaining('A') }, { command: '' }, { text: 'B' }, { command: '' },
      { text: 'C' }, { command: 'printf first\nprintf second' }, { text: 'D\n\nUser arguments:\n!`argument-command` $1' },
    ])
    const staticInput = prepareMiraPluginCommand('review-kit:static', 'Body $ARGUMENTS ${MIRA_PLUGIN_ROOT}', '!`argument-command` $1', '/root', [])
    expect(staticInput.prompt).toContain('Body !`argument-command` $1 /root')
    expect(staticInput.shellParts).toBeUndefined()
  })

  it('catalogs dynamic commands without shell side effects and validates both frozen syntax and input identity', () => {
    const view = fixture(); mkdirSync(join(view.root, 'commands'))
    const commandPath = join(view.root, 'commands/dynamic.md'), marker = join(view.root, 'should-not-exist')
    writeFileSync(commandPath, `Inspect !\`touch "${marker}"\` then !\`printf '$1'\`.`)
    view.store.register(view.root); const frozen = view.store.snapshots()
    expect(view.store.catalog(frozen)[0].commands?.find(command => command.name === 'dynamic')?.unavailableReason).toBeUndefined()
    const accepted = view.store.resolveCommand(frozen, '/review-kit:dynamic literal')!
    expect(accepted.shellParts?.filter(part => 'command' in part)).toHaveLength(2)
    expect(() => readFileSync(marker)).toThrow()
    expect(() => view.store.assertCommand(frozen, '/review-kit:dynamic literal', accepted)).not.toThrow()
    expect(() => view.store.assertCommand(frozen, '/review-kit:dynamic literal', { ...accepted, shellParts: [{ command: 'changed' }] })).toThrow('变化')
    writeFileSync(commandPath, 'Inspect !`printf changed`.')
    expect(() => view.store.assertCommand(frozen, '/review-kit:dynamic literal', accepted)).toThrow('变化')
    writeFileSync(commandPath, '---\nallowed-tools: [Read]\n---\nInspect !`pwd`.')
    expect(() => view.store.resolveCommand(frozen, '/review-kit:dynamic')).toThrow('限定工具')
  })

  it.each(['.mira-plugin', '.zcode-plugin', '.claude-plugin', '.codex-plugin'])('reads %s manifests and preserves stable namespaced identity', flavor => {
    const { store, root, paths } = fixture({}, flavor)
    expect(store.register(root)).toMatchObject([{ id: 'review-kit@local', enabled: true, skills: [{ name: 'review' }], conflicts: [] }])
    const frozen = store.snapshots()
    expect(new MiraPluginStore(paths).list()).toEqual(store.list())
    expect(store.liveSkills(frozen)).toMatchObject([{ name: 'review-kit:review', pluginId: 'review-kit@local' }])
    expect(store.readSkill(frozen, 'review-kit:review')).toContain('actual changed behavior')
    expect(store.reminder(frozen, ['review-kit@local'])).toContain('review-kit:review')
    expect(store.reminder(frozen, ['review-kit@local'])).not.toContain(root)
    expect(store.reminder(frozen, ['review-kit@local'])).not.toContain('actual changed behavior')
  })
  it('keeps quoted/code/invalid reference text inert and ignores display label identity', () => {
    const link = '[@different-name](plugin://review-kit@local)'
    expect(miraPluginPromptIds(`${link} ${link}`)).toEqual(['review-kit@local'])
    expect(miraPluginPromptIds(`\`${link}\`\n\n> ${link}\n\n\`\`\`\n${link}\n\`\`\``)).toEqual([])
    expect(miraPluginPromptIds('[@label](Plugin://review-kit@local) [@label](plugin://review-kit@local?x=1) [@label](plugin://review-kit%40local)')).toEqual([])
  })
  it('reads bundled Skill resources while rejecting arbitrary paths and symlinks', () => {
    const { store, root } = fixture(); store.register(root)
    const frozen = store.snapshots(), references = join(root, 'skills/review/references')
    mkdirSync(references); writeFileSync(join(references, 'guide.md'), 'Review reference guide')
    expect(store.readSkill(frozen, 'review-kit:review', 'references/guide.md')).toBe('Review reference guide')
    expect(() => store.readSkill(frozen, 'review-kit:review', '../../.claude-plugin/plugin.json')).toThrow('超出')
    expect(() => store.readSkill(frozen, 'review-kit:review', '/etc/passwd')).toThrow('相对路径')
    symlinkSync(join(root, '.claude-plugin/plugin.json'), join(references, 'linked.md'))
    expect(() => store.readSkill(frozen, 'review-kit:review', 'references/linked.md')).toThrow()
  })
  it('intersects frozen declarations with live enabled, same-root skills', () => {
    const { store, root, file } = fixture(); store.register(root)
    const frozen = store.snapshots()
    mkdirSync(join(root, 'skills/later')); writeFileSync(join(root, 'skills/later/SKILL.md'), '---\nname: later\ndescription: Later skill\n---\nNew instructions.')
    expect(store.liveSkills(frozen).map(skill => skill.name)).toEqual(['review-kit:review'])
    store.setEnabled('review-kit@local', false)
    expect(store.reminder(frozen, ['review-kit@local'])).toBe('')
    expect(() => store.readSkill(frozen, 'review-kit:review')).toThrow('已停用')
    store.setEnabled('review-kit@local', true)
    writeFileSync(file, '---\nname: replaced\ndescription: Replaced skill\n---\nChanged name.')
    expect(store.liveSkills(frozen)).toEqual([])
  })
  it('removes only registration and keeps the original package and license', () => {
    const { store, root, file } = fixture(); writeFileSync(join(root, 'LICENSE'), 'Package license')
    store.register(root); expect(store.remove('review-kit@local')).toEqual([])
    expect(readFileSync(file, 'utf8')).toContain('actual changed behavior')
    expect(readFileSync(join(root, 'LICENSE'), 'utf8')).toBe('Package license')
  })
  it('reports invalid Hook declarations and catalogs supported MCP without executing either during discovery', () => {
    const { store, root } = fixture({ hooks: { command: 'never execute' }, mcpServers: { test: { command: 'never execute' } } })
    expect(store.register(root)[0]).toMatchObject({ unsupported: [], hookDiagnostics: [expect.stringContaining('command')], mcpServers: [{ key: 'test', enabled: true }] })
  })
  it('rejects outside/symlink components and rejects later filesystem substitution', () => {
    const outside = fixture(), escape = fixture({ skills: '../package-outside' })
    expect(() => escape.store.register(escape.root)).toThrow('超出')
    const view = fixture(); view.store.register(view.root); const frozen = view.store.snapshots()
    rmSync(join(view.root, 'skills/review'), { recursive: true }); symlinkSync(join(outside.root, 'skills/review'), join(view.root, 'skills/review'))
    expect(view.store.list()[0].error).toContain('无效')
    expect(() => view.store.readSkill(frozen, 'review-kit:review')).toThrow('已停用')
  })
  it('fails closed for same-name enabled catalogs across marketplaces', () => {
    const { store, root } = fixture(); store.register(root)
    const frozen = store.snapshots(), conflict = { ...frozen[0], id: 'review-kit@other' }
    expect(miraPluginItems([...frozen, conflict])[0].conflicts).toEqual(['review-kit@other'])
    expect(store.reminder([...frozen, conflict], ['review-kit@local'])).toBe('')
  })
  it('roundtrips compact references with explicit queue identities', () => {
    const reference = miraPluginReference('review-kit@local', '审查 [插件]')
    const document = { version: 1 as const, parts: [{ type: 'reference' as const, reference }] }
    const serialized = serializeMiraPromptDocument(document)
    expect(validateMiraPromptDocument(document, serialized)).toEqual(document)
    const plain = { version: 1 as const, parts: [{ type: 'text' as const, text: serialized }] }
    expect(restoreMiraPluginReferences(plain, ['review-kit@local']).parts[0]).toMatchObject({ type: 'reference', reference: { label: '审查 [插件]', value: 'review-kit@local' } })
    expect(restoreMiraPluginReferences(plain, []).parts).toEqual(plain.parts)
  })
  it('bounds bridge IDs and never accepts paths or external URLs as plugin identity', () => {
    expect(parseFirstPartyHarnessCall('plugins.catalog', { sessionId: 's' })).toEqual({ method: 'plugins.catalog', sessionId: 's' })
    expect(() => parseFirstPartyHarnessCall('plugins.set-enabled', { id: '/tmp/package', enabled: true })).toThrow('无效')
    const params = { sessionId: 's', submissionId: 'submission', text: 'Test', references: [], selection: { providerId: 'p', modelId: 'm' }, planning: false }
    expect(parseFirstPartyHarnessCall('message.submit', { ...params, options: { pluginIds: ['review-kit@local', 'review-kit@local'] } })).toMatchObject({ options: { pluginIds: ['review-kit@local'] } })
    expect(() => parseFirstPartyHarnessCall('message.submit', { ...params, options: { pluginIds: ['plugin://review-kit@local'] } })).toThrow('无效')
    expect(() => parseFirstPartyHarnessCall('message.submit', { ...params, options: { pluginIds: Array(9).fill('review-kit@local') } })).toThrow('无效')
  })
})

describe('Mira plugin agent Markdown profiles', () => {
  it('normalizes supported tools once, preserves explicit empty limits and leaves instruction text inert', () => {
    expect(parseMiraPluginAgent('---\nname: code:review\ndescription: Review code\ntools: Read, Glob, read, WebFetch\ndisallowedTools: []\ncolor: blue\n---\nInspect !`pwd` and $ARGUMENTS.')).toEqual({ name: 'code:review', description: 'Review code', body: 'Inspect !`pwd` and $ARGUMENTS.', tools: ['read', 'list_files', 'web_fetch'], disallowedTools: [] })
    expect(parseMiraPluginAgent('---\nname: review\ndescription: Review\ntools: []\n---\nNo tools.').tools).toEqual([])
  })
  it.each([
    ['No frontmatter.', 'YAML'],
    ['---\nname: "../unsafe"\ndescription: Review\n---\nBody', 'name'],
    ['---\nname: review\n---\nBody', 'description'],
    ['---\nname: review\ndescription: Review\n---\n', '正文'],
    ['---\nname: review\ndescription: Review\ntools: {read: true}\n---\nBody', 'tools'],
    ['---\nname: review\ndescription: Review\ntools: [Grep, Agent, "*"]\n---\nBody', 'Grep、Agent、*'],
    ['---\nname: review\ndescription: Review\ntools: [constructor, __proto__]\n---\nBody', 'constructor、__proto__'],
    ['---\nname: review\ndescription: Review\ndisallowedTools: [Unknown]\n---\nBody', 'disallowedTools'],
    ['---\nname: review\ndescription: Review\nmaxTurns: 2\nbackground: true\ninjectAgentsMd: false\nmemory: user\nmodelSelection: {}\n---\nBody', 'maxTurns、background、injectAgentsMd、memory、modelSelection'],
    ['---\nname: review\ndescription: &text Review\ncolor: *text\n---\nBody', 'YAML'],
  ])('marks malformed or unsupported profiles unavailable without silently dropping behavior', (source, reason) => {
    expect(parseMiraPluginAgent(source).unavailableReason).toContain(reason)
  })
})
