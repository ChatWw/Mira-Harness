<template>
  <article class="task-card" :class="{ 'has-failure': lastRun?.status === 'failed' }">
    <header class="task-card__header">
      <span class="task-card__icon"><AppIcon :name="task.trigger.type === 'session-completed' ? 'ChatDotRound' : task.trigger.type === 'once' ? 'Clock' : 'Timer'" /></span>
      <div class="task-card__title"><strong :title="task.name">{{ task.name }}</strong><span :title="projectName">{{ projectName }}</span></div>
      <el-dropdown trigger="click" @command="handleCommand">
        <button type="button" class="task-card__menu" :aria-label="`${task.name} 更多操作`"><AppIcon name="MoreFilled" /></button>
        <template #dropdown><el-dropdown-menu>
          <el-dropdown-item command="edit">编辑</el-dropdown-item>
          <el-dropdown-item v-if="isRunning" command="stop">停止当前运行</el-dropdown-item>
          <el-dropdown-item divided command="delete">删除</el-dropdown-item>
        </el-dropdown-menu></template>
      </el-dropdown>
    </header>

    <p class="task-card__trigger"><AppIcon :name="task.trigger.type === 'session-completed' ? 'ChatDotRound' : 'Clock'" /><b>{{ triggerLabel(task) }}</b><span>· {{ targetLabel(task) }}</span></p>
    <div class="task-card__meta">
      <span><small>{{ task.trigger.type === 'session-completed' ? '触发' : '下次运行' }}</small><b>{{ nextRunAt ? formatAutomationTime(nextRunAt) : task.endedAt ? '已结束' : task.trigger.type === 'session-completed' ? '事件' : '未计划' }}</b></span>
      <span><small>上次</small><b :class="lastRun ? `is-${lastRun.status}` : ''">{{ lastRunLabel(lastRun) }}</b></span>
    </div>
    <footer class="task-card__footer">
      <span class="task-state" :class="`is-${taskState(task, lastRun).key}`">{{ taskState(task, lastRun).label }}</span>
      <div class="task-card__actions">
        <el-tooltip :content="isRunning ? '任务运行中' : '立即运行'" placement="top"><button type="button" class="task-card__action" :class="{ 'is-loading': isRunning }" :disabled="!canRun" :aria-label="isRunning ? `${task.name} 正在运行` : `立即运行 ${task.name}`" @click="$emit('run')"><AppIcon :name="isRunning ? 'Loading' : 'VideoPlay'" /></button></el-tooltip>
        <el-tooltip content="运行记录" placement="top"><button type="button" class="task-card__action" :aria-label="`查看 ${task.name} 的运行记录`" @click="$emit('runs')"><AppIcon name="Document" /></button></el-tooltip>
        <el-tooltip content="编辑" placement="top"><button type="button" class="task-card__action" :disabled="Boolean(task.endedAt)" :aria-label="`编辑 ${task.name}`" @click="$emit('edit')"><AppIcon name="EditPen" /></button></el-tooltip>
        <el-switch :model-value="task.enabled" :disabled="Boolean(task.endedAt)" size="small" :aria-label="`${task.name} 启用状态`" @update:model-value="handleEnabled" />
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AutomationRun, AutomationTask } from '@/config/harness'
import { formatAutomationTime, lastRunLabel, targetLabel, taskState, triggerLabel } from '../automationPresentation'

const props = defineProps<{ task: AutomationTask, projectName: string, lastRun?: AutomationRun, nextRunAt?: number, isRunning: boolean }>()
const emit = defineEmits<{ action: [command: string], run: [], runs: [], edit: [], enabled: [value: boolean] }>()
const canRun = computed(() => props.task.enabled && !props.task.endedAt && !props.isRunning)
function handleCommand(command: string) { emit('action', command) }
function handleEnabled(value: string | number | boolean) { emit('enabled', Boolean(value)) }
</script>

<style scoped lang="scss">
.task-card { display: flex; min-width: 0; min-height: 182px; flex-direction: column; padding: 16px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg); box-shadow: $shadow-sm; transition: border-color $transition-fast, box-shadow $transition-fast; }
.task-card:hover { border-color: var(--cp-border); box-shadow: $shadow; }.task-card.has-failure { border-color: color-mix(in srgb, var(--cp-danger) 42%, var(--cp-border)); }
.task-card__header { display: flex; min-width: 0; align-items: flex-start; gap: 10px; }.task-card__icon { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border: 1px solid color-mix(in srgb, var(--cp-primary) 20%, var(--cp-border-light)); border-radius: $radius-sm; color: var(--cp-primary); background: var(--cp-primary-lighter); font-size: 16px; }.task-card__title { display: grid; min-width: 0; flex: 1; gap: 2px; }.task-card__title strong, .task-card__title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.task-card__title strong { color: var(--cp-text); font-size: 14px; line-height: 1.35; }.task-card__title span { color: var(--cp-text-tertiary); font-size: 12px; }.task-card__menu, .task-card__action { display: grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: $radius-sm; color: var(--cp-text-tertiary); background: transparent; cursor: pointer; }.task-card__menu:hover, .task-card__action:hover:not(:disabled) { color: var(--cp-primary); background: var(--cp-bg-hover); }.task-card__menu:focus-visible, .task-card__action:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 1px; }.task-card__action:disabled { cursor: not-allowed; opacity: .4; }
.task-card__action.is-loading { color: var(--cp-primary); opacity: 1; }.task-card__action.is-loading .app-icon { animation: automation-action-spin 1s linear infinite; }
.task-card__trigger { display: flex; min-width: 0; align-items: center; gap: 5px; margin: 12px 0 0; overflow: hidden; color: var(--cp-text-secondary); font-size: 12px; white-space: nowrap; }.task-card__trigger .app-icon { flex: 0 0 auto; color: var(--cp-text-tertiary); }.task-card__trigger b, .task-card__trigger span { overflow: hidden; text-overflow: ellipsis; }.task-card__trigger b { color: var(--cp-text-secondary); font-weight: 600; }
.task-card__meta { display: flex; gap: 18px; margin-top: 12px; }.task-card__meta span { display: grid; gap: 3px; min-width: 0; }.task-card__meta small { color: var(--cp-text-tertiary); font-size: 11px; }.task-card__meta b { overflow: hidden; color: var(--cp-text-secondary); font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }.task-card__meta .is-completed { color: var(--cp-success); }.task-card__meta .is-failed { color: var(--cp-danger); }.task-card__meta .is-running { color: var(--cp-primary); }.task-card__meta .is-skipped, .task-card__meta .is-interrupted { color: var(--cp-warning); }
.task-card__footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--cp-border-light); }.task-state { display: inline-flex; max-width: 125px; overflow: hidden; padding: 3px 7px; border-radius: 999px; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-size: 11px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }.task-state.is-running { color: var(--cp-primary); background: var(--cp-primary-lighter); }.task-state.is-failed { color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 10%, var(--cp-bg)); }.task-state.is-scheduled, .task-state.is-paused { color: var(--cp-warning); background: color-mix(in srgb, var(--cp-warning) 10%, var(--cp-bg)); }.task-card__actions { display: flex; flex: 0 0 auto; align-items: center; gap: 2px; }
@keyframes automation-action-spin { to { transform: rotate(360deg); } }
</style>
