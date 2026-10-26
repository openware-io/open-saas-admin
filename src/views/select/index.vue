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
      <section class="role-hero">
        <div class="role-badge">{{ persona.badge }}</div>
        <h1>{{ persona.title }}</h1>
        <p>{{ persona.subtitle }}</p>
        <div class="role-meta">
          <span>账号：{{ authStore.user?.username }}</span>
          <span>工作区：{{ workspaceText }}</span>
          <span v-if="persona.scope === 'STORE'">范围：当前门店</span>
        </div>
      </section>

      <section class="capability-grid">
        <article v-for="item in persona.capabilities" :key="item.title" class="capability-card">
          <div class="capability-icon"><el-icon :size="22"><component :is="resolveIcon(item.icon)" /></el-icon></div>
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </div>
        </article>
      </section>

      <div class="select-title">
        <h2>{{ persona.entryTitle }}</h2>
        <p>{{ persona.entryHint }}</p>
      </div>

      <div v-if="menuStore.backendsLoading" class="loading">
        <el-icon class="is-loading" :size="20"><Loading /></el-icon>
        后台列表加载中…
      </div>

      <div v-else-if="visibleBackends.length" class="backend-cards">
        <div v-for="b in visibleBackends" :key="b.code" class="backend-card" @click="enter(b.code)">
          <div class="backend-icon">
            <el-icon :size="26"><component :is="resolveIcon(b.icon)" /></el-icon>
          </div>
          <div class="backend-info">
            <div class="backend-name">
              {{ backendDisplayName(b) }}
              <el-tag v-if="b.code === 'im'" size="small" type="info">外部</el-tag>
            </div>
            <div class="backend-path">{{ b.code === 'im' ? IM_ADMIN_BASE_URL : b.path }}</div>
          </div>
          <el-icon class="arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <el-empty v-else :description="menuStore.error || '当前角色暂无可进入的后台'" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
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

const personas = {
  super: {
    scope: 'PLATFORM', badge: '超级管理员', title: '平台治理工作台',
    subtitle: '管理租户全生命周期、平台角色权限与支付方式；不进入租户经营数据。',
    capabilities: [
      { title: '租户管理', description: '新增、停用租户，查看租户编码与状态', icon: 'OfficeBuilding' },
      { title: '平台权限', description: '平台角色、权限与运营账号', icon: 'Lock' },
      { title: '支付方式', description: '平台支付渠道与可用性', icon: 'CreditCard' },
    ],
    entryTitle: '平台后台入口', entryHint: '以平台治理身份进入，只展示平台级工作区。',
    backendCodes: ['platform'],
  },
  platform: {
    scope: 'PLATFORM', badge: '平台运营', title: '平台运营工作台',
    subtitle: '维护租户、权限与支付配置，不进入租户门店经营数据。',
    capabilities: [
      { title: '租户运营', description: '租户资料、状态与运营范围', icon: 'OfficeBuilding' },
      { title: '权限管理', description: '平台角色、权限与运营人员', icon: 'Lock' },
      { title: '支付方式', description: '平台支付渠道与可用性', icon: 'CreditCard' },
    ],
    entryTitle: '平台运营入口', entryHint: '以平台运营身份进入，只展示平台级工作区。',
    backendCodes: ['platform'],
  },
  tenant: {
    scope: 'TENANT', badge: '租户管理员', title: '租户经营工作台',
    subtitle: '管理 SaaS 生活服务的总部、门店、人员与经营数据。',
    capabilities: [
      { title: '经营总览', description: '总部跨店经营数据与待办', icon: 'DataAnalysis' },
      { title: '组织与门店', description: '门店、组织与经营上下文', icon: 'OfficeBuilding' },
      { title: '人员与权限', description: '运营人员、角色与授权', icon: 'User' },
      { title: '酒店与 KTV', description: '酒店前台、房型房价与门店运营', icon: 'Hotel' },
    ],
    entryTitle: '租户后台入口', entryHint: '进入后可在右上角切换总部或门店上下文。',
    backendCodes: ['tenant', 'store'],
  },
  store: {
    scope: 'STORE', badge: '门店店长', title: '门店经营工作台',
    subtitle: '只处理当前门店的预约、收银、订单、资源与库存。',
    capabilities: [
      { title: '门店工作台', description: '今日到店、在住、待退房与前台任务', icon: 'Shop' },
      { title: '预约与收银', description: '预约、开台、点单、结账与交班', icon: 'Tickets' },
      { title: '订单与资源', description: '订单、包厢、商品与库存', icon: 'Grid' },
    ],
    entryTitle: '门店入口', entryHint: '店长只进入被授权的门店，不展示平台和总部跨店数据。',
    backendCodes: ['store'],
  },
}

const persona = computed(() => {
  if (authStore.user?.role === 'SUPER_ADMIN') return personas.super
  if (authStore.user?.role === 'PLATFORM_ADMIN') return personas.platform
  if (authStore.roles?.includes('store.manager') || authStore.defaultWorkspace === 'STORE') return personas.store
  return personas.tenant
})

const visibleBackends = computed(() => {
  const allowed = persona.value.backendCodes
  return (menuStore.backends || []).filter((b) => allowed.includes(b.code) || b.code === 'im')
})

const workspaceText = computed(() => {
  if (persona.value.scope === 'PLATFORM') return '平台'
  if (persona.value.scope === 'STORE') return '门店'
  return '租户总部 / 门店'
})

onMounted(() => {
  if (!menuStore.backends.length) menuStore.fetchBackends()
  if (persona.value.scope !== 'PLATFORM' && !contextStore.items.length) {
    contextStore.fetchContexts()
  }
})

function backendDisplayName(backend) {
  if (backend.code === 'platform') {
    return persona.value.badge === '超级管理员' ? 'SaaS 平台管理后台' : 'SaaS 平台运营后台'
  }
  if (backend.code === 'tenant') return 'SaaS 租户管理后台'
  if (backend.code === 'store') return 'SaaS 门店经营后台'
  if (backend.code === 'im') return 'IM 管理后台'
  return backend.name
}

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
.select-page { min-height: 100vh; background: var(--admin-bg, #f0f2f5); }
.select-header { height: var(--header-height); background: #1d1e2c; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
.brand { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 700; }
.header-right { display: flex; align-items: center; gap: 12px; }
.user { color: #c0c4cc; font-size: 13px; }
.select-body { max-width: 1120px; margin: 0 auto; padding: 36px 24px 64px; }
.role-hero { background: #fff; border: 1px solid var(--el-border-color-lighter); border-radius: 14px; padding: 24px 28px; }
.role-badge { display: inline-flex; padding: 3px 10px; border-radius: 999px; color: #0b6f55; background: #e9fbf5; font-size: 12px; font-weight: 700; }
.role-hero h1 { margin: 12px 0 6px; font-size: 24px; color: var(--el-text-color-primary); }
.role-hero p { margin: 0; color: var(--el-text-color-secondary); font-size: 14px; }
.role-meta { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 16px; color: var(--el-text-color-secondary); font-size: 12px; }
.capability-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; margin: 16px 0 28px; }
.capability-card { display: flex; gap: 12px; padding: 16px; border-radius: 12px; background: #fff; border: 1px solid var(--el-border-color-lighter); }
.capability-icon { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; border-radius: 10px; color: #0b6f55; background: #e9fbf5; }
.capability-card h3 { margin: 0 0 4px; font-size: 14px; color: var(--el-text-color-primary); }
.capability-card p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--el-text-color-secondary); }
.select-title h2 { margin: 0 0 6px; font-size: 18px; color: var(--el-text-color-primary); }
.select-title p { margin: 0 0 18px; color: var(--el-text-color-secondary); font-size: 13px; }
.loading { display: flex; align-items: center; gap: 8px; color: var(--el-text-color-secondary); font-size: 14px; }
.backend-cards { display: grid; gap: 10px; }
.backend-card { display: flex; align-items: center; gap: 14px; cursor: pointer; padding: 16px 18px; border-radius: 12px; background: #fff; border: 1px solid var(--el-border-color-lighter); transition: border-color .15s, box-shadow .15s; }
.backend-card:hover { border-color: var(--el-color-primary); box-shadow: 0 4px 14px rgba(19,185,129,.08); }
.backend-icon { width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center; border-radius: 10px; color: #0b6f55; background: #e9fbf5; }
.backend-info { flex: 1; min-width: 0; }
.backend-name { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--el-text-color-primary); }
.backend-path { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.arrow { color: var(--el-text-color-placeholder); }
</style>
