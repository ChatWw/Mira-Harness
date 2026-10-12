import { useEffect, useRef, useState } from 'react'
import { Blocks, FolderPlus, LoaderCircle } from 'lucide-react'
import type { MiraPluginItem } from '../../../../../src/config/miraPlugins'

export interface MiraPluginHost {
  listPlugins(): Promise<MiraPluginItem[]>
  importLocalPlugin(): Promise<MiraPluginItem[] | null>
  setPluginEnabled(id: string, enabled: boolean): Promise<MiraPluginItem[]>
  removePlugin(id: string): Promise<MiraPluginItem[]>
  navigate?(path: string): Promise<void>
}
const componentNames: Record<string, string> = { agents: 'Agent', commands: '命令', hooks: 'Hook', mcpServers: 'MCP', lspServers: 'LSP', dependencies: '依赖', settings: '设置', outputStyles: '输出样式', channels: '频道', userConfig: '自定义配置' }

export function MiraInstalledPlugins({ host, query = '', refreshRevision = 0, onBusyChange, onItemsChange, onTryPlugin }: { host: MiraPluginHost; query?: string; refreshRevision?: number; onBusyChange?: (busy: boolean) => void; onItemsChange?: (items: MiraPluginItem[]) => void; onTryPlugin?: (id: string) => Promise<void> }) {
  const [items, setItems] = useState<MiraPluginItem[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const revision = useRef(0)
  const working = useRef(false)
  useEffect(() => {
    const cycle = ++revision.current
    setBusy(true); setError('')
    void host.listPlugins().then(value => { if (cycle === revision.current) setItems(value) }, cause => { if (cycle === revision.current) setError(String(cause instanceof Error ? cause.message : cause)) }).finally(() => { if (cycle === revision.current) setBusy(false) })
    return () => { revision.current++ }
  }, [host, refreshRevision])
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])
  useEffect(() => { onItemsChange?.(items) }, [items, onItemsChange])
  async function change(operation: () => Promise<MiraPluginItem[] | null>, success: string) {
    if (working.current) return
    working.current = true
    const cycle = ++revision.current
    setBusy(true); setError(''); setFeedback('')
    try {
      const value = await operation()
      if (cycle === revision.current && value) { setItems(value); setFeedback(success) }
    } catch (cause) { if (cycle === revision.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { working.current = false; if (cycle === revision.current) setBusy(false) }
  }
  const keyword = query.trim().toLocaleLowerCase()
  const visibleItems = items.filter(item => !keyword || `${item.name} ${item.description} ${[...item.skills, ...(item.commands || []), ...(item.agents || [])].map(component => `${component.name} ${component.description}`).join(' ')} ${(item.mcpServers || []).map(server => `${server.name} ${server.key} ${server.type || ''} ${server.unavailableReason || ''}`).join(' ')} ${(item.hooks || []).map(hook => `${hook.name} ${hook.event} ${hook.matcher || ''} ${hook.command} ${hook.args.join(' ')} ${hook.sourcePath} ${hook.unavailableReason || ''}`).join(' ')} ${(item.hookDiagnostics || []).join(' ')}`.toLocaleLowerCase().includes(keyword))
  async function reviewHooks(id: string) {
    if (!host.navigate || working.current) return
    const cycle = revision.current
    try { await host.navigate(`/settings/hooks?plugin=${encodeURIComponent(id)}`) }
    catch (cause) { if (cycle === revision.current) setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <section className="mira-local-plugins" aria-label="本地插件" aria-busy={busy}>
    <div className="mira-market-section-title"><h2>已安装插件</h2><button className="mira-market-install" type="button" disabled={busy} onClick={() => { void change(() => host.importLocalPlugin(), '插件已添加；已开始运行的会话保留原插件目录。') }}>{busy ? <LoaderCircle size={14} className="mira-market-spin" /> : <FolderPlus size={14} />}添加本地插件</button></div>
    {error && <p className="mira-market-error" role="alert">{error}</p>}
    {feedback && <p className="mira-market-feedback" role="status">{feedback}</p>}
    {!busy && !items.length && <p className="mira-market-empty">添加已下载的插件目录，通过 @ 引用 Skill 或智能体，通过 / 选择命令，通过 MCP 选择此任务使用的插件服务。</p>}
    {!busy && items.length > 0 && !visibleItems.length && <p className="mira-market-empty">没有匹配的本地插件</p>}
    <ul className="mira-local-plugins-list">{visibleItems.map(item => <li key={item.id}>
      <Blocks size={18} aria-hidden="true" /><div className="mira-local-plugin-content"><div className="mira-local-plugin-title"><h3>{item.name}</h3>{item.version && <small>{item.version}</small>}<small>{item.id.endsWith('@local') ? '本地' : item.id.split('@')[1]}</small><span>{item.enabled ? '已启用' : '已停用'}</span></div>
        {item.description && <p>{item.description}</p>}{item.error && <p role="alert">{item.error}</p>}
        <details><summary>{item.skills.length} 个 Skill · {item.commands?.length || 0} 个命令 · {item.agents?.length || 0} 个 Agent · {item.mcpServers?.length || 0} 个 MCP{item.unsupported.length ? ` · ${item.unsupported.length} 类组件尚未支持` : ''}</summary><ul>{item.skills.map(skill => <li key={`skill-${skill.name}`}><code>{item.name}:{skill.name}</code><span>{skill.description}</span></li>)}{item.commands?.map(command => <li key={`command-${command.name}`}><code>/{item.name}:{command.name}{command.argumentHint ? ` ${command.argumentHint}` : ''}</code><span>{command.unavailableReason || command.description}</span></li>)}{item.agents?.map(agent => <li key={`agent-${agent.name}`}><code>@{agent.name}</code><span>{agent.unavailableReason || agent.description}</span></li>)}{item.mcpServers?.map(server => <li key={`mcp-${server.id}`}><code>{server.name}</code><span>{server.type === 'streamableHttp' ? 'Streamable HTTP' : server.type || '未知类型'} · {server.unavailableReason || (!item.enabled || !server.enabled ? '已停用' : '在 MCP 中选择，任务启动时连接')}</span></li>)}</ul>{item.unsupported.length > 0 && <p>尚未支持：{item.unsupported.map(kind => componentNames[kind] || kind).join('、')}</p>}</details>
        {(Boolean(item.hooks?.length) || Boolean(item.hookDiagnostics?.length)) && <details className="mira-local-plugin-hooks">
          <summary>{item.hooks?.length || 0} 个 Hook{item.hookDiagnostics?.length ? ` · ${item.hookDiagnostics.length} 项解析诊断` : ''}</summary>
          <ul>{item.hooks?.map(hook => <li key={hook.id}>
            <strong>{hook.event} · {hook.type === 'process' ? '直接启动进程' : 'Shell 命令'} · {hook.matcher || '匹配全部'}</strong>
            <code>{hook.command}{hook.args.length ? ` ${hook.args.map(arg => JSON.stringify(arg)).join(' ')}` : ''}</code>
            <span>来源：{hook.sourcePath} · {hook.timeout} 秒{hook.async ? ' · 异步执行' : ''}</span>
            <span>{hook.unavailableReason || (!item.enabled || !hook.enabled ? '插件或 Hook 已停用' : '在 Hooks 设置中审阅并授权后运行')}</span>
          </li>)}</ul>
          {item.hookDiagnostics?.map((diagnostic, index) => <p key={index} className="mira-market-error">{diagnostic}</p>)}
          {host.navigate && <button className="mira-market-install" type="button" disabled={busy} aria-label={`审阅 ${item.name} 的 Hooks`} onClick={() => { void reviewHooks(item.id) }}>审阅 Hooks</button>}
        </details>}
      </div><div className="mira-local-plugin-actions">{onTryPlugin && <button type="button" aria-label={`试用插件 ${item.name}`} disabled={busy || !item.enabled || Boolean(item.error) || Boolean(item.conflicts.length) || !item.skills.length} title="新建任务并填入插件引用" onClick={() => { void change(async () => { await onTryPlugin(item.id); return null }, '') }}>试用</button>}<button type="button" disabled={busy || Boolean(item.error && !item.enabled)} onClick={() => { void change(() => host.setPluginEnabled(item.id, !item.enabled), item.enabled ? '插件已停用，后续调用不可用。' : '插件已启用；新会话可使用。') }}>{item.enabled ? '停用' : '启用'}</button><button type="button" disabled={busy} title="仅移除 Mira 登记，保留原插件目录" onClick={() => { void change(() => host.removePlugin(item.id), '已移除插件登记，原目录及文件保留。') }}>移除</button></div>
    </li>)}</ul>
  </section>
}
