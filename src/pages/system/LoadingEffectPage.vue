<template>
  <PageContainer title="Loading 效果" description="选择一个动效后，会统一应用到页面和局部加载遮罩。">
    <section class="loading-style-grid">
      <article v-for="item in styles" :key="item.id" class="loading-style-card">
        <div class="style-heading">
          <div>
            <h3>{{ item.name }}</h3>
            <p>{{ item.description }}</p>
          </div>
          <el-button type="primary" :icon="loading.style.value === item.id ? Check : MagicStick" :disabled="loading.style.value === item.id" @click="applyStyle(item)">
            {{ loading.style.value === item.id ? '已应用' : '应用' }}
          </el-button>
        </div>
        <div class="style-preview" :aria-label="`${item.name} Loading 效果预览`">
          <AppLoadingOverlay :active="true" :variant="item.id" text="正在加载…">
            <div class="preview-content"><span>内容区域</span></div>
          </AppLoadingOverlay>
        </div>
        <div class="style-tools">
          <el-tooltip content="复制代码"><el-button text :icon="CopyDocument" aria-label="复制代码" @click="copyCode(item)" /></el-tooltip>
          <el-tooltip content="查看源代码"><el-button text :icon="View" aria-label="查看源代码" @click="openSource(item)" /></el-tooltip>
        </div>
      </article>
    </section>

    <el-drawer v-model="sourceVisible" :title="`${sourceItem?.name || ''} 使用代码`" size="min(560px, 100%)">
      <div v-if="sourceItem" class="source-section">
        <h3>局部遮罩</h3>
        <pre><code>{{ localUsageCode }}</code></pre>
        <h3>服务式全局遮罩</h3>
        <pre><code>{{ serviceUsageCode }}</code></pre>
        <p class="source-note">动效来自 <a :href="sourceItem.sourceUrl" target="_blank" rel="noreferrer">{{ sourceItem.source }}</a>，采用 MIT 许可证。</p>
      </div>
    </el-drawer>
  </PageContainer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, CopyDocument, MagicStick, View } from '@element-plus/icons-vue'
import PageContainer from '@/components/PageContainer/index.vue'
import AppLoadingOverlay from '@/components/AppLoadingOverlay.vue'
import { useLoading } from '@/hooks/useLoading'
import type { LoadingStyle } from '@/hooks/useLoading'

type StyleItem = {
  id: LoadingStyle
  name: string
  description: string
  source: string
  sourceUrl: string
}

const styles: StyleItem[] = [
  { id: 'element', name: 'Element Plus', description: 'Element Plus 官方原版 spinner，作为默认基础样式。', source: 'Element Plus', sourceUrl: 'https://element-plus.org/zh-CN/component/loading.html' },
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
  loading.setStyle(item.id)
  ElMessage.success(`${item.name} Loading 已应用到全局遮罩`)
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
.loading-style-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: $spacing-lg; }
.loading-style-card { overflow: hidden; border: 1px solid var(--cp-border); border-radius: $radius-lg; }
.style-heading { display: flex; align-items: center; justify-content: space-between; gap: $spacing-md; padding: $spacing-lg; border-bottom: 1px solid var(--cp-border); }.style-heading h3 { margin: 0 0 $spacing-xs; color: var(--cp-text); font-size: $font-base; }.style-heading p { margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }
.style-preview { min-height: 220px; background: var(--cp-bg-elevated); }.preview-content { display: grid; min-height: 220px; place-items: center; color: var(--cp-text-tertiary); }
.style-tools { display: flex; justify-content: flex-end; gap: $spacing-xs; padding: $spacing-xs $spacing-sm; border-top: 1px solid var(--cp-border); }
.source-section h3 { margin: 0 0 $spacing-sm; font-size: $font-base; color: var(--cp-text); }.source-section h3 + pre { margin-bottom: $spacing-xl; }.source-section pre { margin: 0; padding: $spacing-md; overflow: auto; border: 1px solid var(--cp-border); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-hover); font-size: $font-xs; line-height: 1.65; }.source-note { margin: $spacing-xl 0 0; color: var(--cp-text-secondary); font-size: $font-sm; }.source-note a { color: var(--cp-primary); }
@include media-max($breakpoint-lg) { .loading-style-grid { grid-template-columns: 1fr; } }
@include media-max($breakpoint-sm) { .style-heading { align-items: flex-start; flex-direction: column; }.style-heading :deep(.el-button) { width: 100%; } }
</style>
