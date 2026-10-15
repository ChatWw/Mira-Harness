/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation: fixed public Skill catalog, existing SkillStore installation and standalone workbench view.
 * Structural reference: ZCode PluginStoreListView / PluginStoreDetailView; license: third-party-licenses/zcode/.
 */
import { useEffect, useRef, useState } from 'react'
import { MarketIconHint } from './MarketIconHint'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MiraPluginAvatar, pluginLabel } from './MiraPluginAvatar'
import { MiraMarketplaceSources, type MiraMarketplaceSourceHost } from './MiraMarketplaceSources'
import * as MarketTabs from '@radix-ui/react-tabs'
import { Blocks, Check, ChevronRight, Download, LoaderCircle, RefreshCw, Search, Settings, Settings2, X, ChevronDown, Plus, FolderPlus } from 'lucide-react'
import type { HarnessSkillMarketCatalog, HarnessSkillMarketDetail, HarnessSkillMarketItem } from '../../../../../src/config/harness'
import './skill-market.css'
import { MiraInstalledPlugins, type MiraPluginHost } from './MiraInstalledPlugins'
import { MiraPublicPlugins, type MiraPublicPluginHost } from './MiraPublicPlugins'
import type { MiraPluginItem, MiraPluginMarketItem } from '../../../../../src/config/miraPlugins'

export interface SkillMarketHost extends Partial<MiraPluginHost>, Partial<MiraPublicPluginHost>, Partial<MiraMarketplaceSourceHost> {
  readonly supportsPluginMarket?: boolean
  browseSkillMarket(refresh?: boolean): Promise<HarnessSkillMarketCatalog>
  getSkillMarketDetail(id: string): Promise<HarnessSkillMarketDetail>
  installMarketSkill(id: string): Promise<HarnessSkillMarketItem>
  listInstalledMarketSkills(): Promise<HarnessSkillMarketItem[]>
}

export function SkillMarketView({ host, onManageSkills, onTryPlugin }: { host: SkillMarketHost; onManageSkills: () => void; onTryPlugin?: (id: string, prompt?: string) => Promise<void> }) {
  const [sourcesOpen, setSourcesOpen] = useState<'add' | 'manage'>()
  const [selectedLocal, setSelectedLocal] = useState<string>()
  const [catalog, setCatalog] = useState<HarnessSkillMarketCatalog>()
  const [installed, setInstalled] = useState<HarnessSkillMarketItem[]>([])
  const [installedPlugins, setInstalledPlugins] = useState<MiraPluginItem[]>([])
  const [selectedPlugin, setSelectedPlugin] = useState<{ id: string; name: string }>()
  const [publicPluginsBusy, setPublicPluginsBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [installedError, setInstalledError] = useState('')
  const [pluginRefresh, setPluginRefresh] = useState(0)
  const [pluginsBusy, setPluginsBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [segment, setSegment] = useState<'public' | 'installed'>('public')
  const [selectedId, setSelectedId] = useState<string>()
  const [detail, setDetail] = useState<HarnessSkillMarketDetail>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [installingId, setInstallingId] = useState<string>()
  const [installFeedback, setInstallFeedback] = useState('')
  const [detailRevision, setDetailRevision] = useState(0)
  const cycle = useRef(0)
  const installedCycle = useRef(0)
  const installation = useRef<string | undefined>(undefined)
  const inventoryRevision = useRef(0)
  const mounted = useRef(false)
  const scroll = useRef<HTMLDivElement>(null)
  const savedScroll = useRef(0)
  const detailOrigin = useRef<string | undefined>(undefined)
  const detailBackButton = useRef<HTMLButtonElement>(null)
  const pendingReturnFocus = useRef<string | undefined>(undefined)

  async function load(refresh = false) {
    const revision = ++cycle.current
    const inventory = ++inventoryRevision.current
    setLoading(true); setInstalledError('')
    const readPublic = (!host.supportsPluginMarket || !host.browsePluginMarket) && (!refresh || segment === 'public' || Boolean(selectedId || selectedPlugin))
    if (readPublic) setError('')
    const installedRequest = host.listInstalledMarketSkills().then(items => {
      if (mounted.current && revision === cycle.current && inventory === inventoryRevision.current) setInstalled(items)
    }, cause => { if (mounted.current && revision === cycle.current && inventory === inventoryRevision.current) setInstalledError(message(cause)) })
    try {
      const [next] = await Promise.all([readPublic ? host.browseSkillMarket(refresh) : undefined, installedRequest])
      if (next && mounted.current && revision === cycle.current) setCatalog(next)
    } catch (cause) { if (mounted.current && revision === cycle.current) setError(message(cause)) }
    finally { if (mounted.current && revision === cycle.current) setLoading(false) }
  }
  useEffect(() => {
    mounted.current = true
    void load()
    return () => { mounted.current = false; cycle.current++; installedCycle.current++ }
  }, [host])
  useEffect(() => {
    if (!selectedId) { setDetail(undefined); setDetailError(''); setDetailLoading(false); return }
    let active = true
    setDetail(undefined); setDetailLoading(true); setDetailError('')
    void host.getSkillMarketDetail(selectedId).then(value => { if (active) setDetail(value) }, cause => { if (active) setDetailError(message(cause)) })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [host, selectedId, detailRevision])

  useEffect(() => {
    if (selectedId || selectedPlugin || selectedLocal) detailBackButton.current?.focus({ preventScroll: true })
  }, [selectedId, selectedPlugin?.id, selectedLocal])

  function openDetail(id: string, trigger: HTMLButtonElement) {
    pendingReturnFocus.current = undefined
    detailOrigin.current = trigger.dataset.marketEntry
    savedScroll.current = scroll.current?.scrollTop ?? 0
    setSelectedId(id); setInstallFeedback('')
    if (scroll.current) scroll.current.scrollTop = 0
  }
  function back() {
    setSelectedId(undefined); setSelectedPlugin(undefined); setSelectedLocal(undefined); setInstallFeedback('')
    pendingReturnFocus.current = detailOrigin.current
    requestAnimationFrame(() => {
      if (!mounted.current || detailBackButton.current || !scroll.current) return
      restoreListFocus(!publicPlugins || segment === 'installed')
    })
  }
  function restoreListFocus(entriesReady = false) {
    const origin = pendingReturnFocus.current
    if (!entriesReady || !origin || !mounted.current || detailBackButton.current || !scroll.current) return
    if (document.activeElement !== document.body) { pendingReturnFocus.current = undefined; return }
    const trigger = [...scroll.current.querySelectorAll<HTMLButtonElement>('[data-market-entry]')].find(button => button.dataset.marketEntry === origin)
      ?? (entriesReady ? scroll.current.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]') : undefined)
    if (trigger) { pendingReturnFocus.current = undefined; scroll.current.scrollTop = savedScroll.current; trigger.focus({ preventScroll: true }) }
  }
  function openPlugin(item: Pick<MiraPluginMarketItem, 'id' | 'name'>, trigger: HTMLButtonElement) {
    pendingReturnFocus.current = undefined
    detailOrigin.current = trigger.dataset.marketEntry
    savedScroll.current = scroll.current?.scrollTop ?? 0
    setSelectedId(undefined); setSelectedPlugin({ id: item.id, name: item.name }); setInstallFeedback('')
    if (scroll.current) scroll.current.scrollTop = 0
  }
  async function install(item: HarnessSkillMarketItem) {
    if (installation.current) return
    const revision = ++installedCycle.current
    inventoryRevision.current++
    installation.current = item.id
    setInstallingId(item.id); setInstallFeedback('')
    try {
      const result = await host.installMarketSkill(item.id)
      if (!mounted.current || revision !== installedCycle.current) return
      setInstalled(previous => [...previous.filter(existing => existing.id !== result.id), result])
      setCatalog(previous => previous && { ...previous, items: previous.items.map(existing => existing.id === result.id ? { ...existing, ...result } : existing) })
      setDetail(previous => previous?.id === result.id ? { ...previous, ...result } : previous)
      setInstallFeedback(`已安装 ${result.name}`)
    } catch (cause) { if (mounted.current && revision === installedCycle.current) setInstallFeedback(message(cause)) }
    finally { if (revision === installedCycle.current) { installation.current = undefined; if (mounted.current) setInstallingId(undefined) } }
  }
  const installedById = new Map(installed.map(item => [item.id, item]))
  const sourceItems = segment === 'installed' ? installed : catalog?.items ?? []
  const keyword = query.trim().toLocaleLowerCase()
  const items = sourceItems.filter(item => !keyword || `${item.name} ${item.description} ${item.sourceName}`.toLocaleLowerCase().includes(keyword))
    .map(item => installedById.has(item.id) ? { ...item, ...installedById.get(item.id)! } : item)
  const selected = detail && (installedById.has(detail.id) ? { ...detail, ...installedById.get(detail.id)! } : detail)

  function installButton(item: HarnessSkillMarketItem) {
    const busy = installingId === item.id
    return item.installed
      ? <span className="mira-market-installed"><Check size={14} aria-hidden="true" />{item.enabled ? '已启用' : '已安装'}</span>
      : <button className="mira-market-install" type="button" disabled={Boolean(installingId)} onClick={() => { void install(item) }}>{busy ? <LoaderCircle size={14} className="mira-market-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}{busy ? '安装中…' : '安装'}</button>
  }
  const publicPlugins = host.supportsPluginMarket !== false && host.browsePluginMarket && host.getPluginMarketDetail && host.installMarketPlugin ? <MiraPublicPlugins host={host as MiraPublicPluginHost} query={query} selectedId={selectedPlugin?.id} refreshRevision={detailRevision} inventoryRevision={pluginRefresh} onOpen={openPlugin} onInstalled={() => setPluginRefresh(value => value + 1)} onBusyChange={setPublicPluginsBusy} onEntriesReady={() => restoreListFocus(true)} onTryPlugin={onTryPlugin} /> : null

  return <section className="mira-market" data-detail={Boolean(selectedId || selectedPlugin || selectedLocal)} aria-label="插件市场">
    <div className="mira-market-scroll" ref={scroll}>
    {selectedId || selectedPlugin || selectedLocal ? <nav className="mira-plugin-detail-breadcrumb" aria-label="插件导航"><button ref={detailBackButton} type="button" aria-label="返回插件市场" onClick={back}>插件市场</button><ChevronRight size={14} aria-hidden="true" /><span>{selectedLocal ? pluginLabel(installedPlugins.find(item => item.id === selectedLocal) || { name: selectedLocal }) : selectedPlugin?.name ?? selected?.name ?? 'Skill 详情'}</span></nav> : <>
    <header className="mira-market-header">
      <div className="mira-market-heading"><h1>插件市场</h1><p>用插件为 Mira 扩展技能、命令与 MCP 能力</p></div>
      <div className="mira-market-header-actions"><MarketIconHint label={segment === 'installed' && !selectedId && !selectedPlugin ? '刷新已安装插件与技能' : '刷新市场'}><button className="mira-market-icon" type="button" aria-label="刷新市场" disabled={loading || Boolean(installingId) || pluginsBusy || publicPluginsBusy} onClick={() => { void load(true); if (selectedId || selectedPlugin || segment === 'public') setDetailRevision(value => value + 1); setPluginRefresh(value => value + 1) }}><RefreshCw size={16} className={loading ? 'mira-market-spin' : undefined} /></button></MarketIconHint><MarketIconHint label="市场源"><button className="mira-market-icon" type="button" aria-label="市场来源设置" onClick={() => setSourcesOpen('manage')}><Settings size={14} /></button></MarketIconHint><DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="mira-market-add">添加<ChevronDown size={14} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={typeof document === 'undefined' ? undefined : document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="end" sideOffset={6}><DropdownMenu.Item className="mira-session-menu__item" disabled={!onTryPlugin || !installedPlugins.some(item => item.id === "plugin-creator@mira-builtin" && item.enabled && !item.error)} onSelect={() => { void onTryPlugin?.("plugin-creator@mira-builtin").catch(cause => setInstallFeedback(message(cause))) }}><Plus size={14} />创建插件</DropdownMenu.Item><DropdownMenu.Item className="mira-session-menu__item" onSelect={() => setSourcesOpen('add')}><Plus size={14} />添加插件市场</DropdownMenu.Item><DropdownMenu.Item className="mira-session-menu__item" disabled={!host.importLocalPlugin} onSelect={() => { void host.importLocalPlugin?.().then(value => { if (value) { setInstalledPlugins(value); setPluginRefresh(revision => revision + 1) } }).catch(cause => setInstallFeedback(message(cause))) }}><FolderPlus size={14} />添加本地插件</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div>
    </header></>}

      {installFeedback && <p className="mira-market-feedback" role="status">{installFeedback}</p>}
      {selectedLocal && host.listPlugins && host.importLocalPlugin && host.setPluginEnabled && host.removePlugin ? <MiraInstalledPlugins host={host as MiraPluginHost} selectedId={selectedLocal} refreshRevision={pluginRefresh} onItemsChange={setInstalledPlugins} onTryPlugin={onTryPlugin} /> : selectedPlugin ? publicPlugins : selectedId ? <div className="mira-market-detail">
        {detailLoading ? <Loading text="正在读取 Skill 详情…" /> : detailError ? <div className="mira-market-error" role="alert"><span>{detailError}</span><button type="button" onClick={() => setDetailRevision(value => value + 1)}>重试</button></div> : selected && <>
          <div className="mira-market-detail-heading"><div className="mira-market-avatar"><Blocks size={24} aria-hidden="true" /></div><div className="mira-market-detail-title"><h2>{selected.name}</h2>{installButton(selected)}</div><p>{selected.description}</p><span className="mira-market-source">{selected.sourceName} · {selected.license}</span></div>
          <section className="mira-market-detail-section"><h3>Skill 指令</h3><pre>{selected.instructions}</pre></section>
          <section className="mira-market-detail-section"><h3>文件 <span>{selected.files.length} · {formatBytes(selected.totalBytes)}</span></h3><ul>{selected.files.map(file => <li key={file.path}><code>{file.path}</code><span>{formatBytes(file.size)}</span></li>)}</ul></section>
          <section className="mira-market-detail-section"><h3>来源</h3><dl><dt>仓库</dt><dd>{selected.repositoryUrl}</dd><dt>版本</dt><dd><code>{selected.commit}</code></dd><dt>许可</dt><dd>{selected.license}</dd></dl><details><summary>查看许可</summary><pre>{selected.licenseText}</pre></details></section>
        </>}
      </div> : <MarketTabs.Root className="mira-market-list" value={segment} onValueChange={value => setSegment(value === 'installed' ? 'installed' : 'public')}>
        <div className="mira-market-search"><Search size={17} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索插件" aria-label="搜索插件" />{query && <MarketIconHint label="清除搜索"><button className="mira-market-icon" type="button" aria-label="清除搜索" onClick={() => setQuery('')}><X size={14} /></button></MarketIconHint>}</div>
        {(installed.length > 0 || installedPlugins.length > 0) && <section className="mira-market-installed-strip"><div><h2>已安装</h2><MarketIconHint label="管理已安装插件"><button className="mira-market-icon" type="button" aria-label="管理已安装插件" onClick={() => setSegment('installed')}><Settings2 size={16} /></button></MarketIconHint></div><nav aria-label="已安装插件">{installedPlugins.map(item => <MarketIconHint key={item.id} label={pluginLabel(item)}><button type="button" key={item.id} data-market-entry={`plugin-strip:${item.id}`} onClick={event => item.id.endsWith('@anthropic-agent-skills') ? openPlugin(item, event.currentTarget) : (detailOrigin.current = event.currentTarget.dataset.marketEntry, savedScroll.current = scroll.current?.scrollTop ?? 0, setSelectedLocal(item.id))} aria-label={pluginLabel(item)}><MiraPluginAvatar item={item} /><span className="mira-market-strip-label">{pluginLabel(item)}</span></button></MarketIconHint>)}{installed.map(item => <MarketIconHint key={item.id} label={item.name}><button type="button" key={item.id} data-market-entry={`skill-strip:${item.id}`} onClick={event => openDetail(item.id, event.currentTarget)}><Blocks size={19} aria-hidden="true" /><span>{item.name}</span></button></MarketIconHint>)}</nav></section>}
        <MarketTabs.List className="mira-market-segments" aria-label="插件来源"><MarketTabs.Trigger value="public">公共</MarketTabs.Trigger><MarketTabs.Trigger value="installed">本地</MarketTabs.Trigger></MarketTabs.List>
        <MarketTabs.Content value={segment}>
        {host.listPlugins && host.importLocalPlugin && host.setPluginEnabled && host.removePlugin && <div hidden={segment !== 'installed'}><MiraInstalledPlugins host={host as SkillMarketHost & MiraPluginHost} query={query} refreshRevision={pluginRefresh} onBusyChange={setPluginsBusy} onItemsChange={setInstalledPlugins} onTryPlugin={onTryPlugin} onOpen={(item, trigger) => { detailOrigin.current = trigger.dataset.marketEntry; savedScroll.current = scroll.current?.scrollTop ?? 0; setSelectedLocal(item.id) }} /></div>}
        {segment === 'public' && publicPlugins}
        {segment === 'installed' && installedError && <div className="mira-market-error" role="alert"><span>{installedError}</span><button type="button" onClick={() => { void load(true) }}>重试</button></div>}
        <section hidden={Boolean(publicPlugins) && (segment === 'public' || !installed.length)} className="mira-market-catalog" aria-label={segment === 'public' ? '公开技能' : '已安装技能'} aria-busy={loading}><div className="mira-market-section-title"><h2>{keyword ? '搜索结果' : segment === 'installed' ? '已安装技能' : catalog?.sourceName ?? 'Anthropic Skills'}</h2>{(catalog || segment === 'installed') && <span>{items.length}</span>}</div>
          {segment === 'public' && error && <div className="mira-market-error" role="alert"><span>公开技能：{error}</span><button type="button" disabled={loading} onClick={() => { void load(true) }}>重试</button></div>}
          {loading && !catalog && segment === 'public' ? <Loading text="正在读取公开技能…" /> : items.length === 0 ? !(segment === 'public' ? error : installedError) && <p className="mira-market-empty">{keyword ? '没有匹配的技能' : segment === 'installed' ? '尚未安装技能' : '暂无可安装技能'}</p> : <div className="mira-market-grid">{items.map(item => <article className="mira-market-item" key={item.id}><button className="mira-market-item-main" data-market-entry={`skill-card:${item.id}`} type="button" onClick={event => openDetail(item.id, event.currentTarget)}><span className="mira-market-avatar"><Blocks size={20} aria-hidden="true" /></span><span><h3>{item.name}</h3><p>{item.description}</p></span></button><div className="mira-market-item-footer"><span>{item.license}</span>{installButton(item)}</div></article>)}</div>}
        </section>
        </MarketTabs.Content>
      </MarketTabs.Root>}
    </div>
    {sourcesOpen && host.listPluginMarketplaces && host.addPluginMarketplace && host.removePluginMarketplace && <MiraMarketplaceSources host={host as MiraMarketplaceSourceHost} adding={sourcesOpen === 'add'} onClose={() => setSourcesOpen(undefined)} onChanged={() => { setDetailRevision(value => value + 1); setPluginRefresh(value => value + 1) }} />}
  </section>
}

function Loading({ text }: { text: string }) { return <p className="mira-market-loading" role="status"><LoaderCircle size={16} className="mira-market-spin" aria-hidden="true" />{text}</p> }
function message(cause: unknown) { return cause instanceof Error ? cause.message : '插件市场操作失败，请稍后重试' }
function formatBytes(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B` }
