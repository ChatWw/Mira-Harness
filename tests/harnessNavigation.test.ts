import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness session navigation', () => {
  it('keeps route-driven session loading in the chat page', () => {
    const sidebarSource = readFileSync(new URL('../src/layouts/components/WorkspaceNavigation.vue', import.meta.url), 'utf8')
    const globalStylesSource = readFileSync(new URL('../src/styles/global.scss', import.meta.url), 'utf8')
    const pageFacadeSource = readFileSync(new URL('../src/pages/frontend/harness/useHarnessPageFacade.ts', import.meta.url), 'utf8')

    expect(sidebarSource).toContain('async function openSession(id: string) { await router.push(`/workspace/chat/${id}`) }')
    expect(sidebarSource).toContain('.workspace-session-row--nested .workspace-item { padding-left: 37px; }')
    expect(sidebarSource).toContain('.workspace-session-row.active { color: var(--cp-sidebar-menu-text); background: var(--cp-sidebar-menu-active-bg); }')
    expect(sidebarSource).toContain('.workspace-action-menu button:hover { background: var(--cp-sidebar-menu-hover-bg); }')
    expect(globalStylesSource).toContain('--cp-sidebar-menu-hover-bg: #F3F2F2;')
    expect(globalStylesSource).toContain('--cp-sidebar-menu-active-bg: #F3F2F2;')
    expect(globalStylesSource).toContain("--cp-sidebar-menu-hover-bg: #3A3A3A;")
    expect(globalStylesSource).toContain("--cp-sidebar-menu-active-bg: #3A3A3A;")
    expect(sidebarSource).not.toMatch(/route\.params\.id[\s\S]*?store\.openSession/)
    expect(pageFacadeSource).toContain('if (store.activeSession?.id !== sessionId.value) await store.openSession(sessionId.value)')
  })
})
