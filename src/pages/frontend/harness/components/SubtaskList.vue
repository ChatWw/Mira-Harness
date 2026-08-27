<template>
  <section v-if="subtasks.length" class="subtasks" aria-label="子任务">
    <p class="subtasks__title"><AppIcon name="Connection" />子任务 · {{ subtasks.length }}</p>
    <details v-for="task in subtasks" :key="task.id" class="subtask" :class="`is-${task.status}`">
      <summary>
        <AppIcon :name="statusIcon(task.status)" :class="{ 'is-spinning': task.status === 'running' || task.status === 'stopping' }" />
        <strong>{{ roleLabel(task.role) }}</strong>
        <span>{{ task.status }}</span>
        <time>{{ duration(task) }}<template v-if="usageLabel(task)"> · {{ usageLabel(task) }}</template></time>
        <button v-if="isActive(task.status) && stop" type="button" aria-label="停止子任务" title="停止子任务" @click.prevent="stop(task.id)"><AppIcon name="VideoPause" /></button>
        <AppIcon name="ArrowDown" class="subtask__chevron" />
      </summary>
      <p class="subtask__task">{{ task.task }}</p>
      <RunActivityList v-if="task.activities.length" :activities="task.activities" :completed-at="task.completedAt" />
      <pre v-if="task.report"><code>{{ task.report }}</code></pre>
      <p v-else-if="task.error" class="subtask__error">{{ task.error.message }}</p>
    </details>
  </section>
</template>

<script setup lang="ts">
import type { HarnessSubtask, HarnessSubtaskRole, HarnessSubtaskStatus } from '@/config/harness'
import RunActivityList from './RunActivityList.vue'

defineProps<{ subtasks: HarnessSubtask[], stop?: (id: string) => void }>()

const labels: Record<HarnessSubtaskRole, string> = { explorer: '探索', reviewer: '审查', tester: '测试', implementer: '实现' }
const roleLabel = (role: HarnessSubtaskRole) => labels[role]
const isActive = (status: HarnessSubtaskStatus) => status === 'queued' || status === 'running' || status === 'stopping'
const statusIcon = (status: HarnessSubtaskStatus) => isActive(status) ? 'Loading' : status === 'completed' ? 'CircleCheck' : 'CircleClose'
const duration = (task: HarnessSubtask) => {
  const value = Math.max(0, (task.completedAt || Date.now()) - (task.startedAt || task.createdAt))
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}s`
}
const usageLabel = (task: HarnessSubtask) => {
  if (!task.usage) return ''
  if (!task.usage.cost?.priced) return `${task.usage.totalTokens} token`
  return `${task.usage.cost.currency} ${task.usage.cost.total.toFixed(task.usage.cost.total >= 1 ? 2 : 4)}`
}
</script>

<style scoped lang="scss">
.subtasks { display: grid; gap: 6px; margin: 9px 0 0; }
.subtasks__title { display: flex; align-items: center; gap: 5px; margin: 0; color: var(--cp-text-secondary, #71717a); font-size: 11px; font-weight: 600; }
.subtask { border: 1px solid var(--cp-border-light, #f4f4f5); border-radius: 6px; background: var(--cp-bg-hover, #fafafa); }
.subtask summary { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 7px 9px; cursor: pointer; list-style: none; font-size: 11px; }
.subtask summary::-webkit-details-marker { display: none; }
.subtask strong { color: var(--cp-text, #18181b); font-size: 11px; }
.subtask summary > span { min-width: 0; overflow: hidden; color: var(--cp-text-tertiary, #a1a1aa); text-overflow: ellipsis; white-space: nowrap; }
.subtask time { margin-left: auto; color: var(--cp-text-tertiary, #a1a1aa); font-size: 11px; }
.subtask button { display: inline-grid; width: 22px; height: 22px; place-items: center; border: 0; border-radius: 4px; color: var(--cp-danger, #ef4444); background: transparent; cursor: pointer; }
.subtask button:hover { background: color-mix(in srgb, var(--cp-danger, #ef4444) 10%, transparent); }
.subtask__chevron { color: var(--cp-text-tertiary, #a1a1aa); font-size: 12px; transition: transform .12s ease; }
.subtask[open] .subtask__chevron { transform: rotate(180deg); }
.subtask__task, .subtask__error { margin: 0 9px 8px; color: var(--cp-text-secondary, #71717a); font-size: 11px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.subtask__error { color: var(--cp-danger, #ef4444); }
.subtask pre { max-height: 260px; margin: 8px 9px 9px; padding: 8px 10px; overflow: auto; border: 1px solid var(--cp-border-light, #f4f4f5); border-radius: 5px; color: var(--cp-text-secondary, #71717a); background: var(--cp-bg, #fff); font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.subtask.is-running > summary > :first-child { color: var(--cp-primary, #06b6d4); }
.subtask.is-completed > summary > :first-child { color: var(--cp-success, #10b981); }
.subtask.is-failed > summary > :first-child, .subtask.is-timed_out > summary > :first-child, .subtask.is-turn_limit > summary > :first-child { color: var(--cp-danger, #ef4444); }
.is-spinning { animation: subtask-spin 1s linear infinite; }
@keyframes subtask-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .is-spinning { animation: none; } }
</style>
