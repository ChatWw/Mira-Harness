import Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HarnessStore } from '../electron/harnessStore'
import { PlatformDatabase } from '../electron/database'
import { MiraPaths } from '../electron/miraPaths'

function createStore() {
  const root = mkdtempSync(join(tmpdir(), 'mira-harness-store-'))
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE harness_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'FolderOpened', directory TEXT NOT NULL UNIQUE, default_model_provider_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_session_at INTEGER);
    CREATE TABLE harness_sessions (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, model_provider_id TEXT, model_id TEXT, permission_mode TEXT NOT NULL, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL, working_directory TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE harness_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  return { root, database, store: new HarnessStore(database, new MiraPaths(root)) }
}

describe('HarnessStore', () => {
  it('persists the selected project icon and deletes selected session files with their index rows', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'Demo 项目', 'Collection')
    const first = store.createSession(project.id)
    const second = store.createSession(project.id)

    expect(store.getProject(project.id).icon).toBe('Collection')
    store.renameProject(project.id, '已重命名项目', 'Files')
    expect(store.getProject(project.id).name).toBe('已重命名项目')
    expect(store.getProject(project.id).icon).toBe('Files')
    store.renameProject(project.id, '再次重命名项目')
    expect(store.getProject(project.id).icon).toBe('Files')
    expect(store.listSessions()).toHaveLength(2)
    expect(() => store.createProject(join(root, 'invalid-icon'), 'Invalid', 'invalid icon')).toThrow('项目图标无效')
    store.deleteSessions([first.id, second.id])
    expect(store.listSessions()).toEqual([])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('adds the default icon when opening a legacy project database', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-harness-migration-'))
    const directory = join(root, 'legacy-project')
    mkdirSync(directory)
    const paths = new MiraPaths(root).ensure()
    const legacy = new Database(paths.stateDatabase())
    legacy.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE menus (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE micro_apps (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL); CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE harness_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, directory TEXT NOT NULL UNIQUE, default_model_provider_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_session_at INTEGER);')
    legacy.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('seeded', '1')
    legacy.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('schemaVersion', '17')
    legacy.prepare('INSERT INTO harness_projects(id, name, directory, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('legacy', '旧项目', directory, Date.now(), Date.now())
    legacy.close()

    const database = new PlatformDatabase(root)
    expect(database.harness.getProject('legacy').icon).toBe('FolderOpened')
    rmSync(root, { recursive: true, force: true })
  })

  it('reports missing project directories without failing the project list', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'missing-project')
    mkdirSync(directory)
    const project = store.createProject(directory, '已移除目录')
    rmSync(directory, { recursive: true, force: true })

    expect(store.listProjects()).toEqual([expect.objectContaining({ id: project.id, directoryExists: false })])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('creates an unassigned session unless a project is explicitly selected', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'Demo 项目')

    const recent = store.createSession()
    const projectSession = store.createSession(project.id)

    expect(recent.projectId).toBeUndefined()
    expect(recent.workingDirectory).toBeUndefined()
    expect(projectSession.projectId).toBe(project.id)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('stores project sessions and trash outside the project directory', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    writeFileSync(join(directory, 'remove-me.txt'), '待删除', 'utf8')
    const project = store.createProject(directory, 'Demo 项目')
    const session = store.createSession(project.id)
    store.addMessage(session.id, 'user', '记录在外部')
    expect(existsSync(join(directory, '.mira'))).toBe(false)
    store.moveToTrash(session.id, 'remove-me.txt')
    expect(existsSync(join(directory, '.mira'))).toBe(false)
    expect(store.listTrash(project.id)).toHaveLength(1)
    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('attaches this run\'s file changes to its completed assistant reply', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const startedAt = Date.now()
    store.addMessage(session.id, 'user', '修改文件')
    store.recordTool(session.id, { id: 'previous-read', tool: 'read', target: 'README.md', status: 'ok', createdAt: startedAt - 1 })
    store.recordTool(session.id, { id: 'edit-file', tool: 'edit', target: 'src/main.ts', status: 'ok', diff: '-1 old\n+1 new', createdAt: startedAt + 1 })
    store.recordTool(session.id, { id: 'write-file', tool: 'write', target: 'src/new.ts', status: 'ok', diff: '+1 export {}', createdAt: startedAt + 2 })
    store.recordTool(session.id, { id: 'delete-file', tool: 'delete', target: 'src/old.ts', status: 'ok', diff: '- 删除 src/old.ts（可还原）', createdAt: startedAt + 3 })
    store.appendAssistantDelta(session.id, '已完成')
    store.finalizeAssistantMessage(session.id, { run: { startedAt, completedAt: startedAt + 10, durationMs: 10, activities: [] } })

    expect(store.getSession(session.id).messages.at(-1)?.fileChanges).toEqual([
      { toolCallId: 'edit-file', tool: 'edit', path: 'src/main.ts', diff: '-1 old\n+1 new' },
      { toolCallId: 'write-file', tool: 'write', path: 'src/new.ts', diff: '+1 export {}' },
      { toolCallId: 'delete-file', tool: 'delete', path: 'src/old.ts', diff: '- 删除 src/old.ts（可还原）' },
    ])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('lists trash across projects and restores only when original paths are free', () => {
    const { root, database, store } = createStore()
    const firstDirectory = join(root, 'first-project')
    const secondDirectory = join(root, 'second-project')
    mkdirSync(firstDirectory); mkdirSync(secondDirectory)
    writeFileSync(join(firstDirectory, 'first.txt'), 'first', 'utf8')
    writeFileSync(join(secondDirectory, 'second.txt'), 'second', 'utf8')
    const first = store.createProject(firstDirectory, '第一项目')
    const second = store.createProject(secondDirectory, '第二项目')
    const firstSession = store.createSession(first.id)
    const secondSession = store.createSession(second.id)
    store.moveToTrash(firstSession.id, 'first.txt')
    store.moveToTrash(secondSession.id, 'second.txt')

    expect(store.listTrash()).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectId: first.id, projectName: '第一项目', paths: ['first.txt'] }),
      expect.objectContaining({ projectId: second.id, projectName: '第二项目', paths: ['second.txt'] }),
    ]))
    expect(store.listTrash(first.id)).toEqual([expect.objectContaining({ projectId: first.id, paths: ['first.txt'] })])

    const entry = store.listTrash(first.id)[0]
    writeFileSync(join(firstDirectory, 'first.txt'), 'replacement', 'utf8')
    expect(() => store.restoreTrash(first.id, entry.token)).toThrow('目标路径已存在')
    expect(store.listTrash(first.id)).toHaveLength(1)
    rmSync(join(firstDirectory, 'first.txt'))
    store.restoreTrash(first.id, entry.token)
    expect(readFileSync(join(firstDirectory, 'first.txt'), 'utf8')).toBe('first')
    expect(store.listTrash(first.id)).toHaveLength(0)

    const secondEntry = store.listTrash(second.id)[0]
    rmSync(secondDirectory, { recursive: true, force: true })
    expect(() => store.restoreTrash(second.id, secondEntry.token)).toThrow('项目目录不存在')
    expect(store.listTrash(second.id)).toHaveLength(1)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('saves retention days and removes only expired trash entries', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    writeFileSync(join(directory, 'expired.txt'), 'expired', 'utf8')
    writeFileSync(join(directory, 'recent.txt'), 'recent', 'utf8')
    const project = store.createProject(directory, 'Demo 项目')
    const session = store.createSession(project.id)
    const expired = store.moveToTrash(session.id, 'expired.txt')
    const recent = store.moveToTrash(session.id, 'recent.txt')
    const current = store.getPermissionConfig()
    expect(store.savePermissionConfig({ ...current, trashRetentionDays: 1 }).trashRetentionDays).toBe(1)
    expect(store.savePermissionConfig({ ...current, trashRetentionDays: 31 }).trashRetentionDays).toBe(1)
    const orphan = join(root, '.mira', 'trash', 'removed-project', '1-legacy')
    mkdirSync(orphan, { recursive: true })
    expect(store.cleanupExpiredTrash(Date.now())).toBe(1)
    expect(store.listTrash(project.id)).toHaveLength(2)
    const future = Date.now() + 2 * 24 * 60 * 60 * 1000
    expect(store.cleanupExpiredTrash(future)).toBe(2)
    expect(store.listTrash(project.id)).toEqual([])
    expect(existsSync(join(directory, 'expired.txt'))).toBe(false)
    expect(existsSync(join(directory, 'recent.txt'))).toBe(false)
    expect(expired.token).not.toBe(recent.token)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('uses directory modification time for legacy trash tokens without a timestamp', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'Demo 项目')
    const legacy = join(root, '.mira', 'trash', project.id, 'legacy-token')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'note.txt'), 'legacy', 'utf8')

    const entry = store.listTrash(project.id)[0]
    expect(entry).toMatchObject({ token: 'legacy-token', paths: ['note.txt'] })
    expect(entry.deletedAt).toBeGreaterThan(0)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists pinned sessions in the session index and file', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()

    store.setPinned(session.id, true)
    expect(store.getSession(session.id).pinned).toBe(true)
    expect(store.listSessions()).toEqual([expect.objectContaining({ id: session.id, pinned: true })])

    store.setPinned(session.id, false)
    expect(store.getSession(session.id).pinned).toBe(false)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('renames a session in the session file and index', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()

    store.renameSession(session.id, '  已重命名的聊天  ')
    expect(store.getSession(session.id).title).toBe('已重命名的聊天')
    expect(store.listSessions()).toEqual([expect.objectContaining({ id: session.id, title: '已重命名的聊天' })])
    expect(() => store.renameSession(session.id, '  ')).toThrow('聊天名称不能为空')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('includes the current Git branch only for projects on a branch', () => {
    const { root, database, store } = createStore()
    const gitDirectory = join(root, 'git-project')
    const plainDirectory = join(root, 'plain-project')
    mkdirSync(gitDirectory)
    mkdirSync(plainDirectory)
    execFileSync('git', ['init'], { cwd: gitDirectory })
    writeFileSync(join(gitDirectory, 'README.md'), '项目说明', 'utf8')
    execFileSync('git', ['add', 'README.md'], { cwd: gitDirectory })
    execFileSync('git', ['-c', 'user.name=Mira', '-c', 'user.email=mira@example.test', 'commit', '-m', '初始化'], { cwd: gitDirectory })
    const gitProject = store.createProject(gitDirectory, 'Git 项目')
    const plainProject = store.createProject(plainDirectory, '普通项目')

    const listed = store.listProjects()
    expect(listed.find(project => project.id === gitProject.id)?.gitBranch).toBeTruthy()
    expect(listed.find(project => project.id === plainProject.id)?.gitBranch).toBeUndefined()

    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: gitDirectory, encoding: 'utf8' }).trim()
    execFileSync('git', ['checkout', '--detach', revision], { cwd: gitDirectory })
    expect(store.listProjects().find(project => project.id === gitProject.id)?.gitBranch).toBeUndefined()

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('lists, switches, and creates local Git branches with the current working tree status', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'git-project')
    mkdirSync(directory)
    execFileSync('git', ['init'], { cwd: directory })
    writeFileSync(join(directory, 'README.md'), '初始化', 'utf8')
    execFileSync('git', ['add', 'README.md'], { cwd: directory })
    execFileSync('git', ['-c', 'user.name=Mira', '-c', 'user.email=mira@example.test', 'commit', '-m', '初始化'], { cwd: directory })
    execFileSync('git', ['branch', 'topic'], { cwd: directory })
    writeFileSync(join(directory, 'README.md'), '已修改', 'utf8')
    writeFileSync(join(directory, 'new-file.md'), '未追踪', 'utf8')
    const project = store.createProject(directory, 'Git 项目')

    const initial = store.listGitBranches(project.id)
    expect(initial.map(branch => branch.name)).toContain('topic')
    expect(initial.find(branch => branch.current)?.uncommittedFileCount).toBe(2)

    const switched = store.checkoutGitBranch(project.id, 'topic')
    expect(switched.find(branch => branch.current)?.name).toBe('topic')
    const created = store.createAndCheckoutGitBranch(project.id, 'mira/new-branch')
    expect(created.find(branch => branch.current)?.name).toBe('mira/new-branch')
    expect(() => store.createAndCheckoutGitBranch(project.id, 'mira/new-branch')).toThrow('分支已存在')
    expect(() => store.createAndCheckoutGitBranch(project.id, 'mira/')).toThrow('分支名不能以“/”结尾')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists validated Git settings with safe defaults for legacy values', () => {
    const { root, database, store } = createStore()
    expect(store.getGitConfig()).toMatchObject({ branchPrefix: 'mira/', pullRequestMergeMethod: 'merge', alwaysForcePush: false, createDraftPullRequest: true, reviewDelivery: 'inline' })

    const saved = store.saveGitConfig({
      branchPrefix: 'feature/', pullRequestMergeMethod: 'squash', alwaysForcePush: true, createDraftPullRequest: false,
      reviewDelivery: 'separate', commitInstructions: '使用中文提交信息', pullRequestInstructions: '描述影响范围',
    })
    expect(saved).toMatchObject({ branchPrefix: 'feature/', pullRequestMergeMethod: 'squash', alwaysForcePush: true, createDraftPullRequest: false, reviewDelivery: 'separate' })
    expect(store.getGitConfig().commitInstructions).toBe('使用中文提交信息')
    expect(() => store.saveGitConfig({ ...saved, branchPrefix: 'invalid' })).toThrow('分支前缀无效')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('removes project history without deleting its source folder or files', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    writeFileSync(join(directory, 'chapter.md'), '保留的源文件', 'utf8')
    const project = store.createProject(directory, 'Demo 项目')
    store.createSession(project.id)

    store.deleteProject(project.id, true)

    expect(store.listProjects()).toEqual([])
    expect(existsSync(directory)).toBe(true)
    expect(existsSync(join(directory, 'chapter.md'))).toBe(true)
    expect(existsSync(join(directory, '.mira'))).toBe(false)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('migrates legacy permission defaults and limits disabled permission modes', () => {
    const { root, database, store } = createStore()
    database.prepare('INSERT INTO harness_settings(key, value) VALUES (?, ?)').run('permission', JSON.stringify({ globalDefaultMode: 'full' }))

    expect(store.getPermissionConfig()).toMatchObject({ globalDefaultMode: 'default', autoApproveEnabled: true, fullAccessEnabled: true })
    expect(store.createSession().permissionMode).toBe('default')

    store.savePermissionConfig({ ...store.getPermissionConfig(), autoApproveEnabled: false, fullAccessEnabled: false })
    const session = store.createSession()
    expect(() => store.setPermission(session.id, 'auto-approve')).toThrow('自动审核权限未启用')
    expect(() => store.setPermission(session.id, 'full')).toThrow('完全访问权限未启用')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('removes legacy empty sessions and keeps sessions with user messages', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'Demo 项目')
    store.createSession(project.id)
    const retained = store.createSession(project.id)
    store.addMessage(retained.id, 'user', '保留这条对话')

    expect(store.removeEmptySessions()).toBe(1)
    expect(store.listSessions().map(session => session.id)).toEqual([retained.id])
    expect(store.getProject(project.id).sessionCount).toBe(1)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists context summaries without removing visible conversation messages', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const user = store.addMessage(session.id, 'user', '保留的早期提问')
    const assistant = store.appendAssistantText(session.id, '保留的早期回复', undefined, { input: 40, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 60 })
    assistant.context = {
      summary: '此前对话摘要',
      compactedThroughMessageId: user.messages.at(-1)!.id,
      compactedAt: Date.now(),
      usage: { usedTokens: 128, contextWindow: 128000, source: 'reported', updatedAt: Date.now() },
    }
    store.updateSession(assistant)

    const restored = store.getSession(session.id)
    expect(restored.messages).toHaveLength(2)
    expect(restored.messages[0].content).toBe('保留的早期提问')
    expect(restored.context?.summary).toBe('此前对话摘要')
    expect(restored.messages[1].usage?.totalTokens).toBe(60)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists assistant deltas atomically and finalizes the same message', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    store.addMessage(session.id, 'user', '请回答')
    store.appendAssistantDelta(session.id, '第一段')
    store.appendAssistantDelta(session.id, '，第二段')
    store.finalizeAssistantMessage(session.id, {
      interrupted: true,
      run: { startedAt: 1, completedAt: 2, durationMs: 1, activities: [] },
    })

    const restored = store.getSession(session.id)
    const assistant = restored.messages.at(-1)!
    const row = database.prepare('SELECT path FROM harness_sessions WHERE id = ?').get(session.id) as { path: string }
    expect(assistant.content).toBe('第一段，第二段')
    expect(assistant.interrupted).toBe(true)
    expect(assistant.run?.durationMs).toBe(1)
    expect(() => JSON.parse(readFileSync(row.path, 'utf8'))).not.toThrow()
    expect(existsSync(`${row.path}.${process.pid}.tmp`)).toBe(false)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('edits a user message, truncates later history, and clears compacted context', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const first = store.addMessage(session.id, 'user', '旧问题', [{ path: 'notes.txt', content: '保留附件内容', size: 18 }])
    const firstId = first.messages.at(-1)!.id
    store.appendAssistantText(session.id, '旧回答')
    store.addMessage(session.id, 'user', '后续问题')
    const withContext = store.getSession(session.id)
    withContext.context = { summary: '旧摘要', compactedThroughMessageId: firstId, compactedAt: Date.now() }
    store.updateSession(withContext)

    const edited = store.editUserMessageAndTruncate(session.id, firstId, '新问题')
    expect(edited.messages).toEqual([expect.objectContaining({ id: firstId, role: 'user', content: '新问题' })])
    expect(edited.messages[0].attachments).toEqual([{ path: 'notes.txt', content: '保留附件内容', size: 18 }])
    expect(edited.context).toBeUndefined()
    expect(() => store.editUserMessageAndTruncate(session.id, firstId, '   ')).toThrow('消息不能为空')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('lists and snapshots only safe text files inside the selected project', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    writeFileSync(join(directory, 'notes.txt'), '项目说明', 'utf8')
    writeFileSync(join(directory, 'binary.dat'), Buffer.from([0, 1, 2]))
    mkdirSync(join(directory, 'node_modules'))
    writeFileSync(join(directory, 'node_modules', 'ignored.txt'), '忽略', 'utf8')
    const project = store.createProject(directory, 'Demo 项目')
    const session = store.createSession(project.id)

    expect(store.listProjectFiles(project.id)).toEqual([{ path: 'notes.txt', name: 'notes.txt' }])
    expect(store.resolveMessageAttachments(session.id, [{ path: 'notes.txt', name: 'notes.txt' }])).toEqual([{ path: 'notes.txt', name: 'notes.txt', content: '项目说明' }])
    expect(() => store.resolveMessageAttachments(session.id, [{ path: '../outside.txt', name: 'outside.txt' }])).toThrow('路径不在项目目录内')
    expect(() => store.resolveMessageAttachments(session.id, [{ path: 'binary.dat', name: 'binary.dat' }])).toThrow('不支持引用二进制文件')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })
})
