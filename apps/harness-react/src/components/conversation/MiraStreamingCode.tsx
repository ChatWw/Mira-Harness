import { isValidElement, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties } from 'react'
import { CodeBlockContainer, CodeBlockCopyButton, CodeBlockDownloadButton, CodeBlockHeader, StreamdownContext, useIsCodeFenceIncomplete, type ExtraProps } from 'streamdown'
import { RotateCw } from 'lucide-react'
import { miraCodeHighlighter, miraCodeThemes, renderMiraHighlightedCode } from '../../lib/code-highlighter'
import type { MiraHighlightResult } from '../../lib/code-highlight-protocol'

type MarkdownCodeProps = ComponentProps<'code'> & ExtraProps & { 'data-block'?: string }

export function MiraMarkdownCode({ node, className, children, 'data-block': block, ...props }: MarkdownCodeProps) {
  if (block === undefined) return <code className={`rounded bg-muted px-1.5 py-0.5 font-mono text-sm${className ? ' ' + className : ''}`} data-streamdown="inline-code" {...props}>{children}</code>
  const language = className?.match(/language-([^\s]+)/)?.[1] || 'text'
  const child = isValidElement<{ children?: unknown }>(children) ? children.props.children : children
  const code = typeof child === 'string' ? child : ''
  const meta = typeof node?.properties?.metastring === 'string' ? node.properties.metastring : ''
  const startLine = Number(meta.match(/startLine=(\d+)/)?.[1] || 1)
  return <MiraStreamingCode code={code} language={language} startLine={startLine >= 1 ? startLine : 1} hideLineNumbers={/\bnoLineNumbers\b/.test(meta)} />
}

export function MiraStreamingCode({ code, language, startLine = 1, hideLineNumbers = false }: { code: string; language: string; startLine?: number; hideLineNumbers?: boolean }) {
  const options = useMemo(() => ({ code, language, themes: miraCodeThemes }), [code, language])
  const identity = useMemo(() => JSON.stringify([language, code]), [language, code])
  const [highlighted, setHighlighted] = useState<{ identity: string; result: MiraHighlightResult }>()
  const [failure, setFailure] = useState<string>()
  const [retry, setRetry] = useState(0)
  const version = useRef(0)
  const incomplete = useIsCodeFenceIncomplete()
  const { controls, codeBlockMaxHeight, lineNumbers } = useContext(StreamdownContext)
  const result = highlighted?.identity === identity ? highlighted.result : miraCodeHighlighter.getCached(options)
  const html = useMemo(() => renderMiraHighlightedCode(result || { tokens: code.split(/\r?\n/).map(content => [{ content, offset: 0 }]) }, language), [result, code, language])
  const showControls = typeof controls === 'boolean' ? controls : controls.code !== false
  const codeControls = typeof controls !== 'boolean' && typeof controls.code === 'object' ? controls.code : undefined
  const showLineNumbers = lineNumbers !== false && !hideLineNumbers
  const maxHeight = codeBlockMaxHeight === 0 || codeBlockMaxHeight === Infinity ? undefined : codeBlockMaxHeight

  useEffect(() => {
    const cancellation = new AbortController()
    const requestVersion = ++version.current
    setFailure(undefined)
    void miraCodeHighlighter.highlight(options, cancellation.signal).then(value => {
      if (!cancellation.signal.aborted && requestVersion === version.current) setHighlighted({ identity, result: value })
    }).catch(error => {
      if (cancellation.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return
      // Worker 失败时保留当前完整源码；旧请求不能覆盖正在流入的新代码。
      if (requestVersion === version.current) setFailure(identity)
    })
    return () => cancellation.abort()
  }, [options, identity, retry])

  return <CodeBlockContainer language={language} isIncomplete={incomplete} dir="ltr">
    <CodeBlockHeader language={language} />
    {showControls && <div className="pointer-events-none sticky top-2 z-10 -mt-10 flex h-8 items-center justify-end">
      <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md border border-sidebar bg-sidebar/80 px-1.5 py-1 supports-[backdrop-filter]:bg-sidebar/70 supports-[backdrop-filter]:backdrop-blur" data-streamdown="code-block-actions">
        {codeControls?.download !== false && <CodeBlockDownloadButton code={code} language={language} />}
        {codeControls?.copy !== false && <CodeBlockCopyButton code={code} aria-label="复制代码" title="复制代码" />}
      </div>
    </div>}
    <div data-streamdown="code-block-body" data-language={language} data-highlight-state={result ? 'ready' : failure === identity ? 'error' : 'loading'} className={`overflow-auto rounded-md border border-border bg-background p-4 text-sm [&_pre]:m-0 [&_pre]:font-mono dark:[&_.shiki]:text-[var(--shiki-dark,inherit)]! dark:[&_.shiki]:bg-[var(--shiki-dark-bg,transparent)]! dark:[&_.shiki_span]:text-[var(--shiki-dark,inherit)]! dark:[&_.shiki_span]:bg-[var(--shiki-dark-bg,transparent)]!${showLineNumbers ? ' [&_.line]:before:content-[counter(line)] [&_.line]:before:inline-block [&_.line]:before:[counter-increment:line] [&_.line]:before:w-6 [&_.line]:before:mr-4 [&_.line]:before:text-[13px] [&_.line]:before:text-right [&_.line]:before:text-muted-foreground/50 [&_.line]:before:select-none' : ''}`} style={{ maxHeight, counterReset: `line ${startLine - 1}` } as CSSProperties}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
    {failure === identity && <div className="flex items-center gap-2 px-1 text-xs text-foreground-subtle" role="alert"><span>代码高亮失败</span><button type="button" title="重试代码高亮" aria-label="重试代码高亮" className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" onClick={() => setRetry(value => value + 1)}><RotateCw size={14} /></button></div>}
  </CodeBlockContainer>
}
