// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MiraTaskTransition } from '../apps/harness-react/src/components/workbench/MiraTaskTransition'
let root: Root, container: HTMLDivElement, motion: EventTarget & { matches: boolean }
let animations: Array<EventTarget & { cancel: ReturnType<typeof vi.fn> }>
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  motion = Object.assign(new EventTarget(), { matches: false }); animations = []
  vi.stubGlobal('matchMedia', () => motion)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: () => { const animation = Object.assign(new EventTarget(), { cancel: vi.fn() }); animations.push(animation); return animation } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); if (original) Object.defineProperty(HTMLElement.prototype, 'animate', original); else delete (HTMLElement.prototype as Partial<HTMLElement>).animate })
async function render(draft: boolean) {
  await act(async () => root.render(<MiraTaskTransition draft={draft}>{draft && <div className="mira-task-start"><h2>新任务</h2></div>}<div className="mira-composer-region"><textarea defaultValue="未发送草稿" /></div></MiraTaskTransition>))
}
it('keeps composer identity, draft and focus while retaining an inert welcome exit layer', async () => {
  await render(true); expect(animations).toHaveLength(0)
  const input = container.querySelector('textarea')!; input.focus(); input.value = '实际输入'
  await render(false)
  expect(container.querySelector('textarea')).toBe(input); expect(input.value).toBe('实际输入'); expect(document.activeElement).toBe(input)
  expect(container.querySelector<HTMLElement>('[aria-hidden=true]')?.inert).toBe(true)
  animations.at(-1)!.dispatchEvent(new Event('finish'))
  expect(container.querySelector('.mira-task-start')).toBeNull()
})
it('cancels exits on rapid reversal, resize and reduced motion without stale welcome layers', async () => {
  await render(true); await render(false); await render(true)
  expect(container.querySelectorAll('.mira-task-start')).toHaveLength(1)
  expect(animations[0].cancel).toHaveBeenCalled()
  window.dispatchEvent(new Event('resize')); expect(animations.every(animation => animation.cancel.mock.calls.length)).toBe(true)
  motion.matches = true; await render(false)
  expect(container.querySelector('.mira-task-start')).toBeNull()
})
