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
                <AiBrandIcon :provider="group.id" :name="group.name" :custom-logo="group.logo" :letter-avatar="!isBuiltinProvider(group)" />
              </span>
              <span class="row__name">{{ group.name }}</span>
              <span class="row__slot">
                <i v-if="groupEnabled(group)" class="dot" />
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
                    <AiBrandIcon :provider="group.id" :name="instance.builtin ? instance.name : group.name" :custom-logo="group.logo" :letter-avatar="!isBuiltinProvider(group)" />
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
              <AiBrandIcon :provider="activeGroup?.id" :name="activeInstance.builtin ? activeInstance.name : activeGroup?.name" :custom-logo="activeGroup?.logo" :letter-avatar="activeGroup && !isBuiltinProvider(activeGroup)" />
            </span>
            <div class="panel__id">
              <div class="panel__name">
                <span>{{ activeGroup?.name }}</span>
                <span v-if="activeGroupHasMany" class="panel__ep">{{ activeInstance.name }}</span>
              </div>
              <div class="panel__sub">
                <span class="proto">{{ MODEL_PROTOCOLS[modelProtocol(form.protocol)].label }}</span>
              </div>
            </div>
            <div class="panel__actions">
              <span class="enable-label">{{ form.enabled ? '已启用' : '已停用' }}</span>
              <el-switch v-model="form.enabled" aria-label="启用服务商" style="--el-switch-on-color: var(--cp-success)" />
            </div>
          </header>

          <div class="panel__body">
            <section class="section">
              <div v-if="form.authMode === 'api-key'" class="field">
                <span class="field__label">API 密钥</span>
                <div class="field__row">
                  <div v-if="apiKeyDraft" class="key-display">
                    <input :type="keyVisible ? 'text' : 'password'" :value="apiKeyDraft" readonly aria-label="已配置的 API 密钥">
                    <div class="key-display__actions">
                      <SettingsTooltip content="复制密钥" placement="top"><button type="button" aria-label="复制密钥" @click="copyApiKey"><AppIcon name="CopyDocument" /></button></SettingsTooltip>
                      <SettingsTooltip content="编辑密钥" placement="top"><button type="button" aria-label="编辑密钥" @click="credentials?.openKey()"><AppIcon name="EditPen" /></button></SettingsTooltip>
                      <SettingsTooltip content="删除密钥" placement="top"><button class="key-display__delete" type="button" aria-label="删除密钥" @click="credentials?.removeKey()"><AppIcon name="Delete" /></button></SettingsTooltip>
                    </div>
                    <SettingsTooltip :content="keyVisible ? '隐藏密钥' : '显示密钥'" placement="top">
                      <button type="button" :aria-label="keyVisible ? '隐藏密钥' : '显示密钥'" :aria-pressed="keyVisible" @click="keyVisible = !keyVisible"><AppIcon :name="keyVisible ? 'Hide' : 'View'" /></button>
                    </SettingsTooltip>
                  </div>
                  <el-button v-else class="key-add" @click="credentials?.openKey()"><AppIcon name="Key" /><span>添加 API 密钥</span></el-button>
                  <SettingsTooltip content="API 密钥管理" placement="top">
                    <el-button class="key-manage" aria-label="API 密钥管理" @click="credentials?.openManager()"><AppIcon name="Key" /></el-button>
                  </SettingsTooltip>
                  <el-button v-if="apiKeyDraft" @click="credentials?.openTest()">
                    <AppIcon name="Connection" /><span>检测</span>
                  </el-button>
                </div>
              </div>
              <div v-else class="field">
                <span class="field__label">认证</span>
                <div class="no-auth">
                  <AppIcon name="Monitor" />
                  <span>无需密钥</span>
                  <el-button text @click="credentials?.openTest()">检测</el-button>
                </div>
              </div>

              <div class="field">
                <span class="field__label">请求协议</span>
                <el-select v-model="form.protocol" aria-label="请求协议" @change="changeProtocol">
                  <el-option v-for="(protocol, key) in MODEL_PROTOCOLS" :key="key" :label="protocol.label" :value="key" :disabled="!supportsModelProtocol(activeProtocolProvider, key)" />
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

            </section>

            <section class="section">
              <div class="section__head section__head--models">
                <div class="models-heading">
                  <h3>模型</h3>
                  <SettingsTooltip :content="modelDocsUrl ? '模型文档' : '暂无模型文档'" placement="top">
                    <a v-if="modelDocsUrl" class="model-tool" :href="modelDocsUrl" target="_blank" rel="noopener noreferrer" aria-label="模型文档">
                      <AppIcon name="Document" />
                    </a>
                    <button v-else class="model-tool" type="button" disabled aria-label="模型文档"><AppIcon name="Document" /></button>
                  </SettingsTooltip>
                  <div v-if="modelSearchOpen" class="model-search">
                    <AppIcon name="Search" />
                    <input ref="modelSearchInput" v-model="modelSearch" aria-label="搜索模型" placeholder="搜索模型…" @keydown.esc.stop="closeModelSearch">
                    <button type="button" aria-label="关闭模型搜索" @click="closeModelSearch"><AppIcon name="Close" /></button>
                  </div>
                  <SettingsTooltip v-else content="搜索" placement="top">
                    <button ref="modelSearchTrigger" class="model-tool" type="button" aria-label="搜索模型" :aria-expanded="false" @click="openModelSearch"><AppIcon name="Search" /></button>
                  </SettingsTooltip>
                </div>
                <el-button-group class="model-actions" role="group" aria-label="模型操作">
                  <el-button :loading="loadingModels" @click="syncModels">
                    <AppIcon v-if="!loadingModels" name="Refresh" /><span>同步模型</span>
                  </el-button>
                  <SettingsTooltip content="手动添加模型" placement="top" :show-after="300">
                    <el-button class="model-actions__add" aria-label="添加模型" @click="openModelDialog()">
                      <AppIcon name="Plus" />
                    </el-button>
                  </SettingsTooltip>
                </el-button-group>
              </div>

              <template v-if="form.models.length">
                <div class="model-list">
                  <div v-for="model in filteredModels" :key="model.id" class="mrow">
                    <span class="mrow__logo">
                      <AiBrandIcon :model="model.id" :provider="activeGroup?.id" :name="activeGroup?.name" :custom-logo="activeGroup?.logo" />
                    </span>
                    <div class="mrow__id">
                      <div class="mrow__name">
                        <span class="mrow__label" :title="model.id">{{ model.name || model.id }}</span>
                      </div>
                    </div>
                    <ModelCapabilities :model="model" />
                    <div class="mrow__actions">
                      <SettingsTooltip content="编辑模型" placement="top">
                        <el-button text circle aria-label="编辑模型" @click="openModelDialog(model)">
                          <AppIcon name="lucide:bolt" :size="16" />
                        </el-button>
                      </SettingsTooltip>
                      <SettingsTooltip content="移除模型" placement="top">
                        <el-button text circle aria-label="移除模型" @click="removeModel(model)">
                          <AppIcon name="lucide:minus" :size="16" />
                        </el-button>
                      </SettingsTooltip>
                    </div>
                  </div>
                  <p v-if="!filteredModels.length" class="model-list__empty">没有匹配的模型</p>
                </div>
              </template>

              <div v-else class="empty">
                <svg class="empty__image" viewBox="0 0 64 41" fill="none" aria-hidden="true">
                  <ellipse cx="32" cy="34" rx="32" ry="7" fill="var(--cp-bg-hover)" />
                  <path d="M9 14 20 1h24l11 13v19c0 2-2 3-4 3H13c-2 0-4-1-4-3V14Z" fill="var(--cp-bg)" stroke="var(--cp-text-placeholder)" />
                  <path d="M9 14h11c1 0 2 1 2 2l1 3c0 1 1 1 2 1h14c1 0 2 0 2-1l1-3c0-1 1-2 2-2h11v19c0 2-2 3-4 3H13c-2 0-4-1-4-3V14Z" fill="var(--cp-bg-elevated)" stroke="var(--cp-text-placeholder)" />
                  <path d="M9 24h46" stroke="var(--cp-text-placeholder)" />
                </svg>
                <p>请选择模型</p>
                <p>点击上方的“同步模型”添加模型</p>
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

    <ModelCredentials v-if="activeInstance" ref="credentials" :provider="credentialProvider" :saved-key="apiKeyDraft" @saved="onCredentialSaved" />

    <ModelEditorDialog v-if="modelDialog" :key="form.id" :model="editingModel" @close="modelDialog = false" @save="confirmModel" />

    <!-- ================= 发现模型 ================= -->
    <el-drawer v-model="discoverDrawer" :title="`${form.name} 模型`" size="600px" class="model-discovery">
      <template #header="{ titleId }">
        <div class="disc-header">
          <h2 :id="titleId">{{ form.name }} 模型 <span v-if="!loadingModels" class="disc-count">{{ remoteModels.length }}</span></h2>
          <button class="disc-clear" type="button" :disabled="loadingModels || !form.models.length" @click="removeAllModels"><AppIcon name="lucide:list-minus" :size="16" />移除全部</button>
        </div>
      </template>
      <div class="disc-body">
        <div class="disc-search">
          <AppIcon name="Search" :size="16" />
          <input v-model="discoverSearch" type="search" aria-label="搜索同步模型" placeholder="搜索模型…" :disabled="loadingModels">
        </div>
        <div v-if="loadingModels" class="disc-state" role="status" aria-live="polite"><AppIcon name="Loading" :size="24" class="is-loading" /><span>正在同步模型…</span></div>
        <div v-else-if="discoverError" class="disc-state" role="alert"><span>{{ discoverError }}</span><el-button @click="syncModels">重试</el-button></div>
        <div v-else class="disc-list">
          <button v-for="item in filteredRemote" :key="item" type="button" class="disc" :class="{ 'is-added': isAdded(item) }" :aria-label="`${isAdded(item) ? '移除' : '添加'} ${item}`" :aria-pressed="isAdded(item)" @click="toggleDiscovered(item)">
            <span class="disc__logo"><AiBrandIcon :model="item" :provider="activeGroup?.id" :name="activeGroup?.name" :custom-logo="activeGroup?.logo" /></span>
            <span class="disc__id">{{ item }}</span>
            <ModelCapabilities :model="form.models.find(model => model.id === item) || remoteMetadata[item]" />
            <AppIcon :name="isAdded(item) ? 'lucide:minus' : 'lucide:plus'" :size="18" />
          </button>
          <p v-if="!filteredRemote.length" class="rail__empty">{{ remoteModels.length ? '没有匹配的模型' : '未获取到模型' }}</p>
        </div>
      </div>
    </el-drawer>

    <!-- ================= 添加服务商 / 实例 ================= -->
    <el-dialog
      v-model="providerDialog"
      class="provider-dialog"
      :class="{ 'provider-dialog--new': providerForm.mode === 'new' }"
      :title="providerForm.mode === 'edit' ? '编辑实例' : providerForm.mode === 'instance' ? `添加 ${providerForm.parentName} 实例` : '添加服务商'"
      width="520px"
      align-center
      @closed="avatarPickerOpen = false"
    >
      <div class="drawer-body">
        <div v-if="providerForm.mode === 'new'" class="avatar-row">
          <span class="avatar" :class="{ 'avatar--builtin': providerForm.avatar.startsWith('lobehub:') }" aria-label="服务商头像预览">
            <AiBrandIcon :name="providerForm.name" :custom-logo="providerForm.avatar" letter-avatar />
          </span>
          <div class="avatar-actions">
            <el-button size="small" @click="avatarInput?.click()">
              <AppIcon name="Picture" /><span>图片上传</span>
            </el-button>
            <el-popover v-model:visible="avatarPickerOpen" trigger="click" placement="bottom-start" :width="340" @after-leave="avatarSearch = ''">
              <template #reference><el-button size="small" aria-label="选择内置头像">内置头像</el-button></template>
              <div class="avatar-picker">
                <el-input v-model="avatarSearch" placeholder="搜索图标…" aria-label="搜索内置头像" clearable><template #prefix><AppIcon name="Search" /></template></el-input>
                <div class="avatar-picker__grid" aria-label="内置 AI 服务商图标">
                  <button v-for="brand in filteredAvatarBrands" :key="brand" type="button" class="avatar-picker__option" :aria-label="`选择 ${brand} 头像`" :title="brand" :aria-pressed="providerForm.avatar === `lobehub:${brand}`" @click="selectBuiltinAvatar(brand)">
                    <AiBrandIcon :custom-logo="`lobehub:${brand}`" />
                  </button>
                </div>
                <p v-if="!filteredAvatarBrands.length" class="avatar-picker__empty">没有匹配的图标</p>
              </div>
            </el-popover>
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
          <el-select v-model="providerForm.protocol" aria-label="新服务商请求协议" @change="changeProviderProtocol">
            <el-option v-for="(protocol, key) in MODEL_PROTOCOLS" :key="key" :label="protocol.label" :value="key" :disabled="!supportsModelProtocol(dialogProtocolProvider, key)" />
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
          <button class="adv__toggle" type="button" :aria-expanded="providerForm.moreOpen" @click="providerForm.moreOpen = !providerForm.moreOpen">
            <AppIcon :name="providerForm.moreOpen ? 'ArrowDown' : 'ArrowRight'" /><span>更多设置</span>
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
import SettingsTooltip from '../settings/components/SettingsTooltip.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, watch } from 'vue'
import { ElMessage, ElMessageBox, type DropdownInstance } from 'element-plus'
import { MODEL_PROTOCOLS, modelEndpointForProtocol, modelProtocol, modelRequestUrl, supportsModelProtocol, type ModelProtocol } from '@/config/modelProtocol'
import { AI_BRAND_OPTIONS, resolveAiBrandIcon } from '@/components/AiBrandIcon/brands'
import { getPlatformApi, getPreference, savePreference } from '@/platform'
import {
  DEFAULT_CONTEXT_WINDOW,
  MODEL_PROVIDER_PRESETS,
  MODEL_PROVIDER_BUILTIN_INSTANCES,
  isModelProviderAvailable,
  type ModelProviderInput,
  type ModelProviderKey,
  type ModelProviderSummary,
  type ModelMetadata,
  type ModelServiceSummary,
  type ProviderModelConfig,
} from '@/config/harness'
import AiBrandIcon from '@/components/AiBrandIcon/index.vue'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import ModelCredentials from './components/ModelCredentials.vue'
import ModelEditorDialog from './components/ModelEditorDialog.vue'
import ModelCapabilities from './components/ModelCapabilities.vue'

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

const PROVIDERS: { key: ModelProviderKey, name: string, endpoint: string, authMode: 'api-key' | 'none' }[] = [
  { key: 'deepseek', name: '深度求索', endpoint: 'https://api.deepseek.com', authMode: 'api-key' },
  { key: 'glm', name: '智谱', endpoint: 'https://open.bigmodel.cn/api/paas/v4', authMode: 'api-key' },
  { key: 'kimi', name: '月之暗面', endpoint: 'https://api.moonshot.cn', authMode: 'api-key' },
  { key: 'minimax', name: 'MiniMax', endpoint: 'https://api.minimaxi.com/v1', authMode: 'api-key' },
  { key: 'qwen', name: '阿里千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', authMode: 'api-key' },
  ...MODEL_PROVIDER_PRESETS.filter(item => ['siliconcloud', 'baichuan', 'bailian', 'volcengine', 'modelscope', 'tokenhub', 'qianfan', 'xiaomimimo'].includes(item.key)),
  { key: 'ollama', name: 'Ollama', endpoint: 'http://127.0.0.1:11434/v1', authMode: 'none' },
]
const BUILTIN_BY_KEY = new Map(PROVIDERS.map(item => [item.key, item]))
const EXPANDED_KEY = 'modelProviderExpanded'
const ORDER_KEY = 'modelProviderOrder'

const api = getPlatformApi()
const records = ref<ModelProviderSummary[]>([])
const services = ref<ModelServiceSummary[]>([])
const loading = ref(false)
const loadingModels = ref(false)
const search = ref('')
const modelSearch = ref('')
const modelSearchOpen = ref(false)
const modelSearchInput = ref<HTMLInputElement>()
const modelSearchTrigger = ref<HTMLButtonElement>()
const selectedId = ref('')
const apiKeyDraft = ref('')
const keyVisible = ref(false)
const credentials = ref<InstanceType<typeof ModelCredentials>>()
const credentialProvider = computed(() => plainInput())
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
    ...preset, id: preset.key, providerKey: preset.key, logo: '', hasInstances: false, protocol: 'openai-completions',
  }]))
  for (const service of services.value) {
    const preset = BUILTIN_BY_KEY.get(service.id as ModelProviderKey)
    definitions.set(service.id, { ...service, name: preset?.name || service.name, logo: service.logo || '' })
  }
  const result: ProviderGroup[] = [...definitions.values()].map(service => ({
    ...service,
    instances: records.value.filter(record => (record.slug || (record.providerKey === 'custom' ? record.id.replace(/[^A-Za-z0-9]/g, '') : record.providerKey)) === service.id),
  }))
  for (const group of result) {
    group.instances = group.instances.map(instance => instance.builtin && !['glm', 'kimi'].includes(group.providerKey) ? { ...instance, name: group.name } : instance)
    const ids = getPreference<string[]>(`modelInstanceOrder:${group.id}`, [])
    const rank = new Map(ids.map((id, index) => [id, index]))
    group.instances.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999)
      || Number(a.builtin === true) - Number(b.builtin === true) || b.createdAt - a.createdAt)
  }
  if (order.value.length) {
    // 升级后把新增内置项插到下一个已有预设之前，保留用户已有的拖拽顺序。
    const ids = [...order.value]
    for (const [index, preset] of PROVIDERS.entries()) {
      if (ids.includes(preset.key)) continue
      const next = PROVIDERS.slice(index + 1).find(item => ids.includes(item.key))
      ids.splice(next ? ids.indexOf(next.key) : ids.length, 0, preset.key)
    }
    const rank = new Map(ids.map((id, index) => [id, index]))
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

/** 多个内置实例或手动实例展示为子级；单个默认实例由一级服务商承载。 */
const groupExpandable = (group: ProviderGroup) => group.hasInstances && (group.instances.length > 1 || group.instances.some(instance => !instance.builtin))
const isBuiltinProvider = (group: ProviderGroup) => BUILTIN_BY_KEY.has(group.id as ModelProviderKey)
const groupEnabled = (group: ProviderGroup) => group.instances.some(instanceEnabled)
const instanceEnabled = (instance: Instance) => instance.enabled && instance.models.some(model => model.enabled)
const isProviderActive = (group: ProviderGroup) => group.instances.some(instance => instance.id === selectedId.value)

/* ---------- 面板 ---------- */
const activeProtocolProvider = computed(() => ({ slug: activeGroup.value?.id, providerKey: form.providerKey }))
const endpointDirty = computed(() => Boolean(defaultEndpoint.value) && form.endpoint.replace(/\/+$/, '') !== modelEndpointForProtocol(defaultEndpoint.value, modelProtocol(form.protocol), activeProtocolProvider.value))
const effectiveUrl = computed(() => supportsModelProtocol(activeProtocolProvider.value, modelProtocol(form.protocol))
  ? modelRequestUrl(form.endpoint, form.protocol, activeProtocolProvider.value) : '该服务商不支持此协议，请切换请求协议')
const activeBuiltinPreset = computed(() => MODEL_PROVIDER_BUILTIN_INSTANCES.find(preset => activeInstance.value?.builtin && preset.providerKey === form.providerKey && preset.name === activeInstance.value.name))
const modelDocsUrl = computed(() => {
  if (activeBuiltinPreset.value) return activeBuiltinPreset.value.docs
  const docs: Partial<Record<ModelProviderKey, string>> = {
    deepseek: 'https://api-docs.deepseek.com/zh-cn/',
    glm: 'https://open.bigmodel.cn/console/modelcenter/square',
    kimi: 'https://platform.kimi.com/docs/get-api-key',
    minimax: 'https://platform.minimax.io/document/Models',
    qwen: 'https://platform.qianwenai.com/docs/developer-guides/getting-started/introduction',
    siliconcloud: 'https://cloud.siliconflow.cn/me/models',
    baichuan: 'https://platform.baichuan-ai.com/prices',
    bailian: 'https://bailian.console.aliyun.com/cn-beijing/model/market',
    volcengine: 'https://console.volcengine.com/ark/region:cn-beijing/model?view=CARD_VIEW',
    modelscope: 'https://modelscope.cn/models',
    tokenhub: 'https://cloud.tencent.com/document/product/1823/130079',
    qianfan: 'https://cloud.baidu.com/doc/qianfan/index.html',
    xiaomimimo: 'https://mimo.mi.com/docs/zh-CN/quick-start/summary/model',
    ollama: 'https://ollama.com/library',
  }
  let hostname = ''
  try { hostname = new URL(form.endpoint).hostname } catch { /* 地址编辑中仍显示服务商默认文档。 */ }
  if (form.providerKey === 'glm' && (hostname === 'z.ai' || hostname.endsWith('.z.ai'))) return 'https://docs.z.ai/api-reference/introduction'
  if (form.providerKey === 'kimi' && (hostname === 'moonshot.ai' || hostname.endsWith('.moonshot.ai'))) return 'https://platform.moonshot.ai/docs/'
  // 旧主进程可能将新预设存成 custom；文档仍按所属内置服务商匹配。
  return docs[activeGroup.value?.id as ModelProviderKey] || (form.providerKey ? docs[form.providerKey] : undefined)
})
const filteredModels = computed(() => {
  const keywords = modelSearch.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return form.models.filter(model => keywords.every(keyword => `${model.id} ${model.name || ''}`.toLocaleLowerCase().includes(keyword)))
})

async function openModelSearch() {
  modelSearchOpen.value = true
  await nextTick()
  modelSearchInput.value?.focus()
}
async function closeModelSearch() {
  modelSearch.value = ''
  modelSearchOpen.value = false
  await nextTick()
  modelSearchTrigger.value?.focus()
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
  window.clearTimeout(saveTimer)
  selectedId.value = id
  modelDialog.value = false
  discoverDrawer.value = false
  apiKeyDraft.value = ''
  keyVisible.value = false
  modelSearch.value = ''
  modelSearchOpen.value = false
  const preset = BUILTIN_BY_KEY.get(record.providerKey)
  const instancePreset = MODEL_PROVIDER_BUILTIN_INSTANCES.find(item => item.providerKey === record.providerKey && item.name === record.name)
  defaultEndpoint.value = preset && record.builtin
    ? (instancePreset?.endpoint || preset.endpoint).replace(/\/+$/, '')
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
    models: record.models.map(model => ({ ...model, enabled: true })),
  })
  const secret = record.hasApiKey && record.authMode === 'api-key' ? await api?.getModelProviderApiKey(record.id) || '' : ''
  if (selectedId.value === id) {
    apiKeyDraft.value = secret
    if (record.models.some(model => !model.enabled)) saveActive()
  }
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

function changeProtocol() {
  if (!supportsModelProtocol(activeProtocolProvider.value, modelProtocol(form.protocol))) return
  form.endpoint = modelEndpointForProtocol(form.endpoint, modelProtocol(form.protocol), activeProtocolProvider.value)
  saveActive()
}

async function resetEndpoint() {
  if (!defaultEndpoint.value) return
  form.endpoint = modelEndpointForProtocol(defaultEndpoint.value, modelProtocol(form.protocol), activeProtocolProvider.value)
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
const modelDialog = ref(false)
const editingModel = shallowRef<ProviderModelConfig>()

function openModelDialog(model?: ProviderModelConfig) {
  editingModel.value = model
  modelDialog.value = true
}

function confirmModel(next: ProviderModelConfig) {
  if (!editingModel.value && form.models.some(model => model.id === next.id)) return ElMessage.warning('该模型已存在')
  const index = form.models.findIndex(model => model.id === editingModel.value?.id)
  if (editingModel.value && index >= 0) form.models.splice(index, 1, next)
  else form.models.push(next)
  modelDialog.value = false
  saveActive()
}

function removeModel(model: ProviderModelConfig) {
  form.models = form.models.filter(item => item.id !== model.id)
  saveActive()
}

/* ---------- 发现模型 ---------- */
const discoverDrawer = ref(false)
const discoverSearch = ref('')
const discoverError = ref('')
const remoteModels = ref<string[]>([])
const remoteMetadata = ref<Record<string, ModelMetadata>>({})
let discoverRevision = 0
watch(discoverDrawer, open => {
  if (!open) { discoverRevision += 1; loadingModels.value = false }
}, { flush: 'sync' })
const discoverNeedsKey = computed(() => form.authMode === 'api-key' && !apiKeyDraft.value && !activeInstance.value?.hasApiKey)
const filteredRemote = computed(() => {
  const keyword = discoverSearch.value.trim().toLocaleLowerCase()
  return remoteModels.value.filter(id => !keyword || id.toLocaleLowerCase().includes(keyword))
})
const isAdded = (id: string) => form.models.some(model => model.id === id)

async function syncModels() {
  if (!api || loadingModels.value) return
  if (!form.endpoint.trim()) return ElMessage.warning('请先填写 API 地址')
  if (discoverNeedsKey.value) { credentials.value?.openKey(); return }
  const revision = ++discoverRevision
  const instanceId = form.id
  discoverError.value = ''; discoverSearch.value = ''
  remoteModels.value = []; remoteMetadata.value = {}
  discoverDrawer.value = true
  loadingModels.value = true
  try {
    const result = await api.listModelProviderModels(plainInput())
    if (revision !== discoverRevision || form.id !== instanceId) return
    remoteModels.value = result.models || []
    remoteMetadata.value = result.metadata || {}
    discoverError.value = result.error || ''
    if (!result.error && form.models.some(model => remoteMetadata.value[model.id])) {
      form.models = form.models.map(model => ({ ...remoteMetadata.value[model.id], ...model }))
      saveActive()
    }
  } catch (cause) {
    if (revision === discoverRevision) discoverError.value = cause instanceof Error ? cause.message : '同步失败，请重试'
  } finally { if (revision === discoverRevision) loadingModels.value = false }
}

function toggleDiscovered(id: string) {
  if (isAdded(id)) form.models = form.models.filter(model => model.id !== id)
  else form.models.push({ id, enabled: true, reasoning: false, contextWindow: DEFAULT_CONTEXT_WINDOW, ...remoteMetadata.value[id] })
  saveActive()
}

function removeAllModels() {
  form.models = []
  saveActive()
}

/* ---------- 密钥配置 ---------- */
async function copyApiKey() {
  try {
    await navigator.clipboard.writeText(apiKeyDraft.value)
    ElMessage.success('已复制密钥')
  } catch { ElMessage.error('复制失败，请重试') }
}

function onCredentialSaved(saved: ModelProviderSummary, key?: string) {
  window.clearTimeout(saveTimer)
  const index = records.value.findIndex(item => item.id === saved.id)
  if (index >= 0) records.value.splice(index, 1, saved)
  if (selectedId.value !== saved.id) return
  form.models = saved.models.map(model => ({ ...model }))
  form.enabled = saved.enabled
  if (key !== undefined) { apiKeyDraft.value = key; keyVisible.value = false }
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
const avatarPickerOpen = ref(false)
const avatarSearch = ref('')
const filteredAvatarBrands = computed(() => AI_BRAND_OPTIONS.filter(brand => brand.includes(avatarSearch.value.trim().toLocaleLowerCase())))
function selectBuiltinAvatar(brand: string) {
  providerForm.avatar = `lobehub:${brand}`
  avatarPickerOpen.value = false
}
const dialogProtocolProvider = computed(() => ({ slug: providerForm.mode === 'new' ? '' : providerForm.parentSlug }))
function changeProviderProtocol() {
  providerForm.endpoint = modelEndpointForProtocol(providerForm.endpoint, providerForm.protocol, dialogProtocolProvider.value)
}
const slugError = ref('')
const providerValid = computed(() => {
  if (!providerForm.name.trim() || !providerForm.endpoint.trim() || !supportsModelProtocol(dialogProtocolProvider.value, providerForm.protocol)) return false
  if (providerForm.mode === 'new') return /^[A-Za-z0-9]+$/.test(providerForm.slug) && !slugError.value
  return true
})
const providerPreviewUrl = computed(() => {
  const url = providerForm.endpoint.trim().replace(/\/+$/, '')
  return url && supportsModelProtocol(dialogProtocolProvider.value, providerForm.protocol) ? modelRequestUrl(url, providerForm.protocol, dialogProtocolProvider.value) : '—'
})

function resetProviderForm() {
  avatarPickerOpen.value = false
  avatarSearch.value = ''
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
  const brand = resolveAiBrandIcon({ provider: key, name: preset.name })?.brand
  providerForm.avatar = brand ? `lobehub:${brand}` : ''
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
onBeforeUnmount(() => { discoverRevision += 1; window.clearTimeout(saveTimer) })
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
.rail__list {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 2px 8px 8px;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
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
  .ai-brand-icon { width: 17px; height: 17px; }
}
.row__logo--sm { width: 22px; height: 22px; flex: 0 0 22px; border-radius: 6px; .ai-brand-icon { width: 14px; height: 14px; } }
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
/* 启用时常驻状态点；悬停或键盘聚焦时切换为箭头或更多按钮。 */
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
  .ai-brand-icon { width: 23px; height: 23px; }
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
.section__head--models { align-items: center; flex-wrap: nowrap; }
.section__head--models > div:first-child { flex: 1 1 auto; }
.models-heading { display: flex; align-items: center; gap: 8px; }
.models-heading h3 { flex: 0 0 auto; white-space: nowrap; }
.model-tool {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 28px;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--cp-text-secondary); cursor: pointer;
  &:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
  &:disabled { color: var(--cp-text-placeholder); cursor: default; background: transparent; }
  &:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
}
.model-search {
  display: flex; align-items: center; gap: 6px; flex: 1 1 180px; min-width: 0; max-width: 240px;
  height: 32px; padding: 0 8px; border: 1px solid var(--cp-border); border-radius: 8px; color: var(--cp-text-secondary);
  input { min-width: 0; width: 100%; padding: 0; border: 0; outline: none; background: transparent; color: var(--cp-text); font: inherit; font-size: var(--settings-text-base); }
  input::placeholder { color: var(--cp-text-secondary); }
  button { display: grid; place-items: center; flex: 0 0 20px; width: 20px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
  button:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
}
.model-actions { display: inline-flex; flex: 0 0 auto; white-space: nowrap; }
.model-actions :deep(.model-actions__add) { width: 32px; min-width: 32px; padding: 0; }
.field {
  max-width: 640px; margin-bottom: 16px;
  &:last-child { margin-bottom: 0; }
}
.field__label { display: block; margin-bottom: 6px; color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 500; }
.field__row { display: flex; align-items: center; gap: 8px; }
.key-add { flex: 1; margin: 0; }
.key-display {
  display: flex; align-items: center; flex: 1; min-width: 0; height: 32px; padding: 0 6px 0 11px;
  border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-bg);
  &:hover, &:focus-within { border-color: var(--cp-text-placeholder); }
  input { flex: 1; min-width: 0; width: 0; padding: 0; border: 0; outline: none; background: transparent; color: var(--cp-text); font: inherit; font-size: var(--settings-text-base); }
  button { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 24px; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--cp-text-secondary); cursor: pointer; }
  button:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
  button:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 1px; }
  button.key-display__delete:hover { color: var(--cp-danger); }
}
.key-display__actions { display: flex; visibility: hidden; }
.key-display:hover .key-display__actions, .key-display:focus-within .key-display__actions { visibility: visible; }
.key-manage { flex: 0 0 32px; width: 32px; padding: 0; }
.field__row > .el-button + .el-button { margin-left: 0; }
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
.no-auth {
  display: flex; align-items: center; gap: 9px;
  padding: 10px 12px;
  color: var(--cp-text); background: var(--cp-bg-elevated); border-radius: 6px;
  font-size: var(--settings-text-base);
  :deep(.app-icon) { color: var(--cp-success); }
}

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
.model-list { max-width: 760px; border: 1px solid var(--cp-border); border-radius: 12px; overflow: hidden; }
.model-list__empty { padding: 24px 0; margin: 0; text-align: center; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.mrow {
  display: flex; align-items: center; gap: 12px;
  min-height: 52px; padding: 6px 12px;
  & + & { border-top: 1px solid var(--cp-border-light); }
  &:hover { background: var(--cp-bg-elevated); }
}
.mrow__logo { display: grid; place-items: center; flex: 0 0 28px; width: 28px; height: 28px; border: 1px solid var(--cp-border-light); border-radius: 50%; background: var(--cp-bg); color: var(--cp-text-secondary); .ai-brand-icon { width: 20px; height: 20px; } }
.mrow__id { min-width: 0; flex: 1; }
.mrow__name {
  display: flex; align-items: center; gap: 6px;
  color: var(--cp-text); font-size: var(--settings-text-base);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mrow__actions { display: flex; gap: 2px; flex: 0 0 auto; .el-button { color: var(--cp-text-secondary); margin-left: 0; } }
.mrow__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

.empty {
  padding: 56px 16px; text-align: center;
  color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6;
}
.empty__image { display: block; width: 64px; height: 41px; margin: 0 auto 16px; }
.empty p { margin: 0; }
.empty p + p { margin-top: 6px; }

/* ===================== 抽屉 / 弹窗 ===================== */
:global(.provider-dialog.el-dialog) { display: flex; flex-direction: column; max-height: calc(100dvh - 48px); }
:global(.provider-dialog--new.el-dialog) { height: min(760px, calc(100dvh - 48px)); }
:global(.provider-dialog .el-dialog__header),
:global(.provider-dialog .el-dialog__footer) { flex-shrink: 0; }
:global(.provider-dialog .el-dialog__body) { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }
:global(.provider-dialog .el-dialog__body::-webkit-scrollbar) { display: none; }
.drawer-body { padding-bottom: 4px; }
.disc-header { display: flex; align-items: center; gap: 16px; min-width: 0; width: 100%; h2 { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0; color: var(--cp-text); font-size: var(--settings-text-section); font-weight: 550; overflow-wrap: anywhere; } }
.disc-count { flex-shrink: 0; padding: 2px 7px; border-radius: 7px; background: var(--cp-bg-hover); font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
.disc-clear { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: auto; padding: 6px 8px; border: 0; border-radius: 6px; background: none; color: var(--cp-text-secondary); font: inherit; font-size: var(--settings-text-small); cursor: pointer; &:hover:not(:disabled) { background: var(--cp-bg-hover); color: var(--cp-text); } &:disabled { opacity: .4; cursor: default; } }
.disc-body { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.disc-state { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 160px; padding: 24px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); text-align: center; overflow-wrap: anywhere; }
.disc-search { display: flex; align-items: center; flex-shrink: 0; gap: 10px; padding: 10px 12px; margin-bottom: 20px; border: 1px solid var(--cp-border); border-radius: 10px; color: var(--cp-text-secondary); input { min-width: 0; flex: 1; padding: 0; border: 0; outline: none; background: transparent; color: var(--cp-text); font: inherit; font-size: var(--settings-text-base); &::placeholder { color: var(--cp-text-placeholder); } &::-webkit-search-cancel-button { display: none; } } &:focus-within { border-color: var(--cp-text-secondary); } }
.disc-list { display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow-y: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
.disc {
  display: flex; align-items: center; flex-shrink: 0; gap: 12px; width: 100%; min-height: 44px;
  padding: 8px 12px; border: 0; border-radius: 10px; background: transparent; color: var(--cp-text); font: inherit; text-align: left; cursor: pointer;
  transition: background-color 150ms ease-out;
  > .app-icon { color: var(--cp-text-secondary); }
  &:hover { background: var(--cp-bg-hover); }
  &.is-added { background: color-mix(in srgb, var(--cp-success) 9%, var(--cp-bg)); &:hover { background: color-mix(in srgb, var(--cp-success) 15%, var(--cp-bg)); } }
  &:focus-visible { outline: 2px solid var(--cp-text-secondary); outline-offset: -2px; }
}
.disc__logo { display: grid; place-items: center; flex: 0 0 26px; width: 26px; height: 26px; border: 1px solid var(--cp-border-light); border-radius: 50%; background: var(--cp-bg); .ai-brand-icon { width: 19px; height: 19px; } }
.disc__id { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: var(--settings-text-base); }
:global(.model-discovery.el-drawer) { top: 12px; right: 12px; max-width: calc(100vw - 24px); height: calc(100% - 24px); border-radius: 16px; background: var(--cp-bg); }
:global(.model-discovery .el-drawer__header) { gap: 12px; margin-bottom: 0; padding: 24px 24px 20px; }
:global(.model-discovery .el-drawer__body) { overflow: hidden; padding: 0 24px 24px; }

.avatar-row { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 20px; }
.avatar {
  width: 64px; height: 64px; flex: 0 0 64px;
  display: grid; place-items: center;
  color: var(--cp-text); border-radius: 50%; font-size: 20px; font-weight: 550;
  overflow: hidden;
  :deep(img) { object-fit: cover; }
  &--builtin { padding: 12px; border: 1px solid var(--cp-border); :deep(img) { object-fit: contain; } }
}
.avatar-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; :deep(.el-button + .el-button) { margin-left: 0; } }
.avatar-picker { color: var(--cp-text); }
.avatar-picker__grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; max-height: 246px; overflow-y: auto; margin-top: 12px; padding: 2px; }
.avatar-picker__option {
  display: grid; place-items: center; width: 48px; height: 48px; padding: 10px; border: 1px solid var(--cp-border); border-radius: 50%; background: var(--cp-bg); color: var(--cp-text); cursor: pointer;
  &:hover, &[aria-pressed='true'] { border-color: var(--cp-text); background: var(--cp-bg-hover); }
  &:focus-visible { outline: 2px solid var(--cp-text); outline-offset: 2px; }
}
.avatar-picker__empty { margin: 20px 0 8px; text-align: center; color: var(--cp-text-secondary); }
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
