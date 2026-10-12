// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MiraPdfReader from '../apps/harness-react/src/components/workspace/MiraPdfReader'

const pdf = vi.hoisted(() => ({ create: vi.fn(), destroy: vi.fn() }))
vi.mock('react-pdf', () => ({ pdfjs: { GlobalWorkerOptions: {}, PDFWorker: { create: pdf.create } }, Document: ({ children }: any) => <div data-document>{children}</div>, Page: () => null }))
class ReaderWorker {
  static current: ReaderWorker
  onmessage: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminate = vi.fn()
  constructor() { ReaderWorker.current = this }
}
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('Worker', ReaderWorker)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mira-pdf-worker'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => undefined)
  pdf.create.mockReset().mockImplementation(() => ({ destroy: pdf.destroy })); pdf.destroy.mockClear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('sandbox PDF dedicated worker startup', () => {
  it('ignores the library ready event until the importer handshake and destroys the dedicated reader on unmount', async () => {
    const onError = vi.fn()
    await act(async () => root.render(<MiraPdfReader url="http://127.0.0.1:2345/mira-media/source" page={1} scale={1} onPage={() => undefined} onScale={() => undefined} onError={onError} />))
    const worker = ReaderWorker.current
    await act(async () => worker.onmessage?.({ data: { sourceName: 'worker', targetName: 'main', action: 'ready' } }))
    expect(onError).not.toHaveBeenCalled(); expect(pdf.create).not.toHaveBeenCalled(); expect(container.querySelector('[data-document]')).toBeNull()
    await act(async () => worker.onmessage?.({ data: { type: 'mira-pdf-ready' } }))
    expect(pdf.create).toHaveBeenCalledWith({ port: worker }); expect(container.querySelector('[data-document]')).toBeTruthy()
    await act(async () => root.render(null)); expect(pdf.destroy).toHaveBeenCalledOnce(); expect(worker.terminate).toHaveBeenCalledOnce(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mira-pdf-worker')
  })
  it('reports worker import failure without silently using the UI thread', async () => {
    const onError = vi.fn()
    await act(async () => root.render(<MiraPdfReader url="http://127.0.0.1:2345/mira-media/source" page={1} scale={1} onPage={() => undefined} onScale={() => undefined} onError={onError} />))
    await act(async () => ReaderWorker.current.onmessage?.({ data: { type: 'mira-pdf-error' } }))
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('无法启动')); expect(pdf.create).not.toHaveBeenCalled(); expect(container.querySelector('[data-document]')).toBeNull()
  })
})
