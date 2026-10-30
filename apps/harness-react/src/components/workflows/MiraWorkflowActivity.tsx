import { createContext, useEffect, useState } from 'react'
import { Workflow } from 'lucide-react'
import type { RunRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowRunSnapshot } from '../../../../../src/config/miraFlowWorkbench'
import { buildMiraWorkflowTimeline, type MiraTimelineStation } from './mira-workflow-timeline-model'
import { useMiraWorkflowSnapshot } from './useMiraWorkflowSnapshot'
import { workflowStatus, type MiraWorkflowHost } from './workflow-model'

export type WorkflowActivity = { run: RunRecord; stations: MiraTimelineStation[]; label: string }
export const MiraWorkflowActivityContext = createContext<Record<string, WorkflowActivity>>({})
function activity(snapshot: MiraFlowRunSnapshot, eventsCurrent = true): WorkflowActivity {
  const stations = snapshot.graph ? buildMiraWorkflowTimeline(snapshot.graph, snapshot.run, snapshot.nodes, snapshot.events, snapshot.actors, eventsCurrent) : []
  const live = snapshot.run.status === 'running' ? stations.filter(station => ['executing', 'repairing', 'dispatched', 'queued', 'waiting'].includes(station.status)) : []
  return { run: snapshot.run, stations, label: live.map(station => station.phase.name).join('、') || workflowStatus[snapshot.run.status] }
}
/** One bounded index for the sidebar, rather than a query per visible conversation row. */
export function useMiraWorkflowActivityIndex(host: MiraWorkflowHost) {
  const [index, setIndex] = useState<Record<string, WorkflowActivity>>({})
  useEffect(() => {
    if (typeof host.requestWorkflow !== 'function' || typeof host.onWorkflowEvent !== 'function') return
    let alive = true, busy = false, dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      if (busy) { dirty = true; return }
      busy = true
      try {
        const runs = await host.requestWorkflow<RunRecord[]>({ action: 'runs.list' })
        const next: Record<string, WorkflowActivity> = {}
        const live = runs.filter(run => run.parentSessionId && ['running', 'pending'].includes(run.status)).filter((run, index, items) => items.findIndex(item => item.parentSessionId === run.parentSessionId) === index)
        await Promise.all(live.map(async run => {
          const sessionId = run.parentSessionId!
          try { const snapshot = await host.requestWorkflow<MiraFlowRunSnapshot>({ action: 'runs.snapshot', sessionId, runId: run.runId, limit: 500 }); if (!next[sessionId]) next[sessionId] = activity(snapshot, snapshot.events.length < 500) }
          catch { if (!next[sessionId]) next[sessionId] = { run, stations: [], label: workflowStatus[run.status] } }
        }))
        if (alive) setIndex(next)
      } catch { /* Optional sidebar adornment; workflow views own actionable service errors. */ }
      finally { busy = false; if (alive && dirty) { dirty = false; schedule() } }
    }
    function schedule() { if (!timer) timer = setTimeout(() => { timer = undefined; void load() }, 100) }
    void load()
    const remove = host.onWorkflowEvent(event => { if (event.type === 'workflow-event') schedule() })
    return () => { alive = false; clearTimeout(timer); remove() }
  }, [host])
  return index
}
export function MiraWorkflowPhaseDots({ stations }: { stations: readonly MiraTimelineStation[] }) {
  return <span className="mira-workflow-phase-dots" aria-hidden="true">{stations.slice(0, 8).map(station => <i key={station.phase.id} data-phase-state={station.status} />)}</span>
}
export function MiraWorkflowActivityLabel({ value }: { value: WorkflowActivity }) {
  return <span className="mira-workflow-activity" title={value.label}><Workflow size={12} aria-hidden="true" /><MiraWorkflowPhaseDots stations={value.stations} /><span>{value.label}</span></span>
}
export function MiraWorkflowLiveActivity({ host, sessionId, run }: { host?: MiraWorkflowHost; sessionId: string; run: RunRecord }) {
  return host ? <ObservedActivity host={host} sessionId={sessionId} run={run} /> : <span className="mira-workflow-activity">{workflowStatus[run.status]}</span>
}
function ObservedActivity({ host, sessionId, run }: { host: MiraWorkflowHost; sessionId: string; run: RunRecord }) {
  const { snapshot, events, more } = useMiraWorkflowSnapshot(host, { sessionId, runId: run.runId }, true)
  const value = snapshot ? activity({ ...snapshot, events }, !more) : { run, stations: [], label: workflowStatus[run.status] }
  return <MiraWorkflowActivityLabel value={value} />
}
