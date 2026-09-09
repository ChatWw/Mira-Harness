<template>
  <footer class="composer-shell" @keydown.esc="closeComposerOverlay">
    <div v-if="composerOverlay" class="composer-overlay__backdrop" @mousedown="closeComposerOverlay" />
    <PlanClarificationWizard v-if="pendingQuestionInteraction" :interaction="pendingQuestionInteraction" :busy="interactionSubmitting" @answer="answerPlanQuestions" @cancel="cancelPlan" />
    <PlanReviewPanel v-else-if="confirmPlanPending && store.activePlan" :plan="store.activePlan" :busy="interactionSubmitting" @execute="confirmPlan" @cancel="cancelPlan" />
    <div v-if="showProjectPicker" class="composer-toolbar" aria-label="对话项目工具">
      <div class="composer-toolbar__project-control" :class="{ 'has-project': selectedProject }">
        <el-popover v-model:visible="projectPickerVisible" trigger="click" placement="top" :width="250" popper-class="harness-selector-popper" :show-arrow="false" @show="refreshProjectPicker">
          <template #reference>
            <button type="button" class="composer-toolbar__item composer-toolbar__project" :aria-label="selectedProject ? `当前项目：${selectedProject.name}` : '选择项目'">
              <AppIcon class="composer-toolbar__project-icon" name="FolderOpened" />
              <span class="composer-toolbar__label">{{ selectedProject?.name || '选择项目' }}</span>
            </button>
          </template>
          <div class="selector-panel selector-panel--projects">
            <el-input v-model="projectQuery" size="small" clearable placeholder="搜索项目"><template #prefix><AppIcon name="Search" /></template></el-input>
            <div class="selector-panel__list">
              <button v-for="project in filteredProjects" :key="project.id" type="button" class="selector-option" :class="{ active: project.id === selectedProject?.id }" @click="selectProject(project.id)"><AppIcon :name="project.icon" /><span>{{ project.name }}</span><AppIcon v-if="project.id === selectedProject?.id" name="Check" /></button>
              <p v-if="!filteredProjects.length" class="selector-empty">没有匹配的项目</p>
            </div>
            <button type="button" class="selector-option selector-option--new" @click="createProjectFromPicker"><AppIcon name="Plus" /><span>新建项目</span></button>
          </div>
        </el-popover>
        <button v-if="selectedProject" type="button" class="composer-toolbar__clear" :aria-label="`移除项目 ${selectedProject.name}`" @click.stop="selectProject()"><AppIcon name="CircleCloseFilled" /></button>
      </div>
      <span v-if="showGitPicker" class="composer-toolbar__divider" aria-hidden="true" />
      <el-popover v-if="showGitPicker" v-model:visible="gitPickerVisible" trigger="click" placement="top" :width="300" popper-class="harness-selector-popper" :show-arrow="false" @show="refreshGitBranches">
        <template #reference><button type="button" class="composer-toolbar__item composer-toolbar__git" :title="selectedProject?.gitBranch || 'Git 分支'" :aria-label="selectedProject?.gitBranch ? `当前 Git 分支：${selectedProject.gitBranch}` : 'Git 分支'"><AppIcon name="tabler:git-branch" /><span class="composer-toolbar__label">{{ selectedProject?.gitBranch || 'Git' }}</span></button></template>
        <div class="git-branch-panel">
          <el-input v-model="gitBranchQuery" size="small" clearable placeholder="搜索分支"><template #prefix><AppIcon name="Search" /></template></el-input>
          <p class="git-branch-panel__title">分支</p>
          <div class="selector-panel__list git-branch-panel__list" v-loading="gitBranchesLoading">
            <button v-for="branch in filteredGitBranches" :key="branch.name" type="button" class="git-branch-option" :class="{ active: branch.current }" :disabled="gitBranchWorking" @click="checkoutGitBranch(branch.name)"><AppIcon name="tabler:git-branch" /><span><strong>{{ branch.name }}</strong><small v-if="branch.uncommittedFileCount">未提交：{{ branch.uncommittedFileCount }}个文件</small></span><AppIcon v-if="branch.current" name="Check" /></button>
            <p v-if="!gitBranchesLoading && !filteredGitBranches.length" class="selector-empty">没有匹配的本地分支</p>
          </div>
          <button type="button" class="git-branch-panel__create" :disabled="gitBranchWorking" @click="openCreateGitBranchDialog"><AppIcon name="Plus" /><span>创建并检出新分支...</span></button>
        </div>
      </el-popover>
    </div>
    <div class="composer" @dragover.prevent @drop.prevent="handleFileDrop">
      <section v-if="composerOverlay === 'add'" class="composer-overlay composer-overlay--add" aria-label="添加内容">
        <p class="add-menu__title">添加</p>
        <button type="button" class="add-menu__item" :disabled="!selectedProject || isComposerBusy" @click="selectFiles"><AppIcon name="Paperclip" /><strong>引用文件</strong><small>{{ selectedProject ? '从系统中选择文件' : '请先选择项目目录' }}</small></button>
        <button type="button" class="add-menu__item" :disabled="isComposerBusy || planMode" @click="enablePlanMode"><AppIcon name="Finished" /><strong>计划模式</strong><small>{{ planMode ? '计划模式已启用' : '开启计划模式' }}</small></button>
      </section>
      <section v-else-if="composerOverlay === 'slash'" class="composer-overlay composer-overlay--slash" aria-label="输入功能">
        <div v-if="slashMenuView !== 'commands'" class="slash-menu__header"><button type="button" class="composer-icon-button" aria-label="返回功能菜单" @click="backSlashMenu"><AppIcon name="ArrowLeft" /></button><strong>{{ slashMenuTitle }}</strong></div>
        <div class="slash-menu" role="listbox" aria-label="输入功能">
          <button v-for="(option, index) in slashOptions" :key="option.id" type="button" class="slash-menu__item" :class="{ active: index === slashMenuIndex }" :disabled="option.disabled" role="option" :aria-selected="index === slashMenuIndex" @mouseenter="slashMenuIndex = index" @click="selectSlashOption(option.id)"><AppIcon :name="option.icon" /><strong>{{ option.title }}</strong><small v-if="option.description">{{ option.description }}</small><AppIcon v-if="option.active" name="Check" /></button>
          <p v-if="!slashOptions.length" class="selector-empty">{{ slashMenuEmptyText }}</p>
        </div>
      </section>
      <div v-if="composerDraft.attachments.length" class="composer__context">
        <span v-for="file in composerDraft.attachments" :key="file.path" class="composer-chip is-selected"><AppIcon name="Document" /><span>{{ file.name }}</span><button type="button" class="composer-chip__remove" :aria-label="`移除 ${file.name}`" @click="removeAttachment(file.path)"><AppIcon name="Close" /></button></span>
      </div>
      <el-input :model-value="composerDraft.text" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" resize="none" placeholder="随便问" :disabled="isComposerBusy || !!pendingQuestionInteraction" @update:model-value="setDraftText" @keydown="handleComposerKeydown" />
      <div class="composer__actions">
        <div class="composer__status">
          <button type="button" class="composer-icon-button" :class="{ 'is-active': composerOverlay === 'add' }" title="添加内容" aria-label="添加内容" :disabled="isComposerBusy" @click="toggleAddMenu"><AppIcon name="Plus" /></button>
          <span v-for="skill in activeSkills" :key="skill.id" class="composer-chip composer-chip--skill is-active"><AppIcon name="MagicStick" /><span>{{ skill.name }}</span><button type="button" class="composer-chip__remove" :aria-label="`移除 Skill ${skill.name}`" :disabled="isComposerBusy" @click="setActiveSkill(skill.id, false)"><AppIcon name="Close" /></button></span>
          <el-popover v-model:visible="permissionPickerVisible" trigger="click" placement="top-start" :width="292" :show-arrow="false" popper-class="harness-selector-popper">
            <template #reference><button type="button" class="composer-permission" :class="`is-${selectedPermissionMode}`" :disabled="isComposerBusy" :aria-label="`权限：${permissionLabel}`"><AppIcon name="Lock" /><span>{{ permissionLabel }}</span><AppIcon name="ArrowDown" /></button></template>
            <div class="permission-menu">
              <button v-for="option in availablePermissionOptions" :key="option.mode" type="button" class="permission-menu__item" :class="{ active: selectedPermissionMode === option.mode }" @click="setPermissionMode(option.mode)"><span><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span><AppIcon v-if="selectedPermissionMode === option.mode" name="Check" /></button>
            </div>
          </el-popover>
          <span v-if="planMode" class="composer-plan-mode"><AppIcon class="composer-plan-mode__icon" name="Finished" /><span>计划</span><button type="button" class="composer-plan-mode__close" aria-label="关闭计划模式" @click="closePlanMode"><AppIcon name="Close" /></button></span>
        </div>
        <div class="composer__submit">
          <el-tooltip v-if="showContextUsage && composerDraft.modelSelection" placement="top" :show-arrow="false">
            <template #content><div class="context-usage-tooltip"><strong>上下文使用情况</strong><span>{{ formatTokenCount(contextUsage.usedTokens) }} / {{ formatTokenCount(contextUsage.contextWindow) }} · {{ contextUsagePercent }}%</span><small>剩余 {{ formatTokenCount(contextUsageRemaining) }} · {{ contextUsage.source === 'reported' ? '模型实际返回' : '本地估算' }}</small></div></template>
            <span class="context-usage" :class="contextUsageState" role="img" :aria-label="`上下文已使用 ${contextUsagePercent}%`"><span class="context-usage__ring" :style="{ '--context-progress': `${contextUsagePercent * 3.6}deg` }"></span></span>
          </el-tooltip>
          <el-popover v-model:visible="modelPickerVisible" trigger="click" placement="top-end" :width="272" :show-arrow="false" popper-class="harness-selector-popper">
            <template #reference><button type="button" class="composer-model" :class="{ 'is-empty': !composerDraft.modelSelection }" :aria-label="selectedModelOption ? `模型：${selectedModelOption.modelName}` : '选择模型'"><span>{{ selectedModelOption?.modelName || '选择模型' }}</span><small v-if="selectedModelOption?.reasoning">{{ selectedThinkingLabel }}</small><AppIcon name="ArrowDown" /></button></template>
            <div v-if="modelMenuView === 'menu'" class="model-menu"><button type="button" class="model-menu__item" @click="modelMenuView = 'models'"><span>模型</span><em>{{ selectedModelOption?.modelName || '选择模型' }}</em><AppIcon name="ArrowRight" /></button><button v-if="selectedModelOption?.reasoning" type="button" class="model-menu__item" @click="modelMenuView = 'effort'"><span>推理强度</span><em>{{ selectedThinkingLabel }}</em><AppIcon name="ArrowRight" /></button><p v-if="!modelOptions.length" class="selector-empty">没有可用模型，请先完成模型配置</p></div>
            <div v-else-if="modelMenuView === 'models'" class="selector-panel model-menu__panel"><div class="selector-panel__header"><button type="button" class="composer-icon-button" aria-label="返回模型设置" @click="modelMenuView = 'menu'"><AppIcon name="ArrowLeft" /></button><strong>模型</strong></div><div class="selector-panel__list"><button v-for="option in modelOptions" :key="option.value" type="button" class="selector-option" :class="{ active: option.value === selectedModelOption?.value }" @click="setModelSelection(option.value)"><span>{{ option.modelName }}</span><AppIcon v-if="option.value === selectedModelOption?.value" name="Check" /></button><p v-if="!modelOptions.length" class="selector-empty">没有可用模型，请先完成模型配置</p></div></div>
            <div v-else class="selector-panel model-menu__panel"><div class="selector-panel__header"><button type="button" class="composer-icon-button" aria-label="返回模型设置" @click="modelMenuView = 'menu'"><AppIcon name="ArrowLeft" /></button><strong>推理强度</strong></div><div class="selector-panel__list"><button v-for="option in thinkingOptions" :key="option.value" type="button" class="selector-option" :class="{ active: selectedThinkingLevel === option.value }" @click="setThinkingLevel(option.value)"><span>{{ option.label }}</span><AppIcon v-if="selectedThinkingLevel === option.value" name="Check" /></button></div></div>
          </el-popover>
          <el-tooltip v-if="store.running" content="停止生成" placement="top"><button type="button" class="composer__send is-stop" aria-label="停止生成" @click="dispatch({ type: 'abort' })"><AppIcon name="VideoPause" /></button></el-tooltip>
          <el-tooltip v-else :content="composerDraft.modelSelection ? '发送消息' : '请先选择模型'" placement="top"><button type="button" class="composer__send" aria-label="发送消息" :disabled="isComposerBusy || !composerDraft.text.trim() || !composerDraft.modelSelection || !!pendingQuestionInteraction" @click="send"><AppIcon name="Top" /></button></el-tooltip>
        </div>
      </div>
    </div>
  </footer>

  <el-dialog v-model="fullAccessConfirmVisible" class="full-access-dialog" width="min(460px, calc(100vw - 32px))" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" align-center>
    <template #header><div class="full-access-dialog__header"><AppIcon name="WarningFilled" /><h2>确认允许完全访问?</h2></div></template>
    <p class="full-access-dialog__copy">开启允许完全访问后，Mira 将减少确认步骤，并可直接执行更多操作，包括敏感操作、文件修改或外部执行。<br>仅建议在您信任当前任务时使用。</p>
    <el-checkbox v-model="fullAccessAcknowledged" class="full-access-dialog__ack">我已了解风险，并愿意继续</el-checkbox>
    <template #footer><div class="full-access-dialog__footer"><el-button @click="fullAccessConfirmVisible = false">取消</el-button><el-button type="danger" :disabled="!fullAccessAcknowledged" @click="confirmFullAccess">允许完全访问</el-button></div></template>
  </el-dialog>

  <el-dialog v-model="createGitBranchVisible" class="git-branch-dialog" width="min(460px, calc(100vw - 32px))" :show-close="false" align-center>
    <template #header><div class="git-branch-dialog__header"><h2>创建并检出分支</h2><button type="button" aria-label="关闭创建分支" @click="createGitBranchVisible = false"><AppIcon name="Close" /></button></div></template>
    <label class="git-branch-dialog__label" for="git-branch-name"><span>分支名称</span><button type="button" @click="openGitSettings">设置前缀</button></label>
    <el-input id="git-branch-name" v-model="newGitBranchName" autofocus placeholder="输入分支名称" @keyup.enter="createGitBranch" />
    <p v-if="newGitBranchError" class="git-branch-dialog__error">{{ newGitBranchError }}</p>
    <template #footer><div class="git-branch-dialog__footer"><el-button @click="createGitBranchVisible = false">关闭</el-button><el-button type="primary" :loading="gitBranchWorking" :disabled="Boolean(newGitBranchError)" @click="createGitBranch">创建并检出</el-button></div></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_HARNESS_GIT_CONFIG, shouldSendWithShortcut, type HarnessContextUsage, type HarnessFileReference, type HarnessGitBranch, type HarnessGitConfig, type HarnessSkill, type ModelProviderSummary, type PermissionConfig, type PermissionMode, type SendShortcut, type ThinkingLevel } from '@/config/harness'
import { getPreference } from '@/platform'
import { useHarnessStore } from '@/stores/harness'
import { clearSlashCommand, createHarnessSendAction, mergeHarnessAttachments, slashCommandQuery } from '../harnessComposerActions'
import type { HarnessComposerDispatch } from '../useHarnessPageFacade'
import PlanClarificationWizard from './PlanClarificationWizard.vue'
import PlanReviewPanel from './PlanReviewPanel.vue'

type SlashMenuView = 'commands' | 'mcp' | 'thinking' | 'models' | 'permissions' | 'skills'
type SlashOption = { id: string, title: string, description?: string, icon: string, active?: boolean, disabled?: boolean }
type McpServer = { id: string, name: string, command: string, args: string[], enabled: boolean }
const props = defineProps<{ draftKey: string, isPersistedSession: boolean, providers: ModelProviderSummary[], skills: HarnessSkill[], mcpServers: McpServer[], memoryEnabled: boolean, permissionConfig: PermissionConfig, interactionSubmitting: boolean, dispatch: HarnessComposerDispatch }>()
const planMode = defineModel<boolean>('planMode', { required: true })
const store = useHarnessStore()
const composerOverlay = ref<'add' | 'slash'>()
const projectPickerVisible = ref(false)
const gitPickerVisible = ref(false)
const createGitBranchVisible = ref(false)
const modelPickerVisible = ref(false)
const permissionPickerVisible = ref(false)
const slashMenuView = ref<SlashMenuView>('commands')
const slashMenuIndex = ref(0)
const modelMenuView = ref<'menu' | 'models' | 'effort'>('menu')
const projectQuery = ref('')
const gitBranchQuery = ref('')
const gitBranches = ref<HarnessGitBranch[]>([])
const gitBranchesLoading = ref(false)
const gitBranchWorking = ref(false)
const newGitBranchName = ref('')
const gitConfig = ref<HarnessGitConfig>({ ...DEFAULT_HARNESS_GIT_CONFIG })
const localSkills = ref([...props.skills])
const localMcpServers = ref<McpServer[]>(props.mcpServers.map(server => ({ ...server, args: [...server.args] })))
const localMemoryEnabled = ref(props.memoryEnabled)
const fullAccessConfirmVisible = ref(false)
const fullAccessAcknowledged = ref(false)

watch(() => props.skills, value => { localSkills.value = [...value] })
watch(() => props.mcpServers, value => { localMcpServers.value = value.map(server => ({ ...server, args: [...server.args] })) })
watch(() => props.memoryEnabled, value => { localMemoryEnabled.value = value })
watch(modelPickerVisible, visible => { if (!visible) modelMenuView.value = 'menu' })

const composerDraft = computed(() => store.drafts[props.draftKey] || { text: '', attachments: [], updatedAt: 0 })
const pendingQuestionInteraction = computed(() => store.activeInteraction?.kind === 'question' && store.activeInteraction.status === 'waiting' ? store.activeInteraction : undefined)
const confirmPlanPending = computed(() => store.activePlan?.status === 'awaiting_confirmation')
const projectId = computed(() => store.activeSession?.projectId || composerDraft.value.projectId)
const selectedProject = computed(() => store.projects.find(project => project.id === projectId.value))
const showProjectPicker = computed(() => !props.isPersistedSession)
const showGitPicker = computed(() => showProjectPicker.value && Boolean(selectedProject.value?.isGitRepository))
const filteredProjects = computed(() => { const query = projectQuery.value.trim().toLocaleLowerCase(); return query ? store.projects.filter(project => project.name.toLocaleLowerCase().includes(query) || project.directory.toLocaleLowerCase().includes(query)) : store.projects })
const filteredGitBranches = computed(() => { const query = gitBranchQuery.value.trim().toLocaleLowerCase(); return query ? gitBranches.value.filter(branch => branch.name.toLocaleLowerCase().includes(query)) : gitBranches.value })
const newGitBranchError = computed(() => { const name = newGitBranchName.value.trim(); if (!name) return '请输入分支名称。'; if (name.endsWith('/')) return '分支名不能以“/”结尾。'; if (/[\s~^:?*[\\]/.test(name) || name.includes('//') || name.includes('..') || name.includes('@{') || /(?:^|\/)\.|\.lock(?:\/|$)/.test(name)) return '分支名称无效。'; if (gitBranches.value.some(branch => branch.name === name)) return '分支已存在。'; return '' })
const permissionOptions: Array<{ mode: PermissionMode, label: string, description: string }> = [{ mode: 'default', label: '默认权限', description: '敏感操作逐次确认' }, { mode: 'auto-approve', label: '自动审核', description: '项目内操作自动批准' }, { mode: 'full', label: '完全访问', description: '不再显示操作确认' }]
const selectedPermissionMode = computed<PermissionMode>(() => store.activeSession?.permissionMode || composerDraft.value.permissionMode || props.permissionConfig.globalDefaultMode)
const permissionLabel = computed(() => permissionOptions.find(option => option.mode === selectedPermissionMode.value)?.label || '默认权限')
const availablePermissionOptions = computed(() => permissionOptions.filter(option => option.mode === 'default' || (option.mode === 'auto-approve' && props.permissionConfig.autoApproveEnabled) || (option.mode === 'full' && props.permissionConfig.fullAccessEnabled)))
const enabledSkills = computed(() => localSkills.value.filter(skill => skill.valid && skill.enabled))
const activeSkillIds = computed(() => store.activeSession?.activeSkillIds || composerDraft.value.activeSkillIds || [])
const activeMcpServerIds = computed(() => store.activeSession?.activeMcpServerIds || composerDraft.value.activeMcpServerIds || [])
const activeSkills = computed(() => enabledSkills.value.filter(skill => activeSkillIds.value.includes(skill.id)))
const delegationEnabled = computed(() => store.activeSession?.delegationEnabled !== false)
const modelOptions = computed(() => props.providers.filter(provider => provider.enabled && provider.hasApiKey).flatMap(provider => provider.models.map(modelId => ({ value: `${provider.id}:${modelId}`, modelName: modelId, reasoning: provider.reasoning, contextWindow: provider.contextWindow }))))
const selectedModelOption = computed(() => modelOptions.value.find(option => option.value === `${composerDraft.value.modelSelection?.providerId}:${composerDraft.value.modelSelection?.modelId}`))
const thinkingOptions: Array<{ value: ThinkingLevel, label: string }> = [{ value: 'off', label: '关闭' }, { value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }]
const selectedThinkingLevel = computed<ThinkingLevel>(() => composerDraft.value.modelSelection?.thinkingLevel || 'medium')
const selectedThinkingLabel = computed(() => thinkingOptions.find(option => option.value === selectedThinkingLevel.value)?.label || '中')
const isComposerBusy = computed(() => store.running || store.rendering)
const showContextUsage = computed(() => getPreference('showContextUsage', true))
const sendShortcut = computed<SendShortcut>(() => getPreference<SendShortcut>('sendShortcut', 'mod-enter') === 'enter' ? 'enter' : 'mod-enter')
const contextUsage = computed<HarnessContextUsage>(() => { const stored = store.activeSession?.context?.usage; const contextWindow = selectedModelOption.value?.contextWindow || stored?.contextWindow || DEFAULT_CONTEXT_WINDOW; return stored ? { ...stored, contextWindow } : { usedTokens: 0, contextWindow, source: 'estimated', updatedAt: Date.now() } })
const contextUsagePercent = computed(() => Math.min(100, Math.round(contextUsage.value.usedTokens / Math.max(1, contextUsage.value.contextWindow) * 100)))
const contextUsageRemaining = computed(() => Math.max(0, contextUsage.value.contextWindow - contextUsage.value.usedTokens))
const contextUsageState = computed(() => contextUsagePercent.value >= 95 ? 'is-critical' : contextUsagePercent.value >= 80 ? 'is-warning' : 'is-normal')
const slashQuery = computed(() => slashCommandQuery(composerDraft.value.text)?.trim().toLocaleLowerCase())
const canSaveProjectMemory = computed(() => localMemoryEnabled.value && Boolean(selectedProject.value))
const slashCommands = computed<SlashOption[]>(() => { const commands: SlashOption[] = [{ id: 'mcp', title: 'MCP', description: '显示 MCP 服务器状态', icon: 'Paperclip' }, { id: 'thinking', title: '推理', description: selectedModelOption.value ? (selectedModelOption.value.reasoning ? selectedThinkingLabel.value : '关闭') : '未选择模型', icon: 'Cpu' }, { id: 'models', title: '模型', description: selectedModelOption.value?.modelName || '未选择模型', icon: 'Cpu' }, { id: 'plan', title: '计划模式', description: planMode.value ? '关闭计划模式' : '先分析和确认方案', icon: 'Finished' }, { id: 'delegation', title: '子任务委派', description: delegationEnabled.value ? '已启用' : '已关闭', icon: 'Connection' }, { id: 'permissions', title: '权限', description: permissionLabel.value, icon: 'Lock' }, { id: 'skills', title: 'Skill', description: '选择已启用 Skill', icon: 'MagicStick' }]; if (canSaveProjectMemory.value) commands.splice(4, 0, { id: 'memory', title: '记忆', icon: 'Document' }); const query = slashQuery.value || ''; return commands.filter(command => !query || `${command.title} ${command.description || ''}`.toLocaleLowerCase().includes(query)) })
const slashOptions = computed<SlashOption[]>(() => { if (slashMenuView.value === 'commands') return slashCommands.value; if (slashMenuView.value === 'mcp') return localMcpServers.value.map(server => ({ id: server.id, title: server.name, description: server.enabled ? undefined : '已停用', icon: 'Connection', active: activeMcpServerIds.value.includes(server.id), disabled: !server.enabled })); if (slashMenuView.value === 'thinking') return thinkingOptions.map(option => ({ id: option.value, title: option.label, icon: 'Cpu', active: selectedThinkingLevel.value === option.value, disabled: !selectedModelOption.value?.reasoning })); if (slashMenuView.value === 'models') return modelOptions.value.map(option => ({ id: option.value, title: option.modelName, icon: 'Cpu', active: option.value === selectedModelOption.value?.value })); if (slashMenuView.value === 'permissions') return availablePermissionOptions.value.map(option => ({ id: option.mode, title: option.label, description: option.description, icon: 'Lock', active: option.mode === selectedPermissionMode.value })); return enabledSkills.value.map(skill => ({ id: skill.id, title: skill.name, description: skill.description, icon: 'MagicStick', active: activeSkillIds.value.includes(skill.id) })) })
const slashMenuTitle = computed(() => ({ mcp: 'MCP', thinking: '推理', models: '模型', permissions: '权限', skills: 'Skill' } as Partial<Record<SlashMenuView, string>>)[slashMenuView.value] || '')
const slashMenuEmptyText = computed(() => ({ mcp: '没有配置 MCP 服务。', models: '没有可用模型，请先完成模型配置。', skills: '没有已启用的 Skill。' } as Partial<Record<SlashMenuView, string>>)[slashMenuView.value] || '没有可用选项。')

async function dispatch(action: Parameters<HarnessComposerDispatch>[0]) { return props.dispatch(action) }
async function refreshSlashData() { const data = await dispatch({ type: 'refresh-composer-data' }) as { skills: HarnessSkill[], mcpServers: McpServer[], memoryEnabled: boolean } | undefined; if (!data) return; localSkills.value = data.skills; localMcpServers.value = data.mcpServers; localMemoryEnabled.value = data.memoryEnabled }
function setDraftText(value: string) { void dispatch({ type: 'update-draft', patch: { text: value } }); if (isComposerBusy.value || slashCommandQuery(value) === undefined) { if (composerOverlay.value === 'slash') closeSlashMenu(false); return }; composerOverlay.value = 'slash'; slashMenuView.value = 'commands'; slashMenuIndex.value = 0; void refreshSlashData() }
function closeSlashMenu(clearTrigger = true) { composerOverlay.value = undefined; slashMenuView.value = 'commands'; slashMenuIndex.value = 0; if (clearTrigger) setDraftText(clearSlashCommand(composerDraft.value.text)) }
function closeComposerOverlay() { if (composerOverlay.value === 'slash') closeSlashMenu(); else composerOverlay.value = undefined }
function backSlashMenu() { slashMenuView.value = 'commands'; slashMenuIndex.value = 0 }
function toggleAddMenu() { composerOverlay.value = composerOverlay.value === 'add' ? undefined : 'add' }
function moveSlashMenuIndex(direction: 1 | -1) { const options = slashOptions.value; if (!options.some(option => !option.disabled)) return; let index = slashMenuIndex.value; do { index = (index + direction + options.length) % options.length } while (options[index].disabled); slashMenuIndex.value = index }
function handleComposerKeydown(event: KeyboardEvent) { if (composerOverlay.value === 'slash') { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); slashMenuView.value === 'commands' ? closeSlashMenu() : backSlashMenu(); return }; if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); moveSlashMenuIndex(event.key === 'ArrowDown' ? 1 : -1); return }; if (event.key === ' ' && !event.isComposing) { const option = slashOptions.value[slashMenuIndex.value]; if (option) { event.preventDefault(); void selectSlashOption(option.id) }; return } }; if (shouldSendWithShortcut(sendShortcut.value, event)) { event.preventDefault(); void send() } }
function formatTokenCount(value: number) { if (value < 1000) return `${value}`; if (value >= 1000000 && value % 1000000 === 0) return `${value / 1000000}M`; return `${value >= 100000 ? Math.round(value / 1000) : Math.round(value / 100) / 10}K` }
async function selectProject(projectId?: string) { await dispatch({ type: 'select-project', projectId }); closeComposerOverlay(); projectPickerVisible.value = false }
async function refreshProjectPicker() { projectQuery.value = ''; await dispatch({ type: 'refresh-projects' }) }
function createProjectFromPicker() { closeComposerOverlay(); projectPickerVisible.value = false; void dispatch({ type: 'create-project' }) }
async function setPermissionMode(permissionMode: PermissionMode, confirmed = false) { if (isComposerBusy.value || selectedPermissionMode.value === permissionMode) { permissionPickerVisible.value = false; return }; if (permissionMode === 'full' && !confirmed) { permissionPickerVisible.value = false; fullAccessAcknowledged.value = false; fullAccessConfirmVisible.value = true; return }; try { await dispatch({ type: 'set-permission', permissionMode }); permissionPickerVisible.value = false } catch (error) { ElMessage.error(error instanceof Error ? error.message : '权限切换失败') } }
async function confirmFullAccess() { if (!fullAccessAcknowledged.value) return; fullAccessConfirmVisible.value = false; await setPermissionMode('full', true) }
async function setActiveSkill(id: string, enabled: boolean) { try { return await dispatch({ type: 'set-skill', id, enabled }) } catch (error) { ElMessage.error(error instanceof Error ? error.message : '更新 Skill 失败'); return false } }
function setModelSelection(value: string) { const [providerId, ...parts] = value.split(':'); const modelId = parts.join(':'); if (!providerId || !modelId) return; const option = modelOptions.value.find(item => item.value === value); void dispatch({ type: 'set-model', providerId, modelId, thinkingLevel: option?.reasoning ? 'medium' : undefined }); modelPickerVisible.value = false }
function setThinkingLevel(thinkingLevel: ThinkingLevel) { const current = composerDraft.value.modelSelection; if (!current || !selectedModelOption.value?.reasoning) return; void dispatch({ type: 'set-model', ...current, thinkingLevel }); modelPickerVisible.value = false }
async function selectFiles() { const project = selectedProject.value; if (!project) return; closeComposerOverlay(); try { const selected = await dispatch({ type: 'select-files', projectId: project.id }) as HarnessFileReference[]; const attachments = mergeHarnessAttachments(composerDraft.value.attachments, selected); if (attachments.length !== composerDraft.value.attachments.length) await dispatch({ type: 'update-draft', patch: { attachments } }) } catch (error) { ElMessage.error(error instanceof Error ? error.message : '选择引用文件失败') } }
async function refreshGitBranches() { const project = selectedProject.value; if (!project?.isGitRepository) { gitBranches.value = []; return }; gitBranchQuery.value = ''; gitBranchesLoading.value = true; try { gitBranches.value = await dispatch({ type: 'list-git-branches', projectId: project.id }) as HarnessGitBranch[] } catch (error) { gitBranches.value = []; ElMessage.error(error instanceof Error ? error.message : '加载 Git 分支失败') } finally { gitBranchesLoading.value = false } }
async function checkoutGitBranch(branchName: string) { const project = selectedProject.value; if (!project || gitBranchWorking.value) return; gitBranchWorking.value = true; try { gitBranches.value = await dispatch({ type: 'checkout-git-branch', projectId: project.id, branchName }) as HarnessGitBranch[]; ElMessage.success(`已切换到 ${branchName}`) } catch (error) { ElMessage.error(error instanceof Error ? error.message : '切换 Git 分支失败') } finally { gitBranchWorking.value = false } }
async function openCreateGitBranchDialog() { gitPickerVisible.value = false; try { gitConfig.value = await dispatch({ type: 'get-git-config' }) as HarnessGitConfig } catch { gitConfig.value = { ...DEFAULT_HARNESS_GIT_CONFIG } }; newGitBranchName.value = gitConfig.value.branchPrefix; createGitBranchVisible.value = true }
async function createGitBranch() { const project = selectedProject.value; const branchName = newGitBranchName.value.trim(); if (!project || gitBranchWorking.value || newGitBranchError.value) return; gitBranchWorking.value = true; try { gitBranches.value = await dispatch({ type: 'create-git-branch', projectId: project.id, branchName }) as HarnessGitBranch[]; createGitBranchVisible.value = false; ElMessage.success(`已创建并检出 ${branchName}`) } catch (error) { ElMessage.error(error instanceof Error ? error.message : '创建 Git 分支失败') } finally { gitBranchWorking.value = false } }
function openGitSettings() { createGitBranchVisible.value = false; void dispatch({ type: 'open-git-settings' }) }
function enablePlanMode() { planMode.value = true; closeComposerOverlay() }
async function closePlanMode() { planMode.value = false; const plan = store.activePlan; if (plan && ['planning', 'awaiting_input', 'awaiting_confirmation'].includes(plan.status)) await dispatch({ type: 'cancel-plan' }).catch(() => undefined) }
async function saveCurrentProjectMemory() { try { await dispatch({ type: 'save-memory', selection: composerDraft.value.modelSelection ? { ...composerDraft.value.modelSelection } : undefined }) } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存项目记忆失败') } }
async function selectSlashOption(id: string) { if (isComposerBusy.value || slashOptions.value.find(option => option.id === id)?.disabled) return; if (slashMenuView.value === 'commands') { if (id === 'plan') { planMode.value = !planMode.value; closeSlashMenu(); return }; if (id === 'memory') { const hasConversation = Boolean(store.activeSession?.messages.some(message => message.role === 'user') && store.activeSession.messages.some(message => message.role === 'assistant')); if (hasConversation) { closeSlashMenu(); await saveCurrentProjectMemory() } else { setDraftText(`${clearSlashCommand(composerDraft.value.text)}请将以下内容保存为项目级记忆：`); closeSlashMenu(false) }; return }; if (id === 'delegation') { await dispatch({ type: 'set-delegation', enabled: !delegationEnabled.value }); closeSlashMenu(); return }; if (id === 'mcp' || id === 'thinking' || id === 'models' || id === 'permissions' || id === 'skills') { slashMenuView.value = id; slashMenuIndex.value = 0; if (id === 'mcp' || id === 'skills') void refreshSlashData() }; return }; if (slashMenuView.value === 'mcp') { await dispatch({ type: 'set-mcp', id, enabled: !activeMcpServerIds.value.includes(id) }); return }; if (slashMenuView.value === 'models') { setModelSelection(id); closeSlashMenu(); return }; if (slashMenuView.value === 'thinking') { setThinkingLevel(id as ThinkingLevel); closeSlashMenu(); return }; if (slashMenuView.value === 'permissions') { await setPermissionMode(id as PermissionMode); closeSlashMenu(); return }; const skill = enabledSkills.value.find(item => item.id === id); if (skill && await setActiveSkill(skill.id, true)) { setDraftText(clearSlashCommand(composerDraft.value.text)); closeSlashMenu(false) } }
async function handleFileDrop(event: DragEvent) { const files = Array.from(event.dataTransfer?.files || []); if (!files.length) return; const project = selectedProject.value; if (!project) { ElMessage.info('请先选择项目后再拖入文件'); return }; const dir = project.directory.replace(/[\\/]+$/, '').replace(/\\/g, '/'); let attachments = mergeHarnessAttachments([], composerDraft.value.attachments); for (const file of files) { const rawPath = await dispatch({ type: 'resolve-file-path', file }) as string; const absolute = rawPath.replace(/\\/g, '/'); if (!absolute) { ElMessage.warning(`无法读取文件路径：${file.name}`); continue }; if (!absolute.startsWith(`${dir}/`)) { ElMessage.warning(`文件不在项目目录内：${file.name}`); continue }; const path = absolute.slice(dir.length + 1); const next = mergeHarnessAttachments(attachments, [{ path, name: file.name }]); if (!path || next.length === attachments.length) continue; attachments = next; await dispatch({ type: 'update-draft', patch: { attachments } }); ElMessage.success(`已引用 ${file.name}`) } }
function removeAttachment(path: string) { void dispatch({ type: 'update-draft', patch: { attachments: composerDraft.value.attachments.filter(file => file.path !== path) } }) }
function send() { const selection = composerDraft.value.modelSelection; if (!selection) return; const payload = createHarnessSendAction({ text: composerDraft.value.text.trim(), attachments: composerDraft.value.attachments, activeSkillIds: activeSkillIds.value, activeMcpServerIds: activeMcpServerIds.value, projectId: composerDraft.value.projectId, permissionMode: selectedPermissionMode.value, modelSelection: selection, planning: planMode.value }); void dispatch({ type: 'send', payload }) }
function confirmPlan() { void dispatch({ type: 'confirm-plan' }) }
function answerPlanQuestions(answers: import('@/config/harness').HarnessUserAnswer[]) { void dispatch({ type: 'answer-plan-questions', answers: answers.map(answer => ({ ...answer })) }) }
function cancelPlan() { void dispatch({ type: 'cancel-plan' }) }
watch(slashOptions, options => { if (slashMenuIndex.value >= options.length) slashMenuIndex.value = 0 })
</script>

<style scoped lang="scss">
.composer-shell { position: relative; z-index: 4; padding: 0 clamp(14px, 4vw, 48px) 20px; background: var(--cp-bg); }
.composer-toolbar { display: flex; width: min(100%, 760px); min-height: 42px; align-items: center; gap: 4px; margin: 0 auto -1px; padding: 0 8px 0 12px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 84%, transparent); border-bottom: 0; border-radius: 14px 14px 0 0; color: var(--cp-text-secondary); background: color-mix(in srgb, var(--cp-bg-hover) 68%, var(--cp-bg)); }
.composer-toolbar__item { display: inline-flex; min-width: 0; align-items: center; gap: 7px; color: inherit; font-size: 13px; }
.composer-toolbar__project-control { position: relative; display: inline-flex; min-width: 0; max-width: min(100%, 360px); height: 34px; align-items: center; border-radius: 18px; transition: background $transition-fast; }
.composer-toolbar__project-control:hover { background: var(--cp-sidebar-menu-active-bg); }
.composer-toolbar__project { width: 100%; min-width: 0; padding: 0 10px; border: 0; border-radius: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.composer-toolbar__project:hover { color: var(--cp-text); }
.composer-toolbar__project-icon { flex: 0 0 auto; transition: opacity $transition-fast; }
.composer-toolbar__project-control.has-project:hover .composer-toolbar__project-icon { opacity: 0; }
.composer-toolbar__label { overflow: hidden; color: var(--cp-text); text-overflow: ellipsis; white-space: nowrap; font-size:12px; }
.composer-toolbar__chevron { color: var(--cp-text-tertiary); font-size: 13px; }
.composer-toolbar__clear { position: absolute; z-index: 1; top: 50%; left: 6px; display: grid; width: 24px; height: 24px; place-items: center; padding: 0; border: 0; border-radius: 50%; color: var(--cp-text-secondary); background: transparent; cursor: pointer; opacity: 0; pointer-events: none; transform: translateY(-50%); transition: color $transition-fast, background $transition-fast, opacity $transition-fast; }
.composer-toolbar__project-control.has-project:hover .composer-toolbar__clear { opacity: 1; pointer-events: auto; }
.composer-toolbar__clear:hover { color: var(--cp-text); background: color-mix(in srgb, var(--cp-text) 10%, transparent); }
.composer-toolbar__divider { width: 1px; height: 16px; flex: 0 0 auto; margin: 0 4px; background: var(--cp-border-light); }
.composer-toolbar__git { max-width: min(100%, 260px); height: 34px; padding: 0 10px; border: 0; border-radius: 18px; color: var(--cp-text-secondary); background: transparent; font: inherit; text-align: left; cursor: pointer; transition: background $transition-fast; }
.composer-toolbar__git:hover { background: var(--cp-sidebar-menu-active-bg); }
.composer-toolbar__git .composer-toolbar__label { color: var(--cp-text-secondary); font-size: 12px; font-weight: 400; }
.composer { position: relative; z-index: 21; width: min(100%, 800px); min-height: 122px; margin: 0 auto; padding: 12px 14px 10px; border: 1px solid color-mix(in srgb, var(--cp-border) 88%, transparent); border-radius: $radius-lg; box-shadow: 0 8px 22px rgb(24 24 27 / 7%); transition: border-color $transition-fast, box-shadow $transition-fast; }
.composer:focus-within { box-shadow: 0 10px 25px rgb(24 24 27 / 10%); }
.composer__context { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 0; margin-bottom: 8px; }
.composer-chip { display: inline-flex; align-items: center; min-width: 0; max-width: 220px; gap: 5px; padding: 3px 7px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 84%, transparent); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-size: 12px; line-height: 20px; }
.composer-chip--skill.is-active { color: var(--cp-primary); border-color: color-mix(in srgb, var(--cp-primary) 45%, var(--cp-border)); background: color-mix(in srgb, var(--cp-primary) 10%, var(--cp-bg)); }.composer-chip--skill .composer-chip__remove { display: inline-flex; align-items: center; color: var(--cp-primary); }
.composer-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer-chip.is-selected { color: var(--cp-text); }
.composer-chip__remove { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 18px; height: 18px; margin-left: 1px; padding: 0; border: 0; border-radius: $radius-sm; color: inherit; background: transparent; cursor: pointer; }
.composer-chip__remove:hover { background: var(--cp-hover-bg); }
.composer-plan-mode { position: relative; display: inline-flex; height: 34px; align-items: center; gap: 5px; padding: 0 10px; border-radius: 18px; color: var(--cp-primary); font-size: 12px; line-height: 20px; transition: color $transition-fast, background $transition-fast; }
.composer-plan-mode:hover, .composer-plan-mode:focus-within { background: var(--cp-sidebar-menu-active-bg); }
.composer-plan-mode__icon { transition: opacity $transition-fast; }
.composer-plan-mode:hover .composer-plan-mode__icon, .composer-plan-mode:focus-within .composer-plan-mode__icon { opacity: 0; }
.composer-plan-mode__close { position: absolute; top: 50%; left: 4px; display: grid; width: 24px; height: 24px; place-items: center; padding: 0; border: 0; border-radius: 50%; color: var(--cp-primary); background: transparent; cursor: pointer; opacity: 0; pointer-events: none; transform: translateY(-50%); transition: color $transition-fast, background $transition-fast, opacity $transition-fast; }
.composer-plan-mode:hover .composer-plan-mode__close, .composer-plan-mode:focus-within .composer-plan-mode__close { opacity: 1; pointer-events: auto; }
.composer-plan-mode__close:hover { color: var(--cp-text); background: color-mix(in srgb, var(--cp-text) 10%, transparent); }
.composer :deep(.el-textarea__inner) { min-height: 62px !important; padding: 4px 0; border: 0; border-radius: 0; box-shadow: none !important; color: var(--cp-text); background: transparent; font-size: 14px; line-height: 1.65; }
.composer :deep(.el-textarea__inner::placeholder) { color: var(--cp-text-tertiary); }
.composer__actions, .composer__status, .composer__submit { display: flex; align-items: center; }
.composer__actions { justify-content: space-between; min-height: 32px; margin-top: 6px; gap: 10px; }
.composer__status, .composer__submit { min-width: 0; gap: 9px; }
.composer__submit { margin-left: auto; }
.composer-icon-button, .composer__send { display: grid; flex: 0 0 auto; width: 30px; height: 30px; place-items: center; padding: 0; border: 0; border-radius: 50%; color: var(--cp-text-secondary); background: transparent; cursor: pointer; transition: color $transition-fast, background $transition-fast, transform $transition-fast; }
.composer-icon-button:hover { color: var(--cp-text); background: var(--cp-bg-hover); }
.composer-permission { display: inline-flex; height: 34px; align-items: center; gap: 5px; min-width: 0; padding: 0 10px; border: 0; border-radius: 18px; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 11px; white-space: nowrap; cursor: pointer; transition: color $transition-fast, background $transition-fast; }.composer-permission:hover:not(:disabled) { color: var(--cp-text); background: var(--cp-sidebar-menu-active-bg); }.composer-permission:disabled { cursor: default; }.composer-permission > .app-icon:last-child { font-size: 10px; }.composer-permission.is-auto-approve { color: var(--cp-primary); }.composer-permission.is-full { color: var(--cp-danger); }
.composer-model { display: inline-flex; height: 34px; align-items: center; min-width: 0; max-width: min(290px, 38vw); gap: 5px; padding: 0 10px; border: 0; border-radius: 18px; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 12px; cursor: pointer; transition: color $transition-fast, background $transition-fast; }
.composer-model span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.composer-model small { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 11px; }.composer-model .app-icon { flex: 0 0 auto; font-size: 12px; }.composer-model:hover { color: var(--cp-text); background: var(--cp-sidebar-menu-active-bg); }.composer-model.is-empty { color: var(--cp-danger); }
.context-usage { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 24px; height: 24px; color: var(--cp-primary); }
.context-usage__ring { position: relative; display: grid; width: 18px; height: 18px; place-items: center; border-radius: 50%; background: conic-gradient(currentColor var(--context-progress), var(--cp-border-light) 0); }
.context-usage__ring::before { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: var(--cp-bg); content: ''; }
.context-usage.is-warning { color: var(--cp-warning); }.context-usage.is-critical { color: var(--cp-danger); }
.composer__send { color: var(--cp-bg-elevated); background: var(--cp-text); }.composer__send:hover:not(:disabled) { transform: translateY(-1px); }.composer__send:disabled { color: var(--cp-text-tertiary); background: var(--cp-bg-hover); cursor: not-allowed; }.composer__send.is-stop { color: var(--cp-danger); border: 1px solid color-mix(in srgb, var(--cp-danger) 48%, var(--cp-border)); background: transparent; }
</style>

<style lang="scss">
.harness-selector-popper.el-popover.el-popper { padding: 8px; border: 1px solid var(--cp-border); border-radius: $radius-md; background: var(--cp-bg-overlay); box-shadow: 0 12px 24px rgb(0 0 0 / 12%); }
.add-menu, .model-menu, .selector-panel { display: flex; flex-direction: column; gap: 4px; }.add-menu__title { margin: 3px 8px 4px; color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.4; }.add-menu__item { display: grid; grid-template-columns: 18px auto minmax(0, 1fr); align-items: center; min-height: 36px; gap: 8px; padding: 4px 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }.add-menu__item strong { font-size: 12px; font-weight: 500; white-space: nowrap; }.add-menu__item small { justify-self: end; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }.add-menu__item:hover:not(:disabled) { background: var(--cp-bg-hover); }.add-menu__item:disabled { color: var(--cp-text-tertiary); cursor: not-allowed; opacity: .64; }
.composer-overlay__backdrop { position: fixed; inset: 0; z-index: 20; }
.composer-overlay { position: absolute; right: -1px; bottom: calc(100% + 8px); left: -1px; z-index: 1; display: flex; box-sizing: border-box; max-height: min(390px, calc(100dvh - 180px)); flex-direction: column; gap: 4px; padding: 6px; overflow: auto; border: 1px solid color-mix(in srgb, var(--cp-border) 78%, transparent); border-radius: $radius-md; background: var(--cp-bg-overlay, var(--cp-bg)); box-shadow: 0 12px 28px rgb(24 24 27 / 16%); }
.slash-menu__header { display: flex; align-items: center; min-height: 32px; gap: 4px; padding: 0 2px; }.slash-menu__header strong { color: var(--cp-text); font-size: 12px; font-weight: 600; }.slash-menu { display: flex; min-height: 36px; flex-direction: column; gap: 2px; overflow-y: auto; }.slash-menu__item { display: grid; width: 100%; grid-template-columns: 18px auto minmax(0, 1fr) 16px; align-items: center; min-height: 36px; gap: 8px; padding: 4px 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }.slash-menu__item strong { min-width: 0; font-weight: 500; white-space: nowrap; }.slash-menu__item small { justify-self: end; min-width: 0; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }.slash-menu__item > .app-icon:first-child { color: var(--cp-text-secondary); }.slash-menu__item > .app-icon:last-child { justify-self: end; color: var(--cp-primary); font-size: 13px; }.slash-menu__item:hover:not(:disabled), .slash-menu__item.active { background: var(--cp-bg-hover); }.slash-menu__item:disabled { color: var(--cp-text-tertiary); cursor: not-allowed; opacity: .62; }
.selector-panel { gap: 8px; }.selector-panel__header { display: flex; align-items: center; min-height: 30px; gap: 6px; }.selector-panel__header strong { color: var(--cp-text); font-size: 13px; font-weight: 600; }.selector-panel__list { display: flex; max-height: 220px; flex-direction: column; gap: 2px; overflow-y: auto; }.selector-panel__list--files { min-height: 76px; }.selector-option { display: flex; align-items: center; min-height: 32px; gap: 8px; padding: 0 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }.selector-option > span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.selector-option:hover, .selector-option.active { background: var(--cp-bg-hover); }.selector-option > .app-icon:last-child { flex: 0 0 auto; color: var(--cp-primary); }.selector-option--new { margin-top: 2px; border-top: 1px solid var(--cp-border-light); color: var(--cp-text-secondary); }.selector-option--new:hover { color: var(--cp-text); }.selector-empty { margin: 10px 8px; color: var(--cp-text-tertiary); font-size: 12px; }
.model-menu__item { display: grid; grid-template-columns: minmax(48px, auto) minmax(0, 1fr) 14px; align-items: center; min-height: 36px; gap: 8px; padding: 0 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }.model-menu__item:hover { background: var(--cp-bg-hover); }.model-menu__item > em { min-width: 0; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; font-style: normal; text-align: right; text-overflow: ellipsis; white-space: nowrap; }.model-menu__item > .app-icon { color: var(--cp-text-tertiary); font-size: 12px; }.model-menu__panel { min-height: 112px; }
.permission-menu { display: flex; flex-direction: column; gap: 2px; }.permission-menu__item { display: grid; grid-template-columns: minmax(0, 1fr) 16px; align-items: center; gap: 10px; min-height: 48px; padding: 6px 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }.permission-menu__item > span { display: flex; min-width: 0; flex-direction: column; gap: 2px; }.permission-menu__item strong { font-size: 12px; font-weight: 500; }.permission-menu__item small { color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.45; }.permission-menu__item:hover, .permission-menu__item.active { background: var(--cp-bg-hover); }.permission-menu__item > .app-icon { color: var(--cp-primary); font-size: 13px; }
.git-branch-panel { display: flex; flex-direction: column; gap: 8px; }.git-branch-panel__title { margin: 2px 8px -2px; color: var(--cp-text-tertiary); font-size: 11px; }.git-branch-panel__list { min-height: 72px; }.git-branch-option { display: grid; width: 100%; grid-template-columns: 16px minmax(0, 1fr) 16px; align-items: center; min-height: 38px; gap: 8px; padding: 5px 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }.git-branch-option > span { display: flex; min-width: 0; flex-direction: column; gap: 2px; }.git-branch-option strong { overflow: hidden; font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }.git-branch-option small { color: var(--cp-text-tertiary); font-size: 11px; }.git-branch-option:hover:not(:disabled), .git-branch-option.active { background: var(--cp-bg-hover); }.git-branch-option:disabled { cursor: wait; opacity: .65; }.git-branch-option > .app-icon:last-child { color: var(--cp-primary); font-size: 13px; }.git-branch-panel__create { display: inline-flex; align-items: center; min-height: 34px; gap: 8px; margin-top: 1px; padding: 0 8px; border: 0; border-top: 1px solid var(--cp-border-light); color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 12px; cursor: pointer; text-align: left; }.git-branch-panel__create:hover:not(:disabled) { color: var(--cp-text); }.git-branch-panel__create:disabled { cursor: wait; opacity: .65; }
.context-usage-tooltip { display: grid; min-width: 180px; gap: 4px; color: var(--cp-text); font-size: 12px; line-height: 1.45; }.context-usage-tooltip strong { font-size: 12px; font-weight: 600; }.context-usage-tooltip span, .context-usage-tooltip small { color: var(--cp-text-secondary); }.context-usage-tooltip small { font-size: 11px; }
.skill-menu__title { margin: 3px 8px 5px; color: var(--cp-text); font-size: 13px; font-weight: 600; }.skill-menu__list { display: flex; min-height: 48px; flex-direction: column; gap: 2px; overflow-y: auto; }.skill-menu__item { display: grid; width: 100%; grid-template-columns: 18px minmax(0, 1fr) 16px; align-items: center; gap: 8px; min-height: 48px; padding: 6px 8px; border: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent; font: inherit; text-align: left; cursor: pointer; }.skill-menu__item span { display: grid; min-width: 0; gap: 2px; }.skill-menu__item strong { overflow: hidden; color: var(--cp-text); font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }.skill-menu__item small { overflow: hidden; color: var(--cp-text-secondary); font-size: 11px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }.skill-menu__item:hover, .skill-menu__item.active { background: var(--cp-bg-hover); }.skill-menu__item > .app-icon:last-child { color: var(--cp-primary); font-size: 13px; }
.el-dialog.full-access-dialog { max-width: calc(100vw - 32px); border-radius: 18px; }.full-access-dialog .el-dialog__header { margin: 0; padding: 8px 0 0; border-bottom: 0 !important; }.full-access-dialog .el-dialog__body { padding: 12px 0 0; }.full-access-dialog .el-dialog__footer { padding: 12px 0 0; }.full-access-dialog__header { display: flex; align-items: center; gap: 9px; color: var(--cp-text); }.full-access-dialog__header .app-icon { color: var(--cp-danger); font-size: 22px; }.full-access-dialog__header h2 { margin: 0; font-size: 16px; font-weight: 600; }.full-access-dialog__copy { margin: 0; color: var(--cp-text-secondary); font-size: 14px; line-height: 1.65; }.full-access-dialog__ack { margin-top: 18px; color: var(--cp-text); font-size: 14px; }.full-access-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; }.full-access-dialog__footer .el-button { min-width: 92px; margin: 0; font-weight: 600; }
.el-dialog.git-branch-dialog { max-width: calc(100vw - 32px); border-radius: 16px; }.git-branch-dialog .el-dialog__header { margin: 0; padding: 8px 0 0; border-bottom: 0 !important; }.git-branch-dialog .el-dialog__body { padding: 14px 0 0; }.git-branch-dialog .el-dialog__footer { padding: 16px 0 0; }.git-branch-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.git-branch-dialog__header h2 { margin: 0; color: var(--cp-text); font-size: 17px; font-weight: 600; }.git-branch-dialog__header button { display: grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; cursor: pointer; }.git-branch-dialog__header button:hover { color: var(--cp-text); background: var(--cp-bg-hover); }.git-branch-dialog__label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: var(--cp-text); font-size: 13px; font-weight: 500; }.git-branch-dialog__label button { padding: 0; border: 0; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }.git-branch-dialog__label button:hover { color: var(--cp-text); }.git-branch-dialog__error { margin: 7px 0 0; color: var(--cp-danger); font-size: 12px; }.git-branch-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; }.git-branch-dialog__footer .el-button { min-width: 92px; margin: 0; font-weight: 600; }
</style>
