// @vitest-environment happy-dom
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miraPresentationEngine } from '../apps/harness-react/src/lib/presentation/mira-presentation-engine'
import { buildPresentation, buildTextIndex, materializeSlideNodes, parseZipLazyMedia, renderSlide, RECOMMENDED_ZIP_LIMITS } from '@aiden0z/pptx-renderer/browser'

// Parse/model/index use the actual pinned renderer. Only DOM render handles are
// controlled here; real slide rendering is covered by Electron acceptance.
const handles = vi.hoisted(() => ({ nextReady: Promise.resolve(), items: [] as Array<{ element: HTMLElement; ready: Promise<void>; dispose: ReturnType<typeof vi.fn> }> }))
vi.mock('@aiden0z/pptx-renderer/browser', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiden0z/pptx-renderer/browser')>()
  return { ...actual, parseZipLazyMedia: vi.fn(actual.parseZipLazyMedia), buildPresentation: vi.fn(actual.buildPresentation), buildTextIndex: vi.fn(actual.buildTextIndex), materializeSlideNodes: vi.fn(actual.materializeSlideNodes),
    renderSlide: vi.fn(() => { const handle = { element: document.createElement('div'), ready: handles.nextReady, dispose: vi.fn() }; handles.items.push(handle); return handle }) }
})
// happy-dom parses XML but omits lookupNamespaceURI. Supply that DOM method by
// resolving the actual fixture namespace declarations, never mocked model nodes.
const XmlParser = DOMParser
beforeEach(() => vi.stubGlobal('DOMParser', class extends XmlParser {
  parseFromString(source: string, type: DOMParserSupportedType): Document {
    const parsed = super.parseFromString(source, type)
    for (const element of parsed.querySelectorAll('*')) element.lookupNamespaceURI = prefix => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        const namespace = current.getAttribute(prefix ? `xmlns:${prefix}` : 'xmlns')
        if (namespace !== null) return namespace || null
      }
      return null
    }
    return parsed
  }
}))
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); handles.items = []; handles.nextReady = Promise.resolve() })
async function fixture() {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>')
  zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + [1, 2, 3].map(index => `<Relationship Id="rId${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index}.xml"/>`).join('') + '</Relationships>')
  for (const index of [1, 2, 3]) zip.file(`ppt/slides/slide${index}.xml`, `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="${index}" name="中文标题${index}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="2743200" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>第${index}页 中文</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`)
  zip.file('ppt/media/image1.png', new Uint8Array([1, 2, 3, 4]))
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('Mira native presentation engine', () => {
  it('uses recommended ZIP limits, lazy media and slides, and indexes only the requested slide once', async () => {
    const bytes = await fixture(), reader = await miraPresentationEngine.open(bytes)
    expect(parseZipLazyMedia).toHaveBeenCalledWith(bytes, RECOMMENDED_ZIP_LIMITS)
    expect(buildPresentation).toHaveBeenCalledWith(expect.objectContaining({ mediaResolver: expect.any(Object) }), { lazySlides: true })
    const model = vi.mocked(buildPresentation).mock.results[0].value
    expect(model.media.size).toBe(0); expect(model.slides.every(slide => !slide.nodesMaterialized)).toBe(true)
    expect(reader.pageCount).toBe(3); expect(reader.pageSize).toEqual({ width: 960, height: 540 })
    const elements = reader.getPageElements(2)
    expect(elements).toHaveLength(1); expect(elements[0]).toMatchObject({ slideIndex: 2, slidePart: 'ppt/slides/slide3.xml', nodeName: '中文标题3', text: '第3页 中文' })
    expect(model.slides.map(slide => Boolean(slide.nodesMaterialized))).toEqual([false, false, true])
    expect(materializeSlideNodes).toHaveBeenCalledOnce(); expect(buildTextIndex).toHaveBeenCalledWith(expect.objectContaining({ slides: [model.slides[2]] }), { includeGroups: true, includeShapes: true, includeTables: false })
    expect(reader.getPageElements(2)).toBe(elements); expect(buildTextIndex).toHaveBeenCalledOnce()
    reader.dispose()
    expect(() => reader.getPageElements(2)).toThrow('已关闭')
  })
  it('retains ready/navigation and disposes every active DOM handle idempotently', async () => {
    const reader = await miraPresentationEngine.open(await fixture()), container = document.createElement('div')
    const onNavigate = vi.fn(), onNodeError = vi.fn()
    let ready!: () => void; handles.nextReady = new Promise<void>(resolve => { ready = resolve })
    const first = reader.renderPage(0, container, { onNavigate, onNodeError }), second = reader.renderPage(1, container)
    expect(container.children).toHaveLength(2); expect(first.ready).toBe(handles.items[0].ready)
    const options = vi.mocked(renderSlide).mock.calls[0][2]!
    options.onNavigate?.({ slideIndex: 2 }); options.onNavigate?.({ url: 'https://example.com' })
    expect(onNavigate.mock.calls).toEqual([[{ pageIndex: 2, url: undefined }], [{ pageIndex: undefined, url: 'https://example.com' }]])
    expect(options.onNodeError).toBe(onNodeError)
    ready(); await first.ready
    first.dispose(); first.dispose(); expect(handles.items[0].dispose).toHaveBeenCalledOnce(); expect(container.children).toHaveLength(1)
    reader.dispose(); reader.dispose(); second.dispose(); expect(handles.items[1].dispose).toHaveBeenCalledOnce(); expect(container.children).toHaveLength(0)
    expect(() => reader.renderPage(0, container)).toThrow('已关闭')
  })
  it('rejects invalid page indexes and malformed archives before rendering', async () => {
    const reader = await miraPresentationEngine.open(await fixture())
    for (const page of [-1, 3, .5, NaN]) expect(() => reader.getPageElements(page)).toThrow(RangeError)
    expect(() => reader.renderPage(3, document.createElement('div'))).toThrow(RangeError)
    expect(renderSlide).not.toHaveBeenCalled(); reader.dispose()
    await expect(miraPresentationEngine.open(new ArrayBuffer(8))).rejects.toThrow()
  })
})
