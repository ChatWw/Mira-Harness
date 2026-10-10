// Pending-row layout adapted from ZCode (Copyright 2026 Z.AI Co., Ltd), Apache-2.0.
// See third-party-licenses/zcode/ADAPTATIONS.md; withdrawal and state use Mira contracts.
import { useRef, useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { LoaderCircle, Undo2 } from 'lucide-react'
import type { HarnessQueuedMessage } from '../../../../../src/config/harness'
import { ComposerControlHint } from '../composer/ComposerControlHint'

export interface MiraPendingGuidesProps {
  items: readonly HarnessQueuedMessage[]
  disabled?: boolean
  promotingItemId?: string
  onWithdraw(itemId: string): Promise<void>
}

export function MiraPendingGuides({ items, disabled, promotingItemId, onWithdraw }: MiraPendingGuidesProps) {
  const pendingRef = useRef(new Set<string>())
  const [pending, setPending] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const guides = items.filter(item => item.delivery === 'guide')
  if (!guides.length) return null
  async function withdraw(itemId: string) {
    if (disabled || promotingItemId === itemId || pendingRef.current.has(itemId)) return
    pendingRef.current.add(itemId); setPending([...pendingRef.current])
    setErrors(previous => ({ ...previous, [itemId]: '' }))
    try { await onWithdraw(itemId) }
    catch (error) { setErrors(previous => ({ ...previous, [itemId]: `撤回失败：${error instanceof Error ? error.message : String(error)}` })) }
    finally { pendingRef.current.delete(itemId); setPending([...pendingRef.current]) }
  }
  // Pending guidance mirrors a user row, but remains separate until the engine consumes it.
  return <Tooltip.Provider delayDuration={350}><div className="flex min-w-0 flex-col gap-5 pt-5" aria-label="待应用指导">
    {guides.map((item, index) => {
      const applying = promotingItemId === item.id, withdrawing = pending.includes(item.id)
      return <div key={item.id} className="flex min-w-0 flex-col items-end gap-1.5" data-pending-guide={item.id}>
        <div className="flex min-w-0 max-w-full flex-col rounded-xl rounded-tr-xs border border-border bg-surface px-4 py-3 text-ui-base text-foreground @min-[624px]/conversation:max-w-xl">
          <div className="min-w-0 whitespace-pre-wrap wrap-anywhere">{item.text}</div>
          <div className="mt-2 flex min-w-0 items-center gap-2 text-ui-sm text-foreground-subtle">
            <span className="min-w-0 flex-1 wrap-anywhere" role="status">{applying ? '正在应用指导…' : '等待引导当前任务…'}</span>
            <ComposerControlHint title="撤回并保留草稿"><button type="button" className="mira-message-action shrink-0" aria-label={`撤回指导 ${index + 1}`} aria-busy={withdrawing || undefined} disabled={disabled || applying || withdrawing} onClick={() => void withdraw(item.id)}>{withdrawing || applying ? <LoaderCircle size={14} className="animate-spin" /> : <Undo2 size={14} />}</button></ComposerControlHint>
          </div>
        </div>
        {errors[item.id] && <p role="alert" className="m-0 max-w-full text-ui-sm text-destructive wrap-anywhere">{errors[item.id]}</p>}
      </div>
    })}
  </div></Tooltip.Provider>
}
