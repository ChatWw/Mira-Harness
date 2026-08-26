<template>
  <main class="harness-page" :class="{ 'is-empty-session': !store.activeSession?.messages.length }">
    <section class="conversation">
      <header v-if="store.activeSession?.messages.length" class="conversation__header">
        <div class="conversation__identity">
          <span class="conversation__eyebrow"><AppIcon name="FolderOpened" />{{ selectedProject?.name || '最近对话' }}</span>
          <strong>{{ store.activeSession?.title || '新对话' }}</strong>
          <span class="conversation__directory">{{ selectedProject?.directory || '未关联项目' }}</span>
        </div>
        <div class="conversation__actions"><el-tag effect="plain" size="small">{{ permissionLabel }}</el-tag></div>
      </header>

      <div class="conversation__messages">
        <div ref="streamRef" class="message-stream" @scroll="handleStreamScroll" @wheel.passive="handleUserWheel">
        <article v-for="message in store.activeSession?.messages" :key="message.id" class="message" :class="[message.role, { 'is-entering': message.id === enteringMessageId }]" :data-message-id="message.id" @animationend="clearMessageEntrance(message.id)">
          <span class="message__role"><AppIcon :name="message.role === 'user' ? 'User' : 'ChatDotRound'" />{{ message.role === 'user' ? '我' : 'Mira' }}</span>
          <template v-if="message.role === 'user'">
            <el-input v-if="editingMessageId === message.id" v-model="editingMessageText" class="message__edit-input" type="textarea" :autosize="{ minRows: 2, maxRows: 8 }" aria-label="编辑消息" />
            <p v-else>{{ message.content }}</p>
          </template>
          <template v-else>
            <span v-if="isStreamingAssistantMessage(message)" class="message__live-status">
              <AppIcon :name="liveStatusIcon" :class="{ 'is-spinning': liveStatusSpinning }" />
              {{ liveStatusLabel }}
            </span>
            <details v-if="message.run" class="message__run">
              <summary><span class="run-summary__label">已完成 · {{ formatDuration(message.run.durationMs) }}</span><span class="run-summary__meta">{{ toolActivities(message.run.activities).length }} 个步骤</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></summary>
              <RunPlan :activities="message.run.activities" />
              <RunActivityList :activities="toolActivities(message.run.activities)" :completed-at="message.run.completedAt" />
            </details>
            <details v-else-if="isStreamingAssistantMessage(message)" class="run-progress" :open="store.activeRun != null">
              <summary><span class="run-progress__label">{{ activeRunLabel }} · {{ formatDuration(activeRunElapsed) }}</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></summary>
              <RunPlan :activities="store.activeRun?.activities || []" />
              <RunActivityList :activities="toolActivities(store.activeRun?.activities)" />
            </details>
            <div class="message__markdown" v-html="renderAssistantMessage(message.content)" @click="copyCodeBlock" />
            <section v-if="message.fileChanges?.length" class="message-changes" aria-label="本次文件修改">
              <p class="message-changes__title">本次修改</p>
              <button v-for="change in message.fileChanges" :key="change.toolCallId" type="button" class="file-change" @click="openFileChange(change)">
                <span class="file-change__icon"><AppIcon :name="change.tool === 'delete' ? 'Delete' : 'Document'" /></span>
                <span class="file-change__content"><strong>{{ change.path }}</strong><small>{{ fileChangeSummary(change) }}</small></span>
                <span class="file-change__action">{{ change.diff ? '查看对比' : '查看详情' }}<AppIcon name="ArrowRight" /></span>
              </button>
            </section>
          </template>
          <div v-if="message.attachments?.length" class="message__attachments">
            <span v-for="file in message.attachments" :key="file.path" class="file-chip"><AppIcon name="Document" />{{ file.name }}</span>
          </div>
          <div class="message__toolbar">
            <time class="message__time">{{ formatMessageTime(message.createdAt) }}</time>
            <span v-if="message.role === 'assistant' && message.usage" class="message__usage" :title="message.usage.cost?.priced ? '按模型单价估算的本次回复成本' : undefined">{{ messageUsageLabel(message) }}</span>
            <template v-if="editingMessageId === message.id">
              <button type="button" class="message__tool-btn" aria-label="取消编辑" @click="cancelMessageEdit"><AppIcon name="Close" /><span class="message__tool-label">取消</span></button>
              <button type="button" class="message__tool-btn" aria-label="保存并重新生成" :disabled="!editingMessageText.trim()" @click="saveMessageEdit(message)"><AppIcon name="Check" /><span class="message__tool-label">重跑</span></button>
            </template>
            <button v-else-if="canEditMessage(message)" type="button" class="message__tool-btn" aria-label="编辑并重新生成" @click="beginMessageEdit(message)"><AppIcon name="EditPen" /><span class="message__tool-label">编辑</span></button>
            <button v-if="message.content" type="button" class="message__tool-btn" aria-label="复制" @click="copyMessage(message)"><AppIcon name="CopyDocument" /><span class="message__tool-label">复制</span></button>
            <button v-if="canRerun(message)" type="button" class="message__tool-btn" aria-label="重新生成" @click="rerun"><AppIcon name="Refresh" /><span class="message__tool-label">{{ message.interrupted ? '继续' : '重新生成' }}</span></button>
          </div>
        </article>
        <details v-if="store.activeRun && !hasStreamingAssistantMessage" class="run-progress run-progress--pending" :open="store.activeRun != null">
          <summary><span class="run-progress__label">{{ activeRunLabel }} · {{ formatDuration(activeRunElapsed) }}</span><AppIcon name="ArrowDown" class="run-summary__chevron" /></summary>
          <RunPlan :activities="store.activeRun.activities" />
          <RunActivityList :activities="toolActivities(store.activeRun.activities)" />
        </details>
        </div>
        <div
          v-if="showQuickNavigation"
          ref="quickNavigationRef"
          class="quick-navigation"
          role="slider"
          tabindex="0"
          aria-label="对话快速导航"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="quickNavigationPercent"
          :aria-valuetext="`阅读位置 ${quickNavigationPercent}%`"
          @keydown="handleQuickNavigationKeydown"
          @pointerenter="updateQuickNavigationHover"
          @pointerdown="beginQuickNavigation"
          @pointermove="moveQuickNavigation"
          @pointerup="endQuickNavigation"
          @pointercancel="endQuickNavigation"
          @pointerleave="clearQuickNavigationHover"
        >
          <span
            v-for="segment in quickNavigationSegments"
            :key="segment.id"
            class="quick-navigation__segment"
            :class="{ 'is-active': segment.active, 'is-hovered': segment.id === hoveredQuickNavigationId }"
            :style="{ top: `${segment.top}%`, width: `${segment.width}px`, left: `${segment.left}px`, '--quick-navigation-scale-x': segment.scaleX, '--quick-navigation-scale-y': segment.scaleY }"
            aria-hidden="true"
          />
          <div v-if="hoveredQuickNavigationSegment" class="quick-navigation__preview" :style="quickNavigationPreviewStyle" aria-hidden="true">
            <strong>{{ hoveredQuickNavigationSegment.title }}</strong>
            <p>{{ hoveredQuickNavigationSegment.reply }}</p>
          </div>
        </div>
        <span v-if="showLoadingIndicator" class="loading-dots loading-dots--floating" aria-label="Mira 正在处理"><i></i><i></i><i></i></span>
        <el-tooltip v-if="showScrollToBottom" content="回到底部" placement="top">
          <button type="button" class="scroll-bottom" aria-label="回到底部" @click="scrollToBottom">
            <AppIcon name="ArrowDown" />
          </button>
        </el-tooltip>
      </div>

      <section v-if="permissionRequest" class="permission-request-card" aria-live="polite">
        <div class="permission-request-card__icon"><AppIcon name="WarningFilled" /></div>
        <div class="permission-request-card__content"><strong>{{ permissionRequest.title }}</strong><p>{{ permissionRequest.detail }}</p></div>
        <div class="permission-request-card__actions"><el-button :disabled="permissionResponding" @click="respondPermission(false)">拒绝</el-button><el-button type="primary" :loading="permissionResponding" @click="respondPermission(true)">允许</el-button></div>
      </section>
      <section v-if="store.lastRunError" class="run-error-card" role="alert"><AppIcon name="WarningFilled" /><div><strong>本次运行未完成</strong><p>{{ store.lastRunError.message }}</p></div><el-button size="small" :disabled="isComposerBusy" @click="rerun">重试</el-button></section>

      <footer class="composer-shell" @keydown.esc="closeComposerOverlay">
        <div v-if="composerOverlay" class="composer-overlay__backdrop" @mousedown="closeComposerOverlay" />
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
          <el-input :model-value="composerDraft.text" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" resize="none" placeholder="随便问" :disabled="isComposerBusy" @update:model-value="setDraftText" @keydown="handleComposerKeydown" />
          <div class="composer__actions">
            <div class="composer__status">
              <button type="button" class="composer-icon-button" :class="{ 'is-active': composerOverlay === 'add' }" title="添加内容" aria-label="添加内容" :disabled="isComposerBusy" @click="toggleAddMenu"><AppIcon name="Plus" /></button>
              <span v-for="skill in activeSkills" :key="skill.id" class="composer-chip composer-chip--skill is-active"><AppIcon name="MagicStick" /><span>{{ skill.name }}</span><button type="button" class="composer-chip__remove" :aria-label="`移除 Skill ${skill.name}`" :disabled="isComposerBusy" @click="setActiveSkill(skill.id, false)"><AppIcon name="Close" /></button></span>
              <el-popover v-model:visible="permissionPickerVisible" trigger="click" placement="top-start" :width="292" :show-arrow="false" popper-class="harness-selector-popper">
                <template #reference><button type="button" class="composer-permission" :class="`is-${selectedPermissionMode}`" :disabled="isComposerBusy" :aria-label="`权限：${permissionLabel}`"><AppIcon name="Lock" /><span>{{ permissionLabel }}</span><AppIcon name="ArrowDown" /></button></template>
                <div class="permission-menu">
                  <button v-for="option in availablePermissionOptions" :key="option.mode" type="button" class="permission-menu__item" :class="{ active: selectedPermissionMode === option.mode }" @click="setPermissionMode(option.mode)">
                    <span><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
                    <AppIcon v-if="selectedPermissionMode === option.mode" name="Check" />
                  </button>
                </div>
              </el-popover>
              <span v-if="planMode" class="composer-plan-mode"><AppIcon class="composer-plan-mode__icon" name="Finished" /><span>计划</span><button type="button" class="composer-plan-mode__close" aria-label="关闭计划模式" @click="closePlanMode"><AppIcon name="Close" /></button></span>
            </div>
            <div class="composer__submit">
              <el-tooltip v-if="showContextUsage && composerDraft.modelSelection" placement="top" :show-arrow="false">
                <template #content>
                  <div class="context-usage-tooltip">
                    <strong>上下文使用情况</strong>
                    <span>{{ formatTokenCount(contextUsage.usedTokens) }} / {{ formatTokenCount(contextUsage.contextWindow) }} · {{ contextUsagePercent }}%</span>
                    <small>剩余 {{ formatTokenCount(contextUsageRemaining) }} · {{ contextUsage.source === 'reported' ? '模型实际返回' : '本地估算' }}</small>
                  </div>
                </template>
                <span class="context-usage" :class="contextUsageState" role="img" :aria-label="`上下文已使用 ${contextUsagePercent}%`">
                  <span class="context-usage__ring" :style="{ '--context-progress': `${contextUsagePercent * 3.6}deg` }"></span>
                </span>
              </el-tooltip>
              <el-popover v-model:visible="modelPickerVisible" trigger="click" placement="top-end" :width="272" :show-arrow="false" popper-class="harness-selector-popper">
                <template #reference><button type="button" class="composer-model" :class="{ 'is-empty': !composerDraft.modelSelection }" :aria-label="selectedModelOption ? `模型：${selectedModelOption.modelName}` : '选择模型'"><span>{{ selectedModelOption?.modelName || '选择模型' }}</span><small v-if="selectedModelOption?.reasoning">{{ selectedThinkingLabel }}</small><AppIcon name="ArrowDown" /></button></template>
                <div v-if="modelMenuView === 'menu'" class="model-menu">
                  <button type="button" class="model-menu__item" @click="modelMenuView = 'models'"><span>模型</span><em>{{ selectedModelOption?.modelName || '选择模型' }}</em><AppIcon name="ArrowRight" /></button>
                  <button v-if="selectedModelOption?.reasoning" type="button" class="model-menu__item" @click="modelMenuView = 'effort'"><span>推理强度</span><em>{{ selectedThinkingLabel }}</em><AppIcon name="ArrowRight" /></button>
                  <p v-if="!modelOptions.length" class="selector-empty">没有可用模型，请先完成模型配置</p>
                </div>
                <div v-else-if="modelMenuView === 'models'" class="selector-panel model-menu__panel">
                  <div class="selector-panel__header"><button type="button" class="composer-icon-button" aria-label="返回模型设置" @click="modelMenuView = 'menu'"><AppIcon name="ArrowLeft" /></button><strong>模型</strong></div>
                  <div class="selector-panel__list">
                    <button v-for="option in modelOptions" :key="option.value" type="button" class="selector-option" :class="{ active: option.value === selectedModelOption?.value }" @click="setModelSelection(option.value)"><span>{{ option.modelName }}</span><AppIcon v-if="option.value === selectedModelOption?.value" name="Check" /></button>
                    <p v-if="!modelOptions.length" class="selector-empty">没有可用模型，请先完成模型配置</p>
                  </div>
                </div>
                <div v-else class="selector-panel model-menu__panel">
                  <div class="selector-panel__header"><button type="button" class="composer-icon-button" aria-label="返回模型设置" @click="modelMenuView = 'menu'"><AppIcon name="ArrowLeft" /></button><strong>推理强度</strong></div>
                  <div class="selector-panel__list">
                    <button v-for="option in thinkingOptions" :key="option.value" type="button" class="selector-option" :class="{ active: selectedThinkingLevel === option.value }" @click="setThinkingLevel(option.value)"><span>{{ option.label }}</span><AppIcon v-if="selectedThinkingLevel === option.value" name="Check" /></button>
                  </div>
                </div>
              </el-popover>
              <el-tooltip v-if="store.running" content="停止生成" placement="top"><button type="button" class="composer__send is-stop" aria-label="停止生成" @click="abort"><AppIcon name="VideoPause" /></button></el-tooltip>
              <el-tooltip v-else :content="composerDraft.modelSelection ? '发送消息' : '请先选择模型'" placement="top"><button type="button" class="composer__send" aria-label="发送消息" :disabled="isComposerBusy || !composerDraft.text.trim() || !composerDraft.modelSelection" @click="send"><AppIcon name="Top" /></button></el-tooltip>
            </div>
          </div>
        </div>
      </footer>
    </section>

    <div v-if="!store.activeSession?.messages.length" class="empty-state" aria-hidden="false">
      <div class="empty-state__hero">
        <h1 class="empty-state__title">Mira</h1>
        <p class="empty-state__subtitle">{{ modelOptions.length ? '今天想做什么？从一个想法开始，我陪你把它落地。' : '先在右下角选择模型，或前往模型设置完成配置。' }}</p>
      </div>
      <div class="empty-state__cards">
        <button v-for="prompt in starterPrompts" :key="prompt.title" type="button" class="starter-card" :disabled="isComposerBusy" @click="setDraftText(prompt.text)">
          <span class="starter-card__icon"><AppIcon :name="prompt.icon" /></span>
          <span class="starter-card__body">
            <strong>{{ prompt.title }}</strong>
            <small>{{ prompt.hint }}</small>
          </span>
        </button>
      </div>
    </div>

    <aside v-if="store.activeSession?.messages.length" class="session-panel"><section><h2>会话信息</h2><dl><div><dt>模型</dt><dd>{{ store.activeSession?.modelId || '使用默认模型' }}</dd></div><div><dt>权限</dt><dd>{{ permissionLabel }}</dd></div><div><dt>工作目录</dt><dd>{{ selectedProject?.directory || '尚未选择' }}</dd></div></dl></section><section><h2>工具调用</h2><el-empty v-if="!store.activeSession?.toolCalls.length" description="调用工具后显示记录" :image-size="56" /><div v-for="tool in store.activeSession?.toolCalls" :key="tool.id" class="tool-row"><span :class="tool.status" />{{ tool.tool }}<small>{{ tool.target }}</small><pre v-if="tool.diff" class="tool-diff">{{ tool.diff }}</pre></div></section></aside>

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

    <el-drawer v-model="fileChangeVisible" :title="activeFileChange?.path || '文件变更'" direction="rtl" size="min(720px, 58vw)">
      <div v-if="activeFileChange" class="file-change-diff">
        <p>{{ activeFileChange.tool === 'delete' ? '文件已移入 Mira 回收站。' : fileChangeSummary(activeFileChange) }}</p>
        <pre v-if="activeFileChange.diff" class="file-change-diff__content"><code><span v-for="(line, index) in activeFileChange.diff.split('\n')" :key="index" :class="fileDiffLineClass(line)">{{ line || ' ' }}</span></code></pre>
      </div>
    </el-drawer>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MarkdownIt from 'markdown-it'
import { getPlatformApi, getPreference } from '@/platform'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_HARNESS_GIT_CONFIG, DEFAULT_PERMISSION_CONFIG, OPEN_HARNESS_PROJECT_DIALOG_EVENT, shouldSendWithShortcut, type HarnessContextUsage, type HarnessFileChange, type HarnessGitBranch, type HarnessMessage, type HarnessRunActivity, type HarnessSkill, type ModelProviderSummary, type PermissionConfig, type PermissionMode, type SendShortcut, type ThinkingLevel } from '@/config/harness'
import { useHarnessStore } from '@/stores/harness'
import RunPlan from './components/RunPlan.vue'
import RunActivityList from './components/RunActivityList.vue'

const route = useRoute()
const router = useRouter()
const store = useHarnessStore()
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true })
markdown.renderer.rules.table_open = () => '<div class="markdown-table"><table>\n'
markdown.renderer.rules.table_close = () => '</table></div>\n'
markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0]
  const className = language ? ` class="language-${markdown.utils.escapeHtml(language)}"` : ''
  return `<div class="markdown-code-block"><button type="button" class="markdown-code-copy" data-code="${encodeURIComponent(token.content)}" aria-label="复制代码" title="复制代码"><svg class="markdown-code-copy__icon" aria-hidden="true" viewBox="0 0 1024 1024"><path fill="currentColor" d="M768 832a128 128 0 0 1-128 128H192A128 128 0 0 1 64 832V384a128 128 0 0 1 128-128v64a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64z"/><path fill="currentColor" d="M384 128a64 64 0 0 0-64 64v448a64 64 0 0 0 64 64h448a64 64 0 0 0 64-64V192a64 64 0 0 0-64-64zm0-64h448a128 128 0 0 1 128 128v448a128 128 0 0 1-128 128H384a128 128 0 0 1-128-128V192A128 128 0 0 1 384 64"/></svg></button><pre><code${className}>${markdown.utils.escapeHtml(token.content)}</code></pre></div>\n`
}
const streamRef = ref<HTMLElement>()
const quickNavigationRef = ref<HTMLElement>()
const enteringMessageId = ref<string>()
const editingMessageId = ref<string>()
const editingMessageText = ref('')
const fileChangeVisible = ref(false)
const activeFileChange = ref<HarnessFileChange>()
type SlashMenuView = 'commands' | 'mcp' | 'thinking' | 'models' | 'permissions' | 'skills'
type SlashOption = { id: string, title: string, description?: string, icon: string, active?: boolean, disabled?: boolean }

const composerOverlay = ref<'add' | 'slash'>()
const planMode = ref(false)
const projectPickerVisible = ref(false)
const gitPickerVisible = ref(false)
const createGitBranchVisible = ref(false)
const modelPickerVisible = ref(false)
const permissionPickerVisible = ref(false)
const slashMenuView = ref<SlashMenuView>('commands')
const slashMenuIndex = ref(0)
const mcpServers = ref<Array<{ id: string, name: string, command: string, args: string[], enabled: boolean }>>([])
const memoryEnabled = ref(false)
const fullAccessConfirmVisible = ref(false)
const fullAccessAcknowledged = ref(false)
const permissionResponding = ref(false)
const modelMenuView = ref<'menu' | 'models' | 'effort'>('menu')
watch(modelPickerVisible, visible => {
  if (!visible) modelMenuView.value = 'menu'
})
const projectQuery = ref('')
const gitBranchQuery = ref('')
const gitBranches = ref<HarnessGitBranch[]>([])
const gitBranchesLoading = ref(false)
const gitBranchWorking = ref(false)
const newGitBranchName = ref('')
const gitConfig = ref({ ...DEFAULT_HARNESS_GIT_CONFIG })
const providers = ref<ModelProviderSummary[]>([])
const skills = ref<HarnessSkill[]>([])
const permissionConfig = ref<PermissionConfig>({ ...DEFAULT_PERMISSION_CONFIG })
const showScrollToBottom = ref(false)
const stickToBottom = ref(true)
const clock = ref(Date.now())
interface QuickNavigationSegment {
  id: string
  top: number
  scrollTop: number
  width: number
  left: number
  scaleX: number
  scaleY: number
  active: boolean
  title: string
  reply: string
}
const quickNavigationSegments = ref<QuickNavigationSegment[]>([])
const quickNavigationScrollTop = ref(0)
const quickNavigationMaxScrollTop = ref(0)
const hoveredQuickNavigationId = ref<string>()
let elapsedTimer: number | undefined
let bottomScrollRequest = 0
let autoScrollTimer: number | undefined
let quickNavigationFrame: number | undefined
let quickNavigationResizeObserver: ResizeObserver | undefined
let quickNavigationPointerId: number | undefined
let positioningLatestMessage = false
let latestMessageIdToPosition: string | undefined
let scrollFollowLocked = false

const sessionId = computed(() => typeof route.params.id === 'string' ? route.params.id : undefined)
const draftToken = computed(() => typeof route.query.draft === 'string' ? route.query.draft : undefined)
const draftKey = computed(() => sessionId.value ? `session:${sessionId.value}` : (draftToken.value ? `draft:${draftToken.value}` : ''))
const isPersistedSession = computed(() => Boolean(sessionId.value))
const permissionRequest = computed(() => store.activeSession ? store.pendingPermissionRequests[store.activeSession.id] : undefined)
const showProjectPicker = computed(() => !isPersistedSession.value)
const composerDraft = computed(() => draftKey.value ? store.drafts[draftKey.value] || { text: '', attachments: [], updatedAt: 0 } : { text: '', attachments: [], updatedAt: 0 })
const projectId = computed(() => store.activeSession?.projectId || composerDraft.value.projectId)
const selectedProject = computed(() => store.projects.find(project => project.id === projectId.value))
const showGitPicker = computed(() => showProjectPicker.value && Boolean(selectedProject.value?.isGitRepository))
const filteredGitBranches = computed(() => {
  const query = gitBranchQuery.value.trim().toLocaleLowerCase()
  return query ? gitBranches.value.filter(branch => branch.name.toLocaleLowerCase().includes(query)) : gitBranches.value
})
const newGitBranchError = computed(() => {
  const name = newGitBranchName.value.trim()
  if (!name) return '请输入分支名称。'
  if (name.endsWith('/')) return '分支名不能以“/”结尾。'
  if (/[\s~^:?*[\\]/.test(name) || name.includes('//') || name.includes('..') || name.includes('@{') || /(?:^|\/)\.|\.lock(?:\/|$)/.test(name)) return '分支名称无效。'
  if (gitBranches.value.some(branch => branch.name === name)) return '分支已存在。'
  return ''
})
const filteredProjects = computed(() => {
  const query = projectQuery.value.trim().toLocaleLowerCase()
  return query ? store.projects.filter(project => project.name.toLocaleLowerCase().includes(query) || project.directory.toLocaleLowerCase().includes(query)) : store.projects
})
const permissionOptions: Array<{ mode: PermissionMode, label: string, description: string }> = [
  { mode: 'default', label: '默认权限', description: '敏感操作逐次确认' },
  { mode: 'auto-approve', label: '自动审核', description: '项目内操作自动批准' },
  { mode: 'full', label: '完全访问', description: '不再显示操作确认' },
]
const starterPrompts: Array<{ icon: string, title: string, hint: string, text: string }> = [
  { icon: 'EditPen', title: '写一段文案', hint: '产品介绍、朋友圈、公告……', text: '帮我写一段产品介绍' },
  { icon: 'Document', title: '总结一篇文章', hint: '粘贴链接或长文本，我来提炼要点', text: '帮我总结这篇文章的要点：' },
  { icon: 'Cpu', title: '写一段代码', hint: 'SQL、脚本、组件，描述需求即可', text: '帮我写一段代码：' },
]
const selectedPermissionMode = computed<PermissionMode>(() => store.activeSession?.permissionMode || composerDraft.value.permissionMode || permissionConfig.value.globalDefaultMode)
const enabledSkills = computed(() => skills.value.filter(skill => skill.valid && skill.enabled))
function slashCommandQuery(text: string) {
  const match = /(?:^|\s)\/([^\s]*)$/.exec(text)
  return match ? match[1] : undefined
}
const activeSkillIds = computed(() => store.activeSession?.activeSkillIds || composerDraft.value.activeSkillIds || [])
const activeMcpServerIds = computed(() => store.activeSession?.activeMcpServerIds || composerDraft.value.activeMcpServerIds || [])
const activeSkills = computed(() => enabledSkills.value.filter(skill => activeSkillIds.value.includes(skill.id)))
const permissionLabel = computed(() => permissionOptions.find(option => option.mode === selectedPermissionMode.value)?.label || '默认权限')
const availablePermissionOptions = computed(() => permissionOptions.filter(option => option.mode === 'default'
  || (option.mode === 'auto-approve' && permissionConfig.value.autoApproveEnabled)
  || (option.mode === 'full' && permissionConfig.value.fullAccessEnabled)))
const modelOptions = computed(() => providers.value.filter(provider => provider.enabled && provider.hasApiKey).flatMap(provider => provider.models.map(modelId => ({ value: `${provider.id}:${modelId}`, modelName: modelId, reasoning: provider.reasoning, contextWindow: provider.contextWindow }))))
const selectedModelOption = computed(() => modelOptions.value.find(option => option.value === `${composerDraft.value.modelSelection?.providerId}:${composerDraft.value.modelSelection?.modelId}`))
const showContextUsage = computed(() => getPreference('showContextUsage', true))
const sendShortcut = computed<SendShortcut>(() => getPreference<SendShortcut>('sendShortcut', 'mod-enter') === 'enter' ? 'enter' : 'mod-enter')
const contextUsage = computed<HarnessContextUsage>(() => {
  const stored = store.activeSession?.context?.usage
  const contextWindow = selectedModelOption.value?.contextWindow || stored?.contextWindow || DEFAULT_CONTEXT_WINDOW
  return stored ? { ...stored, contextWindow } : { usedTokens: 0, contextWindow, source: 'estimated', updatedAt: Date.now() }
})
const contextUsagePercent = computed(() => Math.min(100, Math.round(contextUsage.value.usedTokens / Math.max(1, contextUsage.value.contextWindow) * 100)))
const contextUsageRemaining = computed(() => Math.max(0, contextUsage.value.contextWindow - contextUsage.value.usedTokens))
const contextUsageState = computed(() => contextUsagePercent.value >= 95 ? 'is-critical' : contextUsagePercent.value >= 80 ? 'is-warning' : 'is-normal')
const thinkingOptions: Array<{ value: ThinkingLevel, label: string }> = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]
const selectedThinkingLevel = computed<ThinkingLevel>(() => composerDraft.value.modelSelection?.thinkingLevel || 'medium')
const selectedThinkingLabel = computed(() => thinkingOptions.find(option => option.value === selectedThinkingLevel.value)?.label || '中')
const slashQuery = computed(() => slashCommandQuery(composerDraft.value.text)?.trim().toLocaleLowerCase())
const canSaveProjectMemory = computed(() => memoryEnabled.value && Boolean(selectedProject.value))
const slashCommands = computed<SlashOption[]>(() => {
  const commands: SlashOption[] = [
    { id: 'mcp', title: 'MCP', description: '显示 MCP 服务器状态', icon: 'Paperclip' },
    { id: 'thinking', title: '推理', description: selectedModelOption.value ? (selectedModelOption.value.reasoning ? selectedThinkingLabel.value : '关闭') : '未选择模型', icon: 'Cpu' },
    { id: 'models', title: '模型', description: selectedModelOption.value?.modelName || '未选择模型', icon: 'Cpu' },
    { id: 'plan', title: '计划模式', description: planMode.value ? '关闭计划模式' : '打开计划模式', icon: 'Finished' },
    { id: 'permissions', title: '权限', description: permissionLabel.value, icon: 'Lock' },
    { id: 'skills', title: 'Skill', description: '选择已启用 Skill', icon: 'MagicStick' },
  ]
  if (canSaveProjectMemory.value) commands.splice(4, 0, { id: 'memory', title: '记忆', icon: 'Document' })
  const query = slashQuery.value || ''
  return commands.filter(command => !query || `${command.title} ${command.description || ''}`.toLocaleLowerCase().includes(query))
})
const slashOptions = computed<SlashOption[]>(() => {
  if (slashMenuView.value === 'commands') return slashCommands.value
  if (slashMenuView.value === 'mcp') return mcpServers.value.map(server => ({ id: server.id, title: server.name, description: server.enabled ? undefined : '已停用', icon: 'Connection', active: activeMcpServerIds.value.includes(server.id), disabled: !server.enabled }))
  if (slashMenuView.value === 'thinking') return thinkingOptions.map(option => ({ id: option.value, title: option.label, icon: 'Cpu', active: selectedThinkingLevel.value === option.value, disabled: !selectedModelOption.value?.reasoning }))
  if (slashMenuView.value === 'models') return modelOptions.value.map(option => ({ id: option.value, title: option.modelName, icon: 'Cpu', active: option.value === selectedModelOption.value?.value }))
  if (slashMenuView.value === 'permissions') return availablePermissionOptions.value.map(option => ({ id: option.mode, title: option.label, description: option.description, icon: 'Lock', active: option.mode === selectedPermissionMode.value }))
  return enabledSkills.value.map(skill => ({ id: skill.id, title: skill.name, description: skill.description, icon: 'MagicStick', active: activeSkillIds.value.includes(skill.id) }))
})
const slashMenuTitle = computed(() => {
  const titles: Partial<Record<SlashMenuView, string>> = { mcp: 'MCP', thinking: '推理', models: '模型', permissions: '权限', skills: 'Skill' }
  return titles[slashMenuView.value] || ''
})
const slashMenuEmptyText = computed(() => {
  const texts: Partial<Record<SlashMenuView, string>> = { mcp: '没有配置 MCP 服务。', models: '没有可用模型，请先完成模型配置。', skills: '没有已启用的 Skill。' }
  return texts[slashMenuView.value] || '没有可用选项。'
})
const isComposerBusy = computed(() => store.running || store.rendering)
const toolActivities = (activities?: HarnessRunActivity[]) => (activities || []).filter(activity => activity.kind !== 'plan')
const activeRunLabel = computed(() => store.rendering && !store.running ? '正在呈现回复' : (store.activeRun?.activities.find(activity => activity.status === 'running')?.label || '正在处理'))
const activeRunElapsed = computed(() => store.activeRun ? Math.max(0, clock.value - store.activeRun.startedAt) : 0)
const liveStatusActivity = computed(() => store.activeRun?.activities.find(activity => activity.status === 'running'))
const liveStatusLabel = computed(() => {
  if (store.rendering && !store.running) return '正在生成回复'
  return liveStatusActivity.value?.label || '正在处理'
})
const liveStatusIcon = computed(() => store.rendering && !store.running ? 'EditPen' : 'Loading')
const liveStatusSpinning = computed(() => !(store.rendering && !store.running))
const activeLastMessage = computed(() => {
  const messages = store.activeSession?.messages
  return messages?.[messages.length - 1]
})
const hasStreamingAssistantMessage = computed(() => Boolean(store.activeRun && activeLastMessage.value?.role === 'assistant'))
const showQuickNavigation = computed(() => quickNavigationMaxScrollTop.value > 2 && quickNavigationSegments.value.length > 0)
const quickNavigationProgress = computed(() => quickNavigationMaxScrollTop.value > 0 ? quickNavigationScrollTop.value / quickNavigationMaxScrollTop.value : 0)
const quickNavigationPercent = computed(() => Math.round(quickNavigationProgress.value * 100))
const hoveredQuickNavigationSegment = computed(() => quickNavigationSegments.value.find(segment => segment.id === hoveredQuickNavigationId.value))
const quickNavigationPreviewStyle = computed(() => ({ top: `${Math.min(90, Math.max(7, hoveredQuickNavigationSegment.value?.top || 0))}%` }))

const showLoadingIndicator = computed(() => {
  const messages = store.activeSession?.messages
  return stickToBottom.value && store.running && messages?.[messages.length - 1]?.role !== 'assistant'
})

async function load() {
  const api = getPlatformApi()
  const [,, configured, permissions, configuredSkills, configuredMcpServers, savedMemoryEnabled] = await Promise.all([store.refreshSessions(), store.refreshProjects(), api?.listModelProviders() || [], api?.getHarnessPermissionConfig(), api?.listHarnessSkills() || [], api?.listMcpServers() || [], api?.getHarnessMemoryEnabled() || false])
  providers.value = configured
  skills.value = configuredSkills
  mcpServers.value = configuredMcpServers
  memoryEnabled.value = savedMemoryEnabled
  if (permissions) permissionConfig.value = permissions
  if (sessionId.value) {
    if (store.activeSession?.id !== sessionId.value) await store.openSession(sessionId.value)
    const sessionKey = `session:${sessionId.value}`
    store.ensureComposerDraft(sessionKey)
    const session = store.activeSession
    if (session?.modelProviderId && session.modelId && !store.drafts[sessionKey]?.modelSelection) {
      const savedSelection = store.lastModelSelection
      store.updateComposerDraft(sessionKey, {
        modelSelection: {
          providerId: session.modelProviderId,
          modelId: session.modelId,
          thinkingLevel: savedSelection?.providerId === session.modelProviderId && savedSelection.modelId === session.modelId
            ? savedSelection.thinkingLevel
            : undefined,
        },
      })
    }
    void snapSessionToBottom()
    return
  }
  store.clearActiveSession()
  if (!draftToken.value) {
    const token = store.startDraft()
    await router.replace({ path: '/workspace/chat', query: { ...route.query, draft: token } })
    return
  }
  const draftKey = `draft:${draftToken.value}`
  store.ensureComposerDraft(draftKey)
  if (!store.drafts[draftKey]?.modelSelection && store.lastModelSelection) {
    store.updateComposerDraft(draftKey, { modelSelection: { ...store.lastModelSelection } })
  }
}

async function refreshSlashData() {
  const api = getPlatformApi()
  const [configuredSkills, configuredMcpServers, savedMemoryEnabled] = await Promise.all([api?.listHarnessSkills() || [], api?.listMcpServers() || [], api?.getHarnessMemoryEnabled() || false])
  skills.value = configuredSkills
  mcpServers.value = configuredMcpServers
  memoryEnabled.value = savedMemoryEnabled
}
async function setActiveSkill(id: string, enabled: boolean) {
  const session = store.activeSession; const api = getPlatformApi()
  if (!draftKey.value) return false
  const next = enabled ? [...new Set([...activeSkillIds.value, id])] : activeSkillIds.value.filter(value => value !== id)
  if (!session || !api) {
    store.updateComposerDraft(draftKey.value, { activeSkillIds: next })
    return true
  }
  try {
    store.activeSession = await api.setHarnessActiveSkills(session.id, next)
    return true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新 Skill 失败')
    return false
  }
}

let routeLoadPromise: Promise<void> = Promise.resolve()
function reload() {
  routeLoadPromise = load()
  return routeLoadPromise
}

function setDraftText(value: string) {
  if (draftKey.value) store.updateComposerDraft(draftKey.value, { text: value })
  if (isComposerBusy.value || slashCommandQuery(value) === undefined) {
    if (composerOverlay.value === 'slash') closeSlashMenu(false)
    return
  }
  composerOverlay.value = 'slash'
  slashMenuView.value = 'commands'
  slashMenuIndex.value = 0
  void refreshSlashData()
}
function handleComposerKeydown(event: KeyboardEvent) {
  if (composerOverlay.value === 'slash') {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (slashMenuView.value === 'commands') closeSlashMenu()
      else backSlashMenu()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSlashMenuIndex(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSlashMenuIndex(-1)
      return
    }
    if (event.key === ' ' && !event.isComposing) {
      const option = slashOptions.value[slashMenuIndex.value]
      if (option) { event.preventDefault(); void selectSlashOption(option.id) }
      return
    }
  }
  if (!shouldSendWithShortcut(sendShortcut.value, event)) return
  event.preventDefault()
  void send()
}

function moveSlashMenuIndex(direction: 1 | -1) {
  const options = slashOptions.value
  if (!options.some(option => !option.disabled)) return
  let index = slashMenuIndex.value
  do {
    index = (index + direction + options.length) % options.length
  } while (options[index].disabled)
  slashMenuIndex.value = index
}
function formatTokenCount(value: number) {
  if (value < 1000) return `${value}`
  if (value >= 1000000 && value % 1000000 === 0) return `${value / 1000000}M`
  const compact = value >= 100000 ? Math.round(value / 1000) : Math.round(value / 100) / 10
  return `${compact}K`
}
function messageUsageLabel(message: HarnessMessage) {
  const usage = message.usage!
  if (!usage.cost?.priced) return `${formatTokenCount(usage.totalTokens)} token`
  return `${formatTokenCount(usage.totalTokens)} token · 估算 ${usage.cost.currency} ${usage.cost.total.toFixed(usage.cost.total >= 1 ? 2 : 4)}`
}
function renderAssistantMessage(content: string) { return markdown.render(content) }
function fileChangeSummary(change: HarnessFileChange) {
  if (change.tool === 'delete') return '已移入回收站'
  const lines = change.diff?.split('\n') || []
  const added = lines.filter(line => /^\+\d/.test(line)).length
  const removed = lines.filter(line => /^-\d/.test(line)).length
  return `${change.tool === 'write' ? '已写入' : '已编辑'}${added || removed ? ` · +${added} -${removed}` : ''}`
}
function fileDiffLineClass(line: string) { return line.startsWith('+') ? 'is-added' : line.startsWith('-') ? 'is-removed' : '' }
function openFileChange(change: HarnessFileChange) { activeFileChange.value = change; fileChangeVisible.value = true }
async function copyCodeBlock(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.markdown-code-copy')
  const encoded = button?.dataset.code
  if (!button || !encoded) return
  try {
    await navigator.clipboard.writeText(decodeURIComponent(encoded))
    button.dataset.copied = 'true'
    button.setAttribute('aria-label', '已复制代码')
    button.setAttribute('title', '已复制')
    window.setTimeout(() => {
      delete button.dataset.copied
      button.setAttribute('aria-label', '复制代码')
      button.setAttribute('title', '复制代码')
    }, 1600)
  } catch {
    ElMessage.error('复制代码失败')
  }
}
function isStreamingAssistantMessage(message: HarnessMessage) { return Boolean(store.activeRun && activeLastMessage.value?.id === message.id) }
async function setPermissionMode(permissionMode: PermissionMode, confirmed = false) {
  if (isComposerBusy.value || selectedPermissionMode.value === permissionMode) {
    permissionPickerVisible.value = false
    return
  }
  if (permissionMode === 'full' && !confirmed) {
    permissionPickerVisible.value = false
    fullAccessAcknowledged.value = false
    fullAccessConfirmVisible.value = true
    return
  }
  try {
    if (store.activeSession) await store.setSessionPermission(store.activeSession.id, permissionMode)
    if (draftKey.value) store.updateComposerDraft(draftKey.value, { permissionMode })
    permissionPickerVisible.value = false
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '权限切换失败')
  }
}
async function confirmFullAccess() {
  if (!fullAccessAcknowledged.value) return
  fullAccessConfirmVisible.value = false
  await setPermissionMode('full', true)
}

async function respondPermission(allowed: boolean) {
  const sessionId = store.activeSession?.id
  if (!sessionId || permissionResponding.value) return
  permissionResponding.value = true
  try {
    await store.respondPermission(sessionId, allowed)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '提交审批结果失败')
  } finally { permissionResponding.value = false }
}

async function rerun() {
  const api = getPlatformApi()
  const session = store.activeSession
  if (!api || !session || store.running || store.rendering) return
  const last = session.messages[session.messages.length - 1]
  if (last?.role === 'assistant') session.messages.pop()
  const selection = composerDraft.value.modelSelection
  try {
    await api.rerunHarness(session.id, selection ? { providerId: selection.providerId, modelId: selection.modelId, thinkingLevel: selection.thinkingLevel } : undefined)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重新生成失败')
  }
}

function beginMessageEdit(message: HarnessMessage) {
  editingMessageId.value = message.id
  editingMessageText.value = message.content
}

function cancelMessageEdit() {
  editingMessageId.value = undefined
  editingMessageText.value = ''
}

async function saveMessageEdit(message: HarnessMessage) {
  const api = getPlatformApi()
  const session = store.activeSession
  const content = editingMessageText.value.trim()
  if (!api || !session || !content || store.running || store.rendering) return
  try {
    await ElMessageBox.confirm('保存后将删除这条消息后的对话，并基于修改后的内容重新生成。', '重新生成对话', { type: 'warning', confirmButtonText: '保存并重新生成', cancelButtonText: '取消' })
  } catch {
    return
  }
  const messageIndex = session.messages.findIndex(item => item.id === message.id)
  if (messageIndex < 0) return
  session.messages[messageIndex].content = content
  session.messages = session.messages.slice(0, messageIndex + 1)
  session.context = undefined
  cancelMessageEdit()
  const selection = composerDraft.value.modelSelection
  store.running = true
  try {
    await api.editAndRerunHarnessMessage(session.id, message.id, content, selection ? { providerId: selection.providerId, modelId: selection.modelId, thinkingLevel: selection.thinkingLevel } : undefined)
  } catch (error) {
    await store.openSession(session.id).catch(() => undefined)
    ElMessage.error(error instanceof Error ? error.message : '重新生成失败')
  } finally {
    store.running = false
  }
}

async function copyMessage(message: HarnessMessage) {
  try {
    await navigator.clipboard.writeText(message.content)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

function canRerun(message: HarnessMessage) {
  if (message.role !== 'assistant') return false
  const messages = store.activeSession?.messages
  if (message.id !== messages?.[messages.length - 1]?.id) return false
  if (store.running || store.rendering) return false
  return true
}

function canEditMessage(message: HarnessMessage) {
  return message.role === 'user' && !editingMessageId.value && !store.running && !store.rendering
}

function formatMessageTime(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}
function setModelSelection(value: string) {
  const [providerId, ...parts] = value.split(':')
  const modelId = parts.join(':')
  if (!providerId || !modelId) return
  const option = modelOptions.value.find(item => item.value === value)
  const selection = { providerId, modelId, thinkingLevel: option?.reasoning ? 'medium' as ThinkingLevel : undefined }
  store.setLastModelSelection(selection)
  if (draftKey.value) store.updateComposerDraft(draftKey.value, { modelSelection: selection })
  modelPickerVisible.value = false
}

function setThinkingLevel(thinkingLevel: ThinkingLevel) {
  const current = composerDraft.value.modelSelection
  if (!current || !selectedModelOption.value?.reasoning) return
  const selection = { ...current, thinkingLevel }
  store.setLastModelSelection(selection)
  if (draftKey.value) store.updateComposerDraft(draftKey.value, { modelSelection: selection })
  modelPickerVisible.value = false
}

function formatDuration(value: number) {
  const milliseconds = Math.max(0, value)
  return milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)}s`
}

function selectProject(id?: string) {
  if (!draftKey.value || isPersistedSession.value) return
  store.updateComposerDraft(draftKey.value, { projectId: id, attachments: [] })
  closeComposerOverlay()
  projectPickerVisible.value = false
}

async function refreshProjectPicker() {
  projectQuery.value = ''
  await store.refreshProjects()
}

async function refreshGitBranches() {
  const api = getPlatformApi()
  const project = selectedProject.value
  if (!api || !project?.isGitRepository) { gitBranches.value = []; return }
  gitBranchQuery.value = ''
  gitBranchesLoading.value = true
  try {
    gitBranches.value = await api.listHarnessGitBranches(project.id)
  } catch (error) {
    gitBranches.value = []
    ElMessage.error(error instanceof Error ? error.message : '加载 Git 分支失败')
  } finally { gitBranchesLoading.value = false }
}

async function checkoutGitBranch(branchName: string) {
  const api = getPlatformApi()
  const project = selectedProject.value
  if (!api || !project || gitBranchWorking.value) return
  gitBranchWorking.value = true
  try {
    gitBranches.value = await api.checkoutHarnessGitBranch(project.id, branchName)
    await store.refreshProjects()
    ElMessage.success(`已切换到 ${branchName}`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '切换 Git 分支失败')
  } finally { gitBranchWorking.value = false }
}

async function openCreateGitBranchDialog() {
  const api = getPlatformApi()
  gitPickerVisible.value = false
  if (api) {
    try { gitConfig.value = await api.getHarnessGitConfig() } catch { gitConfig.value = { ...DEFAULT_HARNESS_GIT_CONFIG } }
  }
  newGitBranchName.value = gitConfig.value.branchPrefix
  createGitBranchVisible.value = true
}

async function createGitBranch() {
  const api = getPlatformApi()
  const project = selectedProject.value
  if (!api || !project || gitBranchWorking.value || newGitBranchError.value) return
  gitBranchWorking.value = true
  try {
    gitBranches.value = await api.createAndCheckoutHarnessGitBranch(project.id, newGitBranchName.value.trim())
    await store.refreshProjects()
    createGitBranchVisible.value = false
    ElMessage.success(`已创建并检出 ${newGitBranchName.value.trim()}`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建 Git 分支失败')
  } finally { gitBranchWorking.value = false }
}

function openGitSettings() {
  createGitBranchVisible.value = false
  void router.push({ path: '/settings/git', query: { from: route.fullPath } })
}

function createProjectFromPicker() {
  closeComposerOverlay()
  projectPickerVisible.value = false
  window.dispatchEvent(new CustomEvent<{ onCreated: (projectId: string) => void }>(OPEN_HARNESS_PROJECT_DIALOG_EVENT, {
    detail: { onCreated: projectId => selectProject(projectId) },
  }))
}

function enablePlanMode() { planMode.value = true; closeComposerOverlay() }
function closePlanMode() { planMode.value = false }

function closeComposerOverlay() {
  if (composerOverlay.value === 'slash') {
    closeSlashMenu()
    return
  }
  composerOverlay.value = undefined
}

function closeSlashMenu(clearTrigger = true) {
  composerOverlay.value = undefined
  slashMenuView.value = 'commands'
  slashMenuIndex.value = 0
  if (clearTrigger) setDraftText(clearSlashCommand(composerDraft.value.text))
}

function backSlashMenu() {
  slashMenuView.value = 'commands'
  slashMenuIndex.value = 0
}

function toggleAddMenu() {
  composerOverlay.value = composerOverlay.value === 'add' ? undefined : 'add'
}

async function selectFiles() {
  const api = getPlatformApi(); const project = selectedProject.value
  if (!api || !project || !draftKey.value) return
  closeComposerOverlay()
  try {
    const selected = await api.selectHarnessFiles(project.id)
    const attached = new Set(composerDraft.value.attachments.map(file => file.path))
    const additions = selected.filter(file => !attached.has(file.path))
    if (!additions.length) return
    store.updateComposerDraft(draftKey.value, { attachments: [...composerDraft.value.attachments, ...additions] })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '选择引用文件失败')
  }
}

function clearSlashCommand(text: string) {
  const match = /(^|\s)\/[^\s]*$/.exec(text)
  return match ? `${text.slice(0, match.index)}${match[1]}` : text
}

async function selectSkill(skill: HarnessSkill) {
  if (await setActiveSkill(skill.id, true)) {
    setDraftText(clearSlashCommand(composerDraft.value.text))
    closeSlashMenu(false)
  }
}

async function setActiveMcpServer(id: string) {
  if (isComposerBusy.value || !draftKey.value) return
  const next = activeMcpServerIds.value.includes(id)
    ? activeMcpServerIds.value.filter(value => value !== id)
    : [...activeMcpServerIds.value, id]
  try {
    if (store.activeSession) await store.setActiveMcpServers(store.activeSession.id, next)
    else store.updateComposerDraft(draftKey.value, { activeMcpServerIds: next })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新 MCP 服务失败')
  }
}

async function saveCurrentProjectMemory() {
  const api = getPlatformApi(); const session = store.activeSession; const selection = composerDraft.value.modelSelection
  if (!api || !session) return
  try {
    await api.saveHarnessProjectMemory(session.id, selection ? { ...selection } : undefined)
    store.activeSession = await api.getHarnessSession(session.id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存项目记忆失败')
  }
}

async function selectSlashOption(id: string) {
  if (isComposerBusy.value) return
  if (slashOptions.value.find(option => option.id === id)?.disabled) return
  if (slashMenuView.value === 'commands') {
    if (id === 'plan') {
      planMode.value = !planMode.value
      closeSlashMenu()
      return
    }
    if (id === 'memory') {
      const hasConversation = Boolean(store.activeSession?.messages.some(message => message.role === 'user') && store.activeSession.messages.some(message => message.role === 'assistant'))
      if (hasConversation) {
        closeSlashMenu()
        await saveCurrentProjectMemory()
      } else {
        setDraftText(`${clearSlashCommand(composerDraft.value.text)}请将以下内容保存为项目级记忆：`)
        closeSlashMenu(false)
      }
      return
    }
    if (id === 'mcp' || id === 'thinking' || id === 'models' || id === 'permissions' || id === 'skills') {
      slashMenuView.value = id
      slashMenuIndex.value = 0
      if (id === 'mcp' || id === 'skills') void refreshSlashData()
    }
    return
  }
  if (slashMenuView.value === 'mcp') {
    await setActiveMcpServer(id)
    return
  }
  if (slashMenuView.value === 'models') {
    setModelSelection(id)
    closeSlashMenu()
    return
  }
  if (slashMenuView.value === 'thinking') {
    setThinkingLevel(id as ThinkingLevel)
    closeSlashMenu()
    return
  }
  if (slashMenuView.value === 'permissions') {
    await setPermissionMode(id as PermissionMode)
    closeSlashMenu()
    return
  }
  const skill = enabledSkills.value.find(item => item.id === id)
  if (skill) await selectSkill(skill)
}

function handleFileDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files || [])
  if (!files.length) return
  const project = selectedProject.value
  const api = getPlatformApi()
  if (!project || !api) { ElMessage.info('请先选择项目后再拖入文件'); return }
  if (!draftKey.value) return
  const dir = project.directory.replace(/[\\/]+$/, '').replace(/\\/g, '/')
  for (const file of files) {
    const absolute = api.getPathForFile(file).replace(/\\/g, '/')
    if (!absolute) { ElMessage.warning(`无法读取文件路径：${file.name}`); continue }
    if (!absolute.startsWith(`${dir}/`)) { ElMessage.warning(`文件不在项目目录内：${file.name}`); continue }
    const relPath = absolute.slice(dir.length + 1)
    if (!relPath || isAttached(relPath)) continue
    store.updateComposerDraft(draftKey.value, { attachments: [...composerDraft.value.attachments, { path: relPath, name: file.name }] })
    ElMessage.success(`已引用 ${file.name}`)
  }
}

function isAttached(path: string) { return composerDraft.value.attachments.some(file => file.path === path) }
function removeAttachment(path: string) {
  if (draftKey.value) store.updateComposerDraft(draftKey.value, { attachments: composerDraft.value.attachments.filter(file => file.path !== path) })
}

async function send() {
  const api = getPlatformApi()
  const originKey = draftKey.value
  const draft = composerDraft.value
  const rawText = draft.text.trim()
  const text = planMode.value && !/(计划|set_plan)/.test(rawText)
    ? `（计划模式：请先制定并展示计划，再执行。）\n${rawText}`
    : rawText
  const payload = {
    text,
    attachments: draft.attachments.map(file => ({ path: file.path, name: file.name })),
    activeSkillIds: [...activeSkillIds.value],
    activeMcpServerIds: [...activeMcpServerIds.value],
    projectId: draft.projectId,
    permissionMode: selectedPermissionMode.value,
    modelSelection: draft.modelSelection ? { ...draft.modelSelection } : undefined,
  }
  if (!api || !originKey || !payload.text || !payload.modelSelection || isComposerBusy.value) return

  let activeId = sessionId.value
  try {
    if (!activeId) {
      const session = await store.createSession(payload.projectId)
      if (!session) return
      activeId = session.id
      const sessionKey = `session:${session.id}`
      store.ensureComposerDraft(sessionKey)
      if (payload.activeSkillIds.length) store.activeSession = await api.setHarnessActiveSkills(session.id, payload.activeSkillIds)
      if (payload.activeMcpServerIds.length) store.activeSession = await api.setHarnessActiveMcpServers(session.id, payload.activeMcpServerIds)
      store.updateComposerDraft(sessionKey, { text: payload.text, attachments: payload.attachments, activeSkillIds: payload.activeSkillIds, activeMcpServerIds: payload.activeMcpServerIds, modelSelection: payload.modelSelection, permissionMode: payload.permissionMode })
      store.removeComposerDraft(originKey)
      await router.replace(`/workspace/chat/${session.id}`)
      await nextTick()
      await routeLoadPromise
    }
    if (store.activeSession?.permissionMode !== payload.permissionMode) await store.setSessionPermission(activeId, payload.permissionMode)
    const sessionKey = `session:${activeId}`
    store.updateComposerDraft(sessionKey, { text: '', attachments: [] })
    const messageId = `local-${Date.now()}`
    enteringMessageId.value = messageId
    store.activeSession?.messages.push({ id: messageId, role: 'user', content: payload.text, attachments: payload.attachments.map(file => ({ ...file, content: '' })), createdAt: Date.now() })
    void scrollLatestMessageToTop(messageId)
    store.running = true
    await nextTick()
    await api.runHarnessMessage(activeId, payload.text, payload.attachments, payload.modelSelection)
  } catch (error) {
    const sessionKey = activeId ? `session:${activeId}` : originKey
    const session = activeId ? await store.openSession(activeId).catch(() => undefined) : undefined
    const persisted = session?.messages.some(message => message.role === 'user' && message.content === payload.text)
    if (!persisted) store.updateComposerDraft(sessionKey, { text: payload.text, attachments: payload.attachments, activeSkillIds: payload.activeSkillIds, activeMcpServerIds: payload.activeMcpServerIds, modelSelection: payload.modelSelection, permissionMode: payload.permissionMode })
    ElMessage.error(error instanceof Error ? error.message : '消息发送失败')
  } finally {
    store.running = false
  }
}

async function abort() { if (store.activeSession) await getPlatformApi()?.abortHarnessRun(store.activeSession.id) }

function handleStreamScroll() {
  scheduleQuickNavigationUpdate()
  if (positioningLatestMessage) return
  const element = streamRef.value
  if (!element) return
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  if (scrollFollowLocked) {
    showScrollToBottom.value = distance > 2
    return
  }
  if (distance <= 2) stickToBottom.value = true
  else if (distance > 72) stickToBottom.value = false
  showScrollToBottom.value = !stickToBottom.value && distance > 2
}

async function scrollLatestMessageToTop(messageId: string) {
  cancelAutoScroll()
  bottomScrollRequest += 1
  positioningLatestMessage = true
  scrollFollowLocked = true
  stickToBottom.value = false
  latestMessageIdToPosition = messageId
  await nextTick()
  if (positionLatestMessageToTop(messageId)) latestMessageIdToPosition = undefined
  positioningLatestMessage = false
}

function positionLatestMessageToTop(messageId: string) {
  const stream = streamRef.value
  const message = Array.from(stream?.querySelectorAll<HTMLElement>('.message') || []).find(element => element.dataset.messageId === messageId)
  if (!stream || !message) return false
  const targetTop = Math.max(0, message.offsetTop - 20)
  const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
  stream.scrollTop = Math.min(targetTop, maxScrollTop)
  showScrollToBottom.value = maxScrollTop - stream.scrollTop > 2
  scheduleQuickNavigationUpdate()
  return targetTop <= maxScrollTop
}

function clearMessageEntrance(messageId: string) {
  if (enteringMessageId.value === messageId) enteringMessageId.value = undefined
}

function scheduleQuickNavigationUpdate() {
  if (quickNavigationFrame !== undefined) return
  quickNavigationFrame = window.requestAnimationFrame(() => {
    quickNavigationFrame = undefined
    updateQuickNavigation()
  })
}

function updateQuickNavigation() {
  const stream = streamRef.value
  if (!stream) return

  const scrollHeight = Math.max(1, stream.scrollHeight)
  const maxScrollTop = Math.max(0, scrollHeight - stream.clientHeight)
  quickNavigationScrollTop.value = stream.scrollTop
  quickNavigationMaxScrollTop.value = maxScrollTop

  const viewportBottom = stream.scrollTop + stream.clientHeight
  const messages = new Map((store.activeSession?.messages || []).map(message => [message.id, message]))
  const elements = Array.from(stream.querySelectorAll<HTMLElement>('.message'))
  const turns = elements.flatMap((element, index) => {
    const message = messages.get(element.dataset.messageId || '')
    if (message?.role !== 'user') return []
    const replyElement = elements.slice(index + 1).find(candidate => messages.get(candidate.dataset.messageId || '')?.role === 'assistant')
    const reply = replyElement ? messages.get(replyElement.dataset.messageId || '') : undefined
    return [{ element, replyElement, message, reply }]
  })
  const railHeight = Math.max(1, stream.clientHeight - 48)
  const markerPitch = Math.min(10, railHeight / Math.max(1, turns.length))
  const markerStackOffset = Math.max(0, (railHeight - turns.length * markerPitch) / 2)
  const hoveredIndex = turns.findIndex(turn => turn.message.id === hoveredQuickNavigationId.value)
  quickNavigationSegments.value = maxScrollTop > 2
    ? turns.map((turn, index) => {
      const top = turn.element.offsetTop
      const end = turn.replyElement ? turn.replyElement.offsetTop + turn.replyElement.offsetHeight : turn.element.offsetTop + turn.element.offsetHeight
      const topPercent = (markerStackOffset + (index + .5) * markerPitch) / railHeight * 100
      const proximity = hoveredIndex < 0 ? 0 : Math.max(0, 4 - Math.abs(index - hoveredIndex))
      return {
        id: turn.message.id,
        top: topPercent,
        scrollTop: top,
        width: 8,
        left: 0,
        scaleX: 1 + proximity * .375,
        scaleY: 1 + proximity * .1,
        active: top < viewportBottom && end > stream.scrollTop,
        title: formatQuickNavigationPreview(turn.message.content, 88, '这条提问'),
        reply: formatQuickNavigationPreview(turn.reply?.content || '', 280, '正在生成回复…'),
      }
    })
    : []

  quickNavigationResizeObserver?.observe(stream)
  stream.querySelectorAll<HTMLElement>('.message, .run-progress').forEach(element => quickNavigationResizeObserver?.observe(element))
}

function formatQuickNavigationPreview(content: string, limit: number, fallback: string) {
  const preview = content.replace(/\s+/g, ' ').trim()
  return preview.length > limit ? `${preview.slice(0, limit)}…` : preview || fallback
}

function useQuickNavigationPosition(progress: number) {
  const stream = streamRef.value
  if (!stream) return
  cancelAutoScroll()
  bottomScrollRequest += 1
  latestMessageIdToPosition = undefined
  scrollFollowLocked = true
  stickToBottom.value = false
  const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
  const target = Math.round(Math.min(1, Math.max(0, progress)) * maxScrollTop)
  stream.scrollTop = target
  showScrollToBottom.value = target < maxScrollTop - 2
  scheduleQuickNavigationUpdate()
}

function quickNavigationProgressFromPointer(event: PointerEvent, element: HTMLElement) {
  const bounds = element.getBoundingClientRect()
  if (!bounds.height) return
  useQuickNavigationPosition((event.clientY - bounds.top) / bounds.height)
}

function quickNavigationSegmentFromPointer(event: PointerEvent): QuickNavigationSegment | undefined {
  const element = event.currentTarget as HTMLElement
  const bounds = element.getBoundingClientRect()
  if (!bounds.height || !quickNavigationSegments.value.length) return
  const progress = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
  const nearest = quickNavigationSegments.value.reduce((candidate, segment) => Math.abs(segment.top / 100 - progress) < Math.abs(candidate.top / 100 - progress) ? segment : candidate)
  return Math.abs(nearest.top / 100 - progress) <= 6 / bounds.height ? nearest : undefined
}

function updateQuickNavigationHover(event: PointerEvent) {
  const target = quickNavigationSegmentFromPointer(event)
  if (!target) {
    if (hoveredQuickNavigationId.value) {
      hoveredQuickNavigationId.value = undefined
      scheduleQuickNavigationUpdate()
    }
    return
  }
  if (hoveredQuickNavigationId.value !== target.id) {
    hoveredQuickNavigationId.value = target.id
    scheduleQuickNavigationUpdate()
  }
  return target
}

function clearQuickNavigationHover() {
  if (quickNavigationPointerId !== undefined) return
  hoveredQuickNavigationId.value = undefined
  scheduleQuickNavigationUpdate()
}

function beginQuickNavigation(event: PointerEvent) {
  if (event.button !== 0) return
  const element = event.currentTarget as HTMLElement
  event.preventDefault()
  const target = updateQuickNavigationHover(event)
  quickNavigationPointerId = event.pointerId
  element.setPointerCapture(event.pointerId)
  if (target) useQuickNavigationPosition(target.scrollTop / Math.max(1, quickNavigationMaxScrollTop.value))
  else quickNavigationProgressFromPointer(event, element)
}

function moveQuickNavigation(event: PointerEvent) {
  updateQuickNavigationHover(event)
  if (quickNavigationPointerId === event.pointerId) quickNavigationProgressFromPointer(event, event.currentTarget as HTMLElement)
}

function endQuickNavigation(event: PointerEvent) {
  if (quickNavigationPointerId !== event.pointerId) return
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  quickNavigationPointerId = undefined
}

function handleQuickNavigationKeydown(event: KeyboardEvent) {
  const stream = streamRef.value
  if (!stream) return
  const maxScrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
  const step = Math.max(48, stream.clientHeight * .15)
  if (event.key === 'Home') useQuickNavigationPosition(0)
  else if (event.key === 'End') useQuickNavigationPosition(1)
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') useQuickNavigationPosition((stream.scrollTop - step) / Math.max(1, maxScrollTop))
  else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') useQuickNavigationPosition((stream.scrollTop + step) / Math.max(1, maxScrollTop))
  else if (event.key === 'PageUp') useQuickNavigationPosition((stream.scrollTop - stream.clientHeight) / Math.max(1, maxScrollTop))
  else if (event.key === 'PageDown') useQuickNavigationPosition((stream.scrollTop + stream.clientHeight) / Math.max(1, maxScrollTop))
  else return
  event.preventDefault()
}

function cancelAutoScroll() {
  if (autoScrollTimer !== undefined) window.clearTimeout(autoScrollTimer)
  autoScrollTimer = undefined
}

function handleUserWheel(event: WheelEvent) {
  if (event.deltaY >= 0) return
  cancelAutoScroll()
  scrollFollowLocked = true
  stickToBottom.value = false
  showScrollToBottom.value = true
}

function scheduleAutoScroll() {
  if (store.running || store.rendering || scrollFollowLocked || !stickToBottom.value || autoScrollTimer !== undefined) return
  autoScrollTimer = window.setTimeout(() => {
    autoScrollTimer = undefined
    const element = streamRef.value
    if (!element || store.running || store.rendering || scrollFollowLocked || !stickToBottom.value) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    if (distance > 0) element.scrollBy({ top: distance, behavior: 'smooth' })
  }, 72)
}

async function scrollToBottom() {
  cancelAutoScroll()
  scrollFollowLocked = false
  stickToBottom.value = true
  await nextTick()
  streamRef.value?.scrollTo({ top: streamRef.value.scrollHeight, behavior: 'smooth' })
  showScrollToBottom.value = false
  scheduleQuickNavigationUpdate()
}

async function snapSessionToBottom() {
  const request = ++bottomScrollRequest
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (request !== bottomScrollRequest || store.running || store.rendering || scrollFollowLocked || !stickToBottom.value) return
  const element = streamRef.value
  if (!element) return
  element.scrollTop = element.scrollHeight
  requestAnimationFrame(() => {
    if (request !== bottomScrollRequest || !streamRef.value) return
    streamRef.value.scrollTop = streamRef.value.scrollHeight
    handleStreamScroll()
  })
}

watch(() => [route.params.id, route.query.draft], () => {
  cancelAutoScroll()
  quickNavigationResizeObserver?.disconnect()
  hoveredQuickNavigationId.value = undefined
  latestMessageIdToPosition = undefined
  scrollFollowLocked = false
  stickToBottom.value = true
  showScrollToBottom.value = false
  void reload()
})
watch(() => store.activeSession?.id, () => {
  cancelAutoScroll()
  stickToBottom.value = true
  showScrollToBottom.value = false
  void snapSessionToBottom()
})
watch(slashOptions, options => {
  if (slashMenuIndex.value >= options.length) slashMenuIndex.value = 0
})
watch(() => {
  const messages = store.activeSession?.messages
  return [messages?.length, messages?.[messages.length - 1]?.content]
}, async () => {
  await nextTick()
  scheduleQuickNavigationUpdate()
  if (latestMessageIdToPosition) {
    if (positionLatestMessageToTop(latestMessageIdToPosition)) latestMessageIdToPosition = undefined
    return
  }
  scheduleAutoScroll()
  handleStreamScroll()
})
onMounted(() => {
  elapsedTimer = window.setInterval(() => { if (store.activeRun) clock.value = Date.now() }, 250)
  quickNavigationResizeObserver = new ResizeObserver(scheduleQuickNavigationUpdate)
  void nextTick().then(scheduleQuickNavigationUpdate)
  void reload()
})
onBeforeUnmount(() => {
  if (elapsedTimer) window.clearInterval(elapsedTimer)
  cancelAutoScroll()
  if (quickNavigationFrame !== undefined) window.cancelAnimationFrame(quickNavigationFrame)
  quickNavigationResizeObserver?.disconnect()
  bottomScrollRequest += 1
})
</script>

<style scoped lang="scss">
.harness-page { height: 100%; min-height: 0; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 248px; overflow: hidden; background: var(--cp-bg); position: relative; }
.harness-page.is-empty-session { display: flex; flex-direction: column; }
.harness-page.is-empty-session .conversation { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; height: 100%; }
.harness-page.is-empty-session .conversation__messages { flex: 1 1 auto; min-height: 0; }
.harness-page.is-empty-session .composer-shell { flex: 0 0 auto; }
.session-panel { min-width: 0; padding: 22px 18px; overflow-y: auto; background: color-mix(in srgb, var(--cp-bg-elevated) 88%, var(--cp-bg)); border-left: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }
.conversation { display: grid; min-width: 0; min-height: 0; overflow: hidden; grid-template-rows: auto minmax(0, 1fr) auto auto; position: relative; }
.conversation__messages { position: relative; min-height: 0; overflow: hidden; }
.conversation__header { display: flex; justify-content: space-between; align-items: center; gap: $spacing-md; min-height: 66px; padding: 10px clamp(20px, 4vw, 56px); border-bottom: 1px solid color-mix(in srgb, var(--cp-border-light) 72%, transparent); }
.permission-request-card { display: grid; width: min(calc(100% - 28px), 760px); box-sizing: border-box; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 12px; margin: 0 auto 10px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--cp-warning) 34%, var(--cp-border)); border-radius: $radius-md; background: color-mix(in srgb, var(--cp-warning) 8%, var(--cp-bg-elevated)); box-shadow: 0 8px 20px rgb(24 24 27 / 8%); }
.permission-request-card__icon { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; color: var(--cp-warning); background: color-mix(in srgb, var(--cp-warning) 14%, transparent); font-size: 15px; }.permission-request-card__content { min-width: 0; }.permission-request-card__content strong { display: block; color: var(--cp-text); font-size: 13px; font-weight: 600; }.permission-request-card__content p { max-height: 54px; margin: 3px 0 0; overflow: auto; color: var(--cp-text-secondary); font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }.permission-request-card__actions { display: flex; flex: 0 0 auto; gap: 8px; }.permission-request-card__actions .el-button { min-width: 68px; margin: 0; }
.conversation__identity { min-width: 0; }
.conversation__identity strong, .conversation__identity span { display: block; }
.conversation__identity strong { overflow: hidden; color: var(--cp-text); font-size: 14px; font-weight: 600; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.conversation__eyebrow { display: inline-flex !important; align-items: center; gap: 5px; margin-bottom: 2px; color: var(--cp-text-secondary); font-size: 11px; line-height: 1.4; }
.conversation__directory { max-width: 44vw; margin-top: 2px; overflow: hidden; color: var(--cp-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.conversation__actions { display: flex; align-items: center; }
.message-stream { height: 100%; min-height: 0; padding: 34px clamp(20px, 5vw, 96px) 24px; overflow-y: auto; overscroll-behavior-y: contain; }
.message, .empty-state { width: min(100%, 760px); margin-right: auto; margin-left: auto; }
.message { margin-bottom: 28px; }
.message.user.is-entering { animation: user-message-enter 240ms cubic-bezier(.16, 1, .3, 1) both; }
.message.user { margin-left: auto; }
.message__role { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; color: var(--cp-text-tertiary); font-size: 12px; }
.message.user .message__role { text-align: right; }
.message.user .message__role { justify-content: flex-end; }
.message p { max-width: 72ch; margin: 0; color: var(--cp-text); font-size: 14px; white-space: pre-wrap; line-height: 1.82; }
.message__markdown { max-width: min(100%, 760px); overflow-wrap: anywhere; color: var(--cp-text); font-size: 14px; line-height: 1.82; }
.message__run, .run-progress { width: min(100%, 760px); margin: 0 0 12px; color: var(--cp-text-secondary); font-size: 12px; }
.message__live-status { display: inline-flex; align-items: center; gap: 6px; margin: 2px 0 6px; padding: 3px 10px; width: fit-content; border-radius: 999px; color: var(--cp-primary); background: color-mix(in srgb, var(--cp-primary) 10%, transparent); font-size: 11px; line-height: 1.4; }
.message__live-status .is-spinning { animation: harness-live-spin 1s linear infinite; }
.message__run summary, .run-progress summary { display: flex; align-items: center; min-width: 0; gap: 8px; width: fit-content; color: var(--cp-text-secondary); cursor: pointer; list-style: none; }
.message__run summary::-webkit-details-marker, .run-progress summary::-webkit-details-marker { display: none; }
.run-summary__label, .run-progress__label, .run-activity__label { min-width: 0; }
.run-summary__meta, .message__run time, .run-progress time { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 11px; }
.run-summary__chevron { flex: 0 0 auto; color: var(--cp-text-tertiary); font-size: 12px; opacity: 0; transform: rotate(0); transition: opacity $transition-fast, transform $transition-fast; }
.message__run summary:hover .run-summary__chevron, .run-progress summary:hover .run-summary__chevron, .message__run summary:focus-visible .run-summary__chevron, .run-progress summary:focus-visible .run-summary__chevron { opacity: 1; }
.message__run details[open] > summary .run-summary__chevron, .run-progress details[open] > summary .run-summary__chevron, .message__run[open] > summary .run-summary__chevron, .run-progress[open] > summary .run-summary__chevron { transform: rotate(180deg); }
.message__run ol, .run-progress ol { display: grid; gap: 6px; margin: 9px 0 0; padding: 9px 0 0 12px; border-left: 1px solid var(--cp-border-light); list-style: none; }
.message__run li, .run-progress li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; min-height: 18px; color: var(--cp-text-secondary); }
.message__run li > .run-activity, .run-progress li > .run-activity { grid-column: 1 / -1; min-width: 0; }
.run-activity { width: 100%; }
.run-activity summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; width: 100%; }
.run-activity__summary-label { display: inline-flex; min-width: 0; align-items: center; gap: 5px; width: fit-content; }
.run-activity pre { max-width: 100%; margin: 7px 0 0; padding: 8px 10px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.run-activity code { font: inherit; }
.message__run li.failed .run-activity__label, .run-progress li.failed .run-activity__label, .message__run li.failed .run-activity pre, .run-progress li.failed .run-activity pre { color: var(--cp-danger); }
.run-progress { margin: 0 auto 18px; }
.run-progress__label, .message__run li.running .run-activity__label, .run-progress li.running .run-activity__label { --run-sweep-base: var(--cp-text-tertiary); --run-sweep-edge: color-mix(in srgb, var(--cp-text-tertiary) 34%, white); --run-sweep-highlight: var(--cp-bg); color: var(--run-sweep-base); }
:global([data-theme='dark']) .run-progress__label, :global([data-theme='dark']) .message__run li.running .run-activity__label, :global([data-theme='dark']) .run-progress li.running .run-activity__label { --run-sweep-base: var(--cp-text-secondary); --run-sweep-edge: color-mix(in srgb, var(--cp-text) 58%, var(--cp-text-secondary)); --run-sweep-highlight: var(--cp-text); }
@supports ((-webkit-background-clip: text) or (background-clip: text)) { .run-progress__label, .message__run li.running .run-activity__label, .run-progress li.running .run-activity__label { background: linear-gradient(100deg, var(--run-sweep-base) 0 24%, var(--run-sweep-edge) 38%, var(--run-sweep-highlight) 50%, var(--run-sweep-edge) 62%, var(--run-sweep-base) 76% 100%); background-size: 260% 100%; color: transparent; background-clip: text; -webkit-background-clip: text; animation: run-text-sweep 1.8s ease-in-out infinite; } }
.message__markdown :deep(> :first-child) { margin-top: 0; }.message__markdown :deep(> :last-child) { margin-bottom: 0; }.message__markdown :deep(h1), .message__markdown :deep(h2), .message__markdown :deep(h3), .message__markdown :deep(h4) { margin: 1.3em 0 .55em; color: var(--cp-text); font-weight: 600; line-height: 1.4; }.message__markdown :deep(h1) { font-size: 1.35em; }.message__markdown :deep(h2) { font-size: 1.2em; }.message__markdown :deep(h3), .message__markdown :deep(h4) { font-size: 1.05em; }.message__markdown :deep(p) { max-width: none; margin: 0 0 1em; white-space: normal; }.message__markdown :deep(ul), .message__markdown :deep(ol) { margin: 0 0 1em; padding-left: 1.55em; }.message__markdown :deep(li + li) { margin-top: .25em; }.message__markdown :deep(blockquote) { margin: 1em 0; padding: .2em 0 .2em 1em; border-left: 3px solid var(--cp-border); color: var(--cp-text-secondary); }.message__markdown :deep(a) { color: var(--cp-primary); text-decoration: underline; text-underline-offset: 2px; }.message__markdown :deep(code) { padding: .12em .35em; border-radius: $radius-sm; color: var(--cp-text); background: var(--cp-bg-hover); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; }.message__markdown :deep(.markdown-code-block) { position: relative; max-width: 100%; }.message__markdown :deep(.markdown-code-block pre) { padding-right: 48px; }.message__markdown :deep(.markdown-code-copy) { position: absolute; z-index: 1; top: 8px; right: 8px; display: grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); cursor: pointer; font-size: 17px; line-height: 1; opacity: 0; transition: color $transition-fast, border-color $transition-fast, background $transition-fast, opacity $transition-fast; }.message__markdown :deep(.markdown-code-copy svg) { width: 15px; height: 15px; }.message__markdown :deep(.markdown-code-block:hover .markdown-code-copy), .message__markdown :deep(.markdown-code-copy:focus-visible), .message__markdown :deep(.markdown-code-copy[data-copied='true']) { opacity: 1; }.message__markdown :deep(.markdown-code-copy:hover), .message__markdown :deep(.markdown-code-copy:focus-visible) { border-color: var(--cp-primary); color: var(--cp-primary); outline: none; }.message__markdown :deep(.markdown-code-copy[data-copied='true']) { border-color: var(--cp-success); color: var(--cp-success); }.message__markdown :deep(pre) { max-width: 100%; margin: 1em 0; padding: 12px 14px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-hover); }.message__markdown :deep(pre code) { padding: 0; background: transparent; font-size: 12px; line-height: 1.65; }.message__markdown :deep(.markdown-table) { width: fit-content; max-width: 100%; margin: 1em 0; overflow-x: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-md; }.message__markdown :deep(table) { width: max-content; border-spacing: 0; border-collapse: separate; }.message__markdown :deep(th), .message__markdown :deep(td) { min-width: 90px; padding: 7px 10px; border-right: 1px solid var(--cp-border-light); border-bottom: 1px solid var(--cp-border-light); text-align: left; }.message__markdown :deep(th) { color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-weight: 600; }.message__markdown :deep(tr > :last-child) { border-right: 0; }.message__markdown :deep(tbody tr:last-child td) { border-bottom: 0; }.message__markdown :deep(hr) { margin: 1.25em 0; border: 0; border-top: 1px solid var(--cp-border-light); }
.message.user p, .message__edit-input { width: fit-content; max-width: min(78%, 72ch); margin-left: auto; padding: 10px 13px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); border-radius: $radius-md; background: var(--cp-bg-hover); line-height: 1.7; }.message__edit-input { display: block; width: min(78%, 560px); padding: 5px; }.message__edit-input :deep(.el-textarea__inner) { min-height: 54px !important; padding: 5px 7px; border: 0; box-shadow: none; color: var(--cp-text); background: transparent; }
.message__attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }.message__actions { margin-top: 8px; }.message__toolbar { display: flex; align-items: center; gap: 4px; margin-top: 8px; opacity: 0; transition: opacity $transition-fast; }.message:hover .message__toolbar { opacity: 1; }.message__time { color: var(--cp-text-tertiary); font-size: 11px; }.message__tool-btn { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 0; border-radius: var(--cp-radius-sm, 4px); color: var(--cp-text-secondary); background: transparent; cursor: pointer; font-size: 12px; }.message__tool-btn:hover { color: var(--cp-text); background: var(--cp-bg-hover); }.message__tool-label { max-width: 0; overflow: hidden; opacity: 0; white-space: nowrap; transition: max-width $transition-fast, opacity $transition-fast; }.message__tool-btn:hover .message__tool-label { max-width: 80px; opacity: 1; }
.message.user .message__attachments { justify-content: flex-end; }.message.user .message__toolbar { justify-content: flex-end; }
.loading-dots { display: inline-flex; align-items: center; gap: 5px; width: fit-content; padding: 10px 13px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-elevated); }
.loading-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--cp-text-tertiary); animation: harness-loading-dot 1.1s ease-in-out infinite; }
.loading-dots i:nth-child(2) { animation-delay: .14s; }.loading-dots i:nth-child(3) { animation-delay: .28s; }
.loading-dots--floating { position: absolute; z-index: 1; bottom: 16px; left: 50%; width: 34px; height: 34px; justify-content: center; padding: 0; border-radius: 50%; box-shadow: 0 4px 12px rgb(24 24 27 / 12%); transform: translateX(-50%); }
.scroll-bottom { position: absolute; z-index: 1; bottom: 16px; left: 50%; display: grid; width: 32px; height: 32px; place-items: center; padding: 0; border: 1px solid var(--cp-border-light); border-radius: 50%; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); box-shadow: 0 4px 12px rgb(24 24 27 / 12%); cursor: pointer; transform: translateX(-50%); }
.scroll-bottom:hover { color: var(--cp-text); border-color: var(--cp-border); background: var(--cp-bg-hover); }
.quick-navigation { position: absolute; z-index: 2; top: 24px; bottom: 24px; left: clamp(12px, 1vw, 30px); width: 42px; min-height: 64px; padding: 0; border: 0; outline: 0; background: transparent; cursor: pointer; touch-action: none; }
.quick-navigation:focus-visible::after { position: absolute; inset: -3px; border: 2px solid color-mix(in srgb, var(--cp-primary) 70%, transparent); border-radius: $radius-sm; content: ''; }
.quick-navigation__segment { position: absolute; display: block; height: 2px; min-width: 2px; border-radius: 2px; color: transparent; background: color-mix(in srgb, var(--cp-text-tertiary) 45%, transparent); pointer-events: none; transform: translateY(-50%) scaleX(var(--quick-navigation-scale-x)) scaleY(var(--quick-navigation-scale-y)); transform-origin: left center; transition: transform 140ms ease, background-color 140ms ease; }
.quick-navigation__segment.is-active { background: var(--cp-text); }
.quick-navigation__segment.is-hovered { background: var(--cp-text); }
.quick-navigation__preview { position: absolute; z-index: 1; left: 32px; width: min(280px, calc(100vw - 320px)); height: 104px; padding: 10px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--cp-border) 84%, transparent); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-overlay); box-shadow: 0 10px 22px rgb(24 24 27 / 11%); pointer-events: none; transform: translateY(-50%); }
.quick-navigation__preview strong { display: block; overflow: hidden; color: var(--cp-text); font-size: 13px; font-weight: 600; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.quick-navigation__preview p { display: -webkit-box; height: 54px; margin: 6px 0 0; overflow: hidden; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.file-chip, .composer-chip { display: inline-flex; align-items: center; min-width: 0; gap: 5px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 88%, transparent); border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); font-size: 12px; line-height: 26px; }
.file-chip { padding: 0 8px; }
.empty-state { position: absolute; inset: 0; z-index: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 28px; padding: 24px; color: var(--cp-text-tertiary); text-align: center; pointer-events: none; }
.empty-state__hero { display: flex; flex-direction: column; align-items: center; gap: 12px; pointer-events: auto; }
.empty-state__title { margin: 0; color: var(--cp-text); font-size: 40px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.empty-state__subtitle { margin: 0; max-width: 420px; color: var(--cp-text-secondary); font-size: 14px; line-height: 1.7; }
.empty-state__cards { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; max-width: 680px; pointer-events: auto; }
.starter-card { display: flex; align-items: flex-start; gap: 10px; width: 208px; padding: 14px 14px 13px; border: 1px solid color-mix(in srgb, var(--cp-border-light) 80%, transparent); border-radius: $radius-md; background: var(--cp-bg-elevated); text-align: left; cursor: pointer; transition: border-color $transition-fast, transform $transition-fast, box-shadow $transition-fast; }
.starter-card:hover:not(:disabled) { border-color: color-mix(in srgb, var(--cp-primary) 40%, var(--cp-border)); transform: translateY(-2px); box-shadow: 0 8px 20px rgb(24 24 27 / 6%); }
.starter-card:disabled { cursor: default; opacity: .6; }
.starter-card__icon { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 8px; color: var(--cp-primary); background: color-mix(in srgb, var(--cp-primary) 12%, transparent); font-size: 16px; }
.starter-card__body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.starter-card__body strong { color: var(--cp-text); font-size: 13px; font-weight: 600; line-height: 1.4; }
.starter-card__body small { color: var(--cp-text-tertiary); font-size: 11px; line-height: 1.45; }
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
.message-changes { margin-top: 18px; }.message-changes__title { margin: 0 0 7px; color: var(--cp-text-secondary); font-size: 12px; font-weight: 600; }.file-change { display: grid; width: 100%; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid var(--cp-border-light); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-elevated); font: inherit; text-align: left; cursor: pointer; transition: border-color $transition-fast, background $transition-fast; }.file-change + .file-change { margin-top: 6px; }.file-change:hover { border-color: var(--cp-border); background: var(--cp-bg-hover); }.file-change:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }.file-change__icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg-hover); font-size: 16px; }.file-change__content { display: grid; min-width: 0; gap: 2px; }.file-change__content strong { overflow: hidden; font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }.file-change__content small { color: var(--cp-text-tertiary); font-size: 11px; }.file-change__action { display: inline-flex; align-items: center; gap: 3px; color: var(--cp-text-secondary); font-size: 11px; white-space: nowrap; }.file-change__action .app-icon { font-size: 12px; }.file-change-diff { display: grid; min-height: 0; gap: 14px; }.file-change-diff > p { margin: 0; color: var(--cp-text-secondary); font-size: 13px; line-height: 1.55; }.file-change-diff__content { max-height: calc(100vh - 160px); margin: 0; padding: 10px 0; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; background: var(--cp-bg-hover); color: var(--cp-text-secondary); font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; }.file-change-diff__content code { display: block; min-width: max-content; }.file-change-diff__content span { display: block; min-height: 18px; padding: 0 12px; }.file-change-diff__content span.is-added { color: color-mix(in srgb, var(--cp-success) 84%, var(--cp-text)); background: color-mix(in srgb, var(--cp-success) 10%, transparent); }.file-change-diff__content span.is-removed { color: color-mix(in srgb, var(--cp-danger) 84%, var(--cp-text)); background: color-mix(in srgb, var(--cp-danger) 10%, transparent); }
.session-panel h2 { margin: 0 0 13px; color: var(--cp-text-secondary); font-size: 12px; font-weight: 600; }.session-panel section + section { margin-top: 32px; padding-top: 24px; border-top: 1px solid color-mix(in srgb, var(--cp-border-light) 70%, transparent); }.session-panel dl { margin: 0; }.session-panel dl div { margin-bottom: 14px; }.session-panel dt { color: var(--cp-text-tertiary); font-size: 11px; }.session-panel dd { margin: 4px 0 0; overflow-wrap: anywhere; color: var(--cp-text-secondary); font-size: 12px; line-height: 1.55; }.tool-row { display: grid; grid-template-columns: 8px minmax(0, 1fr); gap: 6px; align-items: start; margin: 11px 0; color: var(--cp-text-secondary); font-size: 12px; }.tool-row > span { width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: var(--cp-text-tertiary); }.tool-row > span.running { background: var(--cp-primary); }.tool-row > span.ok { background: var(--cp-success); }.tool-row > span.failed { background: var(--cp-danger); }.tool-row small { grid-column: 2; overflow: hidden; color: var(--cp-text-tertiary); text-overflow: ellipsis; white-space: nowrap; }.tool-diff { grid-column: 1 / -1; max-height: 160px; margin: 4px 0 0; padding: 6px 8px; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-sm, 4px); color: var(--cp-text-secondary); background: var(--cp-bg-hover); font: 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }

@media (max-width: 1024px) { .harness-page { grid-template-columns: 1fr; }.session-panel { display: none; } }
@media (max-width: 768px) { .conversation__header { min-height: 60px; padding: 9px 14px; }.conversation__directory { max-width: 58vw; }.message-stream { padding: 24px 16px 16px; }.message { margin-bottom: 23px; }.message p { font-size: 14px; }.message.user p { max-width: 88%; }.message__markdown :deep(.markdown-code-copy) { opacity: 1; }.permission-request-card { grid-template-columns: 24px minmax(0, 1fr); gap: 10px; margin-bottom: 8px; }.permission-request-card__actions { grid-column: 2; justify-content: flex-end; }.composer-shell { padding: 0 10px 12px; }.composer { min-height: 114px; padding: 9px 10px; }.composer-toolbar__project { max-width: 180px; }.composer-toolbar__git { max-width: 108px; }.composer-chip { max-width: 150px; }.composer-model { max-width: 150px; }.empty-state { gap: 22px; padding-bottom: 28px; }.empty-state__title { font-size: 32px; }.empty-state__subtitle { max-width: 280px; font-size: 13px; }.starter-card { width: 100%; max-width: 320px; }.quick-navigation { display: none; } }
@keyframes harness-loading-dot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
@keyframes harness-live-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
@keyframes run-text-sweep { to { background-position: -220% 0; } }
@keyframes user-message-enter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .loading-dots i, .run-progress__label, .message__run li.running .run-activity__label, .run-progress li.running .run-activity__label, .message__live-status .is-spinning, .message.user.is-entering { animation: none; } }
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
.message__usage { margin-left: auto; color: var(--cp-text-tertiary); font-size: 11px; }.run-error-card { display: flex; align-items: center; gap: 10px; margin: 0 auto 8px; width: min(100% - 32px, 760px); padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--cp-danger) 38%, var(--cp-border)); border-radius: $radius-sm; color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 6%, var(--cp-bg)); }.run-error-card > div { min-width: 0; flex: 1; }.run-error-card strong { color: var(--cp-text); font-size: 12px; }.run-error-card p { margin: 2px 0 0; color: var(--cp-text-secondary); font-size: 12px; }.run-error-card :deep(.el-button) { flex: 0 0 auto; }
.el-dialog.full-access-dialog { max-width: calc(100vw - 32px); border-radius: 18px; }.full-access-dialog .el-dialog__header { margin: 0; padding: 8px 0 0; border-bottom: 0 !important; }.full-access-dialog .el-dialog__body { padding: 12px 0 0; }.full-access-dialog .el-dialog__footer { padding: 12px 0 0; }.full-access-dialog__header { display: flex; align-items: center; gap: 9px; color: var(--cp-text); }.full-access-dialog__header .app-icon { color: var(--cp-danger); font-size: 22px; }.full-access-dialog__header h2 { margin: 0; font-size: 16px; font-weight: 600; }.full-access-dialog__copy { margin: 0; color: var(--cp-text-secondary); font-size: 14px; line-height: 1.65; }.full-access-dialog__ack { margin-top: 18px; color: var(--cp-text); font-size: 14px; }.full-access-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; }.full-access-dialog__footer .el-button { min-width: 92px; margin: 0; font-weight: 600; }
.el-dialog.git-branch-dialog { max-width: calc(100vw - 32px); border-radius: 16px; }.git-branch-dialog .el-dialog__header { margin: 0; padding: 8px 0 0; border-bottom: 0 !important; }.git-branch-dialog .el-dialog__body { padding: 14px 0 0; }.git-branch-dialog .el-dialog__footer { padding: 16px 0 0; }.git-branch-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.git-branch-dialog__header h2 { margin: 0; color: var(--cp-text); font-size: 17px; font-weight: 600; }.git-branch-dialog__header button { display: grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; cursor: pointer; }.git-branch-dialog__header button:hover { color: var(--cp-text); background: var(--cp-bg-hover); }.git-branch-dialog__label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: var(--cp-text); font-size: 13px; font-weight: 500; }.git-branch-dialog__label button { padding: 0; border: 0; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }.git-branch-dialog__label button:hover { color: var(--cp-text); }.git-branch-dialog__error { margin: 7px 0 0; color: var(--cp-danger); font-size: 12px; }.git-branch-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; }.git-branch-dialog__footer .el-button { min-width: 92px; margin: 0; font-weight: 600; }
</style>
