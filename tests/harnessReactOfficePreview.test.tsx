// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraOfficePreview } from '../apps/harness-react/src/components/workspace/MiraOfficePreview'
import { FilePreviewPanel } from '../apps/harness-react/src/components/workspace/FilePreviewPanel'
import { filePreviewKind } from '../apps/harness-react/src/lib/file-preview'
import { MIRA_OFFICE_PREVIEW_LIMIT, miraMediaFormat, type MiraMediaPreview } from '../src/config/miraMedia'

const decoder = vi.hoisted(() => ({ fail: false }))
vi.mock('../apps/harness-react/src/components/workspace/MiraWordReader', () => ({ default: (props: any) => {
  if (decoder.fail) throw new Error('module failed')
  return <div data-reader="word" data-size={props.buffer.byteLength}><button onClick={() => props.onError('Word 文档损坏')}>Fail</button><button onClick={() => props.onOpenLink?.('https://example.com')}>Link</button></div>
} }))
vi.mock('../apps/harness-react/src/components/workspace/MiraSheetReader', () => ({ default: (props: any) => <div data-reader="sheet" data-size={props.buffer.byteLength} /> }))
vi.mock('../apps/harness-react/src/components/workspace/MiraLegacyWordReader', () => ({ default: (props: any) => <div data-reader="legacy-word" data-size={props.buffer.byteLength} /> }))
vi.mock('../apps/harness-react/src/components/workspace/MiraPresentationReader', () => ({ default: (props: any) => <div data-reader="presentation" data-size={props.buffer.byteLength} /> }))
let root: Root, container: HTMLDivElement
const bytes = new Uint8Array([80, 75, 3, 4])
function source(path = 'book.docx', id = 'a'.repeat(64)): MiraMediaPreview {
  return { id, path, ...miraMediaFormat(path)!, byteLength: bytes.length, url: `http://127.0.0.1:2345/mira-media/${id}` }
}
function response(path = 'book.docx') { return new Response(bytes, { headers: { 'content-type': miraMediaFormat(path)!.mediaType, 'content-length': String(bytes.length) } }) }
beforeEach(() => {
  decoder.fail = false; vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  vi.stubGlobal('fetch', vi.fn(async () => response()))
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('Office authorized read lifecycle', () => {
  it('reads bounded bytes, releases the URL after loading and routes document links', async () => {
    const host = { openMediaFor: vi.fn(async () => source()), closeMedia: vi.fn(async () => undefined) }, open = vi.fn()
    await act(async () => root.render(<MiraOfficePreview controller={host} sessionId="owner" path="book.docx" active refresh={0} onRetry={() => undefined} onOpenLink={open} />))
    await act(async () => undefined)
    expect(container.querySelector('[data-reader="word"]')?.getAttribute('data-size')).toBe('4'); expect(host.closeMedia).toHaveBeenCalledOnce()
    await act(async () => (container.querySelectorAll('button')[1] as HTMLButtonElement).click()); expect(open).toHaveBeenCalledWith('https://example.com')
    await act(async () => (container.querySelector('button') as HTMLButtonElement).click()); expect(container.textContent).toContain('Word 文档损坏'); expect(container.querySelector('[data-reader]')).toBeNull()
  })
  it('revokes a late authorization without fetching or mounting after hiding', async () => {
    let resolve!: (preview: MiraMediaPreview) => void
    const host = { openMediaFor: vi.fn(() => new Promise<MiraMediaPreview>(yes => { resolve = yes })), closeMedia: vi.fn(async () => undefined) }
    const render = (active: boolean) => act(async () => root.render(<MiraOfficePreview controller={host} sessionId="owner" path="book.docx" active={active} refresh={0} onRetry={() => undefined} />))
    await render(true); await render(false); await act(async () => resolve(source()))
    expect(fetch).not.toHaveBeenCalled(); expect(host.closeMedia).toHaveBeenCalledWith(source().id); expect(container.textContent).toBe('')
  })
  it('aborts pending reads on hiding and releases each authorization once', async () => {
    let signal: AbortSignal | undefined
    vi.mocked(fetch).mockImplementation((_url, options) => { signal = options?.signal as AbortSignal; return new Promise((_yes, no) => signal!.addEventListener('abort', () => no(new DOMException('Aborted', 'AbortError')))) })
    const host = { openMediaFor: vi.fn(async () => source()), closeMedia: vi.fn(async () => undefined) }
    const render = (active: boolean) => act(async () => root.render(<MiraOfficePreview controller={host} sessionId="owner" path="book.docx" active={active} refresh={0} onRetry={() => undefined} />))
    await render(true); expect(signal?.aborted).toBe(false); await render(false)
    expect(signal?.aborted).toBe(true); expect(host.closeMedia).toHaveBeenCalledOnce(); expect(container.textContent).toBe('')
  })
  it.each([
    { ...source(), path: 'other.docx' }, { ...source(), kind: 'pdf' as const },
    { ...source(), byteLength: MIRA_OFFICE_PREVIEW_LIMIT + 1 }, { ...source(), url: 'https://example.com/document' },
  ])('rejects a mismatched or oversized grant before fetching', async value => {
    const host = { openMediaFor: vi.fn(async () => value), closeMedia: vi.fn(async () => undefined) }
    await act(async () => root.render(<MiraOfficePreview controller={host} sessionId="owner" path="book.docx" active refresh={0} onRetry={() => undefined} />))
    expect(fetch).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')).toBeTruthy(); expect(host.closeMedia).toHaveBeenCalledOnce()
  })
  it('rejects body/header size mismatch and retries with fresh authorized bytes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(5), { headers: { 'content-type': source().mediaType, 'content-length': '4' } }))
    const host = { openMediaFor: vi.fn(async () => source()), closeMedia: vi.fn(async () => undefined) }
    const render = (refresh: number) => act(async () => root.render(<MiraOfficePreview controller={host} sessionId="owner" path="book.docx" active refresh={refresh} onRetry={() => undefined} />))
    await render(0); expect(container.textContent).toContain('大小不匹配'); await render(1); await act(async () => undefined)
    expect(container.querySelector('[data-reader="word"]')).toBeTruthy(); expect(host.closeMedia).toHaveBeenCalledTimes(2)
  })
  it('contains lazy renderer failures and keeps the surrounding workbench usable', async () => {
    decoder.fail = true; vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const host = { openMediaFor: vi.fn(async () => source()), closeMedia: vi.fn(async () => undefined) }
    await act(async () => root.render(<><span data-composer>任务输入</span><MiraOfficePreview controller={host} sessionId="owner" path="book.docx" active refresh={0} onRetry={() => undefined} /></>))
    await act(async () => undefined)
    expect(container.querySelector('[data-composer]')).toBeTruthy(); expect(container.textContent).toContain('重新加载 Mira'); expect(host.closeMedia).toHaveBeenCalledOnce()
  })
  it('routes spreadsheet binary files without text reads or model attachment claims', async () => {
    for (const path of ['BOOK.DOCX', 'book.xlsx', 'book.xlsm', 'book.xls', 'BOOK.DOC', 'book.pptx']) expect(filePreviewKind(path)).toBe('office')
    expect(filePreviewKind('book.docx.ts')).toBe('text'); expect(filePreviewKind('book.ppt')).toBe('text')
    vi.mocked(fetch).mockImplementation(async () => response('book.xlsx'))
    const host = { openMediaFor: vi.fn(async () => source('book.xlsx')), closeMedia: vi.fn(async () => undefined), readFileFor: vi.fn() }
    await act(async () => root.render(<FilePreviewPanel controller={host as never} sessionId="owner" path="book.xlsx" active onAddFile={() => undefined} />)); await act(async () => undefined)
    expect(container.querySelector('[data-reader="sheet"]')).toBeTruthy(); expect(host.readFileFor).not.toHaveBeenCalled(); expect(container.querySelector<HTMLButtonElement>('[aria-label="将当前文件加入对话"]')!.disabled).toBe(true)
  })
  it.each([['book.doc', 'legacy-word'], ['book.pptx', 'presentation']])('selects the exact binary decoder for %s and releases its read grant', async (path, decoder) => {
    vi.mocked(fetch).mockImplementation(async () => response(path))
    const host = { openMediaFor: vi.fn(async () => source(path)), closeMedia: vi.fn(async () => undefined) }
    await act(async () => root.render(<MiraOfficePreview controller={host} sessionId="owner" path={path} active refresh={0} onRetry={() => undefined} />)); await act(async () => undefined)
    expect(container.querySelector(`[data-reader="${decoder}"]`)?.getAttribute('data-size')).toBe('4')
    expect(host.closeMedia).toHaveBeenCalledOnce()
  })
})
