import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness project summary', () => {
  it('shows a project summary from the conversation title icon', () => {
    const source = readFileSync(new URL('../src/pages/frontend/harness/index.vue', import.meta.url), 'utf8')

    expect(source).toContain('<el-popover v-if="selectedProject" v-model:visible="projectSummaryVisible"')
    expect(source).toContain('<span class="conversation__project-trigger">')
    expect(source).toContain('@click.stop="toggleProjectSummary"')
    expect(source).toContain('function toggleProjectSummary() { projectSummaryVisible.value = !projectSummaryVisible.value }')
    expect(source).toContain('<div class="conversation__header-drag" aria-hidden="true" />')
    expect(source).toContain('.conversation__header { position: relative; z-index: 101; display: flex;')
    expect(source).toContain('border-bottom: 1px solid color-mix(in srgb, var(--cp-border-light) 42%, transparent);')
    expect(source).toContain('-webkit-app-region: no-drag; }')
    expect(source).toContain('.conversation__header-drag { min-width: 24px; align-self: stretch; flex: 1 1 auto; -webkit-app-region: drag; }')
    expect(source).toContain(':data-tooltip="selectedProject.name"')
    expect(source).toContain('@click="beginSessionTitleEdit"')
    expect(source).toContain('@keydown.enter.prevent="saveSessionTitle"')
    expect(source).toContain('@keydown.esc.prevent="cancelSessionTitleEdit"')
    expect(source).toContain('await store.renameSession(sessionId, title)')
    expect(source).toContain('{{ selectedProject.sessionCount }} 个对话')
    expect(source).toContain('@click="openProjectSettings"')
    expect(source).toContain('OPEN_HARNESS_PROJECT_DIALOG_EVENT')
  })
})
