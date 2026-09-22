import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness project summary', () => {
  it('shows a project summary from the conversation title icon', () => {
    const source = readFileSync(new URL('../src/pages/frontend/harness/index.vue', import.meta.url), 'utf8')

    expect(source).toContain('<el-popover v-if="selectedProject" v-model:visible="projectSummaryVisible"')
    expect(source).toContain('<el-tooltip :content="selectedProject.name"')
    expect(source).toContain('{{ selectedProject.sessionCount }} 个对话')
    expect(source).toContain('@click="openProjectSettings"')
    expect(source).toContain('OPEN_HARNESS_PROJECT_DIALOG_EVENT')
  })
})
