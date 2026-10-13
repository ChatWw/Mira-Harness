import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { HarnessPendingInteraction, HarnessPlan, HarnessUserAnswer } from '../../../../../src/config/harness'
import { miraPlanMarkdown } from '../../../../../src/config/miraSessionPlans'
import { MessageMarkdown } from '../conversation/markdown'

export function TaskInteraction({ interaction, plan, selectionReady, onConfirm, onRevise, onAnswer, onCancel }: { interaction: HarnessPendingInteraction; plan?: HarnessPlan; selectionReady: boolean; onConfirm: () => Promise<void>; onRevise: (message: string) => Promise<void>; onAnswer: (answers: HarnessUserAnswer[]) => Promise<void>; onCancel?: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false)
  const [revising, setRevising] = useState(false)
  const [revision, setRevision] = useState('')
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const revisionRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => { if (revising) revisionRef.current?.focus() }, [revising])
  if (interaction.kind === 'plan-review') {
    const planReady = plan?.id === interaction.planId
    const run = async (action: () => Promise<void>) => {
      if (busyRef.current || !selectionReady) return
      busyRef.current = true; setSubmitting(true); setError('')
      try { await action() } catch (cause) { setError(`${cause instanceof Error ? cause.message : '操作失败'}。请重试。`) }
      finally { busyRef.current = false; setSubmitting(false) }
    }
    return <section className="pilot-action mira-task-interaction" aria-label="计划确认" aria-busy={submitting} tabIndex={-1} data-interaction-id={interaction.id}><ShieldCheck size={19} aria-hidden="true" /><div className="mira-interaction-content"><header className="mira-interaction-header"><strong>方案已生成 · {planReady ? plan.steps.length : 0} 步</strong></header><div className="mira-interaction-body" tabIndex={0} role="region" aria-label="方案内容">{planReady ? <MessageMarkdown content={miraPlanMarkdown(plan)} /> : <p>计划内容未加载，暂不能确认。</p>}
      {revising && <textarea ref={revisionRef} className="pilot-plan-revision" disabled={!selectionReady || submitting} value={revision} onChange={event => { if (!busyRef.current) { setRevision(event.target.value); setError('') } }} placeholder="说明需要修改的步骤或边界" aria-label="计划修改要求" />}
      </div>
      <footer className="mira-interaction-footer">
      {error && <p className="pilot-file-error" role="alert">{error}</p>}
      <div className="pilot-action__buttons"><button type="button" disabled={!onCancel || !selectionReady || submitting} onClick={() => { if (onCancel) void run(onCancel) }}>取消方案</button><button type="button" disabled={!planReady || !selectionReady || submitting} onClick={() => { if (!busyRef.current && planReady && selectionReady) setRevising(value => !value) }}>{revising ? '收起修改' : '要求修改'}</button>{revising ? <button type="button" disabled={!planReady || !revision.trim() || !selectionReady || submitting} onClick={() => { if (planReady && revision.trim()) void run(() => onRevise(revision.trim())) }}>{submitting ? '提交中…' : '提交修改要求'}</button> : <button type="button" disabled={!planReady || !selectionReady || submitting} onClick={() => { if (planReady) void run(onConfirm) }}>{submitting ? '提交中…' : '确认并执行'}</button>}</div>
      </footer>
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
  const [error, setError] = useState('')
  const cardRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const compositionRef = useRef(false)
  const focusQuestionRef = useRef(false)
  useLayoutEffect(() => {
    if (!focusQuestionRef.current) return
    focusQuestionRef.current = false
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    const target = cardRef.current?.querySelector<HTMLElement>('.pilot-question input, .pilot-question textarea') ?? cardRef.current
    target?.focus()
  }, [step])
  const question = questions[step]
  if (!question) return null
  const current = answers[question.id] || { id: question.id, selected: [] }
  const update = (next: HarnessUserAnswer) => { if (busyRef.current || !selectionReady) return; setError(''); setSkipped(previous => previous.filter(id => id !== question.id)); setAnswers(previous => ({ ...previous, [question.id]: next })) }
  const answered = (item: HarnessUserAnswer) => Boolean(item.selected.length || item.custom?.trim())
  const complete = questions.every(item => skipped.includes(item.id) || answered(answers[item.id] || { id: item.id, selected: [] }))
  const isLast = step === questions.length - 1
  const navigate = (next: number) => { if (busyRef.current || !selectionReady) return; focusQuestionRef.current = true; setStep(Math.max(0, Math.min(next, questions.length - 1))) }
  const submit = async () => {
    if (busyRef.current || !complete || !selectionReady) return
    busyRef.current = true; setSubmitting(true); setError('')
    try { await onAnswer(questions.map(item => answers[item.id] || { id: item.id, selected: [] })) }
    catch (cause) { setError(`${cause instanceof Error ? cause.message : '提交失败'}。回答已保留，请重试。`) }
    finally { busyRef.current = false; setSubmitting(false) }
  }
  const handleKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || compositionRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    const target = event.target as HTMLElement
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      if (step > 0) navigate(step - 1)
      else cardRef.current?.focus({ preventScroll: true })
      return
    }
    if (target.tagName === 'BUTTON' || !selectionReady || busyRef.current || event.altKey) return
    const textarea = target.tagName === 'TEXTAREA'
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !textarea && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      const inputs = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('.pilot-question input, .pilot-question textarea') ?? [])
      if (!inputs.length) return
      event.preventDefault(); event.stopPropagation()
      const index = inputs.indexOf(target), direction = event.key === 'ArrowDown' ? 1 : -1
      inputs[index < 0 ? direction > 0 ? 0 : inputs.length - 1 : (index + direction + inputs.length) % inputs.length]?.focus()
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation()
      if (event.ctrlKey || event.metaKey) { void submit(); return }
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'radio') { target.click(); return }
      if (isLast) void submit()
      else navigate(step + 1)
    }
  }
  return <section ref={cardRef} className="pilot-action mira-task-interaction" aria-label="澄清问题" aria-busy={submitting} tabIndex={-1} data-interaction-id={interaction.id} onKeyDown={handleKey}><div className="pilot-wizard mira-interaction-content">
    <header className="pilot-wizard__head" aria-live="polite"><strong>{question.header || '需要补充信息'}</strong><small>第 {step + 1} / {questions.length} 题</small></header>
    {questions.length > 1 && <div className="pilot-wizard__progress" aria-hidden="true">{questions.map((item, index) => <span key={item.id} className={index === step ? 'is-current' : skipped.includes(item.id) || answered(answers[item.id] || { id: item.id, selected: [] }) ? 'is-done' : ''} />)}</div>}
    <div ref={bodyRef} className="mira-interaction-body" tabIndex={0} role="region" aria-label="问题内容"><fieldset className="pilot-question" disabled={!selectionReady || submitting}><legend>{question.question}</legend>{question.context && <p>{question.context}</p>}{question.options?.map(option => <label key={option.label}><input type={question.multiSelect ? 'checkbox' : 'radio'} name={`${interaction.id}:${question.id}`} checked={current.selected.includes(option.label)} onChange={() => update({ ...current, selected: question.multiSelect ? current.selected.includes(option.label) ? current.selected.filter(item => item !== option.label) : [...current.selected, option.label] : [option.label] })} /><span>{option.label}{option.description && <small>{option.description}</small>}</span></label>)}{question.allowCustom !== false && <textarea aria-label={`${question.question}的自定义回答`} placeholder="补充回答（可与选项同时填写）" value={current.custom || ''} onCompositionStart={() => { compositionRef.current = true }} onCompositionEnd={() => { compositionRef.current = false }} onChange={event => update({ ...current, custom: event.target.value })} />}</fieldset></div>
    <footer className="mira-interaction-footer">
    {error && <p className="pilot-file-error" role="alert">{error}</p>}
    <div className="pilot-wizard__nav">
      <button type="button" disabled={step === 0 || !selectionReady || submitting} onClick={() => navigate(step - 1)}>上一题</button>
      {!isLast && <button type="button" disabled={!selectionReady || submitting} onClick={() => navigate(step + 1)}>下一题</button>}
      {!answered(current) && !skipped.includes(question.id) && question.allowCustom !== false && <button type="button" disabled={!selectionReady || submitting} onClick={() => { if (busyRef.current || !selectionReady) return; setSkipped(previous => [...previous, question.id]); if (!isLast) navigate(step + 1) }}>跳过本题</button>}
      {isLast && <button type="button" className="pilot-wizard__submit" disabled={!complete || !selectionReady || submitting} onClick={() => void submit()}>{submitting ? '提交中…' : error ? '重试提交' : complete ? '提交回答' : '还有问题未回答'}</button>}
    </div>
    </footer>
  </div></section>
}
