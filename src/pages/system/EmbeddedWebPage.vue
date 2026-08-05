<template>
  <PageContainer :title="navigation.title" :description="description">
    <el-card shadow="never" class="embedded-web-page">
      <EmbeddedWebFrame
        v-if="iframeTarget"
        :url="iframeTarget.url"
        :title="navigation.title"
        :policy="iframeTarget.iframePolicy"
      />
      <el-result v-else icon="error" title="网页配置无效" sub-title="当前路由未关联可嵌入的 URL 菜单。" />
    </el-card>
  </PageContainer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PageContainer from '@/components/PageContainer/index.vue'
import { resolveNavigation } from '@/config/navigation'
import EmbeddedWebFrame from './components/EmbeddedWebFrame.vue'

const route = useRoute()
const navigation = computed(() => resolveNavigation(route.path))
const iframeTarget = computed(() => navigation.value.menu?.target?.type === 'iframe'
  ? navigation.value.menu.target
  : undefined
)
const description = computed(() => iframeTarget.value?.iframePolicy?.profile === 'external'
  ? '该网页将在独立窗口中打开'
  : '通过平台安全策略嵌入的网页内容'
)
</script>

<style scoped lang="scss">
.embedded-web-page {
  min-height: 620px;
}
</style>
