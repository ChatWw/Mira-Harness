<template>
  <SettingsPageShell title="应用扩展">
    <div class="app-extensions">
      <div class="app-extensions__toolbar">
        <span class="app-extensions__scope"><AppIcon name="lucide:monitor" :size="14" aria-hidden="true" />用户</span>
        <span class="app-extensions__divider" aria-hidden="true" />
        <span class="app-extensions__selection">应用 <small>{{ applications.length }}</small></span>
        <label class="app-extensions__search">
          <AppIcon name="lucide:search" :size="14" aria-hidden="true" />
          <input v-model="query" type="search" placeholder="搜索应用…" aria-label="搜索应用" />
        </label>
      </div>

      <p class="app-extensions__description">为 Mira 添加独立应用，拓展你的创作与工作空间。</p>

      <section aria-labelledby="official-apps-heading">
        <div class="app-extensions__heading">
          <h2 id="official-apps-heading">官方应用 <small>{{ visibleApplications.length }}</small></h2>
          <span>规划中</span>
        </div>
        <div v-if="visibleApplications.length" class="app-extensions__list">
          <article v-for="application in visibleApplications" :key="application.id" class="app-extension" :aria-labelledby="`${application.id}-name`">
            <span class="app-extension__icon"><AppIcon :name="application.icon" :size="22" aria-hidden="true" /></span>
            <div class="app-extension__copy">
              <h3 :id="`${application.id}-name`">{{ application.name }}</h3>
              <p>{{ application.description }}</p>
              <span class="app-extension__category">{{ application.category }}</span>
            </div>
            <SettingsTooltip content="规划中" placement="top" :trigger="['hover', 'focus']">
              <span class="app-extension__install-target" tabindex="0" :aria-label="`安装 ${application.name}，规划中`">
                <button type="button" class="app-extension__install" disabled :aria-label="`安装 ${application.name}`">
                  <AppIcon name="lucide:download" :size="14" aria-hidden="true" />安装
                </button>
              </span>
            </SettingsTooltip>
          </article>
        </div>
        <div v-else class="app-extensions__empty" role="status">
          <AppIcon name="lucide:search" :size="24" aria-hidden="true" />
          <strong>没有匹配的应用</strong>
          <p>试试其他名称或关键词。</p>
          <button type="button" @click="query = ''">清除搜索</button>
        </div>
      </section>
    </div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import SettingsTooltip from '../settings/components/SettingsTooltip.vue'

// Planned entries only; release metadata and installation will come from the app catalog.
const applications = [
  {
    id: 'mira-novel-studio',
    name: 'Mira Novel Studio',
    description: 'AI 长篇小说创作工作台，串联作品管理、章节写作与辅助创作。',
    category: '小说创作',
    icon: 'lucide:book-open',
  },
  {
    id: 'mira-vision',
    name: 'Mira Vision',
    description: '面向视觉创作的 Mira 应用。',
    category: '视觉创作',
    icon: 'lucide:scan-eye',
  },
]
const query = ref('')
const visibleApplications = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return applications.filter(application => `${application.id} ${application.name} ${application.description} ${application.category}`.toLocaleLowerCase().includes(term))
})
</script>

<style scoped>
.app-extensions { --app-extension-surface: color-mix(in srgb, var(--cp-text) 4%, var(--cp-bg)); min-width: 0; }
.app-extensions__toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.app-extensions__scope { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid var(--cp-border-light); border-radius: 18px; font-size: var(--settings-text-small); }
.app-extensions__divider { width: 1px; height: 16px; background: var(--cp-border-light); }
.app-extensions__selection { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 20px; background: var(--app-extension-surface); font-weight: 500; }
.app-extensions small { color: var(--cp-text-secondary); font-size: var(--settings-text-small); font-weight: 400; }
.app-extensions__search { display: flex; align-items: center; gap: 8px; width: 256px; margin-left: auto; padding: 8px 12px; border: 1px solid var(--cp-border-light); border-radius: 12px; color: var(--cp-text-secondary); }
.app-extensions__search:focus-within { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.app-extensions__search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--cp-text); font: inherit; font-size: var(--settings-text-small); }
.app-extensions__search input::placeholder { color: var(--cp-text-secondary); opacity: 1; }
.app-extensions__description { max-width: 70ch; margin: 0 0 32px; color: var(--cp-text-secondary); line-height: 24px; }
.app-extensions__heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.app-extensions__heading h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: var(--settings-text-base); font-weight: 450; }
.app-extensions__heading > span { color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.app-extensions__list { overflow: hidden; border-radius: 12px; background: var(--app-extension-surface); }
.app-extension { display: flex; align-items: center; gap: 16px; padding: 20px 16px; }
.app-extension + .app-extension { border-top: 1px solid var(--cp-border-light); }
.app-extension__icon { display: grid; place-items: center; flex: 0 0 40px; height: 40px; border-radius: 12px; background: var(--cp-bg); color: var(--cp-text); }
.app-extension__copy { display: grid; flex: 1; gap: 4px; min-width: 0; }
.app-extension__copy h3 { margin: 0; font-size: var(--settings-text-base); font-weight: 450; line-height: 20px; }
.app-extension__copy p { margin: 0; color: var(--cp-text-secondary); line-height: 24px; overflow-wrap: anywhere; }
.app-extension__category { color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 20px; }
.app-extension__install-target { display: inline-flex; flex: 0 0 auto; border-radius: 6px; cursor: not-allowed; }
.app-extension__install-target:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 3px; }
.app-extension__install { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 28px; padding: 6px 12px; border: 1px solid var(--cp-border-light); border-radius: 6px; background: var(--cp-bg); color: var(--cp-text-secondary); font: inherit; font-size: var(--settings-text-small); opacity: .55; pointer-events: none; }
.app-extensions__empty { display: grid; justify-items: center; align-content: center; gap: 8px; min-height: 192px; border: 1px dashed var(--cp-border-light); border-radius: 12px; color: var(--cp-text-secondary); }
.app-extensions__empty strong { color: var(--cp-text); }
.app-extensions__empty p { margin: 0; }
.app-extensions__empty button { margin-top: 8px; padding: 6px 12px; border: 1px solid var(--cp-border-light); border-radius: 6px; background: var(--cp-bg); color: var(--cp-text); font: inherit; font-size: var(--settings-text-small); }
</style>
