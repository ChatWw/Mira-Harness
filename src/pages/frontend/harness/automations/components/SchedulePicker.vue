<template>
  <section class="schedule-picker">
    <div class="schedule-types" role="radiogroup" aria-label="触发方式">
      <button v-for="item in scheduleTypes" :key="item.value" type="button" :class="{ active: type === item.value }" role="radio" :aria-checked="type === item.value" @click="selectType(item.value)">{{ item.label }}</button>
    </div>

    <div v-if="type === 'once'" class="schedule-fields schedule-fields--once"><span class="schedule-field-label">执行时间</span><el-date-picker v-model="onceDate" type="date" value-format="x" :clearable="false" @change="emitCurrent" /><el-time-picker v-model="onceTime" value-format="HH:mm" format="HH:mm" :clearable="false" @change="emitCurrent" /></div>
    <div v-else-if="type === 'hourly'" class="schedule-fields"><span class="schedule-field-label">每</span><el-input-number v-model="hourlyInterval" :min="1" :max="24" controls-position="right" @change="emitCurrent" /><span>小时</span></div>
    <div v-else-if="type === 'daily'" class="schedule-fields schedule-fields--daily"><span class="schedule-field-label">频率</span><el-select v-model="dailyKind" @change="emitCurrent"><el-option label="每天" value="every" /><el-option label="仅工作日" value="workday" /><el-option label="仅周末" value="weekend" /></el-select><span class="schedule-field-label">时间</span><el-time-picker v-model="dailyTime" value-format="HH:mm" format="HH:mm" :clearable="false" @change="emitCurrent" /></div>
    <div v-else-if="type === 'weekly'" class="schedule-fields schedule-fields--weekly"><span class="schedule-field-label">星期</span><div class="weekday-picker"><button v-for="day in weekdays" :key="day.value" type="button" :class="{ active: weeklyDays.includes(day.value) }" :aria-pressed="weeklyDays.includes(day.value)" @click="toggleWeekday(day.value)">{{ day.label }}</button></div><span class="schedule-field-label">时间</span><el-time-picker v-model="weeklyTime" value-format="HH:mm" format="HH:mm" :clearable="false" @change="emitCurrent" /></div>
    <div v-else-if="type === 'monthly'" class="schedule-fields schedule-fields--monthly"><span class="schedule-field-label">每月</span><el-select v-model="monthlyDay" @change="emitCurrent"><el-option v-for="day in [1, 5, 10, 15, 20, 25, 28, 31]" :key="day" :label="`${day} 日`" :value="day" /><el-option label="最后一天" value="last" /></el-select><span class="schedule-field-label">时间</span><el-time-picker v-model="monthlyTime" value-format="HH:mm" format="HH:mm" :clearable="false" @change="emitCurrent" /></div>
    <p v-else class="schedule-event-tip"><AppIcon name="InfoFilled" />所选项目中的人工对话完成后触发；自动化运行不会再次触发。</p>

    <div class="schedule-preview" :class="{ 'is-error': cronError }"><AppIcon :name="type === 'event' ? 'ChatDotRound' : 'Clock'" /><div><strong>{{ previewLabel }}</strong><span v-if="cronError">{{ cronError }}</span><span v-else>{{ previewTime }}</span></div></div>

    <el-collapse v-if="type !== 'once' && type !== 'event'" v-model="advancedOpen" class="advanced-cron"><el-collapse-item name="cron"><template #title><span><AppIcon name="Setting" />高级：Cron 表达式</span></template><el-input v-model="advancedCron" spellcheck="false" placeholder="五段 Cron 表达式" @blur="applyAdvancedCron" /><p v-if="cronError" class="schedule-error">{{ cronError }}</p><p v-else class="schedule-tip">高级模式会保留一期 Cron 能力，并显示未来运行时间。</p></el-collapse-item></el-collapse>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AutomationTrigger } from '@/config/harness'
import { buildCronExpression, describeSemanticSchedule, type SemanticSchedule } from '@/config/automationSchedule'
import { getPlatformApi } from '@/platform'
import { formatAutomationTime } from '../automationPresentation'

type ScheduleType = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'event'
const props = defineProps<{ modelValue: AutomationTrigger }>()
const emit = defineEmits<{ 'update:modelValue': [trigger: AutomationTrigger], validityChange: [valid: boolean] }>()
const scheduleTypes: Array<{ value: ScheduleType, label: string }> = [{ value: 'once', label: '一次性' }, { value: 'hourly', label: '每小时' }, { value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }, { value: 'event', label: '会话完成' }]
const weekdays = [{ value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' }, { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 0, label: '日' }]
function scheduleTypeFor(trigger: AutomationTrigger): ScheduleType {
  if (trigger.type === 'once') return 'once'
  if (trigger.type === 'session-completed') return 'event'
  const [, , day, , weekday] = trigger.expression.trim().split(/\s+/)
  if (day === 'L' || (day && day !== '*' && weekday === '*')) return 'monthly'
  if (day === '*' && weekday && weekday !== '*' && weekday !== '1-5' && weekday !== '0,6' && weekday !== '6,0') return 'weekly'
  if (/^\*\/\d+$/.test(trigger.expression.trim().split(/\s+/)[1] || '')) return 'hourly'
  return 'daily'
}
const type = ref<ScheduleType>(scheduleTypeFor(props.modelValue))
const onceDate = ref(String(Date.now() + 24 * 60 * 60 * 1000)); const onceTime = ref('09:00')
const hourlyInterval = ref(2); const dailyKind = ref<'every' | 'workday' | 'weekend'>('every'); const dailyTime = ref('18:00')
const weeklyDays = ref([1]); const weeklyTime = ref('09:00'); const monthlyDay = ref<number | 'last'>(15); const monthlyTime = ref('10:00')
const advancedOpen = ref<string[]>([]); const advancedCron = ref(props.modelValue.type === 'cron' ? props.modelValue.expression : '0 18 * * *'); const cronError = ref(''); const nextRuns = ref<number[]>([])

function dateTimeForPicker(value: number) { const date = new Date(value); return { date: String(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()), time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` } }
if (props.modelValue.type === 'once') { const picker = dateTimeForPicker(props.modelValue.scheduledAt); onceDate.value = picker.date; onceTime.value = picker.time }
if (props.modelValue.type === 'cron') {
  const [minute, hour, day, , weekday] = props.modelValue.expression.trim().split(/\s+/)
  const time = /^\d+$/.test(hour) && /^\d+$/.test(minute) ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : undefined
  if (type.value === 'hourly') hourlyInterval.value = Number((hour.match(/^\*\/(\d+)$/) || [])[1] || 1)
  if (type.value === 'daily' && time) { dailyTime.value = time; dailyKind.value = weekday === '1-5' ? 'workday' : weekday === '0,6' || weekday === '6,0' ? 'weekend' : 'every' }
  if (type.value === 'weekly' && time) { weeklyTime.value = time; weeklyDays.value = weekday.split(',').map(value => value === '7' ? 0 : Number(value)).filter(value => value >= 0 && value <= 6) }
  if (type.value === 'monthly' && time) { monthlyTime.value = time; monthlyDay.value = day === 'L' ? 'last' : Number(day) }
}

const semanticSchedule = computed<SemanticSchedule | undefined>(() => {
  if (type.value === 'hourly') return { type: 'hourly', interval: hourlyInterval.value }
  if (type.value === 'daily') return { type: 'daily', kind: dailyKind.value, time: dailyTime.value }
  if (type.value === 'weekly') return { type: 'weekly', weekdays: weeklyDays.value, time: weeklyTime.value }
  if (type.value === 'monthly') return { type: 'monthly', day: monthlyDay.value, time: monthlyTime.value }
  return undefined
})
const previewLabel = computed(() => {
  if (type.value === 'event') return '人工会话完成后触发'
  if (type.value === 'once') return `一次性 · ${formatAutomationTime(onceScheduledAt())}`
  return semanticSchedule.value ? describeSemanticSchedule(semanticSchedule.value) : '定时运行'
})
const previewTime = computed(() => type.value === 'event' ? '没有固定运行时间' : nextRuns.value[0] ? `下次运行：${formatAutomationTime(nextRuns.value[0])}（本机时区）` : type.value === 'once' ? '请设置未来的执行时间' : '正在计算下次运行时间…')

function onceScheduledAt() { const date = new Date(Number(onceDate.value)); return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(onceTime.value.slice(0, 2)), Number(onceTime.value.slice(3, 5))).getTime() }
function selectType(value: ScheduleType) { type.value = value; cronError.value = ''; emitCurrent() }
function toggleWeekday(day: number) { weeklyDays.value = weeklyDays.value.includes(day) ? weeklyDays.value.filter(value => value !== day) : [...weeklyDays.value, day].sort((left, right) => left - right); emitCurrent() }
function currentTrigger(): AutomationTrigger {
  if (type.value === 'event') return { type: 'session-completed' }
  if (type.value === 'once') return { type: 'once', scheduledAt: onceScheduledAt() }
  if (advancedOpen.value.includes('cron')) return { type: 'cron', expression: advancedCron.value.trim() }
  const schedule = semanticSchedule.value!
  return { type: 'cron', expression: buildCronExpression(schedule), humanLabel: describeSemanticSchedule(schedule) }
}
async function refreshPreview(trigger: AutomationTrigger) {
  cronError.value = ''
  if (trigger.type === 'session-completed') { nextRuns.value = []; emit('validityChange', true); return }
  if (trigger.type === 'once') { nextRuns.value = trigger.scheduledAt > Date.now() ? [trigger.scheduledAt] : []; cronError.value = trigger.scheduledAt > Date.now() ? '' : '执行时间必须晚于当前时间'; emit('validityChange', !cronError.value); return }
  try { nextRuns.value = await getPlatformApi()?.getAutomationNextRuns(trigger.expression) || [] } catch (cause) { nextRuns.value = []; cronError.value = cause instanceof Error ? cause.message : 'Cron 表达式无效' }
  emit('validityChange', !cronError.value)
}
function emitCurrent() { let trigger: AutomationTrigger; try { trigger = currentTrigger() } catch (cause) { cronError.value = cause instanceof Error ? cause.message : '调度设置无效'; emit('validityChange', false); return }; advancedCron.value = trigger.type === 'cron' ? trigger.expression : advancedCron.value; emit('update:modelValue', trigger); void refreshPreview(trigger) }
function applyAdvancedCron() { emitCurrent() }

watch(advancedOpen, value => { if (value.includes('cron')) emitCurrent() }, { deep: true })
emitCurrent()
</script>

<style scoped lang="scss">
.schedule-picker { display: grid; gap: 16px; }.schedule-types { display: flex; width: fit-content; max-width: 100%; overflow: hidden; border: 1px solid var(--cp-border); border-radius: $radius-sm; }.schedule-types button { min-width: 72px; padding: 8px 10px; border: 0; border-right: 1px solid var(--cp-border); color: var(--cp-text-secondary); background: var(--cp-bg); font: inherit; font-size: 13px; cursor: pointer; }.schedule-types button:last-child { border-right: 0; }.schedule-types button.active { color: var(--cp-primary); background: var(--cp-primary-lighter); font-weight: 600; }.schedule-fields { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--cp-text-secondary); font-size: 13px; }.schedule-field-label { color: var(--cp-text-secondary); white-space: nowrap; }.schedule-fields :deep(.el-select) { width: 120px; }.schedule-fields :deep(.el-date-editor) { width: 120px; }.schedule-fields--once :deep(.el-date-editor:first-of-type) { width: 154px; }.schedule-fields :deep(.el-input-number) { width: 94px; }.schedule-fields--weekly { align-items: center; }.weekday-picker { display: flex; gap: 5px; }.weekday-picker button { display: grid; width: 30px; height: 30px; padding: 0; place-items: center; border: 1px solid var(--cp-border); border-radius: 50%; color: var(--cp-text-secondary); background: var(--cp-bg); font-size: 12px; cursor: pointer; }.weekday-picker button.active { border-color: var(--cp-primary); color: var(--cp-primary-contrast, #fff); background: var(--cp-primary); }.schedule-event-tip { display: flex; align-items: flex-start; gap: 7px; margin: 0; color: var(--cp-text-secondary); font-size: 13px; line-height: 1.55; }.schedule-event-tip .app-icon { flex: 0 0 auto; margin-top: 2px; color: var(--cp-primary); }.schedule-preview { display: flex; align-items: center; gap: 10px; padding: 11px 12px; border: 1px solid color-mix(in srgb, var(--cp-primary) 24%, var(--cp-border)); border-radius: $radius-sm; background: var(--cp-primary-lighter); }.schedule-preview.is-error { border-color: color-mix(in srgb, var(--cp-danger) 42%, var(--cp-border)); background: color-mix(in srgb, var(--cp-danger) 5%, var(--cp-bg)); }.schedule-preview > .app-icon { color: var(--cp-primary); font-size: 18px; }.schedule-preview.is-error > .app-icon { color: var(--cp-danger); }.schedule-preview div { display: grid; gap: 2px; }.schedule-preview strong { color: var(--cp-text); font-size: 13px; }.schedule-preview span { color: var(--cp-text-secondary); font-size: 12px; }.advanced-cron { border: 0; }.advanced-cron :deep(.el-collapse-item__header) { height: 36px; border: 0; color: var(--cp-text-secondary); background: transparent; font-size: 12px; }.advanced-cron :deep(.el-collapse-item__wrap) { border: 0; background: transparent; }.advanced-cron :deep(.el-collapse-item__content) { margin-top: 6px; padding: 10px; border: 1px dashed var(--cp-border); border-radius: $radius-sm; }.advanced-cron :deep(.el-collapse-item__header .app-icon) { margin-right: 5px; }.schedule-tip, .schedule-error { margin: 7px 0 0; font-size: 12px; line-height: 1.45; }.schedule-tip { color: var(--cp-text-tertiary); }.schedule-error { color: var(--cp-danger); }
</style>
