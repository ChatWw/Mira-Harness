/** Empty-input recall follows ZCode PromptHistoryPlugin (Apache-2.0); see third-party-licenses/zcode. */
import { useEffect, useRef, useState } from 'react'
import type { PilotController } from '../state/pilot-state'
import { miraBrowserPromptBody, restoreMiraBrowserPromptDocument } from '../lib/mira-browser-reference'
import { serializeMiraPromptDocument } from '../lib/prompt-editor-document'

export function useMiraPromptHistory(controller: PilotController, scope: { sessionId?: string; projectId?: string; directory?: string }, text: string, enabled: boolean, queueRevision?: number) {
  const key = JSON.stringify(scope)
  const [result, setResult] = useState<{ key: string; entries: string[]; error?: string }>()
  const [retry, setRetry] = useState(0)
  const browsing = useRef<{ key: string; index: number; value: string; entries: string[] } | undefined>(undefined)
  if (browsing.current && (browsing.current.key !== key || browsing.current.value !== text)) browsing.current = undefined
  useEffect(() => {
    if (!controller.supportsPromptHistory || !enabled) return
    let current = true
    setResult(undefined)
    void controller.listPromptHistory(scope.sessionId ? { sessionId: scope.sessionId } : scope.projectId ? { projectId: scope.projectId } : {}).then(entries => {
      // Recall only the submitted input body; attachments and old webpage snapshots are not replayed.
      const values = entries.map(value => serializeMiraPromptDocument(miraBrowserPromptBody(restoreMiraBrowserPromptDocument(value))).trim()).filter(Boolean)
      if (current) setResult({ key, entries: values })
    }, () => { if (current) setResult({ key, entries: [], error: '输入历史读取失败，请重试；当前草稿会保留。' }) })
    return () => { current = false }
  }, [controller, key, enabled, queueRevision, retry])

  return {
    error: result?.key === key ? result.error : undefined,
    reload: () => setRetry(value => value + 1),
    dismissError: () => setResult(previous => previous ? { ...previous, error: undefined } : previous),
    isBrowsing: () => Boolean(browsing.current),
    navigate(direction: 'up' | 'down'): string | undefined {
      const previous = browsing.current
      if (!previous && text.length) return
      const entries = previous?.entries ?? (result?.key === key ? result.entries : [])
      if (!entries.length) return
      const index = previous ? direction === 'up' ? Math.max(0, previous.index - 1) : previous.index + 1 : entries.length - 1
      const value = entries[index] ?? ''
      browsing.current = index < entries.length ? { key, index, value, entries } : undefined
      return value
    },
  }
}
