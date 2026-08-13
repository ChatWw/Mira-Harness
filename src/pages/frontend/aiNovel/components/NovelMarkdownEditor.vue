<template>
  <div ref="editorRoot" class="markdown-editor" />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Crepe } from '@milkdown/crepe'
import { replaceAll } from '@milkdown/kit/utils'
import '@milkdown/crepe/theme/common/style.css'

const props = defineProps<{
  modelValue: string
  placeholder: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const editorRoot = ref<HTMLElement>()
let editor: Crepe | undefined
let syncing = false

async function createEditor() {
  if (!editorRoot.value || editor) return

  const instance = new Crepe({
    root: editorRoot.value,
    defaultValue: props.modelValue,
    features: { [Crepe.Feature.TopBar]: true },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: { text: props.placeholder, mode: 'doc' },
      [Crepe.Feature.TopBar]: {
        headingOptions: [
          { label: '正文', level: null },
          { label: '标题一', level: 1 },
          { label: '标题二', level: 2 },
          { label: '标题三', level: 3 },
          { label: '标题四', level: 4 },
          { label: '标题五', level: 5 },
          { label: '标题六', level: 6 },
        ],
      },
    },
  })

  instance.on(listener => listener.markdownUpdated((_ctx, value) => {
    if (!syncing) emit('update:modelValue', value)
  }))
  await instance.create()
  editor = instance
}

function updateEditor(value: string) {
  if (!editor || editor.getMarkdown() === value) return
  syncing = true
  editor.editor.action(replaceAll(value))
  syncing = false
}

watch(() => props.modelValue, updateEditor)
onMounted(() => { void nextTick(createEditor) })
onBeforeUnmount(() => { void editor?.destroy(); editor = undefined })
</script>

<style scoped lang="scss">
.markdown-editor { min-height: 260px; background: var(--cp-bg-elevated); }
.markdown-editor :deep(.milkdown) {
  --crepe-color-background: var(--cp-bg-elevated);
  --crepe-color-on-background: var(--cp-text);
  --crepe-color-surface: var(--cp-bg-elevated);
  --crepe-color-surface-low: var(--cp-bg);
  --crepe-color-on-surface: var(--cp-text);
  --crepe-color-on-surface-variant: var(--cp-text-secondary);
  --crepe-color-outline: var(--cp-text-secondary);
  --crepe-color-primary: var(--cp-primary);
  --crepe-color-secondary: var(--cp-primary-light);
  --crepe-color-on-secondary: var(--cp-text);
  --crepe-color-inverse: var(--cp-text);
  --crepe-color-on-inverse: var(--cp-bg-elevated);
  --crepe-color-inline-code: var(--cp-danger);
  --crepe-color-error: var(--cp-danger);
  --crepe-color-hover: var(--cp-bg-hover);
  --crepe-color-selected: var(--cp-primary-lighter);
  --crepe-color-inline-area: var(--cp-bg);
  --crepe-font-title: inherit;
  --crepe-font-default: inherit;
  --crepe-shadow-1: none;
  --crepe-shadow-2: none;
  min-height: 260px;
  color: var(--cp-text);
  background: var(--cp-primary-contrast);
}
.markdown-editor :deep(.milkdown .ProseMirror) { min-height: 220px; padding: $spacing-md; color: var(--cp-text); font-family: inherit; font-size: $font-sm; line-height: 1.8; }
.markdown-editor :deep(.milkdown .milkdown-top-bar) { min-height: 36px; padding: 0 $spacing-sm; border-bottom: 1px solid var(--cp-border-light); background: var(--cp-bg-elevated); }
.markdown-editor :deep(.milkdown .milkdown-top-bar button) { color: var(--cp-text-secondary); }
.markdown-editor :deep(.milkdown .top-bar-heading-selector) { padding: 3px; }
.markdown-editor :deep(.milkdown .top-bar-heading-button) { height: 28px; padding: 3px 2px 3px $spacing-sm; }
.markdown-editor :deep(.milkdown .top-bar-heading-label) { min-width: 52px; font-size: $font-xs; line-height: 18px; }
.markdown-editor :deep(.milkdown .top-bar-chevron) { width: 18px; height: 18px; }
.markdown-editor :deep(.milkdown .top-bar-chevron svg) { width: 14px; height: 14px; }
.markdown-editor :deep(.milkdown .top-bar-item) { width: 28px; height: 28px; margin: 4px; padding: 4px; }
.markdown-editor :deep(.milkdown .top-bar-item svg) { width: 16px; height: 16px; }
.markdown-editor :deep(.milkdown .top-bar-divider) { height: 18px; margin: 6px; }
.markdown-editor :deep(.milkdown .top-bar-heading-dropdown) { min-width: 120px; padding: 4px; border: 1px solid var(--cp-border); border-radius: $radius-sm; box-shadow: 0 8px 20px rgb(0 0 0 / 12%); }
.markdown-editor :deep(.milkdown .top-bar-heading-option) { padding: 5px $spacing-sm; font-size: $font-xs; line-height: 18px; }
.markdown-editor :deep(.milkdown .milkdown-top-bar button:hover) { background: var(--cp-bg-hover); }
.markdown-editor :deep(.milkdown .crepe-placeholder::before) { color: var(--cp-text-tertiary); }
</style>
