import { afterEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '@earendil-works/pi-agent-core'
import { HarnessRuntime } from '../electron/services/harnessRuntime'

afterEach(() => vi.restoreAllMocks())

describe('runtime text streaming activity persistence', () => {
  it('persists activity transitions rather than every text fragment and still finalizes the full reply', async () => {
    const session: any = { id: 's', title: '测试', titleSource: 'manual', permissionMode: 'default', pendingInteraction: { kind: 'plan-review', status: 'waiting' }, messages: [{ id: 'u', role: 'user', content: '分析项目', createdAt: 1 }], toolCalls: [], createdAt: 1, updatedAt: 1 }
    const database: any = {
      memories: { enabled: () => false },
      getSnapshot: () => ({ preferences: {} }),
      instructions: { resolve: () => [] },
      harness: {
        updateSession: (value: any) => value,
        getSession: () => session,
        setActiveRun: vi.fn(), setStatus: vi.fn(),
        appendAssistantDelta: vi.fn((_id, content) => { session.messages.push({ id: 'a', role: 'assistant', content, createdAt: 2 }); return session }),
        finalizeAssistantMessage: vi.fn(() => session),
      },
    }
    const runtime = new HarnessRuntime(database, {} as any)
    vi.spyOn(runtime as any, 'compactContext').mockResolvedValue(session)
    vi.spyOn(runtime as any, 'tools').mockReturnValue({ tools: [], descriptors: new Map(), cancelPending: vi.fn() })
    vi.spyOn(runtime as any, 'environmentContext').mockReturnValue({})
    vi.spyOn(runtime as any, 'publishContextUsage').mockImplementation((_sender, value) => value)
    let notify!: (event: any) => void
    vi.spyOn(Agent.prototype, 'subscribe').mockImplementation(listener => { notify = listener; return () => {} })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async () => {
      for (let i = 0; i < 200; i++) notify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '文本' } })
    })
    const sender = { isDestroyed: () => false, send: vi.fn() }
    await (runtime as any).runAgent(sender, 's', session, { providerId: 'p', modelId: 'model' }, { id: 'p', name: 'test', endpoint: 'http://localhost:1', models: [{ id: 'model', reasoning: false }] }, 'unused', { planning: true })
    expect(database.harness.setActiveRun).toHaveBeenCalledTimes(3) // initial, answering, clear
    expect(database.harness.appendAssistantDelta).toHaveBeenCalledWith('s', '文本'.repeat(200), expect.objectContaining({ runId: expect.any(String), parts: [expect.objectContaining({ type: 'text', text: '文本'.repeat(200), state: 'complete' })] }))
    expect(database.harness.finalizeAssistantMessage).toHaveBeenCalledWith('s', expect.objectContaining({ content: '文本'.repeat(200), run: expect.objectContaining({ status: 'completed' }) }))
  })

  it('reminds the model once when a planning reply omits both interaction tools', async () => {
    const session: any = { id: 's', title: '测试', titleSource: 'manual', permissionMode: 'default', messages: [{ id: 'u', role: 'user', content: '先计划', createdAt: 1 }], toolCalls: [], createdAt: 1, updatedAt: 1 }
    const database: any = {
      memories: { enabled: () => false }, getSnapshot: () => ({ preferences: {} }), instructions: { resolve: () => [] },
      harness: { updateSession: (value: any) => value, getSession: () => session, setActiveRun: vi.fn(), setStatus: vi.fn(), appendAssistantDelta: vi.fn(), finalizeAssistantMessage: vi.fn(() => session) },
    }
    const runtime = new HarnessRuntime(database, {} as any)
    vi.spyOn(runtime as any, 'compactContext').mockResolvedValue(session)
    vi.spyOn(runtime as any, 'tools').mockReturnValue({ tools: [], descriptors: new Map(), cancelPending: vi.fn() })
    vi.spyOn(runtime as any, 'environmentContext').mockReturnValue({})
    vi.spyOn(runtime as any, 'publishContextUsage').mockImplementation((_sender, value) => value)
    vi.spyOn(Agent.prototype, 'subscribe').mockReturnValue(() => {})
    const prompt = vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async () => { if (prompt.mock.calls.length === 2) session.pendingInteraction = { kind: 'plan-review', status: 'waiting' } })

    await (runtime as any).runAgent({ isDestroyed: () => false, send: vi.fn() }, 's', session, { providerId: 'p', modelId: 'model' }, { id: 'p', name: 'test', endpoint: 'http://localhost:1', models: [{ id: 'model', reasoning: false }] }, 'unused', { planning: true })

    expect(prompt).toHaveBeenCalledTimes(2)
    expect(prompt.mock.calls[1][0]).toContain('调用 present_plan')
    expect(database.harness.finalizeAssistantMessage).toHaveBeenCalledWith('s', expect.objectContaining({ run: expect.objectContaining({ status: 'completed' }) }))
  })

  it('replaces a contradictory planning draft after the reminder creates an interaction', async () => {
    const session: any = { id: 's', title: '测试', titleSource: 'manual', permissionMode: 'default', messages: [{ id: 'u', role: 'user', content: '先计划', createdAt: 1 }], toolCalls: [], createdAt: 1, updatedAt: 1 }
    const database: any = {
      memories: { enabled: () => false }, getSnapshot: () => ({ preferences: {} }), instructions: { resolve: () => [] },
      harness: {
        updateSession: (value: any) => value, getSession: () => session, setActiveRun: vi.fn(), setStatus: vi.fn(),
        appendAssistantDelta: vi.fn(), finalizeAssistantMessage: vi.fn((_id, options) => { session.messages.push({ id: 'a', role: 'assistant', content: options.content, createdAt: 2, run: options.run }); return session }),
      },
    }
    const runtime = new HarnessRuntime(database, {} as any)
    vi.spyOn(runtime as any, 'compactContext').mockResolvedValue(session)
    vi.spyOn(runtime as any, 'tools').mockReturnValue({ tools: [], descriptors: new Map(), cancelPending: vi.fn() })
    vi.spyOn(runtime as any, 'environmentContext').mockReturnValue({})
    vi.spyOn(runtime as any, 'publishContextUsage').mockImplementation((_sender, value) => value)
    let notify!: (event: any) => void
    vi.spyOn(Agent.prototype, 'subscribe').mockImplementation(listener => { notify = listener; return () => {} })
    const prompt = vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async () => {
      if (prompt.mock.calls.length === 1) notify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '本轮不调用任何工具。' } })
      else session.pendingInteraction = { kind: 'plan-review', status: 'waiting' }
    })

    await (runtime as any).runAgent({ isDestroyed: () => false, send: vi.fn() }, 's', session, { providerId: 'p', modelId: 'model' }, { id: 'p', name: 'test', endpoint: 'http://localhost:1', models: [{ id: 'model', reasoning: false }] }, 'unused', { planning: true })

    expect(database.harness.finalizeAssistantMessage).toHaveBeenCalledWith('s', expect.objectContaining({ content: '方案已整理，请确认是否开始执行。' }))
    const finalized = database.harness.finalizeAssistantMessage.mock.calls.at(-1)![1]
    expect(finalized.parts.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('')).toBe(finalized.content)
  })

  it('fails planning rather than reporting success when the model still omits an interaction', async () => {
    const session: any = { id: 's', title: '测试', titleSource: 'manual', permissionMode: 'default', messages: [{ id: 'u', role: 'user', content: '先计划', createdAt: 1 }], toolCalls: [], createdAt: 1, updatedAt: 1 }
    const database: any = {
      memories: { enabled: () => false }, getSnapshot: () => ({ preferences: {} }), instructions: { resolve: () => [] },
      harness: { updateSession: (value: any) => value, getSession: () => session, setActiveRun: vi.fn(), setStatus: vi.fn(), appendAssistantDelta: vi.fn(), finalizeAssistantMessage: vi.fn(() => session) },
    }
    const runtime = new HarnessRuntime(database, {} as any)
    vi.spyOn(runtime as any, 'compactContext').mockResolvedValue(session)
    vi.spyOn(runtime as any, 'tools').mockReturnValue({ tools: [], descriptors: new Map(), cancelPending: vi.fn() })
    vi.spyOn(runtime as any, 'environmentContext').mockReturnValue({})
    vi.spyOn(Agent.prototype, 'subscribe').mockReturnValue(() => {})
    const prompt = vi.spyOn(Agent.prototype, 'prompt').mockResolvedValue(undefined)

    await expect((runtime as any).runAgent({ isDestroyed: () => false, send: vi.fn() }, 's', session, { providerId: 'p', modelId: 'model' }, { id: 'p', name: 'test', endpoint: 'http://localhost:1', models: [{ id: 'model', reasoning: false }] }, 'unused', { planning: true }))
      .rejects.toThrow('模型未提交可确认的计划或澄清问题')

    expect(prompt).toHaveBeenCalledTimes(2)
    expect(database.harness.finalizeAssistantMessage).toHaveBeenCalledWith('s', expect.objectContaining({ run: expect.objectContaining({ status: 'failed' }) }))
  })
})
