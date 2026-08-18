<template>
  <el-popover v-model:visible="visible" placement="bottom-start" :width="420" trigger="click" popper-class="icon-picker-popper">
    <template #reference>
      <el-button class="icon-picker-trigger" :class="{ 'is-compact': compact }" :aria-label="compact ? `选择图标，当前为 ${selectedItem?.value || placeholder}` : '选择图标'" :title="compact ? selectedItem?.value : undefined">
        <AppIcon v-if="selectedItem" :name="selectedItem.value" />
        <span v-if="!compact" class="icon-picker-trigger__label">{{ selectedItem?.value || placeholder }}</span>
        <AppIcon v-if="!compact" class="icon-picker-trigger__arrow" name="ArrowDown" />
      </el-button>
    </template>

    <div class="icon-picker-panel">
      <el-tabs v-model="activeLibrary" class="icon-picker-tabs" stretch>
        <el-tab-pane v-for="library in displayLibraries" :key="library.value" :label="library.label" :name="library.value" />
      </el-tabs>
      <el-input v-model="keyword" clearable placeholder="搜索图标名称"><template #prefix><AppIcon name="Search" /></template></el-input>
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
          <AppIcon :name="item.value" />
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
import type { IconPickerItem } from './types'

const props = withDefaults(defineProps<{
  modelValue?: string
  items: IconPickerItem[]
  libraries?: Array<{ value: string, label: string }>
  placeholder?: string
  compact?: boolean
}>(), {
  modelValue: '',
  placeholder: '选择图标',
  compact: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [value: string]
  'library-change': [value: string]
}>()

const visible = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = 60
const activeLibrary = ref('element')

const selectedItem = computed(() => props.items.find(item => item.value === props.modelValue))
const displayLibraries = computed(() => props.libraries?.length ? props.libraries : [
  { value: 'element', label: 'Element Plus' },
  { value: 'lucide', label: 'Lucide' },
  { value: 'material-symbols', label: 'Material Symbols' },
  { value: 'tabler', label: 'Tabler' },
].filter(library => props.items.some(item => itemLibrary(item) === library.value)))
const libraryItems = computed(() => props.items.filter(item => itemLibrary(item) === activeLibrary.value))
const filteredItems = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  if (!normalizedKeyword) return libraryItems.value
  return libraryItems.value.filter(item => `${item.label} ${item.value}`.toLowerCase().includes(normalizedKeyword))
})
const visibleItems = computed(() => filteredItems.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch(keyword, () => { page.value = 1 })
watch(activeLibrary, () => {
  keyword.value = ''
  page.value = 1
  emit('library-change', activeLibrary.value)
})
watch(() => props.modelValue, value => {
  const item = props.items.find(candidate => candidate.value === value)
  if (item) activeLibrary.value = itemLibrary(item)
}, { immediate: true })

function itemLibrary(item: IconPickerItem) {
  return item.type === 'element' ? 'element' : item.value.split(':', 1)[0]
}

function select(value: string) {
  emit('update:modelValue', value)
  emit('select', value)
  visible.value = false
}
</script>

<style scoped lang="scss">
.icon-picker-trigger { position: relative; width: min(100%, 360px); justify-content: flex-start; gap: $spacing-sm; padding-right: 40px; color: var(--cp-text); }.icon-picker-trigger.is-compact { width: 40px; height: 40px; justify-content: center; padding: 0; }.icon-picker-trigger__label { min-width: 0; flex: 1; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }.icon-picker-trigger__arrow { position: absolute; right: $spacing-md; color: var(--cp-text-tertiary); pointer-events: none; }
.icon-picker-panel { display: flex; flex-direction: column; gap: $spacing-md; }.icon-picker-tabs { margin-bottom: -$spacing-xs; }.icon-picker-tabs :deep(.el-tabs__header) { margin-bottom: 0; }.icon-picker-tabs :deep(.el-tabs__item) { padding: 0 $spacing-sm; font-size: $font-xs; }.icon-picker-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); max-height: 300px; overflow-y: auto; border: 1px solid var(--cp-border); border-radius: $radius-md; }.icon-picker-option { display: flex; min-width: 0; min-height: 72px; align-items: center; justify-content: center; flex-direction: column; gap: $spacing-xs; padding: $spacing-sm; border: 0; border-right: 1px solid var(--cp-border); border-bottom: 1px solid var(--cp-border); color: var(--cp-text-secondary); background: transparent; cursor: pointer; transition: background $transition-fast, color $transition-fast; }.icon-picker-option:hover, .icon-picker-option:focus-visible, .icon-picker-option.is-selected { outline: 0; color: var(--cp-primary); background: var(--cp-primary-lighter); }.icon-picker-option :deep(.el-icon), .icon-picker-option :deep(svg) { font-size: 20px; }.icon-picker-option span { width: 100%; overflow: hidden; font-size: $font-xs; text-align: center; text-overflow: ellipsis; white-space: nowrap; }.icon-picker-pagination { justify-content: center; }
@include media-max($breakpoint-sm) { .icon-picker-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
