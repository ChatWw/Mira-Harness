// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMiraDocumentLinks, miraDocumentHref } from '../apps/harness-react/src/lib/mira-document-links'

const disposers: (() => void)[] = []
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); vi.restoreAllMocks() })
const flushMutations = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }
function surface(shadow = false) {
  const host = document.createElement('div'), root = document.createElement('div')
  if (shadow) host.attachShadow({ mode: 'open' }).append(root)
  else host.append(root)
  document.body.append(host)
  const open = vi.fn()
  disposers.push(installMiraDocumentLinks(root, open))
  return { host, root, open }
}
const click = (node: Element, type = 'click', button = 0) => {
  const event = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, button })
  node.dispatchEvent(event)
  return event
}
describe('document link policy', () => {
  it('allows explicit web URLs and document anchors; rejects repaired schemes, credentials and native protocols', () => {
    for (const value of ['https://example.com/中文?q=1#part', 'HTTP://example.com', '#书签', '#section%202']) expect(miraDocumentHref(value)).toBe(value)
    expect(miraDocumentHref(' https://example.com ')).toBe('https://example.com')
    for (const value of [undefined, 12, '', '#', '#bad anchor', 'java\nscript:alert(1)', '\nhttps://example.com', 'javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'mira://settings', '//example.com', '/relative', 'https://user:secret@example.com', 'https://']) expect(miraDocumentHref(value)).toBeUndefined()
  })
  it('captures nested links inside a ShadowRoot and prevents direct navigation or downloads', async () => {
    const { root, open } = surface(true)
    root.innerHTML = '<a href="https://example.com" target="_blank" download="secret"><span>网站</span></a><a href="javascript:alert(1)">坏链接</a>'
    await flushMutations()
    expect(root.querySelector('a')?.getAttribute('target')).toBeNull()
    expect(root.querySelector('a')?.getAttribute('download')).toBeNull()
    expect(root.querySelectorAll('a')[1].getAttribute('href')).toBeNull()
    const event = click(root.querySelector('span')!)
    expect(event.defaultPrevented).toBe(true); expect(open).toHaveBeenCalledWith('https://example.com')
    click(root.querySelectorAll('a')[1]); expect(open).toHaveBeenCalledOnce()
  })
  it('checks dynamic href synchronously on click and restores accessibility when the relationship becomes safe', async () => {
    const { root, open } = surface()
    const link = document.createElement('a'); link.textContent = '文档链接'; link.href = 'https://example.com'; root.append(link)
    await flushMutations()
    link.setAttribute('href', 'javascript:alert(1)')
    expect(click(link).defaultPrevented).toBe(true); expect(open).not.toHaveBeenCalled()
    await flushMutations()
    expect(link.hasAttribute('href')).toBe(false); expect(link.getAttribute('aria-disabled')).toBe('true')
    link.setAttribute('href', 'https://example.org/restored')
    await flushMutations()
    expect(link.getAttribute('aria-disabled')).toBeNull()
    click(link); expect(open).toHaveBeenCalledWith('https://example.org/restored')
  })
  it('scrolls decoded anchors inside the owning document without finding same-id nodes in the workbench', async () => {
    const outside = document.createElement('p'); outside.id = 'section 2'; const outsideScroll = vi.fn(); outside.scrollIntoView = outsideScroll; document.body.append(outside)
    const { root, open } = surface(true)
    root.innerHTML = '<a href="#section%202">第二节</a><p id="section 2">正文</p><a href="#%">损坏锚点</a>'
    const innerScroll = vi.fn(); root.querySelector('p')!.scrollIntoView = innerScroll
    await flushMutations()
    expect(click(root.querySelector('a')!).defaultPrevented).toBe(true)
    expect(innerScroll).toHaveBeenCalledWith({ block: 'nearest' }); expect(outsideScroll).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled()
    expect(() => click(root.querySelectorAll('a')[1])).not.toThrow()
  })
  it('handles SVG relationship links and middle clicks while ignoring non-middle auxiliary clicks', async () => {
    const { root, open } = surface(true)
    root.innerHTML = '<svg><a xlink:href="https://example.com/svg"><text>图片链接</text></a></svg>'
    await flushMutations()
    const link = root.querySelector('text')!
    expect(click(link, 'auxclick', 1).defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/svg')
    click(link, 'auxclick', 2); expect(open).toHaveBeenCalledOnce()
  })
  it('scopes sheet canvas events, validates their URLs and releases listeners and mutation observation', async () => {
    const { root, open } = surface()
    const unrelated = document.createElement('div'); document.body.append(unrelated)
    const event = (target: HTMLElement, url: unknown) => target.dispatchEvent(new CustomEvent('mira-document-open-link', { detail: { url }, bubbles: true, composed: true }))
    event(unrelated, 'https://example.com/unrelated'); expect(open).not.toHaveBeenCalled()
    event(root, 'https://example.com/canvas'); expect(open).toHaveBeenCalledWith('https://example.com/canvas')
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', '#local', undefined]) event(root, url)
    expect(open).toHaveBeenCalledOnce()
    disposers.pop()!()
    event(root, 'https://example.com/after'); expect(open).toHaveBeenCalledOnce()
    root.innerHTML = '<a href="javascript:alert(1)" target="_blank">已关闭</a>'
    await flushMutations()
    expect(root.querySelector('a')?.getAttribute('target')).toBe('_blank')
  })
  it('delegates only validated left-click anchors when explicitly enabled for a virtualized renderer', async () => {
    const { root, open } = surface()
    disposers.pop()!()
    root.innerHTML = '<a href="#unmounted-page">内部书签</a><a href="https://example.com">网站</a><a href="#bad anchor">无效</a>'
    const [anchor, external, invalid] = [...root.querySelectorAll('a')]
    const rendererNavigation = vi.fn()
    anchor.addEventListener('click', rendererNavigation)
    external.addEventListener('click', rendererNavigation)
    invalid.addEventListener('click', rendererNavigation)
    // Default document policy contains all clicks within its DOM navigation.
    const defaultCleanup = installMiraDocumentLinks(root, open)
    expect(click(anchor).defaultPrevented).toBe(true)
    expect(rendererNavigation).not.toHaveBeenCalled()
    defaultCleanup()
    disposers.push(installMiraDocumentLinks(root, open, { delegateInternalAnchors: true }))
    expect(click(anchor).defaultPrevented).toBe(true)
    expect(rendererNavigation).toHaveBeenCalledOnce()
    expect(click(external).defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com'); expect(rendererNavigation).toHaveBeenCalledOnce()
    click(invalid); click(anchor, 'auxclick', 1); click(anchor, 'click', 2)
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, [modifier]: true })
      anchor.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
    expect(rendererNavigation).toHaveBeenCalledOnce()
    anchor.setAttribute('href', 'javascript:alert(1)')
    expect(click(anchor).defaultPrevented).toBe(true)
    expect(rendererNavigation).toHaveBeenCalledOnce()
  })
})
