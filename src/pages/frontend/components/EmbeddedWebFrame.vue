<template>
  <AppLoadingOverlay class="embedded-web-frame-loading" :class="{ 'is-fill': fill }" :active="loading" text="正在加载网页…">
  <div class="embedded-web-frame" :class="{ 'is-fill': fill }">
    <el-result v-if="error" icon="error" title="网页无法加载" :sub-title="error">
      <template #extra>
        <el-button v-if="resolvedUrl" type="primary" @click="openInNewWindow">在新窗口打开</el-button>
        <el-button @click="reload">重试</el-button>
      </template>
    </el-result>

    <el-result
      v-else-if="resolvedPolicy.profile === 'external'"
      icon="info"
      title="该页面配置为在新窗口打开"
      sub-title="当前站点不在平台内嵌入，以保留完整的原站体验。"
    >
      <template #extra>
        <el-button type="primary" @click="openInNewWindow">在新窗口打开</el-button>
      </template>
    </el-result>

    <iframe
      v-else
      :key="frameKey"
      class="embedded-web-frame__iframe"
      :src="resolvedUrl"
      :sandbox="sandbox"
      :referrerpolicy="resolvedPolicy.referrerPolicy"
      :allow="allowPermissions"
      :allowfullscreen="resolvedPolicy.profile === 'compatible'"
      :title="title"
      @load="handleLoad"
      @error="handleError"
    />
  </div>
  </AppLoadingOverlay>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getIframeSandbox, resolveHttpUrl, resolveIframePolicy } from '@/config/iframe'
import type { IframePolicy } from '@/types'
import AppLoadingOverlay from '@/components/AppLoadingOverlay.vue'

const props = withDefaults(defineProps<{
  url: string
  title?: string
  policy?: IframePolicy
  fill?: boolean
}>(), {
  title: '嵌入网页',
  fill: false,
})

const loading = ref(false)
const error = ref('')
const reloadKey = ref(0)
const resolvedUrl = ref('')
let timer: number | undefined

const resolvedPolicy = computed(() => resolveIframePolicy(props.policy))
const sandbox = computed(() => getIframeSandbox(resolvedPolicy.value.profile))
const allowPermissions = computed(() => resolvedPolicy.value.profile === 'compatible'
  ? 'fullscreen; clipboard-read; clipboard-write'
  : undefined
)
const frameKey = computed(() => `${resolvedUrl.value}:${reloadKey.value}`)

function clearTimer() {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = undefined
}

function startLoading() {
  clearTimer()
  error.value = ''
  try {
    resolvedUrl.value = resolveHttpUrl(props.url)
  } catch (cause: any) {
    resolvedUrl.value = ''
    loading.value = false
    error.value = cause.message || '网页地址无效'
    return
  }
  loading.value = resolvedPolicy.value.profile !== 'external'
  if (!loading.value) return

  timer = window.setTimeout(() => {
    loading.value = false
    error.value = `页面加载超过 ${resolvedPolicy.value.timeout} 秒，请检查网络或目标站点的嵌入策略`
  }, resolvedPolicy.value.timeout * 1000)
}

function handleLoad() {
  clearTimer()
  loading.value = false
}

function handleError() {
  clearTimer()
  loading.value = false
  error.value = '页面加载失败，请检查网络、CSP 或 X-Frame-Options 设置'
}

function reload() {
  reloadKey.value++
  startLoading()
}

function openInNewWindow() {
  if (resolvedUrl.value) window.open(resolvedUrl.value, '_blank', 'noopener,noreferrer')
}

watch([() => props.url, () => props.policy], startLoading, { immediate: true, deep: true })
onBeforeUnmount(clearTimer)
</script>

<style scoped lang="scss">
.embedded-web-frame {
  min-height: 560px;

  &.is-fill {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;

    .embedded-web-frame__iframe {
      flex: 1;
      min-height: 0;
    }
  }
}

.embedded-web-frame-loading.is-fill {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.embedded-web-frame__iframe {
  display: block;
  width: 100%;
  min-height: 560px;
  border: 0;
}
</style>
