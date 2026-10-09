import { describe, expect, it, vi } from 'vitest'
import { createTerminalResizeScheduler } from '../apps/harness-react/src/lib/terminal-resize'

function fixture() {
  let nextId = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const frame = {
    request: vi.fn((callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId }),
    cancel: vi.fn((id: number) => { callbacks.delete(id) }),
  }
  let size: { columns: number; rows: number } | undefined = { columns: 80, rows: 24 }
  const fit = vi.fn(() => size)
  const resize = vi.fn()
  const scheduler = createTerminalResizeScheduler(fit, resize, frame)
  const flush = () => {
    const batch = [...callbacks.values()]
    callbacks.clear()
    batch.forEach(callback => callback(0))
  }
  return { scheduler, fit, resize, frame, flush, setSize: (value: typeof size) => { size = value } }
}

describe('React terminal resize scheduling', () => {
  it('coalesces drag events into the latest dimensions in one animation frame', () => {
    const { scheduler, fit, resize, frame, flush, setSize } = fixture()
    scheduler.schedule()
    setSize({ columns: 90, rows: 30 })
    scheduler.schedule()
    scheduler.schedule()
    expect(frame.request).toHaveBeenCalledOnce()
    expect(fit).not.toHaveBeenCalled()
    flush()
    expect(fit).toHaveBeenCalledOnce()
    expect(resize).toHaveBeenCalledExactlyOnceWith({ columns: 90, rows: 30 })
  })

  it('skips repeated sizes but sends changes in either rows or columns', () => {
    const { scheduler, resize, flush, setSize } = fixture()
    scheduler.schedule(); flush()
    scheduler.schedule(); flush()
    expect(resize).toHaveBeenCalledOnce()
    setSize({ columns: 81, rows: 24 })
    scheduler.schedule(); flush()
    setSize({ columns: 81, rows: 25 })
    scheduler.schedule(); flush()
    expect(resize.mock.calls.map(([size]) => size)).toEqual([
      { columns: 80, rows: 24 }, { columns: 81, rows: 24 }, { columns: 81, rows: 25 },
    ])
  })

  it('waits while hidden or waiting for a PTY, then sends the first visible size', () => {
    const { scheduler, resize, flush, setSize } = fixture()
    setSize(undefined)
    scheduler.schedule(); flush()
    expect(resize).not.toHaveBeenCalled()
    setSize({ columns: 80, rows: 24 })
    scheduler.schedule(); flush()
    expect(resize).toHaveBeenCalledExactlyOnceWith({ columns: 80, rows: 24 })
  })

  it('cancels a queued frame and never fits or resizes after cleanup', () => {
    const { scheduler, fit, resize, frame, flush } = fixture()
    scheduler.schedule()
    scheduler.dispose()
    scheduler.schedule()
    flush()
    expect(frame.cancel).toHaveBeenCalledOnce()
    expect(frame.request).toHaveBeenCalledOnce()
    expect(fit).not.toHaveBeenCalled()
    expect(resize).not.toHaveBeenCalled()
  })
})
