<template>
  <el-dialog v-model="fullAccessVisible" class="full-access-dialog" width="min(460px, calc(100vw - 32px))" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" align-center>
    <template #header><div class="full-access-dialog__header"><AppIcon name="WarningFilled" /><h2>确认允许完全访问?</h2></div></template>
    <p class="full-access-dialog__copy">开启允许完全访问后，Mira 将减少确认步骤，并可直接执行更多操作，包括敏感操作、文件修改或外部执行。<br>仅建议在您信任当前任务时使用。</p>
    <el-checkbox v-model="acknowledged" class="full-access-dialog__ack">我已了解风险，并愿意继续</el-checkbox>
    <template #footer><div class="full-access-dialog__footer"><el-button @click="fullAccessVisible = false">取消</el-button><el-button type="danger" :disabled="!acknowledged" @click="$emit('confirm-full-access')">允许完全访问</el-button></div></template>
  </el-dialog>

  <el-dialog v-model="gitBranchVisible" class="git-branch-dialog" width="min(460px, calc(100vw - 32px))" :show-close="false" align-center>
    <template #header><div class="git-branch-dialog__header"><h2>创建并检出分支</h2><button type="button" aria-label="关闭创建分支" @click="gitBranchVisible = false"><AppIcon name="Close" /></button></div></template>
    <label class="git-branch-dialog__label" for="git-branch-name"><span>分支名称</span><button type="button" @click="$emit('open-git-settings')">设置前缀</button></label>
    <el-input id="git-branch-name" v-model="branchName" autofocus placeholder="输入分支名称" @keyup.enter="$emit('create-git-branch')" />
    <p v-if="branchError" class="git-branch-dialog__error">{{ branchError }}</p>
    <template #footer><div class="git-branch-dialog__footer"><el-button @click="gitBranchVisible = false">关闭</el-button><el-button type="primary" :loading="branchWorking" :disabled="Boolean(branchError)" @click="$emit('create-git-branch')">创建并检出</el-button></div></template>
  </el-dialog>

  <el-drawer v-model="fileChangeVisible" :title="activeFileChange?.path || '文件变更'" direction="rtl" size="min(720px, 58vw)">
    <div v-if="activeFileChange" class="file-change-diff">
      <p>{{ activeFileChange.tool === 'delete' ? '文件已移入 Mira 回收站。' : fileChangeSummary(activeFileChange) }}</p>
      <pre v-if="activeFileChange.diff" class="file-change-diff__content"><code><span v-for="(line, index) in activeFileChange.diff.split('\n')" :key="index" :class="fileDiffLineClass(line)">{{ line || ' ' }}</span></code></pre>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HarnessFileChange } from '@/config/harness'

const props = defineProps<{
  fullAccess: boolean
  fullAccessAcknowledged: boolean
  gitBranchVisible: boolean
  branchName: string
  branchError: string
  branchWorking: boolean
  fileChangeVisible: boolean
  activeFileChange?: HarnessFileChange
}>()

const emit = defineEmits<{
  'update:fullAccess': [value: boolean]
  'update:fullAccessAcknowledged': [value: boolean]
  'update:gitBranchVisible': [value: boolean]
  'update:branchName': [value: string]
  'update:fileChangeVisible': [value: boolean]
  'confirm-full-access': []
  'open-git-settings': []
  'create-git-branch': []
}>()

const fullAccessVisible = computed({ get: () => props.fullAccess, set: value => emit('update:fullAccess', value) })
const acknowledged = computed({ get: () => props.fullAccessAcknowledged, set: value => emit('update:fullAccessAcknowledged', value) })
const gitBranchVisible = computed({ get: () => props.gitBranchVisible, set: value => emit('update:gitBranchVisible', value) })
const branchName = computed({ get: () => props.branchName, set: value => emit('update:branchName', value) })
const fileChangeVisible = computed({ get: () => props.fileChangeVisible, set: value => emit('update:fileChangeVisible', value) })
const activeFileChange = computed(() => props.activeFileChange)

function fileChangeSummary(change: HarnessFileChange) {
  const lines = change.diff?.split('\n') || []
  const added = lines.filter(line => /^\+\d/.test(line)).length
  const removed = lines.filter(line => /^-\d/.test(line)).length
  return `${added} 行新增，${removed} 行删除`
}

function fileDiffLineClass(line: string) { return line.startsWith('+') ? 'is-added' : line.startsWith('-') ? 'is-removed' : '' }
</script>

<style lang="scss">
.el-dialog.full-access-dialog { max-width: calc(100vw - 32px); border-radius: 18px; }.full-access-dialog .el-dialog__header { margin: 0; padding: 8px 0 0; border-bottom: 0 !important; }.full-access-dialog .el-dialog__body { padding: 12px 0 0; }.full-access-dialog .el-dialog__footer { padding: 12px 0 0; }.full-access-dialog__header { display: flex; align-items: center; gap: 9px; color: var(--cp-text); }.full-access-dialog__header .app-icon { color: var(--cp-danger); font-size: 22px; }.full-access-dialog__header h2 { margin: 0; font-size: 16px; font-weight: 600; }.full-access-dialog__copy { margin: 0; color: var(--cp-text-secondary); font-size: 14px; line-height: 1.65; }.full-access-dialog__ack { margin-top: 18px; color: var(--cp-text); font-size: 14px; }.full-access-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; }.full-access-dialog__footer .el-button { min-width: 92px; margin: 0; font-weight: 600; }
.el-dialog.git-branch-dialog { max-width: calc(100vw - 32px); border-radius: 16px; }.git-branch-dialog .el-dialog__header { margin: 0; padding: 8px 0 0; border-bottom: 0 !important; }.git-branch-dialog .el-dialog__body { padding: 14px 0 0; }.git-branch-dialog .el-dialog__footer { padding: 16px 0 0; }.git-branch-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.git-branch-dialog__header h2 { margin: 0; color: var(--cp-text); font-size: 17px; font-weight: 600; }.git-branch-dialog__header button { display: grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; border-radius: $radius-sm; color: var(--cp-text-secondary); background: transparent; cursor: pointer; }.git-branch-dialog__header button:hover { color: var(--cp-text); background: var(--cp-bg-hover); }.git-branch-dialog__label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: var(--cp-text); font-size: 13px; font-weight: 500; }.git-branch-dialog__label button { padding: 0; border: 0; color: var(--cp-text-secondary); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }.git-branch-dialog__label button:hover { color: var(--cp-text); }.git-branch-dialog__error { margin: 7px 0 0; color: var(--cp-danger); font-size: 12px; }.git-branch-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; }.git-branch-dialog__footer .el-button { min-width: 92px; margin: 0; font-weight: 600; }
.file-change-diff { display: grid; min-height: 0; gap: 14px; }.file-change-diff > p { margin: 0; color: var(--cp-text-secondary); font-size: 13px; line-height: 1.55; }.file-change-diff__content { max-height: calc(100vh - 160px); margin: 0; padding: 10px 0; overflow: auto; border: 1px solid var(--cp-border-light); border-radius: $radius-sm; background: var(--cp-bg-hover); color: var(--cp-text-secondary); font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; }.file-change-diff__content code { display: block; min-width: max-content; }.file-change-diff__content span { display: block; min-height: 18px; padding: 0 12px; }.file-change-diff__content span.is-added { color: color-mix(in srgb, var(--cp-success) 84%, var(--cp-text)); background: color-mix(in srgb, var(--cp-success) 10%, transparent); }.file-change-diff__content span.is-removed { color: color-mix(in srgb, var(--cp-danger) 84%, var(--cp-text)); background: color-mix(in srgb, var(--cp-danger) 10%, transparent); }
</style>
