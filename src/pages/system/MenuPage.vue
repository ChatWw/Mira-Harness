<template>
  <div class="system-page">
    <div class="page-header">
      <h1>菜单管理</h1>
      <el-button type="primary" :icon="Plus">新增菜单</el-button>
    </div>

    <el-card shadow="hover">
      <el-table :data="menuList" style="width: 100%;" row-key="id" default-expand-all>
        <el-table-column prop="title" label="菜单名称" width="200" />
        <el-table-column prop="icon" label="图标" width="120">
          <template #default="{ row }">
            <el-icon v-if="row.icon"><component :is="row.icon" /></el-icon>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路径" />
        <el-table-column prop="sort" label="排序" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '显示' ? 'success' : 'info'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default>
            <el-button type="primary" size="small" link>编辑</el-button>
            <el-button type="success" size="small" link>添加子菜单</el-button>
            <el-button type="danger" size="small" link>删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue'

const menuList = [
  {
    id: 1,
    title: '工作台',
    icon: 'Odometer',
    path: '/dashboard',
    sort: 1,
    status: '显示',
  },
  {
    id: 2,
    title: '系统管理',
    icon: 'Setting',
    path: '/system',
    sort: 2,
    status: '显示',
    children: [
      { id: 21, title: '用户管理', icon: 'User', path: '/system/users', sort: 1, status: '显示' },
      { id: 22, title: '角色管理', icon: 'UserFilled', path: '/system/roles', sort: 2, status: '显示' },
      { id: 23, title: '菜单管理', icon: 'Menu', path: '/system/menus', sort: 3, status: '显示' },
    ],
  },
]
</script>

<style scoped>
.system-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--cp-text);
}
</style>
