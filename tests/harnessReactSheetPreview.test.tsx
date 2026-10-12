// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MiraSheetReader from '../apps/harness-react/src/components/workspace/MiraSheetReader'

const viewer = vi.hoisted(() => ({ props: {} as any, state: 'ready', tabs: ['计划', '数据', '汇总'], dispose: vi.fn(), wasm: vi.fn(), links: vi.fn(), releaseLinks: vi.fn() }))
vi.mock('@extend-ai/react-xlsx', () => ({
  setWasmSource: viewer.wasm,
  XlsxViewer: (props: any) => {
    viewer.props = props
    const [activeTabIndex, setActiveTabIndex] = useState(0)
    React.useEffect(() => () => viewer.dispose(), [])
    if (viewer.state === 'error') return props.errorState(new Error('Bad ZIP'))
    if (viewer.state === 'large') return props.fileTooLargeState({ fileSizeBytes: 26 * 1024 * 1024 })
    if (viewer.state === 'loading') return props.loadingState
    if (viewer.state === 'empty') return props.emptyState
    return <>{props.toolbar({ activeTabIndex, setActiveTabIndex, tabs: viewer.tabs.map((name, id) => ({ id, name })) })}<p data-grid>{viewer.tabs[activeTabIndex]}</p></>
  },
}))
vi.mock('../apps/harness-react/src/lib/mira-document-links', () => ({ installMiraDocumentLinks: (...args: any[]) => { viewer.links(...args); return viewer.releaseLinks } }))

let root: Root, container: HTMLDivElement
beforeEach(() => {
  viewer.state = 'ready'; viewer.tabs = ['计划', '数据', '汇总']; viewer.dispose.mockClear(); viewer.links.mockClear(); viewer.releaseLinks.mockClear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); document.documentElement.classList.remove('dark'); vi.unstubAllGlobals() })
const render = async (onError = vi.fn(), onOpenLink = vi.fn()) => {
  const buffer = new ArrayBuffer(12)
  await act(async () => root.render(<MiraSheetReader buffer={buffer} path="报告.xlsx" onError={onError} onOpenLink={onOpenLink} />))
  return { buffer, onError, onOpenLink }
}
const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
async function press(index: number, key: string) { await act(async () => { tabs()[index].focus(); tabs()[index].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) }) }

describe('Mira read-only workbook reader', () => {
  it('keeps the real viewer in read-only mode without mutation toolbar and supplies local WASM', async () => {
    const { buffer, onOpenLink } = await render()
    expect(viewer.props.file).toBe(buffer); expect(viewer.props.fileName).toBe('报告.xlsx')
    expect(viewer.props.readOnly).toBe(true); expect(viewer.props.showDefaultToolbar).toBe(false); expect(viewer.props.height).toBe('100%')
    expect(viewer.wasm).toHaveBeenCalledWith(new URL('office/duke_sheets_wasm_bg.wasm', document.baseURI).href)
    expect(viewer.links).toHaveBeenCalledWith(container.firstElementChild, onOpenLink)
    await act(async () => root.unmount()); root = createRoot(container)
    expect(viewer.dispose).toHaveBeenCalledOnce(); expect(viewer.releaseLinks).toHaveBeenCalledOnce()
  })
  it('selects every sheet using mouse and wrapping arrow/Home/End keys while preserving one tab stop', async () => {
    await render(); expect(tabs().map(tab => tab.tabIndex)).toEqual([0, -1, -1])
    await act(async () => tabs()[1].click()); expect(tabs()[1].getAttribute('aria-selected')).toBe('true')
    await press(1, 'End'); expect(document.activeElement).toBe(tabs()[2]); expect(container.querySelector('[data-grid]')?.textContent).toBe('汇总')
    await press(2, 'ArrowRight'); expect(document.activeElement).toBe(tabs()[0]); expect(tabs().map(tab => tab.tabIndex)).toEqual([0, -1, -1])
    await press(0, 'ArrowLeft'); expect(document.activeElement).toBe(tabs()[2])
    await press(2, 'Home'); expect(document.activeElement).toBe(tabs()[0])
    await press(0, 'ArrowDown'); expect(document.activeElement).toBe(tabs()[0]); expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
  })
  it('follows host theme changes without remounting the workbook', async () => {
    await render(); expect(viewer.props.isDark).toBe(false)
    await act(async () => { document.documentElement.classList.add('dark'); await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(viewer.props.isDark).toBe(true); expect(viewer.dispose).not.toHaveBeenCalled()
    await act(async () => { document.documentElement.classList.remove('dark'); await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(viewer.props.isDark).toBe(false)
  })
  it('shows loading and empty states and omits unnecessary single-sheet navigation', async () => {
    viewer.state = 'loading'; await render(); expect(container.querySelector('[role="status"]')?.getAttribute('aria-busy')).toBe('true'); expect(container.textContent).toContain('正在读取工作簿')
    viewer.state = 'empty'; await render(); expect(container.textContent).toContain('没有可显示的工作表')
    viewer.state = 'ready'; viewer.tabs = ['工作表']; await render(); expect(container.querySelector('[role="tablist"]')).toBeNull()
  })
  it.each(['error', 'large'])('reports %s after rendering so the parent can release the source and offer retry', async state => {
    viewer.state = state; const { onError } = await render()
    expect(onError).toHaveBeenCalledOnce(); expect(onError.mock.calls[0][0]).toContain(state === 'large' ? '25 MiB' : '无法读取工作簿')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(onError.mock.calls[0][0])
  })
})
