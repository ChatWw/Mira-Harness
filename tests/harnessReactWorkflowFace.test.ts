// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { faceState, startFaceMotion } from '../apps/harness-react/src/components/workflows/workflow-face-motion'
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren() })
describe('workflow avatar motion lifecycle', () => {
  it('moves the actual SVG, pauses offscreen, and clears timers/listeners on disposal', () => {
    vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0)
    let intersection: IntersectionObserverCallback | undefined
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { intersection = callback } observe() {} disconnect = disconnect })
    const remove = vi.spyOn(document, 'removeEventListener')
    const face = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); document.body.append(face)
    const dispose = startFaceMotion(face, 'scanning')
    expect(face.dataset.motion).toBe('idle'); vi.advanceTimersByTime(1200); expect(face.dataset.motion).toBe('blink')
    intersection!([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(face.dataset.motion).toBe('idle'); expect(vi.getTimerCount()).toBe(0)
    intersection!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(vi.getTimerCount()).toBe(1); dispose(); expect(vi.getTimerCount()).toBe(0)
    expect(disconnect).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    vi.restoreAllMocks()
  })
  it('honors reduced motion and maps real completion/failure states', () => {
    vi.useFakeTimers(); vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
    const face = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const dispose = startFaceMotion(face, 'content'); expect(face.dataset.expression).toBe('happy'); expect(vi.getTimerCount()).toBe(0); dispose()
    expect(faceState('failed')).toBe('sad'); expect(faceState('running')).toBe('scanning'); expect(faceState('pending')).toBe('waiting')
    vi.restoreAllMocks()
  })
})
