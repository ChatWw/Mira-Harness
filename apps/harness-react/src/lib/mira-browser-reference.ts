import { readMiraBrowserElement, type MiraBrowserElement, type MiraBrowserElementReference } from '../../../../src/platform/miraBrowserPicker'
import type { MiraPromptDocument, MiraPromptReference } from './prompt-editor-document'
import { restoreMiraSkillPromptDocument } from './mira-skill-reference'
import { restoreMiraPluginCommand, restoreMiraPluginReferences } from './mira-plugin-reference'
import { restoreMiraAgentReferences } from './mira-agent-reference'

export const miraBrowserReferences = (document: MiraPromptDocument) => document.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'web' ? [part.reference] : [])
export const miraBrowserPromptBody = (document: MiraPromptDocument): MiraPromptDocument => ({ version: 1, parts: document.parts.filter(part => part.type !== 'reference' || part.reference.kind !== 'web') })
export const withMiraBrowserReferences = (document: MiraPromptDocument, references: MiraPromptReference[]): MiraPromptDocument => ({ version: 1, parts: [...miraBrowserPromptBody(document).parts, ...references.map(reference => ({ type: 'reference' as const, reference }))] })

function browserSnapshot(element: MiraBrowserElement) {
  const body = JSON.stringify(element, null, 2)
  const fence = '`'.repeat(Math.max(3, ...Array.from(body.matchAll(/`+/g), match => match[0].length + 1)))
  return `\n\n网页元素快照：\n${fence}json\n${body}\n${fence}\n`
}

/** Shared by restored drafts and sent messages. Malformed/plain text remains visible. */
export function parseMiraBrowserSnapshots(text: string) {
  const references: MiraPromptReference[] = []
  const visibleText = text.replace(/(?:^|\n\n)网页元素快照：\n(`{3,})json\n([\s\S]*?)\n\1(?:\n|$)/g, (block: string, _fence: string, body: string, offset: number) => {
    if (references.length >= 8 || body.length > 40_000) return block
    let element: MiraBrowserElement | undefined
    try { element = readMiraBrowserElement(JSON.parse(body)) } catch { return block }
    if (!element) return block
    references.push({ id: `mira-web-snapshot-${offset}`, kind: 'web', label: `网页：${element.tagName} ${element.accessibleName || element.selector}`.trim().slice(0, 80), value: element.pageUrl, text: block })
    return ''
  })
  return { visibleText, references }
}

export function restoreMiraBrowserPromptDocument(text: string, skillIds?: string[], pluginIds?: string[]): MiraPromptDocument {
  const { visibleText, references } = parseMiraBrowserSnapshots(text)
  return { version: 1, parts: [...restoreMiraPluginCommand(restoreMiraAgentReferences(restoreMiraPluginReferences(restoreMiraSkillPromptDocument(visibleText, skillIds), pluginIds))).parts, ...references.map(reference => ({ type: 'reference' as const, reference }))] }
}

export function miraBrowserReferenceElement(reference: MiraPromptReference) {
  const match = /^(?:\n\n)?网页元素快照：\n(`{3,})json\n([\s\S]*?)\n\1\n?$/.exec(reference.text)
  if (!match) return
  try { return readMiraBrowserElement(JSON.parse(match[2])) } catch { return }
}

export function miraBrowserPrompt(selection: MiraBrowserElementReference, document: MiraPromptDocument): { reference: MiraPromptReference; duplicate: boolean } | { error: string } {
  const element = readMiraBrowserElement(selection.element)
  if (!element) return { error: '网页元素信息无效，请重新选择。' }
  const text = browserSnapshot(element)
  const existing = miraBrowserReferences(document)
  const duplicate = existing.find(item => item.text.trim() === text.trim())
  if (duplicate) return { reference: duplicate, duplicate: true }
  if (existing.length >= 8) return { error: '最多引用 8 个网页元素，请先删除已有引用。' }
  if (existing.reduce((size, item) => size + item.text.length, text.length) > 64_000) return { error: '网页元素上下文超过 64000 字符，请先删除已有引用。' }
  return { duplicate: false, reference: { id: crypto.randomUUID(), kind: 'web', label: `网页：${element.tagName} ${element.accessibleName || element.selector}`.trim().slice(0, 80), value: element.pageUrl, text } }
}
