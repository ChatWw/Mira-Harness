import { MarketIconHint } from './MarketIconHint'
/* Layout follows ZCode PluginStoreDetailView. Copyright 2026 Z.AI Co., Ltd.
 * Apache-2.0; Mira data and actions adaptation. */
import type { ReactNode } from 'react'
import { Anchor, Bot, Server, Terminal, WandSparkles } from 'lucide-react'
import type { MiraPluginItem, MiraPluginMarketItem } from '../../../../../src/config/miraPlugins'
import { MiraPluginAvatar, pluginLabel } from './MiraPluginAvatar'

export function MiraPluginDetail({ item, actions, advanced, onPrompt, disabled }: {
  item: MiraPluginItem | MiraPluginMarketItem; actions: ReactNode; advanced?: ReactNode
  onPrompt?: (prompt: string) => void; disabled?: boolean
}) {
  const local = 'conflicts' in item ? item : undefined
  const groups = [
    { title: 'MCP 服务器', Icon: Server, items: local?.mcpServers?.map(server => ({ name: server.name, description: server.unavailableReason || '在 MCP 中选择，任务启动时连接' })) || [] },
    { title: '技能', Icon: WandSparkles, items: item.skills },
    { title: '命令', Icon: Terminal, items: local?.commands || [] },
    { title: '子智能体', Icon: Bot, items: local?.agents || [] },
    { title: 'Hooks', Icon: Anchor, items: local?.hooks?.map(hook => ({ name: hook.event, description: hook.unavailableReason || hook.matcher || '匹配全部' })) || [] },
  ]
  return <div className="mira-plugin-detail-view">
    <div className="mira-plugin-detail-hero"><MiraPluginAvatar item={item} />
      <div className="mira-plugin-detail-title"><h1>{pluginLabel(item)}</h1><div className="mira-plugin-detail-actions">{actions}</div></div>
      {item.description && <p>{item.description}</p>}
      {item.unavailableReason && <p role="status">{item.unavailableReason}</p>}
      {local?.error && <p role="alert">{local.error}</p>}
    </div>
    {groups.filter(group => group.items.length > 0).map(({ title, Icon, items }) => <section className="mira-plugin-detail-group" key={title}>
      <h2>{title}<span>{items.length}</span></h2><ul>{items.map(component => <li key={component.name}>
        <span className="mira-plugin-component-icon"><Icon size={16} /></span><div><strong>{component.name}</strong><MarketIconHint label={component.description}><p>{component.description}</p></MarketIconHint></div>
      </li>)}</ul>
    </section>)}
    <section className="mira-plugin-detail-info"><h2>信息</h2><dl>
      <dt>开发者</dt><dd>{item.listing?.author || '未提供'}</dd>
      <dt>类别</dt><dd>{item.listing?.category || '未分类'}</dd>
      <dt>版本</dt><dd>{item.version || '未提供'}</dd>
    </dl></section>
    <details className="mira-plugin-detail-advanced"><summary>高级信息</summary>
      <dl><dt>插件标识</dt><dd>{item.id}</dd><dt>状态</dt><dd>{item.enabled ? '已启用' : '已停用'}</dd></dl>
      {item.unsupported.length > 0 && <p>尚未支持：{item.unsupported.join('、')}</p>}
      {onPrompt && Boolean(item.listing?.examplePrompts?.length) && <section className="mira-market-examples"><h3>试试这样问</h3>{item.listing!.examplePrompts!.map(prompt => <button key={prompt} type="button" disabled={disabled} onClick={() => onPrompt(prompt)}>{prompt}</button>)}</section>}
      {advanced}
    </details>
  </div>
}
