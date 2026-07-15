<template>
  <div class="pro-table-pagination">
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="currentPageSize"
      :total="total"
      :layout="layout"
      :page-sizes="pageSizes"
      background
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  total: number
  page: number
  pageSize: number
  layout?: string
  pageSizes?: number[]
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'total, sizes, prev, pager, next, jumper',
  pageSizes: () => [10, 20, 50, 100],
})

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
  change: [page: number, pageSize: number]
}>()

const currentPage = computed({
  get: () => props.page,
  set: (val) => emit('update:page', val),
})

const currentPageSize = computed({
  get: () => props.pageSize,
  set: (val) => emit('update:pageSize', val),
})

function handleSizeChange(size: number) {
  emit('update:pageSize', size)
  emit('change', 1, size)
}

function handleCurrentChange(page: number) {
  emit('update:page', page)
  emit('change', page, props.pageSize)
}
</script>

<style scoped lang="scss">
.pro-table-pagination {
  display: flex;
  justify-content: flex-end;
  padding: $spacing-lg 0;

  :deep(.el-pagination) {
    --el-pagination-bg-color: var(--cp-bg);
    --el-pagination-button-color: var(--cp-text);
    --el-pagination-hover-color: var(--cp-primary);
  }
}
</style>
