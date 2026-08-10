<template>
  <SettingsPageShell title="键盘快捷键">
    <div class="keyboard-shortcuts">
      <p class="page-description">查看工作台当前可用的全局快捷键。快捷键暂为固定预设，暂不支持修改。</p>

      <section class="shortcut-section" aria-labelledby="global-shortcuts-heading">
        <div class="section-heading">
          <h2 id="global-shortcuts-heading">全局快捷键</h2>
        </div>

        <div class="shortcut-list">
          <div v-for="shortcut in globalShortcuts" :key="shortcut.label" class="shortcut-row">
            <div class="shortcut-row__copy">
              <span class="shortcut-row__label">{{ shortcut.label }}</span>
              <span class="shortcut-row__hint">{{ shortcut.hint }}</span>
            </div>
            <span class="shortcut-keys" :aria-label="`${shortcut.label}快捷键`">
              <kbd v-for="key in shortcut.keys" :key="key">{{ key }}</kbd>
            </span>
          </div>
        </div>
      </section>
    </div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const shortcutModifier = computed(() => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘' : 'Ctrl')
const globalShortcuts = computed(() => [
  { label: '打开全局搜索', hint: '搜索菜单、页面、应用或命令。', keys: [shortcutModifier.value, 'K'] },
  { label: '打开设置', hint: '打开设置中心的常规页面。', keys: [shortcutModifier.value, ','] },
  { label: '打开关于', hint: '打开关于页面。', keys: [shortcutModifier.value, 'I'] },
])
</script>

<style scoped lang="scss">
.keyboard-shortcuts { max-width: 760px; }
.page-description { margin: -24px 0 38px; color: var(--cp-text-secondary); }
.section-heading { margin-bottom: 14px; }
.section-heading h2 { margin: 0; font-size: $font-lg; line-height: 1.5; }
.shortcut-list { border-top: 1px solid var(--cp-border-light); }
.shortcut-row { display: flex; align-items: center; justify-content: space-between; gap: $spacing-lg; min-height: 76px; border-bottom: 1px solid var(--cp-border-light); }
.shortcut-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.shortcut-row__label { color: var(--cp-text); font-weight: 500; }
.shortcut-row__hint { color: var(--cp-text-secondary); font-size: 12px; }
.shortcut-keys { display: inline-flex; flex: 0 0 auto; gap: 4px; }
kbd { min-width: 28px; padding: 3px 7px; color: var(--cp-text-secondary); font: inherit; font-size: $font-sm; line-height: 20px; text-align: center; background: var(--cp-bg-hover); border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-sm); }

@media (max-width: 768px) {
  .page-description { margin-top: -20px; }
  .shortcut-row { align-items: flex-start; padding: $spacing-md 0; }
  .shortcut-row__hint { line-height: 1.5; }
}
</style>
