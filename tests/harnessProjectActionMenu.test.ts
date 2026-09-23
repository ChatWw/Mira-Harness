import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness project action menu', () => {
  it('closes before opening the project editor or running another project action', () => {
    const source = readFileSync(new URL('../src/layouts/components/WorkspaceNavigation.vue', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

    expect(source).toContain(':visible="projectActionProjectId === project.id"')
    expect(source).toContain('@update:visible="setProjectActionVisible(project.id, $event)"')
    expect(source).toContain('function openProjectEditor(project: HarnessProject) { projectActionProjectId.value = undefined;')
    expect(source).toContain('async function handleProjectCommand(command: string, projectId: string) {\n  projectActionProjectId.value = undefined')
  })
})
