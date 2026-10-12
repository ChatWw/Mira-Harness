import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlatformDatabase } from '../electron/storage/database'
import { registerPlatformIpcHandlers } from '../electron/ipc/platformIpc'
import type { MiraHookItem } from '../src/config/miraHooks'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), owner: true }))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => electron.handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => electron.owner ? {} : null },
  session: {}, webContents: {}, clipboard: {}, dialog: {}, shell: {},
}))
const fixtures: Array<{ home: string; database: PlatformDatabase }> = []
beforeEach(() => { electron.handlers.clear(); electron.owner = true })
afterEach(() => fixtures.splice(0).forEach(({ home, database }) => { database.close(); rmSync(home, { recursive: true, force: true }) }))
function setup() {
  const home = mkdtempSync(join(tmpdir(), 'mira-hook-ipc-')), database = new PlatformDatabase(home)
  fixtures.push({ home, database })
  const directory = join(home, 'project'); mkdirSync(directory)
  const project = database.harness.createProject(directory)
  registerPlatformIpcHandlers({ database, localMicroAppServer: {} as never })
  const frame = { parent: null as unknown }, sender = { mainFrame: frame, isDestroyed: vi.fn(() => false) }
  const event = { sender, senderFrame: frame as typeof frame | undefined }
  const invoke = (method: unknown, params?: unknown) => electron.handlers.get('platform:hooks')!(event, method, params)
  return { home, database, directory, project, event, sender, invoke }
}
const config = { scope: 'global', name: 'Mira Hook', event: 'PreToolUse', type: 'command', command: 'echo ready' }
describe('host-only Hook settings IPC', () => {
  it('approves and revokes host-resolved plugin declarations without editing third-party files or accepting paths', () => {
    const view = setup(), root = join(view.home, 'plugin'), source = join(root, 'hooks/hooks.json')
    mkdirSync(join(root, '.mira-plugin'), { recursive: true }); mkdirSync(join(root, 'hooks'))
    writeFileSync(join(root, '.mira-plugin/plugin.json'), JSON.stringify({ name: 'settings-hook' }))
    const definition = JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo actual' }] }] } })
    writeFileSync(source, definition); view.database.plugins.register(root)
    const [pending] = view.invoke('hooks.list') as MiraHookItem[]
    expect(pending).toMatchObject({ scope: 'plugin', pluginId: 'settings-hook@local', trusted: false })
    const request = { scope: 'plugin', pluginId: pending.pluginId, id: pending.id, expectedRevision: pending.revision }
    for (const field of ['sourceRoot', 'sourcePath', 'command', 'pluginDataPath']) expect(() => view.invoke('hooks.trust', { ...request, [field]: root })).toThrow('未知字段')
    expect(() => view.invoke('hooks.trust', { ...request, pluginId: 'wrong@local' })).toThrow('修改')
    expect(() => view.invoke('hooks.trust', { ...request, expectedRevision: '0'.repeat(64) })).toThrow('修改')
    expect(() => view.invoke('hooks.save', { ...config, scope: 'plugin' })).toThrow('范围')
    expect(() => view.invoke('hooks.setEnabled', { ...request, enabled: false })).toThrow()
    expect(view.invoke('hooks.trust', request)).toMatchObject({ trusted: true, command: 'echo actual' })
    expect(view.invoke('hooks.revokeTrust', request)).toMatchObject({ trusted: false })
    expect(() => view.invoke('hooks.revokeTrust', { scope: 'global', id: pending.id, expectedRevision: pending.revision })).toThrow('范围')
    expect(readFileSync(source, 'utf8')).toBe(definition)
    view.database.plugins.setEnabled('settings-hook@local', false)
    expect(() => view.invoke('hooks.trust', request)).toThrow()
    expect(view.invoke('hooks.revokeTrust', request)).toMatchObject({ trusted: false, enabled: false })
  })

  it('uses real database storage and resolves project IDs through the host', () => {
    const view = setup()
    expect(view.invoke('hooks.list')).toEqual([])
    const global: MiraHookItem = view.invoke('hooks.save', config)
    const local: MiraHookItem = view.invoke('hooks.save', { ...config, scope: 'project', projectId: view.project.id })
    expect(global.trusted).toBe(true); expect(local.sourcePath).toContain('/project/.mira/hooks.json')
    expect(view.invoke('hooks.list', { projectId: view.project.id })).toEqual([local, global])
    expect(view.invoke('hooks.list')).toEqual([global])
    const disabled: MiraHookItem = view.invoke('hooks.setEnabled', { scope: 'project', projectId: view.project.id, id: local.id, expectedRevision: local.revision, enabled: false })
    expect(disabled).toMatchObject({ enabled: false, trusted: true })
    expect(() => view.invoke('hooks.delete', { scope: 'project', projectId: view.project.id, id: local.id, expectedRevision: local.revision })).toThrow('修改')
    view.invoke('hooks.delete', { scope: 'project', projectId: view.project.id, id: local.id, expectedRevision: disabled.revision })
    expect(view.invoke('hooks.list', { projectId: view.project.id })).toEqual([global])
    expect(readdirSync(join(view.directory, '.mira/trash/hooks'))).toHaveLength(1)
  })
  it('reviews actual changed declarations without trusting stale or renderer-supplied metadata', () => {
    const view = setup(), original: MiraHookItem = view.invoke('hooks.save', { ...config, scope: 'project', projectId: view.project.id })
    const file = JSON.parse(readFileSync(original.sourcePath, 'utf8')); file.hooks[0].command = 'echo changed'
    writeFileSync(original.sourcePath, JSON.stringify(file))
    const [pending] = view.invoke('hooks.list', { projectId: view.project.id }) as MiraHookItem[]
    expect(pending.trusted).toBe(false)
    expect(() => view.invoke('hooks.trust', { scope: 'project', projectId: view.project.id, id: original.id, expectedRevision: original.revision })).toThrow('修改')
    const trusted = view.invoke('hooks.trust', { scope: 'project', projectId: view.project.id, id: pending.id, expectedRevision: pending.revision })
    expect(trusted.trusted).toBe(true); expect(trusted.command).toBe('echo changed')
    expect(() => view.database.hooks.assert(trusted, view.directory)).not.toThrow()
    expect(() => view.invoke('hooks.save', { ...config, trusted: true })).toThrow('未知字段')
  })
  it.each(['subframe', 'missing', 'foreign-frame', 'destroyed', 'ownerless'])('rejects %s before reading executable config or changing host trust', caller => {
    const view = setup(), saved = view.invoke('hooks.save', config), source = readFileSync(saved.sourcePath, 'utf8')
    if (caller === 'subframe') view.event.senderFrame!.parent = {}
    if (caller === 'missing') view.event.senderFrame = undefined
    if (caller === 'foreign-frame') view.event.senderFrame = { parent: null }
    if (caller === 'destroyed') view.sender.isDestroyed.mockReturnValue(true)
    if (caller === 'ownerless') electron.owner = false
    for (const method of ['hooks.list', 'hooks.save', 'hooks.delete', 'hooks.setEnabled', 'hooks.trust']) expect(() => view.invoke(method, config)).toThrow('仅可在平台设置')
    expect(readFileSync(saved.sourcePath, 'utf8')).toBe(source)
  })
  it('rejects arbitrary directories, unknown project IDs, malformed requests and stale mutation versions', () => {
    const view = setup()
    for (const method of ['hooks.list', 'hooks.save', 'hooks.delete', 'hooks.setEnabled', 'hooks.trust']) expect(() => view.invoke(method, { ...config, directory: view.directory })).toThrow('未知字段')
    expect(() => view.invoke('hooks.save', { ...config, scope: 'project' })).toThrow('选择有效项目')
    expect(() => view.invoke('hooks.list', { projectId: 'missing' })).toThrow('未找到项目')
    expect(() => view.invoke('hooks.list', { projectId: [] })).toThrow('项目 ID')
    for (const params of [null, [], 'text']) expect(() => view.invoke('hooks.list', params)).toThrow('请求无效')
    expect(() => view.invoke('hooks.unknown', {})).toThrow('请求无效')
    expect(() => view.invoke('hooks.delete', { scope: 'global', id: 'missing', expectedRevision: 'bad' })).toThrow('版本')
    expect(existsSync(join(view.home, '.mira/hooks.json'))).toBe(false)
  })
  it('reports actual corruption without replacing bytes and redacts native errors', () => {
    const view = setup(), saved = view.invoke('hooks.save', config)
    writeFileSync(saved.sourcePath, '{broken')
    expect(() => view.invoke('hooks.list')).toThrow('损坏')
    expect(() => view.invoke('hooks.save', config)).toThrow('损坏')
    expect(readFileSync(saved.sourcePath, 'utf8')).toBe('{broken')
    vi.spyOn(view.database.hooks, 'list').mockImplementationOnce(() => { throw new Error('EACCES /private/secret-home/hooks.json') })
    expect(() => view.invoke('hooks.list')).toThrow('Hook 配置操作失败，请检查配置文件权限后重试')
    vi.spyOn(view.database.harness, 'getProject').mockImplementationOnce(() => { throw new Error('ENOENT /private/secret-project') })
    expect(() => view.invoke('hooks.list', { projectId: view.project.id })).toThrow('Hook 配置操作失败，请检查配置文件权限后重试')
  })
})
