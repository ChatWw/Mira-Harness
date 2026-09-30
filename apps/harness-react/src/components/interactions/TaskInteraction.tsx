import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { HarnessPendingInteraction, HarnessPlan, HarnessUserAnswer } from '../../../../../src/config/harness'

export function TaskInteraction({ interaction, plan, selectionReady, onConfirm, onRevise, onAnswer, onCancel }: { interaction: HarnessPendingInteraction; plan?: HarnessPlan; selectionReady: boolean; onConfirm: () => Promise<void>; onRevise: (message: string) => Promise<void>; onAnswer: (answers: HarnessUserAnswer[]) => Promise<void>; onCancel?: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false)
  const [revising, setRevising] = useState(false)
  const [revision, setRevision] = useState('')
  const [error, setError] = useState('')
  if (interaction.kind === 'plan-review') {
    const run = async (action: () => Promise<void>) => {
      if (submitting) return
      setSubmitting(true); setError('')
      try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败') }
      finally { setSubmitting(false) }
    }
    return <section className="pilot-action"><ShieldCheck size={19} /><div><strong>方案已生成 · {plan?.steps.length ?? 0} 步</strong>{plan ? <><p>{plan.understanding}</p><ol className="pilot-plan-steps">{plan.steps.map((step, index) => <li key={index}><strong>{step.label}</strong>{step.detail && <span>{step.detail}</span>}</li>)}</ol>{plan.risks.length > 0 && <p>风险：{plan.risks.join('；')}</p>}</> : <p>计划内容未加载，暂不能确认。</p>}
      {revising && <textarea className="pilot-plan-revision" value={revision} onChange={event => setRevision(event.target.value)} placeholder="说明需要修改的步骤或边界" aria-label="计划修改要求" />}
      {error && <p className="pilot-file-error" role="alert">{error}</p>}
      <div className="pilot-action__buttons"><button type="button" disabled={!selectionReady || submitting} onClick={() => void run(() => onCancel?.() || Promise.resolve())}>取消方案</button><button type="button" disabled={!plan || !selectionReady || submitting} onClick={() => setRevising(value => !value)}>{revising ? '收起修改' : '要求修改'}</button>{revising ? <button type="button" disabled={!revision.trim() || !selectionReady || submitting} onClick={() => void run(() => onRevise(revision.trim()))}>提交修改要求</button> : <button type="button" disabled={!plan || !selectionReady || submitting} onClick={() => void run(onConfirm)}>确认并执行</button>}</div>
    </div></section>
  }
  return <ClarificationWizard interaction={interaction} selectionReady={selectionReady} onAnswer={onAnswer} />
}

function ClarificationWizard({ interaction, selectionReady, onAnswer }: { interaction: Extract<HarnessPendingInteraction, { kind: 'question' }>; selectionReady: boolean; onAnswer: (answers: HarnessUserAnswer[]) => Promise<void> }) {
  const questions = interaction.questions
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, HarnessUserAnswer>>({})
  const [skipped, setSkipped] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const question = questions[step]
  if (!question) return null
  const current = answers[question.id] || { id: question.id, selected: [] }
  const update = (next: HarnessUserAnswer) => { setSkipped(previous => previous.filter(id => id !== question.id)); setAnswers(previous => ({ ...previous, [question.id]: next })) }
  const answered = (item: HarnessUserAnswer) => Boolean(item.selected.length || item.custom?.trim())
  const complete = questions.every(item => skipped.includes(item.id) || answered(answers[item.id] || { id: item.id, selected: [] }))
  const isLast = step === questions.length - 1
  return <section className="pilot-action" aria-label="澄清问题"><div className="pilot-wizard">
    <header className="pilot-wizard__head"><strong>{question.header || '需要补充信息'}</strong><small>第 {step + 1} / {questions.length} 题</small></header>
    {questions.length > 1 && <div className="pilot-wizard__progress" aria-hidden="true">{questions.map((item, index) => <span key={item.id} className={index === step ? 'is-current' : skipped.includes(item.id) || answered(answers[item.id] || { id: item.id, selected: [] }) ? 'is-done' : ''} />)}</div>}
    <fieldset className="pilot-question"><legend>{question.question}</legend>{question.context && <p>{question.context}</p>}{question.options?.map(option => <label key={option.label}><input type={question.multiSelect ? 'checkbox' : 'radio'} name={question.id} checked={current.selected.includes(option.label)} onChange={() => update({ ...current, selected: question.multiSelect ? current.selected.includes(option.label) ? current.selected.filter(item => item !== option.label) : [...current.selected, option.label] : [option.label] })} /><span>{option.label}{option.description && <small>{option.description}</small>}</span></label>)}{question.allowCustom !== false && <textarea aria-label={`${question.question}的自定义回答`} placeholder="补充回答（可与选项同时填写）" value={current.custom || ''} onChange={event => update({ ...current, custom: event.target.value })} />}</fieldset>
    <div className="pilot-wizard__nav">
      <button type="button" disabled={step === 0} onClick={() => setStep(value => Math.max(0, value - 1))}>上一题</button>
      {!isLast && <button type="button" onClick={() => setStep(value => Math.min(value + 1, questions.length - 1))}>下一题</button>}
      {!answered(current) && !skipped.includes(question.id) && question.allowCustom !== false && <button type="button" onClick={() => { setSkipped(previous => [...previous, question.id]); if (!isLast) setStep(value => value + 1) }}>跳过本题</button>}
      {isLast && <button type="button" className="pilot-wizard__submit" disabled={!complete || !selectionReady || submitting} onClick={() => { setSubmitting(true); void onAnswer(questions.map(item => answers[item.id] || { id: item.id, selected: [] })).finally(() => setSubmitting(false)) }}>{submitting ? '提交中…' : complete ? '提交回答' : '还有问题未回答'}</button>}
    </div>
  </div></section>
}
