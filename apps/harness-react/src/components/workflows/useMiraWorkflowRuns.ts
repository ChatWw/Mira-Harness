import { useCallback, useEffect, useState } from 'react'
import type { RunRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import { workflowError, type MiraWorkflowHost } from './workflow-model'

export interface MiraWorkflowRunsState {
  sessionId?: string
  runs: RunRecord[]
  error: string
  loading: boolean
  refresh(): void
}

/** One conversation-owned list feeds both the permanent summary and timeline. */
export function useMiraWorkflowRuns(host: MiraWorkflowHost, sessionId: string | undefined, active: boolean): MiraWorkflowRunsState {
  const [state, setState] = useState<Omit<MiraWorkflowRunsState, 'refresh'>>({ runs: [], error: '', loading: false })
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    if (!active || !sessionId) { setState({ sessionId, runs: [], error: '', loading: false }); return }
    let alive = true, loading = false, dirty = false
    async function load() {
      if (loading) { dirty = true; return }
      loading = true
      setState(previous => ({ sessionId, runs: previous.sessionId === sessionId ? previous.runs : [], error: '', loading: true }))
      try {
        const runs = await host.requestWorkflow<RunRecord[]>({ action: 'runs.list', sessionId })
        if (alive) setState({ sessionId, runs, error: '', loading: false })
      } catch (cause) {
        if (alive) setState(previous => ({ ...previous, error: workflowError(cause), loading: false }))
      } finally { loading = false; if (alive && dirty) { dirty = false; void load() } }
    }
    void load()
    const remove = host.onWorkflowEvent(event => { if (event.sessionId === sessionId && event.type === 'workflow-event') void load() })
    return () => { alive = false; remove() }
  }, [host, sessionId, active, revision])
  return { ...(active && state.sessionId === sessionId ? state : { sessionId, runs: [], error: '', loading: Boolean(active && sessionId) }), refresh }
}
