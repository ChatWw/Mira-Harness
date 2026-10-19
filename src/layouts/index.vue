<template>
  <div class="mira-shell" :class="`mira-shell--${windowChrome}`" :style="{ '--mira-desktop-zoom': desktopZoomFactor }">
    <header class="mira-shell__bar">
      <div class="mira-shell__identity">
        <el-popover v-model:visible="appMenuVisible" trigger="click" placement="bottom-start" :width="220" :show-arrow="false" popper-class="mira-app-switcher-popper">
          <template #reference>
            <button type="button" class="mira-shell__app-switch" aria-label="选择应用" :aria-expanded="appMenuVisible">
              <span>{{ currentAppName }}</span><AppIcon name="ArrowDown" />
            </button>
          </template>
          <nav class="mira-app-switcher" aria-label="应用列表">
            <button v-for="app in applications" :key="app.code" type="button" :class="{ 'is-current': currentAppCode === app.code }" @click="switchApp(app.code)">
              <img v-if="app.code === 'main'" class="mira-app-switcher__logo" :src="miraMark" alt="" />
              <AppIcon v-else :name="app.icon || 'Grid'" />
              <span>{{ app.code === 'main' ? 'Mira Harness' : app.name }}</span>
              <AppIcon v-if="currentAppCode === app.code" name="Check" />
            </button>
            <button type="button" :class="{ 'is-current': currentAppCode === 'novel' }" @click="openLegacyNovel">
              <AppIcon name="lucide:book-open" /><span>小说创作</span>
              <AppIcon v-if="currentAppCode === 'novel'" name="Check" />
            </button>
          </nav>
        </el-popover>
        <div v-if="showAppNavigation" class="mira-shell__navigation" role="group" aria-label="应用导航">
          <el-tooltip popper-class="mira-tooltip mira-shortcut-tooltip mira-shell-tooltip" transition="mira-shell-hint" :show-after="350" :hide-after="0" :offset="6" :show-arrow="false" placement="bottom" :enterable="false" :popper-style="{ pointerEvents: 'none' }">
            <button type="button" class="mira-shell__navigation-button" aria-label="后退" :disabled="!appNavigation.state?.canGoBack || appNavigation.state?.busy" @click="appNavigation.go('back')"><AppIcon name="lucide:arrow-left" /></button>
            <template #content><div class="mira-shell-tooltip__surface"><span>后退</span><span class="mira-shell-shortcut-keys"><kbd v-for="(key, index) in miraShortcutKeys(miraShortcutLabel('['))" :key="index">{{ key }}</kbd></span></div></template>
          </el-tooltip>
          <el-tooltip popper-class="mira-tooltip mira-shortcut-tooltip mira-shell-tooltip" transition="mira-shell-hint" :show-after="350" :hide-after="0" :offset="6" :show-arrow="false" placement="bottom" :enterable="false" :popper-style="{ pointerEvents: 'none' }">
            <button type="button" class="mira-shell__navigation-button" aria-label="前进" :disabled="!appNavigation.state?.canGoForward || appNavigation.state?.busy" @click="appNavigation.go('forward')"><AppIcon name="lucide:arrow-right" /></button>
            <template #content><div class="mira-shell-tooltip__surface"><span>前进</span><span class="mira-shell-shortcut-keys"><kbd v-for="(key, index) in miraShortcutKeys(miraShortcutLabel(']'))" :key="index">{{ key }}</kbd></span></div></template>
          </el-tooltip>
        </div>
      </div>
      <div class="mira-shell__actions">
        <el-tooltip popper-class="mira-tooltip mira-shortcut-tooltip mira-shell-tooltip" transition="mira-shell-hint" :show-after="350" :hide-after="0" :offset="6" :show-arrow="false" placement="bottom" :enterable="false" :popper-style="{ pointerEvents: 'none' }">
          <button type="button" class="mira-shell__icon-button" aria-label="全局搜索" @click="commandPaletteStore.open()"><AppIcon name="Search" /></button>
          <template #content><div class="mira-shell-tooltip__surface"><span>全局搜索</span><span class="mira-shell-shortcut-keys"><kbd v-for="(key, index) in miraShortcutKeys(miraShortcutLabel('K'))" :key="index">{{ key }}</kbd></span></div></template>
        </el-tooltip>
        <el-tooltip popper-class="mira-tooltip mira-shortcut-tooltip mira-shell-tooltip" transition="mira-shell-hint" :show-after="350" :hide-after="0" :offset="6" :show-arrow="false" placement="bottom" :enterable="false" :popper-style="{ pointerEvents: 'none' }">
          <button type="button" class="mira-shell__icon-button" aria-label="设置" @click="openSettings"><AppIcon name="Setting" /></button>
          <template #content><div class="mira-shell-tooltip__surface"><span>设置</span><span class="mira-shell-shortcut-keys"><kbd v-for="(key, index) in miraShortcutKeys(miraShortcutLabel(','))" :key="index">{{ key }}</kbd></span></div></template>
        </el-tooltip>
      </div>
    </header>

    <WindowsTitlebar v-if="windowChrome === 'windows-overlay'" :drag-region="false" />
    <div class="mira-shell__stage">
      <div class="mira-shell__canvas"><AppMain /></div>
    </div>
    <SearchBar />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { miraShortcutKeys, miraShortcutLabel } from '@/platform/workbenchShortcuts'
import { useRoute, useRouter } from 'vue-router'
import { applications, findRuntimeMicroApp } from '@/config/runtime'
import { getAppCodeFromPath, getApplicationEntryPath, navigateToPath } from '@/config/navigation'
import { useCommandPaletteStore } from '@/stores/commandPalette'
import { useAppNavigationStore } from '@/stores/appNavigation'
import AppMain from './components/AppMain.vue'
import WindowsTitlebar from './components/WindowsTitlebar.vue'
import SearchBar from '@/components/SearchBar/index.vue'
import miraMark from '@/asset/mira-mark.png'

const route = useRoute()
const router = useRouter()
const commandPaletteStore = useCommandPaletteStore()
const appNavigation = useAppNavigationStore()
const windowChrome = window.platform?.windowChrome ?? 'standard'
const desktopZoomFactor = ref(window.platform?.getDesktopZoomFactor?.() ?? 1)
let removeZoomListener: (() => void) | undefined
onMounted(() => {
  removeZoomListener = window.platform?.onDesktopZoomChanged?.(factor => { if (Number.isFinite(factor) && factor > 0) desktopZoomFactor.value = factor })
  desktopZoomFactor.value = window.platform?.getDesktopZoomFactor?.() ?? 1
})
onUnmounted(() => removeZoomListener?.())
const showAppNavigation = computed(() => route.path === '/workspace/harness-react' && Boolean(appNavigation.state))
const appMenuVisible = ref(false)
const currentAppCode = computed(() => route.path === '/novel' ? 'novel' : getAppCodeFromPath(route.path))
const currentAppName = computed(() => {
  if (currentAppCode.value === 'novel') return '小说创作'
  if (currentAppCode.value === 'main') return 'Mira Harness'
  return findRuntimeMicroApp(currentAppCode.value)?.name || '应用'
})

function switchApp(code: string) {
  appMenuVisible.value = false
  void navigateToPath(router, getApplicationEntryPath(code))
}

function openLegacyNovel() {
  appMenuVisible.value = false
  void router.push('/novel')
}

function openSettings() {
  void router.push({ path: '/settings/general', query: { from: route.fullPath } })
}
</script>

<style scoped lang="scss">
.mira-shell {
  --cp-titlebar-height: 36px;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  min-width: 0;
  overflow: hidden;
  color: var(--cp-text);
  background: var(--cp-bg-elevated);
}

.mira-shell__bar {
  display: flex;
  flex: 0 0 var(--cp-titlebar-height);
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px 0 92px;
  -webkit-app-region: drag;
}

.mira-shell--standard .mira-shell__bar { padding-left: 16px; }
.mira-shell--macos-overlay .mira-shell__bar { padding-left: max(92px, calc(92px / var(--mira-desktop-zoom, 1))); }
.mira-shell--windows-overlay .mira-shell__bar { padding-left: 16px; padding-right: 148px; }

.mira-shell__identity,
.mira-shell__actions { display: flex; min-width: 0; align-items: center; -webkit-app-region: no-drag; }
.mira-shell__identity { gap: 10px; }
.mira-shell__actions { flex: 0 0 auto; gap: 4px; }
.mira-shell__app-switch { display: flex; min-width: 0; max-width: 220px; height: 32px; align-items: center; gap: 8px; padding: 0 8px; border: 0; border-radius: var(--cp-radius-md); color: var(--cp-text-secondary); background: transparent; font-size: 12px; }
.mira-shell__app-switch span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mira-shell__app-switch .app-icon { flex: 0 0 auto; font-size: 13px; }
.mira-shell__icon-button { display: grid; width: 32px; height: 32px; place-items: center; padding: 0; border: 0; border-radius: var(--cp-radius-md); color: var(--cp-text-secondary); background: transparent; font-size: 16px; }
.mira-shell__navigation { display: flex; flex: 0 0 auto; align-items: center; gap: 2px; }
.mira-shell__navigation-button { display: grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; border-radius: var(--cp-radius-md); color: var(--cp-text-secondary); background: transparent; font-size: 16px; }
.mira-shell__navigation-button:hover:not(:disabled) { color: var(--cp-text); background: var(--cp-bg-hover); }
.mira-shell__navigation-button:focus-visible { outline: 2px solid var(--cp-text-secondary); outline-offset: 2px; }
.mira-shell__navigation-button:disabled { color: var(--cp-text-tertiary); cursor: default; opacity: .45; }
.mira-shell__app-switch:hover,
.mira-shell__app-switch:focus-visible,
.mira-shell__icon-button:hover,
.mira-shell__icon-button:focus-visible { color: var(--cp-text); background: var(--cp-bg-hover); outline: none; }

.mira-shell__stage { flex: 1; min-height: 0; padding: 0; }
.mira-shell__canvas { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; overflow: hidden; border: 0px solid var(--cp-layout-border); border-radius: var(--cp-radius-md); background: var(--cp-bg); }
</style>

<style lang="scss">
.mira-app-switcher-popper.el-popover { padding: 5px; border-color: var(--cp-border); background: var(--cp-bg-overlay); }
.mira-app-switcher { display: flex; flex-direction: column; gap: 2px; }
.mira-app-switcher button { display: flex; width: 100%; min-height: 34px; align-items: center; gap: 10px; padding: 5px 8px; border: 0; border-radius: var(--cp-radius-sm); color: var(--cp-text); background: transparent; font-size: 13px; text-align: left; }
.mira-app-switcher button:hover,
.mira-app-switcher button:focus-visible,
.mira-app-switcher button.is-current { background: var(--cp-bg-hover); outline: none; }
.mira-app-switcher button span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mira-app-switcher button .app-icon { flex: 0 0 auto; font-size: 16px; }
.mira-app-switcher__logo { width: 18px; height: 18px; flex: 0 0 auto; object-fit: contain; }
</style>
