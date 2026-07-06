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

<style scoped>
.not-found-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cp-bg);
}

.content {
  text-align: center;
  padding: 40px;
}

.error-code {
  font-size: 120px;
  font-weight: 700;
  color: var(--cp-primary);
  line-height: 1;
  margin-bottom: 24px;
}

h1 {
  font-size: 32px;
  font-weight: 600;
  color: var(--cp-text);
  margin-bottom: 12px;
}

p {
  font-size: 16px;
  color: var(--cp-text-secondary);
  margin-bottom: 32px;
}
</style>
