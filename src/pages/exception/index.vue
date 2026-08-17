<template>
  <div class="not-found-page">
    <div class="content">
      <div class="error-code">404</div>
      <h1>页面不存在</h1>
      <p>抱歉，您访问的页面不存在或已被移除</p>
      <el-button type="primary" size="large" @click="$router.push('/workspace/chat')">
        返回新对话
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped lang="scss">
.not-found-page {
  min-height: 100vh;
  @include flex-center;
  background: var(--cp-bg);

  .content {
    text-align: center;
    padding: $spacing-xl;

    .error-code {
      font-size: 7.5rem; // 120px
      font-weight: $font-bold;
      color: var(--cp-primary);
      line-height: 1;
      margin-bottom: $spacing-lg;
    }

    h1 {
      font-size: $font-3xl;
      font-weight: $font-semibold;
      color: var(--cp-text);
      margin-bottom: $spacing-sm;
    }

    p {
      font-size: $font-base;
      color: var(--cp-text-secondary);
      margin-bottom: $spacing-2xl;
    }
  }
}
</style>
