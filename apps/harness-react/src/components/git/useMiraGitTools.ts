import { useCallback, useEffect, useRef, useState } from 'react'
import type { MiraGitSnapshot } from '../../../../../src/config/miraGit'
import type { HarnessProject } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'

export interface MiraGitToolsOwner {
  controller: PilotController
  project?: HarnessProject
  active: boolean
  blocked: boolean
  onReview: () => void
}

export function useMiraGitTools(owner?: MiraGitToolsOwner) {
  const controller = owner?.controller, id = owner?.project?.id, directory = owner?.project?.directory
  const enabled = Boolean(owner?.active && owner.project?.isGitRepository && owner.project.directoryExists && controller?.supportsGitTools)
  const [snapshot, setSnapshot] = useState<MiraGitSnapshot>()
  const [error, setError] = useState('')
  const revision = useRef(0)
  const identity = useRef({ controller, id, directory, enabled })
  identity.current = { controller, id, directory, enabled }
  const refresh = useCallback(async () => {
    if (!enabled || !controller || !id) return
    const request = ++revision.current
    try {
      const next = await controller.getGitTools(id)
      const current = identity.current
      if (request === revision.current && current.controller === controller && current.id === id && current.directory === directory && current.enabled) { setSnapshot(next); setError('') }
      return next
    } catch (failure) {
      if (request === revision.current) setError(failure instanceof Error ? failure.message : 'Git 状态读取失败')
    }
  }, [controller, id, directory, enabled])
  useEffect(() => {
    setSnapshot(undefined); setError('')
    if (!enabled) return
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh() }, 15000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    return () => { revision.current++; window.clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [refresh, enabled])
  const previousBlocked = useRef(owner?.blocked)
  useEffect(() => {
    if (previousBlocked.current !== owner?.blocked) { previousBlocked.current = owner?.blocked; if (enabled) void refresh() }
  }, [owner?.blocked, enabled, refresh])
  return { snapshot: snapshot && snapshot.projectId === id && snapshot.directory === directory ? snapshot : undefined, error, refresh }
}
