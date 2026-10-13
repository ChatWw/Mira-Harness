<template>
  <SettingsPageShell title="键盘快捷键">
    <div class="keyboard-shortcuts">
      <p class="page-description">查看 Mira 和 Harness 工作台已支持的快捷键。以下导航快捷键为固定预设。</p>

      <section class="shortcut-section" aria-labelledby="global-shortcuts-heading">
        <div class="section-heading">
          <h2 id="global-shortcuts-heading">Mira 全局快捷键</h2>
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
      <section class="shortcut-section" aria-labelledby="harness-shortcuts-heading">
        <div class="section-heading"><h2 id="harness-shortcuts-heading">Harness 工作台</h2></div>
        <p class="section-description">仅在 Harness 中生效；菜单和弹窗打开时，以当前控件的键盘操作为准。</p>
        <div class="shortcut-list">
          <div v-for="shortcut in harnessShortcuts" :key="shortcut.label" class="shortcut-row">
            <div class="shortcut-row__copy"><span class="shortcut-row__label">{{ shortcut.label }}</span><span class="shortcut-row__hint">{{ shortcut.hint }}</span></div>
            <span class="shortcut-keys" :aria-label="`${shortcut.label}快捷键`"><kbd v-for="key in shortcut.keys" :key="key">{{ key }}</kbd></span>
          </div>
        </div>
      </section>
    </div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { miraShortcutLabel } from '@/platform/workbenchShortcuts'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const shortcutModifier = computed(() => miraShortcutLabel('').replace(/\+$/, ''))
const globalShortcuts = computed(() => [
  { label: '打开全局搜索', hint: '打开当前应用的搜索；应用未提供搜索时，使用 Mira 搜索。', keys: [shortcutModifier.value, 'K'] },
  { label: '打开设置', hint: '打开设置中心的常规页面。', keys: [shortcutModifier.value, ','] },
  { label: '切换浅色 / 深色', hint: '由 Mira 统一切换 Shell、设置及当前应用的主题，不改变草稿。', keys: [shortcutModifier.value, 'Shift', 'L'] },
  { label: '打开关于', hint: '打开关于页面。', keys: [shortcutModifier.value, 'I'] },
  { label: '关闭标签或窗口', hint: 'Harness 优先关闭可见资源面板的活动标签；没有活动资源时保存草稿后按窗口关闭设置处理。', keys: [shortcutModifier.value, 'W'] },
  { label: '放大界面', hint: '每次放大 10%，最大约 161%；等号键也可使用。', keys: [shortcutModifier.value, '+'] },
  { label: '缩小界面', hint: '每次缩小一档，最小约 75%；不改变任务和草稿。', keys: [shortcutModifier.value, '-'] },
  { label: '恢复默认大小', hint: '将整个 Mira 界面恢复为 100%。缩放档位在重启后保持。', keys: [shortcutModifier.value, '0'] },
])
const harnessShortcuts = computed(() => [
  { label: '新建任务', hint: '创建新任务草稿，保留当前任务的输入。', keys: [shortcutModifier.value, 'N'] },
  { label: '打开项目', hint: '选择本地文件夹并开始项目任务；取消选择保留当前任务和草稿。', keys: [shortcutModifier.value, 'O'] },
  { label: '搜索任务与命令', hint: '搜索会话、正文、项目文件和工作台命令。', keys: [shortcutModifier.value, 'K'] },
  { label: '打开命令搜索', hint: '与工作台搜索共用一个入口。', keys: [shortcutModifier.value, 'Shift', 'P'] },
  { label: '切换会话侧栏', hint: `输入框中也可使用；${miraShortcutLabel('B')} 在焦点任务有可转后台的命令时优先转后台。文件编辑器和终端保留自身按键行为。`, keys: [shortcutModifier.value, 'B'] },
  { label: '前台命令转后台', hint: '作用于当前焦点任务最近启动的前台命令，保留草稿；自动化命令不可转后台。', keys: [shortcutModifier.value, 'B'] },
  { label: '查找当前任务', hint: '查找当前焦点任务的正文、思考、工具和文件变更。', keys: [shortcutModifier.value, 'F'] },
  { label: '切换底部终端', hint: '打开或收起当前任务的终端。', keys: [shortcutModifier.value, 'J'] },
  { label: '切换工作区', hint: '打开或收起右侧资源面板，保留原标签。', keys: [shortcutModifier.value, shortcutModifier.value === '⌘' ? '⌥' : 'Alt', 'B'] },
  { label: '后退', hint: '返回上一个工作台位置。', keys: [shortcutModifier.value, '['] },
  { label: '前进', hint: '恢复后退前的工作台位置。', keys: [shortcutModifier.value, ']'] },
  { label: '上一个任务', hint: '按当前工作目录及侧栏排序选择上一项，保留草稿；到达首项后不循环。', keys: [shortcutModifier.value, 'Shift', '['] },
  { label: '下一个任务', hint: '按当前工作目录及侧栏排序选择下一项，保留草稿；菜单、文件编辑器和终端保留自身按键。', keys: [shortcutModifier.value, 'Shift', ']'] },
  { label: '打开模型选择', hint: '文件编辑器和终端保留自身快捷键。', keys: [shortcutModifier.value, 'M'] },
  { label: '切换权限模式', hint: '依次切换逐次确认、自动审核和完全访问，作用于下一次提交。', keys: [shortcutModifier.value, 'Shift', 'M'] },
  { label: '切换推理强度', hint: '焦点在输入框且当前模型支持推理时生效。', keys: [shortcutModifier.value, 'T'] },
  { label: '输入换行', hint: '候选列表打开时也保留换行，不选择候选或发送消息。', keys: ['Shift', 'Enter'] },
])
</script>

<style scoped lang="scss">
.keyboard-shortcuts { max-width: 760px; }
.page-description { margin: -24px 0 38px; color: var(--cp-text-secondary); }
.section-heading { margin-bottom: 14px; }
.section-heading h2 { margin: 0; font-size: $font-lg; line-height: 1.5; }
.shortcut-section + .shortcut-section { margin-top: 32px; }
.section-description { margin: -4px 0 14px; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.5; }
.shortcut-list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.shortcut-row { display: flex; align-items: center; justify-content: space-between; gap: $spacing-lg; min-height: 76px; padding: 0 16px; border-bottom: 1px solid var(--cp-border-light); &:last-child { border-bottom: none; } }
.shortcut-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.shortcut-row__label { color: var(--cp-text); font-weight: 500; }
.shortcut-row__hint { color: var(--cp-text-secondary); font-size: 12px; }
.shortcut-keys { display: inline-flex; flex: 0 0 auto; gap: 4px; }
kbd { min-width: 28px; padding: 3px 7px; color: var(--cp-text-secondary); font: inherit; font-size: $font-sm; line-height: 20px; text-align: center; background: var(--cp-bg-hover); border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-sm); }

@media (max-width: 768px) {
  .page-description { margin-top: -20px; }
  .shortcut-row { align-items: flex-start; padding: $spacing-md 16px; }
  .shortcut-row__hint { line-height: 1.5; }
}
</style>
