/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode's archived task actions and frozen-selection confirmation.
 * Upstream license: third-party-licenses/zcode/.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArchiveRestore, CircleAlert, Folder, LoaderCircle, MoreHorizontal, Trash2, X } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import type { HarnessArchivedSnapshot, HarnessHistoryPage, HarnessHistoryRow } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { SidebarActionHint } from './SidebarCollectionSection'
import { relativeSessionTime } from './session-groups'

export function ArchivedSessions({ controller, sort, refreshKey, activeId, onOpen, active = true, actionsContainer }: { controller: PilotController; sort: 'updated' | 'created'; refreshKey: unknown; activeId?: string; onOpen: (id: string) => void; active?: boolean; actionsContainer?: HTMLElement | null }) {
  const [page, setPage] = useState<HarnessHistoryPage>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [failedPage, setFailedPage] = useState(1)
  const [busyId, setBusyId] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<HarnessArchivedSnapshot>()
  const [resultMessage, setResultMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [refreshFailed, setRefreshFailed] = useState(false)
  const generation = useRef(0)
  const operation = useRef(0)
  const mutationInFlight = useRef(false)
  const scope = useRef({ controller, active })
  scope.current = { controller, active }
  const isCurrent = (request: number) => operation.current === request && scope.current.controller === controller && scope.current.active

  async function load(pageNumber = 1) {
    const request = ++generation.current
    setLoading(true); setError('')
    try {
      const result = await controller.queryHistory({ archiveView: 'archived', sort: sort === 'created' ? 'created-desc' : 'updated-desc', page: pageNumber, pageSize: 50 })
      if (generation.current !== request || scope.current.controller !== controller || !scope.current.active) return
      setPage(previous => pageNumber > 1 && previous ? { ...result, rows: [...previous.rows, ...result.rows.filter(row => !previous.rows.some(item => item.id === row.id))] } : result)
    } catch (cause) {
      if (generation.current === request) { setFailedPage(pageNumber); setError(cause instanceof Error ? cause.message : '读取归档任务失败') }
    } finally { if (generation.current === request) setLoading(false) }
  }
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    setPage(undefined)
    if (active) void load()
    return () => { generation.current++ }
  }, [controller, sort, refreshKey, active])
  useEffect(() => {
    setBusyId(''); mutationInFlight.current = false
    setConfirmation(undefined); setMenuOpen(false); setActionError(''); setResultMessage(''); setRefreshFailed(false)
    return () => { operation.current++ }
  }, [controller, active])

  async function mutate(row: HarnessHistoryRow, remove: boolean) {
    if (mutationInFlight.current || !active || confirmation) return
    mutationInFlight.current = true
    const request = ++operation.current
    setBusyId(row.id); setError('')
    try {
      if (remove) await controller.deleteSession(row.id)
      else await controller.restoreSession(row.id)
      if (isCurrent(request)) await loadRef.current()
    } catch (cause) { if (isCurrent(request)) setError(cause instanceof Error ? cause.message : '归档操作失败') }
    finally { if (isCurrent(request)) { mutationInFlight.current = false; setBusyId('') } }
  }

  async function prepareDelete() {
    if (mutationInFlight.current || !active) return
    mutationInFlight.current = true
    const request = ++operation.current
    setBusyId('bulk-snapshot'); setMenuOpen(false); setActionError(''); setResultMessage(''); setRefreshFailed(false)
    try {
      const snapshot = await controller.getArchivedSnapshot()
      if (!isCurrent(request)) return
      if (snapshot.count) setConfirmation(snapshot)
      else { setResultMessage('没有已归档任务'); await loadRef.current() }
    } catch (cause) { if (isCurrent(request)) setActionError(cause instanceof Error ? cause.message : '读取归档删除范围失败，请重试。') }
    finally { if (isCurrent(request)) { mutationInFlight.current = false; setBusyId('') } }
  }
  const cancelConfirmation = () => {
    if (busyId === 'bulk-delete') return
    operation.current++; mutationInFlight.current = false
    setConfirmation(undefined); setBusyId('')
  }
  async function confirmDelete() {
    if (!confirmation || mutationInFlight.current || !active) return
    mutationInFlight.current = true
    const selection = confirmation
    const request = ++operation.current
    setBusyId('bulk-delete'); setActionError('')
    try {
      const result = await controller.deleteArchivedSessions(selection.snapshotId)
      if (!isCurrent(request)) return
      setConfirmation(undefined)
      setResultMessage(`已删除 ${result.deletedIds.length} 个，跳过 ${result.skippedIds.length} 个，失败 ${result.failedIds.length} 个。`)
      if (result.refreshError) { setActionError(result.refreshError); setRefreshFailed(true) }
      await loadRef.current()
    } catch {
      if (isCurrent(request)) {
        setConfirmation(undefined); setRefreshFailed(true)
        setActionError('删除请求未完成，请刷新归档列表检查结果；再次操作前需要重新确认范围。')
      }
    } finally { if (isCurrent(request)) { mutationInFlight.current = false; setBusyId('') } }
  }
  async function retryRefresh() {
    if (mutationInFlight.current || !active) return
    mutationInFlight.current = true
    const request = ++operation.current
    setBusyId('bulk-refresh')
    try {
      await controller.refreshSessions()
      if (!isCurrent(request)) return
      await loadRef.current()
      if (isCurrent(request)) { setRefreshFailed(false); setActionError('') }
    } catch { if (isCurrent(request)) setActionError('任务列表刷新失败，请重试刷新。') }
    finally { if (isCurrent(request)) { mutationInFlight.current = false; setBusyId('') } }
  }
  const bulkBusy = busyId.startsWith('bulk-')
  const actions = <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}><SidebarActionHint title={bulkBusy ? '正在处理…' : '归档任务操作'}><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" aria-label="归档任务操作" aria-busy={bulkBusy} disabled={!active || loading || Boolean(busyId) || !page?.total || !controller.supportsArchivedDeletion}>{bulkBusy ? <LoaderCircle size={15} className="pilot-spin" /> : <MoreHorizontal size={15} />}</button></DropdownMenu.Trigger></SidebarActionHint><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="end" sideOffset={4}><DropdownMenu.Label className="mira-session-menu__label">{page?.total ?? 0} 个归档任务</DropdownMenu.Label><DropdownMenu.Separator className="mira-session-menu__separator" /><DropdownMenu.Item className="mira-session-menu__item mira-session-menu__item--danger" disabled={Boolean(busyId)} onSelect={() => void prepareDelete()}><Trash2 size={14} />删除所有归档任务…</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>

  return <section aria-label="已归档任务" className="mira-session-archived">
    {actionsContainer === undefined ? actions : actionsContainer ? createPortal(actions, actionsContainer) : null}
    <div className="mira-session-group__head"><span>已归档{page ? ` · ${page.total}` : ''}</span></div>
    {resultMessage && <p role="status" className="mira-session-bulk-result">{resultMessage}</p>}
    {actionError && <div role="alert" className="mira-session-feedback"><CircleAlert size={13} /><span>{actionError}</span>{refreshFailed && <button type="button" disabled={Boolean(busyId)} onClick={() => void retryRefresh()}>重试刷新</button>}</div>}
    {error && <div className="mira-session-feedback" role="alert"><CircleAlert size={13} /><span>{error}</span><button type="button" onClick={() => void load(failedPage)}>重试</button></div>}
    {page?.rows.map(row => <div key={row.id} className={`mira-session-row mira-session-row--archived${activeId === row.id ? ' is-active' : ''}`}>
      <button type="button" className="mira-session-row__open" aria-current={activeId === row.id ? 'page' : undefined} title={row.title} onClick={() => onOpen(row.id)}><span className="mira-session-archived-title"><span>{row.title || '新任务'}</span><time title={new Date(sort === 'created' ? row.createdAt : row.updatedAt).toLocaleString()} dateTime={new Date(sort === 'created' ? row.createdAt : row.updatedAt).toISOString()}>{relativeSessionTime(sort === 'created' ? row.createdAt : row.updatedAt)}</time></span><span className="mira-session-archived-source" title={row.workingDirectory}><Folder size={11} /><span>{row.projectName || '个人工作区'}</span></span></button>
      <button type="button" className="mira-session-icon" title="恢复任务" aria-label={`恢复 ${row.title}`} disabled={Boolean(busyId) || Boolean(confirmation)} onClick={() => void mutate(row, false)}>{busyId === row.id ? <LoaderCircle size={14} className="pilot-spin" /> : <ArchiveRestore size={14} />}</button>
      <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" aria-label={`${row.title} 的归档操作`} disabled={Boolean(busyId)}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="start" sideOffset={4}>
        <DropdownMenu.Item className="mira-session-menu__item" onSelect={() => void mutate(row, false)}><ArchiveRestore size={14} />恢复任务</DropdownMenu.Item>
        <DropdownMenu.Sub><DropdownMenu.SubTrigger className="mira-session-menu__item mira-session-menu__item--danger"><Trash2 size={14} />永久删除</DropdownMenu.SubTrigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.SubContent className="mira-session-menu"><DropdownMenu.Label className="mira-session-menu__label">删除后无法恢复</DropdownMenu.Label><DropdownMenu.Item className="mira-session-menu__item mira-session-menu__item--danger" onSelect={() => void mutate(row, true)}>确认删除「{row.title || '新任务'}」</DropdownMenu.Item></DropdownMenu.SubContent></DropdownMenu.Portal></DropdownMenu.Sub>
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    </div>)}
    {loading && <p className="mira-session-hint" role="status"><LoaderCircle size={14} className="pilot-spin" /> 正在读取归档任务</p>}
    {!loading && !error && page?.total === 0 && <p className="mira-session-hint">没有已归档任务</p>}
    {page && page.rows.length < page.total && !error && <button type="button" className="mira-session-more" disabled={loading || Boolean(busyId)} onClick={() => void load(page.page + 1)}>加载更多</button>}
    <Dialog.Root open={active && Boolean(confirmation)} onOpenChange={open => { if (!open) cancelConfirmation() }}><Dialog.Portal container={document.getElementById('root')}><Dialog.Overlay className="mira-archive-confirm-overlay" /><Dialog.Content className="mira-archive-confirm" onEscapeKeyDown={event => { if (busyId === 'bulk-delete') event.preventDefault() }} onPointerDownOutside={event => { if (busyId === 'bulk-delete') event.preventDefault() }}><Dialog.Title>删除 {confirmation?.count ?? 0} 个归档任务？</Dialog.Title><Dialog.Description>这些任务及其对话、附件会永久删除，无法恢复。范围包含所有项目的归档任务；已恢复、运行中或仍有待发送消息的任务会跳过。</Dialog.Description><div className="mira-archive-confirm-actions"><button type="button" disabled={busyId === 'bulk-delete'} onClick={cancelConfirmation}>取消</button><button type="button" className="mira-archive-confirm-danger" aria-label="确认删除归档任务" disabled={busyId === 'bulk-delete'} onClick={() => void confirmDelete()}>{busyId === 'bulk-delete' ? <><LoaderCircle size={14} className="pilot-spin" />正在删除…</> : '删除所有归档任务'}</button></div><Dialog.Close asChild><button type="button" className="mira-archive-confirm-close mira-session-icon" aria-label="关闭删除确认" disabled={busyId === 'bulk-delete'}><X size={16} /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>
}
