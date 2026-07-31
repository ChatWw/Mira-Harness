<template>
  <PageContainer title="用户管理">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :request="loadData"
      :search-schema="searchSchema"
      row-key="id"
      @selection-change="handleSelectionChange"
    >
      <template #toolbar>
        <el-button
          type="primary"
          :icon="Plus"
          @click="handleAdd"
        >
          新增用户
        </el-button>
        <el-button
          :icon="Delete"
          :disabled="!selectedIds.length"
          @click="handleBatchDelete"
        >
          批量删除
        </el-button>
        <el-button
          :icon="Check"
          :disabled="!selectedIds.length"
          @click="handleBatchStatus(1)"
        >
          批量启用
        </el-button>
        <el-button
          :icon="Close"
          :disabled="!selectedIds.length"
          @click="handleBatchStatus(0)"
        >
          批量禁用
        </el-button>
        <el-button :icon="Download" @click="handleExport">
          导出
        </el-button>
      </template>

      <template #avatar="{ row }">
        <el-avatar :src="row.avatar" :size="32">
          {{ row.nickname?.charAt(0) || row.username?.charAt(0) }}
        </el-avatar>
      </template>

      <template #roleName="{ row }">
        <el-tag type="primary" size="small">{{ row.roleName }}</el-tag>
      </template>

      <template #status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
          {{ row.status === 1 ? '启用' : '禁用' }}
        </el-tag>
      </template>

      <template #action="{ row }">
        <el-button
          type="primary"
          link
          size="small"
          @click="handleEdit(row)"
        >
          编辑
        </el-button>
        <el-button
          type="warning"
          link
          size="small"
          @click="handleResetPassword(row)"
        >
          重置密码
        </el-button>
        <el-button
          type="danger"
          link
          size="small"
          @click="handleDelete(row)"
        >
          删除
        </el-button>
      </template>
    </ProTable>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      :close-on-click-modal="false"
    >
      <ProForm
        ref="formRef"
        :schema="formSchema"
        :model="formData"
        label-width="100px"
      />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          确定
        </el-button>
      </template>
    </el-dialog>
  </PageContainer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Check, Close, Download } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import PageContainer from '@/components/PageContainer/index.vue'
import { userApi } from '@/api/user'
import type { ProTableColumn } from '@/components/ProTable/types'
import type { ProFormField } from '@/components/ProForm/types'

const tableRef = ref()
const formRef = ref()
const dialogVisible = ref(false)
const submitting = ref(false)
const selectedIds = ref<string[]>([])
const isEdit = ref(false)
const formData = ref<any>({})

const dialogTitle = computed(() => (isEdit.value ? '编辑用户' : '新增用户'))

// 表格列配置
const columns: ProTableColumn[] = [
  { label: '头像', prop: 'avatar', width: 60, slot: 'avatar' },
  { label: '用户名', prop: 'username', width: 120 },
  { label: '昵称', prop: 'nickname', width: 120 },
  { label: '手机号', prop: 'phone', width: 140 },
  { label: '邮箱', prop: 'email', width: 180 },
  { label: '角色', prop: 'roleName', width: 100, slot: 'roleName' },
  { label: '部门', prop: 'deptName', width: 120 },
  { label: '状态', prop: 'status', width: 80, slot: 'status' },
  { label: '创建时间', prop: 'createdAt', width: 160 },
  { label: '操作', prop: 'action', width: 200, fixed: 'right', slot: 'action' },
]

// 搜索表单配置
const searchSchema: ProFormField[] = [
  {
    label: '用户名',
    prop: 'username',
    type: 'input',
    placeholder: '请输入用户名',
  },
  {
    label: '手机号',
    prop: 'phone',
    type: 'input',
    placeholder: '请输入手机号',
  },
  {
    label: '状态',
    prop: 'status',
    type: 'select',
    placeholder: '请选择状态',
    options: [
      { label: '启用', value: 1 },
      { label: '禁用', value: 0 },
    ],
  },
  {
    label: '部门',
    prop: 'deptId',
    type: 'tree-select',
    placeholder: '请选择部门',
    props: {
      data: [], // TODO: 从 API 获取部门树
      checkStrictly: true,
    },
  },
]

// 表单配置
const formSchema = computed<ProFormField[]>(() => [
  {
    label: '用户名',
    prop: 'username',
    type: 'input',
    required: true,
    disabled: isEdit.value,
    rules: [
      { required: true, message: '请输入用户名' },
      { min: 3, max: 20, message: '用户名长度为 3-20 个字符' },
      { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
    ],
  },
  {
    label: '昵称',
    prop: 'nickname',
    type: 'input',
    required: true,
    rules: [
      { required: true, message: '请输入昵称' },
      { min: 2, max: 20, message: '昵称长度为 2-20 个字符' },
    ],
  },
  {
    label: '手机号',
    prop: 'phone',
    type: 'input',
    required: true,
    rules: [
      { required: true, message: '请输入手机号' },
      { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
    ],
  },
  {
    label: '邮箱',
    prop: 'email',
    type: 'input',
    rules: [
      { type: 'email', message: '请输入正确的邮箱地址' } as any,
    ],
  },
  {
    label: '密码',
    prop: 'password',
    type: 'input',
    required: !isEdit.value,
    show: !isEdit.value ? undefined : () => false,
    props: {
      type: 'password',
      showPassword: true,
    },
    rules: !isEdit.value ? [
      { required: true, message: '请输入密码' },
      { min: 8, max: 20, message: '密码长度为 8-20 个字符' },
      {
        pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
        message: '密码必须包含大小写字母和数字',
      },
    ] : undefined,
  },
  {
    label: '部门',
    prop: 'deptId',
    type: 'tree-select',
    placeholder: '请选择部门',
    props: {
      data: [], // TODO: 从 API 获取部门树
      checkStrictly: true,
    },
  },
  {
    label: '角色',
    prop: 'roleIds',
    type: 'select',
    required: true,
    placeholder: '请选择角色',
    props: {
      multiple: true,
    },
    options: [], // TODO: 从 API 获取角色列表
    rules: [
      { required: true, message: '请选择角色' },
    ],
  },
  {
    label: '状态',
    prop: 'status',
    type: 'switch',
    defaultValue: 1,
  },
])

// 加载数据
async function loadData(params: any) {
  const { data } = await userApi.getList(params)
  return data
}

// 选择变化
function handleSelectionChange(rows: any[]) {
  selectedIds.value = rows.map((row) => row.id)
}

// 新增
function handleAdd() {
  isEdit.value = false
  formData.value = {
    status: 1,
  }
  dialogVisible.value = true
}

// 编辑
function handleEdit(row: any) {
  isEdit.value = true
  formData.value = { ...row }
  dialogVisible.value = true
}

// 提交
async function handleSubmit() {
  const valid = await formRef.value?.validate()
  if (!valid) return

  submitting.value = true
  try {
    if (isEdit.value) {
      await userApi.update(formData.value.id, formData.value)
      ElMessage.success('更新成功')
    } else {
      await userApi.create(formData.value)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    tableRef.value?.refresh()
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// 删除
async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定要删除该用户吗？', '提示', {
      type: 'warning',
    })
    await userApi.delete(row.id)
    ElMessage.success('删除成功')
    tableRef.value?.refresh()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

// 批量删除
async function handleBatchDelete() {
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${selectedIds.value.length} 个用户吗？`, '提示', {
      type: 'warning',
    })
    // 批量删除
    await Promise.all(selectedIds.value.map(id => userApi.delete(id)))
    ElMessage.success('删除成功')
    tableRef.value?.refresh()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

// 批量修改状态
async function handleBatchStatus(status: number) {
  try {
    await ElMessageBox.confirm(
      `确定要${status === 1 ? '启用' : '禁用'}选中的 ${selectedIds.value.length} 个用户吗？`,
      '提示',
      { type: 'warning' }
    )
    // 批量更新状态
    await Promise.all(selectedIds.value.map(id => userApi.update(id, { status })))
    ElMessage.success('操作成功')
    tableRef.value?.refresh()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '操作失败')
    }
  }
}

// 重置密码
async function handleResetPassword(row: any) {
  try {
    await ElMessageBox.confirm('确定要重置该用户的密码吗？密码将重置为：123456', '提示', {
      type: 'warning',
    })
    await userApi.resetPassword(row.id)
    ElMessage.success('密码重置成功')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '重置失败')
    }
  }
}

// 导出
function handleExport() {
  ElMessage.info('导出功能开发中...')
}
</script>
