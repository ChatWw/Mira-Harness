<script setup lang="ts">
import type { HarnessPlan } from '@/config/harness'

defineProps<{ plan: HarnessPlan, busy?: boolean }>()
const emit = defineEmits<{ execute: [], cancel: [] }>()
</script>

<template>
  <section class="plan-confirm" aria-label="方案确认">
    <header class="plan-confirm__header">
      <strong><AppIcon name="Finished" />方案已生成 · {{ plan.steps.length }} 步</strong>
      <span class="plan-confirm__hint">点击下方执行，或在输入框提出修改意见后发送</span>
    </header>
    <div class="plan-confirm__body">
      <p v-if="plan.understanding" class="plan-confirm__understanding">{{ plan.understanding }}</p>
      <ol class="plan-confirm__steps">
        <li v-for="step in plan.steps" :key="step.label">{{ step.label }}<small v-if="step.detail">{{ step.detail }}</small></li>
      </ol>
      <p v-if="plan.risks.length" class="plan-confirm__risks">风险：{{ plan.risks.join('、') }}</p>
    </div>
    <footer class="plan-confirm__footer">
      <button type="button" class="plan-confirm__btn" :disabled="busy" @click="$emit('cancel')">取消</button>
      <button type="button" class="plan-confirm__btn plan-confirm__btn--primary" :disabled="busy" @click="$emit('execute')">执行方案</button>
    </footer>
  </section>
</template>

<style scoped>
.plan-confirm {
  position: relative;
  width: min(100%, 800px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 auto 10px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--cp-border) 88%, transparent);
  border-radius: $radius-lg;
  color: var(--cp-text);
  background: var(--cp-bg);
  box-shadow: 0 8px 22px rgb(24 24 27 / 7%);
}
.plan-confirm__header { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.plan-confirm__header strong { display: inline-flex; align-items: center; gap: 6px; color: var(--cp-primary); font-size: 13px; font-weight: 600; }
.plan-confirm__header strong .app-icon { font-size: 15px; }
.plan-confirm__hint { overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.plan-confirm__body { display: flex; flex-direction: column; gap: 7px; }
.plan-confirm__understanding { margin: 0; color: var(--cp-text); font-size: 13px; line-height: 1.55; }
.plan-confirm__steps { display: flex; flex-direction: column; gap: 5px; margin: 0; padding-left: 0; list-style: none; }
.plan-confirm__steps li { position: relative; padding-left: 18px; color: var(--cp-text-secondary); font-size: 13px; line-height: 1.5; }
.plan-confirm__steps li::before { position: absolute; top: 0; left: 2px; color: var(--cp-primary); content: '•'; }
.plan-confirm__steps li small { display: block; color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.5; }
.plan-confirm__risks { margin: 0; color: var(--cp-text-tertiary); font-size: 12px; line-height: 1.55; }
.plan-confirm__footer { display: flex; flex: 0 0 auto; align-items: center; justify-content: flex-end; gap: 8px; padding-top: 2px; }
.plan-confirm__btn {
  min-width: 72px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--cp-border-light);
  border-radius: 18px;
  color: var(--cp-text-secondary);
  background: var(--cp-bg);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: color $transition-fast, background $transition-fast, border-color $transition-fast;
}
.plan-confirm__btn:hover:not(:disabled) { color: var(--cp-text); border-color: var(--cp-border); }
.plan-confirm__btn:disabled { cursor: default; opacity: .5; }
.plan-confirm__btn--primary { color: #fff; border-color: var(--cp-primary); background: var(--cp-primary); }
.plan-confirm__btn--primary:hover:not(:disabled) { color: #fff; background: color-mix(in srgb, var(--cp-primary) 88%, white); }
</style>
