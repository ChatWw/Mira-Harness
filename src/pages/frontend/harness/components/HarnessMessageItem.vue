<template>
  <article class="message" :class="[message.role, { 'is-entering': entering }]" :data-message-id="message.id" @animationend="$emit('entrance-end', message.id)">
    <span class="message__role"><AppIcon :name="message.role === 'user' ? 'User' : 'ChatDotRound'" />{{ message.role === 'user' ? '我' : 'Mira' }}</span>
    <template v-if="message.role === 'user'">
      <el-input v-if="editing" v-model="editingText" class="message__edit-input" type="textarea" :autosize="{ minRows: 2, maxRows: 8 }" aria-label="编辑消息" />
      <p v-else>{{ message.content }}</p>
    </template>
    <template v-else>
      <span v-if="streaming" class="message__live-status"><AppIcon :name="liveStatusIcon" :class="{ 'is-spinning': liveStatusSpinning }" />{{ liveStatusLabel }}</span>
      <HarnessRunProgress v-if="message.run" :activities="message.run.activities" :subtasks="message.run.subtasks || []" :completed="true" :completed-at="message.run.completedAt" :duration-label="formatDuration(message.run.durationMs)" :summary-meta="runUsageLabel(message.run)" progress-label="已完成" />
      <HarnessRunProgress v-else-if="streaming" :activities="activeRun?.activities" :subtasks="activeRun?.subtasks" :duration-label="formatDuration(activeRunElapsed)" :progress-label="activeRunLabel" :open="activeRun != null" :stop="stopSubtask" />
      <div class="message__markdown" v-html="renderAssistantMessage()" @click="handleMarkdownClick" @mouseover="handleCitationHover" @mouseleave="hideCitationCard" @focusin="handleCitationHover" @focusout="hideCitationCard" />
      <section v-if="message.fileChanges?.length" class="message-changes" aria-label="本次文件修改">
        <p class="message-changes__title">本次修改</p>
        <button v-for="change in message.fileChanges" :key="change.toolCallId" type="button" class="file-change" @click="$emit('open-file-change', change)">
          <span class="file-change__icon"><AppIcon :name="change.tool === 'delete' ? 'Delete' : 'Document'" /></span>
          <span class="file-change__content"><strong>{{ change.path }}</strong><small>{{ fileChangeSummary(change) }}</small></span>
          <span class="file-change__action">{{ change.diff ? '查看对比' : '查看详情' }}<AppIcon name="ArrowRight" /></span>
        </button>
      </section>
    </template>
    <div v-if="message.attachments?.length" class="message__attachments">
      <span v-for="file in message.attachments" :key="file.path" class="file-chip"><AppIcon name="Document" />{{ file.name }}</span>
    </div>
    <div class="message__toolbar">
      <time class="message__time">{{ formatMessageTime(message.createdAt) }}</time>
      <span v-if="message.role === 'assistant' && message.usage" class="message__usage" :title="message.usage.cost?.priced ? '按模型单价估算的本次回复成本' : undefined">{{ messageUsageLabel() }}</span>
      <template v-if="editing">
        <button type="button" class="message__tool-btn" aria-label="取消编辑" @click="cancelEdit"><AppIcon name="Close" /><span class="message__tool-label">取消</span></button>
        <button type="button" class="message__tool-btn" aria-label="保存并重新生成" :disabled="!editingText.trim()" @click="saveEdit"><AppIcon name="Check" /><span class="message__tool-label">重跑</span></button>
      </template>
      <button v-else-if="canEdit" type="button" class="message__tool-btn" aria-label="编辑并重新生成" @click="beginEdit"><AppIcon name="EditPen" /><span class="message__tool-label">编辑</span></button>
      <button v-if="message.content" type="button" class="message__tool-btn" aria-label="复制" @click="copyMessage"><AppIcon name="CopyDocument" /><span class="message__tool-label">复制</span></button>
      <button v-if="canRerun" type="button" class="message__tool-btn" aria-label="重新生成" @click="$emit('rerun')"><AppIcon name="Refresh" /><span class="message__tool-label">{{ message.interrupted ? '继续' : '重新生成' }}</span></button>
    </div>
    <aside v-if="activeCitation" class="citation-card" :style="citationCardStyle" role="tooltip">
      <strong>{{ activeCitation.source.title }}</strong><span>{{ citationDomain(activeCitation.source.url) }}</span><p v-if="activeCitation.source.snippet">{{ activeCitation.source.snippet }}</p>
    </aside>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MarkdownIt from 'markdown-it'
import type { HarnessFileChange, HarnessMessage, HarnessRunSummary, HarnessSource } from '@/config/harness'
import type { HarnessRunProgress as HarnessRunProgressState } from '@/stores/harness'
import { installHarnessCitations, renderHarnessMarkdown } from '@/utils/harnessCitations'
import HarnessRunProgress from './HarnessRunProgress.vue'

const props = defineProps<{
  message: HarnessMessage
  activeRun?: HarnessRunProgressState
  activeRunElapsed: number
  activeRunLabel: string
  liveStatusLabel: string
  liveStatusIcon: string
  liveStatusSpinning: boolean
  streaming: boolean
  entering: boolean
  busy: boolean
  lastMessage: boolean
}>()
const emit = defineEmits<{
  'entrance-end': [id: string]
  'edit-and-rerun': [message: HarnessMessage, content: string]
  rerun: []
  'open-file-change': [change: HarnessFileChange]
  'stop-subtask': [id: string]
}>()

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
installHarnessCitations(markdown)
markdown.renderer.rules.table_open = () => '<div class="markdown-table"><table>\n'
markdown.renderer.rules.table_close = () => '</table></div>\n'
markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0]
  const className = language ? ` class="language-${markdown.utils.escapeHtml(language)}"` : ''
  return `<div class="markdown-code-block"><button type="button" class="markdown-code-copy" data-code="${encodeURIComponent(token.content)}" aria-label="复制代码" title="复制代码"><svg class="markdown-code-copy__icon" aria-hidden="true" viewBox="0 0 1024 1024"><path fill="currentColor" d="M768 832a128 128 0 0 1-128 128H192A128 128 0 0 1 64 832V384a128 128 0 0 1 128-128v64a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64z"/><path fill="currentColor" d="M384 128a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64V192a64 64 0 0 0-64-64zm0-64h448a128 128 0 0 1 128 128v448a128 128 0 0 1-128 128H384a128 128 0 0 1-128-128V192A128 128 0 0 1 384 64"/></svg></button><pre><code${className}>${markdown.utils.escapeHtml(token.content)}</code></pre></div>\n`
}

const editing = ref(false)
const editingText = ref('')
const activeCitation = ref<{ source: HarnessSource, top: number, left: number }>()
const citationCardStyle = computed(() => activeCitation.value ? { top: `${activeCitation.value.top}px`, left: `${activeCitation.value.left}px` } : {})
const canEdit = computed(() => props.message.role === 'user' && !props.busy)
const canRerun = computed(() => props.message.role === 'assistant' && props.lastMessage && !props.busy)

function formatTokenCount(value: number) {
  if (value < 1000) return `${value}`
  if (value >= 1000000 && value % 1000000 === 0) return `${value / 1000000}M`
  return `${value >= 100000 ? Math.round(value / 1000) : Math.round(value / 100) / 10}K`
}
function messageUsageLabel() {
  const usage = props.message.usage!
  return usage.cost?.priced ? `${formatTokenCount(usage.totalTokens)} token · 估算 ${usage.cost.currency} ${usage.cost.total.toFixed(usage.cost.total >= 1 ? 2 : 4)}` : `${formatTokenCount(usage.totalTokens)} token`
}
function runUsageLabel(run: HarnessRunSummary) {
  const usage = run.usage?.total
  if (!usage) return ''
  return usage.cost?.priced ? `合计 ${usage.cost.currency} ${usage.cost.total.toFixed(usage.cost.total >= 1 ? 2 : 4)}` : `合计 ${formatTokenCount(usage.totalTokens)} token（未定价）`
}
function formatDuration(value: number) { const milliseconds = Math.max(0, value); return milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)}s` }
function formatMessageTime(timestamp: number) { const date = new Date(timestamp); const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); return date.toDateString() === new Date().toDateString() ? time : `${date.getMonth() + 1}月${date.getDate()}日 ${time}` }
function renderAssistantMessage() { return renderHarnessMarkdown(markdown, props.message.content, props.message.sources) }
function citationMarker(event: Event) { return (event.target as HTMLElement).closest<HTMLButtonElement>('[data-citation-index]') }
function citationFor(marker: HTMLButtonElement) { return props.message.sources?.find(source => source.index === Number(marker.dataset.citationIndex)) }
function handleCitationHover(event: Event) { const marker = citationMarker(event); const source = marker ? citationFor(marker) : undefined; if (!marker || !source) return; const rect = marker.getBoundingClientRect(); activeCitation.value = { source, top: rect.bottom + 228 <= window.innerHeight - 12 ? rect.bottom + 8 : Math.max(12, rect.top - 228), left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)) } }
function hideCitationCard() { activeCitation.value = undefined }
function citationDomain(rawUrl: string) { try { return new URL(rawUrl).hostname } catch { return rawUrl } }
function openCitation(source: HarnessSource) { try { const url = new URL(source.url); if (url.protocol === 'http:' || url.protocol === 'https:') window.open(url.toString(), '_blank', 'noopener,noreferrer') } catch { /* Ignore invalid persisted URLs. */ } }
async function handleMarkdownClick(event: MouseEvent) { const marker = citationMarker(event); if (marker) { const source = citationFor(marker); if (source) openCitation(source); return }; const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.markdown-code-copy'); if (!button?.dataset.code) return; try { await navigator.clipboard.writeText(decodeURIComponent(button.dataset.code)); button.dataset.copied = 'true'; button.setAttribute('aria-label', '已复制代码'); button.setAttribute('title', '已复制'); window.setTimeout(() => { delete button.dataset.copied; button.setAttribute('aria-label', '复制代码'); button.setAttribute('title', '复制代码') }, 1600) } catch { ElMessage.error('复制代码失败') } }
function fileChangeSummary(change: HarnessFileChange) { if (change.tool === 'delete') return '已移入回收站'; const lines = change.diff?.split('\n') || []; const added = lines.filter(line => /^\+\d/.test(line)).length; const removed = lines.filter(line => /^-\d/.test(line)).length; return `${change.tool === 'write' ? '已写入' : '已编辑'}${added || removed ? ` · +${added} -${removed}` : ''}` }
function beginEdit() { editingText.value = props.message.content; editing.value = true }
function cancelEdit() { editing.value = false; editingText.value = '' }
async function saveEdit() { const content = editingText.value.trim(); if (!content) return; try { await ElMessageBox.confirm('保存后将删除这条消息后的对话，并基于修改后的内容重新生成。', '重新生成对话', { type: 'warning', confirmButtonText: '保存并重新生成', cancelButtonText: '取消' }) } catch { return }; cancelEdit(); emit('edit-and-rerun', props.message, content) }
async function copyMessage() { try { await navigator.clipboard.writeText(props.message.content); ElMessage.success('已复制') } catch { ElMessage.error('复制失败') } }
function stopSubtask(id: string) { emit('stop-subtask', id) }
</script>

<style scoped lang="scss">
.message { width: min(100%, 760px); margin: 0 auto 28px; }
.message.user.is-entering { animation: user-message-enter 240ms cubic-bezier(.16, 1, .3, 1) both; }
.message.user { margin-left: auto; }
.message__role { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; color: var(--cp-text-tertiary); font-size: 12px; }
.message.user .message__role { justify-content: flex-end; text-align: right; }
.message p { max-width: 72ch; margin: 0; color: var(--cp-text); font-size: 14px; white-space: pre-wrap; line-height: 1.82; }
.message__markdown { max-width: min(100%, 760px); overflow-wrap: anywhere; color: var(--cp-text); font-size: 14px; line-height: 1.82; }
.message__markdown :deep(.citation-marker) { margin-left: 2px; vertical-align: super; font-size: .72em; line-height: 0; }
.message__markdown :deep(.citation-marker button) { padding: 1px 3px; border: 0; border-radius: $radius-sm; color: var(--cp-primary); background: var(--cp-primary-lighter); font: inherit; font-weight: 600; line-height: 1.2; cursor: pointer; }
.message__markdown :deep(.citation-marker button:hover), .message__markdown :deep(.citation-marker button:focus-visible) { color: var(--cp-bg); background: var(--cp-primary); outline: none; }
.citation-card { position: fixed; z-index: 20; width: 320px; max-height: 220px; box-sizing: border-box; padding: 12px 14px; overflow: hidden; border: 1px solid var(--cp-border); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-overlay); box-shadow: $shadow-lg; pointer-events: none; }
.citation-card strong, .citation-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.citation-card strong { font-size: 13px; line-height: 1.5; }.citation-card span { margin-top: 2px; color: var(--cp-text-tertiary); font-size: 11px; }.citation-card p { display: -webkit-box; margin: 8px 0 0; overflow: hidden; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }
.message__live-status { display: inline-flex; align-items: center; gap: 6px; margin: 2px 0 6px; padding: 3px 10px; width: fit-content; border-radius: 999px; color: var(--cp-primary); background: color-mix(in srgb, var(--cp-primary) 10%, transparent); font-size: 11px; line-height: 1.4; }
.message__live-status .is-spinning { animation: harness-live-spin 1s linear infinite; }
.message__markdown :deep(> :first-child) { margin-top: 0; }.message__markdown :deep(> :last-child) { margin-bottom: 0; }.message__markdown :deep(h1), .message__markdown :deep(h2), .message__markdown :deep(h3), .message__markdown :deep(h4) { margin: 1.3em 0 .55em; color: var(--cp-text); font-weight: 600; line-height: 1.4; }.message__markdown :deep(h1) { font-size: 1.35em; }.message__markdown :deep(h2) { font-size: 1.2em; }.message__markdown :deep(h3), .message__markdown :deep(h4) { font-size: 1.05em; }.message__markdown :deep(p) { max-width: none; margin: 0 0 1em; white-space: normal; }.message__markdown :deep(ul), .message__markdown :deep(ol) { margin: 0 0 1em; padding-left: 1.55em; }.message__markdown :deep(li + li) { margin-top: .25em; }.message__markdown :deep(blockquote) { margin: 1em 0; padding: .2em 0 .2em 1em; border-left: 3px solid var(--cp-border); color: var(--cp-text-secondary); }.message__markdown :deep(a) { color: var(--cp-primary); text-decoration: underline; text-underline-offset: 2px; }.message__markdown :deep(code) { padding: .12em .35em; border-radius: $radius-sm; color: var(--cp-text); background: var(--cp-bg-hover); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; }.message__markdown :deep(.markdown-code-block) { position: relative; max-width: 100%; }.message__markdown :deep(.markdown-code-block pre) { padding-right: 48px; }.message__markdown :deep(.markdown-code-copy) { position: absolute; z-index: 1; top: 8px; right: 8px; display: grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); cursor: pointer; font-size: 17px; line-height: 1; opacity: 0; transition: color $transition-fast, border-color $transition-fast, background $transition-fast, opacity $transition-fast; }.message__markdown :deep(.markdown-code-copy svg) { width: 15px; height: 15px; }.message__markdown :deep(.markdown-code-block:hover .markdown-code-copy), .message__markdown :deep(.markdown-code-copy:focus-visible), .message__markdown :deep(.markdown-code-copy[data-copied='true']) { opacity: 1; }.message__markdown :deep(.markdown-code-copy:hover), .message__markdown :deep(.markdown-code-copy:focus-visible) { border-color: var(--cp-primary); color: var(--cp-primary); outline: none; }.message__markdown :deep(.markdown-code-copy[data-copied='true']) { border-color: var(--cp-success); color: var(--cp-success); }.message__markdown :deep(pre) { max-width: 100%; margin: 1em 0; padding: 12px 14px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-hover); }.message__markdown :deep(pre code) { padding: 0; background: transparent; font-size: 12px; line-height: 1.65; }.message__markdown :deep(.markdown-table) { width: fit-content; max-width: 100%; margin: 1em 0; overflow-x: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-md; }.message__markdown :deep(table) { width: max-content; border-spacing: 0; border-collapse: separate; }.message__markdown :deep(th), .message__markdown :deep(td) { min-width: 90px; padding: 7px 10px; border-right: 1px solid var(--cp-border-light); border-bottom: 1px solid var(--cp-border-light); text-align: left; }.message__markdown :deep(th) { color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-weight: 600; }.message__markdown :deep(tr > :last-child) { border-right: 0; }.message__markdown :deep(tbody tr:last-child td) { border-bottom: 0; }.message__markdown :deep(hr) { margin: 1.25em 0; border: 0; border-top: 1px solid var(--cp-border-light); }
.message.user p, .message__edit-input { width: fit-content; max-width: min(78%, 72ch); margin-left: auto; padding: 10px 13px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); border-radius: $radius-md; background: var(--cp-bg-hover); line-height: 1.7; }.message__edit-input { display: block; width: min(78%, 560px); padding: 5px; }.message__edit-input :deep(.el-textarea__inner) { min-height: 54px !important; padding: 5px 7px; border: 0; box-shadow: none; color: var(--cp-text); background: transparent; }
.message__attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }.message__toolbar { display: flex; align-items: center; gap: 4px; margin-top: 8px; opacity: 0; transition: opacity $transition-fast; }.message:hover .message__toolbar { opacity: 1; }.message__time, .message__usage { color: var(--cp-text-tertiary); font-size: 11px; }.message__usage { margin-left: auto; }.message__tool-btn { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 0; border-radius: var(--cp-radius-sm, 4px); color: var(--cp-text-secondary); background: transparent; cursor: pointer; font-size: 12px; }.message__tool-btn:hover { color: var(--cp-text); background: var(--cp-bg-hover); }.message__tool-label { max-width: 0; overflow: hidden; opacity: 0; white-space: nowrap; transition: max-width $transition-fast, opacity $transition-fast; }.message__tool-btn:hover .message__tool-label { max-width: 80px; opacity: 1; }
.message.user .message__attachments, .message.user .message__toolbar { justify-content: flex-end; }
.file-chip { display: inline-flex; align-items: center; min-width: 0; gap: 5px; padding: 0 8px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 88%, transparent); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); font-size: 12px; line-height: 26px; }
.message-changes { margin-top: 18px; }.message-changes__title { margin: 0 0 7px; color: var(--cp-text-secondary); font-size: 12px; font-weight: 600; }.file-change { display: grid; width: 100%; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-elevated); font: inherit; text-align: left; cursor: pointer; transition: border-color $transition-fast, background $transition-fast; }.file-change + .file-change { margin-top: 6px; }.file-change:hover { border-color: var(--cp-border); background: var(--cp-bg-hover); }.file-change:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }.file-change__icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-size: 16px; }.file-change__content { display: grid; min-width: 0; gap: 2px; }.file-change__content strong { overflow: hidden; font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }.file-change__content small { color: var(--cp-text-tertiary); font-size: 11px; }.file-change__action { display: inline-flex; align-items: center; gap: 3px; color: var(--cp-text-secondary); font-size: 11px; white-space: nowrap; }.file-change__action .app-icon { font-size: 12px; }
@keyframes harness-live-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
@keyframes user-message-enter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .message__live-status .is-spinning, .message.user.is-entering { animation: none; } }
</style>
