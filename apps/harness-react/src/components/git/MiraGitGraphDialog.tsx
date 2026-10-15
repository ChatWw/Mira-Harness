/* Git graph interaction adapted from ZCode GitGraphDialog (Apache-2.0).
 * Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode. */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { RotateCw, X } from 'lucide-react'
import type { MiraGitCommit } from '../../../../../src/config/miraGit'
import type { PilotController } from '../../state/pilot-state'
import { createGitGraphLayoutModel } from './miraGitGraphLayout'

export function MiraGitGraphDialog({ controller, projectId, open, onOpenChange }: { controller: PilotController; projectId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [commits, setCommits] = useState<MiraGitCommit[]>([])
  const [selected, setSelected] = useState<string>()
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const revision = useRef(0)
  const busy = useRef(false)
  async function load(skip: number) {
    if (busy.current) return
    busy.current = true
    const request = ++revision.current
    setLoading(true); setError('')
    try {
      const result = await controller.getGitGraph(projectId, skip)
      if (request !== revision.current) return
      setCommits(current => skip ? [...current, ...result.commits.filter(commit => !current.some(item => item.hash === commit.hash))] : result.commits)
      setHasMore(result.hasMore)
      if (!skip) setSelected(result.commits[0]?.hash)
    } catch (failure) { if (request === revision.current) setError(failure instanceof Error ? failure.message : '图谱读取失败') }
    finally { if (request === revision.current) { busy.current = false; setLoading(false) } }
  }
  useEffect(() => {
    setCommits([]); setSelected(undefined); setHasMore(false)
    if (open) void load(0)
    return () => { revision.current++; busy.current = false }
  }, [controller, projectId, open])
  const model = useMemo(() => createGitGraphLayoutModel(commits), [commits])
  const width = Math.max(40, ...model.vertices.map(vertex => (vertex.getWidthLaneIndex() + 1) * 18))
  const colors = ['#8b8cf6', '#2cbba6', '#deab50', '#cf76c7', '#6da8e7']
  const detail = commits.find(commit => commit.hash === selected)
  const point = (lane: number, row: number) => [16 + lane * 18, 21 + row * 42]
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal container={document.getElementById('root')}>
    <Dialog.Overlay className="mira-composer-confirm-overlay" />
    <Dialog.Content className="mira-branch-dialog mira-git-graph">
      <Dialog.Close asChild><button className="mira-composer-confirm__close" aria-label="关闭 Git 图谱"><X size={18} /></button></Dialog.Close>
      <Dialog.Title>Git 图谱</Dialog.Title><Dialog.Description>查看分支、提交历史与合并关系。</Dialog.Description>
      <button type="button" className="mira-git-refresh" disabled={loading} onClick={() => void load(0)}><RotateCw size={14} />刷新</button>
      {error && <p role="alert">{error}</p>}
      <div className="mira-git-graph__columns" style={{ paddingLeft: width + 8 }}><span>描述</span><span>日期</span><span>作者</span><span>提交</span></div><div className="mira-git-graph__scroll"><div className="mira-git-graph__table" style={{ minWidth: width + 620 }}>
        <svg width={width} height={Math.max(42, commits.length * 42)} aria-label="提交关系图">
          {model.branchLines.map((line, index) => { const [x, y] = point(line.from.laneIndex, line.from.rowIndex), [tx, ty] = point(line.to.laneIndex, line.to.rowIndex); return <path key={index} d={'M ' + x + ' ' + y + ' C ' + x + ' ' + (y + (ty - y) / 2) + ', ' + tx + ' ' + (y + (ty - y) / 2) + ', ' + tx + ' ' + ty} stroke={colors[line.laneIndex % colors.length]} strokeWidth={2} fill="none" /> })}
          {model.vertices.map(vertex => { const [x, y] = point(vertex.getLaneIndex(), vertex.id); return <circle key={vertex.hash} cx={x} cy={y} r={4} fill={colors[vertex.getLaneIndex() % colors.length]} /> })}
        </svg>
        <div className="mira-git-graph__rows">{commits.map(commit => <button type="button" key={commit.hash} aria-pressed={selected === commit.hash} onClick={() => setSelected(commit.hash)}><span title={commit.subject}>{commit.refs && <em>{commit.refs}</em>}{commit.subject}</span><time>{new Date(commit.date).toLocaleDateString()}</time><span>{commit.author}</span><code>{commit.hash.slice(0, 8)}</code></button>)}</div>
      </div></div>
      {!commits.length && <p role="status">{loading ? '正在读取提交…' : '仓库尚无提交'}</p>}
      {hasMore && <button type="button" disabled={loading} onClick={() => void load(commits.length)}>{loading ? '正在读取…' : '加载更多'}</button>}
      {detail && <div className="mira-git-graph__detail"><strong>{detail.subject}</strong><code>{detail.hash}</code><span>{detail.author} · {new Date(detail.date).toLocaleString()}</span></div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
