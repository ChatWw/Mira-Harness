<template>
  <div class="system-page">
    <div class="page-header">
      <h1>角色管理</h1>
      <el-button type="primary" :icon="Plus">新增角色</el-button>
    </div>

    <el-card shadow="hover">
      <el-table :data="roleList" style="width: 100%;">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="角色名称" />
        <el-table-column prop="code" label="角色编码" />
        <el-table-column prop="description" label="描述" />
        <el-table-column prop="userCount" label="用户数" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" width="180" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default>
            <el-button type="primary" size="small" link>编辑</el-button>
            <el-button type="warning" size="small" link>权限</el-button>
            <el-button type="danger" size="small" link>删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue'

const roleList = [
  { id: 1, name: '超级管理员', code: 'super_admin', description: '拥有所有权限', userCount: 2, status: '启用', createTime: '2026-01-01 00:00:00' },
  { id: 2, name: '管理员', code: 'admin', description: '拥有管理权限', userCount: 5, status: '启用', createTime: '2026-01-01 00:00:00' },
  { id: 3, name: '编辑', code: 'editor', description: '可以编辑内容', userCount: 12, status: '启用', createTime: '2026-01-15 10:00:00' },
  { id: 4, name: '普通用户', code: 'user', description: '基础访问权限', userCount: 156, status: '启用', createTime: '2026-01-01 00:00:00' },
]
</script>

<style scoped lang="scss">
.system-page {
  padding: $spacing-lg;

  .page-header {
    @include flex-between;
    margin-bottom: $spacing-lg;

    h1 {
      font-size: 24px;
      font-weight: 600;
      color: $text;
    }
  }
}
</style>
