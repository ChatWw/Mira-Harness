import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import Dialog from '../src/pages/backend/modelConfig/components/ModelEditorDialog.vue'
import ModelCapabilities from '../src/pages/backend/modelConfig/components/ModelCapabilities.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'
import type { ModelMetadataResult, ProviderModelConfig } from '../src/config/harness'

const host = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('@/platform', () => ({ getPlatformApi: () => ({ lookupModelMetadata: host.lookup }) }))
vi.mock('../src/pages/backend/settings/components/SettingsTooltip.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('tooltip', slots.default?.()) } }))
const ActualDialog = withVueClientRender(Dialog, new URL('../src/pages/backend/modelConfig/components/ModelEditorDialog.vue', import.meta.url))
Object.assign(ModelCapabilities, withVueClientRender(ModelCapabilities, new URL('../src/pages/backend/modelConfig/components/ModelCapabilities.vue', import.meta.url)))
const passthrough = (tag: string) => defineComponent({ setup: (_, { attrs, slots }) => () => h(tag, attrs, [slots.default?.(), slots.footer?.()]) })
const components = Object.fromEntries(['ElDialog', 'ElInput', 'ElButton', 'AppIcon'].map(name => [name, passthrough(name)]))
const text = (node: VueTestNode): string => node.text + node.children.map(text).join('')
const mounted: Array<{ unmount(): void }> = []
async function drain() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
function setup(model?: ProviderModelConfig) {
  const renderer = createVueNodeRenderer(), save = vi.fn(), close = vi.fn()
  const { app } = renderer.mount(ActualDialog, { model, onSave: save, onClose: close }, components)
  mounted.push(app)
  const find = (predicate: (node: VueTestNode) => boolean) => { const node = renderer.all().find(predicate); if (!node) throw new Error('Missing control'); return node }
  const input = (label: string) => find(node => node.type === 'ElInput' && node.props['aria-label'] === label)
  const change = async (label: string, value: string) => { (input(label).props['onUpdate:modelValue'] as Function)(value); await drain() }
  const button = (label: string) => find(node => ['button', 'ElButton'].includes(node.type) && text(node).trim() === label)
  const click = async (label: string) => { await (button(label).props.onClick as Function)(); await drain() }
  const lookup = async () => { await (input('模型 ID').props.onBlur as Function)(); await drain() }
  return { all: renderer.all, input, change, button, click, lookup, save, close, app }
}
beforeEach(() => { vi.useFakeTimers(); host.lookup.mockReset().mockResolvedValue({}) })
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); vi.useRealTimers() })

describe('manual model dialog', () => {
  it('starts with two fields, expands model types, abilities and input modalities and combines presets with arbitrary values', async () => {
    const view = setup()
    expect(view.all().filter(node => node.type === 'ElInput')).toHaveLength(2)
    await view.change('模型 ID', 'my-model')
    await view.change('模型名称', '我的模型')
    await view.click('更多设置')
    expect(view.all().filter(node => node.type === 'ElInput').map(node => node.props['aria-label'])).toEqual(['模型 ID', '模型名称', '上下文窗口', '最大输出 Token'])
    expect(view.button('文本').props['aria-pressed']).toBe(true)
    await view.click('视觉'); await view.click('推理')
    expect(view.all().filter(node => node.props.role === 'img').map(node => node.props['aria-label'])).toEqual(['文本', '视觉', '推理'])
    await view.click('64K')
    expect(view.input('最大输出 Token').props['model-value']).toBe('65536')
    await view.change('上下文窗口', '8192'); await view.change('最大输出 Token', '1234')
    await view.click('添加模型')
    expect(view.save).toHaveBeenCalledWith({ id: 'my-model', name: '我的模型', enabled: true, reasoning: true, multimodal: true, contextWindow: 8192, maxTokens: 1234 })
  })
  it('auto-fills known metadata after typing and preserves manual edits made while waiting', async () => {
    let resolve!: (value: ModelMetadataResult) => void
    host.lookup.mockReturnValue(new Promise<ModelMetadataResult>(done => { resolve = done }))
    const view = setup(); await view.change('模型 ID', 'deepseek-v4-pro')
    await vi.advanceTimersByTimeAsync(600)
    expect(host.lookup).toHaveBeenCalledWith('deepseek-v4-pro')
    await view.change('模型名称', '手工名称'); await view.click('更多设置'); await view.change('最大输出 Token', '10000')
    await view.click('视觉'); await view.click('视觉')
    resolve({ model: { name: 'Auto', reasoning: true, multimodal: true, contextWindow: 1000000, maxTokens: 64000 } }); await drain()
    expect(view.input('模型名称').props['model-value']).toBe('手工名称')
    expect(view.button('推理').props['aria-pressed']).toBe(true)
    expect(view.button('视觉').props['aria-pressed']).toBe(false)
    expect(view.input('上下文窗口').props['model-value']).toBe('1000000')
    expect(view.input('最大输出 Token').props['model-value']).toBe('10000')
    expect(view.all().filter(node => node.props.role === 'img').map(node => node.props['aria-label'])).toEqual(['文本', '推理'])
    await view.lookup(); expect(host.lookup).toHaveBeenCalledOnce()
  })
  it('discards stale lookup responses after changing ID or unmounting', async () => {
    const resolves: Array<(value: ModelMetadataResult) => void> = []
    host.lookup.mockImplementation(() => new Promise<ModelMetadataResult>(done => resolves.push(done)))
    const view = setup(); await view.change('模型 ID', 'old')
    void (view.input('模型 ID').props.onBlur as Function)(); await drain()
    await view.change('模型 ID', 'new')
    void (view.input('模型 ID').props.onBlur as Function)(); await drain()
    resolves[1]({ model: { name: 'New' } }); await drain()
    resolves[0]({ model: { name: 'Old' } }); await drain()
    expect(view.input('模型名称').props['model-value']).toBe('New')
    await view.change('模型 ID', 'closed'); await vi.advanceTimersByTimeAsync(600)
    view.app.unmount(); mounted.splice(mounted.indexOf(view.app), 1)
    resolves[2]({ model: { name: 'Closed' } }); await drain()
    expect(view.save).not.toHaveBeenCalled()
  })
  it('fills the new capabilities, preserves manual overrides, and saves independent model types and inputs', async () => {
    let resolve!: (value: ModelMetadataResult) => void
    host.lookup.mockReturnValue(new Promise<ModelMetadataResult>(done => { resolve = done }))
    const view = setup(); await view.change('模型 ID', 'media-model'); await vi.advanceTimersByTimeAsync(600)
    await view.click('更多设置'); await view.click('工具'); await view.click('工具'); await view.click('嵌入')
    resolve({ model: { modelType: 'image', multimodal: true, reasoning: true, toolCall: true, audioInput: true, videoInput: true } }); await drain()
    expect(view.button('嵌入').props['aria-pressed']).toBe(true)
    expect(view.button('工具').props['aria-pressed']).toBe(false)
    expect(view.button('音频').props['aria-pressed']).toBe(true)
    expect(view.button('视频').props['aria-pressed']).toBe(true)
    await view.click('音频'); await view.click('添加模型')
    expect(view.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'media-model', modelType: 'embedding', multimodal: true, reasoning: true, toolCall: false, audioInput: false, videoInput: true }))
  })
  it.each([{}, { error: '暂时无法查询 Models.dev，可手动填写' }])('allows manual save when metadata is unavailable (%j)', async result => {
    host.lookup.mockResolvedValue(result)
    const view = setup(); await view.change('模型 ID', 'unknown'); await view.lookup(); await view.click('添加模型')
    expect(view.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'unknown' }))
    expect(view.all().some(node => node.props.role === 'status' && text(node).includes('手动填写'))).toBe(true)
  })
  it('preserves existing pricing and media metadata, supports clearing optional limits, and avoids querying on edit', async () => {
    const model: ProviderModelConfig = { id: 'existing', name: '已存模型', enabled: true, reasoning: true, multimodal: false, contextWindow: 128000, maxTokens: 8192, pdfInput: true, videoInput: true, pricing: { currency: 'CNY', input: 1, output: 2 } }
    const view = setup(model)
    expect(view.input('模型名称').props['model-value']).toBe('已存模型')
    expect(view.all().some(node => node.props.role === 'img')).toBe(false)
    await view.click('更多设置'); await view.change('最大输出 Token', ''); await view.click('保存模型')
    const { maxTokens: _output, ...expected } = model
    expect(view.save).toHaveBeenCalledWith(expected)
    expect(host.lookup).not.toHaveBeenCalled()
  })
  it('rejects missing IDs and invalid token limits', async () => {
    const view = setup(); await view.click('添加模型'); expect(view.save).not.toHaveBeenCalled()
    await view.change('模型 ID', 'valid'); await view.click('更多设置'); await view.change('最大输出 Token', '-1'); await view.click('添加模型')
    expect(view.save).not.toHaveBeenCalled()
    expect(view.all().some(node => node.props.role === 'alert' && text(node).includes('正整数'))).toBe(true)
  })
})
