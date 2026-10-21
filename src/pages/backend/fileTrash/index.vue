<template>
  <SettingsPageShell title="文件回收站">
    <p v-if="error" class="settings-error" role="alert">{{ error }} <el-button text @click="load">重试</el-button></p>
    <section class="data-trash" aria-labelledby="trash-heading">
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
          <el-input-number v-if="loaded" :model-value="config.trashRetentionDays" :min="1" :max="30" :disabled="saving" controls-position="right" aria-label="回收站保留天数" @update:model-value="setTrashRetentionDays" />
          <span v-else class="settings-row__hint" role="status">正在读取保留时间…</span>
        </div>
      </div>
    </section>

  </SettingsPageShell>
</template>

<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { usePermissionSettings } from '../settings/usePermissionSettings'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const { config, loaded, saving, error, load, save } = usePermissionSettings()
function setTrashRetentionDays(value: number | undefined) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 30) void save({ trashRetentionDays: value })
}
onBeforeRouteLeave(() => !saving.value)
</script>

<style scoped lang="scss">
.section-heading { margin-bottom: 16px; }
.section-heading h2 { margin: 0; font-size: var(--settings-text-section); font-weight: 600; }
.section-heading p { margin-top: 6px; color: var(--cp-text-secondary); line-height: 1.6; }
.settings-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 16px; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.settings-row__copy { display: grid; gap: 4px; }
.settings-row__label { font-weight: 500; }
.settings-row__hint { color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 24px; }
</style>
