<template>
  <el-dialog
    v-model="paletteStore.visible"
    class="search-dialog"
    :show-close="false"
    :close-on-click-modal="true"
    :width="isMobile ? 'calc(100% - 24px)' : '680px'"
    top="12vh"
    @opened="focusInput"
    @close="handleClose"
  >
    <div ref="searchContainerRef" class="search-container">
      <el-input
        ref="searchInputRef"
        v-model="keyword"
        size="large"
        placeholder="搜索菜单、页面、应用或命令"
        clearable
        @keydown.up.prevent="moveActive(-1)"
        @keydown.down.prevent="moveActive(1)"
        @keydown.enter.prevent="selectActive"
      ><template #prefix><AppIcon name="Search" /></template></el-input>

      <div class="search-hints" aria-label="键盘操作提示">
        <span><kbd>{{ shortcutModifier }}</kbd><kbd>K</kbd> 打开</span>
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>↵</kbd> 确认</span>
        <span><kbd>Esc</kbd> 关闭</span>
      </div>

      <div v-if="keyword" class="search-results">
        <template v-for="(item, index) in filteredResults" :key="item.id">
          <div v-if="index === 0 || item.category !== filteredResults[index - 1]?.category" class="result-section">
            {{ categoryLabels[item.category] }}
          </div>
          <button
            class="result-item"
            :class="{ 'is-active': index === activeIndex }"
            type="button"
            @click="handleSelect(item)"
            @mouseenter="activeIndex = index"
          >
            <AppIcon class="result-icon" :name="item.icon || 'Grid'" />
            <span class="result-content">
              <span class="result-title">{{ item.title }}</span>
              <span v-if="item.parent || item.path" class="result-path">{{ item.parent || item.path }}</span>
            </span>
            <span class="result-category">{{ categoryLabels[item.category] }}</span>
          </button>
        </template>
      </div>

      <div v-else class="default-sections">
        <section v-if="recentResults.length" class="default-section">
          <div class="section-heading">
            <span>最近使用</span>
            <el-button v-if="recentResults.length > 3" link size="small" @click="showAllRecent = !showAllRecent">
              {{ showAllRecent ? '收起' : '展开' }}
            </el-button>
          </div>
          <button
            v-for="(item, index) in visibleRecentResults"
            :key="item.id"
            class="result-item"
            :class="{ 'is-active': index === activeIndex }"
            type="button"
            @click="handleSelect(item)"
            @mouseenter="activeIndex = index"
          >
            <AppIcon class="result-icon" :name="item.icon || 'Grid'" />
            <span class="result-content">
              <span class="result-title">{{ item.title }}</span>
              <span v-if="item.parent || item.path" class="result-path">{{ item.parent || item.path }}</span>
            </span>
          </button>
        </section>

        <section class="default-section">
          <div class="section-heading"><span>系统操作</span></div>
          <button
            v-for="(item, index) in commandActions"
            :key="item.id"
            class="result-item"
            :class="{ 'is-active': index + visibleRecentResults.length === activeIndex }"
            type="button"
            @click="handleSelect(item)"
            @mouseenter="activeIndex = index + visibleRecentResults.length"
          >
            <AppIcon class="result-icon" :name="item.icon || 'Grid'" />
            <span class="result-content">
              <span class="result-title">{{ item.title }}</span>
              <span v-if="item.parent" class="result-path">{{ item.parent }}</span>
            </span>
          </button>
        </section>
      </div>

      <div v-if="keyword && !filteredResults.length" class="search-empty">
        <el-empty description="未找到相关内容" :image-size="72" />
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { pinyin } from 'pinyin-pro'
import { findCommandNavigation, getCommandNavigationItems } from '@/config/commandPalette'
import { navigateToPath } from '@/config/navigation'
import type { CommandNavigationCategory, CommandNavigationItem } from '@/config/commandPalette'
import { useCommandPaletteStore } from '@/stores/commandPalette'
import { useLayoutStore } from '@/stores/layout'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const paletteStore = useCommandPaletteStore()
const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const keyword = ref('')
const activeIndex = ref(0)
const showAllRecent = ref(false)
const searchInputRef = ref()
const searchContainerRef = ref<HTMLElement>()
const isFullscreen = ref(Boolean(document.fullscreenElement))
const isMobile = ref(window.innerWidth < 768)
const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const searchTokenCache = new Map<string, string[]>()

type CommandPaletteItem = CommandNavigationItem | (Omit<CommandNavigationItem, 'category' | 'path'> & {
  category: 'command'
  path?: string
  action: () => void | Promise<void>
})

const categoryLabels: Record<CommandNavigationCategory | 'command', string> = {
  page: '页面',
  application: '应用',
  session: '最近对话',
  command: '系统操作',
}

const shortcutModifier = computed(() => isMac ? '⌘' : 'Ctrl')
const recentResults = computed(() => paletteStore.recentItems
  .map(item => findCommandNavigation(item.id))
  .filter((item): item is CommandNavigationItem => Boolean(item))
)
const visibleRecentResults = computed(() => showAllRecent.value ? recentResults.value : recentResults.value.slice(0, 3))
const commandActions = computed<CommandPaletteItem[]>(() => [
  {
    id: 'command-theme',
    title: themeStore.themeMode === 'light' ? '切换为深色模式' : '切换为浅色模式',
    icon: themeStore.themeMode === 'light' ? 'Moon' : 'Sunny',
    category: 'command',
    parent: '系统操作',
    action: () => themeStore.toggleThemeModeWithTransition(undefined, layoutStore.config.themeTransitionAnimation),
  },
  {
    id: 'command-fullscreen',
    title: isFullscreen.value ? '退出全屏' : '进入全屏',
    icon: isFullscreen.value ? 'Crop' : 'FullScreen',
    category: 'command',
    parent: '系统操作',
    action: async () => {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    },
  },
  {
    id: 'command-settings',
    title: '打开设置（全局配置）',
    icon: 'Setting',
    category: 'command',
    parent: '系统操作',
    action: async () => { await router.push({ path: '/settings/general', query: { from: router.currentRoute.value.fullPath } }) },
  },
  {
    id: 'command-usage',
    title: '用量与成本',
    icon: 'DataAnalysis',
    category: 'command',
    parent: '系统操作',
    action: async () => { await router.push('/workspace/usage') },
  },
  {
    id: 'command-projects',
    title: '项目管理',
    icon: 'FolderOpened',
    category: 'command',
    parent: '系统操作',
    action: async () => { await router.push('/workspace/projects') },
  },
  {
    id: 'command-history',
    title: '查看全部对话',
    icon: 'Clock',
    category: 'command',
    parent: '系统操作',
    action: async () => { await router.push('/workspace/history') },
  },
])
const defaultResults = computed(() => [
  ...visibleRecentResults.value,
  ...commandActions.value,
])

const filteredResults = computed(() => {
  const normalizedKeyword = normalizeSearchTerm(keyword.value)
  if (!normalizedKeyword) return []

  return [...getCommandNavigationItems(), ...commandActions.value]
    .map((item, index) => ({ item, index, score: matchScore(item, normalizedKeyword) }))
    .filter(entry => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, 10)
    .map(entry => entry.item)
})

const selectableItems = computed(() => keyword.value ? filteredResults.value : defaultResults.value)

function matchScore(item: CommandPaletteItem, normalizedKeyword: string) {
  return [
    matchValue(item.title, normalizedKeyword, 0),
    matchValue(item.parent, normalizedKeyword, 10),
    matchValue(item.path, normalizedKeyword, 20),
  ].find(score => score >= 0) ?? -1
}

function matchValue(value: string | undefined, keyword: string, baseScore: number) {
  if (!value) return -1

  const [original, fullPinyin, initials] = getSearchTokens(value)
  if (original.includes(keyword)) return baseScore
  if (fullPinyin.includes(keyword)) return baseScore + 1
  if (initials.includes(keyword)) return baseScore + 2
  if ([original, fullPinyin, initials].some(token => isFuzzyMatch(token, keyword))) return baseScore + 3
  return -1
}

function getSearchTokens(value: string) {
  const cached = searchTokenCache.get(value)
  if (cached) return cached

  const syllables = pinyin(value, { toneType: 'none', type: 'array' })
  const tokens = [
    normalizeSearchTerm(value),
    normalizeSearchTerm(syllables.join('')),
    normalizeSearchTerm(syllables.map(syllable => syllable[0]).join('')),
  ]
  searchTokenCache.set(value, tokens)
  return tokens
}

function normalizeSearchTerm(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function isFuzzyMatch(value: string, keyword: string) {
  let keywordIndex = 0
  for (const character of value) {
    if (character === keyword[keywordIndex]) keywordIndex++
    if (keywordIndex === keyword.length) return true
  }
  return false
}

function moveActive(direction: number) {
  const length = selectableItems.value.length
  if (!length) return
  activeIndex.value = (activeIndex.value + direction + length) % length
}

function selectActive() {
  const item = selectableItems.value[activeIndex.value]
  if (item) handleSelect(item)
}

async function handleSelect(item: CommandPaletteItem) {
  if ('action' in item) await item.action()
  else {
    const mode = await navigateToPath(router, item.path)
    if (mode === 'external') paletteStore.recordVisit(item.id)
  }
  handleClose()
}

function handleClose() {
  paletteStore.close()
  keyword.value = ''
  activeIndex.value = 0
  showAllRecent.value = false
}

function focusInput() {
  nextTick(() => searchInputRef.value?.focus())
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteStore.open()
  } else if (event.key === 'Escape' && paletteStore.visible) {
    handleClose()
  }
}

function updateViewport() {
  isMobile.value = window.innerWidth < 768
}

function updateFullscreen() {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

watch([keyword, selectableItems], () => {
  activeIndex.value = 0
})

watch(showAllRecent, () => {
  activeIndex.value = 0
})

watch(activeIndex, scrollActiveResultIntoView)

function scrollActiveResultIntoView() {
  nextTick(() => {
    searchContainerRef.value
      ?.querySelector<HTMLElement>('.result-item.is-active')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('fullscreenchange', updateFullscreen)
  window.addEventListener('resize', updateViewport)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('fullscreenchange', updateFullscreen)
  window.removeEventListener('resize', updateViewport)
})
</script>

<style scoped lang="scss">
.search-dialog {
  :deep(.el-dialog) {
    max-width: 680px;
    margin-bottom: 0;
    overflow: hidden;
    background: var(--cp-bg-elevated);
    border: 1px solid var(--cp-border-light);
    border-radius: var(--cp-radius-md);
    box-shadow: $shadow-xl;
  }

  :deep(.el-dialog__header) { display: none; }
  :deep(.el-dialog__body) { padding: $spacing-lg; }
}

.search-container { min-height: 120px; }

.search-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 9px 2px 2px;
  color: var(--cp-text-tertiary);
  font-size: $font-xs;

  span { display: inline-flex; align-items: center; gap: 3px; }
  kbd {
    min-width: 18px;
    padding: 1px 4px;
    color: var(--cp-text-secondary);
    font: inherit;
    line-height: 16px;
    text-align: center;
    background: var(--cp-bg-hover);
    border: 1px solid var(--cp-border-light);
    border-radius: var(--cp-radius-sm);
  }
}

.search-results, .default-sections {
  max-height: min(440px, 54vh);
  margin-top: $spacing-md;
  overflow-y: auto;
}

.default-section + .default-section { margin-top: $spacing-lg; }
.section-heading, .result-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $spacing-sm $spacing-xs;
  color: var(--cp-text-secondary);
  font-size: $font-sm;
  font-weight: 600;
}
.result-section { padding-top: $spacing-sm; }
.result-section:first-child { padding-top: 0; }

.result-item {
  display: flex;
  width: 100%;
  min-height: 54px;
  align-items: center;
  gap: $spacing-md;
  padding: 8px $spacing-sm;
  color: var(--cp-text);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--cp-radius-sm);
  transition: background $transition-fast, color $transition-fast;

  &:hover, &.is-active { background: var(--cp-bg-hover); }
  &:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: -2px; }
}

.result-icon { flex: 0 0 auto; color: var(--cp-primary); font-size: 19px; }
.result-content { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; }
.result-title { overflow: hidden; font-size: $font-base; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.result-path, .result-category { overflow: hidden; color: var(--cp-text-tertiary); font-size: $font-xs; text-overflow: ellipsis; white-space: nowrap; }
.result-category { flex: 0 0 auto; }
.search-empty { padding: $spacing-lg 0 $spacing-sm; }

@include media-max($breakpoint-md) {
  .search-dialog :deep(.el-dialog__body) { padding: $spacing-md; }
  .search-hints { gap: 6px 10px; }
  .result-category { display: none; }
}
</style>

<style lang="scss">
.el-dialog.search-dialog {
  .el-dialog__header {
    display: none;
    padding: 0;
    margin: 0;
    border-bottom: 0;
  }
}
</style>
