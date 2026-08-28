<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { HarnessPendingInteraction, HarnessQuestionOption, HarnessUserAnswer, HarnessUserQuestion } from '@/config/harness'

const props = defineProps<{
  interaction: Extract<HarnessPendingInteraction, { kind: 'question' }>
  busy?: boolean
}>()
const emit = defineEmits<{ answer: [answers: HarnessUserAnswer[]], cancel: [] }>()

const currentIndex = ref(0)
const selected = reactive<Record<string, string[]>>({})
const custom = reactive<Record<string, string>>({})
const skipped = reactive<Record<string, boolean>>({})

const questions = computed(() => props.interaction.questions)
const total = computed(() => questions.value.length)
const current = computed<HarnessUserQuestion | undefined>(() => questions.value[currentIndex.value])
const isLast = computed(() => currentIndex.value === total.value - 1)
const showBack = computed(() => currentIndex.value > 0)

/** 单选候选最多 3，多选最多 5；超过上限则截断展示。 */
function optionCap(question: HarnessUserQuestion) { return question.multiSelect === true ? 5 : 3 }
const visibleOptions = computed<HarnessQuestionOption[]>(() => {
  const question = current.value
  if (!question?.options?.length) return []
  return question.options.slice(0, optionCap(question))
})
const freeInputNumber = computed(() => String(visibleOptions.value.length + 1))

function numberLabel(index: number) { return String(index + 1) }

const isSelected = (label: string) => !!current.value && (selected[current.value.id] || []).includes(label)

const currentHasAnswer = computed(() => {
  const question = current.value
  if (!question) return false
  if (skipped[question.id]) return true
  return selected[question.id]?.length > 0 || !!custom[question.id]?.trim()
})
const canProceed = computed(() => currentHasAnswer.value && !props.busy)
const primaryLabel = computed(() => isLast.value ? '提交' : '下一题')

function toggleOption(question: HarnessUserQuestion, label: string) {
  skipped[question.id] = false
  if (question.multiSelect === true) {
    const list = selected[question.id] || []
    selected[question.id] = list.includes(label) ? list.filter(item => item !== label) : [...list, label]
    return
  }
  // 单选：选项与手输互斥；再次点击已选项则取消选择。
  const list = selected[question.id] || []
  if (list.includes(label)) selected[question.id] = []
  else { selected[question.id] = [label]; custom[question.id] = '' }
}
function onCustomInput(question: HarnessUserQuestion, event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  custom[question.id] = value
  // 单选：一旦填入手输，清除选项选择，保证只有一个答案来源。
  if (!question.multiSelect && value.trim()) selected[question.id] = []
  if (value.trim()) skipped[question.id] = false
}

function advance(direction: 1 | -1) {
  const next = currentIndex.value + direction
  if (next < 0 || next >= total.value) return
  currentIndex.value = next
}
function onSkip() {
  const question = current.value
  if (!question) return
  skipped[question.id] = true
  if (isLast.value) submit()
  else advance(1)
}
function onNext() {
  if (!canProceed.value) return
  if (isLast.value) submit()
  else advance(1)
}
function submit() {
  const answers = questions.value.map<HarnessUserAnswer>(question => {
    const selection = selected[question.id] || []
    const typed = custom[question.id]?.trim()
    if (skipped[question.id]) return { id: question.id, selected: [] }
    if (question.multiSelect === true) return { id: question.id, selected: selection, ...(typed ? { custom: typed } : {}) }
    if (typed) return { id: question.id, selected: [], custom: typed }
    return { id: question.id, selected: selection }
  })
  emit('answer', answers)
}

function statusLabel() {
  return props.interaction.status === 'waiting' ? (total.value > 1 ? `${currentIndex.value + 1} / ${total.value}` : '') : ''
}
</script>

<template>
  <section class="plan-wizard" aria-label="计划澄清问题">
    <header v-if="current" class="plan-wizard__header">
      <strong>{{ current.header || '需要你确认' }}</strong>
      <span v-if="skipped[current.id]" class="plan-wizard__skip"><AppIcon name="Close" />已跳过</span>
      <span class="plan-wizard__step">{{ statusLabel() }}</span>
      <button v-if="interaction.status === 'waiting'" type="button" class="plan-wizard__close" aria-label="取消规划" @click="$emit('cancel')"><AppIcon name="Close" /></button>
    </header>

    <template v-if="current">
      <p class="plan-wizard__question">{{ current.question }}</p>
      <p v-if="current.context" class="plan-wizard__context">{{ current.context }}</p>

      <div v-if="interaction.status === 'waiting'" class="plan-wizard__options">
        <button
          v-for="(option, index) in visibleOptions"
          :key="`${current.id}-${option.label}`"
          type="button"
          class="plan-wizard__option"
          :class="{ 'is-selected': isSelected(option.label) }"
          @click="toggleOption(current, option.label)"
        >
          <span class="plan-wizard__option-num">{{ numberLabel(index) }}</span>
          <span class="plan-wizard__option-label">{{ option.label }}<small v-if="option.description">{{ option.description }}</small></span>
          <AppIcon v-if="isSelected(option.label)" class="plan-wizard__option-check" name="Check" />
        </button>

        <label v-if="current.allowCustom !== false" class="plan-wizard__option plan-wizard__option--free" :class="{ 'is-active': !!custom[current.id]?.trim() }">
          <span class="plan-wizard__option-num">{{ freeInputNumber }}</span>
          <textarea
            :value="custom[current.id] || ''"
            class="plan-wizard__free-input"
            :placeholder="current.options?.length ? (current.multiSelect === true ? '或补充自定义答案' : '手输你的答案') : '输入你的答案'"
            rows="2"
            @input="onCustomInput(current, $event)"
          />
        </label>
      </div>

      <div v-else class="plan-wizard__summary">
        <p v-if="skipped[current.id]" class="plan-wizard__skip-tag"><AppIcon name="Close" />已跳过</p>
        <p v-else class="plan-wizard__answer">{{ selected[current.id]?.join('、') || custom[current.id] || '未回答' }}</p>
      </div>
    </template>
    <p v-else class="plan-wizard__empty">没有可展示的问题。</p>

    <footer v-if="interaction.status === 'waiting'" class="plan-wizard__footer">
      <span class="plan-wizard__progress">{{ statusLabel() || '请回答' }}</span>
      <div class="plan-wizard__actions">
        <button v-if="showBack" type="button" class="plan-wizard__btn" :disabled="busy" @click="advance(-1)">上一题</button>
        <button type="button" class="plan-wizard__btn" :disabled="busy" @click="onSkip">跳过本题</button>
        <button type="button" class="plan-wizard__btn plan-wizard__btn--primary" :disabled="!canProceed" @click="onNext">{{ primaryLabel }}</button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.plan-wizard {
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

.plan-wizard__header { display: flex; align-items: center; gap: 8px; }
.plan-wizard__header strong { min-width: 0; overflow: hidden; color: var(--cp-text); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.plan-wizard__skip { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px; color: var(--cp-text-tertiary); background: var(--cp-bg-hover); font-size: 11px; }
.plan-wizard__skip .app-icon { font-size: 11px; }
.plan-wizard__step { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 11px; }
.plan-wizard__close { display: grid; width: 24px; height: 24px; flex: 0 0 auto; margin-left: auto; place-items: center; padding: 0; border: 0; border-radius: 50%; color: var(--cp-text-secondary); background: transparent; cursor: pointer; transition: color $transition-fast, background $transition-fast; }
.plan-wizard__close:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.plan-wizard__close .app-icon { font-size: 13px; }

.plan-wizard__question { margin: 0; color: var(--cp-text); font-size: 14px; line-height: 1.6; }
.plan-wizard__context { margin: -4px 0 0; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.6; }

.plan-wizard__options { display: flex; flex-direction: column; gap: 2px; }
.plan-wizard__option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: $radius-md;
  color: var(--cp-text);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background $transition-fast;
}
.plan-wizard__option:hover { background: var(--cp-bg-hover); }
.plan-wizard__option.is-selected { background: color-mix(in srgb, var(--cp-primary) 9%, transparent); }
.plan-wizard__option--free { cursor: text; }
.plan-wizard__option--free:hover { background: var(--cp-bg-hover); }
.plan-wizard__option--free.is-active { background: color-mix(in srgb, var(--cp-primary) 9%, transparent); }
.plan-wizard__option-num {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  color: var(--cp-text-secondary);
  background: color-mix(in srgb, var(--cp-text-secondary) 12%, transparent);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}
.plan-wizard__option.is-selected .plan-wizard__option-num,
.plan-wizard__option--free.is-active .plan-wizard__option-num { color: #fff; background: var(--cp-primary); }
.plan-wizard__option-label { min-width: 0; color: var(--cp-text); font-size: 13px; line-height: 1.5; }
.plan-wizard__option-label small { display: block; margin-top: 2px; color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.5; }
.plan-wizard__option-check { flex: 0 0 auto; color: var(--cp-primary); font-size: 16px; margin-top: 1px; }

.plan-wizard__free-input {
  width: 100%;
  min-height: 34px;
  box-sizing: border-box;
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--cp-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  outline: none;
}
.plan-wizard__free-input::placeholder { color: var(--cp-text-tertiary); }

.plan-wizard__summary { display: flex; flex-direction: column; gap: 8px; }
.plan-wizard__answer { margin: 0; color: var(--cp-text-secondary); font-size: 13px; line-height: 1.6; }
.plan-wizard__skip-tag { display: inline-flex; width: fit-content; align-items: center; gap: 5px; margin: 0; padding: 2px 9px; border-radius: 999px; color: var(--cp-text-tertiary); background: var(--cp-bg-hover); font-size: 11px; }
.plan-wizard__skip-tag .app-icon { font-size: 11px; }
.plan-wizard__empty { margin: 0; color: var(--cp-text-tertiary); font-size: 13px; }

.plan-wizard__footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 6px; flex-wrap: wrap; }
.plan-wizard__progress { color: var(--cp-text-tertiary); font-size: 11px; }
.plan-wizard__actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.plan-wizard__btn {
  min-width: 72px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 18px;
  color: var(--cp-text-secondary);
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: color $transition-fast, background $transition-fast;
}
.plan-wizard__btn:hover:not(:disabled) { color: var(--cp-text); background: var(--cp-bg-hover); }
.plan-wizard__btn:disabled { cursor: default; opacity: .5; }
.plan-wizard__btn--primary { color: #fff; border-color: var(--cp-primary); background: var(--cp-primary); }
.plan-wizard__btn--primary:hover:not(:disabled) { color: #fff; background: color-mix(in srgb, var(--cp-primary) 88%, white); }
</style>
