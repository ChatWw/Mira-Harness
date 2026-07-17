<template>
  <PageContainer title="角色管理">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :request="loadData"
      :search-schema="searchSchema"
      row-key="id"
    >
      <template #toolbar>
        <el-button
          type="primary"
          :icon="Plus"
          @click="handleAdd"
          v-permission="'system:role:create'"
        >
          新增角色
        </el-button>
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
          v-permission="'system:role:update'"
        >
          编辑
        </el-button>
        <el-button
          type="warning"
          link
          size="small"
          @click="handlePermission(row)"
          v-permission="'system:role:permission'"
        >
          权限分配
        </el-button>
        <el-button
          type="danger"
          link
          size="small"
          @click="handleDelete(row)"
          v-permission="'system:role:delete'"
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

    <!-- 权限分配抽屉 -->
    <el-drawer
      v-model="permissionDrawerVisible"
      title="权限分配"
      size="600px"
      :close-on-click-modal="false"
    >
      <div class="permission-content">
        <div class="permission-section">
          <h3 class="section-title">菜单权限</h3>
          <el-tree
            ref="menuTreeRef"
            :data="menuTreeData"
            show-checkbox
            node-key="id"
            :props="{ label: 'title', children: 'children' }"
            :default-checked-keys="checkedMenuKeys"
            @check="handleMenuCheck"
          />
        </div>

        <div class="permission-section">
          <h3 class="section-title">数据权限</h3>
          <el-radio-group v-model="dataScope">
            <el-radio :label="1">全部数据</el-radio>
            <el-radio :label="2">本部门数据</el-radio>
            <el-radio :label="3">本部门及以下部门数据</el-radio>
            <el-radio :label="4">自定义部门</el-radio>
          </el-radio-group>

          <el-tree-select
            v-if="dataScope === 4"
            v-model="customDeptIds"
            :data="deptTreeData"
            multiple
            collapse-tags
            placeholder="请选择部门"
            style="width: 100%; margin-top: 12px"
            :props="{ label: 'name', children: 'children' }"
          />
        </div>
      </div>

      <template #footer>
        <el-button @click="permissionDrawerVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSavePermission" :loading="savingPermission">
          保存
        </el-button>
      </template>
    </el-drawer>
  </PageContainer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import PageContainer from '@/components/PageContainer/index.vue'
import { roleApi, menuApi } from '@/api/system'
import type { ProTableColumn } from '@/components/ProTable/types'
import type { ProFormField } from '@/components/ProForm/types'

const tableRef = ref()
const formRef = ref()
const menuTreeRef = ref()
const dialogVisible = ref(false)
const permissionDrawerVisible = ref(false)
const submitting = ref(false)
const savingPermission = ref(false)
const isEdit = ref(false)
const formData = ref<any>({})
const currentRole = ref<any>(null)
const checkedMenuKeys = ref<string[]>([])
const dataScope = ref(1)
const customDeptIds = ref<string[]>([])
const menuTreeData = ref<any[]>([])
const deptTreeData = ref<any[]>([])

const dialogTitle = computed(() => (isEdit.value ? '编辑角色' : '新增角色'))

// 表格列配置
const columns: ProTableColumn[] = [
  { label: '角色名称', prop: 'roleName', width: 150 },
  { label: '角色标识', prop: 'roleKey', width: 150 },
  { label: '排序', prop: 'sort', width: 80 },
  { label: '状态', prop: 'status', width: 80, slot: 'status' },
  { label: '创建时间', prop: 'createdAt', width: 160 },
  { label: '操作', prop: 'action', width: 240, fixed: 'right', slot: 'action' },
]

// 搜索表单配置
const searchSchema: ProFormField[] = [
  {
    label: '角色名称',
    prop: 'roleName',
    type: 'input',
    placeholder: '请输入角色名称',
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
]

// 表单配置
const formSchema: ProFormField[] = [
  {
    label: '角色名称',
    prop: 'roleName',
    type: 'input',
    required: true,
    rules: [
      { required: true, message: '请输入角色名称' },
      { min: 2, max: 20, message: '角色名称长度为 2-20 个字符' },
    ],
  },
  {
    label: '角色标识',
    prop: 'roleKey',
    type: 'input',
    required: true,
    rules: [
      { required: true, message: '请输入角色标识' },
      { pattern: /^[a-z_]+$/, message: '角色标识只能包含小写字母和下划线' },
    ],
  },
  {
    label: '排序',
    prop: 'sort',
    type: 'number',
    defaultValue: 0,
  },
  {
    label: '备注',
    prop: 'remark',
    type: 'textarea',
    props: {
      rows: 3,
      maxlength: 200,
      showWordLimit: true,
    },
  },
  {
    label: '状态',
    prop: 'status',
    type: 'switch',
    defaultValue: 1,
  },
]

// 加载数据
async function loadData(params: any) {
  const { data } = await roleApi.getList(params)
  return data
}

// 加载菜单树
async function loadMenuTree() {
  try {
    menuTreeData.value = await menuApi.getList({ app_code: 'main' })
  } catch (error: any) {
    ElMessage.error(error.message || '加载菜单树失败')
  }
}

// 加载部门树
async function loadDeptTree() {
  try {
    // TODO: 实现部门树 API
    deptTreeData.value = []
  } catch (error: any) {
    ElMessage.error(error.message || '加载部门树失败')
  }
}

// 新增
function handleAdd() {
  isEdit.value = false
  formData.value = {
    status: 1,
    sort: 0,
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
      await roleApi.update(formData.value.id, formData.value)
      ElMessage.success('更新成功')
    } else {
      await roleApi.create(formData.value)
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
    await ElMessageBox.confirm('确定要删除该角色吗？', '提示', {
      type: 'warning',
    })
    await roleApi.delete(row.id)
    ElMessage.success('删除成功')
    tableRef.value?.refresh()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

// 权限分配
async function handlePermission(row: any) {
  currentRole.value = row

  // 加载菜单树和部门树
  await Promise.all([loadMenuTree(), loadDeptTree()])

  // 加载角色已有权限（TODO: 实现 API）
  try {
    checkedMenuKeys.value = []
    dataScope.value = 1
    customDeptIds.value = []
  } catch (error: any) {
    ElMessage.error(error.message || '加载权限失败')
  }

  permissionDrawerVisible.value = true
}

// 菜单树选中事件（处理父子联动）
function handleMenuCheck() {
  // Element Plus Tree 组件会自动处理父子联动
}

// 保存权限
async function handleSavePermission() {
  savingPermission.value = true
  try {
    const menuIds = menuTreeRef.value?.getCheckedKeys() || []
    const halfCheckedKeys = menuTreeRef.value?.getHalfCheckedKeys() || []

    // TODO: 实现权限保存 API
    await roleApi.update(currentRole.value.id, {
      menuIds: [...menuIds, ...halfCheckedKeys], // 包含半选节点
      dataScope: dataScope.value,
      deptIds: dataScope.value === 4 ? customDeptIds.value : [],
    })

    ElMessage.success('权限保存成功')
    permissionDrawerVisible.value = false
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    savingPermission.value = false
  }
}
</script>

<style scoped lang="scss">
.permission-content {
  display: flex;
  flex-direction: column;
  gap: $spacing-xl;
}

.permission-section {
  .section-title {
    font-size: $font-lg;
    font-weight: $font-semibold;
    color: var(--cp-text);
    margin-bottom: $spacing-md;
  }
}

:deep(.el-tree) {
  background: transparent;
  color: var(--cp-text);

  .el-tree-node__content {
    &:hover {
      background: var(--cp-bg-hover);
    }
  }
}
</style>
