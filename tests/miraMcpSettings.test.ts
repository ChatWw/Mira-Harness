import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import Page from '../src/pages/backend/mcpConfig/index.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'

const host = vi.hoisted(() => ({ api: undefined as any, confirm: vi.fn(async () => undefined), leave: undefined as undefined | (() => Promise<boolean>) }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: (guard: () => Promise<boolean>) => { host.leave = guard } }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: host.confirm } }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('main', slots.default?.()) } }))
const ActualPage = withVueClientRender(Page, new URL('../src/pages/backend/mcpConfig/index.vue', import.meta.url))
const passthrough = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const components = Object.fromEntries(['ElSelect', 'ElOption', 'ElButton', 'ElSwitch', 'ElTag', 'ElForm', 'ElFormItem', 'ElInput', 'ElSkeleton', 'AppIcon'].map(name => [name, passthrough(name)]))
const mounted: Array<{ unmount(): void }> = []
const server = (patch: Record<string, unknown> = {}) => ({ id: 'mcp-a', name: 'local-files', command: 'npx', args: ['-y', 'server', '/space path'], enabled: true, createdAt: '2026-10-12', updatedAt: '2026-10-12', connection: { state: 'connected', toolCount: 2 }, ...patch })
async function drain() { for (let index = 0; index < 10; index++) { await Promise.resolve(); await nextTick() } }
function setup() {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(ActualPage, {}, components); mounted.push(app)
  const find = (predicate: (node: VueTestNode) => boolean) => { const value = renderer.all().find(predicate); if (!value) throw new Error('Missing MCP settings control'); return value }
  const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
  const click = async (label: string) => { await (find(node => node.type === 'ElButton' && node.props['aria-label'] === label).props.onClick as (event: unknown) => Promise<void>)({ type: 'click' }); await drain() }
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
  }
})
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); vi.useRealTimers() })

describe('real MCP settings transport forms and connection list', () => {
  it.each(['global', 'project-a'])('opens OAuth in the captured %s scope, retains retry on failure, and polls the callback without erasing a draft', async scope => {
    vi.useFakeTimers()
    const pending = { state: 'authorization-required', toolCount: 0, authorization: { startedAt: Date.now(), expiresAt: Date.now() + 300000 } }
    const remote = server({ authentication: 'oauth', type: 'streamableHttp', url: 'https://example.test/mcp', connection: pending })
    host.api.listMcpServers.mockResolvedValue([remote])
    host.api.authorizeMcpServer = vi.fn().mockRejectedValueOnce(new Error('MCP 授权浏览器无法打开，请重试')).mockResolvedValueOnce(pending)
    const view = setup(); await drain()
    if (scope !== 'global') await view.change('MCP 配置范围', scope)
    await view.click('打开授权 local-files'); expect(view.text()).toContain('打开授权失败')
    await view.click('打开授权 local-files')
    expect(host.api.authorizeMcpServer).toHaveBeenLastCalledWith('mcp-a', scope === 'global' ? undefined : { projectId: scope })
    await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'unsaved OAuth name')
    host.api.listMcpServers.mockResolvedValue([server({ ...remote, connection: { state: scope === 'global' ? 'connected' : 'authorized', toolCount: 0 } })])
    await vi.advanceTimersByTimeAsync(1000); await drain()
    expect(view.text()).toContain(scope === 'global' ? '已连接' : '已授权 · 任务启动时连接')
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
  it('loads registered project metadata separately and scopes project CRUD without global reconnect', async () => {
    const view = setup(); await drain()
    expect(host.api.listMcpServers).toHaveBeenCalledExactlyOnceWith()
    expect(view.find(node => node.props.value === 'missing-project').props.disabled).toBe(true)
    host.api.listMcpServers.mockResolvedValue([server({ id: 'project-mcp', name: 'project-files', scope: 'project', connection: { state: 'disconnected', toolCount: 0 } })])
    await view.change('MCP 配置范围', 'project-a')
    expect(host.api.listMcpServers).toHaveBeenLastCalledWith({ projectId: 'project-a' })
    expect(view.text()).toContain('/projects/mira-writing/.mira/mcp.json')
    expect(view.text()).toContain('仅此项目的任务可用，任务启动时连接')
    expect(view.renderer.all().some(node => node.props['aria-label'] === '重新连接 project-files')).toBe(false)
    await view.click('编辑 project-files'); await view.change('MCP 服务器名称', 'project docs'); await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'project-mcp', name: 'project docs' }), { projectId: 'project-a' })
    await view.click('删除 project docs')
    expect(host.api.deleteMcpServer).toHaveBeenCalledExactlyOnceWith('project-mcp', { projectId: 'project-a' })
    expect(host.api.reconnectMcpServer).not.toHaveBeenCalled()
  })

  it('retains the old scope and unsaved draft when project-switch discard is rejected', async () => {
    const view = setup(); await drain(); await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'unsaved global')
    host.confirm.mockRejectedValueOnce(new Error('cancel'))
    await view.change('MCP 配置范围', 'project-a')
    expect(view.find(node => node.props['aria-label'] === 'MCP 配置范围').props['model-value']).toBe('global')
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('unsaved global')
    expect(host.api.listMcpServers).toHaveBeenCalledOnce()
    await view.change('MCP 配置范围', 'project-a')
    expect(view.find(node => node.props['aria-label'] === 'MCP 配置范围').props['model-value']).toBe('project-a')
    expect(view.renderer.all().some(node => node.props['aria-label'] === 'MCP 服务器名称')).toBe(false)
  })

  it('ignores a late global refresh after changing scope and a late project load after returning global', async () => {
    const view = setup(); await drain()
    let globalReply!: (value: unknown) => void
    host.api.listMcpServers.mockImplementationOnce(() => new Promise(resolve => { globalReply = resolve }))
    const refresh = view.click('刷新 MCP 服务器'); await drain()
    host.api.listMcpServers.mockResolvedValueOnce([server({ id: 'project-mcp', name: 'project-only' })])
    await view.change('MCP 配置范围', 'project-a')
    globalReply([server({ id: 'late-global', name: 'late-global' })]); await refresh
    expect(view.text()).toContain('project-only'); expect(view.text()).not.toContain('late-global')
    await view.change('MCP 配置范围', 'global')
    let projectReply!: (value: unknown) => void
    host.api.listMcpServers.mockImplementationOnce(() => new Promise(resolve => { projectReply = resolve }))
    await view.change('MCP 配置范围', 'project-a')
    host.api.listMcpServers.mockResolvedValueOnce([server({ name: 'current-global' })])
    await view.change('MCP 配置范围', 'global')
    projectReply([server({ name: 'late-project' })]); await drain()
    expect(view.text()).toContain('current-global'); expect(view.text()).not.toContain('late-project')
    expect(view.find(node => node.props['aria-label'] === 'MCP 配置范围').props['model-value']).toBe('global')
  })

  it('keeps a failed project draft and retries in its captured project scope', async () => {
    const view = setup(); await drain(); await view.change('MCP 配置范围', 'project-a')
    await view.click('添加 MCP 服务器'); await view.change('MCP 服务器名称', 'project draft'); await view.change('MCP 启动命令', 'node')
    host.api.saveMcpServer.mockRejectedValueOnce(new Error('项目配置暂时不可写'))
    await view.click('保存 MCP 服务器')
    expect(view.text()).toContain('编辑内容已保留')
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('project draft')
    await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer.mock.calls.map((call: unknown[]) => call[1])).toEqual([{ projectId: 'project-a' }, { projectId: 'project-a' }])
    expect(view.text()).toContain('服务器配置已保存')
  })

  it.each(['save', 'delete', 'reconnect'])('does not switch configuration scope while %s is pending', async operation => {
    const view = setup(); await drain()
    let resolve!: (value: unknown) => void
    const method = operation === 'save' ? 'saveMcpServer' : operation === 'delete' ? 'deleteMcpServer' : 'reconnectMcpServer'
    host.api[method].mockImplementationOnce(() => new Promise(done => { resolve = done }))
    if (operation === 'save') { await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'saved global') }
    const pending = view.click(operation === 'save' ? '保存 MCP 服务器' : operation === 'delete' ? '删除 local-files' : '重新连接 local-files')
    await drain()
    expect(view.find(node => node.props['aria-label'] === 'MCP 配置范围').props.disabled).toBe(true)
    await view.change('MCP 配置范围', 'project-a')
    expect(view.find(node => node.props['aria-label'] === 'MCP 配置范围').props['model-value']).toBe('global')
    expect(host.api.listMcpServers).toHaveBeenCalledOnce()
    resolve(operation === 'save' ? server({ name: 'saved global' }) : operation === 'reconnect' ? { state: 'connected', toolCount: 4 } : undefined); await pending
    await view.change('MCP 配置范围', 'project-a')
    expect(host.api.listMcpServers).toHaveBeenLastCalledWith({ projectId: 'project-a' })
  })

  it('does not let project-metadata failure disable global configuration and retries metadata independently', async () => {
    host.api.listHarnessProjects.mockRejectedValueOnce(new Error('项目列表不可用'))
    const view = setup(); await drain()
    expect(view.text()).toContain('全局配置仍可使用'); expect(view.text()).toContain('local-files')
    await view.click('重试加载 MCP 项目范围')
    expect(host.api.listHarnessProjects).toHaveBeenCalledTimes(2); expect(host.api.listMcpServers).toHaveBeenCalledOnce()
    expect(view.text()).not.toContain('项目范围加载失败')
    await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'global unchanged'); await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'global unchanged' }))
  })

  it('leaves global transport behavior available to hosts without project metadata capability', async () => {
    delete host.api.listHarnessProjects
    const view = setup(); await drain()
    expect(view.text()).not.toContain('项目范围加载失败'); expect(view.text()).toContain('local-files')
    await view.change('MCP 配置范围', 'unknown-project')
    expect(host.api.listMcpServers).toHaveBeenCalledOnce()
  })

  it('holds scope while deletion confirmation is open and releases it when cancelled', async () => {
    const view = setup(); await drain()
    let cancel!: (error: Error) => void
    host.confirm.mockImplementationOnce(() => new Promise((_resolve, reject) => { cancel = reject }))
    const pending = view.click('删除 local-files'); await drain()
    expect(view.find(node => node.props['aria-label'] === 'MCP 配置范围').props.disabled).toBe(true)
    await view.change('MCP 配置范围', 'project-a')
    expect(view.find(node => node.props['aria-label'] === 'MCP 配置范围').props['model-value']).toBe('global')
    cancel(new Error('cancel')); await pending
    expect(host.api.deleteMcpServer).not.toHaveBeenCalled()
    await view.change('MCP 配置范围', 'project-a')
    expect(host.api.listMcpServers).toHaveBeenLastCalledWith({ projectId: 'project-a' })
  })
  it('creates stdio with atomic arguments, environment and enabled state', async () => {
    const view = setup(); await drain(); await view.click('添加 MCP 服务器')
    await view.change('MCP 服务器名称', ' docs '); await view.change('MCP 启动命令', ' node ')
    await view.change('MCP 启动参数', 'server.js\n/space path\n\n'); await view.change('MCP 环境变量 JSON', '{"MODE":"development"}'); await view.change('启用 MCP 服务器', false)
    await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledExactlyOnceWith({ name: 'docs', type: 'stdio', command: 'node', args: ['server.js', '/space path'], env: { MODE: 'development' }, enabled: false })
    expect(host.api.listMcpServers).toHaveBeenCalledOnce(); expect(view.text()).toContain('服务器配置已保存'); expect(view.text()).toContain('已停用')
  })

  it.each(['streamableHttp', 'sse'])('saves %s with URL and headers, without stale local-only fields', async type => {
    const view = setup(); await drain(); await view.click('编辑 local-files')
    await view.change('MCP 环境变量 JSON', '{"LOCAL":"value"}'); await view.change('MCP 传输协议', type)
    await view.change('MCP 服务 URL', 'https://example.test/mcp'); await view.change('MCP 请求头 JSON', '{"Authorization":"Bearer private-value"}')
    await view.click('保存 MCP 服务器')
    expect(host.api.saveMcpServer).toHaveBeenCalledExactlyOnceWith({ id: 'mcp-a', name: 'local-files', type, command: '', args: [], enabled: true, url: 'https://example.test/mcp', authentication: 'headers', headers: { Authorization: 'Bearer private-value' } })
    expect(view.text()).not.toContain('private-value'); expect(view.text()).not.toContain('LOCAL')
  })

  it('preserves both protocol drafts while switching and sends only the active fields', async () => {
    const view = setup(); await drain(); await view.click('编辑 local-files')
    await view.change('MCP 环境变量 JSON', '{"MODE":"test"}'); await view.change('MCP 传输协议', 'streamableHttp')
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
    await view.change('MCP 服务 URL', 'https://example.test/mcp'); await view.change('MCP 请求头 JSON', '{"Authorization":7}')
    await view.click('保存 MCP 服务器'); expect(view.text()).toContain('键值均为字符串'); expect(host.api.saveMcpServer).not.toHaveBeenCalled()
    expect(view.find(node => node.props['aria-label'] === 'MCP 请求头 JSON').props.modelValue).toBe('{"Authorization":7}')
  })

  it('prevents duplicate submits and retains failed remote draft with redacted inline error for retry', async () => {
    const view = setup(); await drain(); await view.click('添加 MCP 服务器'); await view.change('MCP 服务器名称', 'remote'); await view.change('MCP 传输协议', 'streamableHttp')
    await view.change('MCP 服务 URL', 'https://example.test/mcp?token=url-secret'); await view.change('MCP 请求头 JSON', '{"Authorization":"Bearer secret-value"}')
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
    expect(view.text()).toContain('local-files'); expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('draft-name')
  })

  it('ignores a stale refresh after successful save and retains a newly opened editing draft', async () => {
    const view = setup(); await drain(); await view.click('添加 MCP 服务器'); await view.change('MCP 服务器名称', 'new'); await view.change('MCP 启动命令', 'node')
    let resolve!: (value: unknown) => void
    host.api.listMcpServers.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = view.click('刷新 MCP 服务器'); await drain(); await view.click('保存 MCP 服务器'); await view.click('编辑 new'); await view.change('MCP 服务器名称', 'new unsaved')
    resolve([server()]); await pending
    expect(view.find(node => node.props['data-mcp-id'] === 'new-mcp')).toBeTruthy()
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('new unsaved')
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
    const view = setup(); await drain(); await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'draft')
    host.api.reconnectMcpServer.mockRejectedValueOnce(new Error('连接超时')); await view.click('重新连接 local-files'); expect(view.text()).toContain('重新连接失败：连接超时')
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('draft')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('取消 MCP 编辑'); expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称')).toBeTruthy()
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    await view.click('重新连接 local-files'); expect(view.text()).not.toContain('重新连接失败'); expect(await host.leave?.()).toBe(true)
  })

  it.each(['stdio', 'streamableHttp'])('explicitly clears stored %s credentials when the optional field is emptied', async type => {
    host.api.listMcpServers.mockResolvedValue([server({ type, url: 'https://example.test/mcp', env: { MODE: 'secret' }, headers: { Authorization: 'secret' } })])
    const view = setup(); await drain(); await view.click('编辑 local-files'); await view.change(type === 'stdio' ? 'MCP 环境变量 JSON' : 'MCP 请求头 JSON', '')
    await view.click('保存 MCP 服务器'); expect(host.api.saveMcpServer.mock.calls[0][0][type === 'stdio' ? 'env' : 'headers']).toEqual({})
  })

  it('does not delete a server when its dirty editor discard is rejected', async () => {
    const view = setup(); await drain(); await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'dirty draft')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('删除 local-files')
    expect(host.api.deleteMcpServer).not.toHaveBeenCalled(); expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('dirty draft')
  })

  it('refreshes actual connecting status on a one-second bounded timer without resetting the editor and stops when stable or unmounted', async () => {
    vi.useFakeTimers(); host.api.listMcpServers.mockResolvedValueOnce([server({ connection: { state: 'connecting', toolCount: 0 } })])
    const view = setup(); await drain(); await view.click('编辑 local-files'); await view.change('MCP 服务器名称', 'draft')
    await vi.advanceTimersByTimeAsync(1000); await drain()
    expect(host.api.listMcpServers).toHaveBeenCalledTimes(2); expect(view.find(node => node.props['data-mcp-id'] === 'mcp-a').props['data-mcp-status']).toBe('connected')
    expect(view.find(node => node.props['aria-label'] === 'MCP 服务器名称').props.modelValue).toBe('draft')
    await vi.advanceTimersByTimeAsync(3000); expect(host.api.listMcpServers).toHaveBeenCalledTimes(2)
    host.api.reconnectMcpServer.mockResolvedValueOnce({ state: 'connecting', toolCount: 0 }); await view.click('重新连接 local-files')
    mounted.splice(0).forEach(app => app.unmount()); await vi.advanceTimersByTimeAsync(1000); expect(host.api.listMcpServers).toHaveBeenCalledTimes(2)
  })
})
