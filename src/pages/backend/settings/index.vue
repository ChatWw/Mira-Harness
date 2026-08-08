<template>
  <div class="settings-redirect" />
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 设置中心入口：跳转到默认设置项（第一个：常规），保留 from 等查询参数
void router.replace({ path: '/settings/general', query: route.query })
</script>
