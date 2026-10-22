<template>
  <SettingsPageShell title="对话设置">
    <section class="general-settings" aria-labelledby="editor-heading">
      <div class="section-heading">
        <h2 id="editor-heading">对话输入</h2>
        <p>控制对话输入和上下文信息的显示方式。</p>
      </div>

      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">显示上下文使用情况</span>
            <span class="settings-row__hint">在对话输入区显示当前模型上下文的使用进度和详情。</span>
          </div>
          <el-switch :disabled="Boolean(saving)" :model-value="showContextUsage" aria-label="显示上下文使用情况" @update:model-value="setShowContextUsage" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">发送快捷键</span>
            <span class="settings-row__hint">选择按 Enter 键时是发送消息，还是在输入框内插入新行。</span>
          </div>
          <el-select class="send-shortcut-picker" :disabled="Boolean(saving)" :model-value="sendShortcut" aria-label="发送快捷键" @update:model-value="setSendShortcut">
            <el-option label="按 Enter 键" value="enter" />
            <el-option :label="`按 ${miraShortcutLabel('Enter')} 键`" value="mod-enter" />
          </el-select>
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">运行中消息处理</span>
            <span class="settings-row__hint">队列会等待当前执行结束后处理；引导会在可介入时向运行中的任务补充方向。</span>
          </div>
          <el-select class="send-shortcut-picker" :model-value="followupMode" :disabled="Boolean(saving)" :loading="followupSaving" aria-label="运行中消息处理" @update:model-value="setFollowupMode">
            <el-option label="队列" value="queue" />
            <el-option label="引导" value="guide" />
          </el-select>
        </div>
      </div>
    </section>

  </SettingsPageShell>
</template>

<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { computed } from 'vue'
import { miraShortcutLabel } from '@/platform/workbenchShortcuts'
import type { SendShortcut } from '@/config/harness'
import { resolveComposerFollowupMode } from '@/config/composerPreferences'
import { getPreference } from '@/platform'
import { useSettingsPreference } from '../settings/useSettingsPreference'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const { saving, save } = useSettingsPreference()
const followupSaving = computed(() => saving.value === 'followupMode')
const showContextUsage = computed(() => getPreference('showContextUsage', true))
const sendShortcut = computed<SendShortcut>(() => getPreference<SendShortcut>('sendShortcut', 'enter') === 'mod-enter' ? 'mod-enter' : 'enter')
const followupMode = computed(() => resolveComposerFollowupMode(getPreference('followupMode', 'queue')))
function setShowContextUsage(value: boolean) { void save('showContextUsage', value) }
function setSendShortcut(value: string) { void save('sendShortcut', value === 'enter' ? 'enter' : 'mod-enter') }
function setFollowupMode(value: string) { if (value === 'queue' || value === 'guide') void save('followupMode', value) }
onBeforeRouteLeave(() => !saving.value)
</script>

<style scoped lang="scss">
.general-settings { min-width: 0; }
.general-settings + .general-settings { margin-top: 24px; }

.section-heading { margin-bottom: 12px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: var(--settings-text-section); font-weight: 550; letter-spacing: -0.01em; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.6; }

.settings-list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.settings-list .settings-row { padding-right: 16px; padding-left: 16px; }
.send-shortcut-picker { width: 260px; }
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

@media (max-width: 640px) {
  .settings-row { align-items: flex-start; }
  .settings-row :deep(.el-switch) { margin-top: 5px; flex: 0 0 auto; }
}
</style>
