// Explicit-toggle animation and resize-idle policy adapted from ZCode
// useAnimatedResizablePanel/WorkspaceShellLayout (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Uses Mira host preferences and component names.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Layout, PanelImperativeHandle } from 'react-resizable-panels'
import { MIRA_PANE_PREFERENCE_KEY, MIRA_PANE_TRANSITION_MS, miraNarrowPaneAction, miraPanePreferences, miraSidebarWidth, miraWorkspaceRatio } from '../lib/pane-geometry'

type PaneHost = { getPreference: (key: string) => Promise<unknown>; setPreference: (key: string, value: unknown, reportFailure?: boolean) => Promise<unknown>; reportError: (error: unknown) => void; registerBeforeNavigation?: (flush: () => Promise<void>) => () => void }
type Options = { host: PaneHost; conversation: boolean; workspaceOpen: boolean; sessionsOpen: boolean; closeWorkspace: () => void; closeSessions: () => void }

export function useMiraPaneGeometry(options: Options) {
  const { host, workspaceOpen } = options
  const latest = useRef(options); latest.current = options
  const shellRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)
  const workspaceElementRef = useRef<HTMLDivElement>(null)
  const workspaceContentRef = useRef<HTMLElement>(null)
  const workspacePanelRef = useRef<PanelImperativeHandle>(null)
  const preferences = useRef(miraPanePreferences(undefined))
  const changed = useRef(false)
  const mounted = useRef(true)
  const saving = useRef(Promise.resolve())
  const saveFailed = useRef(false)
  const animating = useRef(false)
  const windowResizing = useRef(false)
  const cancelWorkspaceAnimation = useRef<((settlePending?: boolean) => void) | undefined>(undefined)
  const cancelDrag = useRef<(() => void) | undefined>(undefined)
  const [sessionsWidth, setSessionsWidth] = useState(264)
  const [restored, setRestored] = useState(0)

  function save() {
    changed.current = true
    saveFailed.current = false
    const value = { sessions: preferences.current.sessions, workspaceRatio: preferences.current.workspaceRatio }
    const request = saving.current.catch(() => undefined).then(async () => { await host.setPreference(MIRA_PANE_PREFERENCE_KEY, value, true) })
    saving.current = request
    // Report background failures without turning a failed navigation flush into success.
    void request.catch(error => { if (saving.current === request) saveFailed.current = true; if (mounted.current) host.reportError(error) })
  }

  useEffect(() => {
    mounted.current = true
    let current = true
    void host.getPreference(MIRA_PANE_PREFERENCE_KEY).then(value => {
      if (!current || changed.current) return
      preferences.current = miraPanePreferences(value)
      setSessionsWidth(preferences.current.sessions)
      setRestored(value => value + 1)
    }).catch(error => { if (current) host.reportError(error) })
    return () => { current = false; mounted.current = false; cancelDrag.current?.() }
  }, [host])

  useEffect(() => host.registerBeforeNavigation?.(() => {
    if (saveFailed.current) save()
    return saving.current
  }), [host])

  useEffect(() => {
    const element = workspaceElementRef.current
    const content = workspaceContentRef.current
    const panel = workspacePanelRef.current
    if (!element || !panel) return
    const bodyWidth = bodyRef.current?.getBoundingClientRect().width ?? 0
    const ratio = miraWorkspaceRatio(preferences.current.workspaceRatio, bodyWidth, preferences.current.legacyWorkspace)
    if (preferences.current.legacyWorkspace && bodyWidth > 0) {
      preferences.current = { ...preferences.current, workspaceRatio: ratio, legacyWorkspace: undefined }
      save()
    }
    // Keep expensive tab contents at their final width during the 200ms reveal.
    const contentWidth = workspaceOpen ? bodyWidth * ratio : element.getBoundingClientRect().width
    if (content && contentWidth > 0) content.style.width = `${contentWidth}px`
    animating.current = true
    element.classList.add('mira-pane-toggling')
    const applyTarget = () => { if (workspaceOpen) panel.resize(`${ratio * 100}%`); else panel.collapse() }
    let pending = true
    const frame = window.requestAnimationFrame(() => { pending = false; applyTarget() })
    const timer = window.setTimeout(() => {
      animating.current = false
      element.classList.remove('mira-pane-toggling')
      if (content) content.style.removeProperty('width')
    }, MIRA_PANE_TRANSITION_MS)
    const cleanup = (settlePending = false) => {
      window.cancelAnimationFrame(frame); window.clearTimeout(timer)
      animating.current = false; element.classList.remove('mira-pane-toggling')
      if (content) content.style.removeProperty('width')
      if (settlePending && pending) { pending = false; applyTarget() }
    }
    cancelWorkspaceAnimation.current = cleanup
    return () => cleanup()
  }, [workspaceOpen, restored])

  useEffect(() => {
    let timer: number | undefined
    let settleTimer: number | undefined
    const collapseIfNarrow = () => {
      const current = latest.current
      const width = conversationRef.current?.getBoundingClientRect().width
      if (!current.conversation || width === undefined) return
      const action = miraNarrowPaneAction(width, current.workspaceOpen, current.sessionsOpen)
      if (action === 'workspace') {
        current.closeWorkspace()
        settleTimer = window.setTimeout(collapseIfNarrow, MIRA_PANE_TRANSITION_MS)
      } else if (action === 'sessions') current.closeSessions()
    }
    const resize = () => {
      windowResizing.current = true
      cancelWorkspaceAnimation.current?.(true)
      window.clearTimeout(timer); window.clearTimeout(settleTimer)
      timer = window.setTimeout(() => { windowResizing.current = false; collapseIfNarrow() }, 300)
    }
    window.addEventListener('resize', resize)
    return () => { window.clearTimeout(timer); window.clearTimeout(settleTimer); window.removeEventListener('resize', resize) }
  }, [])

  function commitSidebar(width: number) {
    preferences.current.sessions = miraSidebarWidth(width)
    shellRef.current?.style.setProperty('--mira-sidebar-width', `${preferences.current.sessions}px`)
    setSessionsWidth(preferences.current.sessions)
    save()
  }

  function resizeSessions(event: ReactPointerEvent<HTMLDivElement>) {
    if (!latest.current.sessionsOpen || event.button !== 0) return
    cancelDrag.current?.()
    changed.current = true
    shellRef.current?.classList.add('mira-sidebar-dragging')
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX, startWidth = preferences.current.sessions
    let width = startWidth
    const move = (move: PointerEvent) => {
      if (move.pointerId !== event.pointerId) return
      width = miraSidebarWidth(startWidth + move.clientX - startX)
      shellRef.current?.style.setProperty('--mira-sidebar-width', `${width}px`)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end)
      shellRef.current?.classList.remove('mira-sidebar-dragging')
      cancelDrag.current = undefined
    }
    const end = (end: PointerEvent) => { if (end.pointerId !== event.pointerId) return; cleanup(); if (mounted.current) commitSidebar(width) }
    cancelDrag.current = cleanup
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end)
  }

  function resizeSessionsWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    commitSidebar(event.key === 'Home' ? 220 : event.key === 'End' ? 420 : preferences.current.sessions + (event.key === 'ArrowLeft' ? -16 : 16))
  }

  function workspaceLayoutChanged(layout: Layout) {
    const size = layout['mira-inspector']
    if (!latest.current.workspaceOpen || animating.current || windowResizing.current || !Number.isFinite(size) || size <= 0) return
    const ratio = size / 100
    if (Math.abs(ratio - preferences.current.workspaceRatio) < .00001) return
    preferences.current.workspaceRatio = ratio
    save()
  }

  function beginWorkspaceResize() {
    changed.current = true
    windowResizing.current = false
    cancelWorkspaceAnimation.current?.()
  }

  return { shellRef, bodyRef, conversationRef, workspaceElementRef, workspaceContentRef, workspacePanelRef, sessionsWidth, resizeSessions, resizeSessionsWithKeyboard, workspaceLayoutChanged, beginWorkspaceResize }
}
