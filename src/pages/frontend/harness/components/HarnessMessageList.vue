<template>
  <div class="conversation__messages">
    <div ref="streamRef" class="message-stream" @scroll="handleStreamScroll" @wheel.passive="handleUserWheel">
      <HarnessMessageItem v-for="(message, index) in messages" :key="message.id" :message="message" :active-run="activeRun" :active-run-elapsed="activeRunElapsed" :active-run-label="activeRunLabel" :live-status-label="liveStatusLabel" :live-status-icon="liveStatusIcon" :live-status-spinning="liveStatusSpinning" :streaming="isStreaming(message)" :entering="message.id === enteringMessageId" :busy="running || rendering" :last-message="index === messages.length - 1" @entrance-end="$emit('entrance-end', $event)" @edit-and-rerun="(item, content) => $emit('edit-and-rerun', item, content)" @rerun="$emit('rerun')" @open-file-change="$emit('open-file-change', $event)" @stop-subtask="$emit('stop-subtask', $event)" />
      <HarnessRunProgress v-if="activeRun && !hasStreamingAssistantMessage" :activities="activeRun.activities" :subtasks="activeRun.subtasks" :duration-label="formatDuration(activeRunElapsed)" :progress-label="activeRunLabel" :pending="true" :open="true" :stop="stopSubtask" />
    </div>
    <div v-if="showQuickNavigation" ref="quickNavigationRef" class="quick-navigation" role="slider" tabindex="0" aria-label="对话快速导航" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="quickNavigationPercent" :aria-valuetext="`阅读位置 ${quickNavigationPercent}%`" @keydown="handleQuickNavigationKeydown" @pointerenter="updateQuickNavigationHover" @pointerdown="beginQuickNavigation" @pointermove="moveQuickNavigation" @pointerup="endQuickNavigation" @pointercancel="endQuickNavigation" @pointerleave="clearQuickNavigationHover">
      <span v-for="segment in quickNavigationSegments" :key="segment.id" class="quick-navigation__segment" :class="{ 'is-active': segment.active, 'is-hovered': segment.id === hoveredQuickNavigationId }" :style="{ top: `${segment.top}%`, width: `${segment.width}px`, left: `${segment.left}px`, '--quick-navigation-scale-x': segment.scaleX, '--quick-navigation-scale-y': segment.scaleY }" aria-hidden="true" />
      <div v-if="hoveredQuickNavigationSegment" class="quick-navigation__preview" :style="quickNavigationPreviewStyle" aria-hidden="true"><strong>{{ hoveredQuickNavigationSegment.title }}</strong><p>{{ hoveredQuickNavigationSegment.reply }}</p></div>
    </div>
    <span v-if="showLoadingIndicator" class="loading-dots loading-dots--floating" aria-label="Mira 正在处理"><i></i><i></i><i></i></span>
    <el-tooltip v-if="showScrollToBottom" content="回到底部" placement="top"><button type="button" class="scroll-bottom" aria-label="回到底部" @click="scrollToBottom"><AppIcon name="ArrowDown" /></button></el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { HarnessFileChange, HarnessMessage } from '@/config/harness'
import type { HarnessRunProgress as HarnessRunProgressState } from '@/stores/harness'
import { useHarnessNavigation } from '../useHarnessNavigation'
import HarnessMessageItem from './HarnessMessageItem.vue'
import HarnessRunProgress from './HarnessRunProgress.vue'

const props = defineProps<{ messages: HarnessMessage[], activeRun?: HarnessRunProgressState, running: boolean, rendering: boolean, enteringMessageId?: string }>()
const emit = defineEmits<{ 'entrance-end': [id: string], 'edit-and-rerun': [message: HarnessMessage, content: string], rerun: [], 'open-file-change': [change: HarnessFileChange], 'stop-subtask': [id: string] }>()
const clock = ref(Date.now())
let elapsedTimer: number | undefined
const messageSource = computed(() => props.messages)
const navigation = useHarnessNavigation({ messages: messageSource, running: computed(() => props.running), rendering: computed(() => props.rendering) })
const { streamRef, quickNavigationRef, showScrollToBottom, stickToBottom, quickNavigationSegments, hoveredQuickNavigationId, showQuickNavigation, quickNavigationPercent, hoveredQuickNavigationSegment, quickNavigationPreviewStyle, handleStreamScroll, handleUserWheel, updateQuickNavigationHover, clearQuickNavigationHover, beginQuickNavigation, moveQuickNavigation, endQuickNavigation, handleQuickNavigationKeydown, scrollToBottom } = navigation
const activeRunElapsed = computed(() => props.activeRun ? Math.max(0, clock.value - props.activeRun.startedAt) : 0)
const activeRunLabel = computed(() => props.rendering && !props.running ? '正在呈现回复' : (props.activeRun?.activities.find(activity => activity.status === 'running')?.label || '正在处理'))
const liveStatusLabel = computed(() => props.rendering && !props.running ? '正在生成回复' : activeRunLabel.value)
const liveStatusIcon = computed(() => props.rendering && !props.running ? 'EditPen' : 'Loading')
const liveStatusSpinning = computed(() => !(props.rendering && !props.running))
const activeLastMessage = computed(() => props.messages[props.messages.length - 1])
const hasStreamingAssistantMessage = computed(() => Boolean(props.activeRun && activeLastMessage.value?.role === 'assistant'))
const showLoadingIndicator = computed(() => stickToBottom.value && props.running && activeLastMessage.value?.role !== 'assistant')
function isStreaming(message: HarnessMessage) { return Boolean(props.activeRun && activeLastMessage.value?.id === message.id) }
function formatDuration(value: number) { const milliseconds = Math.max(0, value); return milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)}s` }
watch(() => [props.messages.length, props.messages[props.messages.length - 1]?.content], async () => { await nextTick(); navigation.scheduleQuickNavigationUpdate(); navigation.positionPendingMessage(); navigation.scheduleAutoScroll(); handleStreamScroll() })
onMounted(() => { elapsedTimer = window.setInterval(() => { if (props.activeRun) clock.value = Date.now() }, 250); navigation.mount() })
onBeforeUnmount(() => { if (elapsedTimer) window.clearInterval(elapsedTimer) })
function stopSubtask(id: string) { emit('stop-subtask', id) }
defineExpose({ scrollLatestMessageToTop: navigation.scrollLatestMessageToTop, snapSessionToBottom: navigation.snapSessionToBottom, reset: navigation.reset })
</script>

<style scoped lang="scss">
.conversation__messages { position: relative; min-height: 0; overflow: hidden; }.message-stream { height: 100%; min-height: 0; padding: 34px clamp(20px, 5vw, 96px) 24px; overflow-y: auto; overscroll-behavior-y: contain; }
.loading-dots { display: inline-flex; align-items: center; gap: 5px; width: fit-content; padding: 10px 13px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-elevated); }
.loading-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--cp-text-tertiary); animation: harness-loading-dot 1.1s ease-in-out infinite; }
.loading-dots i:nth-child(2) { animation-delay: .14s; }.loading-dots i:nth-child(3) { animation-delay: .28s; }
.loading-dots--floating { position: absolute; z-index: 1; bottom: 16px; left: 50%; width: 34px; height: 34px; justify-content: center; padding: 0; border-radius: 50%; box-shadow: 0 4px 12px rgb(24 24 27 / 12%); transform: translateX(-50%); }
.scroll-bottom { position: absolute; z-index: 1; bottom: 16px; left: 50%; display: grid; width: 32px; height: 32px; place-items: center; padding: 0; border: 1px solid var(--cp-border-light); border-radius: 50%; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); box-shadow: 0 4px 12px rgb(24 24 27 / 12%); cursor: pointer; transform: translateX(-50%); }
.scroll-bottom:hover { color: var(--cp-text); border-color: var(--cp-border); background: var(--cp-bg-hover); }
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
