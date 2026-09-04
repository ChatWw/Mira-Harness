import { describe, expect, it, vi } from 'vitest'
import { finalizeAssistantCitations, HarnessRuntime, sourcesFromWebToolResult } from '../electron/harnessRuntime'

function setup(permissionMode: 'default' | 'auto-approve' | 'full' = 'default') {
  const sender = { isDestroyed: () => false, send: vi.fn() }
  const database = {
    memories: { enabled: () => false },
    harness: {
      getSession: () => ({ permissionMode }),
      getPermissionConfig: () => ({ dangerousCommands: [' shutdown '] }),
      recordTool: vi.fn(), updateTool: vi.fn(),
    },
  }
  const mcpManager = {
    getTools: () => [{ name: 'mcp_query', label: 'mcp_query', miraMcpServerName: '测试 MCP', execute: vi.fn() }],
  }
  const runtime = new HarnessRuntime(database as any, mcpManager as any)
  const registered = (runtime as any).tools(sender, 'session-1')
  return { runtime, sender, registered }
}

describe('HarnessRuntime tool approval', () => {
  it('normalizes only valid web citation details', () => {
    expect(sourcesFromWebToolResult('web_search', { details: { results: [
      { index: 2, title: ' 第二条 ', url: 'https://example.com/2', snippet: ' 摘要 ' },
      { index: 1, title: '', url: 'https://example.com/1' },
      { index: 3, title: '本地文件', url: 'file:///tmp/a' },
    ] } })).toEqual([
      { index: 2, title: '第二条', url: 'https://example.com/2', snippet: '摘要' },
      { index: 1, title: 'https://example.com/1', url: 'https://example.com/1' },
    ])
    expect(sourcesFromWebToolResult('web_fetch', { details: { index: 3, url: 'https://example.com/page' } })).toEqual([
      { index: 3, title: 'https://example.com/page', url: 'https://example.com/page' },
    ])
    expect(sourcesFromWebToolResult('read', { details: { index: 4, url: 'https://example.com' } })).toEqual([])
  })

  it('keeps only cited sources and assigns display indexes by citation order', () => {
    const result = finalizeAssistantCitations(
      '**第一条新闻**\n\n这是第一条的总结。[[source:8]]\n\n**第二条新闻**\n\n这是第二条的总结。[[source:3]]',
      [
        { index: 3, title: '候选三', url: 'https://example.com/3', snippet: '原摘要三' },
        { index: 8, title: '候选八', url: 'https://example.com/8', snippet: '原摘要八' },
        { index: 12, title: '未引用候选', url: 'https://example.com/12' },
      ],
    )

    expect(result.content).toContain('这是第一条的总结。[1]')
    expect(result.content).toContain('这是第二条的总结。[2]')
    expect(result.sources).toEqual([
      { index: 1, title: '第一条新闻', url: 'https://example.com/8', snippet: '这是第一条的总结。' },
      { index: 2, title: '第二条新闻', url: 'https://example.com/3', snippet: '这是第二条的总结。' },
    ])
  })

  it('leaves missing source markers untouched instead of binding a wrong link', () => {
    expect(finalizeAssistantCitations('无法确认。[[source:99]]', [{ index: 1, title: '来源', url: 'https://example.com' }])).toEqual({
      content: '无法确认。[[source:99]]',
      sources: [],
    })
  })

  it('assigns each answer item its own display citation even when they share a source page', () => {
    const result = finalizeAssistantCitations(
      '1. **第一条新闻** —— 第一条总结。[[source:1]]\n\n2. **第二条新闻** —— 第二条总结。[[source:1]]\n\n3. **第三条新闻** —— 第三条总结。[[source:1]]',
      [{ index: 1, title: '聚合页', url: 'https://example.com' }],
    )
    expect(result.content).toContain('第一条总结。[1]')
    expect(result.content).toContain('第二条总结。[2]')
    expect(result.content).toContain('第三条总结。[3]')
    expect(result.sources).toEqual([
      { index: 1, title: '第一条新闻', url: 'https://example.com', snippet: '第一条新闻 —— 第一条总结。' },
      { index: 2, title: '第二条新闻', url: 'https://example.com', snippet: '第二条新闻 —— 第二条总结。' },
      { index: 3, title: '第三条新闻', url: 'https://example.com', snippet: '第三条新闻 —— 第三条总结。' },
    ])
  })

  it('does not inject MCP tools for sessions without selected services', () => {
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const getTools = vi.fn(() => [])
    const database = {
      memories: { enabled: () => false },
      harness: {
        getSession: () => ({ permissionMode: 'default' }),
        getPermissionConfig: () => ({ dangerousCommands: [] }),
        recordTool: vi.fn(), updateTool: vi.fn(),
      },
    }
    const runtime = new HarnessRuntime(database as any, { getTools } as any)

    ;(runtime as any).tools(sender, 'session-1')

    expect(getTools).toHaveBeenCalledWith([])
  })

  it('only asks the MCP manager for tools selected by the current session', () => {
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const getTools = vi.fn(() => [{ name: 'mcp_query', label: 'mcp_query', miraMcpServerName: '测试 MCP', execute: vi.fn() }])
    const database = {
      memories: { enabled: () => false },
      harness: {
        getSession: () => ({ permissionMode: 'default', activeMcpServerIds: ['filesystem'] }),
        getPermissionConfig: () => ({ dangerousCommands: [] }),
        recordTool: vi.fn(), updateTool: vi.fn(),
      },
    }
    const runtime = new HarnessRuntime(database as any, { getTools } as any)

    ;(runtime as any).tools(sender, 'session-1')

    expect(getTools).toHaveBeenCalledWith(['filesystem'])
  })

  it('allows read and web tools by default, but requests approval for writes and MCP', async () => {
    const { runtime, sender, registered } = setup()
    const preflight = (name: string, args: unknown) => (runtime as any).preflightToolCall(sender, 'session-1', registered.descriptors, name, args)

    await expect(preflight('read', { path: 'README.md' })).resolves.toBeUndefined()
    await expect(preflight('web_search', { query: 'PI Agent' })).resolves.toBeUndefined()
    const pending = preflight('mcp_query', { token: 'secret-value', query: 'hello' })
    const request = sender.send.mock.calls.at(-1)?.[1].payload
    expect(request.title).toContain('mcp_query')
    expect(request.detail).toContain('测试 MCP / mcp_query')
    expect(request.detail).toContain('token=***')
    ;(runtime as any).resolvePermission(request.requestId, true)
    await expect(pending).resolves.toBeUndefined()
  })

  it('keeps dangerous bash commands blocked in every permission mode', async () => {
    const { runtime, sender, registered } = setup('full')
    await expect((runtime as any).preflightToolCall(sender, 'session-1', registered.descriptors, 'bash', { command: 'rm -rf build' }))
      .resolves.toEqual({ block: true, reason: '危险命令已被永久拦截' })
  })

  it('registers set_plan as an auto-approved read tool', async () => {
    const { runtime, sender, registered } = setup()
    const planTool = registered.tools.find((tool: any) => tool.name === 'set_plan')
    expect(planTool).toBeTruthy()
    expect(registered.descriptors.get('set_plan')?.risk).toBe('read')
    await expect((runtime as any).preflightToolCall(sender, 'session-1', registered.descriptors, 'set_plan', { steps: [{ label: '读取配置' }] }))
      .resolves.toBeUndefined()
  })

  it('set_plan.execute is a no-op that returns a confirmation', async () => {
    const { registered } = setup()
    const planTool = registered.tools.find((tool: any) => tool.name === 'set_plan')
    const result = await planTool.execute('plan-id', { steps: [{ label: '读取配置' }] })
    expect(result.content?.[0]?.text).toContain('计划已记录')
  })

  it('limits planning to read and interaction tools, then terminates after presenting a plan', async () => {
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const activePlan = { id: 'plan-1', status: 'planning', request: '规划改动', understanding: '', steps: [], risks: [], createdAt: 1, updatedAt: 1 }
    const database = {
      memories: { enabled: () => true },
      harness: {
        getSession: () => ({ permissionMode: 'default', activePlan }),
        getPermissionConfig: () => ({ dangerousCommands: [] }),
        recordTool: vi.fn(), updateTool: vi.fn(), setActivePlan: vi.fn(), setPendingInteraction: vi.fn(),
      },
    }
    const runtime = new HarnessRuntime(database as any, { getTools: () => [{ name: 'mcp_query', execute: vi.fn() }] } as any)
    const registered = (runtime as any).tools(sender, 'session-1', { planning: true })

    expect(registered.tools.map((tool: any) => tool.name)).toEqual(['read', 'list_files', 'web_fetch', 'web_search', 'ask_user', 'present_plan'])
    const result = await registered.tools.find((tool: any) => tool.name === 'present_plan').execute('review-1', { understanding: '只读分析范围', steps: [{ label: '修改运行时' }] })
    expect(result.terminate).toBe(true)
    expect(database.harness.setActivePlan).toHaveBeenCalledWith('session-1', expect.objectContaining({ status: 'awaiting_confirmation' }))
    expect(database.harness.setPendingInteraction).toHaveBeenCalledWith('session-1', expect.objectContaining({ kind: 'plan-review', status: 'waiting' }))
  })

  it('accepts planning questions without model-supplied identifiers', async () => {
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const activePlan = { id: 'plan-1', status: 'planning', request: '规划改动', understanding: '', steps: [], risks: [], createdAt: 1, updatedAt: 1 }
    const database = {
      memories: { enabled: () => false },
      harness: {
        getSession: () => ({ permissionMode: 'default', activePlan }),
        getPermissionConfig: () => ({ dangerousCommands: [] }),
        recordTool: vi.fn(), updateTool: vi.fn(), updatePlan: vi.fn(), setPendingInteraction: vi.fn(),
      },
    }
    const runtime = new HarnessRuntime(database as any, { getTools: () => [] } as any)
    const ask = (runtime as any).tools(sender, 'session-1', { planning: true }).tools.find((tool: any) => tool.name === 'ask_user')

    const result = await ask.execute('question-1', { questions: '这次优先解决稳定性还是功能扩展？' })

    expect(database.harness.setPendingInteraction).toHaveBeenCalledWith('session-1', expect.objectContaining({ kind: 'question', questions: [expect.objectContaining({ id: 'question-1', question: '这次优先解决稳定性还是功能扩展？' })] }))
    expect(result.terminate).toBe(true)
  })

  it('runs the planning agent with the persisted plan instead of the pre-plan session snapshot', async () => {
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const existingSession = { id: 'session-1', messages: [{ role: 'user', content: '规划这项改动' }], permissionMode: 'default' }
    const persistedSession = { ...existingSession, activePlan: expect.objectContaining({ status: 'planning', request: '规划这项改动' }) }
    const database = {
      memories: { enabled: () => false },
      harness: {
        resolveMessageAttachments: vi.fn(() => []),
        addMessage: vi.fn(() => existingSession),
        setActivePlan: vi.fn((_id, plan) => ({ ...existingSession, activePlan: plan })),
      },
    }
    const runtime = new HarnessRuntime(database as any, { getTools: () => [] } as any)
    vi.spyOn(runtime as any, 'requireProvider').mockReturnValue({ provider: { id: 'provider-1' }, apiKey: 'key' })
    const runAgent = vi.spyOn(runtime as any, 'runAgent').mockResolvedValue({ content: '' })

    await runtime.runMessage(sender as any, 'session-1', '规划这项改动', [], { providerId: 'provider-1', modelId: 'model-1' } as any, true)

    expect(database.harness.setActivePlan).toHaveBeenCalledWith('session-1', expect.objectContaining({ status: 'planning', request: '规划这项改动' }))
    expect(runAgent).toHaveBeenCalledWith(sender, 'session-1', persistedSession, expect.anything(), expect.anything(), 'key', { planning: true })
  })
})
