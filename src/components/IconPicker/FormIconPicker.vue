<template>
  <IconPicker
    v-model="selectedIcon"
    :items="items"
    :libraries="libraries"
    :compact="compact"
    placeholder="选择图标"
    @library-change="loadLibraryItems"
    @visibility-change="loadElementItems"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import IconPicker from './index.vue'
import { iconifyLibraries, loadIconifyLibrary } from '@/components/AppIcon/iconify'
import type { IconPickerItem } from './types'

const props = withDefaults(defineProps<{ modelValue: string, compact?: boolean }>(), { compact: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const elementItems = ref<IconPickerItem[]>([])
const iconifyItems = ref<Record<string, IconPickerItem[]>>({})
const libraries = [
  { value: 'element', label: 'Element Plus' },
  ...iconifyLibraries.map(({ value, label }) => ({ value, label })),
]
const items = computed(() => {
  const fallback = props.modelValue && !props.modelValue.includes(':') && !elementItems.value.some(item => item.value === props.modelValue)
    ? [{ label: props.modelValue, value: props.modelValue, type: 'element' as const }]
    : []
  return [...fallback, ...elementItems.value, ...Object.values(iconifyItems.value).flat()]
})
const selectedIcon = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

watch(() => props.modelValue, value => {
  const [library] = value.split(':', 1)
  if (value.includes(':')) void loadLibraryItems(library)
}, { immediate: true })

async function loadLibraryItems(libraryName: string) {
  if (libraryName === 'element') return loadElementItems(true)
  if (iconifyItems.value[libraryName]) return
  const collection = await loadIconifyLibrary(`${libraryName}:`)
  if (!collection) return
  iconifyItems.value = {
    ...iconifyItems.value,
    [libraryName]: Object.keys(collection.icons)
      .map(name => ({ label: name, value: `${libraryName}:${name}`, type: 'iconify' as const }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  }
}

async function loadElementItems(visible: boolean) {
  if (!visible || elementItems.value.length) return
  const icons = await import('@element-plus/icons-vue')
  elementItems.value = Object.keys(icons)
    .map(label => ({ label, value: label, type: 'element' as const }))
    .sort((left, right) => left.label.localeCompare(right.label))
}
</script>

<style scoped lang="scss">
:deep(.icon-picker-trigger:not(.is-compact)) { width: 100%; }
</style>
