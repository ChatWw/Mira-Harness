import { useEffect, useState } from 'react'
import type { PilotController } from '../../state/pilot-state'
import type { HarnessWorkspaceFileEntry } from '../../../../../src/config/harness'
import type { MiraPluginItem } from '../../../../../src/config/miraPlugins'
import type { MiraMcpItem } from '../../../../../src/config/miraMcp'

interface Catalog<T> { status: 'idle' | 'loading' | 'ready' | 'error'; items: T[]; error?: string; scope?: string; truncated?: boolean }
interface NamedCapability { id: string; name: string; description?: string }
const empty = <T,>(): Catalog<T> => ({ status: 'idle', items: [] })

export function useComposerCatalogs(controller: PilotController, workspace: { sessionId?: string; projectId?: string; directory?: string; draftId?: string }, query: string, open: boolean, includeFiles: boolean, capabilities: 'skills' | 'mcp' | 'all' | 'plugins' | 'commands') {
  const [files, setFiles] = useState<Catalog<HarnessWorkspaceFileEntry>>(empty)
  const [skills, setSkills] = useState<Catalog<NamedCapability>>(empty)
  const [mcp, setMcp] = useState<Catalog<MiraMcpItem>>(empty)
  const [plugins, setPlugins] = useState<Catalog<MiraPluginItem>>(empty)
  const [retry, setRetry] = useState(0)
  const { sessionId, projectId, directory, draftId } = workspace
  const includeSkills = open && (capabilities === 'skills' || capabilities === 'all' || capabilities === 'commands')
  const includeMcp = open && (capabilities === 'mcp' || capabilities === 'all')
  const includePlugins = open && (capabilities === 'plugins' || capabilities === 'commands') && controller.supportsPlugins
  const pluginScope = JSON.stringify([sessionId, projectId, directory, draftId])
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
    if (!includeSkills) { setSkills(empty()); return }
    let active = true
    setSkills({ status: 'loading', items: [] })
    void controller.listSkills().then(items => {
      if (active) setSkills({ status: 'ready', items: (items as Array<NamedCapability & { enabled?: boolean }>).filter(item => item.enabled !== false) })
    }, error => { if (active) setSkills({ status: 'error', items: [], error: error instanceof Error ? error.message : '技能加载失败' }) })
    return () => { active = false }
  }, [controller, includeSkills, retry])
  useEffect(() => {
    if (!includeMcp) { setMcp(empty()); return }
    let active = true
    setMcp({ status: 'loading', items: [] })
    void controller.listMcp().then(items => {
      if (active) setMcp({ status: 'ready', items: items.filter(item => item.enabled) })
    }, error => { if (active) setMcp({ status: 'error', items: [], error: error instanceof Error ? error.message : 'MCP 加载失败' }) })
    return () => { active = false }
  }, [controller, includeMcp, retry])
  const visibleFiles: Catalog<HarnessWorkspaceFileEntry> = files.scope === fileScope ? files : { status: open && includeFiles && hasWorkspace ? 'loading' : 'idle', items: [] }
  useEffect(() => {
    if (!includePlugins) { setPlugins(empty()); return }
    let active = true
    setPlugins({ status: 'loading', items: [], scope: pluginScope })
    void controller.listPluginCatalog(sessionId).then(items => {
      if (active) setPlugins({ status: 'ready', items: items.filter(item => item.enabled), scope: pluginScope })
    }, error => { if (active) setPlugins({ status: 'error', items: [], error: error instanceof Error ? error.message : '插件加载失败', scope: pluginScope }) })
    return () => { active = false }
  }, [controller, includePlugins, pluginScope, retry])
  const visiblePlugins: Catalog<MiraPluginItem> = plugins.scope === pluginScope ? plugins : { status: includePlugins ? 'loading' : 'idle', items: [] }
  return { files: visibleFiles, skills, mcp, plugins: visiblePlugins, reload: () => setRetry(value => value + 1) }
}
