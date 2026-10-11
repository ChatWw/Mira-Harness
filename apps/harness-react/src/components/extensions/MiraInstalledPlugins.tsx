import { useEffect, useRef, useState } from 'react'
import { Blocks, FolderPlus, LoaderCircle } from 'lucide-react'
import type { MiraPluginItem } from '../../../../../src/config/miraPlugins'

export interface MiraPluginHost {
  listPlugins(): Promise<MiraPluginItem[]>
  importLocalPlugin(): Promise<MiraPluginItem[] | null>
  setPluginEnabled(id: string, enabled: boolean): Promise<MiraPluginItem[]>
  removePlugin(id: string): Promise<MiraPluginItem[]>
}
const componentNames: Record<string, string> = { agents: 'Agent', commands: '命令', hooks: 'Hook', mcpServers: 'MCP', lspServers: 'LSP', dependencies: '依赖', settings: '设置', outputStyles: '输出样式', channels: '频道', userConfig: '自定义配置' }

export function MiraInstalledPlugins({ host, query = '', refreshRevision = 0, onBusyChange, onItemsChange }: { host: MiraPluginHost; query?: string; refreshRevision?: number; onBusyChange?: (busy: boolean) => void; onItemsChange?: (items: MiraPluginItem[]) => void }) {
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
  const visibleItems = items.filter(item => !keyword || `${item.name} ${item.description} ${[...item.skills, ...(item.commands || [])].map(component => `${component.name} ${component.description}`).join(' ')}`.toLocaleLowerCase().includes(keyword))
  return <section className="mira-local-plugins" aria-label="本地插件" aria-busy={busy}>
    <div className="mira-market-section-title"><h2>已安装插件</h2><button className="mira-market-install" type="button" disabled={busy} onClick={() => { void change(() => host.importLocalPlugin(), '插件已添加；已开始运行的会话保留原插件目录。') }}>{busy ? <LoaderCircle size={14} className="mira-market-spin" /> : <FolderPlus size={14} />}添加本地插件</button></div>
    {error && <p className="mira-market-error" role="alert">{error}</p>}
    {feedback && <p className="mira-market-feedback" role="status">{feedback}</p>}
    {!busy && !items.length && <p className="mira-market-empty">添加已下载的插件目录，通过 @ 引用 Skill，通过 / 选择命令并补充参数。</p>}
    {!busy && items.length > 0 && !visibleItems.length && <p className="mira-market-empty">没有匹配的本地插件</p>}
    <ul className="mira-local-plugins-list">{visibleItems.map(item => <li key={item.id}>
      <Blocks size={18} aria-hidden="true" /><div className="mira-local-plugin-content"><div className="mira-local-plugin-title"><h3>{item.name}</h3>{item.version && <small>{item.version}</small>}<small>{item.id.endsWith('@local') ? '本地' : item.id.split('@')[1]}</small><span>{item.enabled ? '已启用' : '已停用'}</span></div>
        {item.description && <p>{item.description}</p>}{item.error && <p role="alert">{item.error}</p>}
        <details><summary>{item.skills.length} 个 Skill · {item.commands?.length || 0} 个命令{item.unsupported.length ? ` · ${item.unsupported.length} 类组件尚未支持` : ''}</summary><ul>{item.skills.map(skill => <li key={`skill-${skill.name}`}><code>{item.name}:{skill.name}</code><span>{skill.description}</span></li>)}{item.commands?.map(command => <li key={`command-${command.name}`}><code>/{item.name}:{command.name}{command.argumentHint ? ` ${command.argumentHint}` : ''}</code><span>{command.unavailableReason || command.description}</span></li>)}</ul>{item.unsupported.length > 0 && <p>尚未支持：{item.unsupported.map(kind => componentNames[kind] || kind).join('、')}</p>}</details>
      </div><div className="mira-local-plugin-actions"><button type="button" disabled={busy || Boolean(item.error && !item.enabled)} onClick={() => { void change(() => host.setPluginEnabled(item.id, !item.enabled), item.enabled ? '插件已停用，后续调用不可用。' : '插件已启用；新会话可使用。') }}>{item.enabled ? '停用' : '启用'}</button><button type="button" disabled={busy} title="仅移除 Mira 登记，保留原插件目录" onClick={() => { void change(() => host.removePlugin(item.id), '已移除插件登记，原目录及文件保留。') }}>移除</button></div>
    </li>)}</ul>
  </section>
}
