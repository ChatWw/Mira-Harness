import { describe, expect, it } from 'vitest'
import { addMiraPresentationReference, miraContextPromptBody, miraPresentationReferencePayload, miraPresentationReferences, miraPromptContexts, restoreMiraContextPromptDocument } from '../apps/harness-react/src/lib/mira-presentation-reference'
import { createMiraPromptDocument, serializeMiraPromptDocument, validateMiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'
import { miraBrowserPrompt } from '../apps/harness-react/src/lib/mira-browser-reference'
import type { MiraPresentationReference } from '../src/config/miraPresentation'

const reference = (id = 'one'): MiraPresentationReference => ({ version: 1, id, sessionId: 'current', workspaceIdentity: 'sha256:' + 'a'.repeat(64), sourceFingerprint: 'sha256:' + 'b'.repeat(64), sourcePath: 'slides.pptx',
  element: { slideIndex: 1, slidePart: 'ppt/slides/slide2.xml', nodeId: id, nodeName: '标题', nodeType: 'shape', text: '原始标题', bounds: { x: 1, y: 2, width: 100, height: 40 }, zIndex: 0 }, comment: '改为中文', capturedAt: 1 })
function add(value: MiraPresentationReference, text = '原正文') {
  const result = addMiraPresentationReference(value, createMiraPromptDocument(text))
  if ('error' in result) throw new Error(result.error)
  return result
}
describe('canonical presentation prompt contexts', () => {
  it('restores persisted or text-only drafts without exposing metadata in the editor', () => {
    const document = add(reference())
    const text = serializeMiraPromptDocument(document)
    expect(validateMiraPromptDocument(document, text)).toEqual(document)
    const restored = restoreMiraContextPromptDocument(text)
    expect(serializeMiraPromptDocument(miraContextPromptBody(restored))).toBe('原正文')
    expect(miraPresentationReferencePayload(miraPresentationReferences(restored)[0])).toEqual(reference())
  })
  it('updates only the same file-version/element comment and preserves independent elements', () => {
    const first = add(reference())
    const second = addMiraPresentationReference(reference('two'), first)
    if ('error' in second) throw new Error(second.error)
    const replacement = addMiraPresentationReference({ ...reference('new'), element: reference().element, comment: '仅第一项意见' }, second)
    if ('error' in replacement) throw new Error(replacement.error)
    expect(miraPresentationReferences(replacement).map(item => miraPresentationReferencePayload(item)?.comment)).toEqual(['仅第一项意见', '改为中文'])
    expect(miraPresentationReferences(replacement)[0].id).toBe('one')
  })
  it('limits independent references and reports oversize Unicode instead of throwing', () => {
    let document = createMiraPromptDocument('')
    for (let index = 0; index < 8; index++) {
      const result = addMiraPresentationReference(reference(String(index)), document)
      if ('error' in result) throw new Error(result.error)
      document = result
    }
    expect(addMiraPresentationReference(reference('ninth'), document)).toHaveProperty('error')
    const large = { ...reference(), comment: '中'.repeat(4096), selectedText: '中'.repeat(8192), sourcePath: '中'.repeat(2000) + '.pptx', element: { ...reference().element, text: '中'.repeat(8192), nodeName: '中'.repeat(512), nodeId: '中'.repeat(256), nodePath: '中'.repeat(512) } }
    expect(() => addMiraPresentationReference(large, createMiraPromptDocument(''))).not.toThrow()
    expect(addMiraPresentationReference(large, createMiraPromptDocument(''))).toHaveProperty('error')
  })
  it('preserves web contexts while hiding both types from ordinary body edits', () => {
    const body = add(reference())
    const web = miraBrowserPrompt({ sessionId: 'current', browserId: 'browser', element: { pageUrl: 'https://mira.test', pageTitle: 'Page', tagName: 'button', role: 'button', accessibleName: '继续', selector: '#go', xpath: '/html/body/button', text: '继续', nearbyText: '', htmlExcerpt: '<button/>', attributes: '', style: '', rect: { x: 0, y: 0, width: 40, height: 20 } } }, body)
    if ('error' in web) throw new Error(web.error)
    body.parts.push({ type: 'reference', reference: web.reference })
    const restored = restoreMiraContextPromptDocument(serializeMiraPromptDocument(body))
    expect(miraPromptContexts(restored).map(item => item.kind).sort()).toEqual(['presentation', 'web'])
    expect(serializeMiraPromptDocument(miraContextPromptBody(restored)).trim()).toBe('原正文')
    expect(restoreMiraContextPromptDocument('  普通正文  ').parts).toEqual([{ type: 'text', text: '  普通正文  ' }])
  })
})
