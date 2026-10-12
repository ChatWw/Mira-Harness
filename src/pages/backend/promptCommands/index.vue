<template>
  <SettingsPageShell title="自定义命令" wide>
    <section class="prompt-commands" :aria-busy="busy">
      <p class="prompt-commands__description">保存常用提示词，在工作台输入 / 选择命令。选择只填入输入框，发送后才会执行；同名命令按项目、全局、插件顺序使用。</p>
      <div class="prompt-commands__toolbar">
        <el-select :model-value="workspace" :disabled="busy" aria-label="命令作用范围" @change="selectWorkspace">
          <el-option label="全局 · 所有项目" value="global" />
          <el-option v-for="project in projects" :key="project.id" :label="`项目 · ${project.name}`" :value="project.id" />
        </el-select>
        <el-button :disabled="busy" aria-label="重新加载命令" @click="refresh"><AppIcon name="lucide:refresh-cw" /></el-button>
        <el-button type="primary" :disabled="busy || !api?.promptCommands" @click="create"><AppIcon name="Plus" />新建命令</el-button>
      </div>
      <p v-if="error" class="prompt-commands__error" role="alert">{{ error }}</p>
      <p v-if="feedback" role="status">{{ feedback }}</p>
      <p v-if="busy && !items.length" role="status">正在加载命令…</p>
      <div v-else class="prompt-commands__list">
        <article v-for="item in items" :key="item.id" class="prompt-commands__row">
          <div class="prompt-commands__identity"><h2>/{{ item.name }} <el-tag size="small" effect="plain">{{ item.scope === 'project' ? '当前项目' : '全局' }}</el-tag></h2><p>{{ item.description || '未填写说明' }}</p><p v-if="item.argumentHint" class="prompt-commands__hint">参数：{{ item.argumentHint }}</p><p v-if="item.unavailableReason || item.shadowed" class="prompt-commands__error">{{ item.unavailableReason || '被同名项目命令覆盖；全局版本仍可编辑' }}</p></div>
          <div class="prompt-commands__actions"><el-button text :disabled="busy" :aria-label="`编辑 ${item.name}`" @click="edit(item)"><AppIcon name="EditPen" />编辑</el-button><el-button text type="danger" :disabled="busy" :aria-label="`删除 ${item.name}`" @click="remove(item)"><AppIcon name="Delete" />删除</el-button></div>
        </article>
        <p v-if="!busy && !items.length && !error" class="prompt-commands__empty">还没有自定义命令。新建一个命令后，回到工作台输入 / 即可选择。</p>
      </div>
      <section v-if="draft" class="prompt-commands__editor" aria-label="命令编辑器">
        <div class="prompt-commands__editor-heading"><h2>{{ draft.revision ? '编辑命令' : '新建命令' }} · {{ draft.scope === 'project' ? '当前项目' : '全局' }}</h2><span v-if="dirty" role="status">未保存</span></div>
        <el-form label-position="top" @submit.prevent="save">
          <el-form-item label="命令名称"><el-input v-model="draft.name" :disabled="busy || Boolean(draft.revision)" maxlength="256" placeholder="例如 review 或 team:review" aria-label="命令名称" /></el-form-item>
          <el-form-item label="Markdown 提示词"><el-input v-model="draft.source" type="textarea" :rows="14" :disabled="busy" maxlength="100000" spellcheck="false" resize="vertical" aria-label="命令 Markdown 提示词" /></el-form-item>
          <p class="prompt-commands__description">可在 YAML frontmatter 中填写 description、argument-hint。正文中的 $ARGUMENTS 会替换为发送时补充的参数。</p>
          <p v-if="editorError" class="prompt-commands__error" role="alert">{{ editorError }}</p>
          <div class="prompt-commands__actions"><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :disabled="busy || !dirty || !draft.name.trim() || !draft.source.trim()" :loading="busy" @click="save">保存命令</el-button></div>
        </el-form>
      </section>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import type { HarnessProject } from '@/config/harness'
import type { MiraPromptCommandItem, MiraPromptCommandScope } from '@/config/miraPromptCommands'
import { getPlatformApi } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const api = getPlatformApi()
const route = useRoute()
const projects = shallowRef<HarnessProject[]>([])
const workspace = ref(typeof route.query.project === 'string' ? route.query.project : 'global')
const items = shallowRef<MiraPromptCommandItem[]>([])
const busy = ref(false), error = ref(''), editorError = ref(''), feedback = ref('')
type Draft = { scope: MiraPromptCommandScope; name: string; source: string; revision?: string }
const draft = ref<Draft>()
let original = '', mounted = true
const dirty = computed(() => Boolean(draft.value && JSON.stringify([draft.value.name, draft.value.source]) !== original))
const projectId = computed(() => workspace.value === 'global' ? undefined : workspace.value)
const message = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method 'platform:prompt-commands': Error: /, '')

async function mayDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('命令尚未保存，放弃本次修改？', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
}
function setDraft(value?: Draft) { draft.value = value; original = value ? JSON.stringify([value.name, value.source]) : ''; editorError.value = '' }
async function load() {
  if (!api?.promptCommands) throw new Error('自定义命令管理需要桌面宿主，请重启到最新版本后重试。')
  const value = await api.promptCommands.list({ ...(projectId.value ? { projectId: projectId.value } : {}) })
  if (mounted) items.value = value
}
async function refresh() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await load() } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function selectWorkspace(value: string) {
  if (value === workspace.value || !await mayDiscard() || !mounted) return
  workspace.value = value; items.value = []; setDraft(); feedback.value = ''; await refresh()
}
async function create() {
  if (!await mayDiscard() || !mounted) return
  setDraft({ scope: projectId.value ? 'project' : 'global', name: '', source: '---\ndescription: 命令说明\nargument-hint: <需求>\n---\n\n请处理以下需求：$ARGUMENTS\n' }); feedback.value = ''
}
async function edit(item: MiraPromptCommandItem) {
  if (!await mayDiscard() || !api?.promptCommands || !mounted) return
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    const value = await api.promptCommands.read({ scope: item.scope, name: item.name, ...(item.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (mounted) setDraft({ scope: value.command.scope, name: value.command.name, source: value.source, revision: value.command.revision })
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function save() {
  const value = draft.value
  if (busy.value || !value || !dirty.value || !api?.promptCommands) return
  busy.value = true; editorError.value = ''; feedback.value = ''
  try {
    await api.promptCommands.save({ scope: value.scope, name: value.name.trim(), source: value.source, ...(value.revision ? { expectedRevision: value.revision } : {}), ...(value.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (!mounted) return
    setDraft(); feedback.value = '命令已保存，回到工作台输入 / 选择。'; await load()
  } catch (failure) { if (mounted) { if (draft.value) editorError.value = message(failure); else error.value = message(failure) } }
  finally { if (mounted) busy.value = false }
}
async function remove(item: MiraPromptCommandItem) {
  if (!await mayDiscard() || !api?.promptCommands || !mounted) return
  try { await ElMessageBox.confirm(`删除${item.scope === 'project' ? '项目' : '全局'}命令 /${item.name}？`, '删除命令', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) }
  catch { return }
  if (!mounted || busy.value) return
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    await api.promptCommands.delete({ scope: item.scope, name: item.name, expectedRevision: item.revision, ...(item.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (!mounted) return
    setDraft(); feedback.value = '命令已删除。'; await load()
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function close() { if (await mayDiscard() && mounted) setDraft() }
onBeforeRouteLeave(mayDiscard)
onUnmounted(() => { mounted = false })
onMounted(async () => {
  busy.value = true
  try {
    if (!api) throw new Error('命令管理需要桌面宿主。')
    const value = await api.listHarnessProjects()
    if (!mounted) return
    projects.value = value
    await load()
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
})
</script>

<style scoped lang="scss">
.prompt-commands__description, .prompt-commands__empty { margin: 0 0 20px; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }
.prompt-commands__toolbar { display: flex; gap: 8px; margin-bottom: 20px; }
.prompt-commands__toolbar .el-select { flex: 1; min-width: 0; }
.prompt-commands__toolbar :deep(.el-button + .el-button), .prompt-commands__actions :deep(.el-button + .el-button) { margin-left: 0; }
.prompt-commands__toolbar :deep(.app-icon), .prompt-commands__actions :deep(.app-icon) { margin-right: 6px; }
.prompt-commands__row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-bottom: 1px solid var(--cp-border-light); }
.prompt-commands__identity { min-width: 0; }
.prompt-commands__row h2 { margin: 0; font-size: $font-sm; overflow-wrap: anywhere; }
.prompt-commands__row p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; overflow-wrap: anywhere; }
.prompt-commands__error, .prompt-commands__row .prompt-commands__error { color: color-mix(in srgb, var(--cp-danger) 75%, var(--cp-text)); font-size: $font-sm; line-height: 1.6; overflow-wrap: anywhere; }
.prompt-commands__actions { display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.prompt-commands__editor { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--cp-border-light); }
.prompt-commands__editor-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.prompt-commands__editor-heading h2 { margin: 0; font-size: $font-lg; }
.prompt-commands__editor-heading span { color: var(--cp-text-secondary); font-size: $font-sm; }
.prompt-commands__editor :deep(textarea) { font: 12px/20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; caret-color: var(--cp-text); }
</style>
