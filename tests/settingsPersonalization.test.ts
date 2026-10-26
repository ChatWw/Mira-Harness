import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import Page from '../src/pages/backend/personalization/index.vue'
import { createVueNodeRenderer, withVueClientRender, type VueTestNode } from './helpers/vueNodeRenderer'
const host = vi.hoisted(() => ({ api: undefined as any, leave: undefined as undefined | (() => Promise<boolean>), confirm: vi.fn(), error: vi.fn() }))
vi.mock('@/platform', () => ({ getPlatformApi: () => host.api, getPreference: (_key: string, fallback: unknown) => fallback }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: (guard: () => Promise<boolean>) => { host.leave = guard } }))
vi.mock('element-plus', () => ({ ElMessage: { error: host.error, success: vi.fn() }, ElMessageBox: { confirm: host.confirm } }))
vi.mock('../src/pages/backend/settings/components/SettingsPageShell.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('main', slots.default?.()) } }))
vi.mock('../src/pages/backend/settings/components/SettingsTooltip.vue', () => ({ default: { setup: (_: unknown, { slots }: any) => () => h('span', slots.default?.()) } }))
const ActualPage = withVueClientRender(Page, new URL('../src/pages/backend/personalization/index.vue', import.meta.url))
const components = Object.fromEntries(['ElButton','ElInput','ElSwitch','ElEmpty','ElAlert','ElRadioGroup','ElRadioButton','AppIcon'].map(name => [name, defineComponent({ inheritAttrs: false, setup: (_props, {attrs,slots}) => () => h(name,attrs,slots.default?.()) })]))
const mounted: Array<{unmount(): void}> = []
async function drain() { for(let i=0;i<15;i++){await Promise.resolve(); await nextTick()} }
function setup() {
 const renderer=createVueNodeRenderer(), {app}=renderer.mount(ActualPage,{},components);mounted.push(app)
 const text=(node:VueTestNode):string=>node.text+node.children.map(text).join('')
 const find=(type:string,label:string)=>{const node=renderer.all().find(node=>node.type===type&&(node.props['aria-label']===label||text(node)===label));if(!node)throw Error('Missing '+label);return node}
 return {text:()=>text(renderer.root), input:async(label:string,value:string)=>{(find('ElInput',label).props['onUpdate:modelValue'] as any)(value);await drain()}, click:async(label:string)=>{await (find('ElButton',label).props.onClick as any)();await drain()}, clickPath:async(label:string)=>{await (find('button',label).props.onClick as any)();await drain()} }
}
beforeEach(()=>{
 host.confirm.mockReset();host.confirm.mockResolvedValue(undefined);host.error.mockClear()
 let entries:any[]=[{id:'fact',content:'A saved fact',source:'manual',updatedAt:1}]
 host.api={getGlobalInstructions:vi.fn(async()=>''),getGlobalInstructionsPath:vi.fn(async()=>'/test/instructions'),getHarnessMemoryEnabled:vi.fn(async()=>true),getHarnessMemoryPath:vi.fn(async()=>'/test/memory'),listHarnessMemory:vi.fn(async()=>entries),listPendingHarnessMemory:vi.fn(async()=>[]),resetHarnessMemory:vi.fn(async()=>{entries=[];return 1}),saveGlobalInstructions:vi.fn(async()=>undefined),savePreference:vi.fn(async()=>undefined),revealHarnessSettingsFile:vi.fn(async()=>undefined)}
})
afterEach(()=>mounted.splice(0).forEach(app=>app.unmount()))
describe('instruction and memory settings recovery',()=>{
 it('reveals the selected settings file and reports file manager errors',async()=>{const view=setup();await drain();await view.clickPath('在文件管理器中显示自定义指令文件');await view.clickPath('在文件管理器中显示全局记忆文件');expect(host.api.revealHarnessSettingsFile.mock.calls).toEqual([['instructions'],['memory']]);host.api.revealHarnessSettingsFile.mockRejectedValueOnce(Error('file manager unavailable'));await view.clickPath('在文件管理器中显示全局记忆文件');expect(host.error).toHaveBeenCalledWith('file manager unavailable')})
 it('refreshes the rendered entries after memory reset',async()=>{const view=setup();await drain();expect(view.text()).toContain('A saved fact');await view.click('重置记忆');expect(host.api.resetHarnessMemory).toHaveBeenCalledOnce();expect(view.text()).not.toContain('A saved fact')})
 it('keeps unsaved instructions and blocks leaving when save fails',async()=>{const view=setup();await drain();await view.input('自定义指令','keep this draft');host.api.saveGlobalInstructions.mockRejectedValueOnce(Error('disk failure'));await view.click('保存');expect(host.error).toHaveBeenCalledWith('disk failure');host.confirm.mockRejectedValueOnce('cancel');expect(await host.leave?.()).toBe(false);expect(view.text()).toContain('自定义指令');await view.click('保存');expect(await host.leave?.()).toBe(true)})
})
