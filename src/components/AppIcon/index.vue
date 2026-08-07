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
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import * as ElementPlusIcons from '@element-plus/icons-vue'
import { getIconifyLibrary, isAvailableIconifyIcon } from './iconify'

const props = defineProps<{
  name: string
  size?: string | number
  color?: string
  label?: string
}>()

const iconifyReady = ref(false)
const elementIcon = computed(() => !props.name.includes(':') ? ElementPlusIcons[props.name as keyof typeof ElementPlusIcons] : undefined)

watch(() => props.name, async (name) => {
  iconifyReady.value = false
  if (!name || elementIcon.value) return
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
