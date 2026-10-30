import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { LoaderCircle, Minus, Plus, SlidersHorizontal, Square } from 'lucide-react'
import type { RunRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import { AutomationHint } from '../automations/AutomationControls'
import { workflowError, type MiraWorkflowHost } from './workflow-model'
export function MiraWorkflowRunControls({ host, identity, run, onChanged, compact = false }: { host: MiraWorkflowHost; identity: MiraFlowRunIdentity; run: RunRecord; onChanged(): void; compact?: boolean }) {
  const [open, setOpen] = useState(false), [value, setValue] = useState(run.caps.maxConcurrency), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const operation = useRef(false), current = useRef(true)
  useEffect(() => { current.current = true; return () => { current.current = false } }, [])
  useEffect(() => { if (!open) setValue(run.caps.maxConcurrency) }, [run.caps.maxConcurrency, open])
  async function act(action: 'runs.stop' | 'runs.concurrency') {
    if (operation.current) return
    operation.current = true; setBusy(true); setError('')
    try { await host.requestWorkflow(action === 'runs.concurrency' ? { action, ...identity, maxConcurrency: value } : { action, ...identity }); if (current.current) { setOpen(false); onChanged() } }
    catch (cause) { if (current.current) setError(workflowError(cause)) }
    finally { operation.current = false; if (current.current) setBusy(false) }
  }
  if (run.status !== 'running') return null
  return <div className="mira-workflow-run-actions"><Popover.Root open={open} onOpenChange={setOpen}><AutomationHint label="配置"><Popover.Trigger type="button" className={compact ? 'mira-automation-icon' : 'mira-automation-secondary'} aria-label="配置工作流" disabled={busy}><SlidersHorizontal size={14} />{!compact && '配置'}</Popover.Trigger></AutomationHint><Popover.Portal container={document.getElementById('root')}><Popover.Content className="mira-automation-popover mira-workflow-settings" align="end" sideOffset={6} aria-label="工作流运行配置"><strong>工作流配置</strong><label>最大并发数<span className="mira-workflow-stepper"><button type="button" aria-label="减少工作流并发数" disabled={busy || value <= 1} onClick={() => setValue(value - 1)}><Minus size={14} /></button><input aria-label="工作流并发数" type="number" min={1} max={64} value={value} disabled={busy} onChange={event => setValue(Number(event.target.value))} /><button type="button" aria-label="增加工作流并发数" disabled={busy || value >= 64} onClick={() => setValue(value + 1)}><Plus size={14} /></button></span></label><small>调整同时执行的子代理数量。已开始的任务会继续执行。</small>{error && <p role="alert" className="mira-automation-error">{error}</p>}<div><button type="button" className="mira-automation-secondary" disabled={busy} onClick={() => setOpen(false)}>取消</button><button type="button" className="mira-automation-primary" disabled={busy || !Number.isInteger(value) || value < 1 || value > 64 || value === run.caps.maxConcurrency} onClick={() => void act('runs.concurrency')}>应用</button></div></Popover.Content></Popover.Portal></Popover.Root><AutomationHint label="停止运行"><button type="button" className={compact ? 'mira-automation-icon' : 'mira-automation-secondary'} aria-label="停止工作流" disabled={busy} onClick={() => void act('runs.stop')}>{busy ? <LoaderCircle size={14} className="pilot-spin" /> : <Square size={13} fill="currentColor" />}{!compact && '停止运行'}</button></AutomationHint>{error && !open && <p className="mira-automation-error" role="alert">{error}</p>}</div>
}
