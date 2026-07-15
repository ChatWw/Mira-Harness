<template>
  <PageContainer title="通知设置">
    <div class="placeholder-page">
      <div class="placeholder-icon">
        <el-icon :size="64">
          <Bell />
        </el-icon>
      </div>
      <h2 class="placeholder-title">通知设置</h2>
      <p class="placeholder-desc">此页面正在开发中，敬请期待...</p>
    </div>
  </PageContainer>
</template>

<script setup lang="ts">
import { Bell } from '@element-plus/icons-vue'
import PageContainer from '@/components/PageContainer/index.vue'
</script>

<style scoped lang="scss">
.placeholder-page {
  @include flex-center;
  flex-direction: column;
  min-height: 400px;
  gap: $spacing-lg;

  .placeholder-icon {
    color: var(--cp-primary);
    opacity: 0.6;
  }

  .placeholder-title {
    font-size: $font-2xl;
    font-weight: $font-semibold;
    color: var(--cp-text);
    margin: 0;
  }

  .placeholder-desc {
    font-size: $font-base;
    color: var(--cp-text-secondary);
    margin: 0;
  }
}
</style>
