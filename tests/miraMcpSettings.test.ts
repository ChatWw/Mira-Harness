import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import Page from '../src/pages/backend/mcpConfig/index.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'

const host = vi.hoisted(() => ({ api: undefined as any, confirm: vi.fn(async () => undefined), leave: undefined as undefined | (() => Promise<boolean>) }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: (guard: () => Promise<boolean>) => { host.leave = guard } }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: host.confirm } }))
vi.mock('../src/pages/backend/mcpConfig/ExternalMcpImportDialog.vue', async importOriginal => {
  const { withVueClientRender } = await import('./helpers/vueNodeRenderer')
  const module = await importOriginal<{ default: import('vue').Component }>()
  return { default: withVueClientRender(module.default, new URL('../src/pages/backend/mcpConfig/ExternalMcpImportDialog.vue', import.meta.url)) }
})
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('main', slots.default?.()) } }))
const ActualPage = withVueClientRender(Page, new URL('../src/pages/backend/mcpConfig/index.vue', import.meta.url))
const passthrough = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const components = Object.fromEntries(['ElSelect', 'ElOption', 'ElButton', 'ElSwitch', 'ElTag', 'ElForm', 'ElFormItem', 'ElInput', 'ElSkeleton', 'AppIcon'].map(name => [name, passthrough(name)]))
Object.assign(components, { ElDropdown: defineComponent({ setup: (_, { attrs, slots }) => () => h('ElDropdown', attrs, [slots.default?.(), slots.dropdown?.()]) }), ElDropdownMenu: passthrough('ElDropdownMenu'), ElDropdownItem: passthrough('ElDropdownItem'), ElDialog: defineComponent({ props: ['modelValue'], setup: (props, { slots }) => () => props.modelValue ? h('dialog', [slots.header?.(), slots.default?.(), slots.footer?.()]) : null }) })
const mounted: Array<{ unmount(): void }> = []
const server = (patch: Record<string, unknown> = {}) => ({ id: 'mcp-a', name: 'local-files', command: 'npx', args: ['-y', 'server', '/space path'], enabled: true, createdAt: '2026-10-12', updatedAt: '2026-10-12', connection: { state: 'connected', toolCount: 2 }, ...patch })
async function drain() { for (let index = 0; index < 10; index++) { await Promise.resolve(); await nextTick() } }
function setup(props: Record<string, unknown> = {}) {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(ActualPage, props, components); mounted.push(app)
  const find = (predicate: (node: VueTestNode) => boolean) => { const value = renderer.all().find(predicate); if (!value) throw new Error('Missing MCP settings control'); return value }
  const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
  const click = async (label: string) => { await (find(node => ['ElButton', 'button'].includes(node.type) && (node.props['aria-label'] === label || text(node) === label)).props.onClick as (event: unknown) => Promise<void>)({ type: 'click' }); await drain() }
  const change = async (label: string, value: unknown) => { await (find(node => node.props['aria-label'] === label).props['onUpdate:modelValue'] as (value: unknown) => void | Promise<void>)(value); await drain() }
  return { renderer, click, change, find, text: () => text(renderer.root) }
}
beforeEach(() => {
  host.confirm.mockReset(); host.confirm.mockResolvedValue(undefined)
  host.api = {
    listHarnessProjects: vi.fn(async () => [{ id: 'project-a', name: 'Mira 写作', directory: '/projects/mira-writing', directoryExists: true }, { id: 'missing-project', name: '已移走项目', directory: '/missing', directoryExists: false }]),
    listMcpServers: vi.fn(async () => [server()]),
    saveMcpServer: vi.fn(async (payload: any) => server({ ...payload, id: payload.id || 'new-mcp' })),
    deleteMcpServer: vi.fn(async () => undefined), reconnectMcpServer: vi.fn(async () => ({ state: 'connected', toolCount: 4 })),
    discoverExternalMcpServers: vi.fn(async () => [{ id: 'codex', name: 'Codex CLI', path: 'C:/fixture/.codex/config.toml', servers: [{ id: 'docs', name: 'docs', type: 'stdio', importable: true }, { id: 'exists', name: 'local-files', importable: false, reason: '已存在同名服务器' }] }]),
    importExternalMcpServers: vi.fn(async () => [{ id: 'docs', name: 'docs', status: 'imported' }]),
  }
})
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); vi.useRealTimers() })

describe('external MCP discovery and import UI', () => {
  it('offers create and import in the empty state and opens the same dialog from the overflow menu', async () => {
    host.api.listMcpServers.mockResolvedValue([])
    const view = setup({ embedded: true }); await drain()
    expect(view.text()).toContain('尚未安装 MCP 服务器'); expect(view.text()).toContain('手动新建服务器，或导入已有配置。')
    await view.click('新建 MCP 服务器'); expect(view.text()).toContain('保存后返回列表'); await view.click('取消 MCP 编辑')
    await view.click('导入外部 MCP 服务器'); expect(view.text()).toContain('导入外部 Agent MCP 服务器'); expect(view.text()).toContain('Codex CLI')
    expect(view.text()).not.toContain('作用域'); expect(view.text()).not.toContain('导入到项目')
    await view.click('关闭 MCP 导入')
    await (view.find(node => node.type === 'ElDropdown').props.onCommand as () => Promise<void>)(); await drain()
    expect(host.api.discoverExternalMcpServers).toHaveBeenCalledTimes(2)
  })

  it('selects only importable servers, shows source detail, preserves failed selection, and reloads after importing', async () => {
    host.api.listMcpServers.mockResolvedValue([])
    const view = setup(); await drain(); await view.click('导入外部 MCP 服务器')
    expect(view.find(node => node.type === 'button' && node.children.some(child => child.text === '导入到全局')).props.disabled).toBe(true)
    await view.click('展开 Codex CLI')
    expect(view.find(node => node.props['aria-label'] === '导入 Codex CLI / local-files').props.disabled).toBe(true)
    ;(view.find(node => node.props['aria-label'] === '全选外部 MCP 服务器').props.onChange as Function)({ target: { checked: true } }); await drain()
    expect(view.text()).toContain('已选 1/1')
    host.api.importExternalMcpServers.mockRejectedValueOnce(new Error('native secret'))
    await view.click('导入到全局'); expect(view.text()).toContain('选择已保留'); expect(view.text()).not.toContain('native secret')
    expect(host.api.importExternalMcpServers).toHaveBeenCalledExactlyOnceWith(['docs'])
    host.api.listMcpServers.mockResolvedValue([server({ name: 'docs' })])
    await view.click('导入到全局'); expect(view.text()).toContain('1 个已导入'); expect(host.api.listMcpServers).toHaveBeenCalledTimes(2)
    await view.click('完成'); expect(view.text()).toContain('docs'); expect(view.text()).not.toContain('导入完成')
  })

  it('refreshes after discovery failure, reports no sources, and resets previous selections', async () => {
    host.api.listMcpServers.mockResolvedValue([]); host.api.discoverExternalMcpServers.mockRejectedValueOnce(new Error('private path'))
    const view = setup(); await drain(); await view.click('导入外部 MCP 服务器')
    expect(view.text()).toContain('读取外部 MCP 配置失败'); expect(view.text()).not.toContain('private path')
    await view.click('刷新外部 MCP 来源'); expect(view.text()).toContain('Codex CLI')
    host.api.discoverExternalMcpServers.mockResolvedValue([])
    await view.click('刷新外部 MCP 来源'); expect(view.text()).toContain('未发现可导入的 MCP 服务器')
  })

  it('prevents duplicate imports and disables close and refresh while the host is writing', async () => {
    host.api.listMcpServers.mockResolvedValue([])
    const view = setup(); await drain(); await view.click('导入外部 MCP 服务器')
    ;(view.find(node => node.props['aria-label'] === '全选外部 MCP 服务器').props.onChange as Function)({ target: { checked: true } }); await drain()
    let finish!: (value: unknown) => void
    host.api.importExternalMcpServers.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = view.click('导入到全局'); await drain(); await view.click('导入到全局')
    expect(host.api.importExternalMcpServers).toHaveBeenCalledOnce()
    expect(view.find(node => node.props['aria-label'] === '关闭 MCP 导入').props.disabled).toBe(true)
    expect(view.find(node => node.props['aria-label'] === '刷新外部 MCP 来源').props.disabled).toBe(true)
    finish([{ id: 'docs', name: 'docs', status: 'skipped', message: '同名配置已保留' }, { id: 'missing', name: 'missing', status: 'failed', message: '来源已失效' }]); await pending
    expect(view.text()).toContain('1 个已跳过，1 个失败'); expect(view.text()).toContain('同名配置已保留'); expect(view.text()).toContain('来源已失效')
  })

  it('ignores a discovery result delivered after closing and reopening the dialog', async () => {
    host.api.listMcpServers.mockResolvedValue([])
    let finish!: (value: unknown) => void
    host.api.discoverExternalMcpServers.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const view = setup(); await drain(); await view.click('导入外部 MCP 服务器'); await view.click('关闭 MCP 导入')
    await view.click('导入外部 MCP 服务器'); expect(view.text()).toContain('Codex CLI')
    finish([{ id: 'stale', name: '迟到的来源', path: 'fixture', servers: [] }]); await drain()
    expect(view.text()).not.toContain('迟到的来源'); expect(view.text()).toContain('Codex CLI')
  })
})

describe('MCP secondary editor page', () => {
  it('opens editing as a secondary page, reports its breadcrumb, hides list actions, and cancels back to the list', async () => {
    const onEditorChange = vi.fn(), view = setup({ embedded: true, onEditorChange }); await drain(); await view.click('编辑 local-files')
    expect(onEditorChange).toHaveBeenLastCalledWith('local-files')
    expect(view.text()).toContain('编辑 MCP 服务器'); expect(view.text()).toContain('表单JSON')
    expect(view.renderer.all().filter(node => node.props['aria-label'] === 'MCP 服务器名称')).toHaveLength(1)
    expect(view.renderer.all().some(node => node.props['data-mcp-id'] || ['刷新 MCP 服务器', '更多 MCP 操作', '添加 MCP 服务器'].includes(String(node.props['aria-label'])))).toBe(false)
    await view.click('JSON')
    expect(JSON.parse(view.find(node => node.props['aria-label'] === 'MCP 完整配置 JSON').props.modelValue as string)).toMatchObject({ 'local-files': { command: 'npx', args: ['-y', 'server', '/space path'] } })
    await view.click('取消 MCP 编辑')
    expect(onEditorChange).toHaveBeenLastCalledWith(''); expect(view.find(node => node.props['data-mcp-id'] === 'mcp-a')).toBeTruthy()
    expect(host.confirm).not.toHaveBeenCalled(); expect(host.api.saveMcpServer).not.toHaveBeenCalled()
  })

  it('edits existing JSON without creating another server and preserves invalid JSON when navigation is rejected', async () => {
    const view = setup(); await drain(); await view.click('编辑 local-files'); await view.click('JSON')
    await view.change('MCP 完整配置 JSON', '{invalid')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    await view.click('表单'); expect(view.find(node => node.props['aria-label'] === 'MCP 完整配置 JSON').props.modelValue).toBe('{invalid')
    await view.change('MCP 完整配置 JSON', JSON.stringify({ renamed: { type: 'stdio', command: 'node', args: ['space path'], enabled: false } }))
    await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledExactlyOnceWith({ id: 'mcp-a', name: 'renamed', type: 'stdio', command: 'node', args: ['space path'], env: {}, enabled: false })
    expect(view.renderer.all().filter(node => node.props['data-mcp-id'])).toHaveLength(1)
    expect(view.find(node => node.props['data-mcp-id'] === 'mcp-a')).toBeTruthy(); expect(view.text()).toContain('服务器配置已保存')
  })

  it('replaces the list with a compact form, reports its state to the tools page, and cancels without saving', async () => {
    const onEditorChange = vi.fn(), view = setup({ embedded: true, onEditorChange }); await drain()
    expect(view.renderer.all().some(node => ['MCP 配置范围', '新建 MCP 作用域'].includes(String(node.props['aria-label'])))).toBe(false)
    expect(host.api.listHarnessProjects).not.toHaveBeenCalled()
    const refresh = view.find(node => node.props['aria-label'] === '刷新 MCP 服务器')
    expect(refresh.children.some(node => node.type === 'AppIcon' && node.props.name === 'lucide:refresh-cw')).toBe(true)
    expect(refresh.children.some(node => node.text === '刷新')).toBe(false)
    await view.click('添加 MCP 服务器')
    expect(onEditorChange).toHaveBeenLastCalledWith('新建 MCP 服务器')
    expect(view.text()).toContain('新建 MCP 服务器'); expect(view.text()).toContain('保存后返回列表')
    expect(view.text()).not.toContain('作用域')
    expect(view.renderer.all().some(node => node.props.class === 'mcp-editor__scope')).toBe(false)
    expect(view.renderer.all().some(node => node.props['data-mcp-id'] || node.props['aria-label'] === '添加 MCP 服务器' || node.props['aria-label'] === 'MCP 配置范围' || node.type === 'ScopeSelect')).toBe(false)
    expect(view.renderer.all().some(node => node.props['aria-label'] === 'MCP 环境变量 JSON')).toBe(false)
    expect(view.find(node => node.props['aria-label'] === '保存 MCP 服务器').props.disabled).toBe(true)
    await view.click('取消 MCP 编辑')
    expect(onEditorChange).toHaveBeenLastCalledWith(''); expect(view.text()).toContain('local-files')
    expect(host.confirm).not.toHaveBeenCalled(); expect(host.api.saveMcpServer).not.toHaveBeenCalled()
  })

  it('round trips form and JSON with atomic arguments, optional environment, and enabled state intact', async () => {
    const view = setup(); await drain(); await view.click('添加 MCP 服务器')
    await view.change('MCP 服务器名称', 'docs'); await view.change('MCP 启动命令', 'node'); await view.change('MCP 启动参数', 'server.js\n/space path')
    await view.click('环境变量（可选）'); await view.change('MCP 环境变量 JSON', '{"MODE":"development"}'); await view.change('启用 MCP 服务器', false)
    await view.click('JSON')
    expect(view.text()).not.toContain('作用域')
    expect(JSON.parse(view.find(node => node.props['aria-label'] === 'MCP 完整配置 JSON').props.modelValue as string)).toEqual({ docs: { type: 'stdio', command: 'node', args: ['server.js', '/space path'], env: { MODE: 'development' }, enabled: false } })
    await view.click('表单')
    expect(view.find(node => node.props['aria-label'] === 'MCP 启动参数').props.modelValue).toBe('server.js\n/space path')
    expect(view.find(node => node.props['aria-label'] === 'MCP 环境变量 JSON').props.modelValue).toBe('{\n  "MODE": "development"\n}')
    await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledExactlyOnceWith({ name: 'docs', type: 'stdio', command: 'node', args: ['server.js', '/space path'], env: { MODE: 'development' }, enabled: false })
  })

  it('accepts the named mcpServers JSON envelope, retains failed credentials for retry, and saves globally', async () => {
    const view = setup(); await drain(); await view.click('添加 MCP 服务器'); await view.click('JSON')
    await view.change('MCP 完整配置 JSON', JSON.stringify({ mcpServers: { remote: { type: 'http', url: 'https://example.test/mcp', headers: { Authorization: 'Bearer secret' }, authentication: 'oauth' } } }))
    host.api.saveMcpServer.mockRejectedValueOnce(new Error('无法保存 Bearer secret'))
    await view.click('保存 MCP 服务器')
    expect(view.text()).not.toContain('Bearer secret'); expect(view.text()).toContain('编辑内容已保留')
    expect(view.find(node => node.props['aria-label'] === 'MCP 完整配置 JSON').props.modelValue).toContain('Bearer secret')
    await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenLastCalledWith({ name: 'remote', type: 'streamableHttp', command: '', args: [], url: 'https://example.test/mcp', headers: { Authorization: 'Bearer secret' }, authentication: 'oauth', enabled: true })
    expect(view.text()).toContain('服务器配置已保存')
  })

  it.each(['{invalid', '{"mcpServers":[]}', '{"a":{},"b":{}}', '{"docs":{"command":"node","timeoutMs":30000}}', '{"docs":{"command":"node","args":[7]}}'])('keeps invalid or unsupported JSON editable without silently saving or discarding: %s', async draft => {
    const view = setup(); await drain(); await view.click('添加 MCP 服务器'); await view.click('JSON'); await view.change('MCP 完整配置 JSON', draft)
    expect(view.find(node => node.props['aria-label'] === '保存 MCP 服务器').props.disabled).toBe(true)
    await view.click('表单')
    expect(view.find(node => node.props['aria-label'] === 'MCP 完整配置 JSON').props.modelValue).toBe(draft)
    expect(view.renderer.all().some(node => node.props.role === 'alert')).toBe(true)
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('取消 MCP 编辑')
    expect(view.find(node => node.props['aria-label'] === 'MCP 完整配置 JSON').props.modelValue).toBe(draft)
    expect(host.api.saveMcpServer).not.toHaveBeenCalled()
  })
})

describe('real MCP settings transport forms and connection list', () => {
  it('opens OAuth globally, retains retry on failure, and polls the callback without erasing a draft', async () => {
    vi.useFakeTimers()
    const pending = { state: 'authorization-required', toolCount: 0, authorization: { startedAt: Date.now(), expiresAt: Date.now() + 300000 } }
    const remote = server({ authentication: 'oauth', type: 'streamableHttp', url: 'https://example.test/mcp', connection: pending })
    host.api.listMcpServers.mockResolvedValue([remote])
    host.api.authorizeMcpServer = vi.fn().mockRejectedValueOnce(new Error('MCP 授权浏览器无法打开，请重试')).mockResolvedValueOnce(pending)
    const view = setup(); await drain()
    await view.click('打开授权 local-files'); expect(view.text()).toContain('打开授权失败')
    await view.click('打开授权 local-files')
    expect(host.api.authorizeMcpServer).toHaveBeenLastCalledWith('mcp-a')
    await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'unsaved OAuth name')
    host.api.listMcpServers.mockResolvedValue([server({ ...remote, connection: { state: 'connected', toolCount: 0 } })])
    await vi.advanceTimersByTimeAsync(1000); await drain()
    expect(view.renderer.all().some(node => node.props['data-mcp-id'])).toBe(false)
    expect(view.text()).toContain('MCP 已授权，可回到工作台选择服务'); expect(view.text()).not.toContain('请完成授权后返回')
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('unsaved OAuth name')
    expect(view.renderer.all().some(node => node.props['aria-label'] === '打开授权 local-files')).toBe(false)
    const reads = host.api.listMcpServers.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000); expect(host.api.listMcpServers).toHaveBeenCalledTimes(reads)
  })

  it('saves the selected OAuth strategy and restores it when editing', async () => {
    const view = setup(); await drain(); await view.click('编辑 local-files')
    await view.change('MCP 传输协议', 'sse'); await view.change('MCP 服务 URL', 'https://example.test/sse'); await view.change('MCP 认证方式', 'oauth')
    await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledWith(expect.objectContaining({ authentication: 'oauth', type: 'sse', url: 'https://example.test/sse', headers: {} }))
    await view.click('编辑 local-files'); expect(view.find(node => node.props['aria-label'] === 'MCP 认证方式').props.modelValue).toBe('oauth')
  })
  it('creates stdio with atomic arguments, environment and enabled state', async () => {
    const view = setup(); await drain(); await view.click('添加 MCP 服务器')
    await view.click('环境变量（可选）')
    await view.change('MCP 服务器名称', ' docs '); await view.change('MCP 启动命令', ' node ')
    await view.change('MCP 启动参数', 'server.js\n/space path\n\n'); await view.change('MCP 环境变量 JSON', '{"MODE":"development"}'); await view.change('启用 MCP 服务器', false)
    await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledExactlyOnceWith({ name: 'docs', type: 'stdio', command: 'node', args: ['server.js', '/space path'], env: { MODE: 'development' }, enabled: false })
    expect(host.api.listMcpServers).toHaveBeenCalledOnce(); expect(view.text()).toContain('服务器配置已保存'); expect(view.text()).toContain('已停用')
  })

  it.each(['streamableHttp', 'sse'])('saves %s with URL and headers, without stale local-only fields', async type => {
    const view = setup(); await drain(); await view.click('编辑 local-files')
    await view.click('环境变量（可选）'); await view.change('MCP 环境变量 JSON', '{"LOCAL":"value"}'); await view.change('MCP 传输协议', type)
    await view.change('MCP 服务 URL', 'https://example.test/mcp'); await view.change('MCP 请求头 JSON', '{"Authorization":"Bearer private-value"}')
    await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledExactlyOnceWith({ id: 'mcp-a', name: 'local-files', type, command: '', args: [], enabled: true, url: 'https://example.test/mcp', authentication: 'headers', headers: { Authorization: 'Bearer private-value' } })
    expect(view.text()).not.toContain('private-value'); expect(view.text()).not.toContain('LOCAL')
  })

  it('preserves both protocol drafts while switching and sends only the active fields', async () => {
    const view = setup(); await drain(); await view.click('编辑 local-files')
    await view.click('环境变量（可选）'); await view.change('MCP 环境变量 JSON', '{"MODE":"test"}'); await view.change('MCP 传输协议', 'streamableHttp')
    await view.change('MCP 服务 URL', 'https://example.test/mcp'); await view.change('MCP 请求头 JSON', '{"X-Token":"secret"}')
    await view.change('MCP 传输协议', 'stdio')
    expect(view.find(node => node.props['aria-label'] === 'MCP 启动参数').props.modelValue).toBe('-y\nserver\n/space path')
    expect(view.find(node => node.props['aria-label'] === 'MCP 环境变量 JSON').props.modelValue).toBe('{"MODE":"test"}')
    await view.change('MCP 传输协议', 'sse')
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务 URL').props.modelValue).toBe('https://example.test/mcp')
    await view.change('MCP 传输协议', 'stdio'); await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer.mock.calls[0][0]).not.toHaveProperty('url'); expect(host.api.saveMcpServer.mock.calls[0][0]).not.toHaveProperty('headers')
  })

  it('rejects incomplete, non-HTTP and invalid JSON drafts without losing them', async () => {
    const view = setup(); await drain(); await view.click('添加 MCP 服务器'); await view.click('保存 MCP 服务器')
    expect(view.text()).toContain('请填写服务器名称')
    await view.change('MCP 服务器名称', 'remote'); await view.change('MCP 传输协议', 'sse'); await view.change('MCP 服务 URL', 'file:///tmp/server')
    await view.click('保存 MCP 服务器'); expect(view.text()).toContain('仅支持 HTTP 或 HTTPS')
    await view.change('MCP 服务 URL', 'https://user:pass@example.test/mcp'); await view.click('保存 MCP 服务器'); expect(view.text()).toContain('请通过请求头配置凭据')
    await view.change('MCP 服务 URL', 'https://example.test/mcp'); await view.click('请求头（可选）'); await view.change('MCP 请求头 JSON', '{"Authorization":7}')
    await view.click('保存 MCP 服务器'); expect(view.text()).toContain('键值均为字符串'); expect(host.api.saveMcpServer).not.toHaveBeenCalled()
    expect(view.find(node => node.props['aria-label'] === 'MCP 请求头 JSON').props.modelValue).toBe('{"Authorization":7}')
  })

  it('prevents duplicate submits and retains failed remote draft with redacted inline error for retry', async () => {
    const view = setup(); await drain(); await view.click('添加 MCP 服务器'); await view.change('MCP 服务器名称', 'remote'); await view.change('MCP 传输协议', 'streamableHttp')
    await view.change('MCP 服务 URL', 'https://example.test/mcp?token=url-secret'); await view.click('请求头（可选）'); await view.change('MCP 请求头 JSON', '{"Authorization":"Bearer secret-value"}')
    let reject!: (error: Error) => void
    host.api.saveMcpServer.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure }))
    const pending = view.click('保存 MCP 服务器'); await drain(); await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledOnce(); expect(view.find(node => node.props['aria-label'] === '保存 MCP 服务器').props.disabled).toBe(true)
    reject(new Error("Error invoking remote method 'platform:save-mcp-server': Error: 无法写入 Bearer secret-value https://example.test/mcp?token=url-secret")); await pending
    expect(view.text()).toContain('编辑内容已保留'); expect(view.text()).not.toContain('secret-value'); expect(view.text()).not.toContain('url-secret'); expect(view.text()).not.toContain('Error invoking remote method')
    expect(view.find(node => node.props['aria-label'] === 'MCP 请求头 JSON').props.modelValue).toBe('{"Authorization":"Bearer secret-value"}')
    await view.click('保存 MCP 服务器'); expect(host.api.saveMcpServer).toHaveBeenCalledTimes(2)
  })

  it('reports load failure locally and retry preserves unsaved editor', async () => {
    host.api.listMcpServers.mockRejectedValueOnce(new Error('配置读取失败'))
    const view = setup(); await drain(); expect(view.text()).toContain('加载失败：配置读取失败')
    await view.click('添加 MCP 服务器'); await view.change('MCP 服务器名称', 'draft-name')
    await view.click('重试加载 MCP 服务器')
    expect(view.text()).not.toContain('local-files'); expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('draft-name')
    await view.click('取消 MCP 编辑'); expect(view.text()).toContain('local-files')
  })

  it('ignores a stale refresh after successful save and retains a newly opened editing draft', async () => {
    const view = setup(); await drain()
    let resolve!: (value: unknown) => void
    host.api.listMcpServers.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = view.click('刷新 MCP 服务器'); await drain(); await view.click('添加 MCP 服务器'); await view.change('MCP 服务器名称', 'new'); await view.change('MCP 启动命令', 'node'); await view.click('保存 MCP 服务器'); await view.click('编辑 new'); await view.change('MCP 服务器名称', 'new unsaved')
    resolve([server()]); await pending
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('new unsaved')
    await view.click('取消 MCP 编辑'); expect(view.find(node => node.props['data-mcp-id'] === 'new-mcp')).toBeTruthy()
  })

  it('uses actual connection state and tool count, reconnects one row and preserves deletion failures', async () => {
    host.api.listMcpServers.mockResolvedValue([server({ type: 'streamableHttp', command: '', args: [], url: 'https://user:pass@example.test/mcp?token=hidden', headers: { Authorization: 'stored-secret' }, connection: { state: 'failed', toolCount: 0, error: '401 stored-secret' } }), server({ id: 'mcp-b', name: 'disabled', enabled: false })])
    const view = setup(); await drain(); expect(view.text()).toContain('连接失败'); expect(view.text()).not.toContain('stored-secret'); expect(view.text()).not.toContain('pass'); expect(view.text()).not.toContain('token=hidden')
    expect(view.find(node => node.props['aria-label'] === '重新连接 disabled').props.disabled).toBe(true)
    await view.click('重新连接 local-files'); expect(host.api.reconnectMcpServer).toHaveBeenCalledExactlyOnceWith('mcp-a')
    expect(view.find(node => node.props['data-mcp-id'] === 'mcp-a').props['data-mcp-status']).toBe('connected'); expect(view.text()).toContain('4 个工具')
    host.api.deleteMcpServer.mockRejectedValueOnce(new Error('暂时无法删除')); await view.click('删除 local-files'); expect(view.text()).toContain('删除失败：暂时无法删除')
    expect(view.find(node => node.props['data-mcp-id'] === 'mcp-a')).toBeTruthy(); await view.click('删除 local-files'); expect(host.api.deleteMcpServer).toHaveBeenCalledTimes(2)
  })

  it('keeps reconnect failure local and guards dirty draft cancellation and navigation', async () => {
    const view = setup(); await drain()
    host.api.reconnectMcpServer.mockRejectedValueOnce(new Error('连接超时')); await view.click('重新连接 local-files'); expect(view.text()).toContain('重新连接失败：连接超时')
    await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'draft')
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('draft')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('取消 MCP 编辑'); expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称')).toBeTruthy()
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    await view.click('取消 MCP 编辑'); await view.click('重新连接 local-files'); expect(view.text()).not.toContain('重新连接失败'); expect(await host.leave?.()).toBe(true)
  })

  it.each(['stdio', 'streamableHttp'])('explicitly clears stored %s credentials when the optional field is emptied', async type => {
    host.api.listMcpServers.mockResolvedValue([server({ type, url: 'https://example.test/mcp', env: { MODE: 'secret' }, headers: { Authorization: 'secret' } })])
    const view = setup(); await drain(); await view.click('编辑 local-files'); await view.change(type === 'stdio' ? 'MCP 环境变量 JSON' : 'MCP 请求头 JSON', '')
    await view.click('保存 MCP 服务器'); expect(host.api.saveMcpServer.mock.calls[0][0][type === 'stdio' ? 'env' : 'headers']).toEqual({})
  })

  it('hides deletion while editing and preserves a dirty draft when discarding is rejected', async () => {
    const view = setup(); await drain(); await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'dirty draft')
    expect(view.renderer.all().some(node => node.props['aria-label'] === '删除 local-files')).toBe(false)
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('取消 MCP 编辑')
    expect(host.api.deleteMcpServer).not.toHaveBeenCalled(); expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('dirty draft')
  })

  it('refreshes actual connecting status on a one-second bounded timer without resetting the editor and stops when stable or unmounted', async () => {
    vi.useFakeTimers(); host.api.listMcpServers.mockResolvedValueOnce([server({ connection: { state: 'connecting', toolCount: 0 } })])
    const view = setup(); await drain(); await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'draft')
    await vi.advanceTimersByTimeAsync(1000); await drain()
    expect(host.api.listMcpServers).toHaveBeenCalledTimes(2); expect(view.renderer.all().some(node => node.props['data-mcp-id'])).toBe(false)
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('draft')
    await vi.advanceTimersByTimeAsync(3000); expect(host.api.listMcpServers).toHaveBeenCalledTimes(2)
    await view.click('取消 MCP 编辑'); expect(view.find(node => node.props['data-mcp-id'] === 'mcp-a').props['data-mcp-status']).toBe('connected')
    host.api.reconnectMcpServer.mockResolvedValueOnce({ state: 'connecting', toolCount: 0 }); await view.click('重新连接 local-files')
    mounted.splice(0).forEach(app => app.unmount()); await vi.advanceTimersByTimeAsync(1000); expect(host.api.listMcpServers).toHaveBeenCalledTimes(2)
  })
})
