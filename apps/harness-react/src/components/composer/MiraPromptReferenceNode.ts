/**
 * Adapted from ZCode packages/ui/src/mentions/nodes/PromptMentionNode.ts.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira uses its own canonical text and reference payload; no upstream plugin protocol is restored.
 */
import { $applyNodeReplacement, TextNode, type DOMExportOutput, type EditorConfig, type LexicalNode, type NodeKey, type SerializedTextNode } from 'lexical'
import { validateMiraPromptDocument, type MiraPromptReference } from '../../lib/prompt-editor-document'

type SerializedMiraReference = SerializedTextNode & { type: 'mira-prompt-reference'; version: 1; reference: MiraPromptReference }

export class MiraPromptReferenceNode extends TextNode {
  __reference: MiraPromptReference

  static getType(): string { return 'mira-prompt-reference' }
  static importDOM(): null { return null }
  static clone(node: MiraPromptReferenceNode): MiraPromptReferenceNode { return new MiraPromptReferenceNode(node.__reference, node.__key) }
  static importJSON(value: SerializedMiraReference): MiraPromptReferenceNode {
    const document = validateMiraPromptDocument({ version: 1, parts: [{ type: 'reference', reference: value.reference }] })
    const part = document?.parts[0]
    if (!part || part.type !== 'reference') throw new Error('Invalid Mira prompt reference')
    return $createMiraPromptReferenceNode(part.reference)
  }

  constructor(reference: MiraPromptReference, key?: NodeKey) {
    // Lexical offsets and its DOM contract always use the short, visible label.
    super(reference.label, key)
    this.__reference = { ...reference }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config)
    element.classList.add('mira-prompt-reference', `mira-prompt-reference-${this.__reference.kind}`)
    element.setAttribute('data-mira-prompt-reference', this.__reference.kind)
    element.setAttribute('spellcheck', 'false')
    element.title = this.__reference.kind === 'file' ? this.__reference.text : this.__reference.label
    return element
  }

  exportJSON(): SerializedMiraReference { return { ...super.exportJSON(), type: 'mira-prompt-reference', version: 1, reference: this.getReference() } }
  // Even if an external HTML exporter is used later, it receives only plain canonical content.
  exportDOM(): DOMExportOutput { return { element: document.createTextNode(this.getReference().text) } }
  getReference(): MiraPromptReference { return { ...this.getLatest().__reference } }
  isTextEntity(): true { return true }
  canInsertTextBefore(): false { return false }
  canInsertTextAfter(): false { return false }
}

export function $createMiraPromptReferenceNode(reference: MiraPromptReference): MiraPromptReferenceNode {
  return $applyNodeReplacement(new MiraPromptReferenceNode(reference).setMode('token'))
}
export function $isMiraPromptReferenceNode(node: LexicalNode | null | undefined): node is MiraPromptReferenceNode { return node instanceof MiraPromptReferenceNode }
