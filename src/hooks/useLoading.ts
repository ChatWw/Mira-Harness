import { computed, ref } from 'vue'
import { platformPreferences } from '@/config/runtime'
import { savePreference } from '@/platform'

export type LoadingStyle = 'element' | 'orbit' | 'plane' | 'bounce' | 'wave' | 'pulse' | 'flow' | 'swing' | 'circle' | 'circle-fade' | 'cube-grid' | 'wandering-cubes' | 'folding-cube' | 'chasing-dots'

export type LoadingOptions = {
  text?: string
}

type LoadingRequest = LoadingOptions & {
  id: number
}

const supportedStyles = new Set<LoadingStyle>(['element', 'orbit', 'plane', 'bounce', 'wave', 'pulse', 'flow', 'swing', 'circle', 'circle-fade', 'cube-grid', 'wandering-cubes', 'folding-cube', 'chasing-dots'])
const style = computed<LoadingStyle>(() => supportedStyles.has(platformPreferences.loadingStyle as LoadingStyle)
  ? platformPreferences.loadingStyle as LoadingStyle
  : 'element'
)
const requests = ref<LoadingRequest[]>([])
let requestId = 0

const active = computed(() => requests.value.length > 0)
const text = computed(() => requests.value[requests.value.length - 1]?.text || '正在加载…')

export function useLoading() {
  function setStyle(nextStyle: LoadingStyle) {
    savePreference('loadingStyle', nextStyle)
  }

  function show(options: LoadingOptions = {}) {
    const id = ++requestId
    requests.value = [...requests.value, { id, ...options }]
    return () => {
      requests.value = requests.value.filter(request => request.id !== id)
    }
  }

  function hide() {
    requests.value = []
  }

  async function withLoading<T>(task: Promise<T> | (() => Promise<T>), options: LoadingOptions = {}) {
    const close = show(options)
    try {
      return await (typeof task === 'function' ? task() : task)
    } finally {
      close()
    }
  }

  return { active, text, style, setStyle, show, hide, withLoading }
}
