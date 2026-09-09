<template>
  <details v-if="completed" class="message__run">
    <summary><span class="run-summary__label">已完成 · {{ durationLabel }}</span><span class="run-summary__meta">{{ activitiesWithoutPlan.length }} 个步骤{{ summaryMeta ? ` · ${summaryMeta}` : '' }}</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></summary>
    <RunPlan :activities="activities" />
    <RunActivityList :activities="activitiesWithoutPlan" :completed-at="completedAt" />
    <SubtaskList :subtasks="subtasks" />
  </details>
  <details v-else class="run-progress" :class="{ 'run-progress--pending': pending }" :open="open">
    <summary><span class="run-progress__label">{{ progressLabel }} · {{ durationLabel }}</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></summary>
    <RunPlan :activities="activities" />
    <RunActivityList :activities="activitiesWithoutPlan" />
    <SubtaskList :subtasks="subtasks" :stop="stop" />
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HarnessRunActivity, HarnessSubtask } from '@/config/harness'
import RunPlan from './RunPlan.vue'
import RunActivityList from './RunActivityList.vue'
import SubtaskList from './SubtaskList.vue'

const props = withDefaults(defineProps<{
  activities?: HarnessRunActivity[]
  subtasks?: HarnessSubtask[]
  completed?: boolean
  completedAt?: number
  durationLabel: string
  summaryMeta?: string
  progressLabel: string
  open?: boolean
  pending?: boolean
  stop?: (id: string) => void
}>(), { activities: () => [], subtasks: () => [], completed: false, open: true, pending: false })

const activitiesWithoutPlan = computed(() => props.activities.filter(activity => activity.kind !== 'plan'))
</script>

<style scoped lang="scss">
.message__run, .run-progress { width: min(100%, 760px); margin: 0 0 12px; color: var(--cp-text-secondary); font-size: 12px; }
.run-progress { margin: 0 auto 18px; }
.message__run summary, .run-progress summary { display: flex; align-items: center; min-width: 0; gap: 8px; width: fit-content; color: var(--cp-text-secondary); cursor: pointer; list-style: none; }
.message__run summary::-webkit-details-marker, .run-progress summary::-webkit-details-marker { display: none; }
.run-summary__label, .run-progress__label { min-width: 0; }
.run-summary__meta { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 11px; }
.run-summary__chevron { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 12px; opacity: 0; transform: rotate(0); transition: opacity .12s ease, transform .12s ease; }
.message__run summary:hover .run-summary__chevron, .run-progress summary:hover .run-summary__chevron, .message__run summary:focus-visible .run-summary__chevron, .run-progress summary:focus-visible .run-summary__chevron { opacity: 1; }
.message__run[open] > summary .run-summary__chevron, .run-progress[open] > summary .run-summary__chevron { transform: rotate(180deg); }
.run-progress__label { --run-sweep-base: var(--cp-text-tertiary); --run-sweep-edge: color-mix(in srgb, var(--cp-text-tertiary) 34%, white); --run-sweep-highlight: var(--cp-bg); color: var(--run-sweep-base); }
@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .run-progress__label { background: linear-gradient(100deg, var(--run-sweep-base) 0 24%, var(--run-sweep-edge) 38%, var(--run-sweep-highlight) 50%, var(--run-sweep-edge) 62%, var(--run-sweep-base) 76% 100%); background-size: 260% 100%; color: transparent; background-clip: text; -webkit-background-clip: text; animation: run-text-sweep 1.8s ease-in-out infinite; }
}
@keyframes run-text-sweep { 0%, 100% { background-position: 100% 0; } 50% { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .run-progress__label { animation: none; } }
</style>
