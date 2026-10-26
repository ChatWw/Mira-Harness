<template>
  <aside class="settings-sidebar" :class="`settings-sidebar--${windowChrome}`">
    <button class="back-button" type="button" aria-label="返回应用" @click="returnToApplication">
      <svg class="settings-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
      <span>返回应用</span>
    </button>

    <div ref="menuScroll" class="settings-menu-scroll">
      <section v-for="layer in settingsNavLayers" :key="layer.label" class="settings-nav-layer" :aria-label="layer.label">
        <h2 class="settings-layer-heading"><span>{{ layer.label }}</span></h2>
        <nav v-for="group in layer.groups" :key="group.label" class="settings-nav-group" :aria-label="`${layer.label} · ${group.label}`">
          <button
            v-for="item in group.items"
            :key="item.key"
            class="settings-nav-item"
            :class="{ 'is-active': activeSection === item.key }"
            type="button"
            :aria-current="activeSection === item.key ? 'page' : undefined"
            @click="goToSection(item.path)"
          >
            <svg class="settings-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="iconPaths[item.key]" /></svg>
            <span>{{ item.label }}</span>
            <small v-if="item.key === 'app-extensions'" class="settings-nav-status">规划中</small>
          </button>
        </nav>
      </section>
    </div>
  </aside>
</template>

<script lang="ts">
// 各设置路由会重建 Shell，保留菜单位置以维持标题与滚动的连续性。
let savedMenuScrollTop = 0
</script>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { resolveSettingsReturnPath } from '@/platform/firstPartyNavigation'

const route = useRoute()
const router = useRouter()
const windowChrome = window.platform?.windowChrome ?? 'standard'
type SettingsNavItem = {
  key: string
  label: string
  path: string
}

const iconPaths: Record<string, string> = {
  'general': 'M3 5h18v14H3z M3 9h18',
  'shortcuts': 'M3 6h18v12H3z M7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h10',
  'model-config': 'M9 15l6-6M8 13l-2 2a3 3 0 0 0 4 4l3-3M11 8l3-3a3 3 0 0 1 4 4l-2 2',
  'conversation': 'M3 4h15v11H8l-5 4zM18 8h3v13l-5-3h-4',
  'personalization': 'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 11a1 1 0 1 0 1 1',
  'plugins': 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  'agents': 'M5 7h14v13H5zM12 3v4M2 11v5m20-5v5M8 12h.01M16 12h.01M9 17h6',
  'commands': 'M4 5l7 7-7 7M13 19h7',
  'hooks': 'M6 3v8a5 5 0 0 0 10 0V8M13 11l3-3 3 3',
  'archives': 'M3 3h18v4H3zM5 7v14h14V7M9 11h6',
  'usage': 'M5 20V9m7 11V4m7 16V12',
  'file-search': 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14M15 15l6 6',
  'file-trash': 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  'app-extensions': 'M3 5h18v14H3z M3 9h18',
  'about': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v6M12 7h.01',
}

const settingsNavLayers = [
  { label: '底层能力', groups: [
    { label: '基础设置', items: [
      { key: 'general', label: '常规', path: '/settings/general' },
      { key: 'shortcuts', label: '键盘快捷键', path: '/settings/keyboard-shortcuts' },
    ] },
    { label: '数据与维护', items: [
    ] },
  ] },
  { label: 'Agent 能力', groups: [
    { label: '基础设置', items: [
      { key: 'model-config', label: '模型服务', path: '/settings/model-config' },
      { key: 'conversation', label: '对话设置', path: '/settings/conversation' },
      { key: 'personalization', label: '指令与记忆', path: '/settings/personalization' },
    ] },
    { label: '能力扩展', items: [
      { key: 'plugins', label: '工具与扩展', path: '/settings/plugins' },
      { key: 'agents', label: '智能体', path: '/settings/agents' },
      { key: 'commands', label: '自定义命令', path: '/settings/commands' },
      { key: 'hooks', label: '事件钩子（Hooks）', path: '/settings/hooks' },
    ] },
    { label: '数据与记录', items: [
      { key: 'archives', label: '会话归档', path: '/settings/archives' },
      { key: 'usage', label: '用量统计', path: '/settings/usage' },
    ] },
  ] },
  { label: '工作区能力', groups: [
    { label: '文件检索', items: [
      { key: 'file-search', label: '文件搜索', path: '/settings/file-search' },
    ] },
    { label: '文件数据', items: [
      { key: 'file-trash', label: '文件回收站', path: '/settings/file-trash' },
    ] },
  ] },
  { label: '应用与支持', groups: [
    { label: '应用生态', items: [
      { key: 'app-extensions', label: '应用扩展', path: '/settings/app-extensions' },
    ] },
    { label: '产品与支持', items: [
      { key: 'about', label: '关于Mira', path: '/settings/about' },
    ] },
  ] },
] satisfies Array<{ label: string; groups: Array<{ label: string; items: SettingsNavItem[] }> }>
// 设置项已拆分为独立路由，按当前路径判断激活项
const activeSection = computed(() => settingsNavLayers.flatMap(layer => layer.groups.flatMap(group => group.items)).find(item => route.path === item.path || item.key === 'plugins' && route.path === '/settings/mcp')?.key ?? '')

const menuScroll = ref<HTMLElement>()
onMounted(() => {
  const scroll = menuScroll.value
  if (!scroll) return
  scroll.scrollTop = savedMenuScrollTop
  const active = scroll.querySelector<HTMLElement>('[aria-current="page"]')
  if (active) {
    const item = active.getBoundingClientRect(), viewport = scroll.getBoundingClientRect()
    if (item.top < viewport.top || item.bottom > viewport.bottom) active.scrollIntoView({ block: 'nearest' })
  }
})
onBeforeUnmount(() => {
  savedMenuScrollTop = menuScroll.value?.scrollTop ?? savedMenuScrollTop
})

function returnToApplication() {
  void router.replace(resolveSettingsReturnPath(route.query.from))
}

function goToSection(path: string) {
  if (route.path !== path) {
    void router.replace({ path, query: route.query })
  }
}

</script>

<style scoped lang="scss">
:global([data-theme='light']) .settings-sidebar {
  --cp-bg-elevated: #f8f8f9;
}

.settings-sidebar {
  box-sizing: border-box;
  display: flex;
  flex: 0 0 264px;
  flex-direction: column;
  gap: 16px;
  padding: 48px 10px 12px;
  background: var(--cp-bg-elevated);
  min-height: 0;
  overflow: hidden;
  position: relative;
  z-index: 1;
}
.settings-menu-scroll {
  flex: 1;
  min-height: 0;
  padding-right: 3px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  scrollbar-width: none;
}
.settings-menu-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }
.back-button,
.settings-nav-item {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: var(--settings-text-base);
  text-align: left;
}
.back-button { flex-shrink: 0; height: 34px; padding: 0 12px; color: var(--cp-text-secondary); }
.settings-nav-layer { margin-bottom: 18px; }
.settings-nav-layer:last-child { margin-bottom: 0; }
.settings-sidebar .settings-layer-heading { margin: 0; padding: 0 12px 6px; color: var(--cp-text-secondary); font-size: var(--settings-text-small); font-weight: 500; line-height: 20px; }
.settings-nav-layer[aria-label='Agent 能力'] .settings-nav-group + .settings-nav-group { margin-top: 8px; }
.settings-nav-item { height: 34px; padding: 0 12px; color: color-mix(in srgb, var(--cp-text) 88%, var(--cp-bg-elevated)); font-weight: 400; white-space: nowrap; }
.settings-nav-icon { width: 16px; height: 16px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; color: var(--cp-text-secondary); }
.back-button:hover,
.settings-nav-item:hover { background: var(--cp-bg-hover); }
.settings-nav-item.is-active { background: color-mix(in srgb, var(--cp-text) 8%, var(--cp-bg-elevated)); color: var(--cp-text); font-weight: 500; }
.settings-nav-item.is-active .settings-nav-icon { color: var(--cp-text); }
.settings-nav-status { margin-left: auto; font-size: var(--settings-text-small); color: var(--cp-text-secondary); font-weight: 400; }
.back-button:focus-visible,
.settings-nav-item:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: -2px; }
@media (prefers-reduced-motion: no-preference) {
  .settings-nav-item { transition: background-color 120ms ease-out, color 120ms ease-out; }
}
</style>
