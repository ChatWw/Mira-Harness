<template>
  <div v-if="planSteps.length" class="run-plan" aria-label="计划">
    <p class="run-plan__title"><AppIcon name="List" />计划 · {{ planSteps.length }} 步</p>
    <ul class="run-plan__list">
      <li
        v-for="step in planSteps"
        :key="step.id"
        class="run-plan__item"
        :class="`is-${step.status}`"
      >
        <span class="run-plan__status">
          <AppIcon :name="statusIcon(step.status)" :class="{ 'is-spinning': step.status === 'running' }" />
        </span>
        <span class="run-plan__label">{{ step.label }}</span>
        <span v-if="step.detail" class="run-plan__detail">{{ step.detail }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HarnessRunActivity } from '@/config/harness'

const props = defineProps<{ activities: HarnessRunActivity[] }>()

const planSteps = computed(() => props.activities.filter(activity => activity.kind === 'plan'))

const statusIcon = (status: HarnessRunActivity['status']) =>
  status === 'completed' ? 'CircleCheck'
    : status === 'failed' ? 'CircleClose'
      : status === 'running' ? 'Loading'
        : 'Clock'
</script>

<style scoped lang="scss">
.run-plan {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--cp-border-light, #f4f4f5);
  border-radius: var(--radius-sm, 6px);
  background: var(--cp-bg-hover, #fafafa);

  &__title {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0 0 7px;
    color: var(--cp-text-secondary, #71717a);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  &__list {
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 7px;
    min-width: 0;

    &.is-completed .run-plan__status { color: var(--cp-success, #10b981); }
    &.is-running .run-plan__status { color: var(--cp-primary, #06b6d4); }
    &.is-failed .run-plan__status,
    &.is-failed .run-plan__label { color: var(--cp-danger, #ef4444); }

    &.is-pending .run-plan__label { color: var(--cp-text-tertiary, #a1a1aa); }
  }

  &__status {
    display: inline-flex;
    min-width: 14px;
    align-items: center;
    font-size: 13px;

    .is-spinning { animation: run-plan-spin 1s linear infinite; }
  }

  &__label {
    min-width: 0;
    color: var(--cp-text, #18181b);
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  &__detail {
    grid-column: 2 / -1;
    margin: 0;
    color: var(--cp-text-tertiary, #a1a1aa);
    font-size: 11px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
}

@keyframes run-plan-spin {
  from { transform: rotate(0); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .run-plan__status .is-spinning { animation: none; }
}
</style>
