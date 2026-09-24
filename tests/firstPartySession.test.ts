import { describe, expect, it, vi } from 'vitest'
import { FirstPartyConnectionSession } from '../src/platform/firstPartySession'

function port() {
  return { close: vi.fn() }
}

describe('first-party frame session lifecycle', () => {
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
})
