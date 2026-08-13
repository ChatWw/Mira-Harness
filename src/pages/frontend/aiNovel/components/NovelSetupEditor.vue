<template>
  <section class="setup-editor">
    <header class="setup-editor__header">
      <div>
        <h2>{{ label }}</h2>
        <span>{{ modelValue.trim().length }} 字</span>
      </div>
    </header>

    <NovelMarkdownEditor v-if="editorMode === 'markdown'" :model-value="modelValue" :placeholder="placeholder" @update:model-value="emitValue" />
    <div v-else class="text-editor">
      <Toolbar :editor="wangEditor" :default-config="toolbarConfig" mode="default" />
      <Editor
        :model-value="richHtml"
        class="text-editor__content"
        :default-config="editorConfig"
        mode="default"
        @update:model-value="richHtml = $event"
        @on-created="handleCreated"
        @on-change="handleChange"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, shallowRef, ref, watch } from 'vue'
import { Editor, Toolbar } from '@wangeditor-next/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor-next/editor'
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
import NovelMarkdownEditor from './NovelMarkdownEditor.vue'
import '@wangeditor-next/editor/dist/css/style.css'

type EditorMode = 'markdown' | 'rich'

const props = defineProps<{
  modelValue: string
  label: string
  placeholder: string
  editorMode: EditorMode
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const richHtml = ref('')
const wangEditor = shallowRef<IDomEditor>()
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })
const richToolbarKeys: IToolbarConfig['toolbarKeys'] = ['headerSelect', 'bold', 'italic', 'through', 'blockquote', 'bulletedList', 'numberedList', 'insertLink', 'codeBlock', 'undo', 'redo']
const toolbarConfig: Partial<IToolbarConfig> = { toolbarKeys: richToolbarKeys }
const editorConfig: Partial<IEditorConfig> = {
  placeholder: props.placeholder,
  MENU_CONF: {},
}
let syncing = false

function emitValue(value: string) { emit('update:modelValue', value) }
function handleCreated(editor: IDomEditor) {
  wangEditor.value = editor
  const html = markdown.render(props.modelValue)
  richHtml.value = html
  editor.setHtml(html)
}
function handleChange(editor: IDomEditor) {
  if (syncing) return
  emitValue(turndown.turndown(editor.getHtml()))
}
function destroyEditor(editor?: IDomEditor) {
  if (editor && !editor.isDestroyed) editor.destroy()
  wangEditor.value = undefined
}

watch(() => props.modelValue, value => {
  richHtml.value = markdown.render(value)
  if (!wangEditor.value) return
  const nextHtml = markdown.render(value)
  if (turndown.turndown(wangEditor.value.getHtml()).trim() === value.trim()) return
  syncing = true
  richHtml.value = nextHtml
  wangEditor.value.setHtml(nextHtml)
  syncing = false
})
onBeforeUnmount(() => { destroyEditor(wangEditor.value) })
</script>

<style scoped lang="scss">
.setup-editor { overflow: hidden; background: var(--cp-bg-elevated); border: 1px solid var(--cp-border); border-radius: $radius-md; }
.setup-editor__header { display: flex; align-items: center; justify-content: space-between; gap: $spacing-md; padding: $spacing-sm $spacing-md; border-bottom: 1px solid var(--cp-border-light); }
.setup-editor__header h2 { margin: 0; color: var(--cp-text); font-size: $font-sm; font-weight: $font-medium; }
.setup-editor__header span { display: block; margin-top: 2px; color: var(--cp-text-tertiary); font-size: $font-xs; }
.text-editor {
  --w-e-textarea-bg-color: var(--cp-bg-elevated);
  --w-e-textarea-color: var(--cp-text);
  --w-e-textarea-border-color: var(--cp-border);
  --w-e-textarea-slight-border-color: var(--cp-border-light);
  --w-e-textarea-slight-color: var(--cp-text-tertiary);
  --w-e-textarea-slight-bg-color: var(--cp-bg);
  --w-e-textarea-selected-border-color: var(--cp-primary);
  --w-e-toolbar-color: var(--cp-text-secondary);
  --w-e-toolbar-bg-color: var(--cp-bg-elevated);
  --w-e-toolbar-active-color: var(--cp-text);
  --w-e-toolbar-active-bg-color: var(--cp-bg-hover);
  --w-e-toolbar-disabled-color: var(--cp-text-tertiary);
  --w-e-toolbar-border-color: var(--cp-border-light);
  --w-e-modal-button-bg-color: var(--cp-bg);
  --w-e-modal-button-border-color: var(--cp-border);
  background: var(--cp-bg-elevated);
}
.text-editor :deep(.w-e-toolbar) { border: 0 !important; border-bottom: 1px solid var(--cp-border-light) !important; background: var(--cp-bg-elevated) !important; }
.text-editor__content { display: block; height: 260px; }
.text-editor :deep(.w-e-text-container) { min-height: 260px; background: var(--cp-primary-contrast); border: 0 !important; }
.text-editor :deep(.w-e-text) { min-height: 260px; color: var(--cp-text); background: var(--cp-bg-elevated); }
.text-editor :deep(.w-e-text-placeholder) { color: var(--cp-text-tertiary); }
@include media-max($breakpoint-md) { .setup-editor__header { align-items: flex-start; flex-direction: column; } }
</style>
