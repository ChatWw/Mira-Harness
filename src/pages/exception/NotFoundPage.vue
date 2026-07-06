<template>
  <div class="not-found-page">
    <div class="content">
      <div class="error-code">404</div>
      <h1>页面不存在</h1>
      <p>抱歉，您访问的页面不存在或已被移除</p>
      <el-button type="primary" size="large" @click="$router.push('/dashboard')">
        返回首页
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
  background: $bg;

  .content {
    text-align: center;
    padding: $spacing-xl;

    .error-code {
      font-size: 120px;
      font-weight: 700;
      color: $primary;
      line-height: 1;
      margin-bottom: $spacing-lg;
    }

    h1 {
      font-size: 32px;
      font-weight: 600;
      color: $text;
      margin-bottom: $spacing-sm;
    }

    p {
      font-size: 16px;
      color: $text-secondary;
      margin-bottom: $spacing-2xl;
    }
  }
}
</style>
