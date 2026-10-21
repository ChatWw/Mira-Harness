<template>
  <SettingsPageShell title="常规">
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
          <el-radio-group class="window-behavior-picker" :disabled="Boolean(saving)" :model-value="closeWindowBehavior" aria-label="关闭窗口时" @change="setCloseWindowBehavior">
            <el-radio-button value="background">保持后台运行</el-radio-button>
            <el-radio-button value="quit">退出Mira</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { computed } from 'vue'
import { getPreference } from '@/platform'
import type { CloseWindowBehavior } from '@/types'
import { useSettingsPreference } from '../settings/useSettingsPreference'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const { saving, save } = useSettingsPreference()
const closeWindowBehavior = computed<CloseWindowBehavior>(() => getPreference<CloseWindowBehavior>('closeWindowBehavior', 'background') === 'quit' ? 'quit' : 'background')
function setCloseWindowBehavior(value: CloseWindowBehavior) { void save('closeWindowBehavior', value) }
onBeforeRouteLeave(() => !saving.value)
</script>

<style scoped lang="scss">
.general-settings { min-width: 0; }
.general-settings + .general-settings { margin-top: 32px; }

.section-heading { margin-bottom: 18px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: var(--settings-text-section); font-weight: $font-semibold; letter-spacing: -0.01em; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }

.settings-list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.settings-list .settings-row { padding-right: 16px; padding-left: 16px; }
.window-behavior-picker :deep(.el-radio-button) { --el-radio-button-checked-bg-color: var(--cp-primary); --el-radio-button-checked-text-color: var(--cp-primary-contrast); --el-radio-button-checked-border-color: var(--cp-primary); }
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
.settings-row__label { color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 500; }
.settings-row__hint { color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 24px; }

@media (max-width: 640px) {
  .settings-row { align-items: flex-start; }
  .settings-row :deep(.el-switch) { margin-top: 5px; flex: 0 0 auto; }
}
</style>
