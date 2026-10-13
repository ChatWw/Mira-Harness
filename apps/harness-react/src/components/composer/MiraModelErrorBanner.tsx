// Adapted interaction pattern from ZCode ChatErrorBanner (Apache-2.0).
// See third-party-licenses/zcode for the original license and notices.
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, CircleAlert, Copy, Settings2, X } from 'lucide-react'
import type { MiraModelError } from '../../../../../src/config/miraModelErrors'

export function MiraModelErrorBanner({ error, onDismiss, onOpenSettings }: {
  error: MiraModelError
  onDismiss: () => void
  onOpenSettings: () => Promise<void>
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copying, setCopying] = useState(false)
  const [openingSettings, setOpeningSettings] = useState(false)
  const [actionError, setActionError] = useState('')
  async function copyError() {
    setCopying(true); setCopied(false); setActionError('')
    try {
      await navigator.clipboard.writeText([error.message, `错误代码：${error.code}`, '', error.detail].join('\n'))
      setCopied(true)
    } catch { setActionError('复制失败，请打开详情后手动复制。') }
    finally { setCopying(false) }
  }
  async function openSettings() {
    setOpeningSettings(true); setActionError('')
    try { await onOpenSettings() }
    catch { setActionError('未能打开模型设置，当前输入已保留，请重试。') }
    finally { setOpeningSettings(false) }
  }
  return <>
    <div className="mira-model-error" role="alert">
      <CircleAlert size={15} aria-hidden="true" />
      <span title={error.message}>{error.message}</span>
      <button type="button" onClick={() => setDetailsOpen(true)}>查看详情</button>
      <button type="button" disabled={copying} onClick={() => void copyError()} aria-label="复制错误">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制错误'}</button>
      <button type="button" disabled={openingSettings} onClick={() => void openSettings()}><Settings2 size={14} />{openingSettings ? '正在打开' : '模型设置'}</button>
      <button type="button" className="mira-model-error-dismiss" aria-label="关闭错误提示" onClick={onDismiss}><X size={14} /></button>
    </div>
    {actionError && <p className="mira-model-error-action" role="status">{actionError}</p>}
    <Dialog.Root open={detailsOpen} onOpenChange={setDetailsOpen}><Dialog.Portal container={document.getElementById('root')}>
      <Dialog.Overlay className="mira-composer-confirm-overlay" />
      <Dialog.Content className="mira-model-error-dialog">
        <div className="mira-model-error-dialog-heading"><Dialog.Title>错误详情</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="关闭错误详情"><X size={16} /></button></Dialog.Close></div>
        <Dialog.Description>{error.message}</Dialog.Description>
        <pre tabIndex={0}>{error.detail}</pre>
        <div className="mira-model-error-dialog-footer"><span>{error.code}</span><button type="button" disabled={copying} onClick={() => void copyError()}>{copied ? '已复制' : '复制错误'}</button></div>
        {actionError && <p className="mira-model-error-action" role="status">{actionError}</p>}
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </>
}
