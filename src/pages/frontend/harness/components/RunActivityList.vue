<template>
  <ul class="run-activities">
    <li v-for="activity in activities" :key="activity.id" :class="['run-activity-row', `is-${activity.status}`]">
      <span class="run-activity-row__status">
        <AppIcon :name="statusIcon(activity.status)" :class="{ 'is-spinning': activity.status === 'running' }" />
      </span>
      <details v-if="activity.detail" class="run-activity">
        <summary>
          <span class="run-activity__label">{{ activity.label }}</span>
          <AppIcon name="ArrowDown" class="run-summary__chevron" />
          <time>{{ formatDuration(durationOf(activity)) }}</time>
        </summary>
        <pre><code>{{ activity.detail }}</code></pre>
      </details>
      <template v-else>
        <span class="run-activity__label">{{ activity.label }}</span>
        <time>{{ formatDuration(durationOf(activity)) }}</time>
      </template>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { HarnessRunActivity } from '@/config/harness'

const props = defineProps<{
  activities: HarnessRunActivity[]
  /** 已完成运行的结束时间，用于给未标注完成时间的活动补足时长。 */
  completedAt?: number
}>()

const statusIcon = (status: HarnessRunActivity['status']) =>
  status === 'running' ? 'Loading'
    : status === 'completed' ? 'CircleCheck'
      : status === 'failed' ? 'CircleClose'
        : 'Circle'

function formatDuration(value: number) {
  const milliseconds = Math.max(0, value)
  return milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)}s`
}

function durationOf(activity: HarnessRunActivity) {
  const end = activity.completedAt ?? props.completedAt ?? Date.now()
  return Math.max(0, end - activity.startedAt)
}
</script>

<style scoped lang="scss">
.run-activities {
  display: grid;
  gap: 6px;
  margin: 9px 0 0;
  padding: 9px 0 0 12px;
  border-left: 1px solid var(--cp-border-light, #f4f4f5);
  list-style: none;
}

.run-activity-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 18px;
  color: var(--cp-text-secondary, #71717a);

  &__status {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    width: 15px;
    color: var(--cp-text-tertiary, #a1a1aa);
    font-size: 13px;

    .is-spinning { animation: run-activity-spin 1s linear infinite; }
  }

  &.is-running .run-activity-row__status,
  &.is-running .run-activity__label { color: var(--cp-primary, #06b6d4); }

  &.is-completed .run-activity-row__status { color: var(--cp-success, #10b981); }

  &.is-failed .run-activity-row__status,
  &.is-failed .run-activity__label { color: var(--cp-danger, #ef4444); }

  &.is-pending .run-activity__label { color: var(--cp-text-tertiary, #a1a1aa); }
}

.run-activity {
  flex: 1 1 auto;
  min-width: 0;

  summary {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    width: 100%;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker { display: none; }

  pre {
    margin: 7px 0 0;
    padding: 8px 10px;
    overflow: auto;
    border: 1px solid var(--cp-border-light, #f4f4f5);
    border-radius: 6px;
    color: var(--cp-text-secondary, #71717a);
    background: var(--cp-bg-hover, #fafafa);
    font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  code { font: inherit; }
}

.run-activity__label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.run-activities time { flex: 0 0 auto; color: var(--cp-text-tertiary, #a1a1aa); font-size: 11px; }

.run-summary__chevron {
  flex: 0 0 auto;
  color: var(--cp-text-tertiary, #a1a1aa);
  font-size: 12px;
  opacity: 0;
  transform: rotate(0);
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.run-activity summary:hover .run-summary__chevron,
.run-activity summary:focus-visible .run-summary__chevron { opacity: 1; }

.run-activity[open] > summary .run-summary__chevron { transform: rotate(180deg); }

@keyframes run-activity-spin {
  from { transform: rotate(0); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .run-activity-row__status .is-spinning { animation: none; }
}
</style>
