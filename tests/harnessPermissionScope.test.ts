import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness permission scope', () => {
  it('describes new-task permissions in the active conversation settings', () => {
    const generalSettingsSource = readFileSync(new URL('../src/pages/backend/conversation/index.vue', import.meta.url), 'utf8')

    expect(generalSettingsSource).toContain(':model-value="config.globalDefaultMode"')
    expect(generalSettingsSource).toContain('v-if="permissionConfigLoaded"')
    expect(generalSettingsSource).toContain('class="permission-mode-placeholder"')
    expect(generalSettingsSource).toContain('loaded: permissionConfigLoaded')
    expect(generalSettingsSource).toContain('@change="setGlobalDefaultMode"')
    expect(generalSettingsSource).toContain('function setGlobalDefaultMode(mode: PermissionMode)')
    expect(generalSettingsSource).toContain('新任务默认权限')
    expect(generalSettingsSource).toContain('v-for="mode in HARNESS_PERMISSION_OPTIONS"')
    expect(generalSettingsSource).toContain('!config.autoApproveEnabled')
    expect(generalSettingsSource).toContain('!config.fullAccessEnabled')
    expect(generalSettingsSource).not.toContain('帮我批准')
    expect(generalSettingsSource).not.toContain('与输入框同步')
  })
})
