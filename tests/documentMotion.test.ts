import { describe, expect, it, vi } from 'vitest'
import { installDocumentMotion } from '../src/utils/documentMotion'

describe('desktop document motion lifecycle', () => {
  it('settles finite animations on hide, pauses loops through CSS, and restores visibility', () => {
    const attrs = new Set<string>(), events = new EventTarget()
    const finite = { effect: { getComputedTiming: () => ({ iterations: 1 }) }, finish: vi.fn() }
    const loop = { effect: { getComputedTiming: () => ({ iterations: Infinity }) }, finish: vi.fn() }
    const doc = Object.assign(events, { visibilityState: 'visible', getAnimations: () => [finite, loop], documentElement: {
      toggleAttribute: (name: string, enabled: boolean) => enabled ? attrs.add(name) : attrs.delete(name), removeAttribute: (name: string) => attrs.delete(name),
    } })
    const dispose = installDocumentMotion(doc as unknown as Document)
    expect(attrs.size).toBe(0); expect(finite.finish).not.toHaveBeenCalled()
    doc.visibilityState = 'hidden'; events.dispatchEvent(new Event('visibilitychange'))
    expect(attrs.has('data-document-hidden')).toBe(true); expect(finite.finish).toHaveBeenCalledOnce(); expect(loop.finish).not.toHaveBeenCalled()
    doc.visibilityState = 'visible'; events.dispatchEvent(new Event('visibilitychange')); expect(attrs.size).toBe(0)
    dispose(); doc.visibilityState = 'hidden'; events.dispatchEvent(new Event('visibilitychange'))
    expect(attrs.size).toBe(0); expect(finite.finish).toHaveBeenCalledOnce()
  })
})
