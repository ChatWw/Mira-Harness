<template>
  <PageContainer title="图标选择器" description="用于浏览和选择应用中可用的图标。">
    <section class="component-preview">
      <div class="preview-heading">
        <h3>图标库</h3>
        <p>图标浏览、搜索和复制能力将在后续版本提供。</p>
      </div>
      <div class="preview-canvas">
        <el-icon :size="32"><Pointer /></el-icon>
        <span>图标选择器准备中</span>
      </div>
    </section>
  </PageContainer>
</template>

<script setup lang="ts">
import { Pointer } from '@element-plus/icons-vue'
import PageContainer from '@/components/PageContainer/index.vue'
</script>

<style scoped lang="scss">
.component-preview { border: 1px solid var(--cp-border); border-radius: $radius-lg; overflow: hidden; }
.preview-heading { padding: $spacing-lg; border-bottom: 1px solid var(--cp-border); }
.preview-heading h3 { margin: 0 0 $spacing-xs; color: var(--cp-text); font-size: $font-base; }
.preview-heading p { margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; }
.preview-canvas { display: flex; min-height: 240px; align-items: center; justify-content: center; flex-direction: column; gap: $spacing-sm; color: var(--cp-text-secondary); background: var(--cp-bg-elevated); }
.preview-canvas :deep(.el-icon) { color: var(--cp-primary); }
</style>
