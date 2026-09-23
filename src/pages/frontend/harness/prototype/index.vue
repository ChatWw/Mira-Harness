<template>
  <main class="harness-prototype-host">
    <header class="harness-prototype-host__bar">
      <div><strong>Harness 工作台 · React 原型</strong><span>仅开发环境 · 演示数据</span></div>
      <router-link to="/workspace/chat">返回现有工作台</router-link>
    </header>
    <div v-if="error" class="harness-prototype-host__error" role="alert">
      <strong>原型子应用未能加载</strong>
      <p>{{ error }}。请使用 <code>npm run prototype:harness</code> 同时启动桌面壳与 React 开发服务。</p>
    </div>
    <WujieVue
      v-else
      class="harness-prototype-host__frame"
      :name="PROTOTYPE_NAME"
      url="http://127.0.0.1:9000/harness-prototype/"
      width="100%"
      height="100%"
      :alive="false"
      :sync="false"
      :props="childProps"
      :after-mount="syncTheme"
      @load-error="error = '无法连接 React 原型服务或资源加载失败'"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import WujieVue from 'wujie-vue3'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const PROTOTYPE_NAME = 'mira-harness-react-prototype'
const error = ref('')
const childProps = computed(() => ({ theme: themeStore.themeMode }))
function syncTheme() { WujieVue.bus.$emit('mira:harness-prototype-theme', themeStore.themeMode) }
watch(() => themeStore.themeMode, syncTheme)
onBeforeUnmount(() => WujieVue.destroyApp(PROTOTYPE_NAME))
</script>

<style scoped>
.harness-prototype-host { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex-direction: column; color: var(--cp-text); background: var(--cp-bg); }
.harness-prototype-host__bar { display: flex; min-height: 46px; flex: 0 0 auto; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: 1px solid var(--cp-border-light); font-size: 12px; -webkit-app-region: no-drag; }
.harness-prototype-host__bar > div { display: flex; gap: 12px; align-items: baseline; }
.harness-prototype-host__bar strong { font-weight: 600; }.harness-prototype-host__bar span { color: var(--cp-text-secondary); }
.harness-prototype-host__bar a { color: var(--cp-text-secondary); text-decoration: none; }.harness-prototype-host__bar a:hover { color: var(--cp-text); text-decoration: underline; }
.harness-prototype-host__frame { display: block; min-height: 0; flex: 1 1 auto; }
.harness-prototype-host__error { margin: 48px auto; max-width: 460px; padding: 24px; border: 1px solid var(--cp-border); border-radius: 12px; background: var(--cp-bg-elevated); line-height: 1.6; }
.harness-prototype-host__error p { margin-bottom: 0; color: var(--cp-text-secondary); }
</style>
