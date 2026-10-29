<template>
  <span class="model-capabilities" role="group" aria-label="模型能力">
    <SettingsTooltip v-for="capability in capabilities" :key="capability.label" :content="capability.label" placement="top">
      <span class="model-capabilities__icon" :class="`model-capabilities__icon--${capability.value}`" role="img" :aria-label="capability.label"><AppIcon :name="capability.icon" :size="12" aria-hidden="true" /></span>
    </SettingsTooltip>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ModelMetadata } from '@/config/harness'
import { MODEL_ABILITIES, MODEL_INPUTS, MODEL_TYPES } from '@/config/modelCapabilities'
import SettingsTooltip from '../../settings/components/SettingsTooltip.vue'

const props = defineProps<{ model?: Pick<ModelMetadata, 'modelType' | 'reasoning' | 'toolCall' | 'multimodal' | 'audioInput' | 'videoInput'> }>()
const capabilities = computed(() => [
  ...MODEL_TYPES.filter(type => type.value === (props.model?.modelType || 'chat')),
  ...[...MODEL_INPUTS, ...MODEL_ABILITIES].filter(item => props.model?.[item.key]).map(item => ({ ...item, value: item.key })),
])
</script>

<style scoped lang="scss">
.model-capabilities { display: inline-flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 4px; vertical-align: middle; }
.model-capabilities__icon {
  --capability-color: #526476;
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 18px; border-radius: 999px;
  color: var(--capability-color); background: color-mix(in srgb, var(--capability-color) 10%, var(--cp-bg));
  &--image, &--embedding { --capability-color: #385fd1; }
  &--reranking { --capability-color: #a64d12; }
  &--multimodal { --capability-color: #00834f; }
  &--audioInput { --capability-color: #008291; }
  &--videoInput { --capability-color: #7c3bd1; }
  &--reasoning { --capability-color: #6160ad; }
  &--toolCall { --capability-color: #b65014; }
}
[data-theme='dark'] .model-capabilities__icon {
  --capability-color: #b5c3d4;
  background: color-mix(in srgb, var(--capability-color) 15%, var(--cp-bg));
  &--image, &--embedding { --capability-color: #93b4ff; }
  &--reranking { --capability-color: #ffc28a; }
  &--multimodal { --capability-color: #62d6a4; }
  &--audioInput { --capability-color: #65d5df; }
  &--videoInput { --capability-color: #c39bff; }
  &--reasoning { --capability-color: #b1aff5; }
  &--toolCall { --capability-color: #ffb886; }
}
</style>
