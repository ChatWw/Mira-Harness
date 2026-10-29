<template>
  <span class="ai-brand-icon" :data-brand="icon?.brand" aria-hidden="true">
    <span v-if="letterAvatar && !customLogo && !model" class="ai-brand-icon__avatar" :style="{ background: avatar.background }">{{ avatar.letter }}</span>
    <img v-else-if="uploadedLogo && !model" :src="uploadedLogo" alt="">
    <span v-else-if="icon?.monochrome" class="ai-brand-icon__mono" :style="{ maskImage: `url(${icon.url})` }" />
    <img v-else-if="icon" :src="icon.url" alt="">
    <img v-else-if="uploadedLogo" :src="uploadedLogo" alt="">
    <AppIcon v-else-if="model" name="lucide:cpu" />
    <span v-else class="ai-brand-icon__letter">{{ (name || provider || '?').slice(0, 1) }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { aiBrandIcon, providerLetterAvatar, resolveAiBrandIcon } from './brands'
const props = defineProps<{ provider?: string; name?: string; model?: string; customLogo?: string; letterAvatar?: boolean }>()
const uploadedLogo = computed(() => props.customLogo?.startsWith('lobehub:') ? undefined : props.customLogo)
const avatar = computed(() => providerLetterAvatar(props.name || props.provider || ''))
const icon = computed(() => props.letterAvatar && !props.customLogo && !props.model ? undefined
  : !props.model && props.customLogo?.startsWith('lobehub:') ? aiBrandIcon(props.customLogo.slice(8)) : resolveAiBrandIcon(props))
</script>

<style scoped lang="scss">
.ai-brand-icon { display: inline-grid; place-items: center; width: 100%; height: 100%; color: var(--cp-text); flex-shrink: 0; }
.ai-brand-icon img, .ai-brand-icon__mono { display: block; width: 100%; height: 100%; object-fit: contain; }
.ai-brand-icon__mono { background: currentColor; mask-size: contain; mask-position: center; mask-repeat: no-repeat; }
.ai-brand-icon__letter { font-size: 11px; font-weight: 600; }
.ai-brand-icon__avatar { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; color: #fff; font-size: inherit; font-weight: 600; }
.ai-brand-icon :deep(.app-icon) { width: 100%; height: 100%; }
</style>
