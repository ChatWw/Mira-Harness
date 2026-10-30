import { parseMiraPresentationReferences, readMiraPresentationReference, serializeMiraPresentationReference, type MiraPresentationReference } from '../../../../src/config/miraPresentation'
import { miraBrowserReferences, restoreMiraBrowserPromptDocument } from './mira-browser-reference'
import { serializeMiraPromptDocument, type MiraPromptDocument, type MiraPromptReference } from './prompt-editor-document'

export type MiraPresentationNavigation = { requestId: string; reference: MiraPresentationReference }
export const miraPresentationReferences = (document: MiraPromptDocument) => document.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'presentation' ? [part.reference] : [])
export const miraPromptContexts = (document: MiraPromptDocument) => document.parts.flatMap(part => part.type === 'reference' && ['web', 'presentation'].includes(part.reference.kind) ? [part.reference] : [])
export const miraContextPromptBody = (document: MiraPromptDocument): MiraPromptDocument => ({ version: 1, parts: document.parts.filter(part => part.type !== 'reference' || !['web', 'presentation'].includes(part.reference.kind)) })
export const withMiraPromptContexts = (document: MiraPromptDocument, references: MiraPromptReference[]): MiraPromptDocument => ({ version: 1, parts: [...miraContextPromptBody(document).parts, ...references.map(reference => ({ type: 'reference' as const, reference }))] })

function promptReference(reference: MiraPresentationReference): MiraPromptReference {
  return { id: reference.id, kind: 'presentation', label: `${reference.sourcePath.split('/').pop()} · 第 ${reference.element.slideIndex + 1} 页`,
    value: reference.sourcePath, text: serializeMiraPresentationReference(reference) }
}
export function miraPresentationReferencePayload(reference: MiraPromptReference): MiraPresentationReference | undefined {
  const parsed = parseMiraPresentationReferences(reference.text)
  const value = parsed.references[0]
  return !parsed.error && parsed.references.length === 1 && !parsed.visibleText.trim() && value?.id === reference.id && value.sourcePath === reference.value ? value : undefined
}
export function restoreMiraContextPromptDocument(text: string, skillIds?: string[], pluginIds?: string[]): MiraPromptDocument {
  const parsed = parseMiraPresentationReferences(text)
  if (parsed.error) return restoreMiraBrowserPromptDocument(text, skillIds, pluginIds)
  const body = restoreMiraBrowserPromptDocument(parsed.visibleText, skillIds, pluginIds)
  return withMiraPromptContexts(body, [...miraBrowserReferences(body), ...parsed.references.map(promptReference)])
}
function identity(reference: MiraPresentationReference) {
  const element = reference.element
  return JSON.stringify([reference.sessionId, reference.workspaceIdentity, reference.sourcePath, reference.sourceFingerprint,
    element.slidePart, element.nodeId, element.nodePath, element.rowIndex, element.cellIndex])
}
/** Replacing an existing element changes only that element's comment, never another reference. */
export function addMiraPresentationReference(value: MiraPresentationReference, document: MiraPromptDocument): MiraPromptDocument | { error: string } {
  const reference = readMiraPresentationReference(value)
  if (!reference) return { error: '演示文稿元素信息无效，请重新选择。' }
  const contexts = miraPromptContexts(document)
  const existing = contexts.findIndex(item => {
    const payload = item.kind === 'presentation' ? miraPresentationReferencePayload(item) : undefined
    return payload && identity(payload) === identity(reference)
  })
  let next: MiraPromptReference
  try { next = promptReference(existing >= 0 ? { ...reference, id: contexts[existing].id } : reference) }
  catch (cause) { return { error: cause instanceof Error ? cause.message : '元素引用内容过长，请选择较短的文字。' } }
  if (existing >= 0) contexts[existing] = next; else contexts.push(next)
  const presentation = contexts.filter(item => item.kind === 'presentation')
  const parsed = parseMiraPresentationReferences(presentation.map(item => item.text).join(''))
  if (parsed.error || parsed.references.length !== presentation.length) return { error: parsed.error || '演示文稿引用超过上限，请移除已有引用。' }
  const result = withMiraPromptContexts(document, contexts)
  if (serializeMiraPromptDocument(result).length > Math.max(100_000, serializeMiraPromptDocument(document).length)) return { error: '引用后消息超过 100000 字符，请精简草稿。' }
  return result
}
