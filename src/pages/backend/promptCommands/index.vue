<template>
  <SettingsPageShell title="自定义命令" :show-title="false">
    <template v-if="draft" #titlebar><nav class="prompt-commands__breadcrumb" aria-label="页面位置"><button type="button" :disabled="busy" @click="close">自定义命令</button><AppIcon name="lucide:chevron-right" /><span>{{ draft.revision ? draft.name : '新建命令' }}</span></nav></template>
    <section class="prompt-commands" :aria-busy="busy">
      <template v-if="!draft">
      <h1 class="prompt-commands__title">自定义命令</h1>
      <div ref="directoryHeading" class="prompt-commands__toolbar" tabindex="-1">
        <SettingsScopeSelect :model-value="workspace" :workspaces="projects" :disabled="busy" aria-label="命令作用范围" @update:model-value="selectWorkspace" />
        <span class="prompt-commands__divider" aria-hidden="true" /><span class="prompt-commands__count">命令 <small>{{ filtered.length }}</small></span>
        <label class="prompt-commands__search"><AppIcon name="lucide:search" /><input :value="query" @input="query = ($event.target as HTMLInputElement).value" type="search" aria-label="搜索命令" placeholder="搜索命令…" /></label>
      </div>
      <div class="prompt-commands__group-heading"><h2>已安装 <small>{{ filtered.length }}</small></h2><div class="prompt-commands__actions">
        <el-dropdown trigger="click" :disabled="busy || !api?.promptCommands" @command="importInput?.click()"><el-button aria-label="更多命令操作" title="更多命令操作" :disabled="busy || !api?.promptCommands"><AppIcon name="lucide:ellipsis" /></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="import"><AppIcon name="lucide:import" />从 Markdown 文件导入</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
        <input ref="importInput" class="prompt-commands__file" type="file" accept=".md,.markdown,text/markdown" aria-label="导入命令文件" @change="importCommand" />
        <el-button :disabled="busy" :loading="busy" aria-label="重新加载命令" title="重新加载命令" @click="refresh"><AppIcon name="lucide:refresh-cw" /></el-button>
        <el-button type="primary" :disabled="busy || !api?.promptCommands" aria-label="新建命令" @click="create"><AppIcon name="lucide:plus" />新建</el-button>
      </div></div>
      <p v-if="error" class="prompt-commands__error" role="alert">{{ error }}</p>
      <p v-if="feedback" role="status">{{ feedback }}</p>
      <p v-if="busy && !items.length" role="status">正在加载命令…</p>
      <div v-else class="prompt-commands__list">
        <article v-for="item in filtered" :key="item.id" class="prompt-commands__row">
          <span class="prompt-commands__mark" aria-hidden="true"><AppIcon name="lucide:terminal" /></span>
          <div class="prompt-commands__identity"><h2>/{{ item.name }} <span v-if="item.scope === 'global' && workspace !== 'global'" class="prompt-commands__hint">全局</span></h2><p>{{ item.description || '未填写说明' }}</p><p v-if="item.argumentHint" class="prompt-commands__hint">参数：{{ item.argumentHint }}</p><p v-if="item.unavailableReason || item.shadowed" class="prompt-commands__error">{{ item.unavailableReason || '被同名项目命令覆盖；全局版本仍可编辑' }}</p></div>
          <div class="prompt-commands__actions"><el-button text circle :disabled="busy" :aria-label="`编辑 ${item.name}`" :title="`编辑 ${item.name}`" @click="edit(item)"><AppIcon name="EditPen" /></el-button><el-button text circle type="danger" :disabled="busy" :aria-label="`删除 ${item.name}`" :title="`删除 ${item.name}`" @click="remove(item)"><AppIcon name="Delete" /></el-button></div>
        </article>
        <div v-if="!busy && !filtered.length && !error" class="prompt-commands__empty"><h3>{{ query.trim() ? '没有找到匹配的命令' : '尚未安装命令' }}</h3><p>{{ query.trim() ? '尝试其他名称或说明。' : '新建常用提示词命令，或从 Markdown 文件导入已有命令。' }}</p><el-button v-if="!query.trim()" type="primary" :disabled="!api?.promptCommands" aria-label="新建命令" @click="create"><AppIcon name="lucide:plus" />新建</el-button></div>
      </div>
      </template>
      <header v-if="draft" class="prompt-commands__editor-heading"><h1 ref="editorHeading" tabindex="-1">{{ draft.revision ? '编辑命令' : '新建命令' }}</h1></header>
      <section v-if="draft" class="prompt-commands__editor" aria-label="命令编辑器">
        <el-form label-position="top" @submit.prevent="save">
          <div class="prompt-commands__form-top"><el-form-item label="命令名称"><el-input v-model="draft.name" :disabled="busy || Boolean(draft.revision)" maxlength="256" placeholder="例如 review 或 team:review" aria-label="命令名称" /></el-form-item><div class="prompt-commands__scope"><span>作用域</span><SettingsScopeSelect :model-value="draft.projectId || 'global'" :workspaces="projects" :disabled="busy || Boolean(draft.revision)" aria-label="命令作用范围" @update:model-value="selectDraftWorkspace" /><el-button text :disabled="busy" @click="changeMode">{{ markdownMode ? '返回表单' : '编辑 Markdown' }}</el-button></div></div>
          <template v-if="!markdownMode && form">
            <el-form-item label="说明（可选）"><el-input v-model="form.description" :disabled="busy" placeholder="这个命令用来做什么" aria-label="命令说明" /></el-form-item>
            <el-form-item label="参数提示（可选）"><el-input v-model="form.argumentHint" :disabled="busy" placeholder="例如 <文件路径> <审查重点>" aria-label="命令参数提示" /></el-form-item>
            <el-form-item label="提示词"><el-input v-model="form.prompt" type="textarea" :rows="5" :disabled="busy" maxlength="100000" resize="vertical" placeholder="输入命令内容，使用 $ARGUMENTS 引用补充参数" aria-label="命令提示词" /></el-form-item>
          </template>
          <el-form-item v-else label="Markdown 提示词"><el-input v-model="draft.source" type="textarea" :rows="14" :disabled="busy" maxlength="100000" spellcheck="false" resize="vertical" placeholder="输入 Markdown 提示词及可选 YAML 配置" aria-label="命令 Markdown 提示词" /></el-form-item>
          <p v-if="editorError" class="prompt-commands__error" role="alert">{{ editorError }}</p>
          <div class="prompt-commands__actions"><span v-if="dirty" class="prompt-commands__unsaved" role="status">未保存</span><el-button type="primary" aria-label="保存命令" :disabled="busy || !dirty || !draft.name.trim() || !(markdownMode ? draft.source.trim() : form?.prompt.trim())" :loading="busy" @click="save">保存</el-button><el-button text :disabled="busy" @click="close">取消</el-button></div>
        </el-form>
      </section>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
// Layout adapted from ZCode CommandsSection/CommandForm (Apache-2.0); see third-party-licenses/zcode.
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { parseDocument } from 'yaml'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import type { HarnessProject } from '@/config/harness'
import type { MiraPromptCommandItem, MiraPromptCommandScope } from '@/config/miraPromptCommands'
import { getPlatformApi } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import SettingsScopeSelect from '../settings/components/SettingsScopeSelect.vue'

const api = getPlatformApi()
const route = useRoute()
const projects = shallowRef<HarnessProject[]>([])
const workspace = ref(typeof route.query.project === 'string' ? route.query.project : 'global')
const items = shallowRef<MiraPromptCommandItem[]>([])
const busy = ref(false), error = ref(''), editorError = ref(''), feedback = ref('')
type Draft = { scope: MiraPromptCommandScope; name: string; source: string; revision?: string; projectId?: string }
const draft = ref<Draft>()
type CommandForm = { description: string; argumentHint: string; prompt: string }
const form = ref<CommandForm>(), markdownMode = ref(false), query = ref('')
const editorHeading = ref<HTMLHeadingElement>(), directoryHeading = ref<HTMLDivElement>(), importInput = ref<HTMLInputElement>()
let original = '', originalForm = '', mounted = true
const dirty = computed(() => Boolean(draft.value && (JSON.stringify(draft.value) !== original || !markdownMode.value && JSON.stringify(form.value) !== originalForm)))
const filtered = computed(() => { const search = query.value.trim().toLocaleLowerCase(); return items.value.filter(item => [item.name, item.description, item.argumentHint || ''].some(text => text.toLocaleLowerCase().includes(search))) })
const projectId = computed(() => workspace.value === 'global' ? undefined : workspace.value)
const message = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method 'platform:prompt-commands': Error: /, '')

async function mayDiscard() {
  if (busy.value) return false
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('命令尚未保存，放弃本次修改？', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
}
const frontmatter = (source: string) => /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
function readForm(source: string): CommandForm {
  const header = frontmatter(source)
  if (!header && /^---(?:\r?\n|$)/.test(source)) throw new Error('YAML 配置无效，请在 Markdown 中修正。')
  const document = parseDocument(header?.[1] || '')
  const metadata = document.toJS({ maxAliasCount: 0 })
  if (document.errors.length || metadata != null && (typeof metadata !== 'object' || Array.isArray(metadata)) || ['description', 'argument-hint'].some(key => metadata?.[key] !== undefined && typeof metadata[key] !== 'string')) throw new Error('配置无法用表单表示，请在 Markdown 中编辑。')
  return { description: metadata?.description || '', argumentHint: metadata?.['argument-hint'] || '', prompt: source.slice(header?.[0].length || 0) }
}
function writeSource() {
  if (!draft.value || !form.value) return draft.value?.source || ''
  const source = draft.value.source, initial = readForm(source), value = form.value
  if (JSON.stringify(initial) === JSON.stringify(value)) return source
  const header = frontmatter(source), document = parseDocument(header?.[1] || '')
  for (const [key, content, previous] of [['description', value.description, initial.description], ['argument-hint', value.argumentHint, initial.argumentHint]]) {
    if (content !== previous) { if (content) document.set(key, content); else document.delete(key) }
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  return header || value.description || value.argumentHint ? `---${newline}${document.toString().replace(/\r?\n/g, newline)}---${newline}${value.prompt}` : value.prompt
}
function setDraft(value?: Draft) {
  draft.value = value; original = value ? JSON.stringify(value) : ''; editorError.value = ''; markdownMode.value = false; form.value = undefined
  if (value) try { form.value = readForm(value.source) } catch { markdownMode.value = true }
  originalForm = JSON.stringify(form.value) || ''
}
function changeMode() {
  if (busy.value || !draft.value) return
  try {
    if (markdownMode.value) form.value = readForm(draft.value.source)
    else draft.value.source = writeSource()
    markdownMode.value = !markdownMode.value; editorError.value = ''
  } catch (failure) { editorError.value = message(failure) }
}
function selectDraftWorkspace(value: string) {
  if (!draft.value || draft.value.revision || busy.value || value !== 'global' && !projects.value.some(project => project.id === value)) return
  draft.value.scope = value === 'global' ? 'global' : 'project'; draft.value.projectId = value === 'global' ? undefined : value
}
async function importCommand(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''
  if (!file || !await mayDiscard()) return
  try {
    if (file.size > 256 * 1024) throw new Error('命令文件不能超过 256KB。')
    const source = await file.text()
    if (!mounted) return
    setDraft({ scope: projectId.value ? 'project' : 'global', projectId: projectId.value, name: file.name.replace(/\.(md|markdown)$/i, ''), source })
    // Imported content is a new, reviewable draft; the source file is never changed.
    original = ''; feedback.value = ''; await nextTick(); editorHeading.value?.focus?.()
  } catch (failure) { if (mounted) error.value = message(failure) }
}
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
  setDraft({ scope: projectId.value ? 'project' : 'global', projectId: projectId.value, name: '', source: '' }); feedback.value = ''
  await nextTick(); editorHeading.value?.focus?.()
}
async function edit(item: MiraPromptCommandItem) {
  if (!await mayDiscard() || !api?.promptCommands || !mounted) return
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    const value = await api.promptCommands.read({ scope: item.scope, name: item.name, ...(item.scope === 'project' ? { projectId: projectId.value } : {}) })
    if (mounted) {
      setDraft({ scope: value.command.scope, name: value.command.name, source: value.source, revision: value.command.revision, ...(value.command.scope === 'project' ? { projectId: projectId.value } : {}) })
      await nextTick(); editorHeading.value?.focus?.()
    }
  } catch (failure) { if (mounted) error.value = message(failure) }
  finally { if (mounted) busy.value = false }
}
async function save() {
  const value = draft.value
  if (busy.value || !value || !dirty.value || !api?.promptCommands) return
  busy.value = true; editorError.value = ''; feedback.value = ''
  try {
    const source = markdownMode.value ? value.source : writeSource()
    await api.promptCommands.save({ scope: value.scope, name: value.name.trim(), source, ...(value.revision ? { expectedRevision: value.revision } : {}), ...(value.scope === 'project' ? { projectId: value.projectId } : {}) })
    if (!mounted) return
    if (!value.revision) workspace.value = value.projectId || 'global'
    setDraft(); feedback.value = '命令已保存，回到工作台输入 / 选择。'; await load(); await nextTick(); directoryHeading.value?.focus?.()
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
async function close() { if (await mayDiscard() && mounted) { setDraft(); await nextTick(); directoryHeading.value?.focus?.() } }
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
.prompt-commands__title { margin: 0 0 32px; font-size: var(--settings-text-title); font-weight: 550; letter-spacing: -0.02em; line-height: 1.333333; }
.prompt-commands__toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.prompt-commands__toolbar:focus, .prompt-commands__editor-heading h1:focus { outline: none; }
.prompt-commands__divider { width: 1px; height: 16px; background: var(--cp-border-light); }
.prompt-commands__count, .prompt-commands__group-heading h2 { font-size: var(--settings-text-base); font-weight: 500; }
.prompt-commands small { margin-left: 6px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); font-weight: 400; }
.prompt-commands__search { display: flex; align-items: center; gap: 8px; width: 256px; box-sizing: border-box; margin-left: auto; padding: 8px 11px; border: 1px solid var(--cp-border-light); border-radius: 12px; color: var(--cp-text-secondary); }
.prompt-commands__search:focus-within { border-color: var(--cp-border); }
.prompt-commands__search input { width: 100%; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--cp-text); font: inherit; font-size: 12px; }
.prompt-commands__search :deep(.app-icon) { flex: none; width: 12px; height: 12px; }
.prompt-commands__group-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.prompt-commands__group-heading h2 { margin: 0; }
.prompt-commands__actions :deep(.el-button + .el-button) { margin-left: 0; }
.prompt-commands__actions :deep(.app-icon) { margin: 0; }
.prompt-commands__actions :deep(.el-button--primary .app-icon), .prompt-commands__empty :deep(.app-icon) { margin-right: 4px; }
.prompt-commands__file { display: none; }
.prompt-commands__list { overflow: hidden; border-radius: 12px; background: var(--cp-bg-elevated); }
.prompt-commands__row { display: flex; align-items: center; gap: 16px; padding: 16px; }
.prompt-commands__row + .prompt-commands__row { border-top: 1px solid var(--cp-border-light); }
.prompt-commands__mark { display: grid; place-items: center; flex: 0 0 36px; height: 36px; border-radius: 10px; background: var(--cp-bg); color: var(--cp-text-secondary); }
.prompt-commands__mark :deep(.app-icon) { width: 16px; height: 16px; }
.prompt-commands__identity { flex: 1; min-width: 0; }
.prompt-commands__row h2 { margin: 0; font-size: var(--settings-text-base); font-weight: 450; overflow-wrap: anywhere; }
.prompt-commands__row p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); overflow-wrap: anywhere; }
.prompt-commands__error, .prompt-commands__row .prompt-commands__error { color: color-mix(in srgb, var(--cp-danger) 75%, var(--cp-text)); font-size: var(--settings-text-base); line-height: 1.6; overflow-wrap: anywhere; }
.prompt-commands__actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.prompt-commands__empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 168px; box-sizing: border-box; gap: 10px; padding: 24px; border: 1px dashed var(--cp-border); border-radius: 12px; background: var(--cp-bg); text-align: center; }
.prompt-commands__empty h3 { margin: 0; font-size: var(--settings-text-base); font-weight: 500; }
.prompt-commands__empty p { margin: 0 0 4px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6; }
.prompt-commands__editor { padding: 16px; border: 1px solid var(--cp-border-light); border-radius: 12px; }
.prompt-commands__editor-heading { margin-bottom: 16px; }
.prompt-commands__editor-heading h1 { margin: 0; font-size: 18px; line-height: 26px; font-weight: 600; }
.prompt-commands__form-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
.prompt-commands__form-top > :deep(.el-form-item) { width: 224px; }
.prompt-commands__scope { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 8px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.prompt-commands__unsaved { color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.prompt-commands__editor :deep(.el-form-item) { margin-bottom: 12px; }
.prompt-commands__editor :deep(.el-form-item__label) { margin-bottom: 6px; line-height: 20px; font-size: var(--settings-text-base); }
.prompt-commands__editor :deep(textarea) { caret-color: var(--cp-text); }
.prompt-commands__editor :deep(input::placeholder), .prompt-commands__editor :deep(textarea::placeholder), .prompt-commands__search input::placeholder { color: var(--cp-text-secondary); opacity: 1; }
.prompt-commands__editor :deep(textarea[aria-label="命令 Markdown 提示词"]) { font: 12px/20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.prompt-commands__breadcrumb { display: flex; align-items: center; gap: 10px; color: var(--cp-text); font-size: var(--settings-text-base); }
.prompt-commands__breadcrumb button { padding: 0; border: 0; background: transparent; color: var(--cp-text-secondary); font: inherit; cursor: pointer; }
.prompt-commands__breadcrumb button:hover { color: var(--cp-text); }
.prompt-commands__breadcrumb :deep(.app-icon) { width: 14px; color: var(--cp-text-tertiary); }
@media (max-width: 900px) {
  .prompt-commands__search { width: 100%; margin-left: 0; }
  .prompt-commands__row { flex-wrap: wrap; }
  .prompt-commands__form-top > :deep(.el-form-item) { width: 100%; }
}
</style>
