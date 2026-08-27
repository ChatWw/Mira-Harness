<template>
  <section class="plan-approval" :class="`plan-approval--${plan.status}`">
    <header><strong>计划模式</strong><span>{{ statusLabel }}</span></header>
    <p v-if="plan.understanding"><b>当前理解</b>{{ plan.understanding }}</p>
    <div v-if="plan.questions.length"><b>需要确认</b><ul><li v-for="item in plan.questions" :key="item.question">{{ item.question }}<small v-if="item.context">{{ item.context }}</small></li></ul></div>
    <div v-if="plan.steps.length"><b>执行步骤</b><ol><li v-for="step in plan.steps" :key="step.label">{{ step.label }}<small v-if="step.detail">{{ step.detail }}</small></li></ol></div>
    <div v-if="plan.risks.length"><b>风险与注意事项</b><ul><li v-for="risk in plan.risks" :key="risk">{{ risk }}</li></ul></div>
    <footer v-if="plan.status === 'ready' || plan.status === 'awaiting_input'">
      <button v-if="plan.status === 'ready'" type="button" class="plan-approval__primary" :disabled="busy" @click="$emit('confirm')">执行方案</button>
      <button type="button" :disabled="busy" @click="$emit('continue')">继续讨论/修改</button>
      <button type="button" :disabled="busy" @click="$emit('cancel')">取消规划</button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HarnessPlan } from '@/config/harness'
const props = defineProps<{ plan: HarnessPlan, busy?: boolean }>()
defineEmits<{ confirm: [], continue: [], cancel: [] }>()
const statusLabel = computed(() => ({ planning: '分析中', awaiting_input: '等待补充', ready: '等待确认', executing: '执行中', completed: '已完成', cancelled: '已取消' })[props.plan.status])
</script>

<style scoped>
.plan-approval { margin: 12px 0; padding: 14px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-fill-color-lighter); color: var(--el-text-color-primary); }
header, footer { display: flex; align-items: center; gap: 8px; } header span { color: var(--el-text-color-secondary); font-size: 12px; } p, div { margin: 12px 0 0; } b { display: block; margin-bottom: 4px; font-size: 13px; } ul, ol { margin: 0; padding-left: 20px; } small { display: block; color: var(--el-text-color-secondary); margin-top: 2px; } footer { margin-top: 14px; } button { border: 1px solid var(--el-border-color); background: var(--el-bg-color); padding: 6px 10px; border-radius: 4px; color: inherit; cursor: pointer; } button:disabled { cursor: default; opacity: .55; } .plan-approval__primary { color: #fff; border-color: var(--el-color-primary); background: var(--el-color-primary); }
</style>
