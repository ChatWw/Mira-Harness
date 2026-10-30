import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { GitCommitHorizontal, GitCompare, LoaderCircle, Sparkles, CloudUpload } from 'lucide-react'
import { miraShortcutLabel } from '../../../../../src/platform/workbenchShortcuts'
import type { MiraGitAction, MiraGitSnapshot } from '../../../../../src/config/miraGit'
import type { MiraGitToolsOwner } from './useMiraGitTools'
import { MiraBranchPicker } from './MiraBranchPicker'

export function MiraGitTotals({ snapshot }: { snapshot: Pick<MiraGitSnapshot, 'added' | 'removed'> }) {
  return <span className="mira-git-totals"><span>+{snapshot.added.toLocaleString()}</span><span>−{snapshot.removed.toLocaleString()}</span></span>
}

export function MiraGitTools({ owner, snapshot: latestSnapshot, refresh, visible = true, onDialogChange }: { visible?: boolean; onDialogChange?: (open: boolean) => void; owner: MiraGitToolsOwner; snapshot: MiraGitSnapshot; refresh: () => Promise<MiraGitSnapshot | undefined> }) {
  const { controller, project, active, blocked, onReview } = owner
  const [open, setOpen] = useState(false)
  const [reviewed, setReviewed] = useState<MiraGitSnapshot>()
  const snapshot = open && reviewed ? reviewed : latestSnapshot
  const [selectedAction, setSelectedAction] = useState<MiraGitAction>('commit')
  const [message, setMessage] = useState('')
  const [include, setInclude] = useState(true)
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const writing = useRef(false)
  const revision = useRef(0)
  const latest = useRef({ active, blocked }); latest.current = { active, blocked }
  useEffect(() => { onDialogChange?.(open); return () => onDialogChange?.(false) }, [open, onDialogChange])
  useEffect(() => { if (!active) { setOpen(false); setPending(false); setLoading(false); revision.current++ } }, [active])
  useEffect(() => () => { revision.current++ }, [project?.id, project?.directory, controller])
  if (!project) return null
  const selected = snapshot.files.filter(file => file.staged || include && file.unstaged)
  const locked = blocked || snapshot.mutationBlocked || pending || loading
  const commitDisabled = locked || !selected.length || snapshot.files.some(file => file.conflict)
  async function show() {
    setSelectedAction('commit'); setReviewed(latestSnapshot); setMessage(''); setInclude(latestSnapshot.files.some(file => file.unstaged)); setError(''); setOpen(true); setLoading(true)
    const request = ++revision.current
    const next = await refresh()
    if (request === revision.current) { setLoading(false); if (next) { setReviewed(next); setInclude(next.files.some(file => file.unstaged)) }; if (!next) setError('Git 状态刷新失败，请刷新后重试') }
  }
  async function run(action: MiraGitAction) {
    if (writing.current || locked || !latest.current.active || latest.current.blocked) return
    writing.current = true; setPending(true); setError('')
    const request = ++revision.current
    try {
      let commitMessage = message
      if (action !== 'push' && !commitMessage.trim()) {
        commitMessage = await controller.generateGitMessage(snapshot.projectId, snapshot.token, include)
        if (request !== revision.current || !latest.current.active) return
        setMessage(commitMessage)
      }
      const result = await controller.gitAction(snapshot.projectId, action, snapshot.token, commitMessage, include)
      if (request !== revision.current) return
      if (result.committed) { setMessage(''); setInclude(false) }
      if (result.error) setError((result.committed ? '提交已成功，推送失败：' : '') + result.error)
      else setOpen(false)
    } catch (failure) { if (request === revision.current) setError(failure instanceof Error ? failure.message : 'Git 操作失败') }
    finally {
      writing.current = false
      if (request === revision.current) { setPending(false); const next = await refresh(); if (next && request === revision.current) setReviewed(next) }
    }
  }
  async function generate() {
    if (writing.current || locked || !selected.length) return
    writing.current = true; setPending(true); setError('')
    const request = ++revision.current
    try {
      const result = await controller.generateGitMessage(snapshot.projectId, snapshot.token, include)
      if (request === revision.current) setMessage(result)
    } catch (failure) { if (request === revision.current) setError(failure instanceof Error ? failure.message : '提交消息生成失败') }
    finally { writing.current = false; if (request === revision.current) setPending(false) }
  }
  return <>
    <details open hidden={!visible} className="mira-git-section"><summary><strong>Git 工具</strong><MiraGitTotals snapshot={snapshot} /></summary>
      <button type="button" className="mira-summary-resource" onClick={onReview}><GitCompare size={15} /><span>更改</span><MiraGitTotals snapshot={snapshot} /></button>
      <MiraBranchPicker controller={controller} project={project} active={active} blocked={blocked || pending} placement="summary" onChanged={() => void refresh()} />
      <button type="button" className="mira-summary-resource" onClick={() => void show()}><GitCommitHorizontal size={15} /><span>提交或推送</span></button>
    </details>
    <Dialog.Root open={active && open} onOpenChange={next => { if (!writing.current) setOpen(next) }}><Dialog.Portal container={document.getElementById('root')}>
      <Dialog.Overlay className="mira-git-commit-overlay" />
      <Dialog.Content className="mira-branch-dialog mira-git-commit" onOpenAutoFocus={event => event.preventDefault()} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        const actions: MiraGitAction[] = ['commit', 'commit-and-push', 'push'].filter(action => action === 'push' ? !locked && snapshot.canPush : !commitDisabled && (action === 'commit' || Boolean(snapshot.branch))) as MiraGitAction[]
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && actions.includes(selectedAction)) { event.preventDefault(); void run(selectedAction) }
        if (event.target instanceof HTMLTextAreaElement || !['ArrowUp', 'ArrowDown'].includes(event.key) || !actions.length) return
        event.preventDefault(); setSelectedAction(actions[(actions.indexOf(selectedAction) + (event.key === 'ArrowDown' ? 1 : actions.length - 1)) % actions.length])
      }} onEscapeKeyDown={event => { if (pending) event.preventDefault() }} onInteractOutside={event => { if (pending) event.preventDefault() }}>
        <Dialog.Title className="sr-only">提交更改</Dialog.Title><Dialog.Description className="sr-only">在 {snapshot.branch || '分离 HEAD'} 上提交或推送。</Dialog.Description>
        <div className="mira-git-commit__branch"><MiraBranchPicker controller={controller} project={project} active={active && open} blocked={locked} placement="dialog" onChanged={() => { void refresh().then(next => { if (next) setReviewed(next) }) }} /><MiraGitTotals snapshot={snapshot} /></div>
        <div className="mira-git-message"><textarea aria-label="提交消息" value={message} onChange={event => setMessage(event.target.value)} disabled={pending} maxLength={10000} placeholder="提交信息（留空将自动生成）" /><button type="button" aria-label="生成提交消息" title="生成提交消息" disabled={locked || !selected.length} onClick={() => void generate()}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}</button></div>
        <label className="mira-git-include"><input type="checkbox" checked={include} disabled={pending || loading || !snapshot.files.some(file => file.unstaged)} onChange={event => setInclude(event.target.checked)} /><span>包含未暂存的更改</span><small>{selected.length} 个文件</small></label>
        {(loading || pending) && <p role="status">{loading ? '正在刷新 Git 状态…' : '正在处理…'}<LoaderCircle size={14} className="animate-spin" /></p>}
        {(blocked || snapshot.mutationBlocked) && <p>请先停止项目任务并处理待发送消息。</p>}
        {error && <p role="alert">{error}<button type="button" disabled={pending} onClick={() => { void refresh().then(next => { if (next) { setReviewed(next); setError('') } }) }}>刷新</button></p>}
        <div className="mira-git-actions">{([
          { action: 'commit', label: '提交', disabled: commitDisabled, icon: <GitCommitHorizontal size={16} /> },
          { action: 'commit-and-push', label: '提交并推送', disabled: commitDisabled || !snapshot.branch, icon: <CloudUpload size={16} /> },
          { action: 'push', label: `推送${snapshot.ahead ? ' ↑' + snapshot.ahead : ''}`, disabled: locked || !snapshot.canPush, icon: <CloudUpload size={16} /> },
        ] as const).map(item => <button key={item.action} type="button" aria-label={item.label} data-selected={selectedAction === item.action} disabled={item.disabled} onMouseEnter={() => { if (!item.disabled) setSelectedAction(item.action) }} onFocus={() => { if (!item.disabled) setSelectedAction(item.action) }} onClick={() => void run(item.action)}>{item.icon}<span>{item.label}</span>{selectedAction === item.action && <span className="mira-git-action-shortcut">{miraShortcutLabel('Enter').replace('Enter', '↵')}</span>}</button>)}</div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </>
}
