import { afterEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '@earendil-works/pi-agent-core'
import { HarnessRuntime } from '../electron/services/harnessRuntime'

afterEach(() => vi.restoreAllMocks())

describe('runtime text streaming activity persistence', () => {
  it('persists activity transitions rather than every text fragment and still finalizes the full reply', async () => {
    const session: any = { id: 's', title: '测试', titleSource: 'manual', permissionMode: 'default', messages: [{ id: 'u', role: 'user', content: '分析项目', createdAt: 1 }], toolCalls: [], createdAt: 1, updatedAt: 1 }
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
    vi.spyOn(runtime as any, 'tools').mockReturnValue({ tools: [], descriptors: new Map() })
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
    expect(database.harness.appendAssistantDelta).toHaveBeenCalledWith('s', '文本'.repeat(200))
    expect(database.harness.finalizeAssistantMessage).toHaveBeenCalledWith('s', expect.objectContaining({ content: '文本'.repeat(200), run: expect.objectContaining({ status: 'completed' }) }))
  })
})
