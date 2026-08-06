<template>
  <el-popover v-model:visible="visible" placement="bottom-start" :width="420" trigger="click" popper-class="icon-picker-popper">
    <template #reference>
      <el-button class="icon-picker-trigger" aria-label="选择图标">
        <el-icon v-if="selectedItem?.type === 'element' && selectedItem.component"><component :is="selectedItem.component" /></el-icon>
        <Icon v-else-if="selectedItem" :icon="selectedItem.value" />
        <span class="icon-picker-trigger__label">{{ selectedItem?.value || placeholder }}</span>
        <el-icon class="icon-picker-trigger__arrow"><ArrowDown /></el-icon>
      </el-button>
    </template>

    <div class="icon-picker-panel">
      <el-input v-model="keyword" clearable placeholder="搜索图标名称" :prefix-icon="Search" />
      <div class="icon-picker-grid" role="listbox" aria-label="图标列表">
        <button
          v-for="item in visibleItems"
          :key="item.value"
          class="icon-picker-option"
          :class="{ 'is-selected': item.value === modelValue }"
          type="button"
          :title="item.value"
          :aria-label="`选择 ${item.value}`"
          :aria-selected="item.value === modelValue"
          @click="select(item.value)"
        >
          <el-icon v-if="item.type === 'element' && item.component"><component :is="item.component" /></el-icon>
          <Icon v-else :icon="item.value" />
          <span>{{ item.label }}</span>
        </button>
      </div>
      <el-empty v-if="!visibleItems.length" :image-size="56" description="没有匹配的图标" />
      <el-pagination
        v-if="filteredItems.length > pageSize"
        v-model:current-page="page"
        class="icon-picker-pagination"
        background
        small
        layout="prev, pager, next"
        :page-size="pageSize"
        :total="filteredItems.length"
      />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ArrowDown, Search } from '@element-plus/icons-vue'
import type { IconPickerItem } from './types'

const props = withDefaults(defineProps<{
  modelValue?: string
  items: IconPickerItem[]
  placeholder?: string
}>(), {
  modelValue: '',
  placeholder: '选择图标',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const visible = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = 60

const selectedItem = computed(() => props.items.find(item => item.value === props.modelValue))
const filteredItems = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  if (!normalizedKeyword) return props.items
  return props.items.filter(item => `${item.label} ${item.value}`.toLowerCase().includes(normalizedKeyword))
})
const visibleItems = computed(() => filteredItems.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch(keyword, () => { page.value = 1 })

function select(value: string) {
  emit('update:modelValue', value)
  visible.value = false
}
</script>

<style scoped lang="scss">
.icon-picker-trigger { width: min(100%, 360px); justify-content: flex-start; gap: $spacing-sm; color: var(--cp-text); }.icon-picker-trigger__label { min-width: 0; flex: 1; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }.icon-picker-trigger__arrow { color: var(--cp-text-tertiary); }
.icon-picker-panel { display: flex; flex-direction: column; gap: $spacing-md; }.icon-picker-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); max-height: 300px; overflow-y: auto; border: 1px solid var(--cp-border); border-radius: $radius-md; }.icon-picker-option { display: flex; min-width: 0; min-height: 72px; align-items: center; justify-content: center; flex-direction: column; gap: $spacing-xs; padding: $spacing-sm; border: 0; border-right: 1px solid var(--cp-border); border-bottom: 1px solid var(--cp-border); color: var(--cp-text-secondary); background: transparent; cursor: pointer; transition: background $transition-fast, color $transition-fast; }.icon-picker-option:hover, .icon-picker-option:focus-visible, .icon-picker-option.is-selected { outline: 0; color: var(--cp-primary); background: var(--cp-primary-lighter); }.icon-picker-option :deep(.el-icon), .icon-picker-option :deep(svg) { font-size: 20px; }.icon-picker-option span { width: 100%; overflow: hidden; font-size: $font-xs; text-align: center; text-overflow: ellipsis; white-space: nowrap; }.icon-picker-pagination { justify-content: center; }
@include media-max($breakpoint-sm) { .icon-picker-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
