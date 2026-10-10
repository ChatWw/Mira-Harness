/**
 * Lexical shell and canonical clipboard adapted from ZCode LexicalChatInput,
 * mentions/promptSerialization and PromptClipboardPlugin (Apache-2.0).
 * See third-party-licenses/zcode. Mira owns the document/selection/owner contract.
 */
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type AriaAttributes } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import {
  $addUpdateTag, $createLineBreakNode, $createParagraphNode, $createRangeSelection, $createTextNode,
  $getRoot, $getSelection, $isElementNode, $isLineBreakNode, $isRangeSelection, $isTextNode, $setSelection,
  CLEAR_HISTORY_COMMAND, COMMAND_PRIORITY_HIGH, COPY_COMMAND, CUT_COMMAND, DELETE_CHARACTER_COMMAND, HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND, PASTE_COMMAND, SKIP_DOM_SELECTION_TAG, type LexicalNode, type PointType,
} from 'lexical'
import { createMiraPromptDocument, serializeMiraPromptDocument, validateMiraPromptDocument, type MiraPromptDocument, type MiraPromptPart, type MiraPromptSelectionRange } from '../../lib/prompt-editor-document'
import { $createMiraPromptReferenceNode, $isMiraPromptReferenceNode, MiraPromptReferenceNode } from './MiraPromptReferenceNode'

export interface MiraPromptEditorHandle {
  getElement(): HTMLDivElement | null
  focus(options?: FocusOptions): void
  getSelectionRange(): MiraPromptSelectionRange
  setSelectionRange(start: number, end: number): void
  replaceRange(range: MiraPromptSelectionRange, parts: MiraPromptPart[]): MiraPromptDocument | undefined
}
export interface MiraPromptEditorProps extends Pick<AriaAttributes, 'aria-label' | 'aria-describedby' | 'aria-expanded' | 'aria-controls' | 'aria-activedescendant'> {
  text: string
  document?: MiraPromptDocument
  onChange(document: MiraPromptDocument, range: MiraPromptSelectionRange): void
  onSelectionChange?(range: MiraPromptSelectionRange): void
  disabled?: boolean
  placeholder?: string
  className?: string
  onKeyDown?(event: KeyboardEvent): void
  onPaste?(event: ClipboardEvent): void
  onError?(error: Error): void
}

interface Leaf { node: LexicalNode; start: number; end: number }
interface Layout { document: MiraPromptDocument; leaves: Leaf[]; boundaries: Map<string, number[]>; length: number }

/** One line-break node per newline; reference canonical newlines stay inside their atomic token. */
function $partNodes(parts: MiraPromptPart[]): LexicalNode[] {
  return parts.flatMap(part => {
    if (part.type === 'reference') return [$createMiraPromptReferenceNode(part.reference)]
    const nodes: LexicalNode[] = []
    for (const [index, line] of part.text.split('\n').entries()) {
      if (index) nodes.push($createLineBreakNode())
      if (line) nodes.push($createTextNode(line))
    }
    return nodes
  })
}
function $restore(document: MiraPromptDocument): void {
  const paragraph = $createParagraphNode().append(...$partNodes(document.parts))
  $getRoot().clear().append(paragraph)
}
function $layout(): Layout {
  const parts: MiraPromptPart[] = [], leaves: Leaf[] = [], boundaries = new Map<string, number[]>()
  let length = 0
  const appendText = (text: string) => {
    const previous = parts[parts.length - 1]
    if (previous?.type === 'text') previous.text += text
    else if (text) parts.push({ type: 'text', text })
    length += text.length
  }
  const walk = (node: LexicalNode) => {
    const start = length
    if ($isMiraPromptReferenceNode(node)) {
      const reference = node.getReference()
      parts.push({ type: 'reference', reference }); length += reference.text.length
    } else if ($isElementNode(node)) {
      const positions = [length]
      for (const [index, child] of node.getChildren().entries()) {
        if (node === $getRoot() && index > 0) appendText('\n')
        walk(child); positions.push(length)
      }
      boundaries.set(node.getKey(), positions)
      return
    } else appendText(node.getTextContent())
    leaves.push({ node, start, end: length })
  }
  walk($getRoot())
  return { document: { version: 1, parts }, leaves, boundaries, length }
}
function pointOffset(point: PointType, layout: Layout, bias: 'start' | 'end' | 'nearest'): number {
  if (point.type === 'element') {
    const positions = layout.boundaries.get(point.key)
    return positions?.[Math.min(point.offset, positions.length - 1)] ?? 0
  }
  const leaf = layout.leaves.find(item => item.node.getKey() === point.key)
  if (!leaf) return 0
  if (!$isMiraPromptReferenceNode(leaf.node)) return Math.min(leaf.end, leaf.start + point.offset)
  const size = leaf.node.getTextContentSize()
  if (point.offset <= 0) return leaf.start
  if (point.offset >= size) return leaf.end
  return bias === 'start' || (bias === 'nearest' && point.offset < size / 2) ? leaf.start : leaf.end
}
function $selectionRange(layout = $layout()): MiraPromptSelectionRange | undefined {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  if (selection.isCollapsed()) {
    const offset = pointOffset(selection.anchor, layout, 'nearest')
    return { start: offset, end: offset }
  }
  const [start, end] = selection.isBackward() ? [selection.focus, selection.anchor] : [selection.anchor, selection.focus]
  return { start: pointOffset(start, layout, 'start'), end: pointOffset(end, layout, 'end') }
}
function $setRange(range: MiraPromptSelectionRange, layout = $layout()): MiraPromptSelectionRange {
  const selection = $createRangeSelection()
  const start = Math.max(0, Math.min(layout.length, Number.isFinite(range.start) ? range.start : 0))
  const end = Math.max(start, Math.min(layout.length, Number.isFinite(range.end) ? range.end : start))
  const setPoint = (point: PointType, offset: number, bias: 'start' | 'end' | 'nearest') => {
    for (const leaf of layout.leaves) {
      if (offset < leaf.start || offset > leaf.end) continue
      if ($isTextNode(leaf.node)) {
        let local = offset - leaf.start
        if ($isMiraPromptReferenceNode(leaf.node)) {
          local = local <= 0 || (local < leaf.end - leaf.start && (bias === 'start' || (bias === 'nearest' && local < (leaf.end - leaf.start) / 2))) ? 0 : leaf.node.getTextContentSize()
        }
        point.set(leaf.node.getKey(), local, 'text'); return
      }
      if ($isLineBreakNode(leaf.node)) {
        point.set(leaf.node.getParentOrThrow().getKey(), leaf.node.getIndexWithinParent() + (offset > leaf.start ? 1 : 0), 'element'); return
      }
    }
    const paragraph = $getRoot().getLastChild()
    point.set(paragraph?.getKey() ?? 'root', $isElementNode(paragraph) ? paragraph.getChildrenSize() : 0, 'element')
  }
  setPoint(selection.anchor, start, start === end ? 'nearest' : 'start')
  setPoint(selection.focus, end, start === end ? 'nearest' : 'end')
  $setSelection(selection)
  return $selectionRange(layout) ?? { start, end }
}
function sameDocument(a: MiraPromptDocument, b: MiraPromptDocument): boolean {
  return a.parts.length === b.parts.length && a.parts.every((part, index) => {
    const other = b.parts[index]
    if (part.type === 'text') return other.type === 'text' && part.text === other.text
    return other.type === 'reference' && Object.entries(part.reference).every(([key, value]) => other.reference[key as keyof typeof other.reference] === value)
  })
}

const Bridge = forwardRef<MiraPromptEditorHandle, MiraPromptEditorProps>(function Bridge(props, ref) {
  const [editor] = useLexicalComposerContext()
  const current = useRef(props); current.current = props
  const range = useRef<MiraPromptSelectionRange>({ start: 0, end: 0 })
  const ownsFocus = () => Boolean(editor.getRootElement()?.contains(window.document.activeElement))
  const reportError = (error: unknown) => current.current.onError?.(error instanceof Error ? error : new Error(String(error)))

  useImperativeHandle(ref, () => ({
    getElement: () => editor.getRootElement() as HTMLDivElement | null,
    focus: options => { editor.getRootElement()?.focus(options) },
    getSelectionRange: () => editor.getEditorState().read(() => $selectionRange() ?? range.current),
    setSelectionRange: (start, end) => { editor.update(() => { range.current = $setRange({ start, end }) }, { discrete: true, tag: ownsFocus() ? undefined : SKIP_DOM_SELECTION_TAG }) },
    replaceRange: (selection, parts) => {
      // Explicit business transactions may finish while native input is locked for attachment staging.
      const insertion = validateMiraPromptDocument({ version: 1, parts })
      if (!insertion) { reportError(new Error('Invalid prompt reference')); return }
      let result: MiraPromptDocument | undefined
      editor.update(() => {
        const layout = $layout(), normalized = $setRange(selection, layout)
        if (layout.length - (normalized.end - normalized.start) + serializeMiraPromptDocument(insertion).length > 1_048_576) { reportError(new Error('Prompt is too long')); return }
        const active = $getSelection()
        if (!$isRangeSelection(active)) return
        if (parts.length) active.insertNodes($partNodes(insertion.parts))
        else active.removeText()
        result = $layout().document
      }, { discrete: true, tag: [HISTORY_PUSH_TAG, ...(ownsFocus() ? [] : [SKIP_DOM_SELECTION_TAG])] })
      return result
    },
  }), [editor])

  useLayoutEffect(() => editor.setEditable(!props.disabled), [editor, props.disabled])
  useLayoutEffect(() => {
    const validated = validateMiraPromptDocument(props.document, props.text)
    const existing = editor.getEditorState().read(() => $layout().document)
    // Plain text echoes cannot downgrade local references or clear native undo/IME state.
    if (serializeMiraPromptDocument(existing) === props.text && (!validated || sameDocument(existing, validated))) return
    const next = validated ?? createMiraPromptDocument(props.text)
    editor.update(() => {
      $restore(next)
      if (ownsFocus()) range.current = $setRange(range.current)
      else $setSelection(null)
    }, { discrete: true, tag: ['mira-prompt-controlled', ...(ownsFocus() ? [] : [SKIP_DOM_SELECTION_TAG])] })
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
  }, [editor, props.text, props.document])

  useLayoutEffect(() => {
    const unregisterUpdate = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
      editorState.read(() => {
        const layout = $layout(), nextRange = $selectionRange(layout)
        if (nextRange && (nextRange.start !== range.current.start || nextRange.end !== range.current.end)) {
          range.current = nextRange; current.current.onSelectionChange?.(nextRange)
        }
        if (!tags.has('mira-prompt-controlled') && (dirtyElements.size || dirtyLeaves.size)) current.current.onChange(layout.document, nextRange ?? range.current)
      })
    })
    const unregisterKeys = editor.registerCommand(KEY_DOWN_COMMAND, event => {
      // A native composition confirmation must not become a submit or Lexical newline.
      const composingEnter = event.key === 'Enter' && (event.isComposing || editor.isComposing())
      if (!composingEnter || event.isComposing) current.current.onKeyDown?.(event)
      return event.defaultPrevented || composingEnter
    }, COMMAND_PRIORITY_HIGH)
    const unregisterDelete = editor.registerCommand(DELETE_CHARACTER_COMMAND, backward => {
      const active = $getSelection(), layout = $layout(), selection = $selectionRange(layout)
      if (!$isRangeSelection(active) || !selection) return false
      if (active.isCollapsed()) {
        const anchorNode = active.anchor.getNode()
        const inside = $isMiraPromptReferenceNode(anchorNode) && (backward ? active.anchor.offset > 0 : active.anchor.offset < anchorNode.getTextContentSize())
        const token = layout.leaves.find(leaf => $isMiraPromptReferenceNode(leaf.node) && (inside ? leaf.node.is(anchorNode) : backward ? leaf.end === selection.start : leaf.start === selection.start))
        if (!token) return false
        $setRange({ start: token.start, end: token.end }, layout)
      } else {
        if (!layout.leaves.some(leaf => $isMiraPromptReferenceNode(leaf.node) && leaf.start < selection.end && leaf.end > selection.start)) return false
        $setRange(selection, layout)
      }
      $addUpdateTag(HISTORY_PUSH_TAG)
      const atomic = $getSelection(); if ($isRangeSelection(atomic)) atomic.removeText()
      return true
    }, COMMAND_PRIORITY_HIGH)
    const copy = (event: ClipboardEvent | KeyboardEvent | null, cut: boolean) => {
      const layout = $layout(), selection = $selectionRange(layout)
      if (!selection || selection.start === selection.end || !event || !('clipboardData' in event) || !event.clipboardData) return false
      try { event.clipboardData.setData('text/plain', serializeMiraPromptDocument(layout.document).slice(selection.start, selection.end)) }
      catch (error) { event.preventDefault(); reportError(error); return true }
      event.preventDefault()
      if (cut && editor.isEditable()) {
        $addUpdateTag(HISTORY_PUSH_TAG); $setRange(selection, layout)
        const active = $getSelection(); if ($isRangeSelection(active)) active.removeText()
      }
      return true
    }
    const unregisterCopy = editor.registerCommand(COPY_COMMAND, event => copy(event, false), COMMAND_PRIORITY_HIGH)
    const unregisterCut = editor.registerCommand(CUT_COMMAND, event => copy(event, true), COMMAND_PRIORITY_HIGH)
    const unregisterPaste = editor.registerCommand(PASTE_COMMAND, event => {
      if (!('clipboardData' in event)) return false
      current.current.onPaste?.(event)
      if (event.defaultPrevented) return true
      event.preventDefault()
      if (!editor.isEditable()) return true
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const layout = $layout(), selection = $selectionRange(layout)
      if (!selection) return true
      if (layout.length - (selection.end - selection.start) + text.length > 1_048_576) { reportError(new Error('Prompt is too long')); return true }
      $addUpdateTag(HISTORY_PUSH_TAG); $setRange(selection, layout)
      const active = $getSelection(); if ($isRangeSelection(active)) active.insertNodes($partNodes(createMiraPromptDocument(text).parts))
      return true
    }, COMMAND_PRIORITY_HIGH)
    return () => { unregisterUpdate(); unregisterKeys(); unregisterDelete(); unregisterCopy(); unregisterCut(); unregisterPaste() }
  }, [editor])
  return null
})

export const MiraPromptEditor = forwardRef<MiraPromptEditorHandle, MiraPromptEditorProps>(function MiraPromptEditor(props, ref) {
  const latest = useRef(props); latest.current = props
  const initialConfig = useRef({
    namespace: 'MiraPrompt', nodes: [MiraPromptReferenceNode], editable: !props.disabled,
    onError: (error: Error) => { latest.current.onError?.(error) },
    editorState: () => { $restore(validateMiraPromptDocument(props.document, props.text) ?? createMiraPromptDocument(props.text)); $setSelection(null) },
  })
  return <LexicalComposer initialConfig={initialConfig.current}>
    <PlainTextPlugin ErrorBoundary={LexicalErrorBoundary} contentEditable={<ContentEditable
      className={['mira-prompt-editor', props.className].filter(Boolean).join(' ')} role="textbox" aria-multiline="true"
      aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} aria-expanded={props['aria-expanded']}
      aria-controls={props['aria-controls']} aria-activedescendant={props['aria-activedescendant']}
      data-placeholder={props.placeholder} data-empty={props.text.length === 0 ? true : undefined} spellCheck
    />} />
    <HistoryPlugin />
    <Bridge {...props} ref={ref} />
  </LexicalComposer>
})
