import { useEffect, useRef, useState } from 'react'
import { ArchiveRestore, CircleAlert, LoaderCircle, MoreHorizontal, Trash2 } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { HarnessHistoryPage, HarnessHistoryRow } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'

export function ArchivedSessions({ controller, sort, refreshKey, activeId, onOpen }: { controller: PilotController; sort: 'updated' | 'created'; refreshKey: unknown; activeId?: string; onOpen: (id: string) => void }) {
  const [page, setPage] = useState<HarnessHistoryPage>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [failedPage, setFailedPage] = useState(1)
  const [busyId, setBusyId] = useState('')
  const generation = useRef(0)
  const operation = useRef(0)
  const mutationInFlight = useRef(false)

  async function load(pageNumber = 1) {
    const request = ++generation.current
    setLoading(true); setError('')
    try {
      const result = await controller.queryHistory({ archiveView: 'archived', sort: sort === 'created' ? 'created-desc' : 'updated-desc', page: pageNumber, pageSize: 50 })
      if (generation.current !== request) return
      setPage(previous => pageNumber > 1 && previous ? { ...result, rows: [...previous.rows, ...result.rows.filter(row => !previous.rows.some(item => item.id === row.id))] } : result)
    } catch (cause) {
      if (generation.current === request) { setFailedPage(pageNumber); setError(cause instanceof Error ? cause.message : '读取归档任务失败') }
    } finally { if (generation.current === request) setLoading(false) }
  }
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    setPage(undefined)
    void load()
    return () => { generation.current++ }
  }, [controller, sort, refreshKey])
  useEffect(() => {
    setBusyId(''); mutationInFlight.current = false
    return () => { operation.current++ }
  }, [controller])

  async function mutate(row: HarnessHistoryRow, remove: boolean) {
    if (mutationInFlight.current) return
    mutationInFlight.current = true
    const request = ++operation.current
    setBusyId(row.id); setError('')
    try {
      if (remove) await controller.deleteSession(row.id)
      else await controller.restoreSession(row.id)
      if (operation.current === request) await loadRef.current()
    } catch (cause) { if (operation.current === request) setError(cause instanceof Error ? cause.message : '归档操作失败') }
    finally { if (operation.current === request) { mutationInFlight.current = false; setBusyId('') } }
  }

  return <section aria-label="已归档任务" className="mira-session-archived">
    <div className="mira-session-group__head"><span>已归档{page ? ` · ${page.total}` : ''}</span></div>
    {error && <div className="mira-session-feedback" role="alert"><CircleAlert size={13} /><span>{error}</span><button type="button" onClick={() => void load(failedPage)}>重试</button></div>}
    {page?.rows.map(row => <div key={row.id} className={`mira-session-row${activeId === row.id ? ' is-active' : ''}`}>
      <button type="button" className="mira-session-row__open" aria-current={activeId === row.id ? 'page' : undefined} title={row.title} onClick={() => onOpen(row.id)}><span>{row.title || '新任务'}</span></button>
      <button type="button" className="mira-session-icon" title="恢复任务" aria-label={`恢复 ${row.title}`} disabled={Boolean(busyId)} onClick={() => void mutate(row, false)}>{busyId === row.id ? <LoaderCircle size={14} className="pilot-spin" /> : <ArchiveRestore size={14} />}</button>
      <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" aria-label={`${row.title} 的归档操作`} disabled={Boolean(busyId)}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="start" sideOffset={4}>
        <DropdownMenu.Item className="mira-session-menu__item" onSelect={() => void mutate(row, false)}><ArchiveRestore size={14} />恢复任务</DropdownMenu.Item>
        <DropdownMenu.Sub><DropdownMenu.SubTrigger className="mira-session-menu__item mira-session-menu__item--danger"><Trash2 size={14} />永久删除</DropdownMenu.SubTrigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.SubContent className="mira-session-menu"><DropdownMenu.Label className="mira-session-menu__label">删除后无法恢复</DropdownMenu.Label><DropdownMenu.Item className="mira-session-menu__item mira-session-menu__item--danger" onSelect={() => void mutate(row, true)}>确认删除「{row.title || '新任务'}」</DropdownMenu.Item></DropdownMenu.SubContent></DropdownMenu.Portal></DropdownMenu.Sub>
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    </div>)}
    {loading && <p className="mira-session-hint" role="status"><LoaderCircle size={14} className="pilot-spin" /> 正在读取归档任务</p>}
    {!loading && !error && page?.total === 0 && <p className="mira-session-hint">没有已归档任务</p>}
    {page && page.rows.length < page.total && !error && <button type="button" className="mira-session-more" disabled={loading} onClick={() => void load(page.page + 1)}>加载更多</button>}
  </section>
}
