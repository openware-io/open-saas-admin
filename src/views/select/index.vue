<template>
  <div class="select-page">
    <div class="select-header">
      <div class="brand">
        <el-icon :size="22"><OfficeBuilding /></el-icon>
        <span>SaaS 管理后台</span>
      </div>
      <div class="header-right">
        <span class="user">{{ authStore.user?.displayName || authStore.user?.username || '管理员' }}</span>
        <el-button link type="primary" @click="handleLogout">退出登录</el-button>
      </div>
    </div>

    <div class="select-body">
      <div class="select-title">
        <h1>选择要进入的后台</h1>
        <p>以下为根据当前账号权限返回的可用后台入口。</p>
      </div>

      <div v-if="menuStore.backendsLoading" class="loading">
        <el-icon class="is-loading" :size="20"><Loading /></el-icon>
        后台列表加载中…
      </div>

      <div v-else-if="menuStore.backends.length" class="backend-cards">
        <div v-for="b in menuStore.backends" :key="b.code" class="backend-card"
          @click="enter(b.code)">
          <div class="backend-icon">
            <el-icon :size="26"><component :is="resolveIcon(b.icon)" /></el-icon>
          </div>
          <div class="backend-info">
            <div class="backend-name">
              {{ b.name }}
              <el-tag v-if="b.code === 'im'" size="small" type="info">外部</el-tag>
            </div>
            <div class="backend-path">{{ b.code === 'im' ? IM_ADMIN_BASE_URL : b.path }}</div>
          </div>
          <el-icon class="arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <el-empty v-else :description="menuStore.error || '暂无可用后台'" />
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { ArrowRight, Loading, OfficeBuilding } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { useContextStore } from '@/stores/context'
import { useBackend, IM_ADMIN_BASE_URL } from '@/composables/useBackend'
import { resolveIcon } from '@/utils/icon'

const router = useRouter()
const authStore = useAuthStore()
const menuStore = useMenuStore()
const contextStore = useContextStore()
const { enterBackend } = useBackend()

onMounted(() => {
  if (!menuStore.backends.length) {
    menuStore.fetchBackends()
  }
})

function enter(code) {
  enterBackend(code)
}

async function handleLogout() {
  await authStore.logout()
  contextStore.clear()
  router.push('/login')
}
</script>

<style scoped>
.select-page {
  min-height: 100vh;
  background: var(--admin-bg, #f0f2f5);
}

.select-header {
  height: var(--header-height);
  background: #1d1e2c;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 700;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user {
  color: #c0c4cc;
  font-size: 13px;
}

.select-body {
  max-width: 960px;
  margin: 0 auto;
  padding: 48px 24px;
}

.select-title h1 {
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}

.select-title p {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  margin-bottom: 28px;
}

.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.backend-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.backend-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--admin-radius-sm);
  cursor: pointer;
  box-shadow: var(--admin-shadow-card);
  transition:
    box-shadow 0.2s,
    border-color 0.2s,
    transform 0.2s;
}

.backend-card:hover {
  box-shadow: var(--admin-shadow);
  border-color: var(--el-color-primary);
  transform: translateY(-2px);
}

.backend-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.backend-info {
  flex: 1;
  min-width: 0;
}

.backend-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.backend-path {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow {
  color: var(--el-text-color-secondary);
}
</style>
