// Adapted from ZCode conversationFindHighlightDom (Apache-2.0), Copyright 2026 Z.AI Co., Ltd.
// Ranges span adjacent Markdown/code token nodes without mutating React-owned DOM.
import { taskFindOffsets, type TaskFindMatch } from './conversation-find'

const MATCH_HIGHLIGHT = 'mira-task-find'
const ACTIVE_HIGHLIGHT = 'mira-task-find-active'
type HighlightSet = Set<Range> & { priority: number }
const support = () => ({ registry: (globalThis.CSS as typeof CSS & { highlights?: Map<string, HighlightSet> })?.highlights, Constructor: (globalThis as typeof globalThis & { Highlight?: new () => HighlightSet }).Highlight })

export function clearTaskFindHighlights() {
  const { registry } = support()
  registry?.delete(MATCH_HIGHLIGHT)
  registry?.delete(ACTIVE_HIGHLIGHT)
}

export function taskFindRanges(element: HTMLElement, query: string): Range[] {
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  let text = ''
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element
      const button = parent?.closest('button')
      return button && button.dataset.streamdown !== 'link' || parent?.closest('input,textarea,select,[contenteditable="true"],[aria-hidden="true"],[hidden],.pilot-citation,[data-mira-find-ignore],[data-streamdown="code-block-header"],[data-streamdown="code-block-actions"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    },
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = text.length
      text += (node as Text).data
      nodes.push({ node: node as Text, start, end: text.length })
    } else if ((node as Element).tagName === 'BR') text += '\n'
  }
  return taskFindOffsets(text, query).flatMap(match => {
    const first = nodes.find(node => node.end > match.start)
    const last = nodes.find(node => node.end >= match.end)
    if (!first || !last) return []
    const range = document.createRange()
    range.setStart(first.node, Math.max(0, match.start - first.start))
    range.setEnd(last.node, Math.min(last.node.length, match.end - last.start))
    return [range]
  })
}

export function applyTaskFindHighlights(root: HTMLElement, query: string, active?: TaskFindMatch) {
  const { registry, Constructor } = support()
  if (!registry || !Constructor) return undefined
  const all = new Constructor(), selected = new Constructor()
  selected.priority = 1
  let activeRange: Range | undefined
  for (const element of root.querySelectorAll<HTMLElement>('[data-mira-find-target]')) {
    const ranges = taskFindRanges(element, query)
    for (const range of ranges) all.add(range)
    if (active && element.dataset.miraFindTarget === active.key) {
      activeRange = ranges[active.occurrence]
      if (activeRange) selected.add(activeRange)
    }
  }
  registry.set(MATCH_HIGHLIGHT, all)
  registry.set(ACTIVE_HIGHLIGHT, selected)
  return activeRange
}

/** Center the exact range in nested transcript/diff/code scrollers, without moving the Shell. */
export function revealTaskFindRange(range: Range, root: HTMLElement) {
  for (let element = range.startContainer.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect(), hit = range.getBoundingClientRect()
    if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) element.scrollTop += hit.top - rect.top - element.clientHeight / 2 + hit.height / 2
    if (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth && (hit.left < rect.left || hit.right > rect.right)) element.scrollLeft += hit.left - rect.left - element.clientWidth / 2 + hit.width / 2
    if (element === root) break
  }
}
