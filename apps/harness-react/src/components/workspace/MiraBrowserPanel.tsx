import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Globe2, RefreshCw, TriangleAlert } from 'lucide-react'
import type { HarnessBrowserBounds, HarnessBrowserPresentation } from '../../../../../src/platform/firstPartyHarness'
import { readMiraBrowserPreference, type MiraBrowserPreference } from '../../../../../src/config/miraBrowserViewport'
import type { PilotController } from '../../state/pilot-state'
import { normalizeMiraBrowserAddress } from '../../lib/mira-browser-address'
import { MiraBrowserToolbar } from './MiraBrowserToolbar'
import { MiraBrowserViewport, MiraBrowserViewportToolbar } from './MiraBrowserViewport'
import { useMiraBrowserPicker } from '../../hooks/useMiraBrowserPicker'
import type { MiraBrowserElementReference } from '../../../../../src/platform/miraBrowserPicker'

export interface MiraBrowserRequest { sessionId: string; browserId?: string; url: string }

export function MiraBrowserPanel({ controller, sessionId, browserId = 'browser', active, initialUrl, request, onRequestHandled, onUrlChange, onPageTitle, onPageFavicon, onSelectElement }: { controller: PilotController; sessionId?: string; browserId?: string; active: boolean; initialUrl: string; request?: MiraBrowserRequest; onRequestHandled: (request: MiraBrowserRequest) => void; onUrlChange: (url: string) => void; onPageTitle?: (title: string) => void; onPageFavicon?: (url: string | null) => void; onSelectElement?: (reference: MiraBrowserElementReference) => boolean }) {
  const [address, setAddress] = useState(initialUrl)
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [pageFailed, setPageFailed] = useState(false)
  const [errorCode, setErrorCode] = useState<number>()
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const canPick = active && ready && !loading && !pageFailed && !overlayOpen && Boolean(onSelectElement)
  const picker = useMiraBrowserPicker(controller, sessionId, browserId, canPick, onSelectElement)
  const [preference, setPreference] = useState(() => readMiraBrowserPreference(null))
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [preferenceError, setPreferenceError] = useState('')
  const [desktopZoom, setDesktopZoom] = useState(1)
  const geometryRef = useRef<HarnessBrowserPresentation | null>(null)
  const pendingPreference = useRef<MiraBrowserPreference | null>(null), preferenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const savingPreference = useRef<Promise<void> | undefined>(undefined), preferenceRevision = useRef(0)
  const preferenceMounted = useRef(true)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const openedRef = useRef(false)
  const sessionEpochRef = useRef(0)
  const navigationRevisionRef = useRef(0)
  const observedAddressRevisionRef = useRef(0)
  const failedAddressRef = useRef(initialUrl)
  const liveRef = useRef({ sessionId, browserId, active, overlayOpen, onUrlChange, onPageTitle, onPageFavicon })
  liveRef.current = { sessionId, browserId, active, overlayOpen, onUrlChange, onPageTitle, onPageFavicon }
  const isCurrent = (epoch: number, id: string) => epoch === sessionEpochRef.current && liveRef.current.sessionId === id
  const flushPreference = async () => {
    clearTimeout(preferenceTimer.current); preferenceTimer.current = undefined
    const value = pendingPreference.current; pendingPreference.current = null
    if (!value) { await savingPreference.current; return }
    const revision = preferenceRevision.current
    const request = controller.setPreference('browser.viewport', value, true)
    savingPreference.current = request
    try { await request; if (preferenceMounted.current && revision === preferenceRevision.current) setPreferenceError('') }
    catch (cause) { if (preferenceMounted.current && revision === preferenceRevision.current) { pendingPreference.current ||= value; setPreferenceError('浏览器显示偏好保存失败，请重试。') } throw cause }
    finally { if (savingPreference.current === request) savingPreference.current = undefined }
  }
  const changePreference = (value: MiraBrowserPreference) => {
    setPreference(value); pendingPreference.current = value; preferenceRevision.current++
    clearTimeout(preferenceTimer.current)
    if (value.mode !== preference.mode || value.zoom !== preference.zoom) void flushPreference().catch(() => undefined)
    else preferenceTimer.current = setTimeout(() => void flushPreference().catch(() => undefined), 200)
  }
  useEffect(() => {
    preferenceMounted.current = true
    let current = true
    void controller.getPreference('browser.viewport').then(value => { if (current) setPreference(readMiraBrowserPreference(value)) }).catch(() => { if (current) setPreferenceError('浏览器显示偏好读取失败，暂时使用默认显示。') }).finally(() => { if (current) setPreferencesReady(true) })
    const unregister = controller.registerBeforeNavigation(flushPreference)
    return () => { current = false; preferenceMounted.current = false; unregister(); void flushPreference().catch(() => undefined) }
  }, [controller])
  const syncGeometry = (geometry: HarnessBrowserPresentation | null = geometryRef.current) => {
    const current = liveRef.current, epoch = sessionEpochRef.current
    if (!geometry || !current.sessionId || !current.active || current.overlayOpen || !openedRef.current) return Promise.resolve()
    const id = current.sessionId
    return controller.setBrowserViewportFor(id, geometry, current.browserId).then(value => { if (isCurrent(epoch, id)) setDesktopZoom(value.desktopZoomFactor) })
  }
  const bounds = (): HarnessBrowserBounds => {
    const rect = viewportRef.current?.getBoundingClientRect()
    return { x: Math.max(0, Math.round(rect?.left || 0)), y: Math.max(0, Math.round(rect?.top || 0)), width: Math.max(16, Math.round(rect?.width || 0)), height: Math.max(16, Math.round(rect?.height || 0)) }
  }
  useEffect(() => {
    const epoch = ++sessionEpochRef.current
    openedRef.current = false
    setUrl(initialUrl)
    setAddress(initialUrl)
    setError('')
    setCanGoBack(false)
    setCanGoForward(false)
    setLoading(false)
    setReady(false); setPageFailed(false); setErrorCode(undefined)
    failedAddressRef.current = initialUrl
    if (!sessionId) return
    const unsubscribe = controller.onBrowserEvent(event => {
      if (!isCurrent(epoch, sessionId) || (event.browserId ?? 'browser') !== browserId || event.sessionId !== sessionId) return
      if (event.url) { observedAddressRevisionRef.current++; setUrl(event.url); setAddress(event.url); liveRef.current.onUrlChange(event.url) }
      if (event.title) liveRef.current.onPageTitle?.(event.title)
      if (event.faviconUrl !== undefined) liveRef.current.onPageFavicon?.(event.faviconUrl)
      setCanGoBack(event.canGoBack)
      setCanGoForward(event.canGoForward)
      setLoading(event.loading)
      setReady(event.ready ?? Boolean(event.url))
      setPageFailed(Boolean(event.error)); setErrorCode(event.errorCode)
      if (event.error && event.url) failedAddressRef.current = event.url
      setError(event.error || '')
    })
    return () => { sessionEpochRef.current++; navigationRevisionRef.current++; unsubscribe(); if (openedRef.current) void controller.closeBrowserFor(sessionId, browserId).catch(() => undefined) }
  }, [controller, sessionId, browserId])
  useEffect(() => {
    if (!active) { setOverlayOpen(false); return }
    const root = document.getElementById('root')
    if (!root) return
    const selector = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"], [data-mira-browser-context-details]'
    const update = () => setOverlayOpen([...root.querySelectorAll<HTMLElement>(selector)].some(element =>
      element.getAttribute('data-state') !== 'closed' && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0 && !element.contains(viewportRef.current)))
    update()
    const observer = new MutationObserver(records => {
      // Streaming text is unrelated to overlay visibility; only inspect changed overlay subtrees.
      if (records.some(record => record.type === 'attributes'
        ? record.target instanceof Element && (record.target.matches(selector) || Boolean(record.target.querySelector(selector)))
        : [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector)))))) update()
    })
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'data-state', 'aria-hidden', 'hidden', 'style'] })
    return () => observer.disconnect()
  }, [active])
  useEffect(() => {
    if (!active || !sessionId || !preferencesReady) return
    const requested = request?.sessionId === sessionId && (request.browserId ?? 'browser') === browserId ? request : undefined
    if (requested) {
      onRequestHandled(requested)
      void openAddress(requested.url)
    } else if (initialUrl && !openedRef.current) void openAddress(initialUrl)
  }, [active, controller, initialUrl, sessionId, browserId, request, preferencesReady])
  useEffect(() => {
    if (!sessionId || !url) return
    const epoch = sessionEpochRef.current
    const visible = active && !overlayOpen && !pageFailed
    let current = true
    void controller.controlBrowserFor(sessionId, visible ? 'show' : 'hide', browserId).then(() => {
      if (current && isCurrent(epoch, sessionId) && visible && liveRef.current.active && !liveRef.current.overlayOpen) return syncGeometry()
    }).catch(cause => { if (current && isCurrent(epoch, sessionId)) setError(cause instanceof Error ? cause.message : '浏览器视图调整失败') })
    return () => { current = false }
  }, [active, overlayOpen, pageFailed, controller, sessionId, browserId, url, ready])
  async function navigate(event?: FormEvent) {
    event?.preventDefault()
    if (!active || !sessionId || !address.trim()) return
    const value = normalizeMiraBrowserAddress(address)
    if (!value) { setError('请输入有效的 HTTP(S) 网页地址'); return }
    await openAddress(value)
  }
  async function openAddress(value: string) {
    if (!sessionId) return
    picker.cancel()
    const epoch = sessionEpochRef.current
    const requestSessionId = sessionId
    const revision = ++navigationRevisionRef.current
    const observedRevision = observedAddressRevisionRef.current
    failedAddressRef.current = value
    openedRef.current = true
    try {
      setError(''); setPageFailed(false); setErrorCode(undefined); setLoading(true); setAddress(value)
      const result = await controller.navigateBrowserFor(requestSessionId, value, bounds(), browserId, liveRef.current.active && !liveRef.current.overlayOpen)
      if (!isCurrent(epoch, requestSessionId) || revision !== navigationRevisionRef.current) return
      setReady(true)
      await syncGeometry()
      // The bridge acknowledges the requested URL; guest events carry the actual redirected URL.
      if (observedRevision === observedAddressRevisionRef.current) { setUrl(result); liveRef.current.onUrlChange(result) }
      if (!liveRef.current.active || liveRef.current.overlayOpen) void controller.controlBrowserFor(requestSessionId, 'hide', browserId).catch(() => undefined)
    } catch (cause) {
      if (isCurrent(epoch, requestSessionId) && revision === navigationRevisionRef.current) { setLoading(false); setPageFailed(true); setError(current => current || (cause instanceof Error ? cause.message : '浏览器地址无效')) }
    }
  }
  const control = (action: 'back' | 'forward' | 'reload' | 'devtools') => {
    if (!sessionId || !active || !ready || overlayOpen && action !== 'devtools') return
    picker.cancel()
    if (action === 'reload' && pageFailed) { void openAddress(failedAddressRef.current); return }
    const epoch = sessionEpochRef.current
    void controller.controlBrowserFor(sessionId, action, browserId).catch(cause => { if (isCurrent(epoch, sessionId)) setError(cause instanceof Error ? cause.message : '浏览器操作失败') })
  }
  const openExternal = () => {
    if (!sessionId || !active || !ready || pageFailed || !url) return
    const epoch = sessionEpochRef.current
    void controller.openBrowserExternalFor(sessionId, url, browserId).catch(cause => { if (isCurrent(epoch, sessionId)) setError(cause instanceof Error ? cause.message : '无法打开默认浏览器') })
  }
  const certificateError = errorCode !== undefined && errorCode >= -217 && errorCode <= -200
  return <div className="pilot-browser">
    <MiraBrowserToolbar address={address} loading={loading} ready={ready} canGoBack={canGoBack} canGoForward={canGoForward} canOpenExternal={ready && !pageFailed && Boolean(url)} onAddressChange={setAddress} onSubmit={event => void navigate(event)} onControl={control} onOpenExternal={openExternal} freeSize={preference.mode === 'free'} viewportReady={preferencesReady} onToggleFreeSize={() => changePreference({ ...preference, mode: preference.mode === 'free' ? 'normal' : 'free', zoom: 'fit' })} picking={picker.picking} canPick={canPick} onTogglePicker={() => void picker.toggle()} />
    {preference.mode === 'free' && <MiraBrowserViewportToolbar preference={preference} onChange={changePreference} />}
    {preferenceError && <p className="pilot-file-error" role="alert">{preferenceError}<button type="button" onClick={() => void flushPreference().catch(() => undefined)}>重试保存</button></p>}
    {error && !pageFailed && <p className="pilot-file-error" role="alert">{error}</p>}
    {picker.error && <p className="pilot-file-error" role="alert">{picker.error}</p>}
    <MiraBrowserViewport preference={preference} desktopZoom={desktopZoom} active={active && !overlayOpen && !pageFailed && preferencesReady} viewportRef={viewportRef} onChange={changePreference} onGeometry={geometry => { geometryRef.current = geometry; const epoch = sessionEpochRef.current, id = sessionId; void syncGeometry(geometry).catch(cause => { if (id && isCurrent(epoch, id)) setError(cause instanceof Error ? cause.message : '浏览器尺寸调整失败') }) }}>
      {pageFailed ? <div className="pilot-browser__placeholder pilot-browser__placeholder--error"><TriangleAlert size={64} /><h3>{certificateError ? '网页证书验证失败' : '网页加载失败'}</h3><p role="alert">{error}</p>{certificateError && <p>请检查网站证书或本机时间后重试。</p>}<button type="button" onClick={() => void openAddress(failedAddressRef.current)} disabled={!active || !sessionId || loading}><RefreshCw size={16} />重新加载</button></div>
        : !url && !loading && <div className="pilot-browser__placeholder"><Globe2 size={64} /><h3>浏览器</h3><p>{sessionId ? '输入网址并按回车开始浏览' : '请先选择一个任务'}</p></div>}
    </MiraBrowserViewport>
  </div>
}
