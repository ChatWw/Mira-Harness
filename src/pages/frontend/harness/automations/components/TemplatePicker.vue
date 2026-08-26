<template>
  <section class="template-picker">
    <header><h2>从模板创建</h2><p>选择一个常用场景，任务内容与调度会自动预填。</p></header>
    <div class="template-grid" role="listbox" aria-label="自动化模板">
      <button v-for="template in AUTOMATION_TEMPLATES" :key="template.id" type="button" class="template-card" :class="{ selected: template.id === selectedId }" role="option" :aria-selected="template.id === selectedId" @click="selectedId = template.id">
        <span class="template-card__icon"><AppIcon :name="template.icon" /></span><strong>{{ template.name }}</strong><span>{{ template.description }}</span><small><AppIcon :name="template.trigger.type === 'session-completed' ? 'ChatDotRound' : 'Clock'" />{{ scheduleLabel(template) }}</small>
      </button>
    </div>
    <footer><el-button @click="$emit('skip')">新建空白任务</el-button><el-button type="primary" @click="useTemplate">使用此模板<AppIcon name="ArrowRight" /></el-button></footer>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from '../automationTemplates'
import { describeCronExpression } from '@/config/automationSchedule'

const selectedId = ref(AUTOMATION_TEMPLATES[0].id)
const emit = defineEmits<{ select: [template: AutomationTemplate], skip: [] }>()

function scheduleLabel(template: AutomationTemplate) { return template.trigger.type === 'session-completed' ? '人工会话完成' : template.trigger.type === 'once' ? '一次性任务' : template.trigger.humanLabel || describeCronExpression(template.trigger.expression) }
function useTemplate() { const template = AUTOMATION_TEMPLATES.find(item => item.id === selectedId.value); if (template) emit('select', template) }
</script>

<style scoped lang="scss">
.template-picker { display: grid; min-height: 510px; grid-template-rows: auto 1fr auto; }.template-picker header { padding: 2px 0 20px; }.template-picker h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: 600; }.template-picker p { margin: 5px 0 0; color: var(--cp-text-secondary); font-size: 13px; }.template-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 10px; }.template-card { display: grid; min-height: 142px; grid-template-rows: auto auto 1fr auto; gap: 6px; padding: 13px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-elevated); text-align: left; cursor: pointer; }.template-card:hover { border-color: color-mix(in srgb, var(--cp-primary) 55%, var(--cp-border)); }.template-card.selected { border-color: var(--cp-primary); background: var(--cp-primary-lighter); box-shadow: 0 0 0 1px color-mix(in srgb, var(--cp-primary) 50%, transparent); }.template-card:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }.template-card__icon { display: grid; width: 28px; height: 28px; place-items: center; border-radius: $radius-sm; color: var(--cp-primary); background: color-mix(in srgb, var(--cp-primary) 10%, var(--cp-bg)); font-size: 15px; }.template-card strong { font-size: 13px; font-weight: 600; }.template-card > span:not(.template-card__icon) { color: var(--cp-text-secondary); font-size: 12px; line-height: 1.5; }.template-card small { display: inline-flex; align-items: center; gap: 4px; color: var(--cp-primary); font-size: 11px; }.template-picker footer { display: flex; justify-content: space-between; gap: 8px; padding-top: 18px; border-top: 1px solid var(--cp-border-light); }.template-picker footer :deep(.app-icon) { margin-left: 4px; }
</style>
