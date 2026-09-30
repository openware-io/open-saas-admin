<template>
  <el-container class="admin-layout">
    <button v-if="!isCollapse" class="sidebar-backdrop" aria-label="收起导航" @click="isCollapse = true" />
    <el-aside :width="isCollapse ? '64px' : '220px'" class="sidebar" :class="{ 'sidebar-expanded': !isCollapse }">
      <div class="logo" @click="router.push('/select')">
        <el-icon :size="24"><OfficeBuilding /></el-icon>
        <span v-show="!isCollapse" class="logo-text">SaaS 管理后台</span>
      </div>
      <el-menu
        :default-active="route.path"
        :collapse="isCollapse"
        :router="true"
        background-color="#1d1e2c"
        text-color="#a3a6ad"
        active-text-color="#409eff"
        class="sidebar-menu"
        @select="collapseOnNavigation"
      >
        <template v-if="visibleMenus.length">
          <template v-for="section in menuSections" :key="section.scope">
            <li v-if="!isCollapse" class="menu-section-title">{{ section.title }}</li>
            <el-divider v-if="section.scope === 'STORE' && !isCollapse" class="menu-section-divider" />
            <SidebarMenuItem
              v-for="item in section.items"
              :key="item.id || item.code || item.path"
              :item="item"
            />
          </template>
        </template>
        <el-menu-item v-else index="menu-loading" disabled>
          <template #title>{{ menuStore.error || '菜单加载中…' }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="content-container">
      <el-header class="header">
        <div class="header-left">
          <button class="collapse-btn" :aria-label="isCollapse ? '展开导航' : '收起导航'" :aria-expanded="!isCollapse" @click="isCollapse = !isCollapse">
            <el-icon :size="20">
            <Fold v-if="!isCollapse" />
            <Expand v-else />
            </el-icon>
          </button>
          <el-breadcrumb class="header-breadcrumb" separator="/">
            <el-breadcrumb-item :to="{ path: '/select' }">后台入口</el-breadcrumb-item>
            <el-breadcrumb-item>{{ route.meta.title || '页面' }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <!--
            租户后台的待确认加项入口：客户在 C 端自助加项后门店必须能一眼看到并一键处理，
            因此放在租户后台全局头部，带条数徽标；平台运营后台不展示。
          -->
          <el-badge v-if="showPendingApproval" :value="pendingApprovalStore.pendingCount" :max="99" :hidden="!pendingApprovalStore.pendingCount" type="danger">
            <el-button size="small" :type="pendingApprovalStore.pendingCount ? 'warning' : 'default'" @click="pendingApprovalStore.openDrawer()">
              <el-icon><Bell /></el-icon>待确认加项
            </el-button>
          </el-badge>
          <el-tag :type="authStore.scope === 'PLATFORM' ? 'primary' : 'success'" effect="plain">
            {{ scopeLabel }}
          </el-tag>
          <TenantContextSelector v-if="authStore.scope === 'TENANT'" />
          <el-button size="small" @click="goToSelect">
            <el-icon><Grid /></el-icon>后台入口
          </el-button>
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="32">{{ (authStore.user?.displayName || authStore.user?.username || '管理员')[0] }}</el-avatar>
              <span class="username">{{ authStore.user?.displayName || authStore.user?.username || '管理员' }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="select">
                  <el-icon><Grid /></el-icon>后台入口
                </el-dropdown-item>
                <el-dropdown-item command="password">
                  <el-icon><Lock /></el-icon>修改密码
                </el-dropdown-item>
                <el-dropdown-item command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 租户后台待确认加项集中处理：头部入口 / 收银台菜单角标 / 卡片都能打开 -->
      <PendingApprovalDrawer v-if="showPendingApproval"
        :visible="pendingApprovalStore.drawerVisible"
        @update:visible="(value) => (value ? pendingApprovalStore.openDrawer() : pendingApprovalStore.closeDrawer())"
      />

      <el-dialog v-model="passwordDialogVisible" title="修改密码" width="420px" :close-on-click-modal="false" @closed="resetPasswordForm">
        <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="90px">
          <el-form-item label="当前密码" prop="currentPassword">
            <el-input v-model="passwordForm.currentPassword" type="password" show-password autocomplete="current-password" />
          </el-form-item>
          <el-form-item label="新密码" prop="newPassword">
            <el-input v-model="passwordForm.newPassword" type="password" show-password autocomplete="new-password" />
          </el-form-item>
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input v-model="passwordForm.confirmPassword" type="password" show-password autocomplete="new-password" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="passwordDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="passwordSubmitting" @click="submitPasswordChange">确认修改</el-button>
        </template>
      </el-dialog>

      <el-main class="main-content">
        <!-- 只有「确实没有可用上下文」才顶掉页面。
             解析/后台校准期间 current 不会被清空（见 stores/context.js），因此正常导航
             不会再闪出这块空态 —— 这是 2026-09 交互修复的关键：鉴权过程不该表现为界面。 -->
        <el-alert v-if="contextBlocked"
          :title="contextStore.error ? `${contextStore.error}（可在右上角重新选择门店上下文；仍失败请联系平台为该账号分配角色）` : '请选择有权限的租户或门店后继续'"
          type="warning" :closable="false">
          <template #default>
            <el-button link type="primary" size="small" :loading="contextStore.loading" @click="retryContext">
              重新选择上下文
            </el-button>
            <!-- 空态绝不能是死路：上下文拿不回来时至少还有「重新登录」这一条自助路径，
                 不必让运营自己猜「是不是要 F5」。 -->
            <el-button link type="danger" size="small" @click="relogin">重新登录</el-button>
          </template>
        </el-alert>
        <router-view v-else />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ArrowDown, Bell, Expand, Fold, Grid, Lock, OfficeBuilding, SwitchButton } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { changePassword, getSession } from '@/api/admin'
import { refreshCsrfToken, resetAuthRedirectGuard } from '@/api/request'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore, SCOPE_LABELS } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { usePendingApprovalStore } from '@/stores/pendingApproval'
import { useContextStore } from '@/stores/context'
import { useCurrencyStore } from '@/stores/currency'
import { filterMenusByPermission } from '@/utils/menuPermission'
import { createSessionWatchdog } from '@/utils/sessionWatchdog'
import { SESSION_EXPIRED_EVENT, emitRuntimeEvent } from '@/utils/runtime-events'
import { ERRORS } from '@/constants/terms'
import SidebarMenuItem from './components/SidebarMenuItem.vue'
import PendingApprovalDrawer from '@/components/PendingApprovalDrawer.vue'
import TenantContextSelector from '@/components/TenantContextSelector.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const menuStore = useMenuStore()
const contextStore = useContextStore()
const currencyStore = useCurrencyStore()
const pendingApprovalStore = usePendingApprovalStore()
const narrowScreen = window.matchMedia('(max-width: 900px)')
const isCollapse = ref(narrowScreen.matches)
const passwordDialogVisible = ref(false)
const passwordSubmitting = ref(false)
const passwordFormRef = ref()
const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })
const passwordRules = {
  currentPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
    { validator: (_rule, value, callback) => {
      if (value && new TextEncoder().encode(value).length > 72) callback(new Error('密码不超过 72 字节'))
      else callback()
    }, trigger: 'blur' },
  ],
  confirmPassword: [{ validator: (_rule, value, callback) => {
    if (value !== passwordForm.value.newPassword) callback(new Error('两次输入的密码不一致'))
    else callback()
  }, trigger: 'blur' }],
}
function updateCollapse(event) { isCollapse.value = event.matches }
function collapseOnNavigation() {
  if (narrowScreen.matches) isCollapse.value = true
}

/**
 * 会话 / CSRF 看护（前台可见时每 ~4 分钟一次，标签页隐藏时暂停）。
 *
 * 解决的是「页面放着不动十几分钟后回来，点什么都像没反应」：
 * 以前只有用户下一次操作才可能发现会话/CSRF 已经失效，而那时的表现恰好可能是静默吞掉操作。
 * 现在主动看护：
 *  - 会话仍有效 → 顺手刷新一次 CSRF（写操作不再踩到过期 token）；
 *  - 会话已失效 → 立刻清本地态 + 明确提示 + 跳登录，不等用户去点第一个按钮；
 *  - 隐藏/挂起超过 10 分钟回到前台 → 除会话校验外，把上下文/权限快照失效重拉（自愈）。
 * 网络抖动不登出（看护内部只记录、不回调失效）。
 */
const sessionWatchdog = createSessionWatchdog({
  probeSession: () => getSession(),
  onSessionAlive: () => {
    resetAuthRedirectGuard()
    // 预取失败不影响看护（真正的写操作还有自己的 CSRF 自愈路径）
    refreshCsrfToken().catch(() => {})
    // 关键：签名运营上下文 token 只有 30 分钟有效期（网关只透传，过期由下游领域服务发现）。
    // 会话有效时顺手做一次后台校准：快照超过 5 分钟就重选上下文换一枚新 token，
    // 这样「页面一直开着、用户只是偶尔点按钮」也不会踩到过期上下文（revalidate 自带 30s 节流）。
    contextStore.revalidateInBackground(authStore.scope)
  },
  onSessionExpired: () => handleSessionExpired(),
  onResumeAfterIdle: () => contextStore.recoverAfterIdle(authStore.scope),
})

/** 会话失效的统一出口：清内存/本地登录态 + 明确提示 + 回登录页。 */
function handleSessionExpired() {
  authStore.clearLocalState()
  contextStore.clear()
  emitRuntimeEvent(SESSION_EXPIRED_EVENT)
  ElMessage.error(ERRORS.sessionExpired)
  if (typeof window !== 'undefined' && window.location.hash !== '#/login') window.location.hash = '#/login'
}

/** 运营自助的「重新登录」（空态入口）：不谎报过期，只把状态清干净并回登录页。 */
function relogin() {
  authStore.clearLocalState()
  contextStore.clear()
  emitRuntimeEvent(SESSION_EXPIRED_EVENT)
  if (typeof window !== 'undefined' && window.location.hash !== '#/login') window.location.hash = '#/login'
}

/**
 * 窗口重新聚焦 / 标签页切回来时做一次后台上下文校准（内部 30s 节流，只读一次服务端会话）。
 *
 * 这是缓存后的实时性兜底：同一浏览器多个标签页共用服务端会话，另一个标签页切了门店时，
 * 本页必须在发下一个请求前发现并跟着切（否则会拿旧界面显示新上下文的数据）。
 * 同时把可见性交给会话看护：隐藏时暂停轮询，隐藏久了回到前台先做会话校验 + 上下文自愈。
 */
function revalidateOnFocus() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  Promise.resolve(sessionWatchdog.handleFocus()).catch(() => {})
  contextStore.revalidateInBackground(authStore.scope)
}

function onVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    sessionWatchdog.handleHidden()
    return
  }
  Promise.resolve(sessionWatchdog.handleVisible()).catch(() => {})
  contextStore.revalidateInBackground(authStore.scope)
}

onMounted(() => {
  narrowScreen.addEventListener('change', updateCollapse)
  window.addEventListener('focus', revalidateOnFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)
  sessionWatchdog.start()
  // 待确认加项属于租户门店运营流程；平台运营后台不展示，也不请求该数据。
  if (showPendingApproval.value) pendingApprovalStore.start()
})
onUnmounted(() => {
  narrowScreen.removeEventListener('change', updateCollapse)
  window.removeEventListener('focus', revalidateOnFocus)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  sessionWatchdog.stop()
  pendingApprovalStore.stop()
})

const scopeLabel = computed(() => SCOPE_LABELS[authStore.scope] || authStore.scope)
const showPendingApproval = computed(() => authStore.scope === 'TENANT')

watch(
  () => authStore.scope,
  (scope) => {
    if (scope === 'TENANT') pendingApprovalStore.start()
    else pendingApprovalStore.stop()
  }
)

/**
 * 是否用空态提示顶掉路由内容。
 *
 * 判定口径是「已经确认过、且确实没有可用上下文」（settled && !current）：
 * 冷启动解析中、后台校准中都不算 —— 校验过程绝不能表现成界面，
 * 否则每次点菜单都会先闪一次「请选择有权限的租户或门店后继续」。
 */
const contextBlocked = computed(() =>
  authStore.scope === 'TENANT' && contextStore.settled && !contextStore.current
)

/**
 * 侧边栏菜单 = 后端下发菜单（服务端已按上下文权限过滤）+ 前端按路径登记的附加权限门禁。
 *
 * 「币种」曾经是这里自拼的固定菜单项（按 tenant.currency.manage 的 computed 控制显隐），
 * 现已由后端 `AdminMenuApplicationService.menus()` 的 TENANT 段下发
 * （`/admin/tenant/currency`），因此不再在模板里拼 el-menu-item；
 * 「无 tenant.currency.manage 就不显示」的可见性口径统一登记在 `utils/menuPermission`
 * 的映射里，避免页面各自维护一份固定入口。
 */
const visibleMenus = computed(() => filterMenusByPermission(menuStore.menus, contextStore.current?.permissions))
const menuSections = computed(() => {
  const sections = []
  for (const scope of ['TENANT', 'STORE', 'PLATFORM']) {
    const items = visibleMenus.value.filter((item) => (item.scope || authStore.scope) === scope)
    if (items.length) sections.push({ scope, title: scope === 'STORE' ? '门店经营' : scope === 'TENANT' ? '租户管理' : '平台运营', items })
  }
  return sections
})

/** 登录/切上下文后确保全站币种已就绪（context select 已带时不会重复请求）。 */
let lastCurrencyTenantId = null
function syncCurrencyWithContext() {
  const tenantId = contextStore.current?.tenantId ?? null
  // 没有租户上下文（纯平台视角）时不请求：接口一律取上下文租户，缺上下文只会 401。
  if (tenantId == null) return
  const changed = lastCurrencyTenantId !== null && lastCurrencyTenantId !== tenantId
  lastCurrencyTenantId = tenantId
  currencyStore.load(changed).catch(() => {})
}

watch(
  () => contextStore.current?.permissions,
  (permissions) => {
    if (permissions && authStore.scope === 'TENANT') menuStore.fetchMenus('TENANT')
  }
)

// 上下文切换（换租户/门店）后币种必须跟着换：同一来源，不允许各页面各请求一套。
watch(() => contextStore.current?.tenantId, syncCurrencyWithContext)

function syncScopeFromRoute() {
  const routeScope = route.meta.scope
  if (routeScope && routeScope !== authStore.scope) {
    authStore.setScope(routeScope)
  }
}

onMounted(() => {
  syncScopeFromRoute()
  menuStore.fetchMenus(authStore.scope)
  if (authStore.scope === 'TENANT' && !contextStore.items.length) {
    contextStore.fetchContexts()
  }
  // 进入后台即把本租户币种装进全局唯一来源（登录后全站（含各页面）都读它）。
  syncCurrencyWithContext()
})

// 深链/刷新时按路由 meta.scope 校正作用域并拉取对应菜单
watch(
  () => route.meta.scope,
  (scope) => {
    if (scope && scope !== authStore.scope) {
      authStore.setScope(scope)
      menuStore.fetchMenus(scope)
    }
  }
)

function goToSelect() {
  router.push('/select')
}

// 上下文没选上时页面只剩提示条：给运营一个自助重试入口（平台刚补授权时重选即可恢复）。
async function retryContext() {
  try {
    await contextStore.ensureContext('TENANT')
  } catch (ignored) {
    // 失败原因已写入 contextStore.error，由提示条展示
  }
  if (contextStore.current) {
    await menuStore.fetchMenus('TENANT')
    router.push(menuStore.firstLeafPath() || '/admin/tenant/stores')
    return
  }
  // 重试仍然失败时必须有明确反馈：空态里的按钮绝不能点下去什么都不发生。
  ElMessage.warning(contextStore.error || '仍未取到可用的租户/门店上下文，可尝试重新登录')
}

async function handleCommand(cmd) {
  if (cmd === 'select') {
    router.push('/select')
  } else if (cmd === 'password') {
    passwordDialogVisible.value = true
  } else if (cmd === 'logout') {
    await authStore.logout()
    // 清除内存中的租户上下文，避免下次登录显示旧账号的界面状态。
    contextStore.clear()
    router.push('/login')
  }
}

function resetPasswordForm() {
  passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
  passwordFormRef.value?.clearValidate()
}

async function submitPasswordChange() {
  if (!passwordFormRef.value || passwordSubmitting.value) return
  const valid = await passwordFormRef.value.validate().catch(() => false)
  if (!valid) return
  passwordSubmitting.value = true
  try {
    await changePassword({ currentPassword: passwordForm.value.currentPassword, newPassword: passwordForm.value.newPassword })
    ElMessage.success('密码修改成功，请重新登录')
    passwordDialogVisible.value = false
    authStore.clearLocalState()
    contextStore.clear()
    router.push('/login')
  } finally {
    passwordSubmitting.value = false
  }
}
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  min-width: 0;
}

.content-container {
  min-width: 0;
}

.sidebar {
  background: var(--sidebar-bg);
  transition: width 0.3s;
  overflow: hidden;
}

.logo {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.logo-text {
  white-space: nowrap;
}

.sidebar-menu {
  border-right: none;
  height: calc(100vh - var(--header-height));
  overflow-y: auto;
}

.sidebar-menu::-webkit-scrollbar {
  width: 0;
}

.menu-section-title {
  list-style: none;
  padding: 12px 20px 6px;
  color: #7e8494;
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0;
}

.menu-section-divider {
  margin: 8px 12px;
  width: auto;
  border-color: rgba(255, 255, 255, 0.12);
}

.header {
  height: var(--header-height);
  background: var(--el-bg-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-shadow: none;
  z-index: 10;
  flex-shrink: 0;
  gap: 12px;
}

.header-breadcrumb :deep(.el-breadcrumb__inner) {
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.header-breadcrumb :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: var(--el-text-color-primary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.collapse-btn {
  border: 0;
  padding: 4px;
  background: transparent;
  display: flex;
  flex-shrink: 0;
  cursor: pointer;
  color: #606266;
  transition: color 0.2s;
}

.collapse-btn:hover {
  color: #409eff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .header { padding: 8px 12px; gap: 8px; height: auto; min-height: var(--header-height); flex-wrap: wrap; }
  .header-left { gap: 8px; flex: 1 1 auto; }
  .header-right { gap: 6px; justify-content: flex-end; }
  .header-breadcrumb { min-width: 0; white-space: nowrap; display: flex; overflow: hidden; }
  .header-breadcrumb :deep(.el-breadcrumb__item) { white-space: nowrap; }
  .username { display: none; }
}

@media (max-width: 640px) {
  .sidebar-backdrop { display: block; position: fixed; inset: 0; z-index: 19; border: 0; background: rgba(0, 0, 0, 0.35); }
  .sidebar-expanded { position: absolute; inset: 0 auto 0 0; z-index: 20; }
  .header { height: auto; min-height: var(--header-height); padding-top: 8px; padding-bottom: 8px; }
  .header-right .el-tag { display: none; }
  .main-content { padding: 12px; }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

@media (min-width: 641px) {
  .sidebar-backdrop { display: none; }
}

.username {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.main-content {
  background: var(--admin-bg, #f0f2f5);
  padding: 20px 22px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
}

@media (max-width: 640px) {
  .main-content { padding: 12px; }
  .header-left, .header-right { width: 100%; }
  .header-right { justify-content: flex-start; }
}
</style>
