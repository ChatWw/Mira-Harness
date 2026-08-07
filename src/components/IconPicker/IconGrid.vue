<template>
  <div class="icon-grid-wrap">
    <div class="icon-grid" role="listbox" aria-label="图标列表">
      <button
        v-for="item in pageItems"
        :key="item.value"
        class="icon-grid__item"
        :class="{ 'is-selected': item.value === modelValue }"
        type="button"
        :title="item.value"
        :aria-label="`选择 ${item.value}`"
        :aria-selected="item.value === modelValue"
        @click="select(item.value)"
      >
        <AppIcon :name="item.value" :size="22" />
        <span>{{ item.label }}</span>
      </button>
    </div>
    <el-empty v-if="!items.length" :image-size="64" description="没有匹配的图标" />
    <el-pagination
      v-if="items.length > pageSize"
      v-model:current-page="page"
      class="icon-grid-pagination"
      background
      small
      layout="prev, pager, next"
      :page-size="pageSize"
      :total="items.length"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { IconPickerItem } from './types'

const props = defineProps<{
  modelValue: string
  items: IconPickerItem[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [value: string]
}>()

const page = ref(1)
const pageSize = 120
const pageItems = computed(() => props.items.slice((page.value - 1) * pageSize, page.value * pageSize))

watch(() => props.items, () => { page.value = 1 })

function select(value: string) {
  emit('update:modelValue', value)
  emit('select', value)
}
</script>

<style scoped lang="scss">
.icon-grid-wrap { min-height: 240px; }.icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); border-top: 1px solid var(--cp-border); }.icon-grid__item { display: flex; min-width: 0; min-height: 88px; align-items: center; justify-content: center; flex-direction: column; gap: $spacing-sm; padding: $spacing-sm; border: 0; border-right: 1px solid var(--cp-border); border-bottom: 1px solid var(--cp-border); color: var(--cp-text-secondary); background: transparent; cursor: pointer; transition: color $transition-fast, background $transition-fast; }.icon-grid__item:hover, .icon-grid__item:focus-visible, .icon-grid__item.is-selected { outline: 0; color: var(--cp-primary); background: var(--cp-primary-lighter); }.icon-grid__item span { width: 100%; overflow: hidden; font-size: $font-xs; text-align: center; text-overflow: ellipsis; white-space: nowrap; }.icon-grid-pagination { justify-content: center; padding: $spacing-md; }
@include media-max($breakpoint-sm) { .icon-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
