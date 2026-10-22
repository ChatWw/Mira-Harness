<template>
  <SettingsPageShell title="权限与审批">
    <p v-if="error" class="settings-error" role="alert">{{ error }} <el-button text @click="load">重试</el-button></p>
    <section class="permission-settings" aria-labelledby="permission-heading">
      <div class="section-heading">
        <h2 id="permission-heading">权限</h2>
        <p>与输入框同步，影响手动任务后续提交；自动化任务沿用各自的权限配置。</p>
      </div>

      <div class="settings-list settings-list--permission">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">全局权限模式</span>
            <span class="settings-row__hint">新任务和已有任务后续手动提交均使用此选择，不会更改正在执行的操作。</span>
          </div>
          <el-radio-group v-if="permissionConfigLoaded" class="permission-mode-picker" :model-value="config.globalDefaultMode" :disabled="permissionSaving || !permissionConfigLoaded" aria-label="全局权限模式" @change="setGlobalDefaultMode">
            <el-radio-button value="default">逐次确认</el-radio-button>
            <el-radio-button value="auto-approve" :disabled="!config.autoApproveEnabled">帮我批准</el-radio-button>
            <el-radio-button value="full" :disabled="!config.fullAccessEnabled">完全访问</el-radio-button>
          </el-radio-group>
          <span v-else class="permission-mode-placeholder" aria-label="正在加载权限" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">允许选择“帮我批准”</span>
            <span class="settings-row__hint">项目目录内的读写、删除、命令和 MCP 调用自动批准；危险命令仍会被拦截。</span>
          </div>
          <el-switch :model-value="config.autoApproveEnabled" :loading="permissionSaving" :disabled="!permissionConfigLoaded" aria-label="启用自动审核" @update:model-value="setPermissionAvailability('autoApproveEnabled', $event)" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">允许选择“完全访问”</span>
            <span class="settings-row__hint">不再显示操作确认；危险命令、路径逃逸和回收站删除限制仍然有效。</span>
          </div>
          <el-switch :model-value="config.fullAccessEnabled" :loading="permissionSaving" :disabled="!permissionConfigLoaded" aria-label="启用完全访问权限" @update:model-value="setPermissionAvailability('fullAccessEnabled', $event)" />
        </div>
      </div>
    </section>

  </SettingsPageShell>
</template>

<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import type { PermissionMode } from '@/config/harness'
import { usePermissionSettings } from '../settings/usePermissionSettings'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const { config, loaded: permissionConfigLoaded, saving: permissionSaving, error, load, save } = usePermissionSettings()
function setGlobalDefaultMode(mode: PermissionMode) { void save({ globalDefaultMode: mode }) }
function setPermissionAvailability(key: 'autoApproveEnabled' | 'fullAccessEnabled', enabled: boolean) { void save({ [key]: enabled }) }
onBeforeRouteLeave(() => !permissionSaving.value)
</script>

<style scoped lang="scss">
.permission-settings { min-width: 0; }
.permission-settings + .permission-settings { margin-top: 24px; }

.section-heading { margin-bottom: 12px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: var(--settings-text-section); font-weight: 550; letter-spacing: -0.01em; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6; }

.settings-list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.settings-list .settings-row { padding-right: 16px; padding-left: 16px; }
.permission-mode-picker :deep(.el-radio-button) { --el-radio-button-checked-bg-color: var(--cp-primary); --el-radio-button-checked-text-color: var(--cp-primary-contrast); --el-radio-button-checked-border-color: var(--cp-primary); }
.permission-mode-placeholder { display: block; width: 360px; height: 34px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-bg-hover); }
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 60px;
  padding: 10px 4px 10px 0;
  border-bottom: 1px solid var(--cp-border-light);
  &:last-child { border-bottom: none; }
}
.settings-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.settings-row__label { color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 450; }
.settings-row__hint { color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 18px; }

</style>
