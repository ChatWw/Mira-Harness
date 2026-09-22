import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness permission scope', () => {
  it('uses the global preference in the chat composer', () => {
    const composerSource = readFileSync(new URL('../src/pages/frontend/harness/components/HarnessComposer.vue', import.meta.url), 'utf8')
    const facadeSource = readFileSync(new URL('../src/pages/frontend/harness/useHarnessPageFacade.ts', import.meta.url), 'utf8')

    expect(composerSource).toContain('const selectedPermissionMode = computed<PermissionMode>(() => props.permissionConfig.globalDefaultMode)')
    expect(facadeSource).toContain('globalDefaultMode: action.permissionMode')
    expect(facadeSource).not.toContain('store.setSessionPermission(store.activeSession.id, action.permissionMode)')
  })
})
