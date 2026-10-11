import type { MiraPromptDocument, MiraPromptPart, MiraPromptReference } from './prompt-editor-document'

/** The destination carries catalog identity; labels never select a filesystem path. */
export function miraSkillReference(id: string, label: string): MiraPromptReference {
  const escaped = label.replace(/([\\\[\]])/g, '\\$1').replace(/[\r\n]/g, ' ')
  return { id: crypto.randomUUID(), kind: 'skill', label, value: id, text: `[$${escaped}](mira-skill:${encodeURIComponent(id)})` }
}

/** Recover chips after queue withdrawal or plain-text message editing; runtime validates identity. */
export function restoreMiraSkillPromptDocument(text: string, skillIds?: string[]): MiraPromptDocument {
  const parts: MiraPromptPart[] = []
  let offset = 0
  for (const match of text.matchAll(/\[\$((?:\\.|[^\\\]\r\n])+)\]\(mira-skill:([a-zA-Z0-9%._~-]+)\)/g)) {
    let value: string
    try { value = decodeURIComponent(match[2]) } catch { continue }
    if (!value || value.length > 128) continue
    if (skillIds && !skillIds.includes(value)) continue
    if (match.index! > offset) parts.push({ type: 'text', text: text.slice(offset, match.index) })
    parts.push({ type: 'reference', reference: { id: `mira-skill-${match.index}`, kind: 'skill', label: match[1].replace(/\\(.)/g, '$1'), value, text: match[0] } })
    offset = match.index! + match[0].length
  }
  if (offset < text.length) parts.push({ type: 'text', text: text.slice(offset) })
  return { version: 1, parts }
}
