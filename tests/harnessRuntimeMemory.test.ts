import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlatformDatabase } from '../electron/database'
import { HarnessRuntime } from '../electron/harnessRuntime'

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
})
