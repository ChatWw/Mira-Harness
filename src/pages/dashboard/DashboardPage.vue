<template>
  <div class="dashboard-page">
    <div class="page-header">
      <h1>工作台</h1>
      <p>欢迎使用中台基座，这里是您的工作台首页</p>
    </div>

    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #ecfdf5; color: #10b981;">
              <el-icon :size="24"><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">1,234</div>
              <div class="stat-label">用户总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #eff6ff; color: #3b82f6;">
              <el-icon :size="24"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">856</div>
              <div class="stat-label">任务数量</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #fef3c7; color: #f59e0b;">
              <el-icon :size="24"><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">12</div>
              <div class="stat-label">待处理</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #f3e8ff; color: #9333ea;">
              <el-icon :size="24"><Setting /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">98%</div>
              <div class="stat-label">系统健康度</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="content-row">
      <el-col :xs="24" :md="16">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>访问趋势</span>
              <el-tag size="small">近7天</el-tag>
            </div>
          </template>
          <div class="chart-placeholder">
            <el-icon :size="48" color="var(--cp-text-tertiary)"><TrendCharts /></el-icon>
            <p>图表数据展示区域</p>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="8">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>快捷入口</span>
            </div>
          </template>
          <div class="quick-links">
            <div class="quick-link-item" @click="$router.push('/system/users')">
              <el-icon :size="20" color="var(--cp-primary)"><User /></el-icon>
              <span>用户管理</span>
            </div>
            <div class="quick-link-item" @click="$router.push('/system/roles')">
              <el-icon :size="20" color="var(--cp-primary)"><UserFilled /></el-icon>
              <span>角色管理</span>
            </div>
            <div class="quick-link-item" @click="$router.push('/system/menus')">
              <el-icon :size="20" color="var(--cp-primary)"><Menu /></el-icon>
              <span>菜单管理</span>
            </div>
            <div class="quick-link-item">
              <el-icon :size="20" color="var(--cp-primary)"><Setting /></el-icon>
              <span>系统设置</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :xs="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>待办事项</span>
              <el-badge :value="todoList.length" type="primary" />
            </div>
          </template>
          <el-table :data="todoList" style="width: 100%">
            <el-table-column prop="title" label="标题" />
            <el-table-column prop="priority" label="优先级" width="100">
              <template #default="{ row }">
                <el-tag :type="getPriorityType(row.priority)" size="small">
                  {{ row.priority }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="deadline" label="截止日期" width="150" />
            <el-table-column label="操作" width="150">
              <template #default>
                <el-button type="primary" size="small" link>查看</el-button>
                <el-button type="success" size="small" link>完成</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { User, Document, Warning, Setting, TrendCharts, UserFilled, Menu } from '@element-plus/icons-vue'

const todoList = [
  { title: '审核用户注册申请', priority: '高', status: '进行中', deadline: '2026-07-08' },
  { title: '更新系统配置', priority: '中', status: '待处理', deadline: '2026-07-10' },
  { title: '处理用户反馈', priority: '低', status: '待处理', deadline: '2026-07-12' },
]

const getPriorityType = (priority: string) => {
  const map: Record<string, any> = {
    '高': 'danger',
    '中': 'warning',
    '低': 'info',
  }
  return map[priority] || 'info'
}

const getStatusType = (status: string) => {
  const map: Record<string, any> = {
    '进行中': 'primary',
    '待处理': 'warning',
    '已完成': 'success',
  }
  return map[status] || 'info'
}
</script>

<style scoped lang="scss">
.dashboard-page {
  padding: $spacing-lg;
}

.page-header {
  margin-bottom: $spacing-xl;

  h1 {
    font-size: $font-2xl;
    font-weight: 600;
    color: $text;
    margin-bottom: $spacing-xs;
  }

  p {
    color: $text-secondary;
    font-size: $font-sm;
  }
}

.stats-row {
  margin-bottom: $spacing-lg;
}

.stat-card {
  margin-bottom: $spacing-lg;
}

.stat-content {
  @include flex-align-center;
  gap: $spacing-md;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: $radius-lg;
  @include flex-center;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: $font-2xl;
  font-weight: 600;
  color: $text;
  margin-bottom: $spacing-xs;
}

.stat-label {
  font-size: $font-sm;
  color: $text-secondary;
}

.content-row {
  margin-bottom: $spacing-lg;
}

.card-header {
  @include flex-between;
}

.chart-placeholder {
  height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: $text-tertiary;

  p {
    margin-top: $spacing-sm;
    font-size: $font-sm;
  }
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: $spacing-sm;
}

.quick-link-item {
  @include flex-align-center;
  gap: $spacing-sm;
  padding: $spacing-md;
  border-radius: $radius-md;
  background: $bg-elevated;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: $primary-lighter;
    transform: translateY(-2px);
  }

  span {
    font-size: $font-sm;
    color: $text;
  }
}
</style>
