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
          <el-radio-group
            :model-value="closeWindowBehavior"
            aria-label="关闭窗口时"
            @change="setCloseWindowBehavior"
          >
            <el-radio-button value="background">保持后台运行</el-radio-button>
            <el-radio-button value="quit">退出Mira</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { platformPreferences } from '@/config/runtime'
import { savePreference } from '@/platform'
import type { CloseWindowBehavior } from '@/types'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const closeWindowBehavior = computed<CloseWindowBehavior>(() => {
  const value = platformPreferences.closeWindowBehavior
  return value === 'quit' ? 'quit' : 'background'
})

function setCloseWindowBehavior(value: CloseWindowBehavior) {
  if (closeWindowBehavior.value === value) return
  savePreference('closeWindowBehavior', value)
}
</script>

<style scoped lang="scss">
.general-settings { min-width: 0; }

.section-heading { margin-bottom: 18px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: $font-semibold; letter-spacing: -0.01em; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }

.settings-list { overflow: hidden; border-top: 1px solid var(--cp-border-light); }
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 54px;
  padding: 10px 4px 10px 0;
  border-bottom: 1px solid var(--cp-border-light);
}
.settings-row__copy { display: flex; flex-direction: column; gap: 4px; }
.settings-row__label { color: var(--cp-text); font-size: $font-sm; }
.settings-row__hint { color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.5; }
</style>
