<template>
  <div class="windows-titlebar" aria-label="Windows 窗口标题栏">
    <div v-if="dragRegion" class="windows-titlebar__drag-region" aria-hidden="true" />

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
</template>

<script setup lang="ts">
withDefaults(defineProps<{ dragRegion?: boolean }>(), {
  dragRegion: true,
})

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

.windows-titlebar__window-controls {
  position: fixed;
  z-index: 110;
  top: 0;
  right: 0;
  display: flex;
  height: var(--windows-titlebar-height);
  -webkit-app-region: no-drag;
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
