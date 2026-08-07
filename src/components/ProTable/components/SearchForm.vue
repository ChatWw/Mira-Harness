<template>
  <div class="pro-table-search">
    <el-form :model="searchModel" label-width="auto" @submit.prevent="handleSearch">
      <el-row :gutter="16">
        <el-col
          v-for="(field, index) in displayFields"
          :key="field.prop"
          :span="colSpan"
        >
          <el-form-item :label="field.label">
            <el-input
              v-if="field.type === 'input'"
              v-model="searchModel[field.prop]"
              :placeholder="field.placeholder || `请输入${field.label}`"
              :clearable="field.clearable !== false"
            />

            <el-select
              v-else-if="field.type === 'select'"
              v-model="searchModel[field.prop]"
              :placeholder="field.placeholder || `请选择${field.label}`"
              :clearable="field.clearable !== false"
              style="width: 100%"
            >
              <el-option
                v-for="opt in field.options"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>

            <el-date-picker
              v-else-if="field.type === 'date'"
              v-model="searchModel[field.prop]"
              type="date"
              :placeholder="field.placeholder || `请选择${field.label}`"
              :clearable="field.clearable !== false"
              style="width: 100%"
            />

            <el-date-picker
              v-else-if="field.type === 'daterange'"
              v-model="searchModel[field.prop]"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              :clearable="field.clearable !== false"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>

        <el-col :span="colSpan" class="search-actions">
          <el-form-item>
            <el-button type="primary" @click="handleSearch">
              {{ searchText }}
            </el-button>
            <el-button @click="handleReset">
              {{ resetText }}
            </el-button>
            <el-button
              v-if="showExpand && fields.length > expandThreshold"
              link
              @click="expanded = !expanded"
            >
              {{ expanded ? '收起' : '展开' }}
              <AppIcon :name="expanded ? 'ArrowUp' : 'ArrowDown'" />
            </el-button>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import type { SearchField } from '../types'

interface Props {
  fields: SearchField[]
  colSpan?: number
  showExpand?: boolean
  defaultExpanded?: boolean
  searchText?: string
  resetText?: string
}

const props = withDefaults(defineProps<Props>(), {
  colSpan: 6,
  showExpand: true,
  defaultExpanded: false,
  searchText: '搜索',
  resetText: '重置',
})

const emit = defineEmits<{
  search: [params: Record<string, any>]
  reset: []
}>()

const expanded = ref(props.defaultExpanded)
const searchModel = reactive<Record<string, any>>({})

// 初始化默认值
watch(() => props.fields, (fields) => {
  fields.forEach(field => {
    if (field.defaultValue !== undefined) {
      searchModel[field.prop] = field.defaultValue
    }
  })
}, { immediate: true })

const expandThreshold = 2
const displayFields = computed(() => {
  if (!props.showExpand || expanded.value) {
    return props.fields
  }
  const fieldsPerRow = Math.floor(24 / props.colSpan)
  return props.fields.slice(0, expandThreshold * fieldsPerRow)
})

function handleSearch() {
  emit('search', { ...searchModel })
}

function handleReset() {
  Object.keys(searchModel).forEach(key => {
    searchModel[key] = undefined
  })
  emit('reset')
}
</script>

<style scoped lang="scss">
.pro-table-search {
  padding: $spacing-lg;
  background: var(--cp-bg);
  border-radius: $radius-md;
  margin-bottom: $spacing-md;

  .search-actions {
    display: flex;
    align-items: center;

    :deep(.el-form-item) {
      margin-bottom: 0;
    }
  }
}
</style>
