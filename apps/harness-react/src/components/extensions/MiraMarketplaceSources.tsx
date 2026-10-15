import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, Trash2, X } from 'lucide-react'
import type { MiraPluginMarketplaceSource } from '../../../../../src/config/miraPlugins'

export interface MiraMarketplaceSourceHost {
  listPluginMarketplaces(): Promise<MiraPluginMarketplaceSource[]>
  addPluginMarketplace(source: string): Promise<MiraPluginMarketplaceSource[]>
  removePluginMarketplace(id: string): Promise<MiraPluginMarketplaceSource[]>
}
export function MiraMarketplaceSources({ host, adding, onClose, onChanged }: { host: MiraMarketplaceSourceHost; adding: boolean; onClose: () => void; onChanged: () => void }) {
  const [sources, setSources] = useState<MiraPluginMarketplaceSource[]>([])
  const [input, setInput] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; void host.listPluginMarketplaces().then(value => { if (mounted.current) setSources(value) }, cause => { if (mounted.current) setError(String(cause.message || cause)) }); return () => { mounted.current = false } }, [host])
  async function change(operation: () => Promise<MiraPluginMarketplaceSource[]>) {
    if (busy) return
    setBusy(true); setError('')
    try { const value = await operation(); onChanged(); if (mounted.current) { setSources(value); setInput('') } }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : '市场操作失败') }
    finally { if (mounted.current) setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose() }}><Dialog.Portal container={document.getElementById('root')}><Dialog.Overlay className="mira-market-dialog-overlay" /><Dialog.Content className="mira-market-dialog" onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => { if (busy) event.preventDefault() }}>
    <Dialog.Title>{adding ? '添加插件市场' : '插件市场来源'}</Dialog.Title><Dialog.Description>添加 GitHub 仓库、HTTPS 市场清单或本地目录。移除来源会保留已经安装的插件。</Dialog.Description>
    <Dialog.Close className="mira-market-icon mira-market-dialog-close" aria-label="关闭" disabled={busy}><X size={16} /></Dialog.Close>
    {error && <p role="alert" className="mira-market-error">{error}</p>}
    <form onSubmit={event => { event.preventDefault(); void change(() => host.addPluginMarketplace(input)) }}><label htmlFor="mira-market-source">市场来源</label><input id="mira-market-source" value={input} onChange={event => setInput(event.target.value)} placeholder="owner/repo、HTTPS 清单或本地目录" disabled={busy} autoFocus={adding} /><button className="mira-market-add" type="submit" disabled={busy || !input.trim()}><Plus size={14} />{busy ? '处理中…' : '添加'}</button></form>
    <ul><li><div><strong>Mira 内置插件</strong><p>随应用提供，可离线浏览；部分功能需要运行依赖</p></div></li>{sources.map(source => <li key={source.id}><div><strong>{source.name}</strong><p>{source.source}</p></div><button className="mira-market-icon" aria-label={`移除市场 ${source.name}`} disabled={busy} onClick={() => void change(() => host.removePluginMarketplace(source.id))}><Trash2 size={16} /></button></li>)}</ul>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
