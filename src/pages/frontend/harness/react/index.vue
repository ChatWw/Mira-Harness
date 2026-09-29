<template>
  <main class="harness-react-host">
    <p v-if="error" class="harness-react-host__error" role="alert">{{ error }} <router-link to="/workspace/chat">使用旧版工作台</router-link></p>
    <p v-else-if="!url" class="harness-react-host__loading">正在加载 Harness…</p>
    <FirstPartyFrame v-else :url="url" title="Mira Harness" :manifest="manifest" :api="api!" :context="context" route="/" :navigate="navigate" @error="error = $event" />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { firstPartyAppManifests } from '@/config/firstPartyApps'
import { getPlatformApi } from '@/platform'
import { useThemeStore } from '@/stores/theme'
import FirstPartyFrame from '@/pages/frontend/microAppHost/FirstPartyFrame.vue'

const api = getPlatformApi()
const router = useRouter()
const theme = useThemeStore()
const manifest = firstPartyAppManifests.find(item => item.appId === 'mira-harness')!
const context = computed(() => ({ version: 1 as const, theme: theme.themeMode, language: navigator.language, user: { id: 'platform', name: 'Mira' } }))
const url = ref('')
const error = ref('')
function navigate(path: string) { void router.push(path === '/workspace/chat' ? path : '/workspace/harness-react') }
onMounted(async () => {
  if (!api) { error.value = 'Harness 仅在 Mira 桌面版可用'; return }
  try { url.value = new URL(manifest.entry.path, await api.resolveLocalMicroAppUrl('micro-mira-harness')).href }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Harness 资源加载失败' }
})
</script>

<style scoped>
.harness-react-host { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex-direction: column; color: var(--cp-text); background: var(--cp-bg); }
.harness-react-host__error a { color: var(--cp-text-secondary); }
.harness-react-host__error, .harness-react-host__loading { padding: 24px; font-size: 13px; }
</style>
