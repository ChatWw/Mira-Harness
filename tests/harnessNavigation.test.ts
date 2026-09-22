import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness session navigation', () => {
  it('keeps route-driven session loading in the chat page', () => {
    const sidebarSource = readFileSync(new URL('../src/layouts/components/WorkspaceNavigation.vue', import.meta.url), 'utf8')
    const pageFacadeSource = readFileSync(new URL('../src/pages/frontend/harness/useHarnessPageFacade.ts', import.meta.url), 'utf8')

    expect(sidebarSource).toContain('async function openSession(id: string) { await router.push(`/workspace/chat/${id}`) }')
    expect(sidebarSource).not.toMatch(/route\.params\.id[\s\S]*?store\.openSession/)
    expect(pageFacadeSource).toContain('if (store.activeSession?.id !== sessionId.value) await store.openSession(sessionId.value)')
  })
})
