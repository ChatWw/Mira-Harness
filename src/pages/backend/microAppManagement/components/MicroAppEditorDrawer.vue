<template>
  <el-drawer
    :model-value="modelValue"
    :title="app ? '编辑应用' : '注册应用'"
    size="min(720px, 100%)"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <section class="form-section">
        <h3>基本信息</h3>
        <div class="form-grid">
          <el-form-item label="应用 ID" prop="idSuffix">
            <el-input v-model.trim="form.idSuffix" placeholder="例如 reports" :disabled="Boolean(app)">
              <template #prepend>micro-</template>
            </el-input>
            <div class="field-hint">应用编码：{{ appCode || '填写 ID 后自动生成' }}</div>
          </el-form-item>
          <el-form-item label="应用名称" prop="name">
            <el-input v-model.trim="form.name" maxlength="60" show-word-limit />
          </el-form-item>
          <el-form-item label="集成模式">
            <el-select v-model="form.integrationMode" class="field-control" @change="resetEntryForMode">
              <el-option label="微应用（Wujie）" value="wujie" />
              <el-option label="内嵌框架（Iframe）" value="iframe" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="form.integrationMode === 'wujie'" prop="directory">
            <template #label>
              <span class="label-with-help">入口目录<el-tooltip content="请选择直接包含 index.html 的本地构建产物目录。"><AppIcon name="QuestionFilled" /></el-tooltip></span>
            </template>
            <el-input v-model="form.directory" readonly placeholder="请选择本地构建目录">
              <template #append><el-button :disabled="selectingDirectory" @click="selectDirectory">选择文件夹</el-button></template>
            </el-input>
          </el-form-item>
          <el-form-item v-else label="入口地址" prop="url">
            <template #label>
              <span class="label-with-help">入口地址<el-tooltip content="请输入可被当前设备访问的 HTTP(S) 地址或应用内相对路径。"><AppIcon name="QuestionFilled" /></el-tooltip></span>
            </template>
            <el-input v-model.trim="form.url" placeholder="https://example.com" />
          </el-form-item>
          <el-form-item label="图标名称">
            <FormIconPicker v-model="form.icon" />
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" class="field-control" />
          </el-form-item>
        </div>
        <div class="switch-row">
          <div><strong>是否启用</strong><span>停用后不出现在应用切换器中，也不能通过平台访问。</span></div>
          <el-switch v-model="form.enabled" />
        </div>
        <el-form-item label="应用说明" class="description-field">
          <el-input v-model="form.description" type="textarea" :rows="3" maxlength="240" show-word-limit resize="vertical" />
        </el-form-item>
      </section>

      <section class="form-section">
        <el-collapse class="advanced-config">
          <el-collapse-item name="advanced">
            <template #title><span class="advanced-title">高级配置</span></template>
            <template v-if="form.integrationMode === 'wujie'">
              <div class="form-grid">
                <el-form-item label="路由同步">
                  <el-select v-model="form.routeMode" class="field-control">
                    <el-option label="由平台管理" value="platform" />
                    <el-option label="不同步" value="none" />
                  </el-select>
                </el-form-item>
              </div>
              <div class="runtime-switches">
                <label><span>保活实例</span><el-switch v-model="form.alive" /></label>
                <label><span>预加载</span><el-switch v-model="form.preload" /></label>
              </div>
              <div class="pair-editor">
                <div class="pair-editor__header">
                  <div><strong>资源路径前缀</strong><span>仅在子应用静态资源无法正确加载时配置。</span></div>
                  <el-button @click="prefixRows.push({ key: '', value: '' })">新增映射</el-button>
                </div>
                <div v-if="prefixRows.length" class="pair-list">
                  <div v-for="(row, index) in prefixRows" :key="index" class="pair-row">
                    <el-input v-model.trim="row.key" aria-label="原资源前缀" placeholder="原前缀" />
                    <AppIcon name="Right" />
                    <el-input v-model.trim="row.value" aria-label="目标资源前缀" placeholder="目标前缀" />
                    <el-button circle plain aria-label="删除前缀映射" @click="prefixRows.splice(index, 1)"><AppIcon name="Delete" /></el-button>
                  </div>
                </div>
                <el-empty v-else description="未配置资源路径前缀" :image-size="56" />
              </div>
            </template>
            <div v-else class="form-grid">
              <el-form-item label="Iframe 策略">
                <el-select v-model="form.iframeProfile" class="field-control">
                  <el-option label="严格" value="strict" />
                  <el-option label="兼容" value="compatible" />
                  <el-option label="外部窗口" value="external" />
                </el-select>
              </el-form-item>
              <el-form-item label="加载超时（秒）">
                <el-input-number v-model="form.timeout" :min="1" :max="5" controls-position="right" class="field-control" />
              </el-form-item>
              <el-form-item label="Referrer Policy">
                <el-select v-model="form.referrerPolicy" class="field-control">
                  <el-option v-for="policy in referrerPolicies" :key="policy" :label="policy" :value="policy" />
                </el-select>
              </el-form-item>
            </div>
          </el-collapse-item>
        </el-collapse>
      </section>

      <section class="form-section menu-section">
        <h3>子菜单</h3>
        <p v-if="!appCode" class="section-hint">请先填写应用 ID，再配置子菜单。</p>
        <MenuTreeEditor
          :menus="form.menus"
          title="微应用菜单"
          context="microapp"
          :app-code="appCode"
          :disabled="!appCode"
          @change="form.menus = $event"
        />
      </section>
    </el-form>

    <template #footer>
      <el-button :disabled="saving" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存应用</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { assertHttpUrl, validateMicroApps } from '@/config/platformValidation'
import { getPlatformApi } from '@/platform'
import type { IframeProfile, MenuItem, MicroApp, MicroAppIntegrationMode } from '@/types'
import { cloneValue } from '../../platformManagement'
import MenuTreeEditor from '../../menuManagement/components/MenuTreeEditor.vue'
import FormIconPicker from '@/components/IconPicker/FormIconPicker.vue'

interface PrefixRow { key: string; value: string }
interface MicroAppDraft {
  idSuffix: string
  name: string
  integrationMode: MicroAppIntegrationMode
  directory: string
  url: string
  icon: string
  sort: number
  enabled: boolean
  description: string
  alive: boolean
  routeMode: 'platform' | 'none'
  preload: boolean
  iframeProfile: IframeProfile
  referrerPolicy: ReferrerPolicy
  timeout: number
  menus: MenuItem[]
}

const props = defineProps<{
  modelValue: boolean
  app?: MicroApp
  apps: MicroApp[]
  saving?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [app: MicroApp]
}>()

const formRef = ref<FormInstance>()
const prefixRows = ref<PrefixRow[]>([])
const selectingDirectory = ref(false)
const referrerPolicies: ReferrerPolicy[] = [
  'no-referrer', 'origin', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url',
]

function emptyForm(): MicroAppDraft {
  return {
    idSuffix: '', name: '', integrationMode: 'wujie', directory: '', url: '', icon: '', sort: 0, enabled: true,
    description: '', alive: true, routeMode: 'platform', preload: false, iframeProfile: 'compatible',
    referrerPolicy: 'strict-origin-when-cross-origin', timeout: 5, menus: [],
  }
}

const form = reactive<MicroAppDraft>(emptyForm())
const appCode = computed(() => form.idSuffix.trim())
const rules: FormRules = {
  idSuffix: [
    { required: true, message: '请输入应用 ID 后缀', trigger: 'blur' },
    { pattern: /^[a-z0-9-]+$/, message: '只能包含小写字母、数字和连字符', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入应用名称', trigger: 'blur' }],
}

function initializeForm() {
  const next = emptyForm()
  const current = props.app
  if (current) {
    Object.assign(next, {
      idSuffix: current.code,
      name: current.name,
      integrationMode: current.integrationMode,
      directory: current.entry.type === 'local-directory' ? current.entry.directory : '',
      url: current.entry.type === 'url' ? current.entry.url : '',
      icon: current.icon || '',
      sort: current.sort,
      enabled: current.enabled,
      description: current.description || '',
      menus: cloneValue(current.menus || []),
    })
    if (current.runtimeConfig.kind === 'wujie') {
      next.alive = current.runtimeConfig.alive
      next.routeMode = current.runtimeConfig.routeMode
      next.preload = current.runtimeConfig.preload
    } else {
      next.iframeProfile = current.runtimeConfig.iframe.profile || 'compatible'
      next.referrerPolicy = current.runtimeConfig.iframe.referrerPolicy || 'strict-origin-when-cross-origin'
      next.timeout = Math.min(current.runtimeConfig.iframe.timeout || 5, 5)
    }
  }
  Object.assign(form, next)
  prefixRows.value = current?.runtimeConfig.kind === 'wujie'
    ? Object.entries(current.runtimeConfig.prefix).map(([key, value]) => ({ key, value }))
    : []
}

function resetEntryForMode() {
  form.directory = ''
  form.url = ''
  prefixRows.value = []
  form.alive = true
  form.routeMode = 'platform'
  form.preload = false
  form.iframeProfile = 'compatible'
  form.referrerPolicy = 'strict-origin-when-cross-origin'
  form.timeout = 5
}

async function selectDirectory() {
  const api = getPlatformApi()
  if (!api) {
    ElMessage.error('文件夹选择仅在桌面端中可用')
    return
  }
  selectingDirectory.value = true
  try {
    const directory = await api.selectMicroAppDirectory()
    if (directory) form.directory = directory
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '目录选择失败')
  } finally {
    selectingDirectory.value = false
  }
}

watch(() => props.modelValue, visible => { if (visible) initializeForm() })

watch(appCode, (code, previousCode) => {
  if (!previousCode || !code || previousCode === code) return
  const previousPrefix = `/micro/${previousCode}`
  const nextPrefix = `/micro/${code}`
  const retarget = (menus: MenuItem[]): MenuItem[] => menus.map(menu => ({
    ...menu,
    appCode: code,
    path: menu.path?.startsWith(previousPrefix) ? `${nextPrefix}${menu.path.slice(previousPrefix.length)}` : menu.path,
    children: menu.children ? retarget(menu.children) : undefined,
  }))
  form.menus = retarget(form.menus)
})

function buildApp(): MicroApp {
  const prefixEntries = prefixRows.value
    .filter(row => row.key.trim())
    .map(row => [row.key.trim(), row.value.trim()] as const)
  if (new Set(prefixEntries.map(([key]) => key)).size !== prefixEntries.length) throw new Error('资源路径前缀不能重复')
  const id = `micro-${appCode.value}`
  return {
    id,
    name: form.name.trim(),
    code: appCode.value,
    entry: form.integrationMode === 'wujie'
      ? { type: 'local-directory', directory: form.directory.trim() }
      : { type: 'url', url: form.url.trim() },
    icon: form.icon.trim() || undefined,
    sort: form.sort,
    enabled: form.enabled,
    integrationMode: form.integrationMode,
    description: form.description.trim() || undefined,
    menus: cloneValue(form.menus),
    runtimeConfig: form.integrationMode === 'wujie'
      ? { kind: 'wujie', alive: form.alive, routeMode: form.routeMode, prefix: Object.fromEntries(prefixEntries), preload: form.preload }
      : { kind: 'iframe', iframe: { profile: form.iframeProfile, referrerPolicy: form.referrerPolicy, timeout: form.timeout } },
  }
}

async function submit() {
  if (!formRef.value || !(await formRef.value.validate().catch(() => false))) return
  try {
    if (form.integrationMode === 'wujie' && !form.directory.trim()) throw new Error('请选择本地构建目录')
    if (form.integrationMode === 'iframe') assertHttpUrl(form.url.trim(), '内嵌框架入口地址')
    const nextApp = buildApp()
    const nextApps = props.app
      ? props.apps.map(item => item.id === props.app?.id ? nextApp : item)
      : [...props.apps, nextApp]
    validateMicroApps(nextApps)
    emit('submit', nextApp)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '应用配置无效')
  }
}
</script>

<style scoped lang="scss">
.form-section { padding-bottom: $spacing-lg; & + & { padding-top: $spacing-lg; border-top: 1px solid var(--cp-border); } h3 { margin: 0 0 $spacing-md; color: var(--cp-text); font-size: $font-base; font-weight: 600; } }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 $spacing-md; }
.field-control { width: 100%; }
.field-hint, .section-hint { margin-top: 4px; color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.4; }
.label-with-help { display: inline-flex; align-items: center; gap: 4px; .el-icon { color: var(--cp-text-secondary); cursor: help; } }
.switch-row { @include flex-between; gap: $spacing-lg; padding: $spacing-md 0 0; div { display: flex; flex-direction: column; gap: 2px; } strong { color: var(--cp-text); } span { color: var(--cp-text-secondary); font-size: $font-xs; } }
.description-field { margin-top: $spacing-lg; margin-bottom: 0; }
.advanced-config { border-top: 0; border-bottom: 0; :deep(.el-collapse-item__header) { height: auto; min-height: 34px; border-bottom: 0; color: var(--cp-text); font-weight: 600; } :deep(.el-collapse-item__wrap) { border-bottom: 0; } :deep(.el-collapse-item__content) { padding: $spacing-md 0 0; } }
.advanced-title { font-size: $font-base; }
.runtime-switches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: $spacing-sm; margin-bottom: $spacing-lg; label { @include flex-between; gap: $spacing-sm; padding: 10px 12px; border: 1px solid var(--cp-border); border-radius: $radius-md; } }
.pair-editor__header { @include flex-between; gap: $spacing-md; margin-bottom: $spacing-sm; > div { display: flex; flex-direction: column; gap: 2px; } span { color: var(--cp-text-secondary); font-size: $font-xs; } }
.pair-list { display: flex; flex-direction: column; gap: $spacing-sm; }
.pair-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: center; gap: $spacing-sm; }
@include media-max($breakpoint-sm) { .form-grid, .runtime-switches { grid-template-columns: 1fr; } .pair-row { grid-template-columns: 1fr auto; } .pair-row > .el-icon { display: none; } }
</style>
