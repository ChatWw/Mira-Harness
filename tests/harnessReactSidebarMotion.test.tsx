// @vitest-environment happy-dom
import React, { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMiraSidebarMotion } from '../apps/harness-react/src/hooks/useMiraSidebarMotion'

let root: Root, container: HTMLDivElement, motion: EventTarget & { matches: boolean }
let animations: Array<EventTarget & { cancel: ReturnType<typeof vi.fn>; frames: Keyframe[] }>, offset: number
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('DOMMatrixReadOnly', class { m41 = offset })
  motion = Object.assign(new EventTarget(), { matches: false }); animations = []; offset = 0
  vi.stubGlobal('matchMedia', () => motion)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 280 } as DOMRect)
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: (frames: Keyframe[]) => {
    const animation = Object.assign(new EventTarget(), { cancel: vi.fn(), frames }); animations.push(animation); return animation
  } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate); else delete (HTMLElement.prototype as Partial<HTMLElement>).animate
})
function View({ open }: { open: boolean }) {
  const shell = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null)
  useMiraSidebarMotion(open, shell, body)
  return <div ref={shell}><div className="mira-sidebar-panel"><aside /></div><div ref={body} /><div role="separator" /></div>
}
const render = (open: boolean) => act(async () => root.render(<View open={open} />))

describe('sidebar compositor animation lifecycle', () => {
  it('skips initial hydration, carries the live position into a rapid reversal, and clears temporary paint state', async () => {
    await render(true); expect(animations).toHaveLength(0)
    await render(false); expect(animations[0].frames).toEqual([{ width: '280px' }, { width: '0px' }])
    vi.spyOn(container.querySelector<HTMLElement>('.mira-sidebar-panel')!, 'getBoundingClientRect').mockReturnValue({ width: 80 } as DOMRect)
    await render(true)
    expect(animations[0].cancel).toHaveBeenCalled(); expect(animations[1].frames).toEqual([{ width: '80px' }, { width: '280px' }])
    animations[1].dispatchEvent(new Event('finish'))
    expect(container.querySelector<HTMLElement>('.mira-sidebar-panel')!.style.overflow).toBe('')
    expect(animations[1].cancel).toHaveBeenCalled()
  })
  it('reopens from zero after a completed close instead of sampling the already committed open width', async () => {
    await render(true); await render(false)
    animations[0].dispatchEvent(new Event('finish'))
    await render(true)
    expect(animations[1].frames[0]).toEqual({ width: '0px' })
  })
  it.each(['reduce', 'hidden'])('applies final state without starting motion under %s policy', async policy => {
    await render(true)
    if (policy === 'reduce') motion.matches = true; else vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    await render(false); expect(animations).toHaveLength(0)
  })
  it.each(['resize', 'preference', 'drag'])('cancels the active motion on %s', async reason => {
    await render(true); await render(false)
    if (reason === 'resize') window.dispatchEvent(new Event('resize'))
    else if (reason === 'preference') motion.dispatchEvent(new Event('change'))
    else container.querySelector('[role="separator"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(animations.every(animation => animation.cancel.mock.calls.length > 0)).toBe(true)
    expect(container.querySelector<HTMLElement>('.mira-sidebar-panel')!.style.overflow).toBe('')
  })
})
