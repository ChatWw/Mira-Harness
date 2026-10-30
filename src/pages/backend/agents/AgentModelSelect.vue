<template>
  <el-dropdown ref="dropdown" trigger="click" :placement="placement || 'top-end'" :disabled="disabled" :show-arrow="false" :offset="4" :hide-on-click="false" popper-class="agent-model-menu" @visible-change="onVisibleChange" @command="select">
    <button ref="trigger" type="button" class="agent-model-trigger" :disabled="disabled" :aria-label="labelForControl" :aria-expanded="visible" aria-haspopup="menu" :title="label" @keydown.esc.stop.prevent="close">
      <span>{{ label }}</span><AppIcon name="lucide:chevron-down" />
    </button>
    <template #dropdown>
      <el-dropdown-menu :aria-label="labelForControl" @keydown.esc.stop.prevent="close">
        <el-dropdown-item v-if="unavailable" disabled>不可用 · {{ unavailableLabel || '原模型' }}</el-dropdown-item>
        <el-dropdown-item v-for="provider in availableProviders" :key="provider.id" class="agent-model-provider" :command="provider.id" @keydown.right.prevent="openProvider(provider.id)">
          <el-dropdown :ref="(value: unknown) => setSubmenu(provider.id, value)" trigger="hover" placement="left-start" :show-arrow="false" :offset="4" :show-timeout="80" :hide-timeout="180" popper-class="agent-model-menu agent-model-submenu" @command="select">
            <span :ref="(value: unknown) => setProviderTrigger(provider.id, value)" class="agent-model-provider-trigger" tabindex="0" aria-haspopup="menu" :aria-label="`${provider.name} 模型列表`" @click.stop="openProvider(provider.id)" @keydown.enter.stop.prevent="openProvider(provider.id)" @keydown.right.stop.prevent="openProvider(provider.id)"><span>{{ provider.name }}</span><small>API</small><AppIcon name="lucide:chevron-right" /></span>
            <template #dropdown>
              <el-dropdown-menu :aria-label="`${provider.name} 模型列表`" @keydown="(event: KeyboardEvent) => onSubmenuKeydown(event, provider.id)">
                <el-dropdown-item v-for="model in provider.models" :key="model.id" :command="modelKey(provider.id, model.id)" :aria-current="modelValue === modelKey(provider.id, model.id) ? 'true' : undefined"><span :title="model.id">{{ model.id }}</span><small v-if="model.multimodal">视觉</small><AppIcon v-if="modelValue === modelKey(provider.id, model.id)" name="lucide:check" /></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-dropdown-item>
        <el-dropdown-item command="inherit" :divided="Boolean(availableProviders.length || unavailable)" :aria-current="modelValue === 'inherit' ? 'true' : undefined"><span>继承默认</span><AppIcon v-if="modelValue === 'inherit'" name="lucide:check" /></el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropdownInstance } from 'element-plus'
import { isModelProviderAvailable, type ModelProviderSummary } from '@/config/harness'

const props = defineProps<{ modelValue: string; providers: ModelProviderSummary[]; disabled?: boolean; unavailableLabel?: string; labelForControl: string; placement?: 'top-end' | 'bottom-end' }>()
const emit = defineEmits<{ change: [value: string] }>()
const dropdown = ref<DropdownInstance>(), trigger = ref<HTMLButtonElement>(), visible = ref(false)
const submenus = new Map<string, DropdownInstance>(), providerTriggers = new Map<string, HTMLElement>()
const modelKey = (providerId: string, modelId: string) => JSON.stringify([providerId, modelId])
const availableProviders = computed(() => props.providers.filter(isModelProviderAvailable).map(provider => ({ ...provider, models: provider.models.filter(model => model.enabled && model.id.trim()) })))
const selected = computed(() => availableProviders.value.flatMap(provider => provider.models.map(model => ({ ...model, key: modelKey(provider.id, model.id) }))).find(model => model.key === props.modelValue))
const unavailable = computed(() => props.modelValue !== 'inherit' && !selected.value)
const label = computed(() => props.modelValue === 'inherit' ? '继承默认' : selected.value?.id || `不可用 · ${props.unavailableLabel || '原模型'}`)
function setSubmenu(id: string, value: unknown) { if (value) submenus.set(id, value as DropdownInstance); else submenus.delete(id) }
function setProviderTrigger(id: string, value: unknown) { if (value) providerTriggers.set(id, value as HTMLElement); else providerTriggers.delete(id) }
function openProvider(id: string) { if (!props.disabled) submenus.get(id)?.handleOpen() }
function closeProvider(id: string) { submenus.get(id)?.handleClose(); providerTriggers.get(id)?.focus() }
function onSubmenuKeydown(event: KeyboardEvent, id: string) {
  if (event.key !== 'ArrowLeft' && event.key !== 'Escape') return
  event.preventDefault(); event.stopPropagation(); closeProvider(id)
}
function onVisibleChange(value: boolean) { visible.value = value; if (!value) submenus.forEach(menu => menu.handleClose()) }
function close() { submenus.forEach(menu => menu.handleClose()); dropdown.value?.handleClose(); trigger.value?.focus() }
function select(value: string) {
  if (props.disabled) return
  if (availableProviders.value.some(provider => provider.id === value)) { openProvider(value); return }
  if (value !== 'inherit' && !availableProviders.value.some(provider => provider.models.some(model => modelKey(provider.id, model.id) === value))) return
  if (value !== props.modelValue) emit('change', value)
  close()
}
</script>

<style scoped>
.agent-model-trigger { display: inline-flex; width: fit-content; max-width: 208px; min-width: 0; height: 32px; align-items: center; justify-content: space-between; gap: 8px; padding: 0 12px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-bg); color: var(--cp-text); font: inherit; font-size: var(--settings-text-base, 13px); cursor: pointer; }
.agent-model-trigger > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-model-trigger :deep(.app-icon) { width: 12px; height: 12px; flex: none; color: var(--cp-text-secondary); }
.agent-model-trigger:hover, .agent-model-trigger[aria-expanded='true'] { border-color: var(--cp-text-tertiary); }
.agent-model-trigger:focus-visible { outline: 2px solid var(--cp-text-secondary); outline-offset: 2px; }
.agent-model-trigger:disabled { opacity: .5; cursor: default; }
</style>

<style lang="scss">
.agent-model-menu.el-popper { min-width: 192px; max-width: min(360px, calc(100vw - 32px)); border-radius: 8px; }
.agent-model-menu {
  .el-dropdown-menu { max-height: min(360px, calc(100vh - 100px)); overflow: auto; padding: 4px; border-radius: inherit; }
  .el-dropdown-menu__item { display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 6px 8px; border-radius: 4px; font-size: 13px; font-weight: 400; line-height: 20px; }
  .el-dropdown-menu__item > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .el-dropdown-menu__item > .app-icon:last-child { margin-left: auto; }
  .app-icon { width: 14px; height: 14px; flex: none; color: var(--cp-text-secondary); }
  small { flex: none; padding: 0 4px; border-radius: 4px; background: var(--cp-bg-hover); color: var(--cp-text-secondary); font-size: 10px; line-height: 16px; }
  .agent-model-provider { padding: 0; }
  .agent-model-provider > .el-dropdown { display: flex; width: 100%; color: inherit; font: inherit; }
  .agent-model-provider-trigger { display: flex; width: 100%; align-items: center; gap: 6px; padding: 6px 8px; outline: none; cursor: pointer; }
  .agent-model-provider-trigger > span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .agent-model-provider-trigger:focus-visible { background: var(--cp-bg-hover); border-radius: 4px; }
  .el-dropdown-menu__item--divided { margin: 4px 0 0; border-top-color: var(--cp-border-light); }
}
</style>
