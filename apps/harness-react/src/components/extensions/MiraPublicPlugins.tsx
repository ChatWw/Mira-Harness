/* Plugin list/detail structure follows ZCode PluginStoreListView / PluginStoreDetailView.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira downloads its fixed open-source catalog through the first-party host. */
import { useEffect, useRef, useState } from 'react'
import { Blocks, Check, Download, LoaderCircle, Wrench } from 'lucide-react'
import type { MiraPluginMarketCatalog, MiraPluginMarketDetail, MiraPluginMarketItem } from '../../../../../src/config/miraPlugins'

export interface MiraPublicPluginHost {
  browsePluginMarket(refresh?: boolean): Promise<MiraPluginMarketCatalog>
  getPluginMarketDetail(id: string): Promise<MiraPluginMarketDetail>
  installMarketPlugin(id: string): Promise<MiraPluginMarketItem>
}

export function MiraPublicPlugins({ host, query = '', selectedId, refreshRevision = 0, inventoryRevision = 0, onOpen, onInstalled, onBusyChange, onEntriesReady }: {
  host: MiraPublicPluginHost; query?: string; selectedId?: string; refreshRevision?: number; inventoryRevision?: number
  onOpen: (item: MiraPluginMarketItem, trigger: HTMLButtonElement) => void; onInstalled: () => void; onBusyChange: (busy: boolean) => void
  onEntriesReady?: () => void
}) {
  const [catalog, setCatalog] = useState<MiraPluginMarketCatalog>()
  const [detail, setDetail] = useState<MiraPluginMarketDetail>()
  const [busy, setBusy] = useState(true)
  const [installing, setInstalling] = useState<string>()
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [retry, setRetry] = useState(0)
  const revision = useRef(0)
  const working = useRef(false)
  const lastRefresh = useRef(refreshRevision)
  useEffect(() => {
    const cycle = ++revision.current
    setBusy(true); setError(''); setDetail(undefined)
    const refresh = lastRefresh.current !== refreshRevision || retry > 0
    lastRefresh.current = refreshRevision
    const request = selectedId ? (refresh ? host.browsePluginMarket(true) : Promise.resolve()).then(() => host.getPluginMarketDetail(selectedId)).then(value => { if (cycle === revision.current) setDetail(value) }) : host.browsePluginMarket(refresh).then(value => { if (cycle === revision.current) setCatalog(value) })
    void request.catch(cause => { if (cycle === revision.current) setError(message(cause)) }).finally(() => { if (cycle === revision.current) setBusy(false) })
    return () => { revision.current++ }
  }, [host, selectedId, refreshRevision, retry, inventoryRevision])
  useEffect(() => { onBusyChange(busy || Boolean(installing)); return () => onBusyChange(false) }, [busy, installing, onBusyChange])
  useEffect(() => { if (!selectedId && !busy) onEntriesReady?.() }, [selectedId, busy, catalog, onEntriesReady])
  async function install(item: MiraPluginMarketItem) {
    if (working.current || item.installed || item.unavailableReason) return
    working.current = true
    const cycle = revision.current
    setInstalling(item.id); setError(''); setFeedback('')
    try {
      const result = await host.installMarketPlugin(item.id)
      // Installation belongs to the market, even when the user has navigated away from this list.
      onInstalled()
      if (cycle !== revision.current) return
      setCatalog(previous => previous && { ...previous, items: previous.items.map(value => value.id === result.id ? result : value) })
      setDetail(previous => previous?.id === result.id ? { ...previous, ...result } : previous)
      setFeedback(`已安装 ${result.name}，可在新对话中通过 @ 引用。`)
    } catch (cause) { if (cycle === revision.current) setError(message(cause)) }
    finally { working.current = false; setInstalling(undefined) }
  }
  function action(item: MiraPluginMarketItem) {
    if (item.installed) return <span className="mira-market-installed"><Check size={14} />{item.enabled ? '已启用' : '已安装'}</span>
    return <button type="button" className="mira-market-install" aria-label={`安装插件 ${item.name}`} disabled={busy || Boolean(installing) || Boolean(item.unavailableReason)} title={item.unavailableReason} onClick={() => void install(item)}>{installing === item.id ? <LoaderCircle size={14} className="mira-market-spin" /> : <Download size={14} />}{installing === item.id ? '安装中…' : item.unavailableReason ? '暂不可安装' : '安装插件'}</button>
  }
  const term = query.trim().toLocaleLowerCase()
  const items = catalog?.items.filter(item => !term || `${item.name} ${item.description} ${item.sourceName} ${item.skills.map(skill => `${skill.name} ${skill.description}`).join(' ')}`.toLocaleLowerCase().includes(term)) ?? []
  return <section className={selectedId ? 'mira-market-detail' : 'mira-public-plugins'} aria-label="公开插件包" aria-busy={busy}>
    {!selectedId && <div className="mira-market-section-title"><h2>{catalog?.sourceName ?? '公开插件包'}</h2>{catalog && <span>{items.length}</span>}</div>}
    {error && <div className="mira-market-error" role="alert"><span>公开插件包：{error}</span><button type="button" disabled={busy || Boolean(installing)} onClick={() => setRetry(value => value + 1)}>重试</button></div>}
    {feedback && <p className="mira-market-feedback" role="status">{feedback}</p>}
    {busy ? <p className="mira-market-loading" role="status"><LoaderCircle size={16} className="mira-market-spin" />{selectedId ? '正在读取插件详情…' : '正在读取公开插件…'}</p> : selectedId ? detail && <>
      <div className="mira-market-detail-heading"><span className="mira-market-avatar"><Blocks size={24} /></span><div className="mira-market-detail-title"><h2>{detail.name}</h2>{action(detail)}</div><p>{detail.description}</p><span className="mira-market-source">{detail.sourceName}</span>{detail.unavailableReason && <p>{detail.unavailableReason}</p>}</div>
      <section className="mira-market-detail-section"><h3>包含的能力 <span>{detail.skills.length} 个 Skill</span></h3><ul className="mira-plugin-components">{detail.skills.map(skill => <li key={skill.name}><Wrench size={16} /><div><strong>{skill.name}</strong><p>{skill.description}</p></div></li>)}</ul>{detail.unsupported.length > 0 && <p>包内还包含 {detail.unsupported.join('、')}，这些组件尚未接入执行。</p>}</section>
      <section className="mira-market-detail-section"><h3>文件 <span>{detail.files.length} · {formatBytes(detail.totalBytes)}</span></h3><ul>{detail.files.map(file => <li key={file.path}><code>{file.path}</code><span>{formatBytes(file.size)}</span></li>)}</ul></section>
      <section className="mira-market-detail-section"><h3>来源与许可</h3><dl><dt>仓库</dt><dd>{detail.repositoryUrl}</dd><dt>版本</dt><dd><code>{detail.commit}</code></dd><dt>来源</dt><dd>{detail.marketplace}</dd></dl>{detail.licenses.map(license => <details key={license.path}><summary>{license.path}</summary><pre>{license.text}</pre></details>)}</section>
    </> : <>{items.length ? <div className="mira-market-grid">{items.map(item => <article className="mira-market-item" key={item.id} data-market-plugin-id={item.id}><button className="mira-market-item-main" data-market-entry={`plugin-card:${item.id}`} aria-label={`查看插件 ${item.name}`} type="button" onClick={event => onOpen(item, event.currentTarget)}><span className="mira-market-avatar"><Blocks size={20} /></span><span><h3>{item.name}</h3><p>{item.description}</p></span></button><div className="mira-market-item-footer"><span>{item.skills.length} 个 Skill</span>{action(item)}</div>{item.unavailableReason && <p className="mira-plugin-unavailable">{item.unavailableReason}</p>}</article>)}</div> : !error && <p className="mira-market-empty">{term ? '没有匹配的公开插件包' : '暂无公开插件包'}</p>}</>}
  </section>
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : '插件市场操作失败，请重试' }
function formatBytes(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B` }
