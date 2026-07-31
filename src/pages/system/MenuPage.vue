<template>
  <PageContainer title="菜单管理">
    <el-card shadow="never">
      <el-tabs v-model="currentAppCode" @tab-change="loadData">
        <el-tab-pane label="公共" name="main" />
        <el-tab-pane v-for="app in microApps" :key="app.code" :label="app.name" :name="app.code" />
        <el-tab-pane name="add" disabled>
          <template #label><el-button link type="primary" :icon="Plus" @click.stop="goMicroApps">新增子应用</el-button></template>
        </el-tab-pane>
      </el-tabs>
      <div class="toolbar">
        <el-button
          type="primary"
          :icon="Plus"
          @click="handleAdd()"
        >
          新增菜单
        </el-button>
        <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      </div>

      <el-table
        :data="menuData"
        row-key="id"
        :tree-props="{ children: 'children' }"
        default-expand-all
        style="margin-top: 16px"
      >
        <el-table-column label="菜单名称" prop="title" min-width="200">
          <template #default="{ row }">
            <el-icon v-if="row.icon" style="margin-right: 6px">
              <component :is="row.icon" />
            </el-icon>
            {{ row.title }}
          </template>
        </el-table-column>
        <el-table-column label="图标" prop="icon" width="80" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.icon" :size="18">
              <component :is="row.icon" />
            </el-icon>
          </template>
        </el-table-column>
        <el-table-column label="排序" prop="sort" width="80" align="center" />
        <el-table-column label="权限标识" prop="permission" min-width="180" />
        <el-table-column label="类型" prop="type" width="80" align="center">
          <template #default="{ row }">
            <el-tag
              v-if="row.type === 'dir'"
              type="info"
              size="small"
            >
              目录
            </el-tag>
            <el-tag
              v-else-if="row.type === 'menu'"
              type="primary"
              size="small"
            >
              菜单
            </el-tag>
            <el-tag
              v-else-if="row.type === 'button'"
              type="warning"
              size="small"
            >
              按钮
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" prop="status" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.type !== 'button'"
              type="success"
              link
              size="small"
              @click="handleAdd(row)"
            >
              新增
            </el-button>
            <el-button
              type="primary"
              link
              size="small"
              @click="handleEdit(row)"
            >
              编辑
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
        </el-table-column>
      </el-table>
    </el-card>

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
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import ProForm from '@/components/ProForm/index.vue'
import PageContainer from '@/components/PageContainer/index.vue'
import { menuApi, microAppApi } from '@/api/system'
import type { ProFormField } from '@/components/ProForm/types'

const formRef = ref()
const dialogVisible = ref(false)
const submitting = ref(false)
const isEdit = ref(false)
const formData = ref<any>({})
const menuData = ref<any[]>([])
const parentMenu = ref<any>(null)
const currentAppCode = ref('main')
const microApps = ref<any[]>([])
const router = useRouter()

const dialogTitle = computed(() => {
  if (parentMenu.value) {
    return `新增子菜单（父级：${parentMenu.value.title}）`
  }
  return isEdit.value ? '编辑菜单' : '新增菜单'
})

// 表单配置（根据类型动态显示字段）
const formSchema = computed<ProFormField[]>(() => {
  const type = formData.value.type || 'dir'

  return [
    {
      label: '类型',
      prop: 'type',
      type: 'radio',
      required: true,
      defaultValue: 'dir',
      options: [
        { label: '目录', value: 'dir' },
        { label: '菜单', value: 'menu' },
        { label: '按钮', value: 'button' },
      ],
      rules: [{ required: true, message: '请选择类型' }],
    },
    {
      label: '名称',
      prop: 'title',
      type: 'input',
      required: true,
      rules: [
        { required: true, message: '请输入名称' },
        { min: 2, max: 20, message: '名称长度为 2-20 个字符' },
      ],
    },
    {
      label: '图标',
      prop: 'icon',
      type: 'input',
      show: () => type !== 'button',
      placeholder: 'Element Plus 图标名称',
    },
    {
      label: '排序',
      prop: 'sort',
      type: 'number',
      defaultValue: 0,
    },
    {
      label: '路由路径',
      prop: 'path',
      type: 'input',
      show: () => type === 'menu',
      placeholder: '/system/users',
    },
    {
      label: '组件地址',
      prop: 'component',
      type: 'input',
      show: () => type === 'menu',
      placeholder: '/src/pages/system/UserPage.vue',
    },
    {
      label: '权限标识',
      prop: 'permission',
      type: 'input',
      show: () => type !== 'dir',
      placeholder: 'system:user:view',
    },
    {
      label: '状态',
      prop: 'status',
      type: 'switch',
      defaultValue: 1,
    },
  ]
})

// 加载数据
async function loadData() {
  try {
    menuData.value = await menuApi.getList({ app_code: currentAppCode.value })
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  }
}

// 新增
function handleAdd(parent?: any) {
  isEdit.value = false
    parentMenu.value = parent || null
  formData.value = {
    type: 'dir',
    status: 1,
    sort: 0,
    parentId: parent?.id || null,
    appCode: currentAppCode.value === 'main' ? null : currentAppCode.value,
  }
  dialogVisible.value = true
}

function goMicroApps() { router.push('/system/microapps') }

async function loadMicroApps() {
  microApps.value = await microAppApi.getAll()
}

// 编辑
function handleEdit(row: any) {
  isEdit.value = true
  parentMenu.value = null
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
      await menuApi.update(formData.value.id, formData.value)
      ElMessage.success('更新成功')
    } else {
      await menuApi.create(formData.value)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadData()
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// 删除
async function handleDelete(row: any) {
  if (row.children && row.children.length > 0) {
    ElMessage.warning('请先删除子菜单')
    return
  }

  try {
    await ElMessageBox.confirm('确定要删除该菜单吗？', '提示', {
      type: 'warning',
    })
    await menuApi.delete(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

// 初始化加载
Promise.all([loadData(), loadMicroApps()])
</script>

<style scoped lang="scss">
.toolbar {
  @include flex-align-center;
  gap: $spacing-sm;
}

:deep(.el-table) {
  color: var(--cp-text);

  .el-table__row {
    &:hover {
      background: var(--cp-bg-hover);
    }
  }

  .el-table__header {
    th {
      background: var(--cp-bg-elevated);
      color: var(--cp-text);
    }
  }
}
</style>
