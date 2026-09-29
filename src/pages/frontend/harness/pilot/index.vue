<template>
  <main class="pilot-host">
    <header class="pilot-host__bar"><span>Harness · React 接入试验</span><router-link to="/workspace/chat">返回现有工作台</router-link></header>
    <div v-if="!host" class="pilot-host__notice" role="alert">此试验仅在 Mira 桌面端可用。</div>
    <WujieVue v-else class="pilot-host__frame" :name="PILOT_NAME" :url="pilotUrl" width="100%" height="100%" :alive="false" :sync="false" :props="childProps" :after-mount="syncTheme" @load-error="error = 'React 开发服务未启动，请使用 npm run harness:dev'" />
    <div v-if="error" class="pilot-host__notice" role="alert">{{ error }}</div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import WujieVue from 'wujie-vue3'
import { getPlatformApi } from '@/platform'
import { useThemeStore } from '@/stores/theme'

const PILOT_NAME = 'mira-harness-react-pilot'
const pilotUrl = `${window.location.origin}/harness-react-dev/pilot/`
const api = getPlatformApi()
const host = api && {
  listSessions: () => api.listHarnessSessions(),
  listProjects: () => api.listHarnessProjects(),
  getSession: (id: string) => api.getHarnessSession(id),
  createSession: (projectId?: string) => api.createHarnessSession(projectId),
  listProviders: () => api.listModelProviders(),
  runMessage: (id: string, text: string, selection: import('@/config/harness').ModelSelection, planning: boolean) => api.runHarnessMessage(id, text, [], selection, planning),
  onEvent: (listener: (event: import('@/config/harness').HarnessEvent) => void) => api.onHarnessEvent(listener),
  respondPermission: (requestId: string, allowed: boolean) => api.respondHarnessPermission(requestId, allowed),
  listPendingPermissions: (id: string) => api.listPendingHarnessPermissions(id),
  openSessionProject: (id: string) => api.openHarnessSessionProject(id, 'file-manager'),
  abortRun: (id: string) => api.abortHarnessRun(id),
  confirmPlan: (id: string, planId: string, selection: import('@/config/harness').ModelSelection) => api.confirmHarnessPlan(id, planId, selection),
  answerInteraction: (id: string, interactionId: string, answers: import('@/config/harness').HarnessUserAnswer[], selection: import('@/config/harness').ModelSelection) => api.answerHarnessInteraction(id, interactionId, answers, selection),
  getPreference: async (key: string) => (await api.getSnapshot()).preferences[key] ?? null,
  setPreference: (key: string, value: unknown) => api.savePreference(key, value),
}
const themeStore = useThemeStore()
const error = ref('')
const childProps = computed(() => ({ theme: { theme: themeStore.themeMode, primaryColor: themeStore.primaryColor, onPrimary: themeStore.onPrimaryColor }, host }))
function syncTheme() { WujieVue.bus.$emit('mira:harness-pilot-theme', { theme: themeStore.themeMode, primaryColor: themeStore.primaryColor, onPrimary: themeStore.onPrimaryColor }) }
watch(() => themeStore.themeMode, syncTheme)
onBeforeRouteLeave(() => { WujieVue.bus.$emit('mira:harness-pilot-leave') })
</script>

<style scoped>
.pilot-host { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex-direction: column; background: var(--cp-bg); color: var(--cp-text); }
.pilot-host__bar { display: flex; height: 46px; flex: 0 0 auto; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: 1px solid var(--cp-border-light); font-size: 12px; -webkit-app-region: no-drag; }
.pilot-host__bar a { color: var(--cp-text-secondary); text-decoration: none; }
.pilot-host__bar a:hover { color: var(--cp-text); }
.pilot-host__frame { display: block; min-height: 0; flex: 1 1 auto; }
.pilot-host__notice { padding: 20px 24px; color: var(--cp-text-secondary); }
</style>
