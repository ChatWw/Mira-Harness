/* Inline diff presentation adapted from ZCode ToolCallBlocks/renderers/EditInlineDiffContent.tsx
 * and components/ui/{highlighted-lightweight-diff-preview,lightweight-diff-preview}.tsx.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: public recorded diffs, cancellable shared worker, full text and retry.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { RotateCw } from 'lucide-react'
import { miraCodeHighlighter, miraCodeThemes } from '../../lib/code-highlighter'
import type { MiraHighlightResult } from '../../lib/code-highlight-protocol'
import { filePreviewLanguage } from '../../lib/file-preview'
import { parseMiraToolDiff } from '../../lib/tool-diff'

export function MiraToolDiff({ diff, path = '', identity = '' }: { diff: string; path?: string; identity?: string }) {
  const parsed = useMemo(() => parseMiraToolDiff(diff), [diff])
  const key = JSON.stringify([identity, path, diff])
  const language = filePreviewLanguage(path)
  const code = useMemo(() => parsed.lines.map(line => line.kind === 'meta' ? '' : line.text).join('\n'), [parsed])
  const [attempt, setAttempt] = useState(0)
  const [highlight, setHighlight] = useState<{ key: string; attempt: number; result?: MiraHighlightResult; failed?: boolean }>()
  const current = highlight?.key === key && highlight.attempt === attempt ? highlight : undefined
  useEffect(() => {
    if (parsed.format === 'raw' || !diff) return
    const cancellation = new AbortController()
    void miraCodeHighlighter.highlight({ code, language, themes: miraCodeThemes }, cancellation.signal).then(result => {
      if (!cancellation.signal.aborted) setHighlight({ key, attempt, result })
    }).catch(() => {
      if (!cancellation.signal.aborted) setHighlight({ key, attempt, failed: true })
    })
    return () => cancellation.abort()
  }, [key, code, language, parsed.format, diff, attempt])
  return <section className="mira-tool-diff min-w-0" aria-label="工具文件变更" data-mira-tool-diff={parsed.format} data-diff-highlight={current?.failed ? 'failed' : current?.result ? 'highlighted' : 'plain'}>
    <div className="max-h-60 overflow-auto rounded-xl border border-border bg-card font-mono text-ui-base leading-5 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-brand" role="region" aria-label={`文件变更 ${path}`} tabIndex={0}>
      {parsed.format === 'raw' ? <pre className="m-0! max-h-none! bg-transparent! p-3! whitespace-pre-wrap break-words" data-diff-source={diff}>{diff}</pre> : <div className="min-w-fit py-1.5">
        {parsed.lines.map((line, index) => {
          const tokens = current?.result?.tokens[index]
          // The worker must never substitute or shorten the authoritative recorded line.
          const completeTokens = tokens?.map(token => token.content).join('') === line.text ? tokens : undefined
          return <div key={index} className="flex min-h-5 min-w-0 items-start whitespace-pre text-foreground" data-diff-kind={line.kind} data-diff-source={line.source}>
            <span className="sticky left-0 w-12 shrink-0 select-none border-r border-border px-2 text-right tabular-nums text-foreground-subtle" aria-hidden="true" data-diff-number={line.number}>{line.number ?? ''}</span>
            <code className="min-w-0 flex-1 px-3" data-diff-code>{line.kind === 'meta' || !completeTokens ? line.text : completeTokens.map((token, tokenIndex) => <span key={tokenIndex} data-diff-token style={token.htmlStyle as CSSProperties}>{token.content}</span>)}</code>
          </div>
        })}
      </div>}
    </div>
    {current?.failed && <div className="mt-1.5 flex items-center gap-2 text-ui-sm text-foreground-subtle" role="alert"><span>代码高亮失败，变更内容完整保留。</span><button type="button" className="inline-flex size-6 items-center justify-center rounded hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand" title="重试变更代码高亮" aria-label="重试变更代码高亮" onClick={() => setAttempt(value => value + 1)}><RotateCw size={14} aria-hidden="true" /></button></div>}
  </section>
}
