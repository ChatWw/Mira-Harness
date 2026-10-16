<!-- Structural reference: ZCode SkillsSection / SettingsResourceGroup / SettingsResourceHeaderActions.
     Copyright 2026 Z.AI Co., Ltd. SPDX-License-Identifier: Apache-2.0. See third-party-licenses/zcode/. -->
<template>
  <section class="skill-settings" aria-label="技能管理">
    <p v-if="error" role="alert" class="skill-error">{{ error }}</p>
    <section v-if="!query?.trim() || visible.length" class="skill-group">
      <div class="skill-heading">
        <h2>已安装 <small>{{ visible.length }}</small></h2>
        <div class="skill-actions">
          <el-dropdown trigger="click" @command="moreAction"><button class="skill-button skill-icon-button" type="button" aria-label="更多操作" :disabled="busy"><AppIcon name="lucide:ellipsis" /></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="import"><AppIcon name="lucide:import" />导入</el-dropdown-item><el-dropdown-item command="directories"><AppIcon name="lucide:folder" />管理目录</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
          <button class="skill-button skill-icon-button" type="button" :disabled="busy" aria-label="刷新技能" @click="load"><AppIcon name="lucide:refresh-ccw" /></button>
          <button class="skill-button skill-primary" type="button" :disabled="busy" @click="createSkill"><AppIcon name="lucide:plus" />新建</button>
        </div>
      </div>
      <div v-if="visible.length" class="skill-list" :aria-busy="busy">
        <div v-for="skill in visible" :key="skill.id" class="skill-row">
          <span class="skill-avatar"><AppIcon name="lucide:wand-sparkles" /></span>
          <button class="skill-main" type="button" :aria-label="`查看技能 ${skill.name}`" @click="pluginDetail = undefined; selectedId = skill.id"><strong>{{ skill.name || '无效技能' }}</strong><span class="skill-description">{{ skill.valid ? skill.description : skill.error }}</span></button>
          <div class="skill-actions"><el-switch :model-value="skill.enabled" :disabled="busy || !skill.valid" :aria-label="`启用技能 ${skill.name}`" @change="toggle(skill.id, Boolean($event))" /><button class="skill-delete" type="button" :disabled="busy" :aria-label="`删除技能 ${skill.name}`" @click="remove(skill)"><AppIcon name="lucide:trash-2" /></button></div>
        </div>
      </div>
      <div v-else-if="!busy" class="skill-empty"><strong>尚未安装技能</strong><p>新建或导入技能，以扩展 Agent 的能力。</p><button class="skill-button skill-primary" type="button" @click="createSkill"><AppIcon name="lucide:plus" />新建技能</button><button class="skill-button" type="button" @click="moreAction('import')">导入</button></div>
    </section>
    <section v-for="group in pluginGroups" :key="group.plugin.id" class="skill-group">
      <div class="skill-heading"><h2>{{ group.plugin.listing?.displayName || group.plugin.name }} <small>{{ group.skills.length }}</small></h2></div>
      <div class="skill-list"><div v-for="skill in group.skills" :key="skill.name" class="skill-row"><span class="skill-avatar"><img v-if="pluginIcon(group.plugin)" :src="pluginIcon(group.plugin)" alt="" /><AppIcon v-else name="lucide:blocks" /></span><button class="skill-main" type="button" :aria-label="`查看插件技能 ${skill.name}`" @click="openPluginSkill(group.plugin, skill.name)"><strong>{{ skill.name }}</strong><span class="skill-description">{{ skill.description || '暂无描述' }}</span></button></div></div>
    </section>
    <p v-if="busy && !skills.length" role="status">正在读取技能…</p>
    <p v-else-if="query?.trim() && !visible.length && !pluginGroups.length" class="skill-empty">没有匹配的技能</p>
    <el-dialog :model-value="Boolean(selected)" :title="selected?.name || '技能详情'" width="576px" align-center append-to-body class="mira-skill-dialog mira-skill-detail-dialog" @close="selectedId = undefined; pluginDetail = undefined">
      <div v-if="selected" class="skill-detail">
        <div><h3>描述</h3><p class="skill-detail-description">{{ selected.description || selected.error || '暂无描述' }}</p></div>
        <div class="skill-detail-fields"><div><h3>范围</h3><p>{{ pluginDetail?.scope || '个人' }}</p></div><div><h3>状态</h3><p>{{ selected.enabled ? '已启用' : '已停用' }}</p></div><div class="skill-path-field"><h3>文件路径</h3><button class="skill-path" type="button" aria-label="在文件管理器中显示技能" @click="reveal(selected.id)"><span>{{ selected.path }}</span><AppIcon name="lucide:external-link" /></button></div></div>
      </div>
    </el-dialog>
    <el-dialog v-model="directoriesOpen" title="管理技能目录" width="560px" align-center append-to-body class="mira-skill-dialog">
      <div class="skill-directory-editor"><strong>共享技能目录</strong><code>{{ sharedDirectory }}</code><p>自动读取；Mira 新安装的独立技能放在这里。启用开关仅影响 Mira。</p><strong>Mira 旧目录</strong><code>{{ miraDirectory }}</code><p>继续读取已有技能，不自动移动文件。</p><label>额外技能目录<el-input v-model="directories" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }" placeholder="可选，每行一个绝对路径" /></label><p v-if="error" role="alert" class="skill-error">{{ error }}</p><div><button class="skill-button skill-primary" type="button" :disabled="busy" @click="save">保存</button></div></div>
    </el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import { useAppNavigationStore } from '@/stores/appNavigation'
import { HARNESS_WORKBENCH_PATH } from '@/platform/firstPartyNavigation'
import type { HarnessSkill } from '@/config/harness'
import icons from '../../../../apps/harness-react/src/components/extensions/plugin-icons.json'
import type { MiraPluginItem } from '@/config/miraPlugins'
const props = defineProps<{ query?: string; plugins: MiraPluginItem[] }>()
const emit = defineEmits<{ 'items-change': [items: HarnessSkill[]]; 'open-plugin': [id: string] }>()
const router = useRouter()
const skills = ref<HarnessSkill[]>([]), directories = ref(''), busy = ref(false), error = ref(''), directoriesOpen = ref(false), selectedId = ref<string>()
const sharedDirectory = ref(''), miraDirectory = ref('')
const pluginDetail = ref<{ skill: HarnessSkill; scope: string }>()
const selected = computed(() => pluginDetail.value?.skill || skills.value.find(item => item.id === selectedId.value))
function pluginIcon(plugin: MiraPluginItem) { const name = plugin.listing?.icon || plugin.name; return icons[name as keyof typeof icons] }
function openPluginSkill(plugin: MiraPluginItem, name: string) { return perform(async () => { const skill = await api().getHarnessPluginSkill(plugin.id, name); selectedId.value = undefined; pluginDetail.value = { skill, scope: plugin.listing?.displayName || plugin.name } }) }
const matches = (value: string) => value.toLocaleLowerCase().includes((props.query || '').trim().toLocaleLowerCase())
const visible = computed(() => skills.value.filter(skill => matches(`${skill.name} ${skill.description}`)).sort((a, b) => a.name.localeCompare(b.name)))
const pluginGroups = computed(() => props.plugins.map(plugin => ({ plugin, skills: plugin.skills.filter(skill => matches(`${skill.name} ${skill.description} ${plugin.name}`)) })).filter(group => group.skills.length))
async function perform(operation: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await operation(); emit('items-change', skills.value) } catch (cause) { error.value = cause instanceof Error ? cause.message : '技能操作失败，请重试' } finally { busy.value = false }
}
function api() { const value = getPlatformApi(); if (!value) throw new Error('桌面技能服务不可用'); return value }
function load() { return perform(async () => { const host = api(); const [settings, items] = await Promise.all([host.getHarnessSkillSettings(), host.listHarnessSkills()]); directories.value = settings.directories.filter(value => value !== settings.sharedDirectory && value !== settings.miraDirectory).join('\n'); sharedDirectory.value = settings.sharedDirectory || ''; miraDirectory.value = settings.miraDirectory || ''; skills.value = items }) }
function save() { return perform(async () => { const host = api(); const settings = await host.saveHarnessSkillSettings({ directories: directories.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean) }); directories.value = settings.directories.join('\n'); skills.value = await host.listHarnessSkills(); directoriesOpen.value = false }) }
function toggle(id: string, enabled: boolean) { return perform(async () => { skills.value = await api().setHarnessSkillEnabled(id, enabled) }) }
function reveal(id: string) { return perform(async () => { await api().revealHarnessSkill(id, pluginDetail.value?.skill.name) }) }
function moreAction(command: string) { if (command === 'directories') directoriesOpen.value = true; else void perform(async () => { skills.value = await api().importHarnessSkill() }) }
async function remove(skill: HarnessSkill) {
  try { await ElMessageBox.confirm(`将“${skill.name}”移到回收站？共享目录中的技能也会从其他应用中消失；若为软链接，仅移除链接。`, '删除技能', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  await perform(async () => { skills.value = await api().deleteHarnessSkill(skill.id) })
}
function createSkill() { return perform(async () => { await api().savePreference('first-party.mira-harness.mira.plugin-market-intent', 'create-skill'); useAppNavigationStore().openExtensions(); await router.push(HARNESS_WORKBENCH_PATH) }) }
onMounted(() => { void load() })
</script>
<style scoped>
.skill-settings { min-width: 0; }
.skill-group + .skill-group { margin-top: 24px; }
.skill-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; min-height: 28px; }
h2 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 14px; font-weight: 500; line-height: 20px; }
small { font-size: 12px; font-weight: 400; color: var(--cp-text-secondary); }
.skill-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.skill-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 28px; padding: 0 8px; border: 1px solid var(--cp-border-light); border-radius: 8px; background: var(--cp-bg); color: var(--cp-text); cursor: pointer; font: inherit; font-size: 12px; }
.skill-button :deep(svg) { width: 14px; height: 14px; }
.skill-icon-button { width: 28px; padding: 0; }
.skill-primary { background: var(--cp-text); border-color: var(--cp-text); color: var(--cp-bg); }
.skill-button:hover { background: var(--cp-bg-hover); }
.skill-primary:hover { background: var(--cp-text); opacity: .85; }
button:disabled { opacity: .5; cursor: default; }
.skill-list { overflow: hidden; border-radius: 12px; background: color-mix(in srgb, var(--cp-text) 4%, var(--cp-bg)); }
.skill-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 16px; }
.skill-row + .skill-row { border-top: 1px solid color-mix(in srgb, var(--cp-border-light) 50%, transparent); }
.skill-row:hover { background: var(--cp-bg-hover); }
.skill-main { display: flex; flex-direction: column; align-items: stretch; min-width: 0; gap: 2px; background: none; border: 0; padding: 0; color: inherit; font: inherit; text-align: left; cursor: default; }
.skill-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; line-height: 20px; }
.skill-description { font-size: 12px; line-height: 18px; color: var(--cp-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.skill-avatar { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; background: var(--cp-bg); color: var(--cp-text-secondary); }
.skill-avatar img { width: 26px; height: 26px; object-fit: contain; }
.skill-avatar :deep(svg) { width: 16px; height: 16px; }
.skill-delete { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; padding: 0; color: var(--cp-text-secondary); background: none; }
.skill-delete :deep(svg) { width: 14px; height: 14px; }
.skill-delete:hover { color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 10%, transparent); }
.skill-actions :deep(.el-switch) { height: 24px; --el-switch-on-color: var(--cp-text); }
.skill-actions :deep(.el-switch__core) { min-width: 32px; height: 18px; }
.skill-actions :deep(.el-switch__action) { width: 14px; height: 14px; }
.skill-actions :deep(.el-switch.is-checked .el-switch__core .el-switch__action) { left: calc(100% - 15px); }
.skill-error { color: var(--cp-danger); margin-bottom: 16px; font-size: 13px; }
.skill-empty { padding: 32px 16px; text-align: center; border: 1px dashed var(--cp-border-light); border-radius: 12px; font-size: 13px; color: var(--cp-text-secondary); }
.skill-empty p { margin: 8px 0 16px; }
.skill-empty button + button { margin-left: 8px; }
.skill-detail { display: flex; flex-direction: column; gap: 16px; }
.skill-detail h3 { margin: 0; color: var(--skill-dialog-foreground); font-size: 14px; font-weight: 500; line-height: 1.625; }
.skill-detail p { margin: 4px 0 0; font-size: 14px; line-height: 1.625; color: var(--skill-dialog-subtle); }
.skill-detail p.skill-detail-description { margin-top: 6px; max-height: 160px; overflow: auto; white-space: pre-wrap; }
.skill-detail-fields { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; row-gap: 12px; }
.skill-path-field { grid-column: 1 / -1; min-width: 0; }
.skill-path { display: inline; margin-top: 4px; padding: 0; border: 0; background: none; text-align: left; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", "Microsoft YaHei UI", "PingFang SC", monospace; font-size: 14px; line-height: 1.625; color: var(--skill-dialog-subtle); overflow-wrap: anywhere; }
.skill-path :deep(svg) { display: inline; width: 12px; height: 12px; margin-left: 6px; }
.skill-path:hover { text-decoration: underline; color: var(--skill-dialog-foreground); }
.skill-directory-editor { display: grid; gap: 8px; font-size: 13px; }
.skill-directory-editor code { overflow-wrap: anywhere; color: var(--cp-text-secondary); }
.skill-directory-editor p { margin: 0 0 8px; color: var(--cp-text-secondary); }
.skill-directory-editor label { display: grid; gap: 8px; }
button:focus-visible { outline: 2px solid var(--cp-text); outline-offset: 3px; }
</style>
<style>
.el-dialog.mira-skill-dialog { padding: 0; border-radius: 16px; overflow: hidden; max-height: min(80vh, 640px); display: flex; flex-direction: column; }
.mira-skill-dialog .el-dialog__header { margin: 0; padding: 16px 48px 12px 16px; border-bottom: 1px solid var(--cp-border-light); }
.mira-skill-dialog .el-dialog__title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--cp-text); }
.mira-skill-dialog .el-dialog__headerbtn { top: 12px; right: 12px; width: 24px; height: 24px; }
.mira-skill-dialog .el-dialog__body { padding: 20px 16px; overflow: auto; min-height: 0; }
.el-overlay:has(.mira-skill-dialog) { backdrop-filter: blur(4px); }
/* Match ZCode DialogContent and SkillsSection without inheriting Element's body/close styles. */
.el-dialog.mira-skill-detail-dialog {
  --skill-dialog-foreground: #404040;
  --skill-dialog-subtle: color-mix(in oklab, #404040 60%, transparent);
  --skill-dialog-border: color-mix(in oklab, #0a0a0a 10%, transparent);
  border: 1px solid var(--skill-dialog-border);
  background: #fff;
  color: var(--skill-dialog-foreground);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.625;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1);
  -webkit-app-region: no-drag;
}
.mira-skill-detail-dialog .el-dialog__header { border-color: var(--skill-dialog-border); }
.mira-skill-detail-dialog .el-dialog__title { font-weight: 500; line-height: 26px; color: var(--skill-dialog-foreground); }
.mira-skill-detail-dialog .el-dialog__body { color: var(--skill-dialog-foreground); line-height: 1.625; }
.mira-skill-detail-dialog .el-dialog__headerbtn { top: 16px; right: 16px; border-radius: 6px; }
.mira-skill-detail-dialog .el-dialog__headerbtn .el-dialog__close { width: 12px; height: 12px; font-size: 12px; color: var(--skill-dialog-foreground); }
.mira-skill-detail-dialog .el-dialog__headerbtn:hover { background: color-mix(in oklab, #0a0a0a 5%, transparent); }
.mira-skill-detail-dialog .el-dialog__headerbtn:hover .el-dialog__close,
.mira-skill-detail-dialog .el-dialog__headerbtn:focus .el-dialog__close { color: var(--skill-dialog-foreground); }
.el-overlay:has(.mira-skill-detail-dialog) { background: rgb(0 0 0 / .6); backdrop-filter: blur(4px); }
[data-theme='dark'] .el-dialog.mira-skill-detail-dialog {
  --skill-dialog-foreground: #e5e5e5;
  --skill-dialog-subtle: color-mix(in oklab, #e5e5e5 60%, transparent);
  --skill-dialog-border: color-mix(in oklab, #fafafa 10%, transparent);
  background: var(--cp-bg-elevated);
}
</style>
