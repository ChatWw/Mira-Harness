type TerminalSize = { columns: number; rows: number }

/** Fit once per frame and only send PTY sizes that changed. Hidden terminals return no size. */
export function createTerminalResizeScheduler(
  fit: () => TerminalSize | undefined,
  resize: (size: TerminalSize) => void,
  frame = { request: (callback: FrameRequestCallback) => requestAnimationFrame(callback), cancel: (id: number) => cancelAnimationFrame(id) },
) {
  let pending: number | undefined
  let previous: TerminalSize | undefined
  let disposed = false
  return {
    schedule() {
      if (disposed || pending !== undefined) return
      pending = frame.request(() => {
        pending = undefined
        if (disposed) return
        const size = fit()
        if (!size || size.columns < 1 || size.rows < 1 || size.columns === previous?.columns && size.rows === previous.rows) return
        previous = size
        resize(size)
      })
    },
    dispose() {
      disposed = true
      if (pending !== undefined) frame.cancel(pending)
      pending = undefined
    },
  }
}
