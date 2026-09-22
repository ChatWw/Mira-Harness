<template>
  <div class="conversation__messages">
    <div ref="streamRef" class="message-stream" tabindex="0" aria-label="对话消息" @scroll="handleStreamScroll" @wheel.passive="handleUserWheel" @pointerdown="handleStreamPointerDown" @keydown="handleStreamKeydown">
      <div ref="contentRef" class="message-stream__content">
      <HarnessMessageItem v-for="(message, index) in displayedMessages" :key="messageKey(message)" :message="message" :active-run="activeRun" :active-run-elapsed="activeRunElapsed" :active-run-label="activeRunLabel" :streaming="isStreaming(message)" :entering="message.id === enteringMessageId" :busy="running || rendering" :last-message="index === displayedMessages.length - 1" @entrance-end="$emit('entrance-end', $event)" @edit-and-rerun="(item, content) => $emit('edit-and-rerun', item, content)" @rerun="$emit('rerun')" @open-file-change="$emit('open-file-change', $event)" @open-work-panel="$emit('open-work-panel')" @continue="$emit('continue')" @stop-subtask="$emit('stop-subtask', $event)" />
      </div>
      <div ref="spacerRef" class="message-stream__spacer" aria-hidden="true" />
    </div>
    <div v-if="showQuickNavigation" ref="quickNavigationRef" class="quick-navigation" role="slider" tabindex="0" aria-label="对话快速导航" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="quickNavigationPercent" :aria-valuetext="`阅读位置 ${quickNavigationPercent}%`" @keydown="handleQuickNavigationKeydown" @pointerenter="updateQuickNavigationHover" @pointerdown="beginQuickNavigation" @pointermove="moveQuickNavigation" @pointerup="endQuickNavigation" @pointercancel="endQuickNavigation" @pointerleave="clearQuickNavigationHover">
      <span v-for="segment in quickNavigationSegments" :key="segment.id" class="quick-navigation__segment" :class="{ 'is-active': segment.active, 'is-hovered': segment.id === hoveredQuickNavigationId }" :style="{ top: `${segment.top}%`, width: `${segment.width}px`, left: `${segment.left}px`, '--quick-navigation-scale-x': segment.scaleX, '--quick-navigation-scale-y': segment.scaleY }" aria-hidden="true" />
      <div v-if="hoveredQuickNavigationSegment" class="quick-navigation__preview" :style="quickNavigationPreviewStyle" aria-hidden="true"><strong>{{ hoveredQuickNavigationSegment.title }}</strong><p>{{ hoveredQuickNavigationSegment.reply }}</p></div>
    </div>
    <button v-if="showScrollToBottom" type="button" class="scroll-bottom-control" :class="{ 'is-loading': showLoadingIndicator }" title="查看最新回复" :aria-label="showLoadingIndicator ? 'Mira 正在回复，点击查看最新回复' : '查看最新回复'" @click="scrollToBottom">
      <span v-if="showLoadingIndicator" class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <AppIcon class="scroll-bottom-arrow" name="ArrowDown" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { HarnessFileChange, HarnessMessage } from '@/config/harness'
import type { HarnessRunProgress as HarnessRunProgressState } from '@/stores/harness'
import { useHarnessNavigation } from '../useHarnessNavigation'
import HarnessMessageItem from './HarnessMessageItem.vue'

const props = defineProps<{ messages: HarnessMessage[], activeRun?: HarnessRunProgressState, running: boolean, rendering: boolean, enteringMessageId?: string }>()
const emit = defineEmits<{ 'entrance-end': [id: string], 'edit-and-rerun': [message: HarnessMessage, content: string], rerun: [], 'open-file-change': [change: HarnessFileChange], 'open-work-panel': [], continue: [], 'stop-subtask': [id: string] }>()
const clock = ref(Date.now())
let elapsedTimer: number | undefined
const messageSource = computed(() => props.messages)
const navigation = useHarnessNavigation({ messages: messageSource, running: computed(() => props.running), rendering: computed(() => props.rendering) })
const { streamRef, contentRef, spacerRef, quickNavigationRef, showScrollToBottom, quickNavigationSegments, hoveredQuickNavigationId, showQuickNavigation, quickNavigationPercent, hoveredQuickNavigationSegment, quickNavigationPreviewStyle, handleStreamScroll, handleUserWheel, handleStreamPointerDown, handleStreamKeydown, updateQuickNavigationHover, clearQuickNavigationHover, beginQuickNavigation, moveQuickNavigation, endQuickNavigation, handleQuickNavigationKeydown, scrollToBottom } = navigation
const activeRunElapsed = computed(() => props.activeRun ? Math.max(0, clock.value - props.activeRun.startedAt) : 0)
const activeRunLabel = computed(() => props.rendering && !props.running ? '正在整理回复' : '正在思考')
const activeLastMessage = computed(() => props.messages[props.messages.length - 1])
const showLoadingIndicator = computed(() => props.running || props.rendering)
const displayedMessages = computed<HarnessMessage[]>(() => {
  if (!props.activeRun || !(props.running || props.rendering) || activeLastMessage.value?.role === 'assistant') return props.messages
  return [...props.messages, { id: `pending-${props.activeRun.startedAt}`, role: 'assistant', content: '', createdAt: props.activeRun.startedAt }]
})
function messageKey(message: HarnessMessage) {
  if (message.role === 'assistant') {
    const startedAt = message.run?.startedAt ?? (isStreaming(message) ? props.activeRun?.startedAt : undefined)
    if (startedAt !== undefined) return `reply-${startedAt}`
  }
  return message.id
}
function isStreaming(message: HarnessMessage) { return Boolean(props.activeRun && (props.running || props.rendering) && !message.run && message.role === 'assistant' && displayedMessages.value[displayedMessages.value.length - 1]?.id === message.id) }
watch(() => [props.messages.length, props.messages[props.messages.length - 1]?.content, props.running, props.rendering], () => navigation.scheduleAutoScroll(), { flush: 'post' })
onMounted(() => { elapsedTimer = window.setInterval(() => { if (props.activeRun) clock.value = Date.now() }, 250); navigation.mount() })
onBeforeUnmount(() => { if (elapsedTimer) window.clearInterval(elapsedTimer) })
defineExpose({ scrollLatestMessageToTop: navigation.scrollLatestMessageToTop, snapSessionToBottom: navigation.snapSessionToBottom, reset: navigation.reset })
</script>

<style scoped lang="scss">
.conversation__messages { position: relative; min-height: 0; overflow: hidden; }.message-stream { position: relative; height: 100%; min-height: 0; padding: 34px clamp(20px, 5vw, 96px) 24px; overflow-y: auto; overscroll-behavior-y: contain; overflow-anchor: none; outline: none; }
.message-stream__content { display: flow-root; }.message-stream__spacer { height: 0; pointer-events: none; }
.scroll-bottom-control { position: absolute; z-index: 1; bottom: 16px; left: 50%; display: grid; width: 34px; height: 34px; padding: 0; place-items: center; border: 1px solid var(--cp-border-light); border-radius: 50%; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); box-shadow: 0 4px 12px rgb(24 24 27 / 12%); cursor: pointer; transform: translateX(-50%); }
.loading-dots { display: inline-flex; align-items: center; gap: 4px; }
.loading-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--cp-text-tertiary); animation: harness-loading-dot 1.1s ease-in-out infinite; }
.loading-dots i:nth-child(2) { animation-delay: .14s; }.loading-dots i:nth-child(3) { animation-delay: .28s; }
.scroll-bottom-control.is-loading:not(:hover):not(:focus-visible) .scroll-bottom-arrow { display: none; }
.scroll-bottom-control:is(:hover, :focus-visible) .loading-dots { display: none; }
.scroll-bottom-control:hover { color: var(--cp-text); border-color: var(--cp-border); background: var(--cp-bg-hover); }
.scroll-bottom-control:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 3px; }
.quick-navigation { position: absolute; z-index: 2; top: 24px; bottom: 24px; left: clamp(12px, 1vw, 30px); width: 42px; min-height: 64px; padding: 0; border: 0; outline: 0; background: transparent; cursor: pointer; touch-action: none; }
.quick-navigation:focus-visible::after { position: absolute; inset: -3px; border: 2px solid color-mix(in srgb, var(--cp-primary) 70%, transparent); border-radius: $radius-sm; content: ''; }
.quick-navigation__segment { position: absolute; display: block; height: 2px; min-width: 2px; border-radius: 2px; color: transparent; background: color-mix(in srgb, var(--cp-text-tertiary) 45%, transparent); pointer-events: none; transform: translateY(-50%) scaleX(var(--quick-navigation-scale-x)) scaleY(var(--quick-navigation-scale-y)); transform-origin: left center; transition: transform 140ms ease, background-color 140ms ease; }
.quick-navigation__segment.is-active, .quick-navigation__segment.is-hovered { background: var(--cp-text); }
.quick-navigation__preview { position: absolute; z-index: 1; left: 32px; width: min(280px, calc(100vw - 320px)); height: 104px; padding: 10px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--cp-border) 84%, transparent); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-overlay); box-shadow: 0 10px 22px rgb(24 24 27 / 11%); pointer-events: none; transform: translateY(-50%); }
.quick-navigation__preview strong { display: block; overflow: hidden; color: var(--cp-text); font-size: 13px; font-weight: 600; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.quick-navigation__preview p { display: -webkit-box; height: 54px; margin: 6px 0 0; overflow: hidden; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
@keyframes harness-loading-dot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .loading-dots i { animation: none; } }
</style>
