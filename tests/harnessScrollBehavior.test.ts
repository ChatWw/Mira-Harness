import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createSSRApp, markRaw, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { HarnessMessage } from '../src/config/harness'
import { useHarnessNavigation } from '../src/pages/frontend/harness/useHarnessNavigation'

let frames: Map<number, FrameRequestCallback>
beforeEach(() => {
  frames = new Map()
  let id = 0
  vi.stubGlobal('window', { requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id }, cancelAnimationFrame: (frame: number) => frames.delete(frame) })
})
afterEach(() => vi.unstubAllGlobals())
function frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }

async function setup(questionTop = 600, contentHeight = 690) {
  const messages = ref<HarnessMessage[]>([{ id: 'u', role: 'user', content: '分析项目', createdAt: 1 }])
  const running = ref(true), rendering = ref(true)
  let nav!: ReturnType<typeof useHarnessNavigation>
  await renderToString(createSSRApp({ setup() { nav = useHarnessNavigation({ messages: computed(() => messages.value), running, rendering }); return () => null } }))
  const question = { dataset: { messageId: 'u' }, offsetTop: questionTop, offsetHeight: 80 }
  const reply = { dataset: { messageId: 'a' }, offsetTop: questionTop + 108, offsetHeight: 200 }
  const spacer = markRaw({ style: { height: '0px' } })
  const content = markRaw({ offsetTop: 34, offsetHeight: contentHeight, querySelectorAll: (selector: string) => selector === '.message.user' ? [question] : [question, reply] })
  let top = 0
  const stream = markRaw({
    clientHeight: 600, clientWidth: 800,
    get scrollHeight() { return Math.max(this.clientHeight, content.offsetTop + content.offsetHeight + 24 + parseFloat(spacer.style.height)) },
    get scrollTop() { return top },
    set scrollTop(value: number) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)) },
    querySelectorAll: () => [question, reply],
    getBoundingClientRect: () => ({ left: 0 }),
  })
  nav.streamRef.value = stream as any
  nav.contentRef.value = content as any
  nav.spacerRef.value = spacer as any
  function grow(height = 200) {
    if (messages.value.length === 1) messages.value.push({ id: 'a', role: 'assistant', content: '回复', createdAt: 2 })
    else messages.value[1].content += '回复'
    content.offsetHeight += height
    nav.scheduleAutoScroll()
    frame()
  }
  return { nav, stream, content, spacer, question, messages, running, rendering, grow }
}

describe('harness streaming scroll behavior', () => {
  it('keeps the control hidden for wheel intent and small actual movements near the bottom', async () => {
    const { nav, stream, grow } = await setup()
    await nav.scrollLatestMessageToTop('u'); grow(600)
    nav.handleUserWheel({ deltaY: -10 } as WheelEvent)
    expect(nav.showScrollToBottom.value).toBe(false)
    stream.scrollTop -= 20; nav.handleStreamScroll()
    expect(nav.followLatest.value).toBe(false)
    expect(nav.showScrollToBottom.value).toBe(false)
    stream.scrollTop -= 80; nav.handleStreamScroll()
    expect(nav.showScrollToBottom.value).toBe(true)
    await nav.scrollToBottom()
    expect(nav.showScrollToBottom.value).toBe(false)
  })

  it.each([0, 100])('positions a new question once regardless of the old scroll position (%s)', async previous => {
    const { nav, stream, grow, spacer } = await setup()
    stream.scrollTop = previous
    await nav.scrollLatestMessageToTop('u')
    expect(stream.scrollTop).toBe(580)
    expect(parseFloat(spacer.style.height)).toBeGreaterThan(0)
    grow(100)
    expect(stream.scrollTop).toBe(580)
    grow(600)
    expect(stream.scrollTop).toBe(stream.scrollHeight - stream.clientHeight)
    expect(spacer.style.height).toBe('0px')
  })

  it('lets actual upward scrolling cancel future following', async () => {
    const { nav, stream, grow } = await setup()
    await nav.scrollLatestMessageToTop('u')
    nav.handleUserWheel({ deltaY: -120 } as WheelEvent)
    stream.scrollTop = 100
    nav.handleStreamScroll()
    grow(500)
    expect(stream.scrollTop).toBe(100)
    expect(nav.followLatest.value).toBe(false)
    expect(nav.showScrollToBottom.value).toBe(true)
  })

  it('keeps manual reading position through additional output and terminal states', async () => {
    const { nav, stream, grow, running, rendering } = await setup()
    await nav.scrollLatestMessageToTop('u')
    grow(600)
    nav.handleUserWheel({ deltaY: -120 } as WheelEvent)
    stream.scrollTop = 200
    nav.handleStreamScroll()
    grow(200)
    running.value = false; rendering.value = false
    nav.scheduleAutoScroll(); frame()
    expect(stream.scrollTop).toBe(200)
  })

  it('resumes only after scrolling down near the bottom, not from content growth', async () => {
    const { nav, stream, grow } = await setup()
    await nav.scrollLatestMessageToTop('u'); grow(600)
    nav.handleUserWheel({ deltaY: -120 } as WheelEvent)
    stream.scrollTop -= 200; nav.handleStreamScroll()
    grow(100)
    expect(nav.followLatest.value).toBe(false)
    nav.handleUserWheel({ deltaY: 120 } as WheelEvent)
    stream.scrollTop += 50; nav.handleStreamScroll()
    expect(nav.followLatest.value).toBe(false)
    stream.scrollTop = stream.scrollHeight - stream.clientHeight - 20; nav.handleStreamScroll()
    expect(nav.followLatest.value).toBe(true)
    grow(100)
    expect(stream.scrollTop).toBe(stream.scrollHeight - stream.clientHeight)
  })

  it('resumes following with the latest button and preserves short-reply space on completion', async () => {
    const { nav, stream, spacer, grow, running, rendering } = await setup()
    await nav.scrollLatestMessageToTop('u'); grow(10)
    const space = spacer.style.height
    running.value = false; rendering.value = false
    nav.scheduleAutoScroll(); frame()
    expect(spacer.style.height).toBe(space)
    nav.handleUserWheel({ deltaY: -100 } as WheelEvent)
    stream.scrollTop = 0; nav.handleStreamScroll()
    await nav.scrollToBottom(); grow(500)
    expect(nav.followLatest.value).toBe(true)
    expect(stream.scrollTop).toBe(stream.scrollHeight - stream.clientHeight)
  })

  it('cancels pending session scrolls on reset or a new send', async () => {
    const { nav, stream } = await setup()
    const oldSnap = nav.snapSessionToBottom()
    nav.reset(); stream.scrollTop = 0
    await oldSnap; frame()
    expect(stream.scrollTop).toBe(0)
    const snap = nav.snapSessionToBottom()
    await nav.scrollLatestMessageToTop('u'); await snap; frame()
    expect(stream.scrollTop).toBe(580)
  })

  it('pauses for scrollbar dragging and keyboard reading but does not hijack text inputs', async () => {
    const { nav, stream, grow } = await setup()
    await nav.scrollLatestMessageToTop('u'); grow(600)
    nav.handleStreamKeydown({ key: 'ArrowUp', target: { closest: () => ({}) } } as any)
    expect(nav.followLatest.value).toBe(true)
    nav.handleStreamPointerDown({ clientX: 805, pointerType: 'mouse' } as PointerEvent)
    stream.scrollTop = 100; nav.handleStreamScroll(); grow(100)
    expect(stream.scrollTop).toBe(100)
    await nav.scrollToBottom()
    nav.handleStreamKeydown({ key: 'PageUp', target: { closest: () => null } } as any)
    stream.scrollTop = 200; nav.handleStreamScroll(); grow(100)
    expect(stream.scrollTop).toBe(200)
  })

  it('coalesces streaming layout updates and follows viewport resizing', async () => {
    const { nav, stream, grow } = await setup()
    await nav.scrollLatestMessageToTop('u'); grow(600); frame()
    for (let i = 0; i < 20; i++) nav.scheduleAutoScroll()
    expect(frames.size).toBe(1)
    stream.clientHeight = 400; frame()
    expect(stream.scrollTop).toBe(stream.scrollHeight - 400)
  })

  it('shows the start of a long question until reply text arrives', async () => {
    const { nav, stream } = await setup(600, 2000)
    await nav.scrollLatestMessageToTop('u')
    nav.scheduleAutoScroll(); frame()
    expect(stream.scrollTop).toBe(580)
  })
})
