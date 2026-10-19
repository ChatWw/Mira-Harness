import { cloneElement, isValidElement, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement } from 'react'
import MarkdownIt from 'markdown-it'
import { MiraConversationContext } from './MiraConversationMessages'
import { miraFileTreeIcon } from '../../lib/mira-file-tree-icon'
import { miraMessageLink } from '../../lib/mira-message-links'
import { cjk } from '@streamdown/cjk'
import { Streamdown, defaultRehypePlugins, type Components } from 'streamdown'
import { RotateCw } from 'lucide-react'
import type { HarnessSource } from '../../../../../src/config/harness'
import { installHarnessCitations } from '../../../../../src/utils/harnessCitations'
import { miraCodeHighlighter, miraCodeThemes, renderMiraHighlightedCode } from '../../lib/code-highlighter'
import type { MiraHighlightResult } from '../../lib/code-highlight-protocol'
import { MiraMarkdownCode } from './MiraStreamingCode'

// 流式管线与 ZCode 相同：streamdown（CJK 断行 + shiki 代码高亮）。
// 两种状态共用 Worker 高亮缓存；完成态继续保留引用角标与代码复制按钮。
const staticMarkdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
staticMarkdown.renderer.rules.table_open = () => '<div class="markdown-table-scroll" tabindex="0" role="region" aria-label="表格"><table>\n'
staticMarkdown.renderer.rules.table_close = () => '</table></div>\n'
const validateMarkdownLink = staticMarkdown.validateLink.bind(staticMarkdown)
staticMarkdown.validateLink = href => /^file:/i.test(href) ? Boolean(miraMessageLink(href)) : validateMarkdownLink(href)
const blockKey = (language: string, code: string) => JSON.stringify([language, code])
staticMarkdown.renderer.rules.fence = (tokens, index, _options, environment) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0] || 'text'
  const className = token.info ? ` class="${staticMarkdown.utils.escapeHtml('language-' + token.info.trim())}"` : ''
  const highlighted = (environment?.highlights as Map<string, MiraHighlightResult> | undefined)?.get(blockKey(language, token.content)) || miraCodeHighlighter.getCached({ code: token.content, language, themes: miraCodeThemes })
  const code = highlighted ? renderMiraHighlightedCode(highlighted, language) : `<pre><code${className}>${staticMarkdown.utils.escapeHtml(token.content)}</code></pre>`
  return `<div class="markdown-code-block"><button type="button" class="markdown-code-copy" data-code="${encodeURIComponent(token.content)}" aria-label="复制代码" title="复制代码"><svg class="markdown-code-copy__icon" aria-hidden="true" viewBox="0 0 1024 1024"><path fill="currentColor" d="M768 832a128 128 0 0 1-128 128H192A128 128 0 0 1 64 832V384a128 128 0 0 1 128-128v64a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64z"/><path fill="currentColor" d="M384 128a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64V192a64 64 0 0 0-64-64zm0-64h448a128 128 0 0 1 128 128v448a128 128 0 0 1-128 128H384a128 128 0 0 1-128-128V192A128 128 0 0 1 384 64"/></svg></button>${code}</div>\n`
}
installHarnessCitations(staticMarkdown)
const defaultLinkOpen = staticMarkdown.renderer.rules.link_open ?? ((tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options))
staticMarkdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const link = miraMessageLink(String(tokens[index].attrGet('href') || ''), typeof env?.directory === 'string' ? env.directory : undefined)
  if (link?.kind !== 'file') return defaultLinkOpen(tokens, index, options, env, renderer)
  tokens[index].attrJoin('class', 'mira-message-file-link')
  return defaultLinkOpen(tokens, index, options, env, renderer) + `<img src="${staticMarkdown.utils.escapeHtml(miraFileTreeIcon(link.target))}" width="16" height="16" alt="" aria-hidden="true" />`
}
function MessageLink({ href, children }: { href?: string; children?: import('react').ReactNode }) {
  const conversation = useContext(MiraConversationContext)
  const link = miraMessageLink(href || '', conversation.session?.workingDirectory)
  return <a href={href} className={link?.kind === 'file' ? 'mira-message-file-link' : undefined}>{link?.kind === 'file' && <img src={miraFileTreeIcon(link.target)} width={16} height={16} alt="" aria-hidden="true" />}{children}</a>
}


// ZCode rewrites local targets before Streamdown hardening, while keeping its sanitizers.
function rewriteMessageFileLinks(options: { directory?: string }) {
  type LinkNode = { tagName?: string; properties?: { href?: unknown }; children?: LinkNode[] }
  return (tree: LinkNode) => {
    const visit = (node: LinkNode) => {
      const href = node.properties?.href
      if (node.tagName === 'a' && typeof href === 'string') {
        const link = miraMessageLink(href, options.directory)
        if (link?.kind === 'file') node.properties!.href = /^[a-z]:/i.test(link.target) ? '/' + link.target : link.target
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}
const streamdownPlugins = { cjk }
const streamdownComponents: Components = {
  code: MiraMarkdownCode,
  a: ({ href, children }) => <MessageLink href={href}>{children}</MessageLink>,
  // 保留 Streamdown 的块级标记，无语言代码围栏也不能被当成 inline code。
  pre: ({ children }) => isValidElement(children) ? cloneElement(children as ReactElement<{ 'data-block'?: string }>, { 'data-block': 'true' }) : <>{children}</>,
}

export const renderCompletedMarkdown = (content: string, sources?: HarnessSource[], highlights?: Map<string, MiraHighlightResult>, directory?: string) => staticMarkdown.render(content, { sources, highlights, directory })
export async function prepareMarkdownHighlights(content: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const fences = staticMarkdown.parse(content, {}).filter(token => token.type === 'fence')
  const blocks = new Array<readonly [string, MiraHighlightResult]>(fences.length)
  let next = 0
  let failed = false
  // 长历史消息可能含数百代码块；限制提交量而非丢掉围栏或压缩源码。
  await Promise.all(Array.from({ length: Math.min(4, fences.length) }, async () => {
    while (!failed && next < fences.length) {
      signal?.throwIfAborted()
      const index = next++
      const token = fences[index]
      const language = token.info.trim().split(/\s+/)[0] || 'text'
      try {
        blocks[index] = [blockKey(language, token.content), await miraCodeHighlighter.highlight({ code: token.content, language, themes: miraCodeThemes }, signal)]
      } catch (error) { failed = true; throw error }
    }
  }))
  signal?.throwIfAborted()
  return new Map(blocks)
}

export function MessageMarkdown({ content, sources, streaming, directory, onOpenLink }: { content: string; sources?: HarnessSource[]; streaming?: boolean; directory?: string; onOpenLink?: (url: string) => void }) {
  const conversation = useContext(MiraConversationContext)
  const linkDirectory = directory ?? conversation.session?.workingDirectory
  const messageRehypePlugins = useMemo(() => [[rewriteMessageFileLinks, { directory: linkDirectory }] as [typeof rewriteMessageFileLinks, { directory?: string }], ...Object.values(defaultRehypePlugins)], [linkDirectory])
  const handleLink = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
    const anchor = target?.closest('a[href]')
    if (!anchor || !event.currentTarget.contains(anchor)) return
    // Cancel synchronously, including modifier/middle clicks, before any renderer handler.
    event.preventDefault(); event.stopPropagation()
    if (event.type === 'auxclick' && event.button !== 1) return
    const link = miraMessageLink(anchor.getAttribute('href') || '', directory ?? conversation.session?.workingDirectory)
    if (!link) return
    try {
      if (link.kind === 'anchor') {
        const id = decodeURIComponent(link.target.slice(1))
        const destination = [...event.currentTarget.querySelectorAll('[id]')].find(element => element.id === id)
        destination?.scrollIntoView?.({ block: 'nearest' })
      } else if (link.kind === 'web') {
        if (onOpenLink) onOpenLink(link.target)
        else if (conversation.active) conversation.openLink?.(link.target)
      } else if (conversation.active) {
        const root = conversation.session?.workingDirectory?.replace(/\\/g, '/').replace(/\/$/, '')
        const inside = root && (/^[a-z]:/i.test(root) ? link.target.toLowerCase().startsWith(root.toLowerCase() + '/') : link.target.startsWith(root + '/'))
        if (!inside) { conversation.controller?.reportError('文件链接不在当前任务工作目录中'); return }
        conversation.openFile(link.target.slice(root.length + 1))
      }
    } catch (error) { conversation.controller?.reportError(error) }
  }
  return <div className="min-w-0" onClickCapture={handleLink} onAuxClickCapture={handleLink}>
    {streaming ? <div className="message-markdown size-full text-ui-base leading-[1.75] tracking-wide [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Streamdown mode="streaming" parseIncompleteMarkdown components={streamdownComponents} rehypePlugins={messageRehypePlugins} urlTransform={href => miraMessageLink(href, directory ?? conversation.session?.workingDirectory) ? href : ''} plugins={streamdownPlugins} shikiTheme={miraCodeThemes} animated={false} isAnimating={false}>{content}</Streamdown>
    </div> : <StaticMarkdown content={content} sources={sources} directory={linkDirectory} />}
  </div>
}

function StaticMarkdown({ content, sources, directory }: { content: string; sources?: HarnessSource[]; directory?: string }) {
  const [highlighted, setHighlighted] = useState<{ content: string; blocks: Map<string, MiraHighlightResult> }>()
  const [highlightFailure, setHighlightFailure] = useState<string>()
  const [retry, setRetry] = useState(0)
  const highlightVersion = useRef(0)
  const html = useMemo(() => renderCompletedMarkdown(content, sources, highlighted?.content === content ? highlighted.blocks : undefined, directory), [content, sources, highlighted, directory])
  useEffect(() => {
    const cancellation = new AbortController()
    const version = ++highlightVersion.current
    setHighlightFailure(undefined)
    void prepareMarkdownHighlights(content, cancellation.signal).then(blocks => {
      if (!cancellation.signal.aborted && version === highlightVersion.current && blocks.size) setHighlighted({ content, blocks })
    }).catch(error => {
      if (cancellation.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return
      // 着色失败仍保留已转义的完整正文、引用和复制入口，不把异常抛到 React。
      if (version === highlightVersion.current) setHighlightFailure(content)
    })
    return () => cancellation.abort()
  }, [content, retry])
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
    <div className="pilot-markdown [&_.citation-marker_button]:leading-normal!" onClick={event => void handleClick(event)} dangerouslySetInnerHTML={{ __html: html }} />
    {highlightFailure === content && <div data-mira-find-ignore className="flex items-center gap-2 text-xs text-foreground-subtle" role="alert"><span>代码高亮失败</span><button type="button" title="重试代码高亮" aria-label="重试代码高亮" className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" onClick={() => setRetry(value => value + 1)}><RotateCw size={14} /></button></div>}
    {citation && <aside className="pilot-citation" role="note">
      <button type="button" className="pilot-citation__close" aria-label="关闭来源" onClick={() => setCitation(undefined)}>×</button>
      <strong>{citation.title || citation.url}</strong>
      {citation.snippet && <p>{citation.snippet}</p>}
      {citation.url && <a href={citation.url} target="_blank" rel="noreferrer">{citation.url}</a>}
    </aside>}
  </div>
}
