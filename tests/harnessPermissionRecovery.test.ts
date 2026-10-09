import { describe, expect, it, vi } from 'vitest'
import { HarnessPermissionPolicy } from '../electron/services/harnessPermissionPolicy'
import type { ToolDescriptor } from '../electron/services/harnessPermissionPolicy'

const descriptors = new Map<string, ToolDescriptor>([['write', { risk: 'write', title: () => '写入文件', detail: () => 'draft.md' }]])

describe('pending Harness permissions', () => {
  it('lists only live requests for the selected session and removes resolved requests', async () => {
    const publish = vi.fn()
    const database = { harness: { getPermissionConfig: () => ({ globalDefaultMode: 'default', dangerousCommands: [] }) } }
    const policy = new HarnessPermissionPolicy(database as any, publish)
    const first = policy.preflight(undefined, 'session-a', descriptors, 'write', {})
    const second = policy.preflight(undefined, 'session-b', descriptors, 'write', {})
    const [request] = policy.listPending('session-a')
    expect(policy.listPending('session-b')).toHaveLength(1)
    expect(request).toMatchObject({ sessionId: 'session-a', title: '写入文件', detail: 'draft.md' })
    policy.resolve(request.requestId, true)
    expect(policy.listPending('session-a')).toEqual([])
    expect(await first).toBeUndefined()
    policy.resolve(policy.listPending('session-b')[0].requestId, false)
    expect(await second).toMatchObject({ block: true })
  })

  it('removes requests that time out', async () => {
    vi.useFakeTimers()
    try {
      const publish = vi.fn()
      const database = { harness: { getPermissionConfig: () => ({ globalDefaultMode: 'default', dangerousCommands: [] }) } }
      const policy = new HarnessPermissionPolicy(database as any, publish)
      const result = policy.preflight(undefined, 'session-a', descriptors, 'write', {})
      expect(policy.listPending('session-a')).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(policy.listPending('session-a')).toEqual([])
      expect(await result).toMatchObject({ block: true })
    } finally { vi.useRealTimers() }
  })

  it('cancels a stopped run immediately, ignores late approval and leaves other runs pending', async () => {
    vi.useFakeTimers()
    try {
      const publish = vi.fn()
      const database = { harness: { getPermissionConfig: () => ({ globalDefaultMode: 'default', dangerousCommands: [] }) } }
      const policy = new HarnessPermissionPolicy(database as any, publish)
      const stopped = new AbortController(), other = new AbortController()
      const first = policy.preflight(undefined, 'session-a', descriptors, 'write', {}, false, undefined, stopped.signal)
      const second = policy.preflight(undefined, 'session-b', descriptors, 'write', {}, false, undefined, other.signal)
      const requestId = policy.listPending('session-a')[0].requestId
      stopped.abort()
      expect(await first).toMatchObject({ block: true, reason: '运行已停止' })
      expect(policy.listPending('session-a')).toEqual([])
      expect(policy.listPending('session-b')).toHaveLength(1)
      policy.resolve(requestId, true)
      expect(vi.getTimerCount()).toBe(1)
      policy.resolve(policy.listPending('session-b')[0].requestId, true)
      expect(await second).toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
      expect(publish.mock.calls.filter(([, event]) => event.type === 'error')).toEqual([])
    } finally { vi.useRealTimers() }
  })

  it('never approves or publishes a request when the run is already stopped', async () => {
    const publish = vi.fn()
    const database = { harness: { getPermissionConfig: () => ({ globalDefaultMode: 'full', dangerousCommands: [] }) } }
    const policy = new HarnessPermissionPolicy(database as any, publish)
    const controller = new AbortController()
    controller.abort()
    await expect(policy.preflight(undefined, 's', descriptors, 'write', {}, false, 'full', controller.signal)).resolves.toMatchObject({ block: true, reason: '运行已停止' })
    expect(publish).not.toHaveBeenCalled()
  })
})
