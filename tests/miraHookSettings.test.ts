import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import Page from '../src/pages/backend/hooks/index.vue'
import { MIRA_HOOK_EVENTS, type MiraHookItem } from '../src/config/miraHooks'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'

const host = vi.hoisted(() => ({ api: undefined as any, route: { query: {} as Record<string, string> }, leave: undefined as undefined | (() => Promise<boolean>), confirm: vi.fn(async () => undefined) }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api }))
vi.mock('vue-router', () => ({ useRoute: () => host.route, onBeforeRouteLeave: (guard: () => Promise<boolean>) => { host.leave = guard } }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: host.confirm } }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('main', slots.default?.()) } }))
const ActualPage = withVueClientRender(Page, new URL('../src/pages/backend/hooks/index.vue', import.meta.url))
const passthrough = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const components = Object.fromEntries(['ElSelect', 'ElOption', 'ElButton', 'ElSwitch', 'ElTag', 'ElForm', 'ElFormItem', 'ElInput', 'ElSkeleton', 'AppIcon'].map(name => [name, passthrough(name)]))
const mounted: Array<{ unmount(): void }> = []
const hook = (patch: Partial<MiraHookItem> = {}): MiraHookItem => ({ id: 'hook-a', scope: 'global', revision: 'revision-1', name: '检查文件', event: 'PreToolUse', type: 'process', command: 'node', args: ['scripts/check.mjs', '/space path'], async: false, timeout: 60, enabled: true, trusted: true, createdAt: 1, updatedAt: 1, sourceRoot: '/global', sourcePath: '/global/hooks.json', ...patch })
async function drain() { for (let index = 0; index < 10; index++) { await Promise.resolve(); await nextTick() } }
function reviewText() {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(defineComponent({ render: () => host.confirm.mock.calls.at(-1)![0] as any }))
  mounted.push(app)
  expect(renderer.all().filter(node => node.type === 'dt').map(node => node.text + node.children.map(child => child.text).join(''))).toContain('命令：')
  return renderer.all().map(node => node.text).join('')
}
function setup() {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(ActualPage, {}, components); mounted.push(app)
  const find = (predicate: (node: VueTestNode) => boolean) => { const value = renderer.all().find(predicate); if (!value) throw new Error('Missing Hook settings control'); return value }
  const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
  const click = async (label: string) => { await (find(node => node.type === 'ElButton' && node.props['aria-label'] === label).props.onClick as () => Promise<void>)(); await drain() }
  const input = async (label: string, value: unknown) => { (find(node => node.props['aria-label'] === label).props['onUpdate:modelValue'] as (value: unknown) => void)(value); await drain() }
  const change = async (label: string, value: unknown) => { await (find(node => node.props['aria-label'] === label).props.onChange as (value: unknown) => Promise<void>)(value); await drain() }
  return { renderer, click, input, change, find, text: () => text(renderer.root) }
}
beforeEach(() => {
  host.route.query = {}; host.confirm.mockReset(); host.confirm.mockResolvedValue(undefined)
  host.api = { listHarnessProjects: vi.fn(async () => [{ id: 'project-a', name: 'Project A' }]), hooks: {
    list: vi.fn(async () => [hook()]), save: vi.fn(async (value: any) => hook({ ...value, id: value.id || 'new-hook', revision: 'revision-2' })),
    delete: vi.fn(async () => undefined), setEnabled: vi.fn(async (value: any) => hook({ ...value, revision: 'revision-2' })), trust: vi.fn(async (value: any) => hook({ ...value, enabled: true })), revokeTrust: vi.fn(async (value: any) => hook({ ...value, trusted: false })),
  } }
})
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()) })

describe('real Vue Hook settings event forms and revision-bound operations', () => {
  it('reviews exact plugin source and revision, trusts and revokes through the host without editing plugin files', async () => {
    const item = hook({ id: 'plugin-hook', scope: 'plugin', pluginId: 'mira-check@local', pluginName: 'Mira Check', trusted: false, sourceRoot: '/plugins/check', sourcePath: '/plugins/check/hooks/hooks.json' })
    host.route.query = { plugin: 'mira-check@local' }
    host.api.hooks.list.mockResolvedValue([hook(), item, { ...item, id: 'other-hook', pluginId: 'other@local', name: '其他插件' }])
    host.api.hooks.trust.mockResolvedValue({ ...item, trusted: true })
    host.api.hooks.revokeTrust.mockResolvedValue(item)
    const view = setup(); await drain()
    expect(host.api.hooks.list).toHaveBeenCalledExactlyOnceWith({})
    expect(view.text()).toContain('Mira Check'); expect(view.text()).toContain('/plugins/check/hooks/hooks.json'); expect(view.text()).not.toContain('其他插件')
    expect(view.find(node => node.props['aria-label'] === '新建 Hook').props.disabled).toBe(true)
    expect(view.renderer.all().some(node => node.props['aria-label'] === '编辑 检查文件' || node.props['aria-label'] === '删除 检查文件' || node.props['aria-label'] === '启用 检查文件')).toBe(false)
    await view.click('审阅并授权 检查文件')
    expect(reviewText()).toContain('/plugins/check/hooks/hooks.json'); expect(reviewText()).toContain('Mira Check')
    const target = { scope: 'plugin', pluginId: 'mira-check@local', id: 'plugin-hook', expectedRevision: 'revision-1' }
    expect(host.api.hooks.trust).toHaveBeenCalledExactlyOnceWith(target)
    await view.click('撤销授权 检查文件')
    expect(host.api.hooks.revokeTrust).toHaveBeenCalledExactlyOnceWith(target)
    expect(host.api.hooks.setEnabled).not.toHaveBeenCalled(); expect(host.api.hooks.save).not.toHaveBeenCalled(); expect(host.api.hooks.delete).not.toHaveBeenCalled()
    expect(view.text()).toContain('已撤销'); await view.click('查看全部插件 Hooks'); expect(view.text()).toContain('其他插件')
  })

  it('keeps disabled and changed plugin Hooks visible, disallows disabled authorization and retains changed rows on stale trust failure', async () => {
    host.route.query = { plugin: 'mira-check@local' }
    const item = hook({ scope: 'plugin', pluginId: 'mira-check@local', pluginName: 'Mira Check', trusted: false, unavailableReason: '此 Hook 尚未确认信任或内容已变化，请在设置中检查并确认后启用' })
    host.api.hooks.list.mockResolvedValue([item, { ...item, id: 'disabled', name: '停用检查', enabled: false, unavailableReason: '插件已停用' }])
    host.api.hooks.trust.mockRejectedValue(new Error('Hook 已移除或已被修改，请刷新后重试'))
    const view = setup(); await drain()
    expect(view.text()).toContain('内容已变化'); expect(view.text()).toContain('已停用')
    expect(view.find(node => node.props['aria-label'] === '审阅并授权 停用检查').props.disabled).toBe(true)
    await view.click('审阅并授权 检查文件')
    expect(view.text()).toContain('请刷新后重试'); expect(view.find(node => node.props['data-hook-id'] === 'hook-a').props['data-hook-status']).toBe('untrusted')
    expect(host.api.hooks.setEnabled).not.toHaveBeenCalled()
  })

  it.each(MIRA_HOOK_EVENTS)('creates %s with normalized process arguments and advanced values', async event => {
    const view = setup(); await drain(); await view.click('新建 Hook')
    await view.input('Hook 名称', ' new-hook '); await view.input('Hook 事件', event); await view.input('Hook 命令', ' node ')
    await view.input('Hook 参数', ' scripts/check.mjs\n/space path\n\n'); await view.input('Hook 匹配条件', ' write_file|edit_file ')
    await view.input('Hook 超时秒数', '120'); await view.input('Hook 运行状态说明', ' Checking '); await view.input('Hook 自定义 JSON', '{"team":"writing","nested":{"strict":true}}'); await view.input('启用 Hook', false)
    await view.click('保存 Hook')
    expect(host.api.hooks.save).toHaveBeenCalledExactlyOnceWith({ scope: 'global', name: 'new-hook', event, type: 'process', command: 'node', args: ['scripts/check.mjs', '/space path'], matcher: 'write_file|edit_file', timeout: 120, statusMessage: 'Checking', custom: { team: 'writing', nested: { strict: true } }, enabled: false })
    expect(view.text()).toContain('Hook 已保存'); expect(view.text()).toContain('已停用')
  })

  it('retains command/process drafts and omits inactive options from revision-bound save', async () => {
    const view = setup(); await drain(); await view.click('编辑 检查文件'); await view.input('Hook 执行方式', 'command')
    await view.input('Hook Shell', '/bin/bash'); await view.input('异步执行 Hook', true)
    await view.input('Hook 执行方式', 'process'); expect(view.find(node => node.props['aria-label'] === 'Hook 参数').props.modelValue).toBe('scripts/check.mjs\n/space path')
    await view.input('Hook 参数', 'new.mjs'); await view.input('Hook 执行方式', 'command')
    expect(view.find(node => node.props['aria-label'] === 'Hook Shell').props.modelValue).toBe('/bin/bash')
    expect(view.find(node => node.props['aria-label'] === '异步执行 Hook').props.modelValue).toBe(true)
    expect(view.text()).toContain('不会阻塞当前任务'); expect(view.text()).toContain('不能阻止操作或更改权限决定')
    await view.click('保存 Hook')
    const saved = host.api.hooks.save.mock.calls[0][0]
    expect(saved).toMatchObject({ id: 'hook-a', scope: 'global', expectedRevision: 'revision-1', type: 'command', shell: '/bin/bash', async: true })
    expect(saved).not.toHaveProperty('args')
    await view.click('编辑 检查文件'); await view.input('Hook 执行方式', 'process'); await view.click('保存 Hook')
    expect(host.api.hooks.save.mock.calls[1][0]).not.toHaveProperty('shell'); expect(host.api.hooks.save.mock.calls[1][0]).not.toHaveProperty('async')
  })

  it('explicitly clears optional values without reintroducing old advanced fields', async () => {
    host.api.hooks.list.mockResolvedValue([hook({ type: 'command', shell: '/bin/bash', matcher: 'write', statusMessage: 'working', custom: { token: 'saved-secret' } })])
    const view = setup(); await drain(); await view.click('编辑 检查文件'); await view.input('Hook Shell', ''); await view.input('Hook 匹配条件', ''); await view.input('Hook 运行状态说明', ''); await view.input('Hook 自定义 JSON', ''); await view.click('保存 Hook')
    expect(host.api.hooks.save.mock.calls[0][0]).toMatchObject({ shell: true, matcher: '', statusMessage: '', custom: {} }); expect(view.text()).not.toContain('saved-secret')
  })

  it('filters project scope while retaining global store metadata and creates only in the selected project', async () => {
    host.route.query = { project: 'project-a' }; host.api.hooks.list.mockResolvedValue([hook(), hook({ id: 'project-hook', scope: 'project', name: '项目检查' })])
    const view = setup(); await drain(); expect(host.api.hooks.list).toHaveBeenCalledExactlyOnceWith({ projectId: 'project-a' })
    expect(view.text()).toContain('项目检查'); expect(view.text()).not.toContain('检查文件'); await view.click('新建 Hook'); await view.input('Hook 名称', '项目新建'); await view.input('Hook 命令', 'node'); await view.click('保存 Hook')
    expect(host.api.hooks.save.mock.calls[0][0]).toMatchObject({ scope: 'project', projectId: 'project-a' })
  })

  it('searches real name/event/command/matcher without replacing an open draft', async () => {
    host.api.hooks.list.mockResolvedValue([hook(), hook({ id: 'hook-b', name: '保存后', event: 'PostToolUse', command: 'python', matcher: 'read_file' })])
    const view = setup(); await drain(); await view.click('编辑 检查文件'); await view.input('Hook 名称', '正在编辑')
    await view.input('搜索 Hook', 'python'); expect(view.text()).toContain('保存后'); expect(view.text()).not.toContain('node')
    await view.input('搜索 Hook', 'read_file'); expect(view.text()).toContain('保存后')
    await view.input('搜索 Hook', 'unknown'); expect(view.text()).toContain('没有匹配的 Hook'); expect(view.find(node => node.props['aria-label'] === 'Hook 名称').props.modelValue).toBe('正在编辑')
  })

  it('validates incomplete names/command, integer timeout and JSON while preserving drafts', async () => {
    const view = setup(); await drain(); await view.click('新建 Hook'); await view.click('保存 Hook'); expect(view.text()).toContain('请填写 Hook 名称')
    await view.input('Hook 名称', 'new'); await view.click('保存 Hook'); expect(view.text()).toContain('请填写 Hook 命令')
    await view.input('Hook 命令', 'node'); await view.input('Hook 超时秒数', '1.5'); await view.click('保存 Hook'); expect(view.text()).toContain('1–600')
    await view.input('Hook 超时秒数', '601'); await view.click('保存 Hook'); expect(host.api.hooks.save).not.toHaveBeenCalled()
    await view.input('Hook 超时秒数', '60'); await view.input('Hook 自定义 JSON', '[]'); await view.click('保存 Hook'); expect(view.text()).toContain('JSON 对象')
    await view.input('Hook 自定义 JSON', '{invalid'); await view.click('保存 Hook'); expect(view.text()).toContain('有效的 JSON'); expect(view.find(node => node.props['aria-label'] === 'Hook 自定义 JSON').props.modelValue).toBe('{invalid')
  })

  it('preserves draft/revision on conflict and exposes no injected credentials in errors', async () => {
    const view = setup(); await drain(); await view.click('编辑 检查文件'); await view.input('Hook 名称', '修改中')
    host.api.hooks.save.mockRejectedValueOnce(new Error("Error invoking remote method 'platform:hooks': Error: Hook 已移除或已被修改，请刷新后重试"))
    await view.click('保存 Hook'); expect(view.text()).toContain('Hook 已移除或已被修改'); expect(view.text()).not.toContain('Error invoking remote method')
    expect(view.find(node => node.props['aria-label'] === 'Hook 名称').props.modelValue).toBe('修改中')
    host.api.hooks.save.mockRejectedValueOnce(new Error('Hook cannot write secret-token /home/secret-path'))
    await view.click('保存 Hook'); expect(view.text()).not.toContain('secret-token'); expect(view.text()).not.toContain('/home/secret-path')
    await view.click('保存 Hook'); expect(host.api.hooks.save.mock.calls[2][0].expectedRevision).toBe('revision-1')
  })

  it('guards dirty cancel, refresh, scope change, editor replacement and route leaving', async () => {
    const view = setup(); await drain(); await view.click('编辑 检查文件'); await view.input('Hook 名称', '保留草稿')
    for (const label of ['取消 Hook 编辑', '刷新 Hooks', '新建 Hook']) { host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click(label); expect(view.find(node => node.props['aria-label'] === 'Hook 名称').props.modelValue).toBe('保留草稿') }
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.change('Hook 作用范围', 'project-a'); expect(host.api.hooks.list).toHaveBeenCalledOnce()
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    await view.click('取消 Hook 编辑'); expect(view.renderer.all().some(node => node.props['aria-label'] === 'Hook 名称')).toBe(false)
  })

  it('uses revision-bound actual enable state without optimistic changes or erasing failures', async () => {
    const view = setup(); await drain(); host.api.hooks.setEnabled.mockRejectedValueOnce(new Error('Hook 已移除或已被修改，请刷新后重试'))
    await view.change('启用 检查文件', false); expect(host.api.hooks.setEnabled).toHaveBeenCalledExactlyOnceWith({ id: 'hook-a', scope: 'global', expectedRevision: 'revision-1', enabled: false })
    expect(view.find(node => node.props['data-hook-id'] === 'hook-a').props['data-hook-status']).toBe('enabled'); expect(view.text()).toContain('Hook 已移除或已被修改')
    await view.change('启用 检查文件', false); expect(view.find(node => node.props['data-hook-id'] === 'hook-a').props['data-hook-status']).toBe('disabled'); expect(view.text()).not.toContain('Hook 已移除或已被修改')
  })

  it('requires review for external project changes and trusts only the displayed current revision', async () => {
    host.route.query = { project: 'project-a' }; host.api.hooks.list.mockResolvedValue([hook({ scope: 'project', trusted: false, unavailableReason: 'Hook 已移除或已被修改，请刷新后重试' })])
    const view = setup(); await drain(); expect(view.find(node => node.props['data-hook-id'] === 'hook-a').props['data-hook-status']).toBe('untrusted')
    expect(view.find(node => node.props['aria-label'] === '启用 检查文件').props['model-value']).toBe(false); expect(view.find(node => node.props['aria-label'] === '启用 检查文件').props.disabled).toBe(true)
    await view.change('启用 检查文件', true); expect(host.api.hooks.setEnabled).not.toHaveBeenCalled()
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('信任并启用 检查文件'); expect(host.api.hooks.trust).not.toHaveBeenCalled()
    host.api.hooks.trust.mockRejectedValueOnce(new Error('Hook 已移除或已被修改，请刷新后重试')); await view.click('信任并启用 检查文件')
    expect(view.find(node => node.props['data-hook-id'] === 'hook-a').props['data-hook-status']).toBe('untrusted')
    await view.click('信任并启用 检查文件'); expect(host.api.hooks.trust).toHaveBeenLastCalledWith({ scope: 'project', id: 'hook-a', expectedRevision: 'revision-1', projectId: 'project-a' })
    expect(reviewText()).toContain('scripts/check.mjs'); expect(view.text()).toContain('已信任并启用')
  })

  it('reviews and trusts an externally changed global Hook using its displayed global revision', async () => {
    host.api.hooks.list.mockResolvedValue([hook({ trusted: false, revision: 'external-global-revision', unavailableReason: '此 Hook 尚未确认信任或内容已变化，请在设置中检查并确认后启用' })])
    const view = setup(); await drain()
    expect(view.find(node => node.props['data-hook-id'] === 'hook-a').props['data-hook-status']).toBe('untrusted')
    expect(view.find(node => node.props['aria-label'] === '启用 检查文件').props.disabled).toBe(true)
    await view.click('信任并启用 检查文件')
    expect(host.confirm).toHaveBeenCalledOnce(); expect(reviewText()).toContain('scripts/check.mjs')
    expect(host.api.hooks.trust).toHaveBeenCalledExactlyOnceWith({ scope: 'global', id: 'hook-a', expectedRevision: 'external-global-revision' })
    expect(host.api.hooks.setEnabled).not.toHaveBeenCalled()
    expect(view.find(node => node.props['data-hook-id'] === 'hook-a').props['data-hook-scope']).toBe('global')
    expect(view.find(node => node.props['data-hook-id'] === 'hook-a').props['data-hook-status']).toBe('enabled')
    expect(view.text()).toContain('Hook 已信任并启用')
  })

  it('retains rows and same editor on delete failure and guards a dirty deletion', async () => {
    const view = setup(); await drain(); await view.click('编辑 检查文件'); await view.input('Hook 名称', '保留草稿')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('删除 检查文件'); expect(host.api.hooks.delete).not.toHaveBeenCalled()
    host.api.hooks.delete.mockRejectedValueOnce(new Error('Hook 已移除或已被修改，请刷新后重试')); await view.click('删除 检查文件')
    expect(view.find(node => node.props['aria-label'] === 'Hook 名称').props.modelValue).toBe('保留草稿'); expect(view.find(node => node.props['data-hook-id'] === 'hook-a')).toBeTruthy()
    await view.click('删除 检查文件'); expect(host.api.hooks.delete).toHaveBeenLastCalledWith({ id: 'hook-a', scope: 'global', expectedRevision: 'revision-1' }); expect(view.text()).toContain('Hook 已删除')
  })

  it('atomically trusts and enables a disabled untrusted project hook without a second trust write', async () => {
    host.route.query = { project: 'project-a' }; host.api.hooks.list.mockResolvedValue([hook({ scope: 'project', enabled: false, trusted: false, custom: { mode: 'strict' }, matcher: 'write_file' })])
    const view = setup(); await drain(); await view.click('信任并启用 检查文件')
    expect(host.api.hooks.trust).not.toHaveBeenCalled()
    expect(host.api.hooks.setEnabled).toHaveBeenCalledExactlyOnceWith({ scope: 'project', id: 'hook-a', expectedRevision: 'revision-1', projectId: 'project-a', enabled: true })
    expect(reviewText()).toContain('write_file'); expect(reviewText()).toContain('"strict"')
    expect(view.find(node => node.props['data-hook-id'] === 'hook-a').props['data-hook-status']).toBe('enabled')
  })

  it('locks duplicate saves and navigation while the write is pending and stops stale updates after unmount', async () => {
    const view = setup(); await drain(); await view.click('新建 Hook'); await view.input('Hook 名称', 'new'); await view.input('Hook 命令', 'node')
    let resolve!: (value: unknown) => void; host.api.hooks.save.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = view.click('保存 Hook'); await drain(); await view.click('保存 Hook'); expect(host.api.hooks.save).toHaveBeenCalledOnce(); expect(await host.leave?.()).toBe(false)
    expect(view.find(node => node.props['aria-label'] === 'Hook 作用范围').props.disabled).toBe(true)
    mounted.splice(0).forEach(app => app.unmount()); resolve(hook()); await pending
    expect(view.renderer.root.children).toHaveLength(0)
  })

  it('reports corrupt configuration without fake rows and can retry loading', async () => {
    host.api.hooks.list.mockRejectedValueOnce(new Error('Hook 配置文件损坏或无效，请修复后重试；原文件未被覆盖'))
    const view = setup(); await drain(); expect(view.text()).toContain('原文件未被覆盖'); expect(view.renderer.all().some(node => node.props['data-hook-id'])).toBe(false)
    await view.click('重试加载 Hooks'); expect(view.find(node => node.props['data-hook-id'] === 'hook-a')).toBeTruthy()
  })

  it('does not query an unregistered route project and permits recovery to global scope', async () => {
    host.route.query = { project: 'missing-project' }; const view = setup(); await drain(); expect(host.api.hooks.list).not.toHaveBeenCalled(); expect(view.text()).toContain('项目不可用')
    await view.change('Hook 作用范围', 'global'); expect(host.api.hooks.list).toHaveBeenCalledExactlyOnceWith({})
  })

  it('retries a failed project registry read and handles a missing desktop API', async () => {
    host.api.listHarnessProjects.mockRejectedValueOnce(new Error('unexpected-private-path')); const view = setup(); await drain(); expect(view.text()).not.toContain('unexpected-private-path')
    await view.click('重试加载 Hooks'); expect(view.text()).toContain('检查文件')
    host.api = undefined; const missing = setup(); await drain(); expect(missing.text()).toContain('桌面 Hook 服务不可用')
  })
})
