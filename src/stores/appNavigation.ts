import { readMiraHarnessControlsState, type MiraHarnessControlsState, type MiraHarnessControlCommand, type MiraHarnessControlAction } from '@/platform/harnessControls'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { readMiraAppNavigationSnapshot, readMiraAppNavigationState, type MiraAppNavigationCommand, type MiraAppNavigationDirection, type MiraAppNavigationSnapshot, type MiraAppNavigationState } from '@/platform/appNavigation'

/** The active frame owns navigation; its last snapshot also survives frame teardown. */
export const useAppNavigationStore = defineStore('appNavigation', () => {
  const state = shallowRef<MiraAppNavigationState | null>(null)
  const controls = shallowRef<MiraHarnessControlsState | null>(null)
  let sendControl: ((command: MiraHarnessControlCommand) => boolean) | undefined
  let owner: symbol | undefined
  let send: ((command: MiraAppNavigationCommand) => boolean) | undefined
  let savedSnapshot: MiraAppNavigationSnapshot | undefined
  let pendingSessionId: string | undefined

  function getSavedSnapshot(appId: string) {
    return appId === 'mira-harness' ? readMiraAppNavigationSnapshot(savedSnapshot) : undefined
  }

  function register(appId: string, sendCommand: (command: MiraAppNavigationCommand) => boolean, controlCommand?: (command: MiraHarnessControlCommand) => boolean) {
    const token = Symbol(appId)
    if (appId === 'mira-harness') { owner = token; send = sendCommand; sendControl = controlCommand; state.value = null; controls.value = null }
    const isCurrent = () => owner === token
    return {
      receive(value: unknown) {
        if (!isCurrent()) return
        const next = readMiraAppNavigationState(value)
        if (!next || state.value && next.revision < state.value.revision) return
        state.value = next
        savedSnapshot = readMiraAppNavigationSnapshot(next.snapshot)
      },
      receiveControls(value: unknown) {
        if (!isCurrent()) return
        const next = readMiraHarnessControlsState(value)
        if (next) controls.value = next
        if (next && pendingSessionId && sendControl?.({ type: 'mira:harness-control', action: 'open-session', sessionId: pendingSessionId })) pendingSessionId = undefined
      },
      reset() { if (isCurrent()) { state.value = null; controls.value = null } },
      release() { if (isCurrent()) { owner = undefined; send = undefined; sendControl = undefined; state.value = null; controls.value = null } },
    }
  }

  function openExtensions() {
    if (sendControl?.({ type: 'mira:harness-control', action: 'open-extensions' })) return
    const previous = savedSnapshot
    const entries = [...(previous?.entries.slice(0, previous.cursor + 1) ?? []), { kind: 'extensions' as const }].slice(-50)
    savedSnapshot = { entries, cursor: entries.length - 1, detached: false }
  }

  function openNotificationSession(sessionId: string) {
    pendingSessionId = sessionId
    if (controls.value && sendControl?.({ type: 'mira:harness-control', action: 'open-session', sessionId })) pendingSessionId = undefined
  }

  function go(direction: MiraAppNavigationDirection) {
    const current = state.value
    if (!send || !current || current.busy || !(direction === 'back' ? current.canGoBack : current.canGoForward)) return false
    const pending = { ...current, busy: true }
    state.value = pending
    if (send({ type: 'mira:app-navigation-command', direction, expectedRevision: current.revision })) return true
    if (state.value === pending) state.value = current
    return false
  }

  function control(action: MiraHarnessControlAction) {
    return Boolean(controls.value && sendControl?.({ type: 'mira:harness-control', action }))
  }

  return { state, controls, control, register, getSavedSnapshot, openExtensions, openNotificationSession, go }
})
