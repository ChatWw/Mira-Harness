<template>
  <aside class="ai-panel">
    <div class="ai-panel__header"><strong>AI 工作台</strong><el-select :model-value="assistantRole" size="small" aria-label="选择模型职责" @update:model-value="$emit('role-change', $event)"><el-option label="创作模型" value="authoring" /><el-option label="自动处理模型" value="automation" /></el-select></div>
    <div class="ai-actions"><button v-for="action in quickActions" :key="action.key" type="button" @click="$emit('quick-action', action.key)"><AppIcon :name="action.icon" />{{ action.title }}</button></div>
    <div class="assistant-output" :class="{ empty: !assistantOutput }"><template v-if="assistantOutput"><div class="assistant-output__title">{{ assistantOutputTitle }}</div><p>{{ assistantOutput }}</p><div class="assistant-output__actions"><el-button text @click="$emit('copy', assistantOutput)">复制</el-button><el-button v-if="pendingSelection" text type="primary" @click="$emit('apply-selection')">应用到选中内容</el-button></div></template><span v-else>选择一个创作动作，或直接向助手提问。</span></div>
    <div class="assistant-composer"><textarea :value="assistantPrompt" placeholder="向助手提问…" @input="$emit('prompt-change', ($event.target as HTMLTextAreaElement).value)" @keydown.meta.enter.prevent="$emit('send-message')" @keydown.ctrl.enter.prevent="$emit('send-message')"></textarea><el-button circle type="primary" :loading="generating" aria-label="发送问题" @click="$emit('send-message')"><AppIcon name="Top" /></el-button></div>
    <div class="tool-links"><button v-for="tool in tools" :key="tool.key" type="button" @click="$emit('open-tool', tool.key)"><AppIcon :name="tool.icon" />{{ tool.title }}</button></div>
  </aside>
</template>

<script setup lang="ts">
import type { NovelModelRole } from '@/config/novel'
import type { QuickAction, Tool } from '../types'

defineProps<{ assistantRole: NovelModelRole; quickActions: QuickAction[]; assistantOutput: string; assistantOutputTitle: string; pendingSelection: boolean; assistantPrompt: string; generating: boolean }>()
defineEmits<{
  'role-change': [role: NovelModelRole]
  'quick-action': [key: string]
  copy: [value: string]
  'apply-selection': []
  'prompt-change': [value: string]
  'send-message': []
  'open-tool': [tool: Tool]
}>()

const tools: { key: Tool; title: string; icon: string }[] = [
  { key: 'ideas', title: '书名与简介', icon: 'MagicStick' }, { key: 'optimizer', title: '批量优化', icon: 'RefreshRight' }, { key: 'splitter', title: '拆书', icon: 'Scissor' }, { key: 'prompts', title: '提示词', icon: 'DocumentCopy' }, { key: 'shortcuts', title: '快捷词条', icon: 'Key' },
]
</script>

<style scoped lang="scss">
.ai-panel { display: flex; flex-direction: column; gap: $spacing-md; min-width: 0; padding: $spacing-md $spacing-sm; overflow: auto; background: var(--cp-bg-elevated); border-left: 1px solid var(--cp-border); }.ai-panel__header, .assistant-output__actions { display: flex; align-items: center; justify-content: space-between; gap: $spacing-sm; }.ai-panel__header strong { color: var(--cp-text); font-size: $font-sm; font-weight: $font-semibold; }.ai-panel__header :deep(.el-select) { width: 112px; }.ai-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.ai-actions button, .tool-links button { display: flex; align-items: center; gap: 7px; color: var(--cp-text-secondary); cursor: pointer; background: var(--cp-bg); border: 1px solid var(--cp-border); border-radius: $radius-sm; font: inherit; font-size: $font-xs; }.ai-actions button { min-height: 36px; padding: 0 8px; text-align: left; }.ai-actions button:hover, .tool-links button:hover { color: var(--cp-text); border-color: var(--cp-text-tertiary); }.assistant-output { flex: 1; min-height: 150px; padding: $spacing-sm $spacing-md; color: var(--cp-text-secondary); white-space: pre-wrap; background: var(--cp-bg); border: 1px solid var(--cp-border); border-radius: $radius-md; font-size: $font-sm; line-height: 1.7; }.assistant-output.empty { display: flex; align-items: center; color: var(--cp-text-tertiary); }.assistant-output__title { margin-bottom: $spacing-sm; color: var(--cp-text); font-size: $font-xs; font-weight: $font-medium; }.assistant-output p { margin: 0; }.assistant-composer { display: flex; align-items: flex-end; gap: $spacing-xs; padding: $spacing-xs; background: var(--cp-bg); border: 1px solid var(--cp-border); border-radius: $radius-md; }.assistant-composer textarea { flex: 1; min-height: 46px; color: var(--cp-text); resize: none; background: transparent; border: 0; outline: 0; font: inherit; font-size: $font-sm; line-height: 1.5; }.tool-links { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }.tool-links button { padding: 7px; border-color: transparent; background: transparent; }
@include media-max($breakpoint-lg) { .ai-panel { grid-column: 1 / -1; display: grid; grid-template-columns: 190px 1fr 1fr; align-items: start; border-top: 1px solid var(--cp-border); border-left: 0; }.ai-panel__header { flex-direction: column; align-items: flex-start; }.assistant-composer, .tool-links { grid-column: span 1; } }
@include media-max($breakpoint-md) { .ai-panel { display: flex; border-top: 1px solid var(--cp-border); }.assistant-output { min-height: 150px; } }
</style>
