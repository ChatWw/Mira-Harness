// Adapted from ZCode conversationFindIndex (Apache-2.0), Copyright 2026 Z.AI Co., Ltd.
// Mira indexes displayed Markdown text rather than hidden markup or link destinations.
import MarkdownIt from 'markdown-it'
import { cjk } from '@streamdown/cjk'
import { defaultRehypePlugins, defaultRemarkPlugins, parseMarkdownIntoBlocks } from 'streamdown'
import remend from 'remend'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import type { Root, RootContent } from 'hast'
import type { HarnessFileChange, HarnessMessage } from '../../../../src/config/harness'
import { installHarnessCitations } from '../../../../src/utils/harnessCitations'
import type { TimelineRenderMessage } from '../components/conversation/conversation-model'
import { parseDiff } from './diff'

export type TaskFindScope = 'conversation' | 'changes'
export interface TaskFindTarget { key: string; text: string; messageId?: string; changeId?: string; streaming?: boolean }
export interface TaskFindMatch extends TaskFindTarget { occurrence: number; start: number; end: number }
export const taskFindTargetKey = (id: string, part = 'body') => JSON.stringify([id, part])
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
installHarnessCitations(markdown)
const streamingMarkdown = unified().use(remarkParse).use(cjk.remarkPluginsBefore).use(Object.values(defaultRemarkPlugins)).use(cjk.remarkPluginsAfter).use(remarkRehype, { allowDangerousHtml: true }).use(Object.values(defaultRehypePlugins))

/** Share Streamdown's public parser, incomplete-markdown repair and GFM/CJK plugins. */
export function streamingMarkdownFindText(content: string) {
  const text = (node: Root | RootContent): string => node.type === 'text' ? node.value : node.type === 'element' && ['img', 'input'].includes(node.tagName) ? '' : node.type === 'element' && node.tagName === 'br' ? '\n' : 'children' in node ? node.children.map(text).join('') : ''
  return parseMarkdownIntoBlocks(remend(content)).map(block => text(streamingMarkdown.runSync(streamingMarkdown.parse(block)) as Root)).join('')
}

export function markdownFindText(content: string, sources?: HarnessMessage['sources']) {
  const html = markdown.render(content, { sources })
  const text = html.replace(/<button\b[^>]*>[\s\S]*?<\/button>/g, '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, '')
  // Preserve literal backslashes while decoding the renderer's HTML entities.
  return markdown.utils.unescapeAll(text.replace(/\\/g, '&#92;'))
}

export function createTaskFindProjector() {
  const cache = new WeakMap<HarnessMessage, { rendererId: string; targets: TaskFindTarget[] }>()
  return (messages: TimelineRenderMessage[]) => messages.flatMap(({ original, rendererId }) => {
    const saved = cache.get(original)
    if (saved?.rendererId === rendererId) return saved.targets
    const parts = original.role === 'user' ? [{ id: 'body', text: original.content, streaming: false }]
      : original.parts !== undefined ? original.parts.flatMap(part => part.type === 'text' ? [{ id: part.id, text: part.text, streaming: part.state === 'streaming' }] : [])
        : [{ id: 'body', text: original.content, streaming: original.id.startsWith('stream-') }]
    const targets = parts.map(part => ({ key: taskFindTargetKey(rendererId, part.id), messageId: rendererId, streaming: part.streaming, text: original.role === 'user' ? part.text : part.streaming ? streamingMarkdownFindText(part.text) : markdownFindText(part.text, original.sources) }))
    cache.set(original, { rendererId, targets })
    return targets
  })
}

export function changeFindTargets(changes: Array<HarnessFileChange & { key: string }>): TaskFindTarget[] {
  return changes.flatMap(change => change.diff ? parseDiff(change.diff).lines.map((line, index) => ({ key: taskFindTargetKey(change.key, String(index)), changeId: change.key, text: line.text })) : [])
}

/** Literal, case-insensitive, non-overlapping matches; offsets always refer to the original text. */
export function taskFindOffsets(text: string, query: string): Array<{ start: number; end: number }> {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const folded = text.toLocaleLowerCase()
  let boundaries: Array<{ start: number; end: number }> | undefined
  if (folded.length !== text.length) {
    boundaries = []
    let offset = 0
    for (const character of text) {
      for (let index = 0; index < character.toLocaleLowerCase().length; index++) boundaries.push({ start: offset, end: offset + character.length })
      offset += character.length
    }
  }
  const matches: Array<{ start: number; end: number }> = []
  let cursor = 0
  while (cursor < folded.length) {
    const start = folded.indexOf(needle, cursor)
    if (start < 0) break
    const end = start + needle.length
    const match = { start: boundaries?.[start]?.start ?? start, end: boundaries?.[end - 1]?.end ?? end }
    if (matches[matches.length - 1]?.start !== match.start) matches.push(match)
    cursor = end
  }
  return matches
}

export function taskFindMatches(targets: TaskFindTarget[], query: string): TaskFindMatch[] {
  return targets.flatMap(target => taskFindOffsets(target.text, query).map((offset, occurrence) => ({ ...target, ...offset, occurrence })))
}
