<template>
  <SettingsPageShell title="加载效果">
    <section class="loading-effects" aria-labelledby="loading-effects-heading">
      <div class="section-heading">
        <h2 id="loading-effects-heading">选择加载动效</h2>
        <p>会统一应用到全局和局部加载遮罩。选择后立即保存。</p>
      </div>

      <div class="loading-style-grid" role="radiogroup" aria-label="加载效果">
        <article
          v-for="item in styles"
          :key="item.id"
          class="loading-style-card"
          :class="{ 'is-selected': loading.style.value === item.id }"
        >
          <button
            type="button"
            class="loading-style-card__select"
            role="radio"
            :aria-checked="loading.style.value === item.id"
            @click="applyStyle(item)"
          >
            <span class="style-heading">
              <span>
                <strong>{{ item.name }}</strong>
                <small>{{ item.description }}</small>
              </span>
              <AppIcon v-if="loading.style.value === item.id" name="Check" :size="18" aria-label="当前已应用" />
            </span>
            <span class="style-preview" :aria-label="`${item.name} Loading 效果预览`">
              <AppLoadingOverlay :active="true" :variant="item.id" text="正在加载…">
                <span class="preview-content">内容区域</span>
              </AppLoadingOverlay>
            </span>
          </button>

          <div class="style-tools">
            <span>{{ item.source }}</span>
            <span>
              <el-tooltip content="复制使用代码"><el-button text aria-label="复制使用代码" @click="copyCode(item)"><AppIcon name="CopyDocument" /></el-button></el-tooltip>
              <el-tooltip content="查看使用代码"><el-button text aria-label="查看使用代码" @click="openSource(item)"><AppIcon name="View" /></el-button></el-tooltip>
            </span>
          </div>
        </article>
      </div>
    </section>

    <el-drawer v-model="sourceVisible" :title="`${sourceItem?.name || ''} 使用代码`" size="min(560px, 100%)" append-to-body>
      <div v-if="sourceItem" class="source-section">
        <h3>局部遮罩</h3>
        <pre><code>{{ localUsageCode }}</code></pre>
        <h3>服务式全局遮罩</h3>
        <pre><code>{{ serviceUsageCode }}</code></pre>
        <p class="source-note">动效来自 <a :href="sourceItem.sourceUrl" target="_blank" rel="noreferrer">{{ sourceItem.source }}</a>，采用 MIT 许可证。</p>
      </div>
    </el-drawer>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import AppLoadingOverlay from '@/components/AppLoadingOverlay.vue'
import { useLoading } from '@/hooks/useLoading'
import type { LoadingStyle } from '@/hooks/useLoading'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

type StyleItem = {
  id: LoadingStyle
  name: string
  description: string
  source: string
  sourceUrl: string
}

const styles: StyleItem[] = [
  { id: 'element', name: 'Element Plus', description: '默认基础样式，简洁稳定。', source: 'Element Plus', sourceUrl: 'https://element-plus.org/zh-CN/component/loading.html' },
  { id: 'orbit', name: 'Orbit', description: '多环轨道动画，克制而有辨识度。', source: 'LDRS', sourceUrl: 'https://github.com/GriffinJohnston/ldrs' },
  { id: 'plane', name: 'Plane', description: '平面方块翻转，节奏简洁直接。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'bounce', name: 'Bounce', description: '双圆点交替缩放，适合轻量等待。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'wave', name: 'Wave', description: '五条竖线依次起伏，适合持续处理中。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'pulse', name: 'Pulse', description: '单圆脉冲扩散，提示感更轻。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'flow', name: 'Flow', description: '三点流动衔接，适合短时加载。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'swing', name: 'Swing', description: '双圆点摆动旋转，动感更明显。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'circle', name: 'Circle', description: '环形圆点旋转，保留经典节奏。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'circle-fade', name: 'Circle Fade', description: '环形圆点渐隐，视觉更柔和。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'cube-grid', name: 'Cube Grid', description: '九宫格方块依次呼吸，适合数据加载。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'wandering-cubes', name: 'Wandering Cubes', description: '方块交错游走，节奏更活泼。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'folding-cube', name: 'Folding Cube', description: '折叠立方体层层翻转，空间感更强。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
  { id: 'chasing-dots', name: 'Chasing Dots', description: '圆点环绕追逐，适合轻量等待。', source: 'SpinKit', sourceUrl: 'https://github.com/tobiasahlin/SpinKit' },
]

const loading = useLoading()
const sourceVisible = ref(false)
const sourceItem = ref<StyleItem>()
const localUsageCode = `<AppLoadingOverlay :active="loading" text="正在加载…">
  <section>内容区域</section>
</AppLoadingOverlay>`
const serviceUsageCode = `const { show, withLoading } = useLoading()

const close = show({ text: '正在保存…' })
try {
  await save()
} finally {
  close()
}

await withLoading(fetchData(), { text: '正在加载…' })`

function applyStyle(item: StyleItem) {
  if (loading.style.value === item.id) return
  loading.setStyle(item.id)
  ElMessage.success(`已应用 ${item.name} Loading 效果`)
}

function openSource(item: StyleItem) {
  sourceItem.value = item
  sourceVisible.value = true
}

async function copyCode(item: StyleItem) {
  const code = `${item.name}\n\n${localUsageCode}\n\n${serviceUsageCode}`
  let copied = false
  try {
    await navigator.clipboard.writeText(code)
    copied = true
  } catch {
    const input = document.createElement('textarea')
    input.value = code
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    copied = document.execCommand('copy')
    input.remove()
  }
  if (copied) ElMessage.success('使用代码已复制')
  else ElMessage.error('复制失败，请在源代码面板中手动复制')
}
</script>

<style scoped lang="scss">
.loading-effects { min-width: 0; }
.section-heading { margin-bottom: 24px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: $font-semibold; letter-spacing: -0.01em; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }

.loading-style-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.loading-style-card { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg); transition: border-color $transition-fast, background-color $transition-fast, box-shadow $transition-fast; }
.loading-style-card:hover { border-color: color-mix(in srgb, var(--cp-primary) 36%, var(--cp-border)); background: color-mix(in srgb, var(--cp-primary) 3%, var(--cp-bg)); }
.loading-style-card.is-selected { border-color: color-mix(in srgb, var(--cp-primary) 60%, var(--cp-border)); background: color-mix(in srgb, var(--cp-primary) 6%, var(--cp-bg)); box-shadow: 0 6px 16px rgb(24 24 27 / 7%); }
.loading-style-card__select { display: block; width: 100%; padding: 14px 14px 0; border: 0; color: inherit; background: transparent; cursor: pointer; font: inherit; text-align: left; }
.loading-style-card__select:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: -2px; }
.style-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; min-height: 50px; }
.style-heading strong { display: block; color: var(--cp-text); font-size: $font-sm; font-weight: $font-medium; line-height: 1.5; }
.style-heading small { display: -webkit-box; margin-top: 3px; overflow: hidden; color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.style-heading :deep(.app-icon) { flex: 0 0 auto; margin-top: 2px; color: var(--cp-primary); }
.style-preview { display: block; min-height: 132px; margin-top: 12px; overflow: hidden; border: 1px solid var(--cp-border-light); border-bottom: 0; border-radius: $radius-sm $radius-sm 0 0; background: var(--cp-bg-elevated); }
.preview-content { display: grid; min-height: 132px; place-items: center; color: var(--cp-text-tertiary); font-size: $font-xs; }
.style-tools { display: flex; align-items: center; justify-content: space-between; min-height: 36px; padding: 0 8px 0 14px; border-top: 1px solid var(--cp-border-light); color: var(--cp-text-tertiary); font-size: $font-xs; }
.style-tools > span:last-child { display: inline-flex; align-items: center; }
.style-tools :deep(.el-button) { width: 28px; height: 28px; padding: 0; color: var(--cp-text-secondary); }
.style-tools :deep(.el-button:hover) { color: var(--cp-primary); }

.source-section h3 { margin: 0 0 $spacing-sm; color: var(--cp-text); font-size: $font-base; }.source-section h3 + pre { margin-bottom: $spacing-xl; }.source-section pre { margin: 0; padding: $spacing-md; overflow: auto; border: 1px solid var(--cp-border); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-hover); font-size: $font-xs; line-height: 1.65; }.source-note { margin: $spacing-xl 0 0; color: var(--cp-text-secondary); font-size: $font-sm; }.source-note a { color: var(--cp-primary); }

@include media-max($breakpoint-lg) { .loading-style-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@include media-max($breakpoint-sm) { .loading-style-grid { grid-template-columns: 1fr; } }
</style>
