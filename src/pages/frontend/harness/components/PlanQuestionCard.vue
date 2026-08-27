<template>
  <section class="plan-question" :class="{ 'plan-question--resolved': interaction.status !== 'waiting' }">
    <header><strong>需要你的输入</strong><span>{{ interaction.status === 'waiting' ? '继续规划前需要确认' : interaction.status === 'cancelled' ? '已取消' : '已回答' }}</span></header>
    <template v-for="question in interaction.questions" :key="question.id">
      <div class="plan-question__item">
        <small v-if="question.header">{{ question.header }}</small>
        <b>{{ question.question }}</b>
        <p v-if="question.context">{{ question.context }}</p>
        <div v-if="interaction.status === 'waiting' && question.options?.length" class="plan-question__options">
          <button v-for="option in question.options" :key="option.label" type="button" :class="{ selected: selected[question.id]?.includes(option.label) }" @click="selectOption(question.id, option.label, question.multiSelect === true)"><span>{{ option.label }}</span><small v-if="option.description">{{ option.description }}</small></button>
        </div>
        <textarea v-if="interaction.status === 'waiting' && question.allowCustom !== false" v-model="custom[question.id]" :placeholder="question.options?.length ? '或直接补充' : '请输入你的回答'" rows="2" />
        <p v-if="interaction.status !== 'waiting'" class="plan-question__answer">{{ answerText(question.id) }}</p>
      </div>
    </template>
    <footer v-if="interaction.status === 'waiting'"><button type="button" class="plan-question__primary" :disabled="busy || !complete" @click="submit">继续规划</button><button type="button" :disabled="busy" @click="$emit('cancel')">取消规划</button></footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { HarnessPendingInteraction, HarnessUserAnswer } from '@/config/harness'
const props = defineProps<{ interaction: Extract<HarnessPendingInteraction, { kind: 'question' }>, busy?: boolean }>()
const emit = defineEmits<{ answer: [answers: HarnessUserAnswer[]], cancel: [] }>()
const selected = reactive<Record<string, string[]>>(Object.fromEntries(props.interaction.questions.map(question => [question.id, question.multiSelect ? [] : []])))
const custom = reactive<Record<string, string>>({})
const complete = computed(() => props.interaction.questions.every(question => selected[question.id]?.length || custom[question.id]?.trim()))
function submit() { emit('answer', props.interaction.questions.map(question => ({ id: question.id, selected: [...(selected[question.id] || [])], ...(custom[question.id]?.trim() ? { custom: custom[question.id].trim() } : {}) }))) }
function selectOption(id: string, label: string, multi: boolean) { const current = selected[id] || []; selected[id] = multi ? (current.includes(label) ? current.filter(item => item !== label) : [...current, label]) : [label] }
function answerText(id: string) { const answer = props.interaction.answers?.find(item => item.id === id); return answer ? (answer.custom || answer.selected.join('、') || '未回答') : '未回答' }
</script>

<style scoped>
.plan-question { margin: 12px 0; padding: 16px; border: 1px solid var(--el-color-primary-light-5); border-radius: 6px; background: var(--el-fill-color-lighter); }.plan-question--resolved { border-color: var(--el-border-color); } header, footer { display:flex; gap:8px; align-items:center; } header span { color:var(--el-text-color-secondary); font-size:12px; }.plan-question__item { margin-top:16px; }.plan-question__item > small { color:var(--el-color-primary); display:block; margin-bottom:4px; }.plan-question__item > b { display:block; }.plan-question__item > p { color:var(--el-text-color-secondary); margin:6px 0; }.plan-question__options { display:grid; gap:7px; margin-top:9px; }.plan-question__options button { display:block; text-align:left; }.plan-question__options button.selected { border-color:var(--el-color-primary); background:var(--el-color-primary-light-9); }.plan-question__options small { display:block; color:var(--el-text-color-secondary); margin-top:2px; } textarea { width:100%; box-sizing:border-box; margin-top:9px; border:1px solid var(--el-border-color); border-radius:4px; padding:8px; background:var(--el-bg-color); color:inherit; resize:vertical; } footer { margin-top:16px; } button { border:1px solid var(--el-border-color); background:var(--el-bg-color); color:inherit; border-radius:4px; padding:6px 10px; cursor:pointer; } button:disabled { opacity:.5; cursor:default; }.plan-question__primary { background:var(--el-color-primary); border-color:var(--el-color-primary); color:#fff; }.plan-question__answer { color:var(--el-text-color-regular) !important; }
</style>
