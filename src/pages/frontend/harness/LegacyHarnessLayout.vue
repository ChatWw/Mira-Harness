<template>
  <div class="legacy-harness-layout">
    <aside class="legacy-harness-layout__navigation" aria-label="Harness 导航">
      <div class="legacy-harness-layout__header">
        <strong>Harness</strong>
        <el-tooltip content="新对话" placement="right">
          <button type="button" aria-label="新对话" @click="newSession"><AppIcon name="tabler:edit" /></button>
        </el-tooltip>
      </div>
      <div class="legacy-harness-layout__scroll">
        <WorkspaceNavigation :collapsed="false" />
        <nav class="legacy-harness-layout__links" aria-label="Harness 其他页面">
          <router-link to="/workspace/usage"><AppIcon name="lucide:chart-no-axes-column" />用量与成本</router-link>
        </nav>
      </div>
    </aside>
    <div class="legacy-harness-layout__content"><router-view /></div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useHarnessStore } from '@/stores/harness'
import WorkspaceNavigation from '@/layouts/components/WorkspaceNavigation.vue'

const router = useRouter()
const harnessStore = useHarnessStore()

function newSession() {
  const draft = harnessStore.startDraft()
  void router.push({ path: '/workspace/chat', query: { draft } })
}
</script>

<style scoped lang="scss">
.legacy-harness-layout { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; }
.legacy-harness-layout__navigation { display: flex; width: 240px; flex: 0 0 240px; flex-direction: column; min-height: 0; border-right: 1px solid var(--cp-border-light); background: var(--cp-bg-elevated); }
.legacy-harness-layout__header { display: flex; height: 52px; flex: 0 0 auto; align-items: center; justify-content: space-between; padding: 0 14px 0 18px; color: var(--cp-text); font-size: 13px; }
.legacy-harness-layout__header button { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: var(--cp-radius-sm); color: var(--cp-text-secondary); background: transparent; font-size: 17px; }
.legacy-harness-layout__header button:hover,
.legacy-harness-layout__header button:focus-visible { color: var(--cp-text); background: var(--cp-bg-hover); outline: none; }
.legacy-harness-layout__scroll { flex: 1; min-height: 0; overflow-y: auto; padding-top: 4px; }
.legacy-harness-layout__links { display: flex; flex-direction: column; padding: 0 8px 16px; }
.legacy-harness-layout__links a { display: flex; min-height: 34px; align-items: center; gap: 10px; padding: 0 10px; border-radius: var(--cp-radius-sm); color: var(--cp-text-secondary); font-size: 13px; }
.legacy-harness-layout__links a:hover,
.legacy-harness-layout__links a:focus-visible,
.legacy-harness-layout__links a.router-link-active { color: var(--cp-text); background: var(--cp-bg-hover); outline: none; }
.legacy-harness-layout__content { flex: 1; min-width: 0; min-height: 0; overflow: auto; }
</style>
