/* Adapted from ZCode WorkspaceWebRemoteControlTrigger / WebRemoteControlDialog.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Copy, LoaderCircle, MonitorSmartphone, Smartphone, Unplug, X } from 'lucide-react'
import QRCode from 'qrcode'
import type { PilotController } from '../../state/pilot-state'
import type { MiraRemoteAction, MiraRemoteStatus } from '../../../../../src/config/miraRemote'
import { SidebarActionHint } from './SidebarCollectionSection'

export function MiraRemoteControl({ controller }: { controller: PilotController }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<MiraRemoteStatus>({ enabled: false, urls: [] })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false)
  const [qr, setQr] = useState('')
  const [operation, setOperation] = useState<MiraRemoteAction>('start')
  const pending = useRef(false)
  const url = status.urls[0]
  const state = status.device ? 'connected' : status.enabled || busy ? 'waiting' : 'idle'
  const label = state === 'connected' ? '手机已连接' : state === 'waiting' ? '等待手机连接' : '远程控制未开启'
  useEffect(() => {
    let active = true
    const refresh = () => { if (!pending.current) void controller.remoteControl('status').then(value => { if (active && !pending.current) setStatus(value) }).catch(() => undefined) }
    refresh(); const timer = setInterval(refresh, 2000)
    return () => { active = false; clearInterval(timer) }
  }, [controller])
  useEffect(() => {
    let active = true; setQr('')
    if (url) void QRCode.toDataURL(url, { width: 256, margin: 2, errorCorrectionLevel: 'M' }).then(value => { if (active) setQr(value) }, () => { if (active) setError('二维码生成失败，请复制链接访问') })
    return () => { active = false }
  }, [url])
  async function run(action: MiraRemoteAction) {
    if (pending.current) return
    pending.current = true; setOperation(action); setBusy(true); setError(''); setCopied(false)
    try { setStatus(await controller.remoteControl(action)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试') }
    finally { pending.current = false; setBusy(false) }
  }
  const changeOpen = (value: boolean) => { setOpen(value); if (value) void run('start') }
  return <Dialog.Root modal={false} open={open} onOpenChange={changeOpen}>
    <SidebarActionHint title={`移动端远程控制\n${label}`} hoverOnly suspended={open}>
      <Dialog.Trigger asChild><button type="button" className="mira-remote-trigger" aria-label="移动端远程控制" data-connection-state={state}><Smartphone size={16} /></button></Dialog.Trigger>
    </SidebarActionHint>
    <Dialog.Portal container={document.getElementById('root')}><Dialog.Content className="mira-remote-dialog" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
      <Dialog.Close asChild><button type="button" className="mira-remote-close" aria-label="关闭"><X size={16} /></button></Dialog.Close>
      <header><div className="mira-remote-heading-icon"><MonitorSmartphone size={20} /></div><div><Dialog.Title>移动端远程控制</Dialog.Title><Dialog.Description>扫码或在手机上打开链接，即可继续项目对话。</Dialog.Description></div></header>
      <section className="mira-remote-scan">
        <div className="mira-remote-section-heading"><Smartphone size={16} /><div><h3>手机扫码连接</h3><p>用手机相机扫码，在手机上打开 Mira。</p></div></div>
        <div className="mira-remote-connection">
          <div className="mira-remote-status-row"><div><div className="mira-remote-status-label"><strong>{busy ? operation === 'stop' ? '正在停止服务' : '正在启动服务' : label}</strong><span className="mira-remote-status-tag" data-connection-state={state}><i />{busy ? operation === 'stop' ? '停止中' : '启动中' : status.device ? '已连接' : status.enabled ? '已就绪' : '已停止'}</span></div><p>{busy ? '请稍候…' : status.enabled ? '用手机扫码，或在手机上打开链接。' : '服务已停止，重新打开弹窗即可开启。'}</p></div><button type="button" disabled={busy || !status.enabled} onClick={() => void run('stop')}><Unplug size={14} />停止</button></div>
          <div className="mira-remote-copy-row"><span>无法扫码？可以在手机上打开链接。</span><button type="button" disabled={busy || !url} onClick={() => { if (url) void navigator.clipboard.writeText(url).then(() => setCopied(true), () => setError('复制失败，请重试')) }}><Copy size={14} />{copied ? '已复制' : '复制链接'}</button></div>
        </div>
        <div className="mira-remote-qr">{qr && status.enabled ? <img src={qr} width={256} height={256} alt="手机连接二维码" /> : <div role="status">{busy || status.enabled ? <><LoaderCircle size={20} className="animate-spin" /><span>正在生成二维码…</span></> : <span>服务已停止</span>}</div>}</div>
      </section>
      <p className="mira-remote-notice">仅限可信局域网，HTTP 传输未加密。持有链接即可访问项目对话。</p>
      {error && <p className="mira-remote-error" role="alert">{error}</p>}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>
}
