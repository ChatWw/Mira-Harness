<template>
  <PageContainer title="部门管理">
    <el-row :gutter="16">
      <!-- 左侧：部门树 -->
      <el-col :span="8">
        <el-card shadow="never" class="tree-card">
          <template #header>
            <div class="card-header">
              <span>组织架构</span>
              <el-button
                type="primary"
                size="small"
                :icon="Plus"
                @click="handleAddDept()"
              >
                新增顶级部门
              </el-button>
            </div>
          </template>

          <el-input
            v-model="filterText"
            placeholder="搜索部门"
            :prefix-icon="Search"
            clearable
            style="margin-bottom: 12px"
          />

          <el-tree
            ref="treeRef"
            :data="deptTreeData"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            :filter-node-method="filterNode"
            :expand-on-click-node="false"
            highlight-current
            @node-click="handleNodeClick"
            @node-contextmenu="handleContextMenu"
          >
            <template #default="{ node, data }">
              <div class="tree-node">
                <span class="node-label">
                  {{ data.name }}
                  <span class="member-count">({{ data.memberCount || 0 }})</span>
                </span>
              </div>
            </template>
          </el-tree>
        </el-card>
      </el-col>

      <!-- 右侧：部门成员列表 -->
      <el-col :span="16">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ currentDept?.name || '全部' }}成员</span>
            </div>
          </template>

          <ProTable
            v-if="currentDept"
            ref="tableRef"
            :columns="columns"
            :request="loadMembers"
            :search-schema="[]"
            row-key="id"
          >
            <template #avatar="{ row }">
              <el-avatar :src="row.avatar" :size="32">
                {{ row.nickname?.charAt(0) }}
              </el-avatar>
            </template>

            <template #roles="{ row }">
              <el-tag
                v-for="role in row.roles"
                :key="role"
                type="primary"
                size="small"
                style="margin-right: 4px"
              >
                {{ role }}
              </el-tag>
            </template>

            <template #status="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
                {{ row.status === 1 ? '启用' : '禁用' }}
              </el-tag>
            </template>

            <template #action="{ row }">
              <el-button
                type="warning"
                link
                size="small"
                @click="handleRemoveMember(row)"
              >
                移出部门
              </el-button>
              <el-button
                type="primary"
                link
                size="small"
                @click="handleChangeRole(row)"
              >
                修改角色
              </el-button>
            </template>
          </ProTable>

          <el-empty v-else description="请选择部门查看成员" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 右键菜单 -->
    <el-dropdown
      ref="contextMenuRef"
      trigger="contextmenu"
      :teleported="false"
      :style="contextMenuStyle"
    >
      <span></span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="handleAddDept(contextMenuNode)">
            <el-icon><Plus /></el-icon>
            新增子部门
          </el-dropdown-item>
          <el-dropdown-item @click="handleEditDept(contextMenuNode)">
            <el-icon><Edit /></el-icon>
            编辑
          </el-dropdown-item>
          <el-dropdown-item
            @click="handleDeleteDept(contextMenuNode)"
            divided
          >
            <el-icon><Delete /></el-icon>
            删除
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 部门 CRUD 弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="500px"
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
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Edit, Delete } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import PageContainer from '@/components/PageContainer/index.vue'
import type { ProTableColumn } from '@/components/ProTable/types'
import type { ProFormField } from '@/components/ProForm/types'

const treeRef = ref()
const tableRef = ref()
const formRef = ref()
const contextMenuRef = ref()
const dialogVisible = ref(false)
const submitting = ref(false)
const isEdit = ref(false)
const filterText = ref('')
const currentDept = ref<any>(null)
const contextMenuNode = ref<any>(null)
const contextMenuStyle = ref({})
const formData = ref<any>({})

const deptTreeData = ref([
  {
    id: '1',
    name: '总公司',
    memberCount: 5,
    leader: '张三',
    sort: 1,
    status: 1,
    children: [
      {
        id: '2',
        name: '研发部',
        memberCount: 12,
        leader: '李四',
        sort: 1,
        status: 1,
        children: [
          { id: '3', name: '前端组', memberCount: 5, leader: '王五', sort: 1, status: 1 },
          { id: '4', name: '后端组', memberCount: 7, leader: '赵六', sort: 2, status: 1 },
        ],
      },
      {
        id: '5',
        name: '市场部',
        memberCount: 8,
        leader: '孙七',
        sort: 2,
        status: 1,
      },
    ],
  },
])

const dialogTitle = computed(() => {
  if (contextMenuNode.value && !isEdit.value) {
    return `新增子部门（父级：${contextMenuNode.value.name}）`
  }
  return isEdit.value ? '编辑部门' : '新增部门'
})

// 表格列配置
const columns: ProTableColumn[] = [
  { label: '头像', prop: 'avatar', width: 60, slot: 'avatar' },
  { label: '用户名', prop: 'username', width: 120 },
  { label: '昵称', prop: 'nickname', width: 120 },
  { label: '角色', prop: 'roles', width: 150, slot: 'roles' },
  { label: '状态', prop: 'status', width: 80, slot: 'status' },
  { label: '操作', prop: 'action', width: 200, fixed: 'right', slot: 'action' },
]

// 表单配置
const formSchema: ProFormField[] = [
  {
    label: '部门名称',
    prop: 'name',
    type: 'input',
    required: true,
    rules: [
      { required: true, message: '请输入部门名称' },
      { min: 2, max: 20, message: '部门名称长度为 2-20 个字符' },
    ],
  },
  {
    label: '负责人',
    prop: 'leader',
    type: 'select',
    placeholder: '请选择负责人',
    options: [], // TODO: 从 API 获取用户列表
  },
  {
    label: '排序',
    prop: 'sort',
    type: 'number',
    defaultValue: 0,
  },
  {
    label: '状态',
    prop: 'status',
    type: 'switch',
    defaultValue: 1,
  },
]

// 监听搜索文本
watch(filterText, (val) => {
  treeRef.value?.filter(val)
})

// 过滤节点
function filterNode(value: string, data: any) {
  if (!value) return true
  return data.name.includes(value)
}

// 节点点击
function handleNodeClick(data: any) {
  currentDept.value = data
  nextTick(() => {
    tableRef.value?.refresh()
  })
}

// 右键菜单
function handleContextMenu(event: MouseEvent, data: any, node: any) {
  event.preventDefault()
  contextMenuNode.value = data
  contextMenuStyle.value = {
    position: 'fixed',
    left: `${event.clientX}px`,
    top: `${event.clientY}px`,
    zIndex: 9999,
  }
  // TODO: 显示右键菜单
}

// 加载成员列表
async function loadMembers(params: any) {
  if (!currentDept.value) {
    return { list: [], total: 0 }
  }

  // TODO: 接入真实 API
  return {
    list: [
      {
        id: '1',
        username: 'zhangsan',
        nickname: '张三',
        avatar: '',
        roles: ['管理员'],
        status: 1,
      },
      {
        id: '2',
        username: 'lisi',
        nickname: '李四',
        avatar: '',
        roles: ['开发'],
        status: 1,
      },
    ],
    total: 2,
  }
}

// 新增部门
function handleAddDept(parent?: any) {
  isEdit.value = false
  contextMenuNode.value = parent || null
  formData.value = {
    status: 1,
    sort: 0,
    parentId: parent?.id || null,
  }
  dialogVisible.value = true
}

// 编辑部门
function handleEditDept(data: any) {
  isEdit.value = true
  contextMenuNode.value = null
  formData.value = { ...data }
  dialogVisible.value = true
}

// 提交
async function handleSubmit() {
  const valid = await formRef.value?.validate()
  if (!valid) return

  submitting.value = true
  try {
    // TODO: 调用 API
    await new Promise(resolve => setTimeout(resolve, 1000))
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    // TODO: 刷新树
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// 删除部门
async function handleDeleteDept(data: any) {
  if (data.children && data.children.length > 0) {
    ElMessage.warning('请先删除子部门')
    return
  }

  try {
    await ElMessageBox.confirm('确定要删除该部门吗？', '提示', {
      type: 'warning',
    })
    // TODO: 调用删除 API
    ElMessage.success('删除成功')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

// 移出部门
async function handleRemoveMember(row: any) {
  try {
    await ElMessageBox.confirm(`确定要将 ${row.nickname} 移出该部门吗？`, '提示', {
      type: 'warning',
    })
    // TODO: 调用 API
    ElMessage.success('移出成功')
    tableRef.value?.refresh()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '操作失败')
    }
  }
}

// 修改角色
function handleChangeRole(row: any) {
  ElMessage.info('修改角色功能开发中...')
}
</script>

<style scoped lang="scss">
.tree-card {
  height: calc(100vh - 180px);

  :deep(.el-card__body) {
    height: calc(100% - 60px);
    overflow-y: auto;
  }
}

.card-header {
  @include flex-between;
  align-items: center;
}

.tree-node {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 8px;

  .node-label {
    font-size: $font-sm;
    color: var(--cp-text);

    .member-count {
      color: var(--cp-text-secondary);
      font-size: $font-xs;
      margin-left: 4px;
    }
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

  .is-current > .el-tree-node__content {
    background: var(--cp-primary-light);
  }
}
</style>
