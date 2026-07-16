<template>
  <div v-if="layoutStore.config.enableTabs" class="tabs-bar" :class="`tabs-style-${layoutStore.config.tabStyle}`">
    <div class="tabs-container">
      <div class="tabs-scroll" ref="scrollContainer">
        <div
          v-for="tab in tabsStore.tabs"
          :key="tab.path"
          class="tab-item"
          :class="{ 'is-active': tab.path === tabsStore.activeTab }"
          @click="handleTabClick(tab)"
          @contextmenu.prevent="handleContextMenu($event, tab)"
        >
          <component v-if="tab.icon" :is="tab.icon" class="tab-icon" />
          <span class="tab-title">{{ tab.title }}</span>
          <el-icon v-if="tab.closable" class="tab-close" @click.stop="handleTabClose(tab)">
            <Close />
          </el-icon>
        </div>
      </div>
    </div>

    <div class="tabs-actions">
      <el-dropdown trigger="click" @command="handleCommand">
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
  border-bottom: 1px solid var(--cp-border);
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
        font-weight: 500;
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

// Card 样式
.tabs-style-card {
  .tab-item {
    border: 1px solid transparent;

    &.is-active {
      border-color: var(--cp-border);
      border-bottom-color: var(--cp-bg);
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }
  }
}

// Chrome 样式
.tabs-style-chrome {
  .tabs-scroll {
    gap: 0;
  }

  .tab-item {
    border-radius: $radius-md $radius-md 0 0;
    margin-right: -8px;
    padding: 0 $spacing-lg;
    position: relative;

    &::before,
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      width: 8px;
      height: 8px;
    }

    &::before {
      left: -8px;
    }

    &::after {
      right: -8px;
    }

    &.is-active {
      z-index: 1;
      background: var(--cp-bg-elevated);
      box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.05);
    }
  }
}

// Plain 样式
.tabs-style-plain {
  .tab-item {
    border-radius: 0;
    border-bottom: 2px solid transparent;

    &.is-active {
      background: transparent;
      border-bottom-color: var(--cp-primary);
    }
  }
}

.tabs-actions {
  flex-shrink: 0;
}
</style>
