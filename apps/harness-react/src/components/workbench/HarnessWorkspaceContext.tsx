/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode WorkspaceHeaderSections context information interaction.
 * Upstream license: third-party-licenses/zcode/.
 */
import { useEffect, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { CircleAlert, Copy, FolderOpen, GitBranch, LoaderCircle, RotateCw } from 'lucide-react'
import type { HarnessGitBranch, HarnessProject } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'

export interface HarnessWorkspaceContextProps {
  controller: PilotController
  project?: HarnessProject
  sessionId?: string
  directory?: string
  onAction: (action: () => Promise<unknown>) => void
}

interface BranchDetails { identity: string; loading: boolean; name?: string; count?: number; error?: string }

function branchRows(raw: unknown): HarnessGitBranch[] {
  if (!Array.isArray(raw) || raw.some(branch => !branch || typeof branch.name !== 'string' || !branch.name.trim() || typeof branch.current !== 'boolean')) throw new Error('Git 分支响应无效，请重试')
  return raw
}

export function HarnessWorkspaceContext({ controller, project, sessionId, directory, onAction }: HarnessWorkspaceContextProps) {
  const identity = JSON.stringify([project?.id, directory])
  const gitAvailable = Boolean(project?.isGitRepository && project.directoryExists)
  const [menuOpen, setMenuOpen] = useState(false)
  const [details, setDetails] = useState<BranchDetails>({ identity, loading: false })
  const revision = useRef(0)
  const pending = useRef(false)
  useEffect(() => {
    revision.current++; pending.current = false
    setDetails({ identity, loading: false }); setMenuOpen(false)
    return () => { revision.current++; pending.current = false }
  }, [controller, identity, gitAvailable, project?.gitBranch])

  const current = details.identity === identity ? details : { identity, loading: false }
  const branch = gitAvailable ? current.name ?? project?.gitBranch ?? '当前分支待查询' : undefined
  async function refreshBranches() {
    if (!gitAvailable || !project || pending.current) return
    pending.current = true
    const request = ++revision.current
    setDetails(previous => ({ ...(previous.identity === identity ? previous : { identity }), loading: true, error: undefined }))
    try {
      const rows = branchRows(await controller.listGitBranches(project.id))
      if (revision.current !== request) return
      const head = rows.find(row => row.current)
      setDetails({ identity, loading: false, name: head?.name || (rows.length ? 'HEAD 未关联本地分支' : '尚无本地分支'), count: head ? head.uncommittedFileCount ?? 0 : undefined })
    } catch (cause) {
      if (revision.current === request) setDetails(previous => ({ ...previous, loading: false, error: cause instanceof Error ? cause.message : '读取 Git 分支失败，请重试' }))
    } finally { if (revision.current === request) pending.current = false }
  }
  const info = <>
    <strong>{project?.name || '个人工作区'}</strong>
    <p className="mira-context-path">{directory || '尚未选择工作目录'}</p>
    {project && !project.directoryExists && <p className="mira-context-feedback">项目目录不可用</p>}
    {branch && <div className="mira-context-branch"><GitBranch size={14} /><span>{branch}</span>{current.loading && <LoaderCircle size={13} className="pilot-spin" aria-label="正在读取 Git 分支" />}</div>}
    {branch && current.count !== undefined && <p className="mira-context-feedback">{current.count ? `${current.count} 个未提交文件` : '工作树干净'}</p>}
  </>
  const portal = document.getElementById('root')
  return <Tooltip.Provider delayDuration={300}><DropdownMenu.Root open={menuOpen} onOpenChange={open => { setMenuOpen(open); if (open) void refreshBranches() }}>
    <Tooltip.Root open={menuOpen ? false : undefined} onOpenChange={open => { if (open) void refreshBranches() }}><Tooltip.Trigger asChild><DropdownMenu.Trigger asChild><button type="button" className="mira-header-tool" aria-label="工作目录信息"><FolderOpen size={16} /></button></DropdownMenu.Trigger></Tooltip.Trigger><Tooltip.Portal container={portal}><Tooltip.Content className="mira-context-tooltip" side="bottom" align="start" sideOffset={6}>{info}{current.error && <p className="mira-context-feedback">Git 分支读取失败</p>}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
    <DropdownMenu.Portal container={portal}><DropdownMenu.Content align="start" sideOffset={6} className="mira-session-menu mira-context-menu">
      <div className="mira-context-info">{info}</div>
      {current.error && <div className="mira-context-error" role="alert"><CircleAlert size={13} /><span>{current.error}</span></div>}
      {gitAvailable && <DropdownMenu.Item className="mira-session-menu__item" disabled={current.loading} onSelect={event => { event.preventDefault(); void refreshBranches() }}><RotateCw size={14} />{current.error ? '重试读取分支' : '刷新分支信息'}</DropdownMenu.Item>}
      <DropdownMenu.Separator className="mira-session-menu__separator" />
      <DropdownMenu.Item className="mira-session-menu__item" disabled={!directory} onSelect={() => onAction(() => navigator.clipboard.writeText(directory || ''))}><Copy size={14} />复制工作目录</DropdownMenu.Item>
      <DropdownMenu.Item className="mira-session-menu__item" disabled={!sessionId || !directory || Boolean(project && !project.directoryExists)} onSelect={() => { if (sessionId) onAction(async () => { const error = await controller.openSessionProject(sessionId); if (error) throw new Error(error) }) }}><FolderOpen size={14} />在文件管理器中打开</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root></Tooltip.Provider>
}
