<template>
  <el-icon v-if="elementIcon" v-bind="$attrs" class="app-icon" :size="size" :color="color" :aria-label="label">
    <component :is="elementIcon" />
  </el-icon>
  <Icon
    v-else-if="iconifyReady"
    v-bind="$attrs"
    class="app-icon"
    :icon="name"
    :width="size || undefined"
    :height="size || undefined"
    :style="color ? { color } : undefined"
    :aria-label="label"
  />
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch, type Component } from 'vue'
import { Icon } from '@iconify/vue'
import { getIconifyLibrary, isAvailableIconifyIcon } from './iconify'
import { elementIcons } from './elementIcons'

const props = defineProps<{
  name: string
  size?: string | number
  color?: string
  label?: string
}>()

const iconifyReady = ref(false)
const loadedElementIcon = shallowRef<Component>()
const elementIcon = computed(() => !props.name.includes(':') ? elementIcons[props.name as keyof typeof elementIcons] || loadedElementIcon.value : undefined)

watch(() => props.name, async (name) => {
  iconifyReady.value = false
  loadedElementIcon.value = undefined
  if (!name || elementIcons[name as keyof typeof elementIcons]) return
  if (!name.includes(':')) {
    const icons = await import('@element-plus/icons-vue')
    loadedElementIcon.value = icons[name as keyof typeof icons] as Component | undefined
    if (!loadedElementIcon.value) warnInvalidIcon(name)
    return
  }
  if (!getIconifyLibrary(name)) return warnInvalidIcon(name)
  if (await isAvailableIconifyIcon(name)) iconifyReady.value = true
  else warnInvalidIcon(name)
}, { immediate: true })

function warnInvalidIcon(name: string) {
  if (import.meta.env.DEV) console.warn(`[AppIcon] 未找到图标：${name}`)
}
</script>

<style scoped lang="scss">
.app-icon { flex: 0 0 auto; vertical-align: middle; }
</style>
