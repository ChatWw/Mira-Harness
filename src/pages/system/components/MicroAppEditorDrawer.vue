<template>
  <el-drawer
    :model-value="modelValue"
    :title="app ? '编辑微应用' : '新增微应用'"
    size="min(720px, 100%)"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <section class="form-section">
        <h3>基本信息</h3>
        <div class="form-grid">
          <el-form-item label="应用 ID" prop="id">
            <el-input v-model.trim="form.id" placeholder="例如 micro-reports" :disabled="Boolean(app)" />
          </el-form-item>
          <el-form-item label="应用名称" prop="name">
            <el-input v-model.trim="form.name" maxlength="60" show-word-limit />
          </el-form-item>
          <el-form-item label="应用编码" prop="code">
            <el-input v-model.trim="form.code" placeholder="小写字母、数字和连字符" />
          </el-form-item>
          <el-form-item label="入口地址" prop="url">
            <el-input v-model.trim="form.url" placeholder="https://example.com 或 /apps/example/" />
          </el-form-item>
          <el-form-item label="图标名称">
            <el-input v-model.trim="form.icon" placeholder="Element Plus 图标名称" />
          </el-form-item>
          <el-form-item label="版本">
            <el-input v-model.trim="form.version" placeholder="例如 v1.0.0" />
          </el-form-item>
          <el-form-item label="集成模式">
            <el-select v-model="form.integrationMode" class="field-control">
              <el-option label="Wujie" value="wujie" />
              <el-option label="Iframe" value="iframe" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" class="field-control" />
          </el-form-item>
          <el-form-item label="发布状态">
            <el-select v-model="form.status" class="field-control">
              <el-option label="开发中" value="developing" />
              <el-option label="已发布" value="published" />
              <el-option label="已下线" value="offline" />
            </el-select>
          </el-form-item>
          <el-form-item label="健康状态">
            <el-select v-model="form.healthStatus" class="field-control">
              <el-option label="正常" value="healthy" />
              <el-option label="降级" value="degraded" />
              <el-option label="不可用" value="unavailable" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="应用说明">
          <el-input v-model="form.description" type="textarea" :rows="3" maxlength="240" show-word-limit resize="vertical" />
        </el-form-item>
        <div class="switch-row">
          <div><strong>允许平台嵌入</strong><span>关闭后不会出现在应用切换器中</span></div>
          <el-switch v-model="form.embedAllowed" />
        </div>
      </section>

      <section class="form-section">
        <h3>运行参数</h3>
        <div class="form-grid">
          <el-form-item label="路由同步">
            <el-select v-model="form.routeMode" class="field-control">
              <el-option label="由平台管理" value="platform" />
              <el-option label="不同步" value="none" />
            </el-select>
          </el-form-item>
          <el-form-item label="Iframe 策略">
            <el-select v-model="form.iframeProfile" class="field-control">
              <el-option label="严格" value="strict" />
              <el-option label="兼容" value="compatible" />
              <el-option label="外部窗口" value="external" />
            </el-select>
          </el-form-item>
          <el-form-item label="Referrer Policy">
            <el-select v-model="form.referrerPolicy" class="field-control">
              <el-option v-for="policy in referrerPolicies" :key="policy" :label="policy" :value="policy" />
            </el-select>
          </el-form-item>
          <el-form-item label="加载超时（秒）">
            <el-input-number v-model="form.timeout" :min="1" :max="300" controls-position="right" class="field-control" />
          </el-form-item>
          <el-form-item label="主题覆盖">
            <el-select v-model="form.theme" clearable placeholder="跟随平台" class="field-control">
              <el-option label="亮色" value="light" />
              <el-option label="暗色" value="dark" />
            </el-select>
          </el-form-item>
          <el-form-item label="语言覆盖">
            <el-input v-model.trim="form.language" placeholder="例如 zh-CN；留空则跟随平台" />
          </el-form-item>
          <el-form-item label="租户 ID">
            <el-input v-model.trim="form.tenantId" placeholder="留空则不覆盖" />
          </el-form-item>
        </div>
        <div class="runtime-switches">
          <label><span>保活实例</span><el-switch v-model="form.alive" /></label>
          <label><span>Fiber 模式</span><el-switch v-model="form.fiber" /></label>
          <label><span>预加载</span><el-switch v-model="form.preload" /></label>
          <label><span>执行脚本</span><el-switch v-model="form.exec" /></label>
        </div>

        <div class="pair-editor">
          <div class="pair-editor__header">
            <div><strong>资源路径前缀</strong><span>用于将子应用资源前缀映射到新地址</span></div>
            <el-button @click="prefixRows.push({ key: '', value: '' })">新增映射</el-button>
          </div>
          <div v-if="prefixRows.length" class="pair-list">
            <div v-for="(row, index) in prefixRows" :key="index" class="pair-row">
              <el-input v-model.trim="row.key" aria-label="原资源前缀" placeholder="原前缀" />
              <el-icon><Right /></el-icon>
              <el-input v-model.trim="row.value" aria-label="目标资源前缀" placeholder="目标前缀" />
              <el-button circle plain aria-label="删除前缀映射" @click="prefixRows.splice(index, 1)"><el-icon><Delete /></el-icon></el-button>
            </div>
          </div>
          <el-empty v-else description="未配置资源路径前缀" :image-size="56" />
        </div>
      </section>

      <section class="form-section menu-section">
        <h3>子菜单</h3>
        <p v-if="!form.code" class="section-hint">请先填写应用编码，再配置子菜单。</p>
        <MenuTreeEditor
          :menus="form.menus"
          title="微应用菜单"
          context="microapp"
          :app-code="form.code"
          :disabled="!form.code"
          @change="form.menus = $event"
        />
      </section>
    </el-form>

    <template #footer>
      <el-button :disabled="saving" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存微应用</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { assertHttpUrl, validateMicroApps } from '@/config/platformValidation'
import type {
  MenuItem,
  MicroApp,
  MicroAppHealthStatus,
  MicroAppIntegrationMode,
  MicroAppStatus,
  ThemeMode,
} from '@/types'
import { cloneValue } from '../management'
import MenuTreeEditor from './MenuTreeEditor.vue'

interface PrefixRow { key: string; value: string }
interface MicroAppDraft {
  id: string
  name: string
  code: string
  url: string
  icon: string
  sort: number
  status: MicroAppStatus
  integrationMode: MicroAppIntegrationMode
  healthStatus: MicroAppHealthStatus
  embedAllowed: boolean
  version: string
  description: string
  alive: boolean
  routeMode: 'platform' | 'none'
  fiber: boolean
  preload: boolean
  exec: boolean
  iframeProfile: 'strict' | 'compatible' | 'external'
  referrerPolicy: ReferrerPolicy
  timeout: number
  theme: ThemeMode | ''
  language: string
  tenantId: string
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
const referrerPolicies: ReferrerPolicy[] = [
  'no-referrer', 'origin', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url',
]

function emptyForm(): MicroAppDraft {
  return {
    id: '', name: '', code: '', url: '', icon: '', sort: 0, status: 'developing', integrationMode: 'wujie',
    healthStatus: 'healthy', embedAllowed: true, version: '', description: '', alive: true, routeMode: 'platform',
    fiber: false, preload: false, exec: false, iframeProfile: 'compatible',
    referrerPolicy: 'strict-origin-when-cross-origin', timeout: 15, theme: '', language: '', tenantId: '', menus: [],
  }
}

const form = reactive<MicroAppDraft>(emptyForm())
const rules: FormRules = {
  id: [{ required: true, message: '请输入应用 ID', trigger: 'blur' }],
  name: [{ required: true, message: '请输入应用名称', trigger: 'blur' }],
  code: [
    { required: true, message: '请输入应用编码', trigger: 'blur' },
    { pattern: /^[a-z0-9-]+$/, message: '只能包含小写字母、数字和连字符', trigger: 'blur' },
  ],
  url: [{ required: true, message: '请输入入口地址', trigger: 'blur' }],
}

function initializeForm() {
  const app = props.app
  const next = emptyForm()
  if (app) {
    Object.assign(next, {
      id: app.id,
      name: app.name,
      code: app.code,
      url: app.url,
      icon: app.icon || '',
      sort: app.sort,
      status: app.status,
      integrationMode: app.integrationMode,
      healthStatus: app.healthStatus,
      embedAllowed: app.embedAllowed,
      version: app.version || '',
      description: app.description || '',
      alive: app.runtimeConfig.alive,
      routeMode: app.runtimeConfig.routeMode,
      fiber: app.runtimeConfig.fiber,
      preload: app.runtimeConfig.preload,
      exec: app.runtimeConfig.exec,
      iframeProfile: app.runtimeConfig.iframe.profile || 'compatible',
      referrerPolicy: app.runtimeConfig.iframe.referrerPolicy || 'strict-origin-when-cross-origin',
      timeout: app.runtimeConfig.iframe.timeout || 15,
      theme: app.runtimeConfig.props.theme || '',
      language: app.runtimeConfig.props.language || '',
      tenantId: app.runtimeConfig.props.tenantId || '',
      menus: cloneValue(app.menus || []),
    })
  }
  Object.assign(form, next)
  prefixRows.value = Object.entries(app?.runtimeConfig.prefix || {}).map(([key, value]) => ({ key, value }))
}

watch(() => props.modelValue, visible => { if (visible) initializeForm() })

watch(() => form.code, (code, previousCode) => {
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
  const prefixEntries = prefixRows.value.filter(row => row.key.trim()).map(row => [row.key.trim(), row.value.trim()] as const)
  if (new Set(prefixEntries.map(([key]) => key)).size !== prefixEntries.length) throw new Error('资源路径前缀不能重复')
  const propsOverrides = {
    ...(form.theme ? { theme: form.theme } : {}),
    ...(form.language.trim() ? { language: form.language.trim() } : {}),
    ...(form.tenantId.trim() ? { tenantId: form.tenantId.trim() } : {}),
  }
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    code: form.code.trim(),
    url: form.url.trim(),
    icon: form.icon.trim() || undefined,
    sort: form.sort,
    status: form.status,
    integrationMode: form.integrationMode,
    healthStatus: form.healthStatus,
    embedAllowed: form.embedAllowed,
    version: form.version.trim() || undefined,
    description: form.description.trim() || undefined,
    menus: cloneValue(form.menus),
    runtimeConfig: {
      alive: form.alive,
      routeMode: form.routeMode,
      fiber: form.fiber,
      prefix: Object.fromEntries(prefixEntries),
      props: propsOverrides,
      preload: form.preload,
      exec: form.exec,
      iframe: { profile: form.iframeProfile, referrerPolicy: form.referrerPolicy, timeout: form.timeout },
    },
  }
}

async function submit() {
  if (!formRef.value || !(await formRef.value.validate().catch(() => false))) return
  try {
    assertHttpUrl(form.url.trim(), '微应用入口地址')
    const nextApp = buildApp()
    const nextApps = props.app
      ? props.apps.map(item => item.id === props.app?.id ? nextApp : item)
      : [...props.apps, nextApp]
    validateMicroApps(nextApps)
    emit('submit', nextApp)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '微应用配置无效')
  }
}
</script>

<style scoped lang="scss">
.form-section {
  padding-bottom: $spacing-lg;

  & + & { padding-top: $spacing-lg; border-top: 1px solid var(--cp-border); }
  h3 { margin: 0 0 $spacing-md; color: var(--cp-text); font-size: $font-base; font-weight: 600; }
}
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 $spacing-md; }
.field-control { width: 100%; }
.switch-row {
  @include flex-between;
  gap: $spacing-lg;
  padding: $spacing-md 0 0;

  div { display: flex; flex-direction: column; gap: 2px; }
  strong { color: var(--cp-text); }
  span { color: var(--cp-text-secondary); font-size: $font-xs; }
}
.runtime-switches {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: $spacing-sm;
  margin-bottom: $spacing-lg;

  label { @include flex-between; gap: $spacing-sm; padding: 10px 12px; border: 1px solid var(--cp-border); border-radius: $radius-md; }
}
.pair-editor { padding-top: $spacing-sm; }
.pair-editor__header {
  @include flex-between;
  gap: $spacing-md;
  margin-bottom: $spacing-sm;

  > div { display: flex; flex-direction: column; gap: 2px; }
  span { color: var(--cp-text-secondary); font-size: $font-xs; }
}
.pair-list { display: flex; flex-direction: column; gap: $spacing-sm; }
.pair-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: center; gap: $spacing-sm; }
.section-hint { margin: -$spacing-sm 0 $spacing-md; color: var(--cp-text-secondary); font-size: $font-xs; }

@include media-max($breakpoint-sm) {
  .form-grid, .runtime-switches { grid-template-columns: 1fr; }
  .pair-row { grid-template-columns: 1fr auto; }
  .pair-row > .el-icon { display: none; }
}
</style>
