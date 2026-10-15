// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageMarkdown } from '../apps/harness-react/src/components/conversation/markdown'
import { MiraConversationContext } from '../apps/harness-react/src/components/conversation/MiraConversationMessages'
import { miraMessageLink } from '../apps/harness-react/src/lib/mira-message-links'

let root: Root | undefined
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
describe('message links stay inside the workbench', () => {
  it.each([false, true])('routes file and web links in streaming=%s without native navigation, including modified and middle clicks', async streaming => {
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    const openFile = vi.fn(), openLink = vi.fn(), reportError = vi.fn()
    const context = { active: true, session: { workingDirectory: '/project' }, openFile, openLink, controller: { reportError } } as unknown as React.ContextType<typeof MiraConversationContext>
    await act(async () => root!.render(<MiraConversationContext.Provider value={context}><MessageMarkdown streaming={streaming} content={'[test-06.md](test-06.md)\n\n[百度](https://www.baidu.com/)\n\n[文件](./docs/test%2006.md#L2)\n\n[本地文件](file:///project/test-06.md)'} /></MiraConversationContext.Provider>))
    const links = container.querySelectorAll('a')
    expect(links.length).toBe(4)
    expect(container.querySelectorAll('.mira-message-file-link img')).toHaveLength(3)
    const click = async (link: Element, type = 'click', options: MouseEventInit = {}) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...options })
      await act(async () => link.dispatchEvent(event))
      expect(event.defaultPrevented).toBe(true)
    }
    await click(links[0]); expect(openFile).toHaveBeenLastCalledWith('test-06.md')
    await click(links[1], 'click', { metaKey: true }); expect(openLink).toHaveBeenLastCalledWith('https://www.baidu.com/')
    await click(links[1], 'auxclick', { button: 1 }); expect(openLink).toHaveBeenCalledTimes(2)
    await click(links[2]); expect(openFile).toHaveBeenLastCalledWith('docs/test 06.md')
    await click(links[3]); expect(openFile).toHaveBeenLastCalledWith('test-06.md')
    expect(reportError).not.toHaveBeenCalled()
  })
  it('blocks default navigation even without a workspace callback or for an unsupported href', async () => {
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await act(async () => root!.render(<MessageMarkdown content="[百度](https://www.baidu.com/)" />))
    const link = container.querySelector('a')!
    for (const href of ['https://www.baidu.com/', 'javascript:alert(1)', 'mira://settings', '/outside/file.md']) {
      link.setAttribute('href', href)
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      await act(async () => link.dispatchEvent(event))
      expect(event.defaultPrevented).toBe(true)
    }
  })
  it.each([
    ['test-06.md', '/project', { kind: 'file', target: '/project/test-06.md' }],
    ['./docs/../test%2006.md#L3', '/project', { kind: 'file', target: '/project/test 06.md' }],
    ['file:///project/test%2006.md', undefined, { kind: 'file', target: '/project/test 06.md' }],
    ['C:\\project\\test.md:2:3', undefined, { kind: 'file', target: 'C:/project/test.md' }],
    ['https://www.baidu.com/', undefined, { kind: 'web', target: 'https://www.baidu.com/' }],
    ['//example.com/page', undefined, { kind: 'web', target: 'https://example.com/page' }],
    ['#section', undefined, { kind: 'anchor', target: '#section' }],
    ['javascript:alert(1)', '/project', undefined],
    ['file://remote/test.md', '/project', undefined],
    ['data:text/html,test', '/project', undefined],
    ['https://user:secret@example.com', '/project', undefined],
  ] as const)('classifies %s', (href, directory, result) => { expect(miraMessageLink(href, directory)).toEqual(result) })
})
