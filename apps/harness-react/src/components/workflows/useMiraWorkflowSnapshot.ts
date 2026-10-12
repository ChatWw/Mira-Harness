import { useCallback, useEffect, useRef, useState } from 'react'
import type { MiraFlowRunIdentity, MiraFlowRunSnapshot } from '../../../../../src/config/miraFlowWorkbench'
import type { StoredEvent } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import { workflowError, type MiraWorkflowHost } from './workflow-model'

/** Both the conversation card and run pane consume the same bounded journal cursor. */
export function useMiraWorkflowSnapshot(host: MiraWorkflowHost, identity: MiraFlowRunIdentity, active: boolean) {
  const [snapshot, setSnapshot] = useState<MiraFlowRunSnapshot>(), [events, setEvents] = useState<StoredEvent[]>([])
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [more, setMore] = useState(false)
  const requestRefresh = useRef<(() => void) | undefined>(undefined)
  const refresh = useCallback(() => requestRefresh.current?.(), [])
  useEffect(() => {
    setSnapshot(undefined); setEvents([]); setError(''); setMore(false); setLoading(false)
    if (!active) return
    let alive = true, fetching = false, dirty = false, cursor = -1
    const load = async () => {
      if (fetching) { dirty = true; return }
      fetching = true; setLoading(true)
      try {
        const next = await host.requestWorkflow<MiraFlowRunSnapshot>({ action: 'runs.snapshot', ...identity, afterSequence: cursor, limit: 100 })
        if (!alive) return
        setSnapshot(next); setError(''); setMore(next.events.length === 100)
        setEvents(previous => [...previous, ...next.events].slice(-500))
        if (next.events.length === 100 && next.events[next.events.length - 1]!.sequence > cursor) dirty = true
        cursor = next.events[next.events.length - 1]?.sequence ?? cursor
      } catch (cause) { if (alive) setError(workflowError(cause)) }
      finally { fetching = false; if (alive) { setLoading(false); if (dirty) { dirty = false; void load() } } }
    }
    requestRefresh.current = () => { void load() }
    void load()
    const unsubscribe = host.onWorkflowEvent(event => {
      if (event.type === 'workflow-event' && event.sessionId === identity.sessionId && event.payload?.runId === identity.runId) void load()
    })
    return () => { alive = false; unsubscribe(); requestRefresh.current = undefined }
  }, [host, identity.sessionId, identity.runId, active])
  return { snapshot, events, loading, error, more, refresh }
}
