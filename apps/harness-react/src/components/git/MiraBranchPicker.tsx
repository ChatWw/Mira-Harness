/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode's Git branch picker and create dialog.
 * Upstream license: third-party-licenses/zcode/.
 */
import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { Check, ChevronDown, CircleAlert, GitBranch, LoaderCircle, Plus, RotateCw, Search, X } from 'lucide-react'
import type { HarnessGitContext, HarnessProject } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'

export interface MiraBranchPickerProps {
  controller: PilotController
  project?: HarnessProject
  active?: boolean
  blocked?: boolean
  placement: 'composer' | 'summary'
}

export function MiraBranchPicker({ controller, project, active = true, blocked = false, placement }: MiraBranchPickerProps) {
  const identity = JSON.stringify([project?.id, project?.directory])
  const available = Boolean(controller.supportsGitActions && project?.directoryExists && project.isGitRepository)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [snapshot, setSnapshot] = useState<HarnessGitContext>()
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const queryRevision = useRef(0)
  const ownerRevision = useRef(0)
  const reading = useRef(false)
  const writing = useRef(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const latest = useRef({ identity, active, blocked, available })
  latest.current = { identity, active, blocked, available }

  useEffect(() => {
    ownerRevision.current++; queryRevision.current++; reading.current = false; writing.current = false
    setOpen(false); setCreating(false); setName(''); setSnapshot(undefined); setLoading(false); setMutating(false); setError(''); setSelected('')
    return () => { ownerRevision.current++; queryRevision.current++ }
  }, [controller, identity, active, available])
  useEffect(() => {
    queryRevision.current++; reading.current = false; setLoading(false); setSnapshot(undefined)
    if (open || creating) void readContext()
  }, [project?.gitBranch])

  async function readContext() {
    if (!project || !latest.current.active || !latest.current.available || latest.current.identity !== identity || reading.current || writing.current) return
    const request = ++queryRevision.current
    reading.current = true; setLoading(true); setError('')
    try {
      const context = await controller.getGitContext(project.id)
      if (queryRevision.current !== request) return
      if (context.projectId !== project.id || context.directory !== project.directory) throw new Error('项目目录已变化，请重新打开分支菜单')
      setSnapshot(context); setSelected(context.branchName || context.branches[0]?.name || '')
    } catch (cause) {
      if (queryRevision.current === request) { setSnapshot(undefined); setError(cause instanceof Error ? cause.message : '读取分支失败，请重试') }
    } finally {
      if (queryRevision.current === request) { reading.current = false; setLoading(false) }
    }
  }

  async function mutate(branch: string, create: boolean) {
    if (!project || !snapshot || writing.current || reading.current || !latest.current.active || latest.current.identity !== identity || latest.current.blocked || snapshot.mutationBlocked || !snapshot.isRepository || !branch.trim()) return
    if (!create && snapshot.headType === 'branch' && branch === snapshot.branchName) { setOpen(false); return }
    const request = ownerRevision.current
    writing.current = true; setMutating(true); setError('')
    try {
      const next = create ? await controller.createGitBranch(project.id, branch.trim(), snapshot.snapshotToken) : await controller.checkoutGitBranch(project.id, branch, snapshot.snapshotToken)
      if (ownerRevision.current !== request) return
      setSnapshot(next); setOpen(false); setCreating(false); setName('')
    } catch (cause) {
      if (ownerRevision.current !== request) return
      setError(cause instanceof Error ? cause.message : '分支操作失败，请重试')
      // A failed mutation may mean HEAD changed elsewhere. A new read is required before another write.
      setSnapshot(undefined)
    } finally {
      if (ownerRevision.current === request) { writing.current = false; setMutating(false) }
    }
  }

  useEffect(() => {
    if (!open || !snapshot || loading) return
    const frame = requestAnimationFrame(() => listRef.current?.querySelector('[data-branch-current="true"]')?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  }, [open, snapshot, loading])

  if (!available) return null
  const label = snapshot?.headType === 'detached' ? '游离 HEAD' : snapshot?.branchName || project?.gitBranch || 'Git 分支'
  const locked = blocked || Boolean(snapshot?.mutationBlocked)
  const writeDisabled = locked || loading || mutating || !snapshot?.isRepository
  const portal = document.getElementById('root')
  const readFeedback = <>
    {loading && <p className="mira-branch-feedback" role="status"><LoaderCircle size={14} className="animate-spin" />正在读取本地分支…</p>}
    {error && <div className="mira-branch-error" role="alert"><CircleAlert size={14} /><span>{error}</span><button type="button" aria-label="重新读取分支" disabled={loading || mutating} onClick={() => void readContext()}><RotateCw size={14} /></button></div>}
    {locked && <p className="mira-branch-feedback">先停止此项目的任务并处理待发送消息，再切换分支。</p>}
    {snapshot && !snapshot.isRepository && <p className="mira-branch-feedback">此目录已不再是 Git 仓库，请重新选择项目。</p>}
    {snapshot?.headType === 'unborn' && <p className="mira-branch-feedback">当前分支尚无提交。</p>}
    {snapshot?.headType === 'detached' && <p className="mira-branch-feedback">HEAD 未关联本地分支{snapshot.commit ? ` · ${snapshot.commit.slice(0, 8)}` : ''}</p>}
  </>
  return <div className={`mira-branch-picker mira-branch-picker--${placement}`}>
    <Popover.Root open={active && open} onOpenChange={next => { if (writing.current) return; setOpen(next); if (next) void readContext() }}>
      <Popover.Trigger asChild><button ref={triggerRef} type="button" className="mira-branch-trigger" aria-label="选择 Git 分支" title={label} disabled={!active || mutating}><GitBranch size={16} /><span>{label}</span>{loading || mutating ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronDown size={14} />}</button></Popover.Trigger>
      <Popover.Portal container={portal}><Popover.Content className="mira-branch-popover" side={placement === 'composer' ? 'top' : 'left'} align="start" sideOffset={6} onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus() }} onCloseAutoFocus={event => { if (creating || !latest.current.active) { event.preventDefault(); return } const input = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="任务内容"]'); if (input) { event.preventDefault(); input.focus() } }} onEscapeKeyDown={event => { if (mutating) event.preventDefault() }} onInteractOutside={event => { if (mutating) event.preventDefault() }}>
        <Command label="搜索 Git 分支" loop value={selected} onValueChange={setSelected} filter={(value, search) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ? 1 : 0} onKeyDown={event => {
          if (event.key !== 'Tab' || event.shiftKey) return
          const item = listRef.current?.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]:not([data-disabled="true"])')
          if (item) { event.preventDefault(); item.click() }
        }}>
          <div className="mira-branch-search"><Search size={16} /><Command.Input ref={searchRef} aria-label="搜索 Git 分支" placeholder="搜索分支" disabled={mutating} /></div>
          {readFeedback}
          <Command.List ref={listRef} className="mira-branch-list">
            {!loading && !error && <Command.Empty className="mira-branch-empty">没有匹配的本地分支</Command.Empty>}
            <Command.Group heading="本地分支">
              {snapshot?.branches.map(branch => <Command.Item key={branch.name} value={branch.name} disabled={writeDisabled} className="mira-branch-item" data-branch-current={branch.current ? 'true' : undefined} onSelect={() => void mutate(branch.name, false)}><GitBranch size={16} /><span><strong title={branch.name}>{branch.name}</strong>{branch.current && <small>{snapshot.uncommittedFileCount ? `${snapshot.uncommittedFileCount} 个未提交文件` : '工作树干净'}</small>}</span>{branch.current && <Check size={15} />}</Command.Item>)}
            </Command.Group>
          </Command.List>
        </Command>
        <div className="mira-branch-footer"><button type="button" disabled={writeDisabled} onClick={() => { setOpen(false); setCreating(true); setError(''); setName('') }}><Plus size={16} />创建并切换分支</button><button type="button" aria-label="刷新本地分支" disabled={loading || mutating} onClick={() => void readContext()}><RotateCw size={15} /></button></div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    <Dialog.Root open={active && creating} onOpenChange={next => { if (writing.current) return; setCreating(next); if (!next) { setName(''); setError('') } }}><Dialog.Portal container={portal}>
      <Dialog.Overlay className="mira-composer-confirm-overlay" />
      <Dialog.Content className="mira-branch-dialog" onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && ['n', 'k'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation() } }} onCloseAutoFocus={event => { event.preventDefault(); if (latest.current.active) triggerRef.current?.focus() }} onEscapeKeyDown={event => { if (mutating) event.preventDefault() }} onInteractOutside={event => { if (mutating) event.preventDefault() }}>
        <Dialog.Close asChild><button type="button" className="mira-composer-confirm__close" aria-label="关闭创建分支" disabled={mutating}><X size={18} /></button></Dialog.Close>
        <Dialog.Title>创建 Git 分支</Dialog.Title><Dialog.Description>基于当前 HEAD 创建并切换到新分支。</Dialog.Description>
        <form onSubmit={event => { event.preventDefault(); void mutate(name, true) }}>
          <label>分支名称<input autoFocus aria-label="新分支名称" value={name} disabled={mutating} maxLength={240} placeholder="mira/new-task" onChange={event => setName(event.target.value)} /></label>
          {readFeedback}
          <div className="mira-branch-dialog__actions"><Dialog.Close asChild><button type="button" disabled={mutating}>取消</button></Dialog.Close><button type="submit" className="mira-branch-dialog__submit" disabled={writeDisabled || !name.trim()}>{mutating && <LoaderCircle size={16} className="animate-spin" />}创建并切换</button></div>
        </form>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </div>
}
