// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import Page from '../src/pages/backend/plugins/index.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/platform', () => ({ getPlatformApi: () => ({
  createFirstPartyGrant: async () => 'fixture', revokeFirstPartyGrant: async () => {},
  invokeFirstPartyHarness: async () => [{ id: 'fixture', name: 'Fixture', enabled: true, skills: [], mcpServers: [{ id: 'provided', name: 'provided' }] }],
  listHarnessSkills: async () => [], listMcpServers: async () => [],
}) }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', async () => {
  const { h } = await import('vue')
  return { default: { setup: (_: unknown, { slots }: any) => () => h('main', [h('header', slots.titlebar?.()), slots.default?.()]) } }
})
vi.mock('../src/pages/backend/settings/components/SettingsScopeSelect.vue', () => ({ default: { render: () => null } }))
vi.mock('../src/pages/backend/plugins/PluginRow.vue', () => ({ default: { render: () => null } }))
vi.mock('../src/pages/backend/plugins/SkillSettings.vue', () => ({ default: { render: () => null } }))
vi.mock('../src/pages/backend/mcpConfig/index.vue', async () => {
  const { h } = await import('vue')
  return { default: { emits: ['editor-change', 'count-change'], setup: (_: unknown, { emit, expose }: any) => {
    expose({ canLeave: async () => true, cancelEdit: () => emit('editor-change', '') })
    return () => h('button', { 'aria-label': '打开二级编辑页', onClick: () => emit('editor-change', 'local-files') }, '编辑')
  } } }
})
const actual = Page
const mounted: Array<{ unmount(): void }> = []
afterEach(() => mounted.splice(0).forEach(app => app.unmount()))
async function drain() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }

describe('tools page MCP secondary editor navigation', () => {
  it('replaces the parent title, search, tabs and plugin resources with the editor breadcrumb, then restores them on return', async () => {
    const root = document.createElement('div'); document.body.append(root)
    const app = createApp(actual)
    for (const name of ['AppIcon', 'ElSwitch', 'ElDropdown', 'ElDropdownItem', 'ElDropdownMenu']) app.component(name, { render: () => null })
    mounted.push({ unmount: () => { app.unmount(); root.remove() } }); app.mount(root); await drain()
    const click = async (selector: string) => { root.querySelector<HTMLElement>(selector)!.click(); await drain() }
    await click('[role=tab]:nth-child(2)')
    expect(root.querySelector('[aria-label="搜索 MCP"]')).not.toBeNull()
    expect(root.textContent).toContain('插件提供')
    await click('[aria-label="打开二级编辑页"]')
    expect(root.querySelector('input, [role=tablist]')).toBeNull()
    expect(root.textContent).not.toContain('插件提供')
    expect(root.querySelector('[aria-label="页面位置"]')!.textContent).toBe('工具与扩展local-files')
    await click('[aria-label="页面位置"] button')
    expect(root.querySelector('[aria-label="搜索 MCP"]')).not.toBeNull()
    expect(root.textContent).toContain('插件提供')
    expect(root.querySelector('[aria-label="页面位置"]')).toBeNull()
  })
})
