import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { parse as parseYaml } from 'yaml'
import Page from '../src/pages/backend/agents/index.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'
import type { MiraUserAgentItem } from '../src/config/miraUserAgents'

const host = vi.hoisted(() => ({ api: undefined as any, route: { query: {} as Record<string, string> }, leave: undefined as undefined | (() => Promise<boolean>), confirm: vi.fn(async () => undefined) }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api }))
vi.mock('vue-router', () => ({ useRoute: () => host.route, onBeforeRouteLeave: (guard: () => Promise<boolean>) => { host.leave = guard } }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: host.confirm } }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('main', [slots.titlebar?.(), slots.default?.()]) } }))
vi.mock('../src/pages/backend/settings/components/SettingsScopeSelect.vue', () => ({ default: { props: ['modelValue', 'workspaces', 'disabled'], emits: ['update:modelValue'], setup: (props: any, { emit }: any) => () => h('ElSelect', { 'aria-label': '子智能体作用范围', 'model-value': props.modelValue, disabled: props.disabled, onChange: (value: string) => emit('update:modelValue', value) }) } }))
vi.mock('../src/pages/backend/settings/components/SettingsTooltip.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('span', slots.default?.()) } }))
vi.mock('../src/pages/backend/agents/AgentModelSelect.vue', () => ({ default: { props: ['modelValue', 'providers', 'disabled', 'unavailableLabel', 'labelForControl'], emits: ['change'], setup: (props: any, { emit }: any) => () => h('ModelSelect', { 'aria-label': props.labelForControl, 'model-value': props.modelValue, providers: props.providers, unavailableLabel: props.unavailableLabel, disabled: props.disabled, onChange: (value: string) => emit('change', value) }) } }))
const ActualPage = withVueClientRender(Page, new URL('../src/pages/backend/agents/index.vue', import.meta.url))
const passthrough = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_props, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const components = Object.fromEntries(['ElSelect', 'ElOption', 'ElButton', 'ElSwitch', 'ElTag', 'ElForm', 'ElFormItem', 'ElInput', 'ElRadioGroup', 'ElRadioButton', 'ElCheckboxGroup', 'ElCheckbox', 'AppIcon'].map(name => [name, passthrough(name)]))
const mounted: Array<{ unmount(): void }> = []
const agent = (scope: 'global' | 'project' = 'global'): MiraUserAgentItem => ({ id: `${scope}:security-check`, scope, name: 'security-check', description: '核对安全边界', enabled: true, revision: 'revision-1' })
async function drain() { for (let index = 0; index < 10; index++) { await Promise.resolve(); await nextTick() } }
function setup() {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(ActualPage, {}, components); mounted.push(app)
  const find = (predicate: (node: VueTestNode) => boolean) => { const value = renderer.all().find(predicate); if (!value) throw new Error('Missing real Agent settings control'); return value }
  const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
  const click = async (label: string) => { const node = find(node => ['ElButton', 'button'].includes(node.type) && (node.props['aria-label'] === label || text(node) === label)); await (node.props.onClick as () => Promise<void>)(); await drain() }
  const input = async (label: string, value: string) => { const node = find(node => ['ElInput', 'input'].includes(node.type) && node.props['aria-label'] === label); if (node.type === 'input') (node.props.onInput as any)({ target: { value } }); else (node.props['onUpdate:modelValue'] as (value: string) => void)(value); await drain() }
  const change = async (label: string, value: unknown) => { const node = find(node => node.props['aria-label'] === label); (node.props.onChange || node.props['onUpdate:modelValue'] as any)(value); await drain() }
  return { renderer, click, input, change, find, text: () => text(renderer.root), app }
}
const source = (extra = '', body = '\n请检查项目安全边界。\n') => `---\n# 保留说明\nname: security-check\ndescription: 核对安全边界\n${extra}---\n${body}`
const provider = { id: 'provider-a', providerKey: 'custom', name: '测试模型供应商', endpoint: 'http://127.0.0.1:8800/v1', authMode: 'none', models: [{ id: 'reasoner', enabled: true, reasoning: true, contextWindow: 32768 }, { id: 'plain', enabled: true, reasoning: false, contextWindow: 32768 }, { id: 'disabled', enabled: false, reasoning: true, contextWindow: 32768 }], enabled: true, hasApiKey: false }
beforeEach(() => {
  host.route.query = {}; host.confirm.mockReset(); host.confirm.mockResolvedValue(undefined)
  host.api = { listHarnessProjects: vi.fn(async () => [{ id: 'project-a', name: 'Project A' }]), listModelProviders: vi.fn(async () => [provider]), agentModels: {
    list: vi.fn(async () => ['explorer', 'reviewer', 'tester', 'implementer'].map(name => ({ target: { kind: 'builtin', name } }))),
    set: vi.fn(async (input: any) => input),
  }, userAgents: {
    list: vi.fn(async () => [agent()]), read: vi.fn(async () => ({ agent: agent(), source: '原始子智能体指令' })),
    save: vi.fn(async () => ({ ...agent(), revision: 'revision-2' })), delete: vi.fn(async () => undefined), setEnabled: vi.fn(async () => ({ ...agent(), enabled: false, revision: 'revision-2' })),
  } }
})

describe('real built-in and plugin Agent inline model controls', () => {
  it('shows a blue color marker on every built-in Agent avatar', async () => {
    const view = setup(); await drain()
    for (const name of ['explorer', 'reviewer', 'tester', 'implementer']) {
      const row = view.find(node => node.props['data-agent-model-name'] === name)
      const avatar = row.children.find(node => node.props.class === 'user-agents__avatar')
      expect(avatar?.children.some(node => node.type === 'AppIcon' && node.props.name === 'lucide:bot')).toBe(true)
      expect(avatar?.children.some(node => node.props.class === 'user-agents__color-dot' && node.props['data-mira-agent-color'] === 'blue')).toBe(true)
    }
  })

  it('immediately saves built-in model and effort to a global target, independently from project scope', async () => {
    host.route.query = { project: 'project-a' }
    const view = setup(); await drain()
    await view.change('reviewer 模型', JSON.stringify(['provider-a', 'reasoner']))
    expect(host.api.agentModels.set).toHaveBeenLastCalledWith({ target: { kind: 'builtin', name: 'reviewer' }, modelSelection: { providerId: 'provider-a', modelId: 'reasoner' } })
    await view.change('reviewer 推理强度', 'high')
    expect(host.api.agentModels.set).toHaveBeenLastCalledWith({ target: { kind: 'builtin', name: 'reviewer' }, modelSelection: { providerId: 'provider-a', modelId: 'reasoner', thinkingLevel: 'high' } })
    expect(view.text()).toContain('模型设置已保存')
    await view.change('子智能体作用范围', 'global')
    expect(host.api.agentModels.list).toHaveBeenCalledOnce()
    expect(view.find(node => node.props['aria-label'] === 'reviewer 模型').props['model-value']).toBe(JSON.stringify(['provider-a', 'reasoner']))
    await view.change('reviewer 模型', 'inherit')
    expect(host.api.agentModels.set).toHaveBeenLastCalledWith({ target: { kind: 'builtin', name: 'reviewer' } })
    expect(host.api.userAgents.save).not.toHaveBeenCalled()
  })

  it('shows only real plugin Agent targets and preserves full qualified names without editing the plugin', async () => {
    const target = { kind: 'plugin', pluginId: 'quality-kit', name: 'quality-kit:folder:reviewer' }
    host.api.agentModels.list.mockResolvedValue([{ target }])
    const view = setup(); await drain()
    expect(view.text()).toContain('@quality-kit:folder:reviewer'); expect(view.text()).toContain('来源：quality-kit')
    await view.change('quality-kit:folder:reviewer 模型', JSON.stringify(['provider-a', 'plain']))
    expect(host.api.agentModels.set).toHaveBeenCalledExactlyOnceWith({ target, modelSelection: { providerId: 'provider-a', modelId: 'plain' } })
    const row = view.find(node => node.props['data-agent-model-name'] === target.name)
    const collect = (node: VueTestNode): VueTestNode[] => [node, ...node.children.flatMap(collect)]
    expect(collect(row).some(node => ['ElInput', 'ElCheckbox', 'ElSwitch', 'ElButton'].includes(node.type))).toBe(false)
    expect(host.api.userAgents.save).not.toHaveBeenCalled()
  })

  it('limits pending state to its row, rejects duplicates and restores the previous model on failure', async () => {
    host.api.userAgents.read.mockResolvedValue({ agent: agent(), source: source() })
    const view = setup(); await drain()
    let reject!: (failure: Error) => void
    host.api.agentModels.set.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure }))
    const row = view.find(node => node.props['aria-label'] === 'reviewer 模型')
    const pending = (row.props.onChange as (value: string) => Promise<void>)(JSON.stringify(['provider-a', 'reasoner'])); await drain()
    expect(view.find(node => node.props['aria-label'] === 'reviewer 模型').props.disabled).toBe(true)
    expect(view.find(node => node.props['aria-label'] === 'explorer 模型').props.disabled).toBeFalsy()
    await view.change('reviewer 模型', JSON.stringify(['provider-a', 'plain']))
    expect(host.api.agentModels.set).toHaveBeenCalledOnce()
    reject(new Error("Error invoking remote method 'platform:agent-models': Error: 无法写入设置")); await pending; await drain()
    expect(view.find(node => node.props['aria-label'] === 'reviewer 模型').props['model-value']).toBe('inherit')
    expect(view.text()).toContain('模型设置未保存：无法写入设置'); expect(view.text()).not.toContain('Error invoking remote method')
  })

  it('preserves unavailable configured models and allows inherit even when the provider catalog fails to load', async () => {
    const target = { kind: 'builtin', name: 'reviewer' }, modelSelection = { providerId: 'old-provider', modelId: 'missing-model', thinkingLevel: 'high' }
    host.api.agentModels.list.mockResolvedValue([{ target, modelSelection, unavailableReason: '配置模型已停用' }])
    host.api.listModelProviders.mockRejectedValueOnce(new Error('模型目录不可用'))
    const view = setup(); await drain()
    expect(view.text()).toContain('配置的模型当前不可用'); expect(view.text()).toContain('配置模型已停用')
    expect(view.find(node => node.props['aria-label'] === 'reviewer 模型').props['model-value']).toBe(JSON.stringify(['old-provider', 'missing-model']))
    await view.change('reviewer 模型', JSON.stringify(['provider-a', 'disabled']))
    expect(host.api.agentModels.set).not.toHaveBeenCalled()
    await view.change('reviewer 模型', 'inherit')
    expect(host.api.agentModels.set).toHaveBeenCalledExactlyOnceWith({ target })
  })

  it('rejects unsupported effort without saving and reloads persisted configuration from the host', async () => {
    const target = { kind: 'builtin', name: 'tester' }
    host.api.agentModels.list.mockResolvedValue([{ target, modelSelection: { providerId: 'provider-a', modelId: 'plain', thinkingLevel: 'high' } }])
    const view = setup(); await drain()
    expect(view.text()).toContain('此模型不支持所选推理强度')
    await view.change('tester 推理强度', 'high'); expect(host.api.agentModels.set).not.toHaveBeenCalled()
    await view.change('tester 推理强度', 'off')
    expect(host.api.agentModels.set).toHaveBeenLastCalledWith({ target, modelSelection: { providerId: 'provider-a', modelId: 'plain', thinkingLevel: 'off' } })
    host.api.agentModels.list.mockResolvedValue([{ target, modelSelection: { providerId: 'provider-a', modelId: 'reasoner', thinkingLevel: 'medium' } }])
    await view.click('重新加载子智能体')
    expect(view.find(node => node.props['aria-label'] === 'tester 模型').props['model-value']).toBe(JSON.stringify(['provider-a', 'reasoner']))
    expect(view.find(node => node.props['aria-label'] === 'tester 推理强度').props['model-value']).toBe('medium')
    expect(host.api.agentModels.list).toHaveBeenCalledTimes(2)
  })

  it('reports a missing host API while keeping existing user Agent CRUD available', async () => {
    delete host.api.agentModels
    const view = setup(); await drain()
    expect(view.text()).toContain('请重启后重试')
    expect(view.find(node => node.props['aria-label'] === 'reviewer 模型').props.disabled).toBe(true)
    await view.click('新建子智能体'); await view.input('子智能体名称', 'new-helper'); await view.input('子智能体用途说明', '检查'); await view.input('子智能体系统指令', '检查代码'); await view.click('保存子智能体')
    expect(host.api.userAgents.save).toHaveBeenCalledOnce()
  })
})
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()) })

describe('real custom Agent settings controls', () => {
  it('creates a scoped Agent from the single form with empty required fields', async () => {
    host.route.query = { project: 'project-a' }; host.api.userAgents.list.mockResolvedValue([])
    const view = setup(); await drain(); await view.click('新建子智能体')
    expect(view.find(node => node.props['aria-label'] === '子智能体用途说明').props.modelValue).toBe('')
    expect(view.find(node => node.props['aria-label'] === '子智能体系统指令').props.modelValue).toBe('')
    expect(view.find(node => node.props['aria-label'] === '保存子智能体').props.disabled).toBe(true)
    expect(view.text()).not.toContain('Markdown')
    await view.input('子智能体名称', 'my-reviewer'); await view.input('子智能体用途说明', '检查'); await view.input('子智能体系统指令', '完整指令正文\n')
    await view.click('保存子智能体')
    const payload = host.api.userAgents.save.mock.calls[0][0]
    expect(payload).toMatchObject({ scope: 'project', name: 'my-reviewer', projectId: 'project-a' }); expect(payload.expectedRevision).toBeUndefined()
    expect(parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(payload.source)![1])).toMatchObject({ name: 'my-reviewer', description: '检查' })
    expect(payload.source.endsWith('完整指令正文\n')).toBe(true)
    expect(host.api.userAgents.list).toHaveBeenLastCalledWith({ projectId: 'project-a' })
  })

  it('preserves source and revision on a real Electron-prefixed conflict and confirms unsaved project/route changes', async () => {
    const view = setup(); await drain(); await view.click('编辑 security-check'); await view.input('子智能体 Markdown 指令', '未保存指令')
    host.api.userAgents.save.mockRejectedValueOnce(new Error("Error invoking remote method 'platform:user-agents': Error: Agent 已被修改，请刷新后重试"))
    await view.click('保存子智能体'); expect(view.text()).toContain('Agent 已被修改'); expect(view.text()).not.toContain('Error invoking remote method')
    expect(view.find(node => node.props['aria-label'] === '子智能体 Markdown 指令').props.modelValue).toBe('未保存指令')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('子智能体')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    expect(host.api.userAgents.list).toHaveBeenCalledTimes(1)
    await view.click('保存子智能体'); expect(host.api.userAgents.save.mock.calls[1]).toEqual([{ scope: 'global', name: 'security-check', source: '未保存指令', expectedRevision: 'revision-1' }])
  })

  it('toggles and deletes exactly the catalog scope and revision without supplying host paths', async () => {
    host.route.query = { project: 'project-a' }; host.api.userAgents.list.mockResolvedValue([agent('project')])
    const view = setup(); await drain()
    await (view.find(node => node.props['aria-label'] === '停用 security-check').props.onChange as () => Promise<void>)(); await drain()
    expect(host.api.userAgents.setEnabled).toHaveBeenCalledExactlyOnceWith({ scope: 'project', name: 'security-check', enabled: false, expectedRevision: 'revision-1', projectId: 'project-a' })
    await view.click('删除 security-check')
    expect(host.api.userAgents.delete).toHaveBeenCalledExactlyOnceWith({ scope: 'project', name: 'security-check', expectedRevision: 'revision-1', projectId: 'project-a' })
  })

  it('creates through actual structured controls with a real model, reasoning, tools, color and project instructions', async () => {
    host.api.userAgents.list.mockResolvedValue([])
    const view = setup(); await drain(); await view.click('新建子智能体')
    await view.input('子智能体名称', 'audit-helper'); await view.input('子智能体用途说明', '检查代码风险'); await view.input('子智能体系统指令', '输出风险及证据。\n')
    await view.click('子智能体颜色：紫色'); await view.change('子智能体模型', JSON.stringify(['provider-a', 'reasoner'])); await view.change('子智能体推理强度', 'high')
    await view.change('子智能体工具模式', 'custom'); expect(view.renderer.all().filter(node => node.type === 'ElCheckbox')).toHaveLength(9); await view.change('子智能体可用工具', ['read', 'bash']); await view.change('读取项目 AGENTS.md 指令', false)
    await view.click('保存子智能体')
    const payload = host.api.userAgents.save.mock.calls[0][0], header = /^---\n([\s\S]*?)\n---\n/.exec(payload.source)!
    expect(payload).toMatchObject({ scope: 'global', name: 'audit-helper' }); expect(payload).not.toHaveProperty('expectedRevision')
    expect(parseYaml(header[1])).toMatchObject({ name: 'audit-helper', description: '检查代码风险', color: 'purple', tools: ['read', 'bash'], modelSelection: { providerId: 'provider-a', modelId: 'reasoner', thinkingLevel: 'high' }, injectAgentsMd: false })
    expect(payload.source.endsWith('输出风险及证据。\n')).toBe(true)
    expect(host.api.listModelProviders).toHaveBeenCalledOnce()
  })

  it('keeps no-op advanced/form round trips lossless and distinguishes inherited tools from explicitly none', async () => {
    const original = source('enabled: false\n', '\r\n完整正文。\r\n')
    host.api.userAgents.read.mockResolvedValue({ agent: agent(), source: original })
    const view = setup(); await drain(); await view.click('编辑 security-check')
    expect(view.find(node => node.props['aria-label'] === '子智能体名称').props.disabled).toBe(true)
    await view.click('编辑 Markdown')
    expect(view.find(node => node.props['aria-label'] === '子智能体 Markdown 指令').props.modelValue).toBe(original)
    await view.click('返回表单'); expect(view.find(node => node.props['aria-label'] === '保存子智能体').props.disabled).toBe(true)
    await view.change('子智能体工具模式', 'custom'); await view.click('保存子智能体')
    const payload = host.api.userAgents.save.mock.calls[0][0]
    expect(payload.source).toContain('# 保留说明'); expect(payload.source).toContain('enabled: false'); expect(payload.source).toContain('tools: []'); expect(payload.source.endsWith('\r\n完整正文。\r\n')).toBe(true)
    expect(payload.expectedRevision).toBe('revision-1')
    host.api.userAgents.read.mockResolvedValue({ agent: agent(), source: source('tools: [read]\n') })
    await view.click('编辑 security-check'); await view.change('子智能体工具模式', 'inherit'); await view.click('保存子智能体')
    expect(host.api.userAgents.save.mock.calls[1][0].source).not.toContain('tools:')
  })

  it('preserves existing scoped MCP allow and deny rules through the unified tool section', async () => {
    const rule = 'mcp__plugin:Probe:Echo__Read', forbidden = 'mcp__plugin:Probe:Echo__Write'
    host.api.userAgents.read.mockResolvedValue({ agent: agent(), source: source(`tools: [read, ${rule}]\ndisallowedTools: [${forbidden}]\n`) })
    const view = setup(); await drain(); await view.click('编辑 security-check')
    expect(view.find(node => node.props['aria-label'] === `可用工具：${rule}`).props.value).toBe(rule)
    expect(view.text()).toContain('已保留原配置的工具排除规则')
    expect(view.renderer.all().some(node => node.props['aria-label'] === '子智能体禁止工具')).toBe(false)
    expect(view.find(node => node.props['aria-label'] === '保存子智能体').props.disabled).toBe(true)
    await view.input('子智能体用途说明', '仅查询指定 MCP 服务'); await view.click('保存子智能体')
    expect(host.api.userAgents.save.mock.calls[0][0].source).toContain(rule)
    expect(host.api.userAgents.save.mock.calls[0][0].source).toContain(forbidden)
  })

  it('shows validation only after touching a field and rejects incomplete or reserved names', async () => {
    const view = setup(); await drain(); await view.click('新建子智能体')
    const nameField = () => view.find(node => node.type === 'ElFormItem' && node.props.label === '名称')
    expect(nameField().props.error).toBe('')
    const name = view.find(node => node.props['aria-label'] === '子智能体名称')
    ;(name.props.onBlur as () => void)(); await drain()
    expect(nameField().props.error).toBe('请填写名称。')
    await view.input('子智能体名称', 'Invalid Name'); await view.click('保存子智能体')
    expect(nameField().props.error).toContain('3 至 50')
    await view.input('子智能体名称', 'reviewer'); await view.click('保存子智能体')
    expect(nameField().props.error).toContain('内置子智能体')
    await view.input('子智能体名称', 'valid-agent'); await view.click('保存子智能体')
    expect(host.api.userAgents.save).not.toHaveBeenCalled()
    expect(view.find(node => node.type === 'ElFormItem' && node.props.label === '用途说明').props.error).toBe('请填写用途说明。')
  })

  it('retains incomplete structured drafts when serialization fails and protects scope and route navigation', async () => {
    host.api.userAgents.read.mockResolvedValue({ agent: agent(), source: source() })
    const view = setup(); await drain(); await view.click('编辑 security-check'); await view.input('子智能体用途说明', '')
    await view.click('编辑 Markdown')
    expect(view.text()).toContain('请填写用途说明'); expect(view.find(node => node.props['aria-label'] === '子智能体用途说明').props.modelValue).toBe('')
    expect(view.find(node => node.props['aria-label'] === '子智能体作用范围').props.disabled).toBe(true)
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('子智能体')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    await view.click('保存子智能体'); expect(host.api.userAgents.save).not.toHaveBeenCalled()
    await view.input('子智能体用途说明', '完整用途')
    host.api.userAgents.save.mockRejectedValueOnce(new Error('Agent 已被修改，请刷新后重试'))
    await view.click('保存子智能体'); expect(view.find(node => node.props['aria-label'] === '子智能体用途说明').props.modelValue).toBe('完整用途')
    expect(host.api.userAgents.save.mock.calls[0][0].expectedRevision).toBe('revision-1')
  })

  it('falls back to raw Markdown for unrepresentable metadata and keeps failed conversion drafts', async () => {
    const original = source('futureField: preserved\n')
    host.api.userAgents.read.mockResolvedValue({ agent: agent(), source: original })
    const view = setup(); await drain(); await view.click('编辑 security-check')
    expect(view.text()).toContain('futureField'); expect(view.text()).toContain('原始 Markdown 已保留')
    await view.input('子智能体 Markdown 指令', original.replace('preserved', 'modified')); await view.click('返回表单')
    expect(view.find(node => node.props['aria-label'] === '子智能体 Markdown 指令').props.modelValue).toContain('futureField: modified')
    await view.click('保存子智能体')
    expect(host.api.userAgents.save.mock.calls[0][0].source).toContain('futureField: modified')
  })

  it('preserves missing models as unavailable, rejects new invalid selections and permits inheriting again', async () => {
    host.api.userAgents.read.mockResolvedValue({ agent: agent(), source: source('modelSelection: {providerId: missing-provider, modelId: old-model}\n') })
    const view = setup(); await drain(); await view.click('编辑 security-check')
    expect(view.text()).toContain('配置的模型当前不可用'); expect(view.find(node => node.type === 'ModelSelect' && node.props['aria-label'] === '子智能体模型').props.unavailableLabel).toBe('old-model')
    expect(view.renderer.all().some(node => node.type === 'ElOption' && node.props.value === JSON.stringify(['provider-a', 'disabled']))).toBe(false)
    await view.change('子智能体模型', JSON.stringify(['provider-a', 'disabled']))
    expect(view.find(node => node.props['aria-label'] === '子智能体模型').props['model-value']).toBe(JSON.stringify(['missing-provider', 'old-model']))
    await view.change('子智能体模型', 'inherit'); await view.click('保存子智能体')
    expect(host.api.userAgents.save.mock.calls[0][0].source).not.toContain('modelSelection:')
  })

  it('offers reasoning levels only for capable models and retains the inherited model fallback if loading fails', async () => {
    const view = setup(); await drain(); await view.click('新建子智能体'); await view.input('子智能体名称', 'plain-helper'); await view.input('子智能体用途说明', '检查'); await view.input('子智能体系统指令', '检查代码')
    await view.change('子智能体模型', JSON.stringify(['provider-a', 'plain']))
    expect(view.find(node => node.type === 'ElOption' && node.props.value === 'high').props.disabled).toBe(true)
    await view.change('子智能体推理强度', 'high')
    expect(view.find(node => node.props['aria-label'] === '子智能体推理强度').props['model-value']).toBe('inherit')
    host.api.listModelProviders.mockRejectedValueOnce(new Error('宿主不可用')); await view.click('重新加载子智能体模型')
    expect(view.text()).toContain('无法加载模型：宿主不可用')
    await view.change('子智能体模型', 'inherit'); await view.click('保存子智能体')
    expect(host.api.userAgents.save.mock.calls[0][0].source).not.toContain('modelSelection:')
  })
})

describe('subagent directory search', () => {
  it('shows the saved identity color and refreshes it from the catalog', async () => {
    host.api.userAgents.list.mockResolvedValue([{ ...agent(), color: 'purple' }])
    const view = setup(); await drain()
    expect(view.find(node => node.props.class === 'user-agents__color-dot').props['data-mira-agent-color']).toBe('purple')
    host.api.userAgents.list.mockResolvedValue([{ ...agent(), color: 'cyan' }])
    await view.click('重新加载子智能体')
    expect(view.find(node => node.props.class === 'user-agents__color-dot').props['data-mira-agent-color']).toBe('cyan')
    host.api.userAgents.list.mockResolvedValue([agent()]); await view.click('重新加载子智能体')
    expect(view.find(node => node.props.class === 'user-agents__avatar').children.some(node => node.props.class === 'user-agents__color-dot')).toBe(false)
  })

  it('filters custom and built-in rows by name or description without mutating host data', async () => {
    const view = setup(); await drain()
    await view.input('搜索子智能体', '核对安全')
    expect(view.text()).toContain('@security-check')
    expect(view.renderer.all().some(node => node.props['data-agent-model-name'] === 'reviewer')).toBe(false)
    await view.input('搜索子智能体', 'no-matching-agent')
    expect(view.text()).toContain('没有找到匹配的自定义子智能体')
    await view.input('搜索子智能体', '')
    expect(view.renderer.all().some(node => node.props['data-agent-model-name'] === 'reviewer')).toBe(true)
    expect(host.api.userAgents.save).not.toHaveBeenCalled()
  })
})

describe('subagent secondary page', () => {
  it('replaces the directory for editing, aligns scope and Markdown controls, and restores it on cancel', async () => {
    host.api.userAgents.read.mockResolvedValue({ agent: agent(), source: source() })
    const view = setup(); await drain(); await view.click('编辑 security-check')
    expect(view.text()).toContain('编辑子智能体')
    expect(view.find(node => node.props['aria-label'] === '页面位置').children.map(node => node.text).join('')).toContain('security-check')
    expect(view.renderer.all().some(node => node.props.class === 'user-agents__toolbar' || node.props.class === 'user-agents__list' || node.props['aria-label'] === '内置与插件子智能体')).toBe(false)
    expect(view.renderer.all().some(node => node.props['aria-label'] === '搜索子智能体' || node.props['data-agent-model-name'])).toBe(false)
    expect(view.find(node => node.props['aria-label'] === '子智能体作用范围').props.disabled).toBe(true)
    const scopeRow = view.find(node => node.props.class === 'user-agents__editor-scope')
    expect(scopeRow.children.some(node => node.type === 'ElButton')).toBe(true)
    await view.click('编辑 Markdown')
    expect(view.find(node => node.props['aria-label'] === '子智能体 Markdown 指令').props.modelValue).toBe(source())
    await view.click('返回表单'); await view.click('取消')
    expect(view.text()).toContain('@security-check'); expect(view.text()).toContain('@reviewer · 审查')
    expect(view.renderer.all().some(node => node.props['aria-label'] === '页面位置')).toBe(false)
    expect(host.api.userAgents.save).not.toHaveBeenCalled()
  })
  it('protects dirty edit navigation and saves to the original project and revision', async () => {
    host.route.query = { project: 'project-a' }
    host.api.userAgents.list.mockResolvedValue([agent('project')])
    host.api.userAgents.read.mockResolvedValue({ agent: agent('project'), source: source() })
    const view = setup(); await drain(); await view.click('编辑 security-check')
    await view.change('子智能体作用范围', 'global')
    expect(view.find(node => node.props['aria-label'] === '子智能体作用范围').props['model-value']).toBe('project-a')
    await view.input('子智能体用途说明', '更新项目检查')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); await view.click('子智能体')
    expect(view.find(node => node.props['aria-label'] === '子智能体用途说明').props.modelValue).toBe('更新项目检查')
    host.confirm.mockRejectedValueOnce(new Error('cancel')); expect(await host.leave?.()).toBe(false)
    await view.click('保存子智能体')
    expect(host.api.userAgents.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ scope: 'project', projectId: 'project-a', name: 'security-check', expectedRevision: 'revision-1' }))
    expect(view.renderer.all().some(node => node.props['aria-label'] === '搜索子智能体')).toBe(true)
    expect(view.text()).toContain('@reviewer · 审查')
  })
  it('replaces the directory with the form and returns on cancel without writing', async () => {
    const view = setup(); await drain(); await view.click('新建子智能体')
    expect(view.renderer.all().some(node => node.props.class === 'user-agents__toolbar')).toBe(false)
    expect(view.renderer.all().some(node => node.props['data-agent-model-name'])).toBe(false)
    expect(view.text()).toContain('新建子智能体')
    expect(view.renderer.all().some(node => node.type === 'ElTag')).toBe(false)
    await view.click('取消')
    expect(view.text()).toContain('@reviewer · 审查')
    expect(host.api.userAgents.save).not.toHaveBeenCalled()
  })
  it('keeps new form fields when changing the destination and saves to that project', async () => {
    const view = setup(); await drain(); await view.click('新建子智能体')
    await view.input('子智能体名称', 'scoped-helper'); await view.input('子智能体用途说明', '保留用途'); await view.input('子智能体系统指令', '执行检查')
    await view.change('子智能体作用范围', 'project-a')
    expect(view.find(node => node.props['aria-label'] === '子智能体用途说明').props.modelValue).toBe('保留用途')
    await view.click('保存子智能体')
    expect(host.api.userAgents.save.mock.calls[0][0]).toMatchObject({ scope: 'project', projectId: 'project-a', name: 'scoped-helper' })
    expect(host.api.userAgents.list).toHaveBeenLastCalledWith({ projectId: 'project-a' })
    expect(view.text()).toContain('@reviewer · 审查')
  })
})
