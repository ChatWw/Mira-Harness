import MarkdownIt from 'markdown-it'
import type { HarnessSource } from '@/config/harness'

type CitationEnvironment = { sources?: HarnessSource[] }
type MarkdownInstance = InstanceType<typeof MarkdownIt>

export function installHarnessCitations(markdown: MarkdownInstance) {
  markdown.core.ruler.after('inline', 'harness_citations', (state) => {
    const indexes = new Set((state.env as CitationEnvironment | undefined)?.sources?.map(source => source.index) || [])
    if (!indexes.size) return
    for (const block of state.tokens) {
      if (!block.children) continue
      let linkDepth = 0
      const children = []
      for (const token of block.children) {
        if (token.type === 'link_open') linkDepth++
        if (token.type !== 'text' || linkDepth) {
          children.push(token)
        } else {
          let cursor = 0
          for (const match of token.content.matchAll(/\[(\d+)\]/g)) {
            const index = Number(match[1])
            if (!indexes.has(index) || match.index === undefined) continue
            if (match.index > cursor) {
              const text = new state.Token('text', '', 0)
              text.content = token.content.slice(cursor, match.index)
              children.push(text)
            }
            const citation = new state.Token('harness_citation', '', 0)
            citation.meta = { index }
            children.push(citation)
            cursor = match.index + match[0].length
          }
          if (cursor < token.content.length) {
            const text = new state.Token('text', '', 0)
            text.content = token.content.slice(cursor)
            children.push(text)
          }
        }
        if (token.type === 'link_close') linkDepth = Math.max(0, linkDepth - 1)
      }
      block.children = children
    }
  })
  markdown.renderer.rules.harness_citation = (tokens, index) => {
    const citationIndex = Number(tokens[index].meta?.index)
    return `<sup class="citation-marker"><button type="button" data-citation-index="${citationIndex}" aria-label="查看来源 ${citationIndex}">[${citationIndex}]</button></sup>`
  }
}

export function renderHarnessMarkdown(markdown: MarkdownInstance, content: string, sources?: HarnessSource[]) {
  return markdown.render(content, { sources })
}
