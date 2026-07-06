<template>
  <div class="system-page">
    <div class="page-header">
      <h1>用户管理</h1>
      <el-button type="primary" :icon="Plus">新增用户</el-button>
    </div>

    <el-card shadow="hover">
      <div class="search-bar">
        <el-input
          v-model="searchText"
          placeholder="搜索用户名或邮箱"
          :prefix-icon="Search"
          clearable
          style="max-width: 300px;"
        />
        <el-button type="primary" :icon="Search">搜索</el-button>
      </div>

      <el-table :data="userList" style="width: 100%; margin-top: 20px;">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="用户名" />
        <el-table-column prop="email" label="邮箱" />
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.role }}</el-tag>
          </template>
        </el-table-column>
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
            <el-button type="danger" size="small" link>删除</el-button>
            <el-button type="warning" size="small" link>重置密码</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="currentPage"
        :page-size="10"
        :total="50"
        layout="total, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'

const searchText = ref('')
const currentPage = ref(1)

const userList = [
  { id: 1, name: 'Demo User', email: 'demo@example.com', role: '管理员', status: '启用', createTime: '2026-01-15 10:30:00' },
  { id: 2, name: '张三', email: 'zhangsan@example.com', role: '普通用户', status: '启用', createTime: '2026-02-20 14:20:00' },
  { id: 3, name: '李四', email: 'lisi@example.com', role: '普通用户', status: '禁用', createTime: '2026-03-10 09:15:00' },
  { id: 4, name: '王五', email: 'wangwu@example.com', role: '编辑', status: '启用', createTime: '2026-04-05 16:45:00' },
  { id: 5, name: '赵六', email: 'zhaoliu@example.com', role: '普通用户', status: '启用', createTime: '2026-05-12 11:00:00' },
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

.search-bar {
  display: flex;
  gap: 12px;
}
</style>
