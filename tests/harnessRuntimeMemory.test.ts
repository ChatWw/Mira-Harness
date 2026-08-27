import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlatformDatabase } from '../electron/database'
import { HarnessRuntime, parseMemoryExtraction } from '../electron/harnessRuntime'

const roots: string[] = []

function createRuntime() {
  const root = mkdtempSync(join(tmpdir(), 'mira-runtime-memory-'))
  roots.push(root)
  const database = new PlatformDatabase(root)
  const sender = { isDestroyed: () => true, send: vi.fn() } as any
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any)
  return { root, database, runtime, sender }
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
})
