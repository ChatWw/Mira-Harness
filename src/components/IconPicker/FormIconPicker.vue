<template>
  <IconPicker
    v-model="selectedIcon"
    :items="items"
    :libraries="libraries"
    placeholder="选择图标"
    @library-change="loadLibraryItems"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import * as ElementPlusIcons from '@element-plus/icons-vue'
import IconPicker from './index.vue'
import { iconifyLibraries, loadIconifyLibrary } from '@/components/AppIcon/iconify'
import type { IconPickerItem } from './types'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const elementItems: IconPickerItem[] = Object.keys(ElementPlusIcons)
  .map(label => ({ label, value: label, type: 'element' as const }))
  .sort((left, right) => left.label.localeCompare(right.label))
const iconifyItems = ref<Record<string, IconPickerItem[]>>({})
const libraries = [
  { value: 'element', label: 'Element Plus' },
  ...iconifyLibraries.map(({ value, label }) => ({ value, label })),
]
const items = computed(() => [...elementItems, ...Object.values(iconifyItems.value).flat()])
const selectedIcon = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

watch(() => props.modelValue, value => {
  const [library] = value.split(':', 1)
  if (value.includes(':')) void loadLibraryItems(library)
}, { immediate: true })

async function loadLibraryItems(libraryName: string) {
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
</script>

<style scoped lang="scss">
:deep(.icon-picker-trigger) { width: 100%; }
</style>
