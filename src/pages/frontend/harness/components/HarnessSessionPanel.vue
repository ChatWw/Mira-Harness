<template>
  <aside class="session-panel">
    <section>
      <h2>会话信息</h2>
      <dl>
        <div><dt>模型</dt><dd>{{ modelId || '使用默认模型' }}</dd></div>
        <div><dt>权限</dt><dd>{{ permissionLabel }}</dd></div>
        <div><dt>工作目录</dt><dd>{{ projectDirectory || '尚未选择' }}</dd></div>
      </dl>
    </section>
    <section>
      <h2>工具调用</h2>
      <el-empty v-if="!toolCalls.length" description="调用工具后显示记录" :image-size="56" />
      <div v-for="tool in toolCalls" :key="tool.id" class="tool-row">
        <span :class="tool.status" />{{ tool.tool }}
        <small>{{ tool.target }}</small>
        <pre v-if="tool.diff" class="tool-diff">{{ tool.diff }}</pre>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import type { ToolCallRecord } from '@/config/harness'

defineProps<{
  modelId?: string
  permissionLabel: string
  projectDirectory?: string
  toolCalls: ToolCallRecord[]
}>()
</script>

<style scoped lang="scss">
.session-panel { min-width: 0; padding: 22px 18px; overflow-y: auto; background: color-mix(in srgb, var(--cp-bg-elevated) 88%, var(--cp-bg)); border-left: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }
.session-panel h2 { margin: 0 0 13px; color: var(--cp-text-secondary); font-size: 12px; font-weight: 600; }
.session-panel section + section { margin-top: 32px; padding-top: 24px; border-top: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }
.session-panel dl { margin: 0; }
.session-panel dl div { margin-bottom: 14px; }
.session-panel dt { color: var(--cp-text-tertiary); font-size: 11px; }
.session-panel dd { margin: 4px 0 0; overflow-wrap: anywhere; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; }
.tool-row { display: grid; grid-template-columns: 8px minmax(0, 1fr); gap: 6px; align-items: start; margin: 11px 0; color: var(--cp-text-secondary); font-size: 12px; }
.tool-row > span { width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: var(--cp-text-tertiary); }
.tool-row > span.running { background: var(--cp-primary); }
.tool-row > span.ok { background: var(--cp-success); }
.tool-row > span.failed { background: var(--cp-danger); }
.tool-row small { grid-column: 2; overflow: hidden; color: var(--cp-text-tertiary); text-overflow: ellipsis; white-space: nowrap; }
.tool-diff { grid-column: 1 / -1; max-height: 160px; margin: 4px 0 0; padding: 6px 8px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-sm, 4px); color: var(--cp-text-secondary); background: var(--cp-bg-hover); font: 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 1024px) { .session-panel { display: none; } }
</style>
