import { MarketIconHint } from './MarketIconHint'
import { MiraPluginDetail } from './MiraPluginDetail'
/* Plugin list/detail structure follows ZCode PluginStoreListView / PluginStoreDetailView.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira downloads its fixed open-source catalog through the first-party host. */
import { useEffect, useRef, useState } from 'react'
import { Check, Download, LoaderCircle, MessageSquare } from 'lucide-react'
import type { MiraPluginMarketCatalog, MiraPluginMarketDetail, MiraPluginMarketItem } from '../../../../../src/config/miraPlugins'
import type { MiraPluginHost } from './MiraInstalledPlugins'
import { MiraPluginAvatar, pluginLabel } from './MiraPluginAvatar'
import { MiraPluginMenu } from './MiraPluginMenu'

type PluginOperation = { kind: 'install' | 'enable' | 'disable' | 'remove' | 'try'; item: MiraPluginMarketItem; prompt?: string }
const operationNames = { install: '安装', enable: '启用', disable: '停用', remove: '移除登记', try: '试用' }

export interface MiraPublicPluginHost extends Partial<Pick<MiraPluginHost, 'setPluginEnabled' | 'removePlugin' | 'getComputerUseStatus' | 'setComputerUseCursor' | 'openComputerUsePermission'>> {
  browsePluginMarket(refresh?: boolean): Promise<MiraPluginMarketCatalog>
  getPluginMarketDetail(id: string): Promise<MiraPluginMarketDetail>
  installMarketPlugin(id: string): Promise<MiraPluginMarketItem>
}

export function MiraPublicPlugins({ host, query = '', selectedId, refreshRevision = 0, inventoryRevision = 0, onOpen, onInstalled, onBusyChange, onEntriesReady, onTryPlugin }: {
  host: MiraPublicPluginHost; query?: string; selectedId?: string; refreshRevision?: number; inventoryRevision?: number
  onOpen: (item: MiraPluginMarketItem, trigger: HTMLButtonElement) => void; onInstalled: () => void; onBusyChange: (busy: boolean) => void
  onEntriesReady?: () => void
  onTryPlugin?: (id: string, prompt?: string) => Promise<void>
}) {
  const [catalog, setCatalog] = useState<MiraPluginMarketCatalog>()
  const [detail, setDetail] = useState<MiraPluginMarketDetail>()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(true)
  const [installing, setInstalling] = useState<string>()
  const [error, setError] = useState('')
  const [operationError, setOperationError] = useState<{ operation: PluginOperation; message: string }>()
  const [feedback, setFeedback] = useState('')
  const [retry, setRetry] = useState(0)
  const revision = useRef(0)
  const working = useRef(false)
  const lastRefresh = useRef(refreshRevision)
  const lastRetry = useRef(retry)
  useEffect(() => {
    const cycle = ++revision.current
    setBusy(true); setError(''); setDetail(undefined); setOperationError(undefined)
    const refresh = lastRefresh.current !== refreshRevision || lastRetry.current !== retry
    lastRefresh.current = refreshRevision
    lastRetry.current = retry
    const request = selectedId ? (refresh ? host.browsePluginMarket(true) : Promise.resolve()).then(() => host.getPluginMarketDetail(selectedId)).then(value => { if (cycle === revision.current) setDetail(value) }) : host.browsePluginMarket(refresh).then(value => { if (cycle === revision.current) setCatalog(value) })
    void request.catch(cause => { if (cycle === revision.current) setError(message(cause)) }).finally(() => { if (cycle === revision.current) setBusy(false) })
    return () => { revision.current++ }
  }, [host, selectedId, refreshRevision, retry, inventoryRevision])
  useEffect(() => { onBusyChange(busy || Boolean(installing)); return () => onBusyChange(false) }, [busy, installing, onBusyChange])
  useEffect(() => { if (!selectedId && !busy) onEntriesReady?.() }, [selectedId, busy, catalog, onEntriesReady])
  async function perform(operation: PluginOperation) {
    const { item, kind } = operation
    if (working.current || busy || kind === 'install' && (item.installed || item.unavailableReason)) return
    working.current = true
    const cycle = revision.current
    setInstalling(item.id); setOperationError(undefined); setFeedback('')
    try {
      if (kind === 'try') { await onTryPlugin?.(item.id, operation.prompt); return }
      let result: MiraPluginMarketItem
      if (kind === 'install') result = await host.installMarketPlugin(item.id)
      else {
        const inventory = kind === 'remove' ? await host.removePlugin!(item.id) : await host.setPluginEnabled!(item.id, kind === 'enable')
        const current = inventory.find(value => value.id === item.id)
        result = { ...item, installed: Boolean(current), enabled: Boolean(current?.enabled && !current.error) }
      }
      // Inventory changes belong to the market even after navigating away from this list.
      onInstalled()
      if (cycle !== revision.current) return
      setCatalog(previous => previous && { ...previous, items: previous.items.map(value => value.id === result.id ? result : value) })
      setDetail(previous => previous?.id === result.id ? { ...previous, ...result } : previous)
      setFeedback(kind === 'remove' ? `已移除 ${item.name} 的登记，已下载文件保留。` : kind === 'disable' ? `已停用 ${item.name}，后续调用不可用。` : `已${operationNames[kind]} ${result.name}，可在对话中通过 @ 引用。`)
    } catch (cause) { if (cycle === revision.current) setOperationError({ operation, message: message(cause) }) }
    finally { working.current = false; setInstalling(undefined) }
  }
  function action(item: MiraPluginMarketItem, compact = false) {
    if (item.installed) return <div className="mira-plugin-actions"><span className={compact ? 'mira-market-visually-hidden' : 'mira-market-installed'}><Check size={14} />{item.enabled ? '已启用' : '已停用'}</span><MiraPluginMenu name={item.name} enabled={item.enabled} disabled={busy || Boolean(installing)} onToggle={host.setPluginEnabled ? () => void perform({ kind: item.enabled ? 'disable' : 'enable', item }) : undefined} onRemove={host.removePlugin ? () => void perform({ kind: 'remove', item }) : undefined} />{!compact && onTryPlugin && <MarketIconHint label={item.enabled ? '新建任务并填入插件引用' : '请先启用插件'}><button type="button" className="mira-market-install" aria-label={`试用插件 ${item.name}`} disabled={busy || Boolean(installing) || !item.enabled || !item.skills.length} onClick={() => void perform({ kind: 'try', item })}><MessageSquare size={14} />立即试用</button></MarketIconHint>}</div>
    return <MarketIconHint label={item.unavailableReason}><button type="button" className="mira-market-install" aria-label={`安装插件 ${item.name}`} disabled={busy || Boolean(installing) || Boolean(item.unavailableReason)} onClick={() => void perform({ kind: 'install', item })}>{installing === item.id ? <LoaderCircle size={14} className="mira-market-spin" /> : <Download size={14} />}{installing === item.id ? '安装中…' : item.unavailableReason ? '暂不可安装' : '安装'}</button></MarketIconHint>
  }
  const term = query.trim().toLocaleLowerCase()
  const items = catalog?.items.filter(item => !term || `${pluginLabel(item)} ${item.name} ${item.description} ${item.sourceName} ${item.skills.map(skill => `${skill.name} ${skill.description}`).join(' ')}`.toLocaleLowerCase().includes(term)) ?? []
  return <section className={selectedId ? 'mira-market-detail' : 'mira-public-plugins'} aria-label="公开插件包" aria-busy={busy}>

    {error && <div className="mira-market-error" role="alert"><span>公开插件包：{error}</span><button type="button" disabled={busy || Boolean(installing)} onClick={() => setRetry(value => value + 1)}>重试</button></div>}
    {operationError && <div className="mira-market-error" role="alert"><span>{operationNames[operationError.operation.kind]} {operationError.operation.item.name} 失败：{operationError.message}</span><button type="button" aria-label={`重试${operationNames[operationError.operation.kind]} ${operationError.operation.item.name}`} disabled={busy || Boolean(installing)} onClick={() => void perform(operationError.operation)}>重试</button></div>}
    {catalog?.errors?.map((error, index) => <p className="mira-market-error" role="status" key={index}>{error}</p>)}
    {feedback && <p className="mira-market-feedback" role="status">{feedback}</p>}
    {busy ? <p className="mira-market-loading" role="status"><LoaderCircle size={16} className="mira-market-spin" />{selectedId ? '正在读取插件详情…' : '正在读取公开插件…'}</p> : selectedId ? detail && <>
      <MiraPluginDetail item={detail} computerSettings={host} actions={action(detail)} disabled={busy || Boolean(installing) || Boolean(detail.unavailableReason)} onPrompt={onTryPlugin ? prompt => void perform({ kind: 'try', item: detail, prompt }) : undefined} advanced={<>
        <dl><dt>仓库</dt><dd>{detail.repositoryUrl || detail.sourceName}</dd><dt>来源</dt><dd>{detail.marketplace}</dd></dl>
        {detail.files.length > 0 && <ul>{detail.files.map(file => <li key={file.path}><code>{file.path}</code> · {formatBytes(file.size)}</li>)}</ul>}
        {detail.licenses.map(license => <details key={license.path}><summary>{license.path}</summary><pre>{license.text}</pre></details>)}
      </>} />
    </> : <>{items.length ? [...new Set(items.map(item => term ? '搜索结果' : item.listing?.category || item.sourceName || '其他'))].map(category => {
      const group = items.filter(item => term || (item.listing?.category || item.sourceName || '其他') === category)
      const visible = collapsed[category] ? group.slice(0, 6) : group
      return <section className="mira-market-category" key={category}><div className="mira-market-section-title"><h2>{category}</h2></div><div className="mira-market-grid">{visible.map(item => <article className="mira-market-item" key={item.id} data-market-plugin-id={item.id}><button className="mira-market-item-main" data-market-entry={`plugin-card:${item.id}`} aria-label={`查看插件 ${item.name}`} type="button" onClick={event => onOpen(item, event.currentTarget)}><MiraPluginAvatar item={item} /><span><h3>{pluginLabel(item)}</h3><p>{item.description}</p></span></button><div className="mira-market-item-footer">{action(item, true)}</div></article>)}</div>{group.length > 6 && <button type="button" className="mira-market-group-toggle" onClick={() => setCollapsed(value => ({ ...value, [category]: !value[category] }))}>{collapsed[category] ? '展开更多' : '收起'}</button>}</section>
    }) : !error && <p className="mira-market-empty">{term ? '没有匹配的公共插件' : '暂无公共插件'}</p>}</>}
  </section>
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : '插件市场操作失败，请重试' }
function formatBytes(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B` }
