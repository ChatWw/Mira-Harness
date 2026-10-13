/** A quoted presentation element is scoped to one task and one exact file version. */
export interface MiraPresentationReference {
  version: 1
  id: string
  sessionId: string
  workspaceIdentity: string
  sourcePath: string
  sourceFingerprint: string
  element: {
    slideIndex: number; slidePart: string; nodeId: string; nodePath?: string; nodeName: string
    nodeType: 'shape' | 'picture' | 'chart' | 'table' | 'table-cell'
    text?: string; bounds: { x: number; y: number; width: number; height: number }; zIndex: number
    rowIndex?: number; cellIndex?: number
  }
  comment: string
  selectedText?: string
  capturedAt: number
}

export const MIRA_PRESENTATION_REFERENCE_LIMIT = 8
export const MIRA_PRESENTATION_REFERENCE_BYTES = 64 * 1024
const fingerprint = /^sha256:[a-f0-9]{64}$/
function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key))
}
function string(value: unknown, limit: number, empty = false): value is string {
  return typeof value === 'string' && (empty || value.length > 0) && value.length <= limit && !value.includes('\0')
}
function index(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100000 }
function relativePath(value: unknown): value is string {
  return string(value, 2048) && !value.includes('\\') && !value.startsWith('/') && !/^[a-z][a-z\d+.-]*:/i.test(value)
    && value.split('/').every(part => !!part && part !== '.' && part !== '..')
}
export function readMiraPresentationReference(value: unknown): MiraPresentationReference | undefined {
  if (!record(value, ['version', 'id', 'sessionId', 'workspaceIdentity', 'sourcePath', 'sourceFingerprint', 'element', 'comment', 'selectedText', 'capturedAt'])
    || value.version !== 1 || !string(value.id, 128) || !string(value.sessionId, 256)
    || typeof value.workspaceIdentity !== 'string' || !fingerprint.test(value.workspaceIdentity)
    || typeof value.sourceFingerprint !== 'string' || !fingerprint.test(value.sourceFingerprint)
    || !relativePath(value.sourcePath) || !/\.pptx$/i.test(value.sourcePath)
    || !string(value.comment, 4096, true) || value.selectedText !== undefined && !string(value.selectedText, 8192, true)
    || !Number.isSafeInteger(value.capturedAt) || Number(value.capturedAt) < 0 || Number(value.capturedAt) > 8640000000000000) return
  const element = value.element
  if (!record(element, ['slideIndex', 'slidePart', 'nodeId', 'nodePath', 'nodeName', 'nodeType', 'text', 'bounds', 'zIndex', 'rowIndex', 'cellIndex'])
    || !index(element.slideIndex) || !string(element.slidePart, 512) || !/^ppt\/slides\/slide[1-9]\d*\.xml$/.test(element.slidePart)
    || !string(element.nodeId, 256) || !string(element.nodeName, 512, true)
    || element.nodePath !== undefined && !string(element.nodePath, 512)
    || !['shape', 'picture', 'chart', 'table', 'table-cell'].includes(String(element.nodeType))
    || element.text !== undefined && !string(element.text, 8192, true) || !index(element.zIndex)
    || element.rowIndex !== undefined && !index(element.rowIndex) || element.cellIndex !== undefined && !index(element.cellIndex)) return
  if (element.nodeType === 'table-cell' && (!index(element.rowIndex) || !index(element.cellIndex))) return
  const bounds = element.bounds
  if (!record(bounds, ['x', 'y', 'width', 'height']) || !['x', 'y', 'width', 'height'].every(key => typeof bounds[key] === 'number' && Number.isFinite(bounds[key]) && Math.abs(Number(bounds[key])) <= 10000000)
    || Number(bounds.width) < 0 || Number(bounds.height) < 0) return
  return value as unknown as MiraPresentationReference
}

function byteLength(value: string) { return new TextEncoder().encode(value).byteLength }
export function serializeMiraPresentationReference(reference: MiraPresentationReference): string {
  if (!readMiraPresentationReference(reference)) throw new Error('演示文稿元素引用无效')
  const json = JSON.stringify(reference)
  if (byteLength(json) > MIRA_PRESENTATION_REFERENCE_BYTES) throw new Error('演示文稿元素引用超过 64 KiB 上限')
  const fence = '`'.repeat(Math.max(3, ...Array.from(json.matchAll(/`+/g), match => match[0].length + 1)))
  return `\n\n演示文稿元素引用：\n${fence}json\n${json}\n${fence}\n`
}

/** Malformed blocks remain ordinary message text, never silently disappear. */
export function parseMiraPresentationReferences(text: string): { references: MiraPresentationReference[]; visibleText: string; error?: string } {
  const references: MiraPresentationReference[] = []
  let bytes = 0
  let error: string | undefined
  const visibleText = text.replace(/(?:\n\n|^)演示文稿元素引用：[ \t]*\r?\n(`{3,})json[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?=\r?\n|$)\n?/gm, (block: string, _fence: string, json: string) => {
    let value: unknown
    try { value = JSON.parse(json) } catch { return block }
    const reference = readMiraPresentationReference(value)
    if (!reference) return block
    const nextBytes = byteLength(json)
    if (references.length >= MIRA_PRESENTATION_REFERENCE_LIMIT) { error = '最多引用 8 个演示文稿元素'; return block }
    if (bytes + nextBytes > MIRA_PRESENTATION_REFERENCE_BYTES) { error = '演示文稿元素引用超过 64 KiB 上限'; return block }
    references.push(reference); bytes += nextBytes
    return ''
  })
  return { references, visibleText, ...(error ? { error } : {}) }
}
