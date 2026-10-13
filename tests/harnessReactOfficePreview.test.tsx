// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraOfficePreview } from '../apps/harness-react/src/components/workspace/MiraOfficePreview'
import { FilePreviewPanel } from '../apps/harness-react/src/components/workspace/FilePreviewPanel'
import { filePreviewKind } from '../apps/harness-react/src/lib/file-preview'
import { MIRA_OFFICE_PREVIEW_LIMIT, miraMediaFormat, type MiraMediaPreview } from '../src/config/miraMedia'
import type MiraPresentationReader from '../apps/harness-react/src/components/workspace/MiraPresentationReader'
import type { MiraPresentationElement } from '../apps/harness-react/src/lib/presentation/mira-presentation-types'
import type { MiraPresentationReference } from '../src/config/miraPresentation'

const decoder = vi.hoisted(() => ({ fail: false }))
const presentationReader = vi.hoisted(() => ({ props: [] as Array<React.ComponentProps<typeof MiraPresentationReader>> }))
vi.mock('../apps/harness-react/src/components/workspace/MiraWordReader', () => ({ default: (props: any) => {
  if (decoder.fail) throw new Error('module failed')
  return <div data-reader="word" data-size={props.buffer.byteLength}><button onClick={() => props.onError('Word 文档损坏')}>Fail</button><button onClick={() => props.onOpenLink?.('https://example.com')}>Link</button></div>
} }))
vi.mock('../apps/harness-react/src/components/workspace/MiraSheetReader', () => ({ default: (props: any) => <div data-reader="sheet" data-size={props.buffer.byteLength} /> }))
vi.mock('../apps/harness-react/src/components/workspace/MiraLegacyWordReader', () => ({ default: (props: any) => <div data-reader="legacy-word" data-size={props.buffer.byteLength} /> }))
vi.mock('../apps/harness-react/src/components/workspace/MiraPresentationReader', () => ({ default: (props: React.ComponentProps<typeof MiraPresentationReader>) => {
  presentationReader.props.push(props)
  return <div data-reader="presentation" data-size={props.buffer.byteLength} />
} }))
let root: Root, container: HTMLDivElement
const bytes = new Uint8Array([80, 75, 3, 4])
function source(path = 'book.docx', id = 'a'.repeat(64)): MiraMediaPreview {
  return { id, path, ...miraMediaFormat(path)!, byteLength: bytes.length, url: `http://127.0.0.1:2345/mira-media/${id}`,
    ...(/\.pptx$/i.test(path) ? { sourceFingerprint: `sha256:${'b'.repeat(64)}`, workspaceIdentity: `sha256:${'c'.repeat(64)}` } : {}) }
}
function response(path = 'book.docx') { return new Response(bytes, { headers: { 'content-type': miraMediaFormat(path)!.mediaType, 'content-length': String(bytes.length) } }) }
beforeEach(() => {
  decoder.fail = false; presentationReader.props.length = 0; vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  vi.stubGlobal('fetch', vi.fn(async () => response()))
})

describe('Office presentation reference ownership and metadata', () => {
  const element: MiraPresentationElement = { slideIndex: 0, slidePart: 'ppt/slides/slide1.xml', nodeId: 'title-one', nodeName: '标题', nodeType: 'shape', text: '完整标题文字', bounds: { x: 20, y: 30, width: 300, height: 80 }, zIndex: 1 }
  const currentReader = () => presentationReader.props[presentationReader.props.length - 1]
  function host() { return { openMediaFor: vi.fn(async (_sessionId: string, path: string) => source(path)), closeMedia: vi.fn(async () => undefined) } }
  async function show(controller: ReturnType<typeof host>, props: Partial<React.ComponentProps<typeof MiraOfficePreview>> = {}) {
    await act(async () => root.render(<MiraOfficePreview controller={controller} sessionId="owner" path="book.pptx" active refresh={0} onRetry={() => undefined} {...props} />))
    await act(async () => undefined)
  }
  it('passes host source version and one navigation request to the reader and creates complete owner-scoped references', async () => {
    vi.mocked(fetch).mockImplementation(async () => response('book.pptx'))
    const controller = host(), add = vi.fn<(reference: MiraPresentationReference) => boolean>(() => true), grant = source('book.pptx')
    const reference: MiraPresentationReference = { version: 1, id: 'original', sessionId: 'owner', sourcePath: 'book.pptx', sourceFingerprint: grant.sourceFingerprint!, workspaceIdentity: grant.workspaceIdentity!, element, comment: '', capturedAt: 1 }
    const navigation = { requestId: 'navigation-one', reference }
    await show(controller, { onAddPresentation: add, presentationNavigation: navigation })
    expect(currentReader().sourceFingerprint).toBe(grant.sourceFingerprint); expect(currentReader().navigation).toBe(navigation)
    expect(add).not.toHaveBeenCalled()
    await act(async () => currentReader().onAddElement!(element, '请修改标题', '标题'))
    expect(add).toHaveBeenCalledOnce()
    expect(add.mock.calls[0][0]).toEqual({ version: 1, id: expect.any(String), sessionId: 'owner', sourcePath: 'book.pptx', sourceFingerprint: grant.sourceFingerprint, workspaceIdentity: grant.workspaceIdentity, element, comment: '请修改标题', selectedText: '标题', capturedAt: expect.any(Number) })
    expect(add.mock.calls[0][0].element.text).toBe('完整标题文字')
    expect(controller.openMediaFor).toHaveBeenCalledExactlyOnceWith('owner', 'book.pptx'); expect(controller.closeMedia).toHaveBeenCalledOnce()
  })
  it('omits selection without the add handler, rejects parent refusal without unmounting the reader and allows retry', async () => {
    vi.mocked(fetch).mockImplementation(async () => response('book.pptx'))
    const controller = host(), add = vi.fn<(reference: MiraPresentationReference) => boolean>().mockReturnValueOnce(false).mockReturnValue(true)
    await show(controller); expect(currentReader().onAddElement).toBeUndefined()
    await show(controller, { onAddPresentation: add })
    await expect(currentReader().onAddElement!(element, '保留评论')).rejects.toThrow('修改意见已保留')
    expect(container.querySelector('[data-reader="presentation"]')).toBeTruthy(); expect(container.querySelector('[role="alert"]')).toBeNull()
    await expect(currentReader().onAddElement!(element, '保留评论')).resolves.toBeUndefined(); expect(add).toHaveBeenCalledTimes(2)
  })
  it.each([
    { active: false }, { path: 'other.pptx' }, { sessionId: 'new-owner' }, { refresh: 1 },
  ])('rejects a captured reader callback after hidden/owner/source changes: %j', async change => {
    vi.mocked(fetch).mockImplementation(async () => response('book.pptx'))
    const controller = host(), add = vi.fn(() => true)
    await show(controller, { onAddPresentation: add }); const late = currentReader().onAddElement!
    await show(controller, { onAddPresentation: add, ...change })
    await expect(late(element, '旧的评论')).rejects.toThrow('文件或任务已切换'); expect(add).not.toHaveBeenCalled()
  })
  it.each(['sourceFingerprint', 'workspaceIdentity'] as const)('rejects missing presentation %s before fetching', async key => {
    const grant = source('book.pptx'); delete grant[key]
    const controller = host(); controller.openMediaFor.mockResolvedValue(grant)
    await show(controller, { onAddPresentation: vi.fn(() => true) })
    expect(fetch).not.toHaveBeenCalled(); expect(container.textContent).toContain('版本信息无效'); expect(presentationReader.props).toHaveLength(0); expect(controller.closeMedia).toHaveBeenCalledOnce()
  })
  it('rejects invalid element data locally and keeps the valid reader available for a shorter selection', async () => {
    vi.mocked(fetch).mockImplementation(async () => response('book.pptx'))
    const controller = host(), add = vi.fn(() => true)
    await show(controller, { onAddPresentation: add })
    await expect(currentReader().onAddElement!({ ...element, text: 'x'.repeat(8193) }, '保留评论')).rejects.toThrow('元素内容过长或信息无效')
    expect(add).not.toHaveBeenCalled(); expect(container.querySelector('[data-reader="presentation"]')).toBeTruthy()
    await expect(currentReader().onAddElement!(element, '较短评论')).resolves.toBeUndefined(); expect(add).toHaveBeenCalledOnce()
  })
  it.each([
    { workspaceIdentity: `sha256:${'d'.repeat(64)}` }, { sessionId: 'other-task' }, { sourcePath: 'other.pptx' },
  ])('shows an explicit ownership mismatch and blocks navigation without reinterpreting the same bytes: %j', async change => {
    vi.mocked(fetch).mockImplementation(async () => response('book.pptx'))
    const controller = host(), grant = source('book.pptx')
    const reference: MiraPresentationReference = { version: 1, id: 'mismatch', sessionId: 'owner', sourcePath: 'book.pptx', sourceFingerprint: grant.sourceFingerprint!, workspaceIdentity: grant.workspaceIdentity!, element, comment: '', capturedAt: 1, ...change }
    await show(controller, { onAddPresentation: vi.fn(() => true), presentationNavigation: { requestId: 'wrong-workspace', reference } })
    expect(container.querySelector('[role="status"]')!.textContent).toContain('任务或工作目录已变化')
    expect(currentReader().navigation).toBeUndefined(); expect(currentReader().sourceFingerprint).toBe(grant.sourceFingerprint)
    expect(container.querySelector('[data-reader="presentation"]')).toBeTruthy()
  })
  it('wires FilePreviewPanel to the authorized reader, adds references and re-reads current bytes for each new navigation request', async () => {
    vi.mocked(fetch).mockImplementation(async () => response('book.pptx'))
    const controller = host(), grant = source('book.pptx'), add = vi.fn<(reference: MiraPresentationReference) => boolean>(() => true), link = vi.fn()
    const reference: MiraPresentationReference = { version: 1, id: 'panel-ref', sessionId: 'owner', sourcePath: 'book.pptx', sourceFingerprint: grant.sourceFingerprint!, workspaceIdentity: grant.workspaceIdentity!, element, comment: '', capturedAt: 1 }
    async function renderPanel(requestId?: string) {
      await act(async () => root.render(<FilePreviewPanel controller={controller as never} sessionId="owner" path="book.pptx" active onAddFile={() => undefined} onAddPresentation={add} onOpenLink={link} presentationNavigation={requestId ? { requestId, reference } : undefined} />))
      await act(async () => undefined)
    }
    await renderPanel(); expect(controller.openMediaFor).toHaveBeenCalledTimes(1)
    await act(async () => currentReader().onAddElement!(element, '面板评论', '标题'))
    expect(add).toHaveBeenCalledOnce(); expect(add.mock.calls[0][0]).toMatchObject({ sessionId: 'owner', sourcePath: 'book.pptx', workspaceIdentity: grant.workspaceIdentity, comment: '面板评论', selectedText: '标题' })
    await act(async () => currentReader().onOpenLink?.('https://example.com/from-reader')); expect(link).toHaveBeenCalledWith('https://example.com/from-reader')
    const oldCallback = currentReader().onAddElement!
    await renderPanel('request-one'); expect(controller.openMediaFor).toHaveBeenCalledTimes(2); expect(currentReader().navigation).toEqual({ requestId: 'request-one', reference })
    await expect(oldCallback(element, '旧的评论')).rejects.toThrow('文件或任务已切换')
    await renderPanel('request-one'); expect(controller.openMediaFor).toHaveBeenCalledTimes(2)
    const changed = { ...grant, sourceFingerprint: `sha256:${'f'.repeat(64)}` }
    controller.openMediaFor.mockResolvedValue(changed)
    await renderPanel('request-two'); expect(controller.openMediaFor).toHaveBeenCalledTimes(3)
    expect(currentReader().sourceFingerprint).toBe(changed.sourceFingerprint); expect(currentReader().navigation?.reference.sourceFingerprint).toBe(grant.sourceFingerprint)
    expect(controller.closeMedia).toHaveBeenCalledTimes(3); expect(container.querySelector<HTMLButtonElement>('[aria-label="将当前文件加入对话"]')!.disabled).toBe(true)
  })
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
