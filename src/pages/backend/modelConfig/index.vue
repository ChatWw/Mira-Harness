<template>
  <SettingsPageShell title="模型服务" wide workspace :show-title="false">
    <div class="provider-page">
      <!-- ================= 左：服务商 / 实例 ================= -->
      <aside class="rail">
        <div class="rail__search">
          <AppIcon name="Search" />
          <input v-model="search" type="text" placeholder="搜索模型平台…" autocomplete="off">
        </div>

        <div class="rail__list" role="tree" aria-label="模型服务商">
          <div v-for="group in visibleGroups" :key="group.id" class="prov" role="treeitem" :aria-expanded="groupExpandable(group) ? expanded.includes(group.id) : undefined">
            <div
              class="row row--provider"
              :class="{ 'is-active': !groupExpandable(group) && isProviderActive(group) }"
              draggable="true"
              @click="onProviderClick(group)"
              @contextmenu="onProviderContext(group, $event)"
              @dragstart="onProviderDragStart(group, $event)"
              @dragover.prevent
              @drop="onProviderDrop(group, $event)"
            >
              <span class="row__grip" aria-hidden="true">
                <AppIcon name="material-symbols:drag-indicator" />
              </span>
              <span class="row__logo">
                <img v-if="group.logo" :src="group.logo" alt="">
                <span v-else class="row__letter">{{ group.name.slice(0, 1) }}</span>
              </span>
              <span class="row__name">{{ group.name }}</span>
              <span class="row__slot">
                <i v-if="!groupExpandable(group) && groupEnabled(group)" class="dot" />
                <button
                  v-if="groupExpandable(group)"
                  class="slot-btn slot-btn--chevron"
                  :class="{ 'is-open': expanded.includes(group.id) }"
                  type="button"
                  :aria-label="`${expanded.includes(group.id) ? '收起' : '展开'} ${group.name}`"
                  @click.stop="toggleExpand(group.id)"
                >
                  <AppIcon name="ArrowRight" />
                </button>
                <button
                  v-else
                  class="slot-btn"
                  type="button"
                  :aria-label="`${group.name} 操作`"
                  @click.stop="onProviderMenu(group, $event)"
                >
                  <AppIcon name="lucide:ellipsis-vertical" />
                </button>
              </span>
            </div>

            <template v-if="groupExpandable(group) && expanded.includes(group.id)">
              <div class="kids" role="group">
                <div
                  v-for="instance in group.instances"
                  :key="instance.id"
                  class="row row--instance"
                  role="treeitem"
                  :aria-selected="instance.id === selectedId"
                  :class="{ 'is-active': instance.id === selectedId }"
                  draggable="true"
                  @click="selectInstance(instance.id)"
                  @contextmenu="onInstanceContext(instance, $event)"
                  @dragstart="onInstanceDragStart(group.id, instance.id, $event)"
                  @dragover.prevent
                  @drop="onInstanceDrop(group.id, instance.id, $event)"
                >
                  <span class="row__grip" aria-hidden="true">
                    <AppIcon name="material-symbols:drag-indicator" />
                  </span>
                  <span class="row__logo row__logo--sm">
                    <img v-if="group.logo" :src="group.logo" alt="">
                    <span v-else class="row__letter">{{ instance.name.slice(0, 1) }}</span>
                  </span>
                  <span class="row__name">{{ instance.name }}</span>
                  <span class="row__slot">
                    <i v-if="instanceEnabled(instance)" class="dot" />
                    <button
                      v-if="!instance.builtin"
                      class="slot-btn"
                      type="button"
                      :aria-label="`${instance.name} 操作`"
                      @click.stop="openInstanceMenu(instance, $event)"
                    >
                      <AppIcon name="lucide:ellipsis-vertical" />
                    </button>
                  </span>
                </div>

                <button class="add-instance" type="button" draggable="false" @click="openAddInstance(group)">
                  <AppIcon name="Plus" />
                  <span>添加 {{ group.name }} 实例</span>
                </button>
              </div>
            </template>
          </div>

          <p v-if="!visibleGroups.length" class="rail__empty">没有匹配的服务商</p>
        </div>

        <div class="rail__foot">
          <button class="rail__add" type="button" @click="openAddProvider">
            <AppIcon name="Plus" />
            <span>添加服务商</span>
          </button>
        </div>
      </aside>

      <!-- ================= 右：配置面板 ================= -->
      <main v-loading="loading" class="panel">
        <div v-if="activeInstance" class="panel__inner">
          <header class="panel__head">
            <span class="panel__logo">
              <img v-if="activeGroup?.logo" :src="activeGroup.logo" alt="">
              <span v-else class="row__letter">{{ (activeGroup?.name || '?').slice(0, 1) }}</span>
            </span>
            <div class="panel__id">
              <div class="panel__name">
                <span>{{ activeGroup?.name }}</span>
                <span v-if="activeGroupHasMany" class="panel__ep">{{ activeInstance.name }}</span>
              </div>
              <div class="panel__sub">
                <span class="proto">{{ MODEL_PROTOCOLS[modelProtocol(form.protocol)].label }}</span>
                <span>{{ form.authMode === 'none' ? '本地服务 · 无需密钥' : 'API 密钥已保存于本机' }}</span>
                <span v-if="enabledModels.length">·</span>
                <span v-if="enabledModels.length">{{ enabledModels.length }} 个模型已启用</span>
              </div>
            </div>
            <div class="panel__actions">
              <span class="enable-label">{{ form.enabled ? '已启用' : '已停用' }}</span>
              <el-switch v-model="form.enabled" aria-label="启用服务商" />
            </div>
          </header>

          <div class="panel__body">
            <section class="section">
              <div class="section__head">
                <div>
                  <h3>连接</h3>
                </div>
                <span class="status" :class="statusClass"><i />{{ statusText }}</span>
              </div>

              <div v-if="form.authMode === 'api-key'" class="field">
                <span class="field__label">API 密钥</span>
                <div class="field__row">
                  <el-input v-model="apiKeyDraft" type="password" show-password autocomplete="off" placeholder="未设置" />
                  <el-button :loading="testing" @click="testConnection">
                    <AppIcon name="Connection" /><span>检测</span>
                  </el-button>
                </div>
              </div>
              <div v-else class="field">
                <span class="field__label">认证</span>
                <div class="no-auth">
                  <AppIcon name="Monitor" />
                  <span>无需密钥</span>
                </div>
              </div>

              <div class="field">
                <span class="field__label">请求协议</span>
                <el-select v-model="form.protocol" aria-label="请求协议" @change="saveActive()">
                  <el-option v-for="(protocol, key) in MODEL_PROTOCOLS" :key="key" :label="protocol.label" :value="key" />
                </el-select>
              </div>

              <div class="field">
                <span class="field__label">API 地址</span>
                <div class="field__row">
                  <el-input v-model="form.endpoint" :class="{ 'field__mono': true }" spellcheck="false" />
                  <el-button v-if="endpointDirty" @click="resetEndpoint">
                    <AppIcon name="Refresh" /><span>重置</span>
                  </el-button>
                </div>
                <div class="url-preview">
                  <AppIcon name="ArrowRight" /><span>实际请求</span><b>{{ effectiveUrl }}</b>
                </div>
              </div>

              <div v-if="testMessage" class="field">
                <span class="status" :class="testOk ? 'status--ok' : 'status--err'"><i />{{ testMessage }}</span>
              </div>
            </section>

            <section class="section">
              <div class="section__head">
                <div>
                  <h3>模型</h3>
                </div>
                <el-button-group role="group" aria-label="模型操作">
                  <el-button :loading="loadingModels" @click="syncModels">
                    <AppIcon v-if="!loadingModels" name="Refresh" /><span>同步模型</span>
                  </el-button>
                  <el-button aria-label="添加模型" title="添加模型" @click="openModelDialog()">
                    <AppIcon name="Plus" />
                  </el-button>
                </el-button-group>
              </div>

              <template v-if="form.models.length">
                <div class="mtoolbar">
                  <div class="msearch">
                    <AppIcon name="Search" />
                    <input v-model="modelSearch" type="text" placeholder="筛选已添加模型…">
                  </div>
                  <span class="mtoolbar__count">{{ enabledModels.length }} / {{ form.models.length }} 已启用</span>
                </div>

                <div class="model-list">
                  <div v-for="model in filteredModels" :key="model.id" class="mrow" :class="{ 'is-off': !model.enabled }">
                    <el-switch
                      :model-value="model.enabled"
                      :aria-label="`${model.enabled ? '停用' : '启用'} ${model.id}`"
                      @update:model-value="form.models.find(item => item.id === model.id)!.enabled = !model.enabled"
                    />
                    <div class="mrow__id">
                      <div class="mrow__name">
                        <span>{{ model.id }}</span>
                        <span v-if="model.reasoning" class="chip chip--reason">推理</span>
                        <span v-if="model.multimodal" class="chip chip--vision">图片</span>
                      </div>
                      <div class="mrow__model">{{ formatWindow(model.contextWindow) }} 上下文</div>
                    </div>
                    <div class="mrow__actions">
                      <el-button text circle aria-label="编辑模型" @click="openModelDialog(model)">
                        <AppIcon name="EditPen" />
                      </el-button>
                      <el-button text circle type="danger" aria-label="移除模型" @click="removeModel(model)">
                        <AppIcon name="Delete" />
                      </el-button>
                    </div>
                  </div>
                </div>
              </template>

              <div v-else class="empty">
                <span class="empty__icon"><AppIcon name="Cpu" /></span>
                <strong>还没有模型</strong>
                <div class="empty__actions">
                  <el-button :loading="loadingModels" @click="syncModels"><AppIcon v-if="!loadingModels" name="Refresh" /><span>同步模型</span></el-button>
                </div>
              </div>
            </section>
          </div>
        </div>

        <p v-else class="panel__placeholder">选择左侧的服务商</p>
      </main>
    </div>

    <el-dropdown ref="instanceMenu" :virtual-ref="instanceMenuAnchor" virtual-triggering trigger="contextmenu" @command="onInstanceCommand">
      <template #dropdown>
        <el-dropdown-menu>
          <template v-if="providerMenuGroup">
            <el-dropdown-item command="add"><AppIcon name="Plus" />添加实例</el-dropdown-item>
            <el-dropdown-item v-if="!isBuiltinProvider(providerMenuGroup)" class="model-menu__delete" command="delete"><AppIcon name="Delete" />删除</el-dropdown-item>
          </template>
          <template v-else-if="instanceMenuId">
            <el-dropdown-item command="edit"><AppIcon name="EditPen" />编辑</el-dropdown-item>
            <el-dropdown-item class="model-menu__delete" command="delete"><AppIcon name="Delete" />删除</el-dropdown-item>
          </template>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- ================= 模型：右侧抽屉 ================= -->
    <el-drawer v-model="modelDrawer" :title="modelForm.editing ? '编辑模型' : '添加模型'" size="440px">
      <div class="drawer-body">
        <div class="field">
          <span class="field__label">模型 ID <span class="req">*</span></span>
          <el-input v-model="modelForm.id" :class="{ 'field__mono': true }" :disabled="modelForm.editing" placeholder="例如 deepseek-v4-pro" />
        </div>
        <div class="field">
          <span class="field__label">显示名称</span>
          <el-input v-model="modelForm.name" placeholder="留空则使用模型 ID" />
        </div>
        <div class="field">
          <span class="field__label">上下文窗口</span>
          <el-input v-model.number="modelForm.contextWindow" :class="{ 'field__mono': true }" placeholder="例如 128000" />
        </div>
        <div class="field">
          <span class="field__label">最大输出 token</span>
          <el-input v-model.number="modelForm.maxTokens" :class="{ 'field__mono': true }" placeholder="留空则使用 8192" />
        </div>
        <div class="field">
          <span class="field__label">输入类型</span>
          <div class="checkrow">
            <label class="chk chk--locked"><input type="checkbox" checked @click.prevent><span>文本</span></label>
            <label class="chk"><input v-model="modelForm.multimodal" type="checkbox"><span>图片</span></label>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="drawer-foot">
          <el-button v-if="modelForm.editing" text type="danger" @click="confirmRemoveModel">移除模型</el-button>
          <span class="spacer" />
          <el-button @click="modelDrawer = false">取消</el-button>
          <el-button type="primary" @click="confirmModel">保存模型</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- ================= 发现模型 ================= -->
    <el-drawer v-model="discoverDrawer" title="发现模型" size="520px">
      <div class="drawer-body">
        <div v-if="discoverNeedsKey" class="needkey">
          <span class="needkey__icon"><AppIcon name="Connection" /></span>
          <strong>需要先配置 API 密钥</strong>
        </div>
        <template v-else>
          <div class="msearch msearch--wide">
            <AppIcon name="Search" />
            <input v-model="discoverSearch" type="text" placeholder="按模型 ID 搜索…">
          </div>
          <div class="disc-list">
            <label v-for="item in filteredRemote" :key="item" class="disc" :class="{ 'is-added': isAdded(item) }">
              <input v-model="discoverPicked" type="checkbox" :value="item" :disabled="isAdded(item)">
              <span class="disc__id">{{ item }}</span>
              <span v-if="isAdded(item)" class="chip chip--flat">已添加</span>
            </label>
            <p v-if="!filteredRemote.length" class="rail__empty">没有匹配的模型</p>
          </div>
        </template>
      </div>
      <template #footer>
        <div class="drawer-foot">
          <span class="muted">已选 {{ discoverPicked.length }} 项</span>
          <span class="spacer" />
          <el-button @click="discoverDrawer = false">取消</el-button>
          <el-button type="primary" :disabled="!discoverPicked.length" @click="addDiscovered">添加所选</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- ================= 添加服务商 / 实例 ================= -->
    <el-dialog
      v-model="providerDialog"
      :title="providerForm.mode === 'edit' ? '编辑实例' : providerForm.mode === 'instance' ? `添加 ${providerForm.parentName} 实例` : '添加服务商'"
      width="520px"
      align-center
    >
      <div class="drawer-body">
        <div v-if="providerForm.mode === 'new'" class="avatar-row">
          <span class="avatar" :style="providerForm.avatar ? undefined : { background: '#0ea5e9' }">
            <img v-if="providerForm.avatar" :src="providerForm.avatar" alt="">
            <span v-else>{{ (providerForm.name || '服').slice(0, 1) }}</span>
          </span>
          <div class="avatar-actions">
            <el-button size="small" @click="avatarInput?.click()">
              <AppIcon name="Picture" /><span>图片上传</span>
            </el-button>
            <el-button size="small" :disabled="!providerForm.avatar" @click="providerForm.avatar = ''">重置头像</el-button>
          </div>
          <input ref="avatarInput" type="file" accept="image/*" hidden @change="onAvatarPicked">
        </div>

        <div v-if="providerForm.mode === 'new'" class="field">
          <span class="field__label">Provider ID <span class="req">*</span></span>
          <el-input v-model="providerForm.slug" :class="{ 'field__mono': true }" placeholder="siliconflow" spellcheck="false" @input="validateSlug" />
          <p v-if="slugError" class="field__hint is-err">{{ slugError }}</p>
        </div>

        <div class="field">
          <span class="field__label">{{ providerForm.mode === 'new' ? '服务商名称' : '实例名称' }} <span class="req">*</span></span>
          <el-input v-model="providerForm.name" :aria-label="providerForm.mode === 'new' ? '服务商名称' : '实例名称'" placeholder="例如 硅基流动" />
        </div>

        <div class="field">
          <span class="field__label">请求协议</span>
          <el-select v-model="providerForm.protocol" aria-label="新服务商请求协议">
            <el-option v-for="(protocol, key) in MODEL_PROTOCOLS" :key="key" :label="protocol.label" :value="key" />
          </el-select>
        </div>
        <div class="field">
          <span class="field__label">API 地址 <span class="req">*</span></span>
          <el-input v-model="providerForm.endpoint" :class="{ 'field__mono': true }" placeholder="https://api.example.com/v1" />
          <div class="url-preview">
            <AppIcon name="ArrowRight" /><span>实际请求</span><b>{{ providerPreviewUrl }}</b>
          </div>
        </div>

        <div class="field">
          <span class="field__label">API 密钥</span>
          <el-input v-model="providerForm.apiKey" type="password" show-password placeholder="sk-…（本地服务可留空）" />
        </div>

        <div class="tw">
          <div class="tw__label">本地服务，无需密钥</div>
          <el-switch v-model="providerForm.noAuth" />
        </div>

        <div v-if="providerForm.mode === 'new'" class="adv">
          <button class="adv__toggle" type="button" @click="providerForm.moreOpen = !providerForm.moreOpen">
            <AppIcon name="ArrowRight" /><span>更多设置</span>
          </button>
          <div v-if="providerForm.moreOpen" class="adv__body">
            <span class="field__label">从预设中创建（可选）</span>
            <el-select v-model="providerForm.presetKey" placeholder="从 Provider 预设创建…" clearable @change="applyPreset">
              <el-option v-for="item in presetChoices" :key="item.key" :label="item.label" :value="item.key" />
            </el-select>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="providerDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!providerValid" @click="confirmProvider">
          {{ providerForm.mode === 'edit' ? '保存实例' : providerForm.mode === 'instance' ? '添加实例' : '添加' }}
        </el-button>
      </template>
    </el-dialog>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, watch } from 'vue'
import { ElMessage, ElMessageBox, type DropdownInstance } from 'element-plus'
import { MODEL_PROTOCOLS, modelProtocol, modelRequestUrl, type ModelProtocol } from '@/config/modelProtocol'
import { getPlatformApi, getPreference, savePreference } from '@/platform'
import {
  DEFAULT_CONTEXT_WINDOW,
  MODEL_PROVIDER_PRESETS,
  isModelProviderAvailable,
  type ModelProviderInput,
  type ModelProviderKey,
  type ModelProviderSummary,
  type ModelServiceSummary,
  type ProviderModelConfig,
} from '@/config/harness'
import glmIcon from '@/asset/modules_icon/glm.svg'
import kimiIcon from '@/asset/modules_icon/Kimi.svg'
import minimaxIcon from '@/asset/modules_icon/MiniMax.svg'
import deepseekIcon from '@/asset/modules_icon/deepseek.svg'
import ollamaIcon from '@/asset/modules_icon/Ollama.svg'
import qwenIcon from '@/asset/modules_icon/qwen.svg'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

/* =====================================================================
   服务商是固定一级节点；连接记录按共享的 Provider ID（slug）归到该服务商。
   尚未分出实例时，原始连接直接显示在服务商上。
   ===================================================================== */
type Instance = ModelProviderSummary
interface ProviderGroup {
  id: string
  name: string
  logo: string
  providerKey: ModelProviderKey | ''
  hasInstances: boolean
  endpoint: string
  authMode: 'api-key' | 'none'
  protocol: ModelProtocol
  instances: Instance[]
}

const PROVIDERS: { key: ModelProviderKey, name: string, logo: string, endpoint: string, authMode: 'api-key' | 'none' }[] = [
  { key: 'deepseek', name: '深度求索', logo: deepseekIcon, endpoint: 'https://api.deepseek.com', authMode: 'api-key' },
  { key: 'glm', name: '智谱', logo: glmIcon, endpoint: 'https://open.bigmodel.cn/api/paas/v4', authMode: 'api-key' },
  { key: 'kimi', name: 'Kimi', logo: kimiIcon, endpoint: 'https://api.moonshot.cn/v1', authMode: 'api-key' },
  { key: 'minimax', name: 'MiniMax', logo: minimaxIcon, endpoint: 'https://api.minimaxi.com/v1', authMode: 'api-key' },
  { key: 'qwen', name: '阿里千问', logo: qwenIcon, endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', authMode: 'api-key' },
  { key: 'ollama', name: 'Ollama', logo: ollamaIcon, endpoint: 'http://127.0.0.1:11434/v1', authMode: 'none' },
]
const BUILTIN_BY_KEY = new Map(PROVIDERS.map(item => [item.key, item]))
const EXPANDED_KEY = 'modelProviderExpanded'
const ORDER_KEY = 'modelProviderOrder'

const api = getPlatformApi()
const records = ref<ModelProviderSummary[]>([])
const services = ref<ModelServiceSummary[]>([])
const loading = ref(false)
const loadingModels = ref(false)
const testing = ref(false)
const testMessage = ref('')
const testOk = ref(false)
const search = ref('')
const modelSearch = ref('')
const selectedId = ref('')
const apiKeyDraft = ref('')
const defaultEndpoint = ref('')
const avatarInput = ref<HTMLInputElement>()

const expanded = ref<string[]>(getPreference<string[]>(EXPANDED_KEY, []))
const order = ref<string[]>(getPreference<string[]>(ORDER_KEY, []))

const blankForm = (): ModelProviderInput => ({
  providerKey: 'deepseek', protocol: 'openai-completions', name: '', endpoint: '', authMode: 'api-key', apiKey: '', models: [], enabled: false,
})
const form = reactive<ModelProviderInput>(blankForm())

let draggedProvider: string | null = null
let draggedInstance: { groupId: string, instanceId: string } | null = null
let saveTimer: number | undefined

/* ---------- 分组 ---------- */
const groups = computed<ProviderGroup[]>(() => {
  const definitions = new Map<string, Omit<ProviderGroup, 'instances'>>(PROVIDERS.map(preset => [preset.key, {
    ...preset, id: preset.key, providerKey: preset.key, hasInstances: false, protocol: 'openai-completions',
  }]))
  for (const service of services.value) {
    const preset = BUILTIN_BY_KEY.get(service.id as ModelProviderKey)
    definitions.set(service.id, { ...service, name: preset?.name || service.name, logo: preset?.logo || service.logo || '' })
  }
  const result: ProviderGroup[] = [...definitions.values()].map(service => ({
    ...service,
    instances: records.value.filter(record => (record.slug || (record.providerKey === 'custom' ? record.id.replace(/[^A-Za-z0-9]/g, '') : record.providerKey)) === service.id),
  }))
  for (const group of result) {
    group.instances = group.instances.map(instance => instance.builtin ? { ...instance, name: group.name } : instance)
    const ids = getPreference<string[]>(`modelInstanceOrder:${group.id}`, [])
    const rank = new Map(ids.map((id, index) => [id, index]))
    group.instances.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999)
      || Number(a.builtin === true) - Number(b.builtin === true) || b.createdAt - a.createdAt)
  }
  if (order.value.length) {
    const rank = new Map(order.value.map((id, index) => [id, index]))
    result.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
  }
  return result
})

const visibleGroups = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  if (!keyword) return groups.value
  return groups.value.filter(group =>
    group.name.toLocaleLowerCase().includes(keyword)
    || group.instances.some(instance => instance.name.toLocaleLowerCase().includes(keyword) || instance.endpoint.toLocaleLowerCase().includes(keyword)))
})

const activeGroup = computed(() => groups.value.find(group => group.instances.some(instance => instance.id === selectedId.value)))
const activeInstance = computed(() => activeGroup.value?.instances.find(instance => instance.id === selectedId.value))
const activeGroupHasMany = computed(() => Boolean(activeGroup.value && groupExpandable(activeGroup.value)))

/** 只有手动新增的实例需要展示子集；仅剩默认实例时，由一级服务商承载原始连接。 */
const groupExpandable = (group: ProviderGroup) => group.hasInstances && group.instances.some(instance => !instance.builtin)
const isBuiltinProvider = (group: ProviderGroup) => BUILTIN_BY_KEY.has(group.id as ModelProviderKey)
const groupEnabled = (group: ProviderGroup) => group.instances.some(instanceEnabled)
const instanceEnabled = (instance: Instance) => instance.enabled && instance.models.some(model => model.enabled)
const isProviderActive = (group: ProviderGroup) => group.instances.some(instance => instance.id === selectedId.value)

/* ---------- 面板 ---------- */
const enabledModels = computed(() => form.models.filter(model => model.enabled))
const endpointDirty = computed(() => Boolean(defaultEndpoint.value) && form.endpoint.replace(/\/+$/, '') !== defaultEndpoint.value)
const effectiveUrl = computed(() => modelRequestUrl(form.endpoint, form.protocol))
const statusText = computed(() => {
  if (testing.value) return '检测中…'
  if (testOk.value) return '连接正常'
  return form.enabled ? '未检测' : '已停用'
})
const statusClass = computed(() => (testOk.value ? 'status--ok' : form.enabled ? '' : 'status--warn'))
const filteredModels = computed(() => {
  const keyword = modelSearch.value.trim().toLocaleLowerCase()
  return form.models.filter(model => !keyword || model.id.toLocaleLowerCase().includes(keyword))
})

function formatWindow(tokens: number) {
  if (!tokens) return '未设置'
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

/* ---------- 加载 ---------- */
async function load(preferId?: string) {
  if (!api) return
  loading.value = true
  try {
    const [loadedRecords, loadedServices] = await Promise.all([api.listModelProviders(), api.listModelServices()])
    records.value = loadedRecords
    services.value = loadedServices
    const next = records.value.find(item => item.id === (preferId || selectedId.value))?.id
      || records.value.find(item => isModelProviderAvailable(item))?.id
      || records.value[0]?.id
      || ''
    if (next) await selectInstance(next)
    else { selectedId.value = ''; Object.assign(form, blankForm()) }
  } finally { loading.value = false }
}

async function selectInstance(id: string) {
  const record = records.value.find(item => item.id === id)
  if (!record) return
  selectedId.value = id
  modelSearch.value = ''
  testMessage.value = ''
  testOk.value = false
  const preset = BUILTIN_BY_KEY.get(record.providerKey)
  defaultEndpoint.value = preset && record.builtin
    ? preset.endpoint.replace(/\/+$/, '')
    : ''
  Object.assign(form, {
    id: record.id,
    providerKey: record.providerKey,
    name: record.name,
    endpoint: record.endpoint,
    authMode: record.authMode,
    protocol: modelProtocol(record.protocol),
    apiKey: '',
    enabled: record.enabled,
    models: record.models.map(model => ({ ...model })),
  })
  apiKeyDraft.value = record.hasApiKey && record.authMode === 'api-key'
    ? await api?.getModelProviderApiKey(record.id) || ''
    : ''
}

/* ---------- 保存 ---------- */
function plainInput(): ModelProviderInput {
  return {
    ...(form.id ? { id: form.id } : {}),
    providerKey: form.providerKey,
    slug: activeInstance.value?.slug,
    name: form.name,
    endpoint: form.endpoint.trim(),
    authMode: form.authMode,
    protocol: form.protocol,
    ...(apiKeyDraft.value.trim() ? { apiKey: apiKeyDraft.value.trim() } : {}),
    enabled: form.enabled,
    // IPC 走结构化克隆，模型及嵌套价格都必须剥掉 Vue 的响应式代理。
    models: form.models.map(model => ({
      ...toRaw(model),
      ...(model.pricing ? { pricing: { ...toRaw(model.pricing) } } : {}),
    })),
  }
}

function saveActive() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    if (!api || !form.id) return
    try {
      const saved = await api.saveModelProvider(plainInput())
      const index = records.value.findIndex(item => item.id === saved.id)
      if (index >= 0) records.value.splice(index, 1, saved)
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '保存失败')
    }
  }, 260)
}

async function resetEndpoint() {
  if (!defaultEndpoint.value) return
  form.endpoint = defaultEndpoint.value
  saveActive()
}

/* ---------- 树 ---------- */
function toggleExpand(id: string) {
  if (expanded.value.includes(id)) {
    expanded.value = expanded.value.filter(item => item !== id)
  } else {
    expanded.value = [...expanded.value, id]
  }
  savePreference(EXPANDED_KEY, expanded.value)
}

async function onProviderClick(group: ProviderGroup) {
  if (groupExpandable(group)) { toggleExpand(group.id); return }
  if (!group.instances.length) {
    if (!api || loading.value) return
    loading.value = true
    try {
      const saved = await api.saveModelProvider({
        providerKey: group.providerKey as ModelProviderKey, slug: group.id, builtin: true, name: group.name, endpoint: group.endpoint,
        authMode: group.authMode, protocol: group.protocol, models: [], enabled: false,
      })
      records.value.push(saved)
      services.value = await api.listModelServices()
      await selectInstance(saved.id)
    } catch (error) { ElMessage.error(error instanceof Error ? error.message : '打开服务商失败') }
    finally { loading.value = false }
    return
  }
  if (group.instances.length === 1) { void selectInstance(group.instances[0].id); return }
}

function onProviderContext(group: ProviderGroup, event: MouseEvent) {
  event.preventDefault()
  void onProviderMenu(group, event)
}

async function onProviderMenu(group: ProviderGroup, event: MouseEvent) {
  providerMenuGroup.value = group
  instanceMenuId.value = ''
  instanceMenuAnchor.value = event.currentTarget as HTMLElement
  await nextTick()
  instanceMenu.value?.handleOpen()
}

function onInstanceContext(instance: Instance, event: MouseEvent) {
  event.preventDefault()
  void openInstanceMenu(instance, event)
}

const instanceMenu = ref<DropdownInstance>()
const instanceMenuAnchor = shallowRef<HTMLElement>()
const instanceMenuId = ref('')
const providerMenuGroup = ref<ProviderGroup>()

async function openInstanceMenu(instance: Instance, event: MouseEvent) {
  providerMenuGroup.value = undefined
  if (instance.builtin) {
    instanceMenuId.value = ''
    instanceMenu.value?.handleClose()
    return
  }
  instanceMenuId.value = instance.id
  instanceMenuAnchor.value = event.currentTarget as HTMLElement
  await nextTick()
  instanceMenu.value?.handleOpen()
}

function onInstanceCommand(command: string) {
  if (providerMenuGroup.value) {
    if (command === 'add') openAddInstance(providerMenuGroup.value)
    else if (command === 'delete') void deleteProvider(providerMenuGroup.value)
    return
  }
  const instance = records.value.find(record => record.id === instanceMenuId.value)
  if (!instance || instance.builtin || providerMenuGroup.value) return
  if (command === 'edit') {
    resetProviderForm()
    Object.assign(providerForm, {
      mode: 'edit', editingId: instance.id, name: instance.name, endpoint: instance.endpoint,
      parentSlug: instance.slug || instance.providerKey,
      protocol: modelProtocol(instance.protocol), noAuth: instance.authMode === 'none',
    })
    providerDialog.value = true
  } else if (command === 'delete') void deleteInstance(instance)
}

async function deleteInstance(instance: ModelProviderSummary) {
  try {
    await ElMessageBox.confirm(`删除实例「${instance.name}」？该操作不可撤销。`, instance.name, {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch { return }
  if (!api) return
  await api.deleteModelProvider(instance.id)
  await load()
}

async function deleteProvider(group: ProviderGroup) {
  if (!api || isBuiltinProvider(group)) return
  try {
    await ElMessageBox.confirm(`删除服务商「${group.name}」及其全部实例？该操作不可撤销。`, '删除服务商', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch { return }
  try {
    if (activeGroup.value?.id === group.id) window.clearTimeout(saveTimer)
    await api.deleteModelService(group.id)
    providerMenuGroup.value = undefined
    await load()
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '删除服务商失败') }
}

/* ---------- 拖拽 ---------- */
function onProviderDragStart(group: ProviderGroup, event: DragEvent) {
  draggedProvider = group.id
  event.dataTransfer?.setData('text/plain', group.id)
}
function onProviderDrop(target: ProviderGroup, event: DragEvent) {
  event.preventDefault()
  if (!draggedProvider || draggedProvider === target.id) return
  const ids = groups.value.map(group => group.id)
  const from = ids.indexOf(draggedProvider)
  const to = ids.indexOf(target.id)
  if (from < 0 || to < 0) return
  ids.splice(to, 0, ...ids.splice(from, 1))
  order.value = ids
  savePreference(ORDER_KEY, ids)
  draggedProvider = null
}
function onInstanceDragStart(groupId: string, instanceId: string, event: DragEvent) {
  draggedInstance = { groupId, instanceId }
  event.stopPropagation()
}
function onInstanceDrop(groupId: string, instanceId: string, event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (!draggedInstance || draggedInstance.groupId !== groupId || draggedInstance.instanceId === instanceId) return
  const group = groups.value.find(item => item.id === groupId)
  if (!group) return
  const ids = group.instances.map(item => item.id)
  const from = ids.indexOf(draggedInstance.instanceId)
  const to = ids.indexOf(instanceId)
  if (from < 0 || to < 0) return
  ids.splice(to, 0, ...ids.splice(from, 1))
  // 实例顺序保存在本地偏好中，与服务商顺序同机制。
  const source = records.value.filter(record => ids.includes(record.id))
  const sorted = ids.map(id => source.find(record => record.id === id)!)
  let index = 0
  records.value = records.value.map(record => ids.includes(record.id) ? sorted[index++]! : record)
  savePreference(`modelInstanceOrder:${groupId}`, ids)
  draggedInstance = null
}

/* ---------- 模型 ---------- */
const modelDrawer = ref(false)
const modelForm = reactive({
  editing: false, originalId: '', id: '', name: '',
  contextWindow: undefined as number | undefined,
  maxTokens: undefined as number | undefined,
  multimodal: false,
})

function openModelDialog(model?: ProviderModelConfig) {
  modelForm.editing = Boolean(model)
  modelForm.originalId = model?.id || ''
  modelForm.id = model?.id || ''
  modelForm.name = model?.id || ''
  modelForm.contextWindow = model?.contextWindow || DEFAULT_CONTEXT_WINDOW
  modelForm.maxTokens = model?.maxTokens
  modelForm.multimodal = model?.multimodal === true
  modelDrawer.value = true
}

function confirmModel() {
  const id = modelForm.id.trim()
  if (!id) return ElMessage.warning('请填写模型 ID')
  if (!modelForm.editing && form.models.some(model => model.id === id)) return ElMessage.warning('该模型已存在')
  const next: ProviderModelConfig = {
    id,
    enabled: true,
    reasoning: false,
    contextWindow: modelForm.contextWindow || DEFAULT_CONTEXT_WINDOW,
    ...(modelForm.maxTokens && modelForm.maxTokens > 0 ? { maxTokens: modelForm.maxTokens } : {}),
    ...(modelForm.multimodal ? { multimodal: true } : {}),
  }
  const index = form.models.findIndex(model => model.id === modelForm.originalId)
  if (modelForm.editing && index >= 0) form.models.splice(index, 1, { ...next, enabled: form.models[index].enabled })
  else form.models.push(next)
  modelDrawer.value = false
  saveActive()
}

async function confirmRemoveModel() {
  try {
    await ElMessageBox.confirm(`移除模型「${modelForm.id}」？`, '移除模型', { type: 'warning' })
  } catch { return }
  form.models = form.models.filter(model => model.id !== modelForm.originalId)
  modelDrawer.value = false
  saveActive()
}

function removeModel(model: ProviderModelConfig) {
  form.models = form.models.filter(item => item.id !== model.id)
  saveActive()
}

/* ---------- 发现模型 ---------- */
const discoverDrawer = ref(false)
const discoverSearch = ref('')
const remoteModels = ref<string[]>([])
const discoverPicked = ref<string[]>([])
const discoverNeedsKey = computed(() => form.authMode === 'api-key' && !apiKeyDraft.value && !activeInstance.value?.hasApiKey)
const filteredRemote = computed(() => {
  const keyword = discoverSearch.value.trim().toLocaleLowerCase()
  return remoteModels.value.filter(id => !keyword || id.toLocaleLowerCase().includes(keyword))
})
const isAdded = (id: string) => form.models.some(model => model.id === id)

async function syncModels() {
  if (!api) return
  if (!form.endpoint.trim()) return ElMessage.warning('请先填写 API 地址')
  loadingModels.value = true
  try {
    const result = await api.listModelProviderModels(plainInput())
    remoteModels.value = result.models || []
    discoverSearch.value = ''
    discoverPicked.value = []
    discoverDrawer.value = true
    if (result.error && !remoteModels.value.length) ElMessage.warning(result.error)
  } finally { loadingModels.value = false }
}

function addDiscovered() {
  for (const id of discoverPicked.value) {
    if (isAdded(id)) continue
    form.models.push({ id, enabled: true, reasoning: false, contextWindow: DEFAULT_CONTEXT_WINDOW })
  }
  discoverDrawer.value = false
  saveActive()
}

/* ---------- 连接检测 ---------- */
async function testConnection() {
  if (!api) return
  const model = enabledModels.value[0] || form.models[0]
  if (!model) return ElMessage.warning('请先添加模型')
  testing.value = true
  testMessage.value = ''
  testOk.value = false
  try {
    const result = await api.testModelProvider({ ...plainInput(), apiKey: apiKeyDraft.value.trim() || undefined }, model.id)
    testOk.value = result.ok
    testMessage.value = result.text
  } catch (error) {
    testOk.value = false
    testMessage.value = error instanceof Error ? error.message : '连接失败'
  } finally { testing.value = false }
}

/* ---------- 添加服务商 / 实例 ---------- */
const providerDialog = ref(false)
const presetChoices = MODEL_PROVIDER_PRESETS
  .filter(item => item.key !== 'custom')
  .map(item => ({ key: item.key, label: BUILTIN_BY_KEY.get(item.key)?.name || item.name }))
const providerForm = reactive({
  mode: 'new' as 'new' | 'instance' | 'edit',
  editingId: '',
  parentName: '',
  parentKey: '' as ModelProviderKey | '',
  parentSlug: '',
  protocol: 'openai-completions' as ModelProtocol,
  slug: '', name: '', endpoint: '', apiKey: '', noAuth: false,
  avatar: '', moreOpen: false, presetKey: '' as ModelProviderKey | '',
})
const slugError = ref('')
const providerValid = computed(() => {
  if (!providerForm.name.trim() || !providerForm.endpoint.trim()) return false
  if (providerForm.mode === 'new') return /^[A-Za-z0-9]+$/.test(providerForm.slug) && !slugError.value
  return true
})
const providerPreviewUrl = computed(() => {
  const url = providerForm.endpoint.trim().replace(/\/+$/, '')
  return url ? modelRequestUrl(url, providerForm.protocol) : '—'
})

function resetProviderForm() {
  Object.assign(providerForm, {
    mode: 'new', editingId: '', parentName: '', parentKey: '', parentSlug: '', slug: '', name: '', endpoint: '',
    apiKey: '', noAuth: false, protocol: 'openai-completions', avatar: '', moreOpen: false, presetKey: '',
  })
  slugError.value = ''
}

function openAddProvider() {
  resetProviderForm()
  providerDialog.value = true
}

function openAddInstance(group: ProviderGroup) {
  resetProviderForm()
  providerForm.mode = 'instance'
  providerForm.parentName = group.name
  providerForm.parentKey = (group.providerKey || '') as ModelProviderKey
  providerForm.parentSlug = group.id
  providerForm.name = group.name
  providerForm.endpoint = group.endpoint
  providerForm.protocol = group.protocol
  providerForm.noAuth = group.authMode === 'none'
  providerDialog.value = true
}

function validateSlug(value: string) {
  providerForm.slug = value.replace(/[^A-Za-z0-9]/g, '')
  const taken = groups.value.some(group => group.id.toLocaleLowerCase() === providerForm.slug.toLocaleLowerCase())
  slugError.value = taken && providerForm.slug ? `「${providerForm.slug}」已被占用，请换一个。` : ''
}

function applyPreset(key: ModelProviderKey | '') {
  if (!key) return
  const preset = BUILTIN_BY_KEY.get(key)
  if (!preset) return
  providerForm.name = preset.name
  providerForm.endpoint = preset.endpoint
  providerForm.noAuth = preset.authMode === 'none'
}

function onAvatarPicked(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { providerForm.avatar = String(reader.result || '') }
  reader.readAsDataURL(file)
}

async function confirmProvider() {
  if (!api || !providerValid.value) return
  try {
    const editing = records.value.find(record => record.id === providerForm.editingId)
    if (providerForm.mode === 'edit' && (!editing || editing.builtin)) return
    const saved = await api.saveModelProvider({
      ...(editing ? { id: editing.id } : {}),
      builtin: editing?.builtin ?? providerForm.mode === 'new',
      providerKey: editing?.providerKey || (providerForm.mode === 'instance' ? providerForm.parentKey : 'custom') as ModelProviderKey,
      slug: editing?.slug || (providerForm.mode === 'instance' ? providerForm.parentSlug : providerForm.slug),
      ...(providerForm.mode === 'new' ? { serviceName: providerForm.name.trim(), serviceLogo: providerForm.avatar } : {}),
      ...(providerForm.mode === 'instance' ? { asInstance: true, serviceName: providerForm.parentName } : {}),
      name: providerForm.name.trim(),
      endpoint: providerForm.endpoint.trim(),
      protocol: providerForm.protocol,
      authMode: providerForm.noAuth ? 'none' : 'api-key',
      ...(providerForm.apiKey.trim() ? { apiKey: providerForm.apiKey.trim() } : {}),
      models: editing ? JSON.parse(JSON.stringify(editing.models)) : [],
      enabled: editing?.enabled ?? false,
    })
    providerDialog.value = false
    const groupId = saved.slug || saved.providerKey
    if (!editing) {
      const ids = groups.value.find(group => group.id === groupId)?.instances.map(instance => instance.id) || []
      savePreference(`modelInstanceOrder:${groupId}`, [saved.id, ...ids])
    }
    if (groupId && !expanded.value.includes(groupId)) {
      expanded.value = [...expanded.value, groupId]
      savePreference(EXPANDED_KEY, expanded.value)
    }
    await load(saved.id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '添加失败')
  }
}

/* ---------- 生命周期 ---------- */
watch(() => form.enabled, () => { if (form.id) saveActive() })
watch(() => form.endpoint, () => { if (form.id) saveActive() })
onBeforeUnmount(() => window.clearTimeout(saveTimer))
onMounted(() => { void load() })
</script>

<style scoped lang="scss">
:global(body:has(.settings-page) .el-dropdown-menu__item.model-menu__delete) {
  color: var(--cp-danger);
}
:global(body:has(.settings-page) .el-dropdown-menu__item.model-menu__delete:is(:hover, :focus, .is-hovering):not(.is-disabled)) {
  color: var(--cp-danger);
  background: var(--el-color-danger-light-9);
}

.provider-page {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--cp-bg);
}

/* ===================== 左栏 ===================== */
.rail { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--cp-border-light); background: var(--cp-bg); }
.rail__search {
  position: relative;
  padding: 12px 12px 8px;
  :deep(.app-icon) { position: absolute; left: 22px; top: 50%; transform: translateY(-50%); color: var(--cp-text-tertiary); pointer-events: none; }
  input {
    width: 100%; height: 34px; padding: 0 12px 0 30px;
    color: var(--cp-text); background: var(--cp-bg);
    border: 1px solid var(--cp-border-light); border-radius: 10px;
    font: inherit; font-size: var(--settings-text-base);
    &::placeholder { color: var(--cp-text-tertiary); }
    &:focus { outline: none; border-color: var(--cp-primary); }
  }
}
.rail__list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 2px 8px 8px; }
.rail__empty { padding: 28px 12px; color: var(--cp-text-tertiary); font-size: var(--settings-text-small); text-align: center; }
.rail__foot { padding: 8px 12px 12px; }
.rail__add {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; height: 34px;
  color: var(--cp-text-secondary); background: var(--cp-bg);
  border: 1px solid var(--cp-border-light); border-radius: 8px;
  font: inherit; font-size: var(--settings-text-base); cursor: pointer;
  &:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
}

.prov { margin-bottom: 2px; }
.kids { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
.row {
  position: relative;
  display: flex; align-items: center; gap: 8px;
  height: 44px; padding: 0 8px 0 4px;
  border-radius: 8px; cursor: pointer; user-select: none;
  &:hover { background: var(--cp-bg-hover); }
  &.is-active { background: var(--cp-bg-hover); }
  &.is-active::before {
    content: ''; position: absolute; left: 0; top: 9px; bottom: 9px;
    width: 2px; border-radius: 2px; background: var(--cp-primary);
  }
}
.row--instance { padding-left: 8px; margin-left: 18px; }
.row__grip {
  width: 12px; flex: 0 0 12px; display: grid; place-items: center;
  color: var(--cp-text-tertiary); opacity: 0; transition: opacity 120ms ease-out;
  :deep(.app-icon) { font-size: 12px; }
}
.row:hover .row__grip { opacity: 1; }
.row__logo {
  width: 26px; height: 26px; flex: 0 0 26px;
  display: grid; place-items: center;
  background: var(--cp-bg); border: 1px solid var(--cp-border-light); border-radius: 7px;
  overflow: hidden;
  img { width: 17px; height: 17px; object-fit: contain; }
}
.row__logo--sm { width: 22px; height: 22px; flex: 0 0 22px; border-radius: 6px; img { width: 14px; height: 14px; } }
.row__letter { color: var(--cp-text-secondary); font-size: 11px; font-weight: 600; }
.row__name {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--cp-text); font-size: var(--settings-text-base); line-height: 1.3;
}
.row__slot { position: relative; flex: 0 0 20px; width: 20px; height: 20px; display: grid; place-items: center; }
.dot {
  position: absolute; top: 50%; left: 50%;
  width: 6px; height: 6px; margin: -3px 0 0 -3px;
  border-radius: 50%; background: var(--cp-success); transition: opacity 120ms ease-out;
}
.slot-btn {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 20px; height: 20px; display: grid; place-items: center;
  color: var(--cp-text-tertiary); background: transparent; border: 0; border-radius: 4px;
  cursor: pointer; opacity: 0; transition: opacity 120ms ease-out;
  :deep(.app-icon) { font-size: 13px; }
  &:hover { color: var(--cp-text); }
}
.slot-btn--chevron { transition: opacity 120ms ease-out, transform 150ms cubic-bezier(.16, 1, .3, 1); }
.slot-btn--chevron.is-open { transform: translate(-50%, -50%) rotate(90deg); }
/* 可展开行常驻箭头；更多按钮在悬停或键盘聚焦时替换状态点。 */
.row:not(:has(.dot)) .slot-btn--chevron { opacity: 1; }
.row:has(.slot-btn):hover .dot, .row:has(.slot-btn):focus-within .dot { opacity: 0; }
.row:hover .slot-btn, .row:focus-within .slot-btn { opacity: 1; }

.add-instance {
  display: flex; align-items: center; gap: 6px;
  width: calc(100% - 34px); margin: 2px 0 4px 34px;
  height: 30px; padding: 0 8px;
  color: var(--cp-text-tertiary); background: transparent;
  border: 1px dashed var(--cp-border-light); border-radius: 8px;
  font: inherit; font-size: var(--settings-text-small); text-align: left; cursor: pointer;
  &:hover { color: var(--cp-primary); background: var(--cp-primary-lighter); }
}

/* ===================== 右栏 ===================== */
.panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: var(--cp-bg); }
.panel__inner { width: 100%; max-width: 780px; margin: 0 auto; padding: 0 32px; display: flex; flex-direction: column; min-height: 0; flex: 1; }
.panel__placeholder { margin: auto; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.panel__head { display: flex; align-items: center; gap: 12px; padding: 18px 0 16px; flex: 0 0 auto; }
.panel__logo {
  width: 36px; height: 36px; flex: 0 0 36px; display: grid; place-items: center;
  background: var(--cp-bg-elevated); border: 1px solid var(--cp-border-light); border-radius: 9px;
  overflow: hidden;
  img { width: 23px; height: 23px; object-fit: contain; }
}
.panel__id { min-width: 0; flex: 1; }
.panel__name { display: flex; align-items: center; gap: 7px; color: var(--cp-text); font-size: var(--settings-text-section); font-weight: 550; }
.panel__ep { padding: 1px 6px; color: var(--cp-text-secondary); background: var(--cp-bg-hover); border-radius: 4px; font-size: 11px; font-weight: 500; }
.panel__sub {
  display: flex; align-items: center; gap: 6px; margin-top: 2px;
  color: var(--cp-text-secondary); font-size: var(--settings-text-small);
  flex-wrap: wrap; row-gap: 3px;
  > span { white-space: nowrap; }
}
.proto { padding: 1px 6px; color: var(--cp-text-secondary); background: var(--cp-bg-hover); border-radius: 4px; font-size: 11px; font-weight: 500; }
.panel__actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.enable-label { color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.panel__body {
  flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 80px;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.section {
  padding: 24px 0;
  &:first-child { padding-top: 6px; }
}
.section__head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 16px; flex-wrap: wrap;
}
.section__head > div:first-child { min-width: 0; flex: 1 1 320px; }
.section__head h3 { margin: 0; color: var(--cp-text); font-size: var(--settings-text-subheading); font-weight: 550; }
.field {
  max-width: 640px; margin-bottom: 16px;
  &:last-child { margin-bottom: 0; }
}
.field__label { display: block; margin-bottom: 6px; color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 500; }
.field__row { display: flex; align-items: center; gap: 8px; }
.field__hint { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 1.5; &.is-err { color: var(--cp-danger); } }
.field__mono :deep(input) { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; }
.req { color: var(--cp-danger); }
.url-preview {
  display: flex; align-items: center; gap: 7px;
  margin-top: 8px; padding: 7px 10px;
  color: var(--cp-text-secondary); background: var(--cp-bg-elevated); border-radius: 6px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11.5px;
  overflow-x: auto; white-space: nowrap;
  b { color: var(--cp-text); font-weight: 500; }
  :deep(.app-icon) { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 11px; }
}
.status {
  display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px;
  color: var(--cp-text-secondary); background: var(--cp-bg-hover); border-radius: 12px;
  font-size: var(--settings-text-small); white-space: nowrap;
  i { width: 6px; height: 6px; border-radius: 50%; background: var(--cp-text-tertiary); }
  &.status--ok { color: var(--cp-success); background: rgba(16, 185, 129, .12); i { background: var(--cp-success); } }
  &.status--err { color: var(--cp-danger); background: rgba(239, 68, 68, .12); i { background: var(--cp-danger); } }
  &.status--warn { color: var(--cp-warning); background: rgba(245, 158, 11, .12); i { background: var(--cp-warning); } }
}
.no-auth {
  display: flex; align-items: center; gap: 9px;
  padding: 10px 12px;
  color: var(--cp-text); background: var(--cp-bg-elevated); border-radius: 6px;
  font-size: var(--settings-text-base);
  :deep(.app-icon) { color: var(--cp-success); }
}

.mtoolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.msearch {
  position: relative; flex: 0 1 260px;
  :deep(.app-icon) { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--cp-text-tertiary); pointer-events: none; }
  input {
    width: 100%; height: 30px; padding: 0 10px 0 28px;
    color: var(--cp-text); background: var(--cp-bg-elevated);
    border: 1px solid transparent; border-radius: 8px;
    font: inherit; font-size: var(--settings-text-base);
    &::placeholder { color: var(--cp-text-tertiary); }
    &:focus { outline: none; border-color: var(--cp-border); background: var(--cp-bg); }
  }
  &--wide { flex: 1 1 auto; margin-bottom: 6px; }
}
.mtoolbar__count { margin-left: auto; color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.model-list { max-width: 760px; }
.mrow {
  display: flex; align-items: center; gap: 12px;
  min-height: 52px; padding: 6px 8px; border-radius: 6px;
  &:hover { background: var(--cp-bg-elevated); }
  &.is-off .mrow__id { opacity: .55; }
}
.mrow__id { min-width: 0; flex: 1; }
.mrow__name {
  display: flex; align-items: center; gap: 6px;
  color: var(--cp-text); font-size: var(--settings-text-base);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mrow__model { margin-top: 1px; color: var(--cp-text-tertiary); font-size: 11px; }
.mrow__actions { display: flex; gap: 2px; flex: 0 0 auto; }
.chip { display: inline-flex; align-items: center; height: 18px; padding: 0 5px; border-radius: 3px; font-size: 10px; font-weight: 500; white-space: nowrap; }
.chip--reason { color: var(--cp-primary); background: var(--cp-primary-lighter); }
.chip--vision { color: #7c3aed; background: rgba(139, 92, 246, .12); }
.chip--flat { color: var(--cp-text-secondary); background: var(--cp-bg-hover); }

.empty {
  padding: 40px 16px; text-align: center;
  background: var(--cp-bg-elevated);
  border: 1px dashed var(--cp-border-light); border-radius: 12px;
}
.empty__icon {
  width: 34px; height: 34px; margin: 0 auto 10px;
  display: grid; place-items: center;
  color: var(--cp-text-secondary); background: var(--cp-bg-hover); border-radius: 50%;
}
.empty strong { display: block; color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 500; }
.empty__actions { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }

/* ===================== 抽屉 / 弹窗 ===================== */
.drawer-body { padding-bottom: 4px; }
.drawer-foot { display: flex; align-items: center; gap: 8px; width: 100%; }
.spacer { flex: 1; }
.muted { color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.checkrow { display: flex; align-items: center; gap: 18px; height: 34px; }
.chk {
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--cp-text); font-size: var(--settings-text-base); cursor: pointer;
  input { width: 15px; height: 15px; margin: 0; accent-color: var(--cp-primary); cursor: pointer; }
}
.chk--locked { color: var(--cp-text-secondary); cursor: default; }
.needkey {
  padding: 30px 20px; text-align: center;
  border: 1px dashed var(--cp-border-light); border-radius: 12px;
}
.needkey__icon {
  width: 42px; height: 42px; margin: 0 auto 10px;
  display: grid; place-items: center;
  color: var(--cp-text-secondary); background: var(--cp-bg-hover); border-radius: 50%;
}
.needkey strong { display: block; color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 500; }
.disc-list { display: flex; flex-direction: column; gap: 1px; }
.disc {
  display: flex; align-items: center; gap: 10px;
  padding: 8px; border-radius: 6px; cursor: pointer;
  &:hover { background: var(--cp-bg-elevated); }
  &.is-added { cursor: default; opacity: .6; }
  input { width: 15px; height: 15px; margin: 0; accent-color: var(--cp-primary); }
}
.disc__id {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px;
}

.avatar-row { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.avatar {
  width: 56px; height: 56px; flex: 0 0 56px;
  display: grid; place-items: center;
  color: #fff; border-radius: 50%; font-size: 20px; font-weight: 550;
  overflow: hidden;
  img { width: 100%; height: 100%; object-fit: cover; }
}
.avatar-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.tw { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; }
.tw__label {
  color: var(--cp-text); font-size: var(--settings-text-base);
}
.adv { margin-top: 6px; }
.adv__toggle {
  display: flex; align-items: center; gap: 6px;
  color: var(--cp-text-secondary); background: none; border: 0;
  font: inherit; font-size: var(--settings-text-small); cursor: pointer;
  :deep(.app-icon) { font-size: 11px; transition: transform 150ms cubic-bezier(.16, 1, .3, 1); }
  &:hover { color: var(--cp-text); }
}
.adv__body { margin-top: 14px; }
</style>
