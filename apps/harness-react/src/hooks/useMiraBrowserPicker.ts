import { useEffect, useRef, useState } from 'react'
import type { PilotController } from '../state/pilot-state'
import type { MiraBrowserElementReference } from '../../../../src/platform/miraBrowserPicker'

export function useMiraBrowserPicker(controller: PilotController, sessionId: string | undefined, browserId: string, enabled: boolean, onSelect?: (reference: MiraBrowserElementReference) => boolean) {
  const [picking, setPicking] = useState(false), [error, setError] = useState('')
  const revision = useRef(0), running = useRef(false), live = useRef({ sessionId, browserId, enabled, onSelect })
  live.current = { sessionId, browserId, enabled, onSelect }
  const cancel = () => {
    revision.current++; setPicking(false)
    if (!running.current || !sessionId) return
    running.current = false
    void controller.pickBrowserElementFor(sessionId, 'cancel', browserId).catch(() => undefined)
  }
  useEffect(() => { setError(''); return cancel }, [controller, sessionId, browserId, enabled])
  useEffect(() => {
    if (!picking) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopImmediatePropagation(); cancel() }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [picking, controller, sessionId, browserId])
  const toggle = async () => {
    if (running.current) { cancel(); return }
    if (!enabled || !sessionId || !onSelect) return
    const run = ++revision.current, owner = sessionId, resource = browserId
    const current = () => revision.current === run && live.current.sessionId === owner && live.current.browserId === resource && live.current.enabled
    running.current = true; setPicking(true); setError('')
    try {
      const result = await controller.pickBrowserElementFor(owner, 'start', resource)
      if (!current() || result.status !== 'selected') return
      if (!live.current.onSelect?.({ sessionId: owner, browserId: resource, element: result.element })) setError('当前任务暂时无法接收引用，请等待输入框就绪后重新选择。')
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : '元素选择失败，请重试。') }
    finally { if (revision.current === run) { running.current = false; setPicking(false) } }
  }
  return { picking, error, toggle, cancel }
}
