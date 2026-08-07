<template>
  <div class="pro-table">
    <!-- 搜索表单 -->
    <SearchForm
      v-if="searchFields.length > 0"
      :fields="searchFields"
      :col-span="search?.colSpan"
      :show-expand="search?.showExpand"
      :default-expanded="search?.defaultExpanded"
      :search-text="search?.searchText"
      :reset-text="search?.resetText"
      @search="handleSearch"
      @reset="handleReset"
    />

    <!-- 工具栏 -->
    <div v-if="toolbar" class="table-toolbar">
      <div class="toolbar-left">
        <span v-if="toolbar.title" class="toolbar-title">{{ toolbar.title }}</span>
        <slot name="toolbar-left" />
      </div>
      <div class="toolbar-right">
        <slot name="toolbar-right" />
        <el-button
          v-for="action in toolbar.actions"
          :key="action.text"
          :type="action.type"
          @click="action.click?.()"
        >
          <AppIcon v-if="action.icon" :name="action.icon" />
          {{ action.text }}
        </el-button>
        <el-tooltip v-if="toolbar.showRefresh !== false" content="刷新">
          <el-button circle @click="refresh"><AppIcon name="Refresh" /></el-button>
        </el-tooltip>
        <el-tooltip v-if="toolbar.showDensity !== false" content="密度">
          <el-dropdown @command="handleDensityChange">
            <el-button circle><AppIcon name="Operation" /></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="compact">紧凑</el-dropdown-item>
                <el-dropdown-item command="default">默认</el-dropdown-item>
                <el-dropdown-item command="comfortable">宽松</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-tooltip>
      </div>
    </div>

    <!-- 表格 -->
    <AppLoadingOverlay :active="innerLoading">
    <el-table
      ref="tableRef"
      :data="innerData"
      :row-key="rowKey"
      :row-class-name="getRowClassName"
      :empty-text="emptyText"
      @selection-change="handleSelectionChange"
    >
      <el-table-column v-if="selection" type="selection" width="55" fixed="left" />

      <el-table-column
        v-for="column in visibleColumns"
        :key="column.prop"
        :prop="column.prop"
        :label="column.label"
        :width="column.width"
        :min-width="column.minWidth"
        :fixed="column.fixed"
        :align="column.align"
        :sortable="column.sortable"
        :formatter="column.formatter"
      >
        <template v-if="$slots[column.prop]" #default="scope">
          <slot :name="column.prop" v-bind="scope" />
        </template>
        <template v-else-if="column.dict" #default="{ row }">
          {{ (column.dict && column.dict[row[column.prop]]) || row[column.prop] }}
        </template>
      </el-table-column>

      <el-table-column
        v-if="actions"
        label="操作"
        :width="actionsWidth || 180"
        :fixed="actionsFixed || 'right'"
        align="center"
      >
        <template #default="{ row }">
          <template v-for="action in getActions(row)" :key="action.text">
            <el-button
              v-if="action.show?.(row) !== false"
              link
              :type="action.type"
              :disabled="action.disabled?.(row)"
              @click="handleActionClick(action, row)"
            >
              {{ action.text }}
            </el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
    </AppLoadingOverlay>

    <!-- 分页 -->
    <Pagination
      v-if="pagination !== false && innerData.length > 0"
      v-model:page="queryParams.page"
      v-model:page-size="queryParams.pageSize"
      :total="innerTotal"
      @change="handlePageChange"
    />
  </div>
</template>

<script setup lang="ts" generic="T = any">
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import SearchForm from './components/SearchForm.vue'
import Pagination from './components/Pagination.vue'
import AppLoadingOverlay from '@/components/AppLoadingOverlay.vue'
import type { ProTableColumn, ProTableSearchConfig, ActionButton, SearchField } from './types'

interface Props {
  data?: T[]
  request?: (params: any) => Promise<any>
  columns: ProTableColumn<T>[]
  search?: ProTableSearchConfig
  pagination?: boolean | { pageSize?: number; layout?: string }
  selection?: boolean | 'single' | 'multiple'
  toolbar?: {
    title?: string
    actions?: ActionButton[]
    showRefresh?: boolean
    showDensity?: boolean
    showColumnToggle?: boolean
  }
  actions?: (row: T) => ActionButton[]
  actionsWidth?: number | string
  actionsFixed?: 'left' | 'right'
  rowKey?: string | ((row: T) => string)
  emptyText?: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  pagination: true,
  emptyText: '暂无数据',
  rowKey: 'id',
})

const emit = defineEmits<{
  selectionChange: [rows: T[]]
}>()

const tableRef = ref()
const innerLoading = ref(false)
const innerData = ref<T[]>([])
const innerTotal = ref(0)
const density = ref<'compact' | 'default' | 'comfortable'>('default')
const visibleColumns = ref(props.columns)

const queryParams = reactive({
  page: 1,
  pageSize: typeof props.pagination === 'object' ? props.pagination.pageSize || 10 : 10,
})

const searchParams = reactive<Record<string, any>>({})

// 搜索字段
const searchFields = computed<SearchField[]>(() => {
  if (props.search?.fields) {
    return props.search.fields
  }
  return props.columns
    .filter(col => col.searchable)
    .map(col => ({
      prop: col.prop,
      label: col.label,
      type: col.searchType || 'input',
      options: col.searchOptions,
    }))
})

// 行类名
function getRowClassName() {
  return `row-density-${density.value}`
}

// 获取操作按钮
function getActions(row: T): ActionButton[] {
  return props.actions?.(row) || []
}

// 处理操作按钮点击
async function handleActionClick(action: ActionButton, row: T) {
  if (action.confirmText) {
    try {
      await ElMessageBox.confirm(action.confirmText, '确认操作', {
        type: 'warning',
      })
      action.click?.(row)
    } catch {
      // 取消
    }
  } else {
    action.click?.(row)
  }
}

// 加载数据
async function loadData() {
  if (props.data) {
    innerData.value = props.data
    innerTotal.value = props.data.length
    return
  }

  if (!props.request) return

  innerLoading.value = true
  try {
    const result = await props.request({ ...queryParams, ...searchParams })
    innerData.value = result.list || result.data || []
    innerTotal.value = result.total || 0
  } finally {
    innerLoading.value = false
  }
}

// 搜索
function handleSearch(params: Record<string, any>) {
  Object.assign(searchParams, params)
  queryParams.page = 1
  loadData()
}

// 重置
function handleReset() {
  Object.keys(searchParams).forEach(key => {
    searchParams[key] = undefined
  })
  queryParams.page = 1
  loadData()
}

// 分页变化
function handlePageChange() {
  loadData()
}

// 刷新
function refresh() {
  loadData()
}

// 密度切换
function handleDensityChange(command: 'compact' | 'default' | 'comfortable') {
  density.value = command
}

// 选择变化
function handleSelectionChange(rows: T[]) {
  emit('selectionChange', rows)
}

// 获取选中行
function getSelectedRows(): T[] {
  return tableRef.value?.getSelectionRows() || []
}

// 监听外部 loading
watch(() => props.loading, (val) => {
  if (val !== undefined) {
    innerLoading.value = val
  }
})

// 监听外部 data
watch(() => props.data, (val) => {
  if (val) {
    innerData.value = val
    innerTotal.value = val.length
  }
}, { immediate: true })

onMounted(() => {
  if (props.request) {
    loadData()
  }
})

defineExpose({
  refresh,
  getSelectedRows,
  loadData,
})
</script>

<style scoped lang="scss">
.pro-table {
  background: var(--cp-bg);
  border-radius: $radius-md;
  padding: $spacing-md;

  :deep(.el-table) {
    --el-table-bg-color: var(--cp-bg);
    --el-table-tr-bg-color: var(--cp-bg);
    --el-table-header-bg-color: var(--cp-bg-elevated);
    --el-table-border-color: var(--cp-border);

    .row-density-compact {
      height: 40px;
    }

    .row-density-default {
      height: 52px;
    }

    .row-density-comfortable {
      height: 64px;
    }
  }
}

.table-toolbar {
  @include flex-between;
  margin-bottom: $spacing-md;

  .toolbar-left {
    @include flex-center;
    justify-content: flex-start;
    gap: $spacing-md;
  }

  .toolbar-title {
    font-size: $font-lg;
    font-weight: 600;
    color: var(--cp-text);
  }

  .toolbar-right {
    @include flex-center;
    gap: $spacing-sm;
  }
}
</style>
