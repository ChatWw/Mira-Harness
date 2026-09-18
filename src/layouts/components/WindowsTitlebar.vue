<template>
  <div class="windows-titlebar" aria-label="Windows 窗口标题栏">
    <div class="windows-titlebar__drag-region" aria-hidden="true" />

    <nav class="windows-titlebar__menu" :style="{ left: `${menuLeft}px` }" aria-label="应用菜单">
      <el-dropdown
        v-for="group in windowsMenuGroups"
        :key="group.label"
        trigger="click"
        placement="bottom-start"
        :show-arrow="false"
        popper-class="windows-titlebar-menu-popper"
        @command="runWindowCommand"
      >
        <button type="button" class="windows-titlebar__menu-trigger">{{ group.label }}</button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="item in group.items"
              :key="item.action"
              :command="item.action"
              :divided="item.divided"
            >
              {{ item.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </nav>

    <div class="windows-titlebar__actions">
      <el-tooltip content="全局搜索 (Ctrl+K)" placement="bottom">
        <button type="button" class="windows-titlebar__search" aria-label="全局搜索" @click="commandPaletteStore.open()">
          <AppIcon name="Search" />
        </button>
      </el-tooltip>
      <div class="windows-titlebar__window-controls" aria-label="窗口控制">
        <button type="button" class="windows-titlebar__window-control" aria-label="最小化" @click="runWindowCommand('minimize')">
          <span class="windows-titlebar__glyph windows-titlebar__glyph--minimize" />
        </button>
        <button type="button" class="windows-titlebar__window-control" aria-label="最大化或还原" @click="runWindowCommand('maximize')">
          <span class="windows-titlebar__glyph windows-titlebar__glyph--maximize" />
        </button>
        <button type="button" class="windows-titlebar__window-control windows-titlebar__window-control--close" aria-label="关闭窗口" @click="runWindowCommand('close')">
          <span class="windows-titlebar__glyph windows-titlebar__glyph--close" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCommandPaletteStore } from '@/stores/commandPalette'

withDefaults(defineProps<{ menuLeft?: number }>(), {
  menuLeft: 20,
})

const commandPaletteStore = useCommandPaletteStore()
type WindowMenuGroup = { label: string, items: Array<{ label: string, action: string, divided?: boolean }> }
const windowsMenuGroups: WindowMenuGroup[] = [
  { label: '应用', items: [{ label: '关于 Mira', action: 'about' }, { label: '退出 Mira', action: 'quit', divided: true }] },
  { label: '编辑', items: [{ label: '撤销', action: 'undo' }, { label: '重做', action: 'redo' }, { label: '剪切', action: 'cut', divided: true }, { label: '复制', action: 'copy' }, { label: '粘贴', action: 'paste' }, { label: '全选', action: 'selectAll' }] },
  { label: '视图', items: [...(import.meta.env.DEV ? [{ label: '重新加载', action: 'reload' }, { label: '开发者工具', action: 'toggleDevTools' }] : []), { label: '切换全屏', action: 'toggleFullscreen', divided: import.meta.env.DEV }] },
  { label: '窗口', items: [{ label: '最小化', action: 'minimize' }, { label: '最大化/还原', action: 'maximize' }, { label: '关闭窗口', action: 'close' }] },
]

function runWindowCommand(action: string) {
  void window.platform?.windowCommand(action)
}
</script>

<style scoped lang="scss">
.windows-titlebar {
  --windows-titlebar-height: var(--cp-titlebar-height, 36px);
}

.windows-titlebar__drag-region {
  position: fixed;
  z-index: 100;
  top: 0;
  right: 0;
  left: 0;
  height: var(--windows-titlebar-height);
  -webkit-app-region: drag;
}

.windows-titlebar__menu {
  position: fixed;
  z-index: 110;
  top: 0;
  display: flex;
  height: var(--windows-titlebar-height);
  align-items: center;
  -webkit-app-region: no-drag;
}

.windows-titlebar__menu-trigger {
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--cp-radius-sm);
  color: var(--cp-text-secondary);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 13px;

  &:hover,
  &:focus-visible {
    color: var(--cp-text);
    background: var(--cp-bg-hover);
    outline: none;
  }
}

.windows-titlebar__actions {
  position: fixed;
  z-index: 110;
  top: 0;
  right: 16px;
  display: flex;
  height: var(--windows-titlebar-height);
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.windows-titlebar__search {
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: var(--cp-radius-md);
  color: var(--cp-text-secondary);
  background: transparent;
  cursor: pointer;
  font-size: 16px;

  &:hover,
  &:focus-visible {
    color: var(--cp-text);
    background: var(--cp-sidebar-menu-hover-bg);
    outline: none;
  }
}

.windows-titlebar__window-controls {
  display: flex;
  height: 100%;
  margin-right: -16px;
}

.windows-titlebar__window-control {
  display: grid;
  width: 44px;
  height: 100%;
  padding: 0;
  place-items: center;
  border: 0;
  color: var(--cp-text-secondary);
  background: transparent;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    color: var(--cp-text);
    background: var(--cp-bg-hover);
    outline: none;
  }

  &--close:hover,
  &--close:focus-visible {
    color: #fff;
    background: #c42b1c;
  }
}

.windows-titlebar__glyph {
  position: relative;
  display: block;
  width: 10px;
  height: 10px;

  &--minimize::after {
    position: absolute;
    right: 0;
    bottom: 1px;
    left: 0;
    height: 1px;
    background: currentcolor;
    content: '';
  }

  &--maximize {
    border: 1px solid currentcolor;
  }

  &--close::before,
  &--close::after {
    position: absolute;
    top: 4px;
    left: 0;
    width: 12px;
    height: 1px;
    background: currentcolor;
    content: '';
  }

  &--close::before { transform: rotate(45deg); }
  &--close::after { transform: rotate(-45deg); }
}
</style>

<style lang="scss">
.el-popper.windows-titlebar-menu-popper,
.windows-titlebar-menu-popper {
  min-width: 160px;
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-md);
  background: var(--cp-bg-elevated) !important;
  box-shadow: 0 8px 24px rgb(24 24 27 / 14%);

  .el-dropdown-menu {
    padding: 4px;
    background: transparent;
  }

  .el-dropdown-menu__item {
    min-height: 30px;
    padding: 0 10px;
    border-radius: var(--cp-radius-sm);
    color: var(--cp-text);
    font-size: 13px;

    &:hover,
    &:focus {
      color: var(--cp-text);
      background: var(--cp-bg-hover);
    }
  }
}
</style>
