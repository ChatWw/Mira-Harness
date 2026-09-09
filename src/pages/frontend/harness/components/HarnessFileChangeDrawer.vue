<template>
  <el-drawer v-model="visible" :title="change?.path || '文件变更'" direction="rtl" size="min(720px, 58vw)">
    <div v-if="change" class="file-change-diff">
      <p>{{ change.tool === 'delete' ? '文件已移入 Mira 回收站。' : fileChangeSummary(change) }}</p>
      <pre v-if="change.diff" class="file-change-diff__content"><code><span v-for="(line, index) in change.diff.split('\n')" :key="index" :class="fileDiffLineClass(line)">{{ line || ' ' }}</span></code></pre>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HarnessFileChange } from '@/config/harness'

const props = defineProps<{ modelValue: boolean, change?: HarnessFileChange }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })

function fileChangeSummary(change: HarnessFileChange) {
  const lines = change.diff?.split('\n') || []
  const added = lines.filter(line => /^\+\d/.test(line)).length
  const removed = lines.filter(line => /^-\d/.test(line)).length
  return `${added} 行新增，${removed} 行删除`
}
function fileDiffLineClass(line: string) { return line.startsWith('+') ? 'is-added' : line.startsWith('-') ? 'is-removed' : '' }
</script>

<style scoped lang="scss">
.file-change-diff { display: grid; min-height: 0; gap: 14px; }.file-change-diff > p { margin: 0; color: var(--cp-text-secondary); font-size: 13px; line-height: 1.55; }.file-change-diff__content { max-height: calc(100vh - 160px); margin: 0; padding: 10px 0; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; background: var(--cp-bg-hover); color: var(--cp-text-secondary); font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; }.file-change-diff__content code { display: block; min-width: max-content; }.file-change-diff__content span { display: block; min-height: 18px; padding: 0 12px; }.file-change-diff__content span.is-added { color: color-mix(in srgb, var(--cp-success) 84%, var(--cp-text)); background: color-mix(in srgb, var(--cp-success) 10%, transparent); }.file-change-diff__content span.is-removed { color: color-mix(in srgb, var(--cp-danger) 84%, var(--cp-text)); background: color-mix(in srgb, var(--cp-danger) 10%, transparent); }
</style>
