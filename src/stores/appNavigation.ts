import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { readMiraAppNavigationSnapshot, readMiraAppNavigationState, type MiraAppNavigationCommand, type MiraAppNavigationDirection, type MiraAppNavigationSnapshot, type MiraAppNavigationState } from '@/platform/appNavigation'

/** The active frame owns navigation; only its last snapshot survives a settings visit. */
export const useAppNavigationStore = defineStore('appNavigation', () => {
  const state = shallowRef<MiraAppNavigationState | null>(null)
  let owner: symbol | undefined
  let send: ((command: MiraAppNavigationCommand) => boolean) | undefined
  let savedSnapshot: MiraAppNavigationSnapshot | undefined

  function getSavedSnapshot(appId: string) {
    return appId === 'mira-harness' ? readMiraAppNavigationSnapshot(savedSnapshot) : undefined
  }

  function register(appId: string, sendCommand: (command: MiraAppNavigationCommand) => boolean) {
    const token = Symbol(appId)
    if (appId === 'mira-harness') { owner = token; send = sendCommand; state.value = null }
    const isCurrent = () => owner === token
    return {
      receive(value: unknown) {
        if (!isCurrent()) return
        const next = readMiraAppNavigationState(value)
        if (!next || state.value && next.revision < state.value.revision) return
        state.value = next
        savedSnapshot = readMiraAppNavigationSnapshot(next.snapshot)
      },
      reset() { if (isCurrent()) state.value = null },
      release() { if (isCurrent()) { owner = undefined; send = undefined; state.value = null } },
    }
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

  return { state, register, getSavedSnapshot, go }
})
