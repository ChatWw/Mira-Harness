<template>
  <SettingsPageShell title="常规">
    <section class="general-settings" aria-label="界面语言">
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">界面语言</span>
            <span class="settings-row__hint">选择应用 UI 的显示语言。</span>
          </div>
          <el-select class="language-picker" model-value="zh-CN" aria-label="界面语言">
            <el-option label="简体中文" value="zh-CN" />
          </el-select>
        </div>
      </div>
    </section>
    <section class="general-settings" aria-label="运行设置">
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">Chrome 硬件加速</span>
            <span class="settings-row__hint">关闭后可规避部分显卡或驱动导致的白屏、闪退、渲染异常。修改后需重启应用生效。</span>
          </div>
          <el-switch :disabled="Boolean(saving)" :model-value="hardwareAcceleration" aria-label="Chrome 硬件加速" @update:model-value="setHardwareAcceleration" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">保持电脑运行</span>
            <span class="settings-row__hint">打开后阻止系统因空闲进入休眠（仍可手动睡眠/合盖休眠）。桌面端全局生效。</span>
          </div>
          <el-switch :disabled="Boolean(saving)" :model-value="keepComputerAwake" aria-label="保持电脑运行" @update:model-value="setKeepComputerAwake" />
        </div>
      </div>
    </section>
    <section class="general-settings" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" class="settings-heading">外观</h2>
      <AppearanceSettings />
    </section>
    <section class="general-settings" aria-labelledby="notifications-heading">
      <h2 id="notifications-heading" class="settings-heading">通知</h2>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy" role="status">
            <span class="settings-row__label">{{ notificationStatus?.supported === false ? '系统不支持桌面通知' : '系统通知' }}</span>
            <span class="settings-row__hint">{{ notificationError || notificationStatus?.error || '在系统设置中允许 Mira 发送通知。提醒方式和声音也受系统通知与专注模式设置影响。' }}</span>
          </div>
          <el-button :disabled="openingNotificationSettings || !notificationStatus?.settingsAvailable" @click="openNotificationSettings">打开系统设置</el-button>
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">轮次完成通知</span>
            <span class="settings-row__hint">设置 Mira 完成一轮回复后何时提醒你。</span>
          </div>
          <el-select class="language-picker" :disabled="notificationsDisabled" :model-value="notificationSettings.completion" aria-label="轮次完成通知" @update:model-value="setNotificationSetting('completion', $event)">
            <el-option label="从不" value="never" />
            <el-option label="仅在未聚焦时" value="unfocused" />
            <el-option label="始终" value="always" />
          </el-select>
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">启用权限通知</span>
            <span class="settings-row__hint">在操作需要授权或方案需要确认时显示提醒。</span>
          </div>
          <el-switch :disabled="notificationsDisabled" :model-value="notificationSettings.permissions" aria-label="启用权限通知" @update:model-value="setNotificationSetting('permissions', $event)" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">启用问题通知</span>
            <span class="settings-row__hint">在需要回答问题才能继续时显示提醒。</span>
          </div>
          <el-switch :disabled="notificationsDisabled" :model-value="notificationSettings.questions" aria-label="启用问题通知" @update:model-value="setNotificationSetting('questions', $event)" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">通知提示音</span>
            <span class="settings-row__hint">轮次完成、请求权限和提问时的提示音。</span>
          </div>
          <el-select class="language-picker" :disabled="notificationsDisabled" :model-value="notificationSettings.sound" aria-label="通知提示音" @update:model-value="setNotificationSetting('sound', $event)">
            <el-option label="默认" value="default" />
            <el-option label="静音" value="silent" />
          </el-select>
        </div>
      </div>
    </section>
    <section class="general-settings" aria-labelledby="window-heading">
      <h2 id="window-heading" class="settings-heading">窗口</h2>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">启动时</span>
            <span class="settings-row__hint">选择应用启动时的窗口状态，下次启动生效。</span>
          </div>
          <el-select class="language-picker" :disabled="Boolean(saving)" :model-value="startupWindowBehavior" aria-label="启动时" @update:model-value="setStartupWindowBehavior">
            <el-option label="窗口最大化" value="maximized" />
            <el-option label="保持上次" value="restore" />
          </el-select>
        </div>
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { DESKTOP_NOTIFICATIONS_KEY, readDesktopNotifications, type DesktopNotifications, type DesktopNotificationStatus } from '@/config/desktopNotifications'
import { platformPreferences } from '@/config/runtime'
import { getPlatformApi } from '@/platform'
import { getPreference } from '@/platform'
import type { CloseWindowBehavior } from '@/types'
import { useSettingsPreference } from '../settings/useSettingsPreference'
import AppearanceSettings from '../appearance/components/AppearanceSettings.vue'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const { saving, save } = useSettingsPreference()
onMounted(async () => {
  const snapshot = await getPlatformApi()?.getSnapshot()
  if (snapshot) {
    platformPreferences.keepComputerAwake = snapshot.preferences.keepComputerAwake === true
    platformPreferences[DESKTOP_NOTIFICATIONS_KEY] = snapshot.preferences[DESKTOP_NOTIFICATIONS_KEY]
  }
})
const notificationStatus = ref<DesktopNotificationStatus>()
const notificationError = ref('')
const openingNotificationSettings = ref(false)
const notificationSettings = computed(() => readDesktopNotifications(getPreference(DESKTOP_NOTIFICATIONS_KEY, undefined)))
const notificationsDisabled = computed(() => Boolean(saving.value) || notificationStatus.value?.supported === false)
async function refreshNotificationStatus() {
  try {
    notificationStatus.value = await getPlatformApi()?.getNotificationStatus()
    notificationError.value = ''
  } catch { notificationError.value = '无法检查通知状态，请在系统设置中检查 Mira 的通知权限。' }
}
function setNotificationSetting<K extends keyof DesktopNotifications>(key: K, value: DesktopNotifications[K]) {
  void save(DESKTOP_NOTIFICATIONS_KEY, { ...notificationSettings.value, [key]: value })
}
async function openNotificationSettings() {
  openingNotificationSettings.value = true
  try { await getPlatformApi()?.openNotificationSettings() }
  catch { notificationError.value = '无法打开系统设置，请手动前往系统的通知设置。' }
  finally { openingNotificationSettings.value = false }
}
onMounted(() => { void refreshNotificationStatus(); window.addEventListener('focus', refreshNotificationStatus) })
onUnmounted(() => window.removeEventListener('focus', refreshNotificationStatus))
const hardwareAcceleration = computed(() => getPreference<boolean>('desktopChromiumHardwareAccelerationEnabled', true) !== false)
const keepComputerAwake = computed(() => getPreference<boolean>('keepComputerAwake', false) === true)
function setHardwareAcceleration(value: boolean) { void save('desktopChromiumHardwareAccelerationEnabled', value) }
function setKeepComputerAwake(value: boolean) { void save('keepComputerAwake', value) }
const startupWindowBehavior = computed(() => getPreference<string>('startupWindowBehavior', 'maximized') === 'restore' ? 'restore' : 'maximized')
function setStartupWindowBehavior(value: string) { void save('startupWindowBehavior', value) }
const closeWindowBehavior = computed<CloseWindowBehavior>(() => getPreference<CloseWindowBehavior>('closeWindowBehavior', 'background') === 'quit' ? 'quit' : 'background')
function setCloseWindowBehavior(value: CloseWindowBehavior) { void save('closeWindowBehavior', value) }
onBeforeRouteLeave(() => !saving.value)
</script>

<style scoped lang="scss">
.general-settings { min-width: 0; }
.general-settings + .general-settings { margin-top: 24px; }
.settings-heading { margin: 0 0 12px; color: var(--cp-text); font-size: var(--settings-text-section); font-weight: 550; line-height: 1.4; }
.language-picker { width: 192px; }

.settings-list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.settings-list .settings-row { padding-right: 16px; padding-left: 16px; }
.window-behavior-picker :deep(.el-radio-button) { --el-radio-button-checked-bg-color: var(--cp-primary); --el-radio-button-checked-text-color: var(--cp-primary-contrast); --el-radio-button-checked-border-color: var(--cp-primary); }
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
