import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformDatabase } from '../electron/storage/database'
import type { HarnessWorkspaceSearchIgnoreDocument, HarnessWorkspaceSearchIgnoreTarget } from '../src/config/harness'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  read: vi.fn(),
  transform: vi.fn(),
  write: vi.fn(),
}))

vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mocks.handlers.set(channel, handler) } }))
vi.mock('../electron/services/harnessWorkspaceIgnore', () => ({
  readHarnessWorkspaceSearchIgnore: mocks.read,
  transformHarnessWorkspaceSearchIgnore: mocks.transform,
  writeHarnessWorkspaceSearchIgnore: mocks.write,
}))

import { registerHarnessWorkspaceIgnoreIpcHandlers } from '../electron/ipc/harnessWorkspaceIgnoreIpc'

const document: HarnessWorkspaceSearchIgnoreDocument = { content: '# Mira ignore\n', source: 'template', revision: 'r1' }
const projectTarget: HarnessWorkspaceSearchIgnoreTarget = { kind: 'project', id: 'project-a' }
const sessionTarget: HarnessWorkspaceSearchIgnoreTarget = { kind: 'session', id: 'personal-a' }
const channels = ['read', 'transform', 'write'] as const
type Operation = typeof channels[number]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

function register() {
  const projects = new Map([['project-a', { directory: '/private/mira-project-a' }]])
  const sessions = new Map([
    ['attached-a', { projectId: 'project-a', workingDirectory: '/private/ignored-session-root' }],
    ['personal-a', { projectId: undefined, workingDirectory: '/private/mira-personal-a' }],
  ])
  const database = { harness: {
    getProject: vi.fn((id: string) => { const project = projects.get(id); if (!project) throw new Error('private lookup /private/mira-projects.sqlite'); return project }),
    getSession: vi.fn((id: string) => { const session = sessions.get(id); if (!session) throw new Error('private lookup /private/mira-sessions.sqlite'); return session }),
  } }
  registerHarnessWorkspaceIgnoreIpcHandlers(database as unknown as PlatformDatabase)
  const sender = { isDestroyed: vi.fn(() => false) }
  const event = { sender, senderFrame: { parent: null as unknown } }
  const invoke = (operation: Operation, ...args: unknown[]) => Promise.resolve().then(() => mocks.handlers.get(`harness:${operation}-search-ignore`)!(event,
    args.length > 0 ? args[0] : projectTarget, args.length > 1 ? args[1] : document.content,
    args.length > 2 ? args[2] : operation === 'transform' ? 'reset-defaults' : document.revision))
  return { projects, sessions, database, sender, event, invoke }
}

beforeEach(() => {
  mocks.handlers.clear()
  mocks.read.mockReset().mockResolvedValue(document)
  mocks.transform.mockReset().mockResolvedValue({ content: document.content })
  mocks.write.mockReset().mockImplementation(async (_directory, _content, _revision, assertAuthorized: () => void) => { assertAuthorized(); return document })
})

describe('Harness search-ignore settings IPC', () => {
  it('registers only the three fixed search-ignore channels', () => {
    register()
    expect([...mocks.handlers.keys()]).toEqual(channels.map(operation => `harness:${operation}-search-ignore`))
  })

  it.each([
    { target: projectTarget, directory: '/private/mira-project-a' },
    { target: { kind: 'session', id: 'attached-a' }, directory: '/private/mira-project-a' },
    { target: sessionTarget, directory: '/private/mira-personal-a' },
  ])('resolves $target.kind/$target.id from the database, not caller paths', async ({ target, directory }) => {
    const view = register()
    const untrusted = { ...target, root: '/private/injected-root', path: '../secret', fileName: '/private/secret' }
    await expect(view.invoke('read', untrusted)).resolves.toEqual(document)
    await expect(view.invoke('transform', untrusted)).resolves.toEqual({ content: document.content })
    await expect(view.invoke('write', untrusted)).resolves.toEqual(document)
    expect(mocks.read).toHaveBeenCalledWith(directory)
    expect(mocks.transform).toHaveBeenCalledWith(directory, document.content, 'reset-defaults')
    expect(mocks.write).toHaveBeenCalledWith(directory, document.content, document.revision, expect.any(Function))
  })

  it.each([undefined, null, [], {}, { kind: 'path', id: 'project-a' }, { kind: 'project', id: null }, { kind: 'session', id: 1 },
    { kind: 'project', id: '' }, { kind: 'project', id: '  ' }, { kind: 'project', id: 'x'.repeat(257) },
    { kind: 'project', id: 'project\0a' }, { kind: 'project', id: 'project\na' }, { kind: 'project', id: 'project\x7fa' },
  ])('rejects malformed target %j before any service action', async target => {
    const view = register()
    for (const operation of channels) await expect(view.invoke(operation, target)).rejects.toThrow('工作区无效')
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.transform).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it.each(['missing', 'subframe'])('rejects a $0 caller frame for every action', async frame => {
    const view = register()
    if (frame === 'missing') view.event.senderFrame = undefined as never
    else view.event.senderFrame.parent = {}
    for (const operation of channels) await expect(view.invoke(operation)).rejects.toThrow('仅可在平台设置中管理')
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.transform).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it.each([null, 0, true, [], {}, 'bad\0rules', 'x'.repeat(256 * 1024 + 1), '界'.repeat(87_382)])('bounds and validates rule content before transform or save', async content => {
    const view = register()
    await expect(view.invoke('transform', projectTarget, content)).rejects.toThrow(/内容/)
    await expect(view.invoke('write', projectTarget, content)).rejects.toThrow(/内容/)
    expect(mocks.transform).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('accepts empty text and the exact UTF-8 byte limit without expanding path authority', async () => {
    const view = register()
    await expect(view.invoke('write', projectTarget, '')).resolves.toEqual(document)
    await expect(view.invoke('transform', projectTarget, 'x'.repeat(256 * 1024))).resolves.toEqual({ content: document.content })
    expect(mocks.write.mock.calls[0][1]).toBe('')
    expect(mocks.transform.mock.calls[0][1]).toHaveLength(256 * 1024)
  })

  it.each([undefined, null, true, 'delete-file', '/private/command'])('rejects unsupported transforms %j', async transform => {
    const view = register()
    await expect(view.invoke('transform', projectTarget, document.content, transform)).rejects.toThrow('规则操作无效')
    expect(mocks.transform).not.toHaveBeenCalled()
  })

  it.each(['sync-gitignore', 'reset-defaults'])('passes the supported %s transform without saving', async transform => {
    const view = register()
    await expect(view.invoke('transform', projectTarget, document.content, transform)).resolves.toEqual({ content: document.content })
    expect(mocks.transform).toHaveBeenCalledWith('/private/mira-project-a', document.content, transform)
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it.each([undefined, null, 1, '', 'x'.repeat(257), 'r\0a', 'r\na', 'r\x7fa'])('rejects invalid revisions %j before writing', async revision => {
    const view = register()
    await expect(view.invoke('write', projectTarget, document.content, revision)).rejects.toThrow('规则版本无效')
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it.each(channels)('%s sanitizes database lookup errors and private service errors', async operation => {
    const view = register()
    for (const target of [{ kind: 'project', id: 'missing' }, { kind: 'session', id: 'missing' }]) {
      const error = await view.invoke(operation, target).catch(cause => cause as Error) as Error
      expect(error.message).toMatch(/操作失败.*重试/)
      expect(error.message).not.toContain('/private/')
      expect(error.message).not.toContain('sqlite')
    }
    mocks[operation].mockRejectedValueOnce(new Error('EPERM open /private/secret.miraignore'))
    const error = await view.invoke(operation).catch(cause => cause as Error) as Error
    expect(error.message).toMatch(/操作失败.*重试/)
    expect(error.message).not.toContain('/private/')
  })

  it.each(['忽略规则已被修改，请重新载入', '忽略规则分区标记缺失或重复，请手动保留规则', '没有权限读取或保存忽略规则'])('preserves exactly whitelisted recovery errors: %s', async message => {
    const view = register()
    for (const operation of channels) {
      mocks[operation].mockRejectedValueOnce(new Error(message))
      await expect(view.invoke(operation)).rejects.toThrow(message)
      mocks[operation].mockRejectedValueOnce(new Error(`${message}: /private/secret.miraignore`))
      const error = await view.invoke(operation).catch(cause => cause as Error) as Error
      expect(error.message).toMatch(/操作失败.*重试/)
      expect(error.message).not.toContain('/private/')
    }
  })

  it('rejects a session with no usable directory', async () => {
    const view = register()
    view.sessions.set('personal-a', { projectId: undefined, workingDirectory: '' })
    for (const operation of channels) await expect(view.invoke(operation, sessionTarget)).rejects.toThrow('没有可用目录')
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it.each(['read', 'transform'] as const)('%s rechecks project and personal roots after completion', async operation => {
    for (const target of [projectTarget, sessionTarget]) {
      const view = register()
      const pending = deferred<unknown>()
      mocks[operation].mockReturnValueOnce(pending.promise)
      const request = view.invoke(operation, target)
      await Promise.resolve()
      if (target.kind === 'project') view.projects.set(target.id, { directory: '/private/replaced-project' })
      else view.sessions.set(target.id, { projectId: undefined, workingDirectory: '/private/replaced-personal' })
      pending.resolve(operation === 'read' ? document : { content: document.content })
      await expect(request).rejects.toThrow('工作目录已变化')
    }
  })

  it.each(['read', 'transform'] as const)('%s rejects results after sender destruction or database lookup failure', async operation => {
    for (const invalidation of ['destroyed', 'removed'] as const) {
      const view = register()
      const pending = deferred<unknown>()
      mocks[operation].mockReturnValueOnce(pending.promise)
      const request = view.invoke(operation)
      await Promise.resolve()
      if (invalidation === 'destroyed') view.sender.isDestroyed.mockReturnValue(true)
      else view.projects.delete(projectTarget.id)
      pending.resolve(operation === 'read' ? document : { content: document.content })
      const error = await request.catch(cause => cause as Error) as Error
      expect(error.message).not.toContain('/private/')
      expect(error.message).toMatch(invalidation === 'destroyed' ? /工作目录已变化/ : /操作失败.*重试/)
    }
  })

  it.each(['queued', 'commit'] as const)('passes write authorization that blocks changed roots or destroyed callers at %s time', async stage => {
    for (const invalidation of ['project-root', 'session-root', 'destroyed', 'subframe'] as const) {
      const view = register()
      const gate = deferred<void>()
      let committed = false
      let initialAuthorized = false
      mocks.write.mockImplementationOnce(async (_directory, _content, _revision, assertAuthorized: () => void) => {
        if (stage === 'commit') { assertAuthorized(); initialAuthorized = true }
        await gate.promise
        assertAuthorized()
        committed = true
        return document
      })
      const target = invalidation === 'session-root' ? sessionTarget : projectTarget
      const request = view.invoke('write', target)
      await Promise.resolve()
      expect(mocks.write).toHaveBeenLastCalledWith(expect.any(String), document.content, document.revision, expect.any(Function))
      expect(initialAuthorized).toBe(stage === 'commit')
      if (invalidation === 'project-root') view.projects.set(projectTarget.id, { directory: '/private/replaced-project' })
      else if (invalidation === 'session-root') view.sessions.set(sessionTarget.id, { projectId: undefined, workingDirectory: '/private/replaced-personal' })
      else if (invalidation === 'destroyed') view.sender.isDestroyed.mockReturnValue(true)
      else view.event.senderFrame.parent = {}
      gate.resolve()
      await expect(request).rejects.toThrow('工作目录已变化')
      expect(committed).toBe(false)
    }
  })

  it('rejects an already destroyed caller before invoking the file service', async () => {
    const view = register()
    view.sender.isDestroyed.mockReturnValue(true)
    for (const operation of channels) await expect(view.invoke(operation)).rejects.toThrow('工作目录已变化')
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.transform).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })
})
