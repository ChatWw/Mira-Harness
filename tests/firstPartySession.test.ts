import { describe, expect, it, vi } from 'vitest'
import { FirstPartyConnectionSession } from '../src/platform/firstPartySession'

function port() {
  return { close: vi.fn() }
}

describe('first-party frame session lifecycle', () => {
  it('forwards workspace changes only to their active grant and port', () => {
    const session = new FirstPartyConnectionSession(vi.fn())
    const activePort = port()
    session.activate(session.begin(), 'grant-1', activePort)
    const changed = { type: 'workspace-files-changed', payload: { grantId: 'grant-1' } }
    expect(session.canForwardHarnessEvent('grant-1', activePort, changed)).toBe(true)
    expect(session.canForwardHarnessEvent('grant-1', port(), changed)).toBe(false)
    expect(session.canForwardHarnessEvent('grant-1', activePort, { ...changed, payload: { grantId: 'grant-2' } })).toBe(false)
    expect(session.canForwardHarnessEvent('grant-1', activePort, { ...changed, payload: {} })).toBe(false)
    expect(session.canForwardHarnessEvent('grant-1', activePort, { type: 'message-delta', payload: { delta: 'hello' } })).toBe(true)
    session.invalidate()
    expect(session.canForwardHarnessEvent('grant-1', activePort, changed)).toBe(false)
  })

  it('closes and revokes the previous session before activating a replacement', () => {
    const revoke = vi.fn()
    const session = new FirstPartyConnectionSession(revoke)
    const firstPort = port()
    const firstGeneration = session.begin()
    expect(session.activate(firstGeneration, 'grant-1', firstPort)).toBe(true)

    const secondGeneration = session.begin()
    expect(firstPort.close).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('grant-1')
    expect(session.isActive('grant-1', firstPort)).toBe(false)

    const secondPort = port()
    expect(session.activate(secondGeneration, 'grant-2', secondPort)).toBe(true)
    expect(session.isActive('grant-2', secondPort)).toBe(true)
  })

  it('rejects a late async grant after the frame has been invalidated', () => {
    const revoke = vi.fn()
    const session = new FirstPartyConnectionSession(revoke)
    const staleGeneration = session.begin()
    session.begin()
    const stalePort = port()
    expect(session.activate(staleGeneration, 'stale-grant', stalePort)).toBe(false)
    expect(stalePort.close).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalledWith('stale-grant')
  })

  it('revokes the active grant when the frame is unmounted', () => {
    const revoke = vi.fn()
    const session = new FirstPartyConnectionSession(revoke)
    const activePort = port()
    const generation = session.begin()
    session.activate(generation, 'grant-1', activePort)
    session.invalidate()
    expect(activePort.close).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('grant-1')
    expect(session.isActive('grant-1', activePort)).toBe(false)
  })

  it('requires a matching successful draft-save acknowledgement before leaving', async () => {
    const session = new FirstPartyConnectionSession(vi.fn())
    session.activate(session.begin(), 'grant-1', port())
    const send = vi.fn()
    const leaving = session.prepareLeave(send)
    const request = send.mock.calls[0][0]
    expect(request).toMatchObject({ type: 'mira:prepare-leave' })
    expect(session.receiveLeaveReady({ type: 'mira:response', id: request.id, ok: true })).toBe(false)
    expect(session.receiveLeaveReady({ type: 'mira:leave-ready', id: request.id, ok: 'yes' })).toBe(true)
    session.receiveLeaveReady({ type: 'mira:leave-ready', id: 'unrelated', ok: true })
    session.receiveLeaveReady({ type: 'mira:leave-ready', id: request.id, ok: true })
    await expect(leaving).resolves.toBeUndefined()
    session.invalidate()
  })

  it('propagates draft-save failure and rejects when no live authorized frame exists', async () => {
    const session = new FirstPartyConnectionSession(vi.fn())
    await expect(session.prepareLeave(vi.fn())).rejects.toThrow('连接尚未就绪')
    session.activate(session.begin(), 'grant-1', port())
    const send = vi.fn()
    const leaving = session.prepareLeave(send)
    const assertion = expect(leaving).rejects.toThrow('草稿超过保存上限')
    session.receiveLeaveReady({ type: 'mira:leave-ready', id: send.mock.calls[0][0].id, ok: false, error: '草稿超过保存上限' })
    await assertion
    session.invalidate()
  })

  it('times out without permission to leave and ignores a late acknowledgement', async () => {
    vi.useFakeTimers()
    try {
      const session = new FirstPartyConnectionSession(vi.fn())
      session.activate(session.begin(), 'grant-1', port())
      const send = vi.fn()
      const leaving = session.prepareLeave(send)
      const assertion = expect(leaving).rejects.toThrow('保存确认超时')
      await vi.advanceTimersByTimeAsync(5000)
      await assertion
      session.receiveLeaveReady({ type: 'mira:leave-ready', id: send.mock.calls[0][0].id, ok: true })
      expect(vi.getTimerCount()).toBe(0)
      session.invalidate()
    } finally { vi.useRealTimers() }
  })

  it('rejects pending leave requests and clears their timeouts when the frame is invalidated', async () => {
    vi.useFakeTimers()
    try {
      const session = new FirstPartyConnectionSession(vi.fn())
      session.activate(session.begin(), 'grant-1', port())
      const first = expect(session.prepareLeave(vi.fn())).rejects.toThrow('连接已失效')
      const second = expect(session.prepareLeave(vi.fn())).rejects.toThrow('连接已失效')
      session.invalidate()
      await Promise.all([first, second])
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('fails immediately if the message port cannot send the leave request', async () => {
    const session = new FirstPartyConnectionSession(vi.fn())
    session.activate(session.begin(), 'grant-1', port())
    await expect(session.prepareLeave(() => { throw new Error('端口已关闭') })).rejects.toThrow('端口已关闭')
    session.invalidate()
  })
})
