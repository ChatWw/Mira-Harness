<template>
  <el-dropdown trigger="click" @visible-change="handleVisibleChange">
    <div class="notification-trigger">
      <el-badge :value="unreadCount" :hidden="unreadCount === 0" type="danger">
        <el-icon :size="20"><Bell /></el-icon>
      </el-badge>
    </div>

    <template #dropdown>
      <div class="notification-dropdown">
        <div class="notification-header">
          <span class="header-title">消息通知</span>
          <el-button link size="small" @click="markAllAsRead">全部已读</el-button>
        </div>

        <el-tabs v-model="activeTab" class="notification-tabs">
          <el-tab-pane label="全部" name="all" />
          <el-tab-pane label="通知" name="notice" />
          <el-tab-pane label="公告" name="announcement" />
        </el-tabs>

        <div class="notification-list">
          <div
            v-for="item in displayMessages"
            :key="item.id"
            class="notification-item"
            @click="handleClickMessage(item)"
          >
            <div class="item-content">
              <div class="item-title">
                <span>{{ item.title }}</span>
                <el-badge v-if="!item.read" is-dot type="primary" />
              </div>
              <div class="item-desc">{{ item.content }}</div>
              <div class="item-time">{{ item.time }}</div>
            </div>
          </div>

          <el-empty v-if="displayMessages.length === 0" description="暂无消息" :image-size="80" />
        </div>

        <div class="notification-footer">
          <el-button link @click="handleViewAll">
            查看全部消息
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, ArrowRight } from '@element-plus/icons-vue'

const router = useRouter()
const activeTab = ref('all')

interface Message {
  id: string
  type: 'notice' | 'announcement'
  title: string
  content: string
  time: string
  read: boolean
}

// Mock 数据
const messages = ref<Message[]>([
  {
    id: '1',
    type: 'notice',
    title: '系统更新通知',
    content: '系统将于今晚 22:00 进行维护升级',
    time: '5分钟前',
    read: false,
  },
  {
    id: '2',
    type: 'announcement',
    title: '新功能上线',
    content: '全局搜索功能已上线，按 Ctrl+K 快速打开',
    time: '1小时前',
    read: false,
  },
  {
    id: '3',
    type: 'notice',
    title: '审批提醒',
    content: '您有 3 条待审批的申请',
    time: '2小时前',
    read: true,
  },
])

const unreadCount = computed(() => messages.value.filter(m => !m.read).length)

const displayMessages = computed(() => {
  let filtered = messages.value
  if (activeTab.value !== 'all') {
    filtered = filtered.filter(m => m.type === activeTab.value)
  }
  return filtered.slice(0, 5)
})

function handleVisibleChange(visible: boolean) {
  if (!visible) {
    // 下拉框关闭时的处理
  }
}

function markAllAsRead() {
  messages.value.forEach(m => (m.read = true))
}

function handleClickMessage(item: Message) {
  item.read = true
  // 可以跳转到消息详情页
}

function handleViewAll() {
  router.push('/message/list')
}
</script>

<style scoped lang="scss">
.notification-trigger {
  @include flex-center;
  width: 40px;
  height: 40px;
  cursor: pointer;
  border-radius: $radius-md;
  transition: background $transition-fast;

  &:hover {
    background: var(--cp-bg-hover);
  }

  .el-icon {
    color: var(--cp-text);
  }
}

.notification-dropdown {
  width: 360px;
  background: var(--cp-bg-elevated);
  border-radius: $radius-md;
  box-shadow: $shadow-lg;
}

.notification-header {
  @include flex-between;
  padding: $spacing-md $spacing-lg;
  border-bottom: 1px solid var(--cp-border-light);
}

.header-title {
  font-size: $font-base;
  font-weight: 600;
  color: var(--cp-text);
}

.notification-tabs {
  :deep(.el-tabs__header) {
    margin: 0;
    padding: 0 $spacing-lg;
  }

  :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }
}

.notification-list {
  max-height: 400px;
  overflow-y: auto;
}

.notification-item {
  padding: $spacing-md $spacing-lg;
  cursor: pointer;
  border-bottom: 1px solid var(--cp-border-light);
  transition: background $transition-fast;

  &:hover {
    background: var(--cp-bg-hover);
  }

  &:last-child {
    border-bottom: none;
  }
}

.item-content {
  .item-title {
    @include flex-between;
    align-items: center;
    font-size: $font-sm;
    font-weight: 500;
    color: var(--cp-text);
    margin-bottom: 4px;
  }

  .item-desc {
    font-size: $font-xs;
    color: var(--cp-text-secondary);
    margin-bottom: 4px;
    @include text-ellipsis;
  }

  .item-time {
    font-size: $font-xs;
    color: var(--cp-text-tertiary);
  }
}

.notification-footer {
  padding: $spacing-sm $spacing-lg;
  text-align: center;
  border-top: 1px solid var(--cp-border-light);
}
</style>
