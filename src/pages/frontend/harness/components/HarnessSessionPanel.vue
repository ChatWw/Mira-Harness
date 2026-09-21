<template>
  <aside class="session-panel" aria-label="工作面板">
    <header class="session-panel__header">
      <div><h2>工作面板</h2><p>{{ panelSummary }}</p></div>
      <el-tooltip content="关闭工作面板" placement="left"><button type="button" class="session-panel__close" aria-label="关闭工作面板" @click="$emit('close')"><AppIcon name="Close" /></button></el-tooltip>
    </header>

    <div class="session-panel__tabs" role="tablist" aria-label="工作面板内容">
      <button v-for="tab in tabs" :key="tab.id" type="button" role="tab" :aria-selected="activeTab === tab.id" :class="{ 'is-active': activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}<small v-if="tab.count">{{ tab.count }}</small></button>
    </div>

    <section v-if="activeTab === 'task'" class="session-panel__content" aria-label="当前任务">
      <div class="task-state" :class="{ 'is-running': running }"><AppIcon :name="running ? 'Loading' : 'CircleCheck'" :class="{ 'is-spinning': running }" /><span>{{ taskState }}</span></div>
      <div v-if="activeRun?.activities.length" class="task-section"><h3>执行进度</h3><ol class="activity-list"><li v-for="activity in activeRun.activities" :key="activity.id" :class="`is-${activity.status}`"><AppIcon :name="activityIcon(activity.status)" /><span>{{ activity.label }}</span></li></ol></div>
      <div v-if="fileChanges.length" class="task-section"><h3>文件变更</h3><button v-for="change in fileChanges" :key="change.toolCallId" type="button" class="file-change" @click="$emit('open-file-change', change)"><AppIcon :name="change.tool === 'delete' ? 'Delete' : 'Document'" /><span><strong>{{ change.path }}</strong><small>{{ fileChangeSummary(change) }}</small></span><AppIcon name="ArrowRight" /></button></div>
      <el-empty v-if="!activeRun?.activities.length && !fileChanges.length" description="本次任务没有可展开的执行详情" :image-size="56" />
    </section>

    <section v-else-if="activeTab === 'session'" class="session-panel__content" aria-label="会话信息">
      <h3>会话信息</h3>
      <dl class="session-details"><div><dt>模型</dt><dd>{{ modelId || '使用默认模型' }}</dd></div><div><dt>权限</dt><dd>{{ permissionLabel }}</dd></div><div><dt>工作目录</dt><dd>{{ projectDirectory || '尚未选择' }}</dd></div></dl>
    </section>

    <section v-else class="session-panel__content" aria-label="执行详情">
      <h3>执行详情</h3>
      <p class="session-panel__hint">用于审计 Agent 的原始工具调用。</p>
      <el-empty v-if="!toolCalls.length" description="调用工具后显示记录" :image-size="56" />
      <div v-for="tool in toolCalls" :key="tool.id" class="tool-row">
        <span :class="tool.status" /><div><strong>{{ toolLabel(tool.tool) }}</strong><small v-if="tool.target">{{ tool.target }}</small><p v-if="tool.error">{{ tool.error }}</p><pre v-if="tool.diff">{{ tool.diff }}</pre></div>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HarnessActiveRun, HarnessFileChange, HarnessRunActivity, ToolCallRecord } from '@/config/harness'

const props = withDefaults(defineProps<{
  modelId?: string
  permissionLabel: string
  projectDirectory?: string
  toolCalls: ToolCallRecord[]
  activeRun?: Pick<HarnessActiveRun, 'activities'>
  running?: boolean
  fileChanges?: HarnessFileChange[]
}>(), { running: false, fileChanges: () => [] })

defineEmits<{ close: [], 'open-file-change': [change: HarnessFileChange] }>()

const activeTab = ref<'task' | 'session' | 'details'>('task')
const tabs = computed(() => [
  { id: 'task' as const, label: '当前任务', count: props.running ? '进行中' : props.fileChanges.length || undefined },
  { id: 'session' as const, label: '会话' },
  { id: 'details' as const, label: '执行详情', count: props.toolCalls.length || undefined },
])
const panelSummary = computed(() => props.running ? '正在执行' : props.fileChanges.length ? `已修改 ${props.fileChanges.length} 个文件` : '会话状态与执行记录')
const taskState = computed(() => props.running ? '正在执行任务' : props.fileChanges.length ? `任务已完成，修改了 ${props.fileChanges.length} 个文件` : '最近任务已完成')

function activityIcon(status: HarnessRunActivity['status']) {
  return status === 'running' ? 'Loading' : status === 'completed' ? 'CircleCheck' : status === 'failed' ? 'CircleClose' : 'Circle'
}

function toolLabel(tool: string) {
  return ({ list_files: '浏览文件', read: '读取文件', bash: '执行命令', edit: '编辑文件', write: '写入文件', delete: '删除文件' } as Record<string, string>)[tool] || tool
}

function fileChangeSummary(change: HarnessFileChange) {
  if (change.tool === 'delete') return '已移入回收站'
  const lines = change.diff?.split('\n') || []
  const added = lines.filter(line => /^\+\d/.test(line)).length
  const removed = lines.filter(line => /^-\d/.test(line)).length
  return `${change.tool === 'write' ? '已写入' : '已编辑'}${added || removed ? ` · +${added} -${removed}` : ''}`
}
</script>

<style scoped lang="scss">
.session-panel { display: flex; min-width: 0; overflow: hidden; flex-direction: column; background: var(--cp-bg-elevated); border-left: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }
.session-panel__header { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--cp-border-light); }.session-panel__header h2 { margin: 0; color: var(--cp-text); font-size: 13px; font-weight: 600; }.session-panel__header p { margin: 3px 0 0; color: var(--cp-text-tertiary); font-size: 11px; }.session-panel__close { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; padding: 0; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; cursor: pointer; }.session-panel__close:hover, .session-panel__close:focus-visible { color: var(--cp-text); background: var(--cp-bg-hover); outline: none; }
.session-panel__tabs { display: flex; gap: 2px; padding: 8px 10px; border-bottom: 1px solid var(--cp-border-light); }.session-panel__tabs button { display: inline-flex; min-width: 0; height: 28px; align-items: center; gap: 4px; padding: 0 7px; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 11px; white-space: nowrap; cursor: pointer; }.session-panel__tabs button:hover { color: var(--cp-text); background: var(--cp-bg-hover); }.session-panel__tabs button.is-active { color: var(--cp-text); background: var(--cp-bg-hover); font-weight: 600; }.session-panel__tabs small { color: var(--cp-text-tertiary); font-size: 10px; font-weight: 400; }
.session-panel__content { flex: 1; padding: 18px 14px; overflow-y: auto; }.session-panel__content h3 { margin: 0 0 10px; color: var(--cp-text-secondary); font-size: 12px; font-weight: 600; }.session-panel__hint { margin: -4px 0 14px; color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.5; }
.task-state { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 20px; color: var(--cp-success); font-size: 12px; font-weight: 500; }.task-state.is-running { color: var(--cp-primary); }.is-spinning { animation: panel-spin 1s linear infinite; }
.task-section + .task-section { margin-top: 22px; }.activity-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }.activity-list li { display: flex; align-items: flex-start; gap: 7px; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.45; }.activity-list li > .app-icon { flex: 0 0 auto; margin-top: 1px; color: var(--cp-text-tertiary); font-size: 14px; }.activity-list li.is-running, .activity-list li.is-running > .app-icon { color: var(--cp-primary); }.activity-list li.is-failed, .activity-list li.is-failed > .app-icon { color: var(--cp-danger); }.activity-list li.is-completed > .app-icon { color: var(--cp-success); }
.file-change { display: grid; width: 100%; grid-template-columns: 18px minmax(0, 1fr) 14px; align-items: center; gap: 8px; padding: 8px 0; border: 0; border-top: 1px solid var(--cp-border-light); color: var(--cp-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }.file-change:first-of-type { border-top: 0; }.file-change > span { display: grid; min-width: 0; gap: 2px; }.file-change strong, .file-change small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.file-change strong { color: var(--cp-text); font: 11px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }.file-change small { color: var(--cp-text-tertiary); font-size: 10px; }.file-change > .app-icon { color: var(--cp-text-tertiary); font-size: 14px; }.file-change:hover strong { color: var(--cp-primary); }.file-change:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.session-details { margin: 0; }.session-details div + div { margin-top: 18px; }.session-details dt { color: var(--cp-text-tertiary); font-size: 11px; }.session-details dd { margin: 4px 0 0; overflow-wrap: anywhere; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; }
.tool-row { display: grid; grid-template-columns: 8px minmax(0, 1fr); gap: 7px; margin: 12px 0; color: var(--cp-text-secondary); font-size: 12px; }.tool-row > span { width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: var(--cp-text-tertiary); }.tool-row > span.running { background: var(--cp-primary); }.tool-row > span.ok { background: var(--cp-success); }.tool-row > span.failed { background: var(--cp-danger); }.tool-row > span.waiting-confirm { background: var(--cp-warning); }.tool-row > div { display: grid; min-width: 0; gap: 3px; }.tool-row strong { color: var(--cp-text-secondary); font-size: 12px; font-weight: 500; }.tool-row small, .tool-row p { margin: 0; overflow-wrap: anywhere; color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.45; }.tool-row p { color: var(--cp-danger); }.tool-row pre { max-height: 160px; margin: 4px 0 0; padding: 6px 8px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font: 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
@keyframes panel-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .is-spinning { animation: none; } }
</style>
