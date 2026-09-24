<template>
  <div class="mira-shell" :class="`mira-shell--${windowChrome}`">
    <header class="mira-shell__bar">
      <div class="mira-shell__identity">
        <img :src="miraLogo" alt="" class="mira-shell__logo" />
        <span class="mira-shell__brand">Mira</span>
        <span class="mira-shell__separator" aria-hidden="true" />
        <el-popover v-model:visible="appMenuVisible" trigger="click" placement="bottom-start" :width="220" :show-arrow="false" popper-class="mira-app-switcher-popper">
          <template #reference>
            <button type="button" class="mira-shell__app-switch" aria-label="选择应用" :aria-expanded="appMenuVisible">
              <span>{{ currentAppName }}</span><AppIcon name="ArrowDown" />
            </button>
          </template>
          <nav class="mira-app-switcher" aria-label="应用列表">
            <button v-for="app in applications" :key="app.code" type="button" :class="{ 'is-current': currentAppCode === app.code }" @click="switchApp(app.code)">
              <AppIcon :name="app.code === 'main' ? 'lucide:message-square-text' : app.icon || 'Grid'" />
              <span>{{ app.code === 'main' ? 'Mira Harness' : app.name }}</span>
              <AppIcon v-if="currentAppCode === app.code" name="Check" />
            </button>
            <button type="button" :class="{ 'is-current': currentAppCode === 'novel' }" @click="openLegacyNovel">
              <AppIcon name="lucide:book-open" /><span>小说创作</span>
              <AppIcon v-if="currentAppCode === 'novel'" name="Check" />
            </button>
          </nav>
        </el-popover>
      </div>
      <div class="mira-shell__actions">
        <el-tooltip content="全局搜索 (Ctrl+K)" placement="bottom">
          <button type="button" class="mira-shell__icon-button" aria-label="全局搜索" @click="commandPaletteStore.open()"><AppIcon name="Search" /></button>
        </el-tooltip>
        <el-tooltip content="设置" placement="bottom">
          <button type="button" class="mira-shell__icon-button" aria-label="设置" @click="openSettings"><AppIcon name="Setting" /></button>
        </el-tooltip>
      </div>
    </header>

    <WindowsTitlebar v-if="windowChrome === 'windows-overlay'" :show-search="false" :menu-left="16" />
    <div class="mira-shell__stage">
      <div class="mira-shell__canvas"><AppMain /></div>
    </div>
    <SearchBar />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import miraLogo from '@/asset/mira-logo.png'
import { applications, findRuntimeMicroApp } from '@/config/runtime'
import { getAppCodeFromPath, getApplicationEntryPath, navigateToPath } from '@/config/navigation'
import { useCommandPaletteStore } from '@/stores/commandPalette'
import AppMain from './components/AppMain.vue'
import WindowsTitlebar from './components/WindowsTitlebar.vue'
import SearchBar from '@/components/SearchBar/index.vue'

const route = useRoute()
const router = useRouter()
const commandPaletteStore = useCommandPaletteStore()
const windowChrome = window.platform?.windowChrome ?? 'standard'
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
  --cp-titlebar-height: 48px;
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
  flex: 0 0 48px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px 0 92px;
  -webkit-app-region: drag;
}

.mira-shell--standard .mira-shell__bar { padding-left: 16px; }
.mira-shell--windows-overlay .mira-shell__bar { padding-left: 302px; padding-right: 148px; }

.mira-shell__identity,
.mira-shell__actions { display: flex; min-width: 0; align-items: center; -webkit-app-region: no-drag; }
.mira-shell__identity { gap: 10px; }
.mira-shell__actions { flex: 0 0 auto; gap: 4px; }
.mira-shell__logo { width: 23px; height: 23px; object-fit: contain; }
.mira-shell__brand { font-size: 13px; font-weight: 650; }
.mira-shell__separator { width: 1px; height: 16px; margin: 0 2px; background: var(--cp-border); }
.mira-shell__app-switch { display: flex; min-width: 0; max-width: 220px; height: 32px; align-items: center; gap: 8px; padding: 0 8px; border: 0; border-radius: var(--cp-radius-md); color: var(--cp-text-secondary); background: transparent; font-size: 12px; }
.mira-shell__app-switch span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mira-shell__app-switch .app-icon { flex: 0 0 auto; font-size: 13px; }
.mira-shell__icon-button { display: grid; width: 32px; height: 32px; place-items: center; padding: 0; border: 0; border-radius: var(--cp-radius-md); color: var(--cp-text-secondary); background: transparent; font-size: 16px; }
.mira-shell__app-switch:hover,
.mira-shell__app-switch:focus-visible,
.mira-shell__icon-button:hover,
.mira-shell__icon-button:focus-visible { color: var(--cp-text); background: var(--cp-bg-hover); outline: none; }

.mira-shell__stage { flex: 1; min-height: 0; padding: 0 12px 12px; }
.mira-shell__canvas { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; overflow: hidden; border: 1px solid var(--cp-layout-border); border-radius: var(--cp-radius-md); background: var(--cp-bg); }
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
</style>
