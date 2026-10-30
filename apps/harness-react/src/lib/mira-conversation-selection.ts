import type { MiraPromptDocument, MiraPromptReference } from './prompt-editor-document'

export const MIRA_SELECTION_MAX_LENGTH = 8_000
export type MiraSelectionKind = 'user' | 'assistant' | 'reasoning' | 'tool'
export interface MiraConversationSelection {
  sessionId: string
  messageId: string
  regionId: string
  kind: MiraSelectionKind
  text: string
}
const labels: Record<MiraSelectionKind, string> = { user: '用户消息', assistant: '助手回复', reasoning: '思考过程', tool: '工具记录' }
const excluded = 'button, input, textarea, select, summary, [role="button"], [role="dialog"], [contenteditable]:not([contenteditable="false"]), [data-mira-selection-menu]'
const element = (node: Node) => node instanceof Element ? node : node.parentElement

export function inspectMiraConversationSelection(root: HTMLElement, sessionId: string) {
  if (root.ownerDocument.querySelector('[role="dialog"][aria-modal="true"]')) return
  const selection = root.ownerDocument.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return
  const range = selection.getRangeAt(0)
  const start = element(range.startContainer), end = element(range.endContainer)
  if (start?.closest(excluded) || end?.closest(excluded)) return
  const region = start?.closest<HTMLElement>('[data-mira-selectable]')
  if (!region || region !== end?.closest('[data-mira-selectable]') || !root.contains(region)) return
  const row = region.closest<HTMLElement>('[data-renderer-message-id]')
  const kind = region.dataset.miraSelectable as MiraSelectionKind
  const text = selection.toString().trim()
  if (!row || !root.contains(row) || !row.dataset.rendererMessageId || !Object.prototype.hasOwnProperty.call(labels, kind) || !text) return
  const rect = range.getBoundingClientRect()
  if (!rect.width && !rect.height) return
  return {
    reference: { sessionId, messageId: row.dataset.rendererMessageId, regionId: region.dataset.miraSelectionRegion ?? kind, kind, text } satisfies MiraConversationSelection,
    rect: { center: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom },
  }
}

export function miraSelectionPrompt(reference: MiraConversationSelection, document: MiraPromptDocument): { reference: MiraPromptReference; duplicate: boolean } | { error: string } {
  const text = reference.text.trim()
  if (!text || text.length > MIRA_SELECTION_MAX_LENGTH) return { error: '单个引用最多 8000 字，请缩小选区' }
  const value = JSON.stringify([reference.sessionId, reference.messageId, reference.regionId, reference.kind])
  const canonical = `【引用片段：${labels[reference.kind]}】\n${text}\n【引用结束】`
  const quotes = document.parts.flatMap(part => part.type === 'reference' && part.reference.kind === 'selection' ? [part.reference] : [])
  const duplicate = quotes.some(quote => quote.value === value && quote.text === canonical)
  if (!duplicate && quotes.length >= 8) return { error: '最多添加 8 个引用，请先删除不需要的片段' }
  if (!duplicate && quotes.reduce((length, quote) => length + (quote.text.match(/^【引用片段：[^\n]+】\n([\s\S]*)\n【引用结束】$/)?.[1].length ?? quote.text.length), text.length) > 16_000) return { error: '引用总长度最多 16000 字，请缩短或删除已有引用' }
  return { duplicate, reference: { id: crypto.randomUUID(), kind: 'selection', label: `引用 · ${text.replace(/\s+/g, ' ').slice(0, 36)}`, value, text: canonical } }
}
