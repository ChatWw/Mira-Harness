<template>
  <el-dropdown ref="dropdown" trigger="click" placement="bottom-start" :disabled="disabled" :show-arrow="false" :offset="2" popper-class="settings-scope-menu" @command="select" @visible-change="open = $event">
    <button ref="trigger" type="button" class="settings-scope-trigger" :disabled="disabled" :aria-label="`设置范围：${selected?.name || '全局'}`" :aria-expanded="open" @keydown.esc.stop.prevent="close">
      <AppIcon :name="extraScopes.find(scope => scope.id === modelValue)?.icon || (selected ? 'lucide:folder' : 'lucide:monitor')" /><span>{{ selected?.name || '全局' }}</span><AppIcon class="settings-scope-chevron" name="lucide:chevron-down" />
    </button>
    <template #dropdown>
      <el-dropdown-menu aria-label="设置范围" @keydown.esc.stop.prevent="close">
        <el-dropdown-item command="global" :aria-current="modelValue === 'global' ? 'true' : undefined"><AppIcon name="lucide:monitor" /><span>全局</span><AppIcon v-if="modelValue === 'global'" class="settings-scope-check" name="lucide:check" /></el-dropdown-item>
        <el-dropdown-item v-for="scope in extraScopes" :key="scope.id" :command="scope.id" :aria-current="modelValue === scope.id ? 'true' : undefined"><AppIcon :name="scope.icon" /><span>{{ scope.name }}</span><AppIcon v-if="modelValue === scope.id" class="settings-scope-check" name="lucide:check" /></el-dropdown-item>
        <template v-if="workspaces.length">
          <li class="settings-scope-separator" role="separator" />
          <li class="settings-scope-heading" role="presentation">工作区</li>
          <el-dropdown-item v-for="workspace in workspaces" :key="workspace.id" :command="workspace.id" :aria-current="modelValue === workspace.id ? 'true' : undefined"><AppIcon name="lucide:folder" /><span :title="workspace.name">{{ workspace.name }}</span><AppIcon v-if="modelValue === workspace.id" class="settings-scope-check" name="lucide:check" /></el-dropdown-item>
        </template>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropdownInstance } from 'element-plus'

const props = withDefaults(defineProps<{
  modelValue: string
  workspaces?: Array<{ id: string; name: string }>
  extraScopes?: Array<{ id: string; name: string; icon: string }>
  disabled?: boolean
}>(), { workspaces: () => [], extraScopes: () => [], disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const open = ref(false), trigger = ref<HTMLButtonElement>()
const dropdown = ref<DropdownInstance>()
const selected = computed(() => [...props.workspaces, ...props.extraScopes].find(workspace => workspace.id === props.modelValue))
function close() { dropdown.value?.handleClose(); trigger.value?.focus() }
function select(value: string) {
  if (props.disabled || value !== 'global' && ![...props.workspaces, ...props.extraScopes].some(workspace => workspace.id === value)) return
  if (value !== props.modelValue) emit('update:modelValue', value)
  trigger.value?.focus()
}
</script>

<style scoped>
.settings-scope-trigger { display: inline-flex; flex: none; max-width: 256px; height: 28px; align-items: center; gap: 4px; padding: 0 8px; border: 1px solid var(--cp-border); border-radius: 999px; background: transparent; color: var(--cp-text); font: inherit; font-size: var(--settings-text-base, 13px); cursor: pointer; }
.settings-scope-trigger:hover, .settings-scope-trigger[aria-expanded='true'] { background: var(--cp-bg-hover); }
.settings-scope-trigger:focus-visible { outline: 2px solid var(--cp-text-secondary); outline-offset: 2px; }
.settings-scope-trigger:disabled { cursor: default; opacity: .5; }
.settings-scope-trigger span { min-width: 0; max-width: 192px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-scope-trigger :deep(.app-icon) { flex: none; width: 14px; height: 14px; }
.settings-scope-chevron { color: var(--cp-text-tertiary); }
</style>

<style lang="scss">
.settings-scope-menu.el-popper { width: 256px; max-width: calc(100vw - 32px); border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-lg); background: var(--cp-bg-overlay); color: var(--cp-text); box-shadow: 0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1); }
.settings-scope-menu {
  .el-dropdown-menu { display: flex; flex-direction: column; gap: 2px; max-height: 360px; overflow: auto; padding: 4px; border-radius: inherit; background: transparent; box-shadow: none; }
  .el-dropdown-menu__item { display: flex; min-height: 32px; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--cp-radius-md); color: var(--cp-text); font-size: var(--settings-text-base, 13px); font-weight: 500; line-height: 20px; }
  .el-dropdown-menu__item:not(.is-disabled):is(:hover, :focus) { background: var(--cp-bg-hover); color: var(--cp-text); }
  .el-dropdown-menu__item > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .app-icon { flex: none; width: 16px; height: 16px; }
  .settings-scope-check { color: var(--cp-text-secondary); }
  .settings-scope-separator { height: 1px; margin: 4px -4px; background: var(--cp-border-light); }
  .settings-scope-heading { padding: 6px 8px; color: var(--cp-text-tertiary); font-size: var(--settings-text-base, 13px); line-height: 20px; }
}
</style>
