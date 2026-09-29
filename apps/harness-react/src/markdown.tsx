import { useMemo, useState, type MouseEvent } from 'react'
import MarkdownIt from 'markdown-it'
import type { HarnessSource } from '../../../src/config/harness'
import { installHarnessCitations, renderHarnessMarkdown } from '../../../src/utils/harnessCitations'

// 与 Vue 版 HarnessMessageItem 保持同一渲染配置与代码块结构，保证视觉与复制行为一致。
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const className = token.info ? ` class="${markdown.utils.escapeHtml('language-' + token.info.trim())}"` : ''
  return `<div class="markdown-code-block"><button type="button" class="markdown-code-copy" data-code="${encodeURIComponent(token.content)}" aria-label="复制代码" title="复制代码"><svg class="markdown-code-copy__icon" aria-hidden="true" viewBox="0 0 1024 1024"><path fill="currentColor" d="M768 832a128 128 0 0 1-128 128H192A128 128 0 0 1 64 832V384a128 128 0 0 1 128-128v64a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64z"/><path fill="currentColor" d="M384 128a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64V192a64 64 0 0 0-64-64zm0-64h448a128 128 0 0 1 128 128v448a128 128 0 0 1-128 128H384a128 128 0 0 1-128-128V192A128 128 0 0 1 384 64"/></svg></button><pre><code${className}>${markdown.utils.escapeHtml(token.content)}</code></pre></div>\n`
}
installHarnessCitations(markdown)

/**
 * 助手消息正文：markdown-it 渲染 + 引用角标 + 代码块复制。
 * 点击行为沿用 Vue 版的委托处理：引用按钮切换来源卡，复制按钮写剪贴板。
 */
export function MarkdownContent({ content, sources }: { content: string; sources?: HarnessSource[] }) {
  const html = useMemo(() => renderHarnessMarkdown(markdown, content, sources), [content, sources])
  const [citation, setCitation] = useState<HarnessSource>()
  async function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    const marker = target.closest<HTMLButtonElement>('.citation-marker button')
    if (marker) {
      const index = Number(marker.dataset.citationIndex)
      const source = sources?.find(item => item.index === index)
      setCitation(current => (source && current !== source ? source : undefined))
      return
    }
    const copyButton = target.closest<HTMLButtonElement>('.markdown-code-copy')
    if (!copyButton?.dataset.code) return
    try {
      await navigator.clipboard.writeText(decodeURIComponent(copyButton.dataset.code))
      copyButton.dataset.copied = 'true'
      copyButton.setAttribute('aria-label', '已复制代码')
      window.setTimeout(() => { delete copyButton.dataset.copied; copyButton.setAttribute('aria-label', '复制代码') }, 1600)
    } catch { /* 剪贴板不可用时保持按钮原状 */ }
  }
  return <div className="pilot-markdown-wrap">
    <div className="pilot-markdown" onClick={event => void handleClick(event)} dangerouslySetInnerHTML={{ __html: html }} />
    {citation && <aside className="pilot-citation" role="note">
      <button type="button" className="pilot-citation__close" aria-label="关闭来源" onClick={() => setCitation(undefined)}>×</button>
      <strong>{citation.title || citation.url}</strong>
      {citation.snippet && <p>{citation.snippet}</p>}
      {citation.url && <a href={citation.url} target="_blank" rel="noreferrer">{citation.url}</a>}
    </aside>}
  </div>
}
