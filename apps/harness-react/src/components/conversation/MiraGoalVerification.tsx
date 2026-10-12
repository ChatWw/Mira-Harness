import { Check, CircleAlert, LoaderCircle, Square } from 'lucide-react'
import type { HarnessGoalVerification } from '../../../../../src/config/miraGoals'

export function MiraGoalVerification({ verification }: { verification: HarnessGoalVerification }) {
  const labels: Record<HarnessGoalVerification['status'], string> = { running: '目标核验中', passed: '目标已完成', failed: '目标尚未完成', error: '目标核验失败', stopped: '目标核验已停止' }
  return <section className="mira-goal-verification" aria-label="目标核验" data-goal-verification-id={verification.id} data-status={verification.status}>
    <div>{verification.status === 'running' ? <LoaderCircle size={14} className="animate-spin" /> : verification.status === 'passed' ? <Check size={14} /> : verification.status === 'stopped' ? <Square size={14} /> : <CircleAlert size={14} />}<span>第 {verification.iteration} 次迭代 · {labels[verification.status]}</span></div>
    {verification.reason && <p>{verification.reason}</p>}
    {verification.nextAction && verification.status !== 'passed' && <p>下一步：{verification.nextAction}</p>}
  </section>
}
