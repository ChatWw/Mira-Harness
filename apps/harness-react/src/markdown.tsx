import { useMemo, useState, type MouseEvent } from 'react'
import MarkdownIt from 'markdown-it'
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { Streamdown } from 'streamdown'
import type { BundledTheme } from 'shiki'
import type { HarnessSource } from '../../../src/config/harness'
import { installHarnessCitations, renderHarnessMarkdown } from '../../../src/utils/harnessCitations'

// 流式管线与 ZCode 相同：streamdown（CJK 断行 + shiki 代码高亮）。
// 完成态走 markdown-it：承载引用角标（harnessCitations）与代码复制按钮。
const staticMarkdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
staticMarkdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const className = token.info ? ` class="${staticMarkdown.utils.escapeHtml('language-' + token.info.trim())}"` : ''
  return `<div class="markdown-code-block"><button type="button" class="markdown-code-copy" data-code="${encodeURIComponent(token.content)}" aria-label="复制代码" title="复制代码"><svg class="markdown-code-copy__icon" aria-hidden="true" viewBox="0 0 1024 1024"><path fill="currentColor" d="M768 832a128 128 0 0 1-128 128H192A128 128 0 0 1 64 832V384a128 128 0 0 1 128-128v64a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64z"/><path fill="currentColor" d="M384 128a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64V192a64 64 0 0 0-64-64zm0-64h448a128 128 0 0 1 128 128v448a128 128 0 0 1-128 128H384a128 128 0 0 1-128-128V192A128 128 0 0 1 384 64"/></svg></button><pre><code${className}>${staticMarkdown.utils.escapeHtml(token.content)}</code></pre></div>\n`
}
installHarnessCitations(staticMarkdown)

const streamdownPlugins = { cjk, code }
const shikiTheme: [BundledTheme, BundledTheme] = ['github-light', 'github-dark']

export function MessageMarkdown({ content, sources, streaming }: { content: string; sources?: HarnessSource[]; streaming?: boolean }) {
  if (streaming) {
    return <div className="message-markdown size-full text-ui-base leading-[1.75] tracking-wide [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Streamdown mode="streaming" parseIncompleteMarkdown plugins={streamdownPlugins} shikiTheme={shikiTheme} animated={false} isAnimating={false}>{content}</Streamdown>
    </div>
  }
  return <StaticMarkdown content={content} sources={sources} />
}

function StaticMarkdown({ content, sources }: { content: string; sources?: HarnessSource[] }) {
  const html = useMemo(() => renderHarnessMarkdown(staticMarkdown, content, sources), [content, sources])
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
  return <div className="message-markdown size-full text-ui-base leading-[1.75] tracking-wide [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
    <div className="pilot-markdown" onClick={event => void handleClick(event)} dangerouslySetInnerHTML={{ __html: html }} />
    {citation && <aside className="pilot-citation" role="note">
      <button type="button" className="pilot-citation__close" aria-label="关闭来源" onClick={() => setCitation(undefined)}>×</button>
      <strong>{citation.title || citation.url}</strong>
      {citation.snippet && <p>{citation.snippet}</p>}
      {citation.url && <a href={citation.url} target="_blank" rel="noreferrer">{citation.url}</a>}
    </aside>}
  </div>
}
