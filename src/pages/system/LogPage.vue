<template>
  <PageContainer title="操作日志">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :request="loadData"
      :search-schema="searchSchema"
      row-key="id"
    >
      <template #toolbar>
        <el-button :icon="Download" @click="handleExport">
          导出
        </el-button>
      </template>

      <template #type="{ row }">
        <el-tag
          :type="getTypeTag(row.type)"
          size="small"
        >
          {{ getTypeLabel(row.type) }}
        </el-tag>
      </template>

      <template #content="{ row }">
        <el-tooltip :content="row.content" placement="top">
          <span class="content-text">{{ row.content }}</span>
        </el-tooltip>
      </template>

      <template #action="{ row }">
        <el-button
          type="primary"
          link
          size="small"
          @click="handleViewDetail(row)"
        >
          查看详情
        </el-button>
      </template>
    </ProTable>

    <!-- 详情抽屉 -->
    <el-drawer
      v-model="detailDrawerVisible"
      title="操作日志详情"
      size="600px"
    >
      <div v-if="currentLog" class="detail-content">
        <div class="detail-section">
          <h3 class="section-title">基本信息</h3>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="操作人">
              {{ currentLog.username }}
            </el-descriptions-item>
            <el-descriptions-item label="操作类型">
              <el-tag :type="getTypeTag(currentLog.type)" size="small">
                {{ getTypeLabel(currentLog.type) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="模块">
              {{ currentLog.module }}
            </el-descriptions-item>
            <el-descriptions-item label="IP 地址">
              {{ currentLog.ip }}
            </el-descriptions-item>
            <el-descriptions-item label="User-Agent">
              {{ currentLog.userAgent }}
            </el-descriptions-item>
            <el-descriptions-item label="操作时间">
              {{ currentLog.createdAt }}
            </el-descriptions-item>
            <el-descriptions-item label="耗时">
              {{ currentLog.duration }}ms
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="detail-section">
          <h3 class="section-title">请求参数</h3>
          <pre class="json-content">{{ formatJSON(currentLog.params) }}</pre>
        </div>

        <div class="detail-section">
          <h3 class="section-title">响应结果</h3>
          <pre class="json-content">{{ formatJSON(currentLog.result) }}</pre>
        </div>
      </div>
    </el-drawer>
  </PageContainer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import PageContainer from '@/components/PageContainer/index.vue'
import type { ProTableColumn } from '@/components/ProTable/types'
import type { ProFormField } from '@/components/ProForm/types'

const tableRef = ref()
const detailDrawerVisible = ref(false)
const currentLog = ref<any>(null)

// 表格列配置
const columns: ProTableColumn[] = [
  { label: '操作人', prop: 'username', width: 120 },
  { label: '操作类型', prop: 'type', width: 100, slot: 'type' },
  { label: '模块', prop: 'module', width: 120 },
  { label: 'IP', prop: 'ip', width: 140 },
  { label: '操作时间', prop: 'createdAt', width: 160 },
  { label: '操作内容', prop: 'content', minWidth: 200, slot: 'content' },
  { label: '操作', prop: 'action', width: 100, fixed: 'right', slot: 'action' },
]

// 搜索表单配置
const searchSchema: ProFormField[] = [
  {
    label: '时间范围',
    prop: 'timeRange',
    type: 'daterange',
    placeholder: '请选择时间范围',
    props: {
      startPlaceholder: '开始时间',
      endPlaceholder: '结束时间',
      valueFormat: 'YYYY-MM-DD',
    },
  },
  {
    label: '操作人',
    prop: 'username',
    type: 'input',
    placeholder: '请输入操作人',
  },
  {
    label: '操作类型',
    prop: 'type',
    type: 'select',
    placeholder: '请选择操作类型',
    options: [
      { label: '新增', value: 'create' },
      { label: '修改', value: 'update' },
      { label: '删除', value: 'delete' },
      { label: '查询', value: 'read' },
      { label: '登录', value: 'login' },
      { label: '登出', value: 'logout' },
      { label: '其他', value: 'other' },
    ],
  },
  {
    label: '模块',
    prop: 'module',
    type: 'select',
    placeholder: '请选择模块',
    options: [
      { label: '用户管理', value: 'user' },
      { label: '角色管理', value: 'role' },
      { label: '菜单管理', value: 'menu' },
      { label: '部门管理', value: 'dept' },
      { label: '系统设置', value: 'settings' },
    ],
  },
]

// 加载数据
async function loadData(params: any) {
  // TODO: 接入真实 API
  return {
    list: [
      {
        id: '1',
        username: 'admin',
        type: 'create',
        module: 'user',
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        createdAt: '2026-07-15 14:30:00',
        content: '新增用户：张三',
        params: { username: 'zhangsan', nickname: '张三' },
        result: { code: 0, message: '创建成功' },
        duration: 125,
      },
      {
        id: '2',
        username: 'admin',
        type: 'update',
        module: 'role',
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        createdAt: '2026-07-15 14:25:00',
        content: '修改角色权限：管理员',
        params: { roleId: '2', permissions: ['system:user:view'] },
        result: { code: 0, message: '更新成功' },
        duration: 89,
      },
      {
        id: '3',
        username: 'editor',
        type: 'delete',
        module: 'menu',
        ip: '192.168.1.101',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        createdAt: '2026-07-15 14:20:00',
        content: '删除菜单：测试菜单',
        params: { id: '99' },
        result: { code: 0, message: '删除成功' },
        duration: 56,
      },
    ],
    total: 3,
    pageNum: params.pageNum || 1,
    pageSize: params.pageSize || 20,
  }
}

// 获取操作类型标签颜色
function getTypeTag(type: string): string {
  const typeMap: Record<string, string> = {
    create: 'success',
    update: 'primary',
    delete: 'danger',
    read: 'info',
    login: 'success',
    logout: 'warning',
    other: 'info',
  }
  return typeMap[type] || 'info'
}

// 获取操作类型标签文本
function getTypeLabel(type: string): string {
  const labelMap: Record<string, string> = {
    create: '新增',
    update: '修改',
    delete: '删除',
    read: '查询',
    login: '登录',
    logout: '登出',
    other: '其他',
  }
  return labelMap[type] || type
}

// 查看详情
function handleViewDetail(row: any) {
  currentLog.value = row
  detailDrawerVisible.value = true
}

// 格式化 JSON
function formatJSON(data: any): string {
  if (!data) return ''
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

// 导出
function handleExport() {
  ElMessage.info('导出功能开发中...')
  // TODO: 实现 CSV 导出
}
</script>

<style scoped lang="scss">
.content-text {
  display: inline-block;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: help;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: $spacing-xl;
}

.detail-section {
  .section-title {
    font-size: $font-lg;
    font-weight: $font-semibold;
    color: var(--cp-text);
    margin-bottom: $spacing-md;
  }

  .json-content {
    background: var(--cp-bg-elevated);
    color: var(--cp-text);
    padding: $spacing-md;
    border-radius: $radius-md;
    overflow-x: auto;
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    font-size: $font-sm;
    line-height: 1.6;
    margin: 0;
  }
}

:deep(.el-descriptions) {
  .el-descriptions__label {
    background: var(--cp-bg-elevated);
    color: var(--cp-text-secondary);
  }

  .el-descriptions__content {
    background: var(--cp-bg);
    color: var(--cp-text);
  }
}
</style>
