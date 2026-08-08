<template>
  <div class="embedded-web-root" :class="{ 'is-immersive': isImmersive }">
  <PageContainer :title="navigation.title" :description="description">
    <el-card shadow="never" class="embedded-web-page" :class="{ 'is-immersive': isImmersive }">
      <EmbeddedWebFrame
        v-if="iframeTarget"
        :url="iframeTarget.url"
        :title="navigation.title"
        :policy="iframeTarget.iframePolicy"
        fill
      />
      <el-result v-else icon="error" title="网页配置无效" sub-title="当前路由未关联可嵌入的 URL 菜单。" />
    </el-card>
  </PageContainer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PageContainer from '@/components/PageContainer/index.vue'
import { resolveNavigation } from '@/config/navigation'
import EmbeddedWebFrame from '../components/EmbeddedWebFrame.vue'

const route = useRoute()
// 离场动画期间全局路由已经切换，网页宿主仍应按自身的入口路由渲染。
const pagePath = route.path
const navigation = computed(() => resolveNavigation(pagePath))
const iframeTarget = computed(() => navigation.value.menu?.target?.type === 'iframe'
  ? navigation.value.menu.target
  : undefined
)
const isImmersive = computed(() => navigation.value.menu?.showPageHeader === false)
const description = computed(() => iframeTarget.value?.iframePolicy?.profile === 'external'
  ? '该网页将在独立窗口中打开'
  : '通过平台安全策略嵌入的网页内容'
)
</script>

<style scoped lang="scss">
.embedded-web-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  &.is-immersive {
    :deep(.page-container) {
      padding: 0;
    }
  }

  :deep(.page-container) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;

    .page-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  }
}

.embedded-web-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  &.is-immersive {
    border: 0;
    border-radius: 0;

    :deep(.el-card__body) {
      padding: 0;
    }
  }

  :deep(.el-card__body) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}
</style>
