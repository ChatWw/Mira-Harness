export interface MiraPromptReference {
  id: string
  kind: 'file' | 'session' | 'skill' | 'mcp'
  label: string
  value: string
  /** Actual Mira input; display labels and opaque attachment tokens are never substituted here. */
  text: string
}

export type MiraPromptPart = { type: 'text'; text: string } | { type: 'reference'; reference: MiraPromptReference }
export interface MiraPromptDocument { version: 1; parts: MiraPromptPart[] }
export interface MiraPromptSelectionRange { start: number; end: number }

const MAX_TEXT = 1_048_576
const fields = (value: unknown, names: string[]): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(name => Object.prototype.hasOwnProperty.call(value, name)))
const string = (value: unknown, max: number, nonempty = false): value is string => typeof value === 'string' && value.length <= max && (!nonempty || value.length > 0)

export function createMiraPromptDocument(text: string): MiraPromptDocument {
  return { version: 1, parts: text ? [{ type: 'text', text }] : [] }
}

export function serializeMiraPromptDocument(document: MiraPromptDocument): string {
  return document.parts.map(part => part.type === 'text' ? part.text : part.reference.text).join('')
}

/** Restore a small versioned whitelist, never arbitrary Lexical JSON, HTML or another owner's text. */
export function validateMiraPromptDocument(value: unknown, expectedText?: string): MiraPromptDocument | undefined {
  if (!fields(value, ['version', 'parts']) || value.version !== 1 || !Array.isArray(value.parts) || value.parts.length > 2048) return
  const parts: MiraPromptPart[] = []
  let length = 0
  for (const part of value.parts) {
    if (fields(part, ['type', 'text']) && part.type === 'text' && string(part.text, MAX_TEXT)) {
      parts.push({ type: 'text', text: part.text })
      length += part.text.length
    } else if (fields(part, ['type', 'reference']) && part.type === 'reference') {
      const reference = part.reference
      if (!fields(reference, ['id', 'kind', 'label', 'value', 'text']) || !string(reference.id, 4096, true) || typeof reference.kind !== 'string' || !['file', 'session', 'skill', 'mcp'].includes(reference.kind) || !string(reference.label, 512, true) || !string(reference.value, 4096) || !string(reference.text, MAX_TEXT, true)) return
      parts.push({ type: 'reference', reference: { id: reference.id, kind: reference.kind as MiraPromptReference['kind'], label: reference.label, value: reference.value, text: reference.text } })
      length += reference.text.length
    } else return
    if (length > MAX_TEXT) return
  }
  const document: MiraPromptDocument = { version: 1, parts }
  if (expectedText !== undefined && serializeMiraPromptDocument(document) !== expectedText) return
  return document
}

/** Canonical offsets cannot split a reference, including when a draft owner migrates off-screen. */
export function replaceMiraPromptDocumentRange(document: MiraPromptDocument, range: MiraPromptSelectionRange, insertion: MiraPromptPart[]): { document: MiraPromptDocument; range: MiraPromptSelectionRange } | undefined {
  const valid = validateMiraPromptDocument(document), inserted = validateMiraPromptDocument({ version: 1, parts: insertion })
  if (!valid || !inserted || !Number.isFinite(range.start) || !Number.isFinite(range.end)) return
  const length = serializeMiraPromptDocument(valid).length
  let start = Math.max(0, Math.min(length, Math.trunc(Math.min(range.start, range.end))))
  let end = Math.max(start, Math.min(length, Math.trunc(Math.max(range.start, range.end))))
  let offset = 0
  for (const part of valid.parts) {
    const size = part.type === 'text' ? part.text.length : part.reference.text.length
    if (part.type === 'reference') {
      if (start === end && start > offset && start < offset + size) start = end = start - offset < size / 2 ? offset : offset + size
      else {
        if (start > offset && start < offset + size) start = offset
        if (end > offset && end < offset + size) end = offset + size
      }
    }
    offset += size
  }
  const before: MiraPromptPart[] = [], after: MiraPromptPart[] = []
  offset = 0
  for (const part of valid.parts) {
    const size = part.type === 'text' ? part.text.length : part.reference.text.length
    if (offset + size <= start) before.push(part)
    else if (offset >= end) after.push(part)
    else if (part.type === 'text') {
      before.push({ type: 'text', text: part.text.slice(0, Math.max(0, start - offset)) })
      after.push({ type: 'text', text: part.text.slice(Math.min(size, end - offset)) })
    }
    offset += size
  }
  const parts: MiraPromptPart[] = []
  for (const part of [...before, ...inserted.parts, ...after]) {
    const previous = parts[parts.length - 1]
    if (part.type === 'text') {
      if (!part.text) continue
      if (previous?.type === 'text') previous.text += part.text
      else parts.push({ type: 'text', text: part.text })
    } else parts.push(part)
  }
  const next = validateMiraPromptDocument({ version: 1, parts })
  if (!next) return
  const caret = start + serializeMiraPromptDocument(inserted).length
  return { document: next, range: { start: caret, end: caret } }
}
