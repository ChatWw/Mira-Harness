<template>
  <div v-if="layoutStore.config.enableTabs" class="tabs-bar" :class="`tabs-style-${layoutStore.config.tabStyle}`">
    <div class="tabs-container">
      <div class="tabs-scroll" ref="scrollContainer">
        <div v-if="layoutStore.config.tabStyle === 'personalized'" class="personalized-tabs-edge" />
        <div
          v-for="(tab, index) in tabsStore.tabs"
          :key="tab.path"
          class="tab-item"
          :class="{ 'is-active': tab.path === tabsStore.activeTab }"
          @click="handleTabClick(tab)"
          @contextmenu.prevent="handleContextMenu($event, tab)"
        >
          <component v-if="layoutStore.config.showTabIcon && tab.icon" :is="tab.icon" class="tab-icon" />
          <span class="tab-title">{{ tab.title }}</span>
          <el-icon v-if="tab.closable" class="tab-close" @click.stop="handleTabClose(tab)">
            <Close />
          </el-icon>
          <span v-if="index < tabsStore.tabs.length - 1" class="tab-divider" />
        </div>
      </div>
    </div>

    <div class="tabs-actions">
      <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
        <el-button :icon="ArrowDown" circle size="small" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="refresh">
              <el-icon><Refresh /></el-icon>
              刷新当前
            </el-dropdown-item>
            <el-dropdown-item command="close" :disabled="!currentTab?.closable">
              <el-icon><Close /></el-icon>
              关闭当前
            </el-dropdown-item>
            <el-dropdown-item command="closeOthers" :disabled="tabsStore.tabs.length <= 1">
              <el-icon><CircleClose /></el-icon>
              关闭其他
            </el-dropdown-item>
            <el-dropdown-item command="closeLeft" :disabled="!canCloseLeft">
              <el-icon><Back /></el-icon>
              关闭左侧
            </el-dropdown-item>
            <el-dropdown-item command="closeRight" :disabled="!canCloseRight">
              <el-icon><Right /></el-icon>
              关闭右侧
            </el-dropdown-item>
            <el-dropdown-item command="closeAll" :disabled="tabsStore.tabs.filter(t => t.closable).length === 0">
              <el-icon><Delete /></el-icon>
              关闭全部
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Close, ArrowDown, Refresh, CircleClose, Back, Right, Delete } from '@element-plus/icons-vue'
import { useTabsStore } from '@/stores/tabs'
import { useLayoutStore } from '@/stores/layout'

const router = useRouter()
const route = useRoute()
const tabsStore = useTabsStore()
const layoutStore = useLayoutStore()
const scrollContainer = ref()

const currentTab = computed(() => tabsStore.tabs.find(t => t.path === tabsStore.activeTab))

const canCloseLeft = computed(() => {
  const index = tabsStore.tabs.findIndex(t => t.path === tabsStore.activeTab)
  return index > 0 && tabsStore.tabs.slice(0, index).some(t => t.closable)
})

const canCloseRight = computed(() => {
  const index = tabsStore.tabs.findIndex(t => t.path === tabsStore.activeTab)
  return index < tabsStore.tabs.length - 1 && tabsStore.tabs.slice(index + 1).some(t => t.closable)
})

// 监听路由变化，自动添加标签
watch(
  () => route.path,
  () => {
    if (route.meta.title) {
      tabsStore.addTab({
        path: route.path,
        title: route.meta.title as string,
        name: route.name as string,
        icon: route.meta.icon as string,
        closable: route.path !== '/dashboard',
        lastAccess: Date.now(),
      })

      // 滚动到激活标签
      nextTick(() => {
        scrollToActiveTab()
      })
    }
  },
  { immediate: true }
)

// 标签点击
function handleTabClick(tab: any) {
  if (tab.path !== route.path) {
    router.push(tab.path)
  }
}

// 关闭标签
function handleTabClose(tab: any) {
  tabsStore.closeTab(tab.path)

  // 如果关闭的是当前标签，跳转到新的激活标签
  if (tab.path === route.path) {
    const activeTab = tabsStore.tabs.find(t => t.path === tabsStore.activeTab)
    if (activeTab) {
      router.push(activeTab.path)
    }
  }
}

// 右键菜单
function handleContextMenu(event: MouseEvent, tab: any) {
  tabsStore.activeTab = tab.path
}

// 命令处理
function handleCommand(command: string) {
  switch (command) {
    case 'refresh':
      router.replace({ path: route.path, query: { ...route.query, _t: Date.now() } })
      break
    case 'close':
      if (currentTab.value?.closable) {
        handleTabClose(currentTab.value)
      }
      break
    case 'closeOthers':
      tabsStore.closeOthers(tabsStore.activeTab)
      break
    case 'closeLeft':
      tabsStore.closeLeft(tabsStore.activeTab)
      break
    case 'closeRight':
      tabsStore.closeRight(tabsStore.activeTab)
      break
    case 'closeAll':
      tabsStore.closeAll()
      router.push('/dashboard')
      break
  }
}

// 滚动到激活标签
function scrollToActiveTab() {
  const container = scrollContainer.value
  if (!container) return

  const activeEl = container.querySelector('.tab-item.is-active')
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
}
</script>

<style scoped lang="scss">
.tabs-bar {
  width: 100%;
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--cp-bg);
  border-bottom: 1px solid var(--cp-layout-border);
  padding: 0 $spacing-md;
  gap: $spacing-sm;
  flex-shrink: 0;

  .tabs-container {
    flex: 1;
    overflow: hidden;
  }

  .tabs-scroll {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .tab-item {
    @include flex-center;
    gap: 6px;
    padding: 0 $spacing-md;
    height: 32px;
    border-radius: $radius-sm;
    cursor: pointer;
    white-space: nowrap;
    transition: all $transition-fast;
    user-select: none;
    flex-shrink: 0;

    .tab-icon {
      width: 14px;
      height: 14px;
      color: var(--cp-text-secondary);
    }

    .tab-title {
      font-size: $font-sm;
      color: var(--cp-text);
    }

    .tab-close {
      width: 14px;
      height: 14px;
      color: var(--cp-text-tertiary);
      opacity: 0;
      transition: opacity $transition-fast;

      &:hover {
        color: var(--cp-text);
      }
    }

    &:hover {
      background: var(--cp-bg-hover);

      .tab-close {
        opacity: 1;
      }
    }

    &.is-active {
      background: var(--cp-primary-lighter);
      color: var(--cp-primary);

      .tab-title {
        color: var(--cp-primary);
        font-weight: 400;
      }

      .tab-icon {
        color: var(--cp-primary);
      }

      .tab-close {
        opacity: 1;
        color: var(--cp-primary);
      }
    }
  }
}

// Card 和简约样式的共用外观
.tabs-style-default,
.tabs-style-square {
  height: 40px;
  padding: 0;
  gap: 0;
  background: var(--cp-bg);

  .tabs-scroll {
    gap: 0;
  }

  .tab-item {
    justify-content: flex-start;
    min-width: 180px;
    height: 40px;
    padding: 0 $spacing-lg;
    border: 0;
    border-right: 0;
    border-radius: 0;
    background: var(--cp-bg);
    position: relative;

    .tab-icon,
    .tab-title {
      color: var(--cp-text-secondary);
    }

    .tab-title {
      font-size: $font-sm;
    }

    .tab-close {
      margin-left: auto;
      opacity: 1;
      color: var(--cp-text-tertiary);
    }

    &:not(:last-child) {
      &::before {
        content: '';
        position: absolute;
        top: 50%;
        right: 0;
        width: 1px;
        height: 20px;
        background: var(--cp-bg-hover);
        transform: translateY(-50%);
      }
    }

    &:hover {
      background: var(--cp-bg-elevated);

      .tab-icon,
      .tab-title,
      .tab-close {
        color: var(--cp-text-secondary);
      }
    }

    &.is-active {
      background: var(--cp-bg-hover);
      z-index: 1;

      &::after {
        content: '';
        position: absolute;
        right: 0;
        bottom: -1px;
        left: 0;
        height: 1px;
        background: var(--cp-bg-hover);
      }

      .tab-icon,
      .tab-title {
        color: var(--cp-text);
      }

      .tab-title {
        font-weight: $font-normal;
      }

      .tab-close {
        color: var(--cp-text-secondary);
      }
    }
  }

  .tabs-actions {
    height: 40px;
    padding: 0 $spacing-sm;
    background: var(--cp-bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

// 卡片样式
.tabs-style-card {
  height: 40px;
  padding: 0;
  gap: 0;
  background: var(--cp-bg);

  .tabs-scroll {
    gap: 0;
  }

  .tab-item {
    justify-content: flex-start;
    min-width: 180px;
    height: 32px;
    margin: $spacing-xs 0;
    padding: 0 $spacing-lg;
    border-radius: $radius-md;
    background: transparent;

    .tab-icon,
    .tab-title {
      color: var(--cp-text-secondary);
    }

    .tab-close {
      margin-left: auto;
      opacity: 1;
      color: var(--cp-text-tertiary);
    }

    &:hover {
      background: var(--cp-bg-elevated);

      .tab-icon,
      .tab-title,
      .tab-close {
        color: var(--cp-text-secondary);
      }
    }

    &.is-active {
      background: var(--cp-bg-hover);

      .tab-icon,
      .tab-title {
        color: var(--cp-text);
      }

      .tab-title {
        font-weight: $font-normal;
      }

      .tab-close {
        color: var(--cp-text-secondary);
      }
    }
  }
}

// 个性样式
.tabs-style-personalized {
  padding: 0;
  gap: 0;
  background: var(--cp-bg);

  .tabs-scroll {
    gap: 0;
  }

  .personalized-tabs-edge {
    width: 12px;
    flex-shrink: 0;
  }

  .tab-item {
    justify-content: flex-start;
    min-width: 180px;
    height: 36px;
    margin: 0 0 $spacing-xs;
    padding: 0 $spacing-lg;
    border-radius: 0 0 12px 12px;
    background: var(--cp-bg);
    position: relative;
    --personalized-tab-bg: var(--cp-bg);

    .tab-icon,
    .tab-title {
      color: var(--cp-text-secondary);
    }

    .tab-close {
      margin-left: auto;
      opacity: 1;
      color: var(--cp-text-tertiary);
    }

    .tab-divider {
      position: absolute;
      top: 50%;
      right: 0;
      z-index: 2;
      width: 1px;
      height: 20px;
      background: var(--cp-bg-hover);
      transform: translateY(-50%);
    }

    &:hover {
      background: var(--cp-bg-elevated);
      --personalized-tab-bg: var(--cp-bg-elevated);

      .tab-icon,
      .tab-title,
      .tab-close {
        color: var(--cp-text-secondary);
      }
    }

    &.is-active {
      background: var(--cp-bg-hover);
      --personalized-tab-bg: var(--cp-bg-hover);
      z-index: 1;
      box-shadow: none;

      .tab-icon,
      .tab-title {
        color: var(--cp-text);
      }

      .tab-title {
        font-weight: $font-normal;
      }

      .tab-close {
        color: var(--cp-text-secondary);
      }
    }

    &:hover,
    &.is-active {
      &::before,
      &::after {
        content: '';
        position: absolute;
        top: 0;
        width: 12px;
        height: 12px;
        pointer-events: none;
      }

      &::before {
        left: -12px;
        border-top-right-radius: 12px;
        box-shadow: 5px -5px 0 5px var(--personalized-tab-bg);
      }

      &::after {
        right: -12px;
        border-top-left-radius: 12px;
        box-shadow: -5px -5px 0 5px var(--personalized-tab-bg);
      }
    }
  }
}

// 方块样式
.tabs-style-square {
  .tab-item {
    &.is-active {
      box-shadow: inset 0 -1px 0 var(--cp-bg-hover);

      &::after {
        top: 0;
        bottom: auto;
        height: 3px;
        background: var(--cp-primary);
      }
    }
  }
}

.tabs-actions {
  flex-shrink: 0;
  height: 40px;
  padding: 0 $spacing-sm;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
