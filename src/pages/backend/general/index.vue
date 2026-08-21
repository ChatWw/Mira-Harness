<template>
  <SettingsPageShell title="常规">
    <section class="general-settings" aria-labelledby="permission-heading">
      <div class="section-heading">
        <h2 id="permission-heading">权限</h2>
        <p>选择 Agent 在对话中可使用的权限档位。</p>
      </div>

      <div class="settings-list settings-list--permission">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">默认权限</span>
            <span class="settings-row__hint">读取、列目录和网页工具自动批准；写入、编辑、删除、命令和每次 MCP 调用逐次确认。</span>
          </div>
          <el-switch :model-value="true" aria-label="默认权限已启用" disabled />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">自动审核</span>
            <span class="settings-row__hint">项目目录内的读写、删除、命令和 MCP 调用自动批准；危险命令仍会被拦截。</span>
          </div>
          <el-switch :model-value="config.autoApproveEnabled" :loading="permissionSaving" aria-label="启用自动审核" @update:model-value="setPermissionAvailability('autoApproveEnabled', $event)" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">完全访问权限</span>
            <span class="settings-row__hint">不再显示操作确认；危险命令、路径逃逸和回收站删除限制仍然有效。</span>
          </div>
          <el-switch :model-value="config.fullAccessEnabled" :loading="permissionSaving" aria-label="启用完全访问权限" @update:model-value="setPermissionAvailability('fullAccessEnabled', $event)" />
        </div>
      </div>
    </section>

    <section class="general-settings" aria-labelledby="trash-heading">
      <div class="section-heading">
        <h2 id="trash-heading">回收站</h2>
        <p>控制项目文件移入 Mira 回收站后的保留时间。</p>
      </div>

      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">保留天数</span>
            <span class="settings-row__hint">到期文件会在清理回收站时移除。</span>
          </div>
          <el-input-number :model-value="config.trashRetentionDays" :min="1" :max="30" :disabled="permissionSaving" controls-position="right" aria-label="回收站保留天数" @update:model-value="setTrashRetentionDays" />
        </div>
      </div>
    </section>

    <section class="general-settings" aria-labelledby="editor-heading">
      <div class="section-heading">
        <h2 id="editor-heading">编辑器</h2>
        <p>控制对话输入和上下文信息的显示方式。</p>
      </div>

      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">显示上下文使用情况</span>
            <span class="settings-row__hint">在对话输入区显示当前模型上下文的使用进度和详情。</span>
          </div>
          <el-switch :model-value="showContextUsage" aria-label="显示上下文使用情况" @update:model-value="setShowContextUsage" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">发送快捷键</span>
            <span class="settings-row__hint">选择按 Enter 键时是发送消息，还是在输入框内插入新行。</span>
          </div>
          <el-select class="send-shortcut-picker" :model-value="sendShortcut" aria-label="发送快捷键" @update:model-value="setSendShortcut">
            <el-option label="按 Enter 键" value="enter" />
            <el-option label="按 Cmd / Ctrl + Enter 键" value="mod-enter" />
          </el-select>
        </div>
      </div>
    </section>

    <section class="general-settings" aria-labelledby="window-heading">
      <div class="section-heading">
        <h2 id="window-heading">窗口</h2>
        <p>控制应用窗口关闭时的行为。</p>
      </div>

      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">关闭窗口时</span>
            <span class="settings-row__hint">选择点击关闭按钮后，Mira 是继续在后台运行还是直接退出。</span>
          </div>
          <el-radio-group class="window-behavior-picker" :model-value="closeWindowBehavior" aria-label="关闭窗口时" @change="setCloseWindowBehavior">
            <el-radio-button value="background">保持后台运行</el-radio-button>
            <el-radio-button value="quit">退出Mira</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { DEFAULT_PERMISSION_CONFIG, type PermissionConfig, type SendShortcut } from '@/config/harness'
import { platformPreferences } from '@/config/runtime'
import { getPlatformApi, getPreference, savePreference } from '@/platform'
import type { CloseWindowBehavior } from '@/types'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const config = reactive<PermissionConfig>({ ...DEFAULT_PERMISSION_CONFIG })
const permissionSaving = ref(false)
const closeWindowBehavior = computed<CloseWindowBehavior>(() => platformPreferences.closeWindowBehavior === 'quit' ? 'quit' : 'background')
const showContextUsage = computed(() => getPreference('showContextUsage', true))
const sendShortcut = computed<SendShortcut>(() => getPreference<SendShortcut>('sendShortcut', 'mod-enter') === 'enter' ? 'enter' : 'mod-enter')

async function loadPermissionConfig() {
  const value = await getPlatformApi()?.getHarnessPermissionConfig()
  if (value) Object.assign(config, value)
}

async function setPermissionAvailability(key: 'autoApproveEnabled' | 'fullAccessEnabled', enabled: boolean) {
  if (permissionSaving.value || config[key] === enabled) return
  const previous = config[key]
  config[key] = enabled
  permissionSaving.value = true
  try {
    const api = getPlatformApi()
    if (!api) throw new Error('权限设置仅在桌面端中可用')
    const saved = await api.saveHarnessPermissionConfig({
      globalDefaultMode: 'default',
      autoApproveEnabled: config.autoApproveEnabled,
      fullAccessEnabled: config.fullAccessEnabled,
      dangerousCommands: [...config.dangerousCommands],
      trashRetentionDays: config.trashRetentionDays,
      trashDirName: config.trashDirName,
    })
    Object.assign(config, saved)
  } catch (error) {
    config[key] = previous
    ElMessage.error(error instanceof Error ? error.message : '权限设置保存失败')
  } finally {
    permissionSaving.value = false
  }
}

async function setTrashRetentionDays(value: number | undefined) {
  if (permissionSaving.value || typeof value !== 'number' || config.trashRetentionDays === value) return
  const previous = config.trashRetentionDays
  config.trashRetentionDays = value
  permissionSaving.value = true
  try {
    const api = getPlatformApi()
    if (!api) throw new Error('回收站设置仅在桌面端中可用')
    const saved = await api.saveHarnessPermissionConfig({
      globalDefaultMode: 'default',
      autoApproveEnabled: config.autoApproveEnabled,
      fullAccessEnabled: config.fullAccessEnabled,
      dangerousCommands: [...config.dangerousCommands],
      trashRetentionDays: config.trashRetentionDays,
      trashDirName: config.trashDirName,
    })
    Object.assign(config, saved)
  } catch (error) {
    config.trashRetentionDays = previous
    ElMessage.error(error instanceof Error ? error.message : '回收站设置保存失败')
  } finally {
    permissionSaving.value = false
  }
}

function setCloseWindowBehavior(value: CloseWindowBehavior) {
  if (closeWindowBehavior.value === value) return
  savePreference('closeWindowBehavior', value)
}

function setShowContextUsage(value: boolean) { savePreference('showContextUsage', value) }
function setSendShortcut(value: string) { savePreference('sendShortcut', value === 'enter' ? 'enter' : 'mod-enter') }

onMounted(() => { void loadPermissionConfig() })
</script>

<style scoped lang="scss">
.general-settings { min-width: 0; }
.general-settings + .general-settings { margin-top: 36px; }

.section-heading { margin-bottom: 18px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: $font-semibold; letter-spacing: -0.01em; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }

.settings-list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.settings-list .settings-row { padding-right: 16px; padding-left: 16px; }
.window-behavior-picker :deep(.el-radio-button) { --el-radio-button-checked-bg-color: var(--cp-primary); --el-radio-button-checked-text-color: var(--cp-primary-contrast); --el-radio-button-checked-border-color: var(--cp-primary); }
.send-shortcut-picker { width: min(260px, 44vw); }
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 66px;
  padding: 12px 4px 12px 0;
  border-bottom: 1px solid var(--cp-border-light);
  &:last-child { border-bottom: none; }
}
.settings-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.settings-row__label { color: var(--cp-text); font-size: $font-sm; }
.settings-row__hint { color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.5; }

@media (max-width: 640px) {
  .settings-row { align-items: flex-start; }
  .settings-row :deep(.el-switch) { margin-top: 5px; flex: 0 0 auto; }
}
</style>
