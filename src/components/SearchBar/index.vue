<template>
  <el-dialog
    v-model="visible"
    class="search-dialog"
    :show-close="false"
    :close-on-click-modal="true"
    width="600px"
    top="15vh"
    @close="handleClose"
  >
    <div class="search-container">
      <el-input
        ref="searchInputRef"
        v-model="keyword"
        size="large"
        placeholder="搜索菜单、页面..."
        prefix-icon="Search"
        clearable
        @keydown.up.prevent="handleUp"
        @keydown.down.prevent="handleDown"
        @keydown.enter.prevent="handleEnter"
      />

      <div v-if="filteredResults.length" class="search-results">
        <div
          v-for="(item, index) in filteredResults"
          :key="item.path"
          class="result-item"
          :class="{ 'is-active': index === activeIndex }"
          @click="handleSelect(item)"
          @mouseenter="activeIndex = index"
        >
          <component :is="item.icon" v-if="item.icon" class="result-icon" />
          <div class="result-content">
            <div class="result-title">{{ item.title }}</div>
            <div v-if="item.parent" class="result-path">{{ item.parent }}</div>
          </div>
        </div>
      </div>

      <div v-else-if="keyword" class="search-empty">
        <el-empty description="未找到相关内容" :image-size="80" />
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import type { MenuItem } from '@/types'
import { usePermissionStore } from '@/stores/permission'

const router = useRouter()
const visible = ref(false)
const keyword = ref('')
const activeIndex = ref(0)
const searchInputRef = ref()
const permissionStore = usePermissionStore()

interface SearchResult {
  title: string
  path: string
  icon?: string
  parent?: string
}

// 扁平化菜单数据
const flatMenus = computed<SearchResult[]>(() => {
  const results: SearchResult[] = []

  const flatten = (items: MenuItem[], parent?: string) => {
    items.forEach(item => {
      if (item.path) {
        results.push({
          title: item.title,
          path: item.path,
          icon: item.icon,
          parent,
        })
      }
      if (item.children) {
        flatten(item.children, item.title)
      }
    })
  }

  flatten(permissionStore.menuRoutes)
  return results
})

// 过滤结果
const filteredResults = computed(() => {
  if (!keyword.value) return []

  const kw = keyword.value.toLowerCase()
  return flatMenus.value
    .filter(item => item.title.toLowerCase().includes(kw) || item.path.toLowerCase().includes(kw))
    .slice(0, 8)
})

// 键盘导航
function handleUp() {
  if (activeIndex.value > 0) {
    activeIndex.value--
  }
}

function handleDown() {
  if (activeIndex.value < filteredResults.value.length - 1) {
    activeIndex.value++
  }
}

function handleEnter() {
  if (filteredResults.value[activeIndex.value]) {
    handleSelect(filteredResults.value[activeIndex.value])
  }
}

function handleSelect(item: SearchResult) {
  router.push(item.path)
  handleClose()
}

function handleClose() {
  visible.value = false
  keyword.value = ''
  activeIndex.value = 0
}

function open() {
  visible.value = true
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

// Ctrl+K 快捷键
function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    open()
  } else if (e.key === 'Escape' && visible.value) {
    handleClose()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// 监听 keyword 变化重置 activeIndex
watch(keyword, () => {
  activeIndex.value = 0
})

defineExpose({ open })
</script>

<style scoped lang="scss">
.search-dialog {
  :deep(.el-dialog) {
    background: var(--cp-bg-elevated);
    border-radius: $radius-lg;
    box-shadow: $shadow-xl;
  }

  :deep(.el-dialog__header) {
    display: none;
  }

  :deep(.el-dialog__body) {
    padding: $spacing-lg;
  }
}

.search-container {
  min-height: 100px;
}

.search-results {
  margin-top: $spacing-md;
  max-height: 400px;
  overflow-y: auto;
}

.result-item {
  @include flex-center;
  justify-content: flex-start;
  padding: $spacing-md;
  border-radius: $radius-md;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover,
  &.is-active {
    background: var(--cp-bg-hover);
  }

  &.is-active {
    border-left: 3px solid var(--cp-primary);
  }
}

.result-icon {
  width: 20px;
  height: 20px;
  margin-right: $spacing-md;
  color: var(--cp-text-secondary);
}

.result-content {
  flex: 1;
}

.result-title {
  font-size: $font-base;
  color: var(--cp-text);
  font-weight: 500;
}

.result-path {
  font-size: $font-xs;
  color: var(--cp-text-tertiary);
  margin-top: 2px;
}

.search-empty {
  padding: $spacing-xl 0;
}
</style>
