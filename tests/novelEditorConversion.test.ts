import { describe, expect, it } from 'vitest'
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'

describe('novel setup editor conversion', () => {
  const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
  const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })

  it('round-trips the supported rich text formats', () => {
    const source = '# 标题\n\n段落 **加粗** 和 *斜体*\n\n> 引用\n\n- 一\n- 二\n\n```js\nconst value = 1\n```'
    const result = turndown.turndown(markdown.render(source))

    expect(result).toContain('# 标题')
    expect(result).toContain('段落 **加粗** 和 _斜体_')
    expect(result).toContain('> 引用')
    expect(result).toContain('-   一')
    expect(result).toContain('```js')
    expect(result).toContain('const value = 1')
  })
})
