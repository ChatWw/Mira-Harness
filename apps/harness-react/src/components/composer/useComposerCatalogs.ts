import { useEffect, useState } from 'react'
import type { PilotController } from '../../state/pilot-state'
import type { HarnessWorkspaceFileEntry } from '../../../../../src/config/harness'

interface Catalog<T> { status: 'idle' | 'loading' | 'ready' | 'error'; items: T[]; error?: string; scope?: string; truncated?: boolean }
interface NamedCapability { id: string; name: string; description?: string }
const empty = <T,>(): Catalog<T> => ({ status: 'idle', items: [] })

export function useComposerCatalogs(controller: PilotController, workspace: { sessionId?: string; projectId?: string; directory?: string; draftId?: string }, query: string, open: boolean, includeFiles: boolean) {
  const [files, setFiles] = useState<Catalog<HarnessWorkspaceFileEntry>>(empty)
  const [skills, setSkills] = useState<Catalog<NamedCapability>>(empty)
  const [mcp, setMcp] = useState<Catalog<NamedCapability>>(empty)
  const [retry, setRetry] = useState(0)
  const { sessionId, projectId, directory, draftId } = workspace
  const hasWorkspace = Boolean(directory && (sessionId || projectId))
  const fileScope = JSON.stringify([sessionId, projectId, directory, draftId, query])
  useEffect(() => {
    if (!open || !includeFiles || !hasWorkspace) { setFiles(empty()); return }
    let active = true
    setFiles({ status: 'loading', items: [], scope: fileScope })
    const timer = window.setTimeout(() => {
      const request = sessionId
        ? query ? controller.searchFilesFor(sessionId, query) : controller.listFilesFor(sessionId)
        : query ? controller.searchProjectFiles(projectId!, query) : controller.listProjectFiles(projectId!)
      void request.then(result => {
        const entries = result.entries.filter(item => item.type === 'file')
        if (active) setFiles({ status: 'ready', items: entries.slice(0, 40), scope: fileScope, truncated: entries.length > 40 || 'truncated' in result && Boolean(result.truncated) })
      }, error => { if (active) setFiles({ status: 'error', items: [], error: error instanceof Error ? error.message : '文件加载失败', scope: fileScope }) })
    }, query ? 120 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [controller, fileScope, open, includeFiles, hasWorkspace, retry])
  useEffect(() => {
    if (!open) return
    let active = true
    setSkills({ status: 'loading', items: [] }); setMcp({ status: 'loading', items: [] })
    void controller.listSkills().then(items => {
      if (active) setSkills({ status: 'ready', items: (items as Array<NamedCapability & { enabled?: boolean }>).filter(item => item.enabled !== false) })
    }, error => { if (active) setSkills({ status: 'error', items: [], error: error instanceof Error ? error.message : '技能加载失败' }) })
    void controller.listMcp().then(items => {
      if (active) setMcp({ status: 'ready', items: items.filter(item => item.enabled) })
    }, error => { if (active) setMcp({ status: 'error', items: [], error: error instanceof Error ? error.message : 'MCP 加载失败' }) })
    return () => { active = false }
  }, [controller, open, retry])
  const visibleFiles: Catalog<HarnessWorkspaceFileEntry> = files.scope === fileScope ? files : { status: open && includeFiles && hasWorkspace ? 'loading' : 'idle', items: [] }
  return { files: visibleFiles, skills, mcp, reload: () => setRetry(value => value + 1) }
}
