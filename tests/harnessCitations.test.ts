import { describe, expect, it } from 'vitest'
import MarkdownIt from 'markdown-it'
import { installHarnessCitations, renderHarnessMarkdown } from '../src/utils/harnessCitations'

function renderer() {
  const markdown = new MarkdownIt({ html: false })
  installHarnessCitations(markdown)
  return markdown
}

describe('Harness citations markdown', () => {
  it('renders only source-backed text markers as citation buttons', () => {
    const html = renderHarnessMarkdown(renderer(), '结论[1]，未知[9]。', [{ index: 1, title: '来源', url: 'https://example.com' }])

    expect(html).toContain('data-citation-index="1"')
    expect(html).toContain('未知[9]')
  })

  it('does not convert markers inside code or links', () => {
    const html = renderHarnessMarkdown(renderer(), '`[1]`\n\n[链接 [1]](https://example.com)\n\n正文[1]', [{ index: 1, title: '来源', url: 'https://example.com' }])

    expect(html.match(/data-citation-index="1"/g)).toHaveLength(1)
    expect(html).toContain('<code>[1]</code>')
  })

  it('never embeds source fields into generated HTML', () => {
    const html = renderHarnessMarkdown(renderer(), '正文[1]', [{ index: 1, title: '<img src=x onerror=alert(1)>', url: 'https://example.com/?q=&quot;' }])

    expect(html).not.toContain('<img')
    expect(html).not.toContain('example.com')
  })
})
