<template>
  <div class="plugin-row">
    <button type="button" class="plugin-row-main" :aria-label="`查看插件 ${label}`" @click="$emit('open', item)">
      <span class="plugin-avatar"><img v-if="src && !failed" :src="src" alt="" referrerpolicy="no-referrer" @error="failed = true" /><AppIcon v-else name="lucide:blocks" /></span>
      <span class="plugin-copy"><strong>{{ label }}</strong><span class="plugin-description">{{ item.error || item.unavailableReason || item.description }}</span><small class="plugin-scope"><AppIcon name="lucide:user-round" />用户</small></span>
    </button>
    <el-dropdown trigger="click" @command="$emit('remove', item)"><button class="plugin-more" type="button" :disabled="busy" :aria-label="`更多操作 ${label}`"><AppIcon name="lucide:ellipsis" /></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="remove">移除插件</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
    <el-switch :model-value="item.enabled" :disabled="busy || Boolean(item.error && !item.enabled)" :aria-label="`启用插件 ${label}`" @change="$emit('toggle', item, Boolean($event))" />
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MiraPluginItem } from '@/config/miraPlugins'
import icons from '../../../../apps/harness-react/src/components/extensions/plugin-icons.json'
const props = defineProps<{ item: MiraPluginItem; busy: boolean }>()
defineEmits<{ open: [item: MiraPluginItem]; remove: [item: MiraPluginItem]; toggle: [item: MiraPluginItem, enabled: boolean] }>()
const failed = ref(false)
const label = computed(() => props.item.listing?.displayName || props.item.name)
const src = computed(() => { const name = props.item.listing?.icon || props.item.name; return icons[name as keyof typeof icons] || (/^https:\/\//.test(name) ? name : undefined) })
</script>
<style scoped>
.plugin-row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--cp-border-light); }
.plugin-row:last-child { border-bottom: 0; }
.plugin-row:hover { background: var(--cp-bg-hover); }
.plugin-row-main { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; padding: 0; }
.plugin-avatar { display: grid; place-items: center; flex: 0 0 36px; height: 36px; background: var(--cp-bg); border-radius: 9px; }
.plugin-avatar img { width: 26px; height: 26px; object-fit: contain; }
.plugin-copy { display: grid; gap: 4px; min-width: 0; }
strong { font-size: 14px; font-weight: 500; }
.plugin-description { font-size: 12px; color: var(--cp-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plugin-scope { display: inline-flex; align-items: center; gap: 4px; justify-self: start; border: 1px solid var(--cp-border-light); border-radius: 12px; padding: 1px 7px; font-size: 11px; line-height: 16px; color: var(--cp-text-secondary); }
.plugin-more { display: grid; place-items: center; border: 0; width: 28px; height: 28px; border-radius: 6px; background: none; color: var(--cp-text-secondary); cursor: pointer; opacity: 0; }
.plugin-row:hover .plugin-more, .plugin-more:focus-visible, .plugin-more[aria-expanded=true] { opacity: 1; }
.plugin-row :deep(.el-switch) { --el-switch-height: 18px; --el-switch-button-size: 14px; --el-switch-core-border-radius: 12px; }
.plugin-row :deep(.el-switch__core) { min-width: 32px; }
button:focus-visible { outline: 2px solid var(--cp-text); outline-offset: 3px; }
</style>
