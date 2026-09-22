import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness permission scope', () => {
  it('uses the global preference in the chat composer', () => {
    const composerSource = readFileSync(new URL('../src/pages/frontend/harness/components/HarnessComposer.vue', import.meta.url), 'utf8')
    const facadeSource = readFileSync(new URL('../src/pages/frontend/harness/useHarnessPageFacade.ts', import.meta.url), 'utf8')
    const generalSettingsSource = readFileSync(new URL('../src/pages/backend/general/index.vue', import.meta.url), 'utf8')

    expect(composerSource).toContain('const selectedPermissionMode = computed<PermissionMode>(() => props.permissionConfig.globalDefaultMode)')
    expect(facadeSource).toContain('globalDefaultMode: action.permissionMode')
    expect(facadeSource).not.toContain('store.setSessionPermission(store.activeSession.id, action.permissionMode)')
    expect(generalSettingsSource).toContain(':model-value="config.globalDefaultMode"')
    expect(generalSettingsSource).toContain('v-if="permissionConfigLoaded"')
    expect(generalSettingsSource).toContain('class="permission-mode-placeholder"')
    expect(generalSettingsSource).toContain('permissionConfigLoaded.value = true')
    expect(generalSettingsSource).toContain('@change="setGlobalDefaultMode"')
    expect(generalSettingsSource).toContain('function setGlobalDefaultMode(mode: PermissionMode)')
    expect(generalSettingsSource).toContain('<el-radio-button value="auto-approve" :disabled="!config.autoApproveEnabled">帮我批准</el-radio-button>')
    expect(generalSettingsSource).toContain('<el-radio-button value="full" :disabled="!config.fullAccessEnabled">完全访问</el-radio-button>')
  })
})
