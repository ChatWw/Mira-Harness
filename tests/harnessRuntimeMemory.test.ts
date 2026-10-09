import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessRuntime, parseMemoryExtraction } from '../electron/services/harnessRuntime'
import type { HarnessEvent } from '../src/config/harness'

const roots: string[] = []

function createRuntime() {
  const root = mkdtempSync(join(tmpdir(), 'mira-runtime-memory-'))
  roots.push(root)
  const database = new PlatformDatabase(root)
  const sender = { isDestroyed: () => true, send: vi.fn() } as any
  const events: HarnessEvent[] = []
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any, event => events.push(event))
  return { root, database, runtime, sender, events }
}

function memoryTool(runtime: HarnessRuntime, sender: any, sessionId: string, name: string) {
  return (runtime as any).tools(sender, sessionId).tools.find((tool: { name: string }) => tool.name === name)
}

afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) )

describe('HarnessRuntime file memory tools', () => {
  it('accepts a non-JSON model summary as a memory candidate', () => {
    expect(parseMemoryExtraction('## Goal\n- Keep replies in Chinese')).toEqual({
      decision: 'save',
      sensitivity: 'none',
      content: '## Goal\n- Keep replies in Chinese',
    })
  })

  it('rejects explicit project-memory saves when memory is disabled or the session has no project', async () => {
    const { database, runtime, sender } = createRuntime()
    const temporary = database.harness.createSession()

    await expect(runtime.saveProjectMemory(sender, temporary.id, { providerId: 'missing', modelId: 'missing' })).rejects.toThrow('请先在个性化设置中启用记忆')
    database.memories.setEnabled(true)
    await expect(runtime.saveProjectMemory(sender, temporary.id, { providerId: 'missing', modelId: 'missing' })).rejects.toThrow('请先选择项目')
    database.close()
  })

  it('does not derive project memory before the conversation has a complete exchange', async () => {
    const { root, database, runtime, sender } = createRuntime()
    database.memories.setEnabled(true)
    const directory = join(root, 'project')
    mkdirSync(directory)
    const project = database.harness.createProject(directory, '测试项目')
    const session = database.harness.createSession(project.id)

    await expect(runtime.saveProjectMemory(sender, session.id)).rejects.toThrow('当前对话还没有可保存的内容')

    database.close()
  })

  it('only exposes memory tools when file memory is enabled', () => {
    const { database, runtime, sender } = createRuntime()
    const session = database.harness.createSession()

    expect(memoryTool(runtime, sender, session.id, 'remember_memory')).toBeUndefined()
    database.memories.setEnabled(true)
    expect(memoryTool(runtime, sender, session.id, 'search_memory')).toBeDefined()
    expect(memoryTool(runtime, sender, session.id, 'remember_memory')).toBeDefined()
    expect(memoryTool(runtime, sender, session.id, 'forget_memory')).toBeDefined()
    database.close()
  })

  it('writes, searches, and deletes in the requested scope without falling back from a temporary session', async () => {
    const { root, database, runtime, sender } = createRuntime()
    database.memories.setEnabled(true)
    const temporary = database.harness.createSession()
    const remember = memoryTool(runtime, sender, temporary.id, 'remember_memory')
    const search = memoryTool(runtime, sender, temporary.id, 'search_memory')
    const forget = memoryTool(runtime, sender, temporary.id, 'forget_memory')

    await remember.execute('remember-global', { scope: 'global', content: '用户偏好使用中文回复' })
    const found = await search.execute('search-global', { scope: 'global', query: '中文' })
    expect(found.content[0].text).toContain('用户偏好使用中文回复')
    const [entry] = database.memories.search('global', '中文')
    await forget.execute('forget-global', { scope: 'global', id: entry.id })
    expect(database.memories.search('global', '中文')).toEqual([])
    await expect(remember.execute('remember-project', { scope: 'project', content: '不能降级保存' })).rejects.toThrow('临时会话')

    const directory = join(root, 'project')
    mkdirSync(directory)
    const project = database.harness.createProject(directory, '测试项目')
    const projectSession = database.harness.createSession(project.id)
    const projectRemember = memoryTool(runtime, sender, projectSession.id, 'remember_memory')
    await projectRemember.execute('remember-project', { scope: 'project', content: '项目采用 Vitest' })
    expect(database.memories.search('project', 'Vitest', project.id)).toHaveLength(1)
    expect(database.memories.search('global', 'Vitest')).toEqual([])
    database.close()
  })

  it('blocks real secrets without persisting them while keeping technical memory terms usable', async () => {
    const { database, runtime, sender } = createRuntime()
    database.memories.setEnabled(true)
    const session = database.harness.createSession()
    const remember = memoryTool(runtime, sender, session.id, 'remember_memory')

    const blocked = await remember.execute('remember-secret', { scope: 'global', content: 'apiKey=abcdefghijklmnopqrstuvwx' })
    expect(blocked.content[0].text).toContain('不能将这类敏感信息保存')
    expect(database.memories.list('global')).toEqual([])
    await remember.execute('remember-term', { scope: 'global', content: '项目使用 token 作为分页标记' })
    expect(database.memories.list('global')).toHaveLength(1)
    database.close()
  })

  it('retries persisted safe candidates without rerunning the conversation', async () => {
    const { database, runtime } = createRuntime()
    database.memories.savePending({ id: 'candidate-1', sessionId: 'missing-session', scope: 'global', source: 'explicit', decision: 'save', sensitivity: 'none', content: '用户偏好专业回复', status: 'failed', error: 'temporary', createdAt: 1, updatedAt: 1 })
    await runtime.retryMemory('candidate-1')
    expect(database.memories.search('global', '专业')).toHaveLength(1)
    expect(database.memories.listPending()).toEqual([])
    database.close()
  })

  it('cancels sensitive confirmation immediately and ignores late approval', async () => {
    vi.useFakeTimers()
    const { database, runtime, sender, events } = createRuntime()
    try {
      database.memories.setEnabled(true)
      const session = database.harness.createSession()
      const remember = memoryTool(runtime, sender, session.id, 'remember_memory')
      const controller = new AbortController()
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
      const result = remember.execute('remember-personal', { scope: 'global', content: '用户邮箱为 test@example.com' }, controller.signal)
      const request = events.find(event => event.payload.status === 'needs_confirmation')!
      expect(database.memories.listPending()).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(1)

      controller.abort()

      expect(database.memories.listPending()).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(events.filter(event => event.payload.status === 'rejected')).toEqual([
        expect.objectContaining({ sessionId: session.id, type: 'memory-status', payload: expect.objectContaining({ requestId: request.payload.requestId, candidateId: request.payload.candidateId, status: 'rejected' }) }),
      ])
      expect(await result).toMatchObject({ details: { status: 'rejected' } })
      runtime.respondMemoryConfirmation(String(request.payload.requestId), true)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(database.memories.list('global')).toEqual([])
      expect(database.memories.listPending()).toEqual([])
      expect(events.filter(event => event.payload.status === 'rejected')).toHaveLength(1)
      expect(events.some(event => ['saved', 'failed'].includes(String(event.payload.status)))).toBe(false)
    } finally { database.close(); vi.useRealTimers() }
  })

  it('does not save when approval is followed by cancellation before resuming execution', async () => {
    vi.useFakeTimers()
    const { database, runtime, sender, events } = createRuntime()
    try {
      database.memories.setEnabled(true)
      const session = database.harness.createSession()
      const controller = new AbortController()
      const remember = memoryTool(runtime, sender, session.id, 'remember_memory')
      const result = remember.execute('remember-personal', { scope: 'global', content: '用户邮箱为 test@example.com' }, controller.signal)
      const request = events.find(event => event.payload.status === 'needs_confirmation')!

      runtime.respondMemoryConfirmation(String(request.payload.requestId), true)
      controller.abort()

      expect(await result).toMatchObject({ details: { status: 'rejected' } })
      expect(database.memories.list('global')).toEqual([])
      expect(database.memories.listPending()).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
      expect(events.filter(event => event.payload.status === 'rejected')).toEqual([
        expect.objectContaining({ payload: expect.objectContaining({ requestId: request.payload.requestId, status: 'rejected' }) }),
      ])
    } finally { database.close(); vi.useRealTimers() }
  })

  it.each(['用户邮箱为 test@example.com', '用户偏好中文回复'])('does not persist an already cancelled memory tool: %s', async content => {
    vi.useFakeTimers()
    const { database, runtime, sender, events } = createRuntime()
    try {
      database.memories.setEnabled(true)
      const session = database.harness.createSession()
      const controller = new AbortController()
      controller.abort()
      const remember = memoryTool(runtime, sender, session.id, 'remember_memory')

      const result = remember.execute('remember-cancelled', { scope: 'global', content }, controller.signal)

      expect(events).toEqual([])
      await expect(result).rejects.toMatchObject({ name: 'AbortError' })
      expect(database.memories.list('global')).toEqual([])
      expect(database.memories.listPending()).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
    } finally { database.close(); vi.useRealTimers() }
  })

  it('only cancels the stopped session and lets another session approve its memory', async () => {
    vi.useFakeTimers()
    const { database, runtime, sender, events } = createRuntime()
    try {
      database.memories.setEnabled(true)
      const first = database.harness.createSession(), second = database.harness.createSession()
      const stopped = new AbortController(), other = new AbortController()
      const result = memoryTool(runtime, sender, first.id, 'remember_memory').execute('remember-a', { scope: 'global', content: '用户邮箱为 test@example.com' }, stopped.signal)
      const otherResult = memoryTool(runtime, sender, second.id, 'remember_memory').execute('remember-b', { scope: 'global', content: '同事邮箱为 second@example.com' }, other.signal)
      const request = events.find(event => event.sessionId === second.id && event.payload.status === 'needs_confirmation')!

      stopped.abort()

      expect(database.memories.listPending()).toEqual([expect.objectContaining({ sessionId: second.id, status: 'needs_confirmation' })])
      expect(await result).toMatchObject({ details: { status: 'rejected' } })
      expect(vi.getTimerCount()).toBe(1)
      runtime.respondMemoryConfirmation(String(request.payload.requestId), true)
      expect(await otherResult).toMatchObject({ details: { created: true } })
      expect(database.memories.list('global')).toEqual([expect.objectContaining({ content: '同事邮箱为 [邮箱]', sourceSessionId: second.id })])
      expect(database.memories.listPending()).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
    } finally { database.close(); vi.useRealTimers() }
  })

  it.each([true, false])('cleans confirmation timers and listeners after a normal response: %s', async approved => {
    vi.useFakeTimers()
    const { database, runtime, sender, events } = createRuntime()
    try {
      database.memories.setEnabled(true)
      const session = database.harness.createSession()
      const controller = new AbortController()
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
      const result = memoryTool(runtime, sender, session.id, 'remember_memory').execute('remember-personal', { scope: 'global', content: '用户邮箱为 test@example.com' }, controller.signal)
      const request = events.find(event => event.payload.status === 'needs_confirmation')!

      runtime.respondMemoryConfirmation(String(request.payload.requestId), approved)

      expect(await result).toMatchObject({ details: approved ? { created: true } : { status: 'rejected' } })
      expect(database.memories.list('global')).toHaveLength(approved ? 1 : 0)
      expect(database.memories.listPending()).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
      const completed = [...events]
      controller.abort()
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(events).toEqual(completed)
    } finally { database.close(); vi.useRealTimers() }
  })

  it('cleans timed-out confirmation and ignores subsequent cancellation or approval', async () => {
    vi.useFakeTimers()
    const { database, runtime, sender, events } = createRuntime()
    try {
      database.memories.setEnabled(true)
      const session = database.harness.createSession()
      const controller = new AbortController()
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
      const result = memoryTool(runtime, sender, session.id, 'remember_memory').execute('remember-personal', { scope: 'global', content: '用户邮箱为 test@example.com' }, controller.signal)
      const request = events.find(event => event.payload.status === 'needs_confirmation')!

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

      expect(await result).toMatchObject({ details: { status: 'rejected' } })
      expect(database.memories.listPending()).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(events.filter(event => event.payload.status === 'rejected')).toEqual([
        expect.objectContaining({ payload: expect.objectContaining({ requestId: request.payload.requestId, reason: '确认超时' }) }),
      ])
      controller.abort()
      runtime.respondMemoryConfirmation(String(request.payload.requestId), true)
      expect(database.memories.list('global')).toEqual([])
      expect(events.filter(event => event.payload.status === 'rejected')).toHaveLength(1)
    } finally { database.close(); vi.useRealTimers() }
  })
})
