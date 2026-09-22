<template>
  <section class="reply-progress" :class="`is-${status}`" aria-label="回复状态">
    <header class="reply-progress__header">{{ statusLabel }}<template v-if="durationMs !== undefined"> · {{ status === 'running' ? '' : status === 'failed' ? '耗时' : '用时' }}{{ replyDuration(durationMs) }}</template></header>
    <div v-if="status === 'running'" class="reply-progress__current"><span class="reply-progress__shimmer">{{ currentActivityLabel(activities, progressLabel) }}…</span></div>
    <details v-if="activities.length || subtasks.length" class="reply-progress__details">
      <summary>
        <span>{{ completedCount ? `已完成 ${completedCount} 项操作` : '执行过程' }}<template v-if="failedCount"> · {{ failedCount }} 项异常记录</template></span>
        <span class="reply-progress__toggle">查看过程<AppIcon name="ArrowDown" /></span>
      </summary>
      <div class="reply-progress__history">
        <RunPlan :activities="activities" />
        <RunActivityList :activities="activitiesWithoutPlan" :completed-at="completedAt" />
        <SubtaskList :subtasks="subtasks" :stop="stop" />
      </div>
      <span v-if="summaryMeta" class="reply-progress__meta">{{ summaryMeta }}</span>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HarnessRunActivity, HarnessSubtask } from '@/config/harness'
import { currentActivityLabel, replyDuration } from '../runPresentation'
import RunPlan from './RunPlan.vue'
import RunActivityList from './RunActivityList.vue'
import SubtaskList from './SubtaskList.vue'

const props = withDefaults(defineProps<{
  activities?: HarnessRunActivity[]
  subtasks?: HarnessSubtask[]
  status: 'running' | 'completed' | 'failed' | 'stopped'
  completedAt?: number
  durationMs?: number
  summaryMeta?: string
  progressLabel?: string
  stop?: (id: string) => void
}>(), { activities: () => [], subtasks: () => [], progressLabel: '正在思考' })

const statusLabel = computed(() => ({ running: '正在回复', completed: '回复完成', failed: '回复失败', stopped: '回复已停止' }[props.status]))
const activitiesWithoutPlan = computed(() => props.activities.filter(activity => activity.kind !== 'plan'))
const operations = computed(() => activitiesWithoutPlan.value.filter(activity => activity.kind === 'tool' || activity.id.startsWith('tool-')))
const completedCount = computed(() => operations.value.filter(activity => activity.status === 'completed').length)
const failedCount = computed(() => operations.value.filter(activity => activity.status === 'failed').length)
</script>

<style scoped lang="scss">
.reply-progress { margin-bottom: 20px; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.6; }
.reply-progress__header { padding-bottom: 12px; border-bottom: 1px solid var(--cp-border-light); font-size: 13px; font-variant-numeric: tabular-nums; }
.is-failed .reply-progress__header { color: var(--cp-danger); }
.reply-progress__current { display: flex; min-height: 26px; align-items: center; margin-top: 12px; }
.reply-progress__shimmer { overflow: hidden; color: var(--cp-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.reply-progress__details { margin-top: 8px; }
.reply-progress__details > summary { display: flex; min-height: 26px; align-items: center; gap: 14px; width: fit-content; max-width: 100%; cursor: pointer; list-style: none; }
.reply-progress__details > summary::-webkit-details-marker { display: none; }
.reply-progress__details > summary:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 3px; border-radius: 3px; }
.reply-progress__toggle { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 5px; color: var(--cp-text-tertiary); }
.reply-progress__toggle .app-icon { font-size: 11px; transition: transform .15s ease; }
.reply-progress__details[open] .reply-progress__toggle .app-icon { transform: rotate(180deg); }
.reply-progress__details > summary:hover .reply-progress__toggle { color: var(--cp-text); }
.reply-progress__history { max-height: 260px; margin-top: 8px; padding: 0 12px 12px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: 8px; background: var(--cp-bg-hover); }
.reply-progress__meta { display: block; margin-top: 8px; color: var(--cp-text-tertiary); }
@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .reply-progress__shimmer { background: linear-gradient(100deg, var(--cp-text-secondary) 25%, var(--cp-text-tertiary) 42%, var(--cp-text) 50%, var(--cp-text-tertiary) 58%, var(--cp-text-secondary) 75%); background-size: 240% 100%; color: transparent; background-clip: text; -webkit-background-clip: text; animation: reply-shimmer 2.2s linear infinite; }
}
@keyframes reply-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .reply-progress__shimmer { animation: none; background: none; color: var(--cp-text-secondary); }.reply-progress__toggle .app-icon { transition: none; } }
</style>
