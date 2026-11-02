import { createRouter, createWebHashHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useContextStore } from '@/stores/context'
import { useAuthStore } from '@/stores/auth'
import { routePermissionDenied } from '@/utils/menuPermission'
import { TERMS } from '@/constants/terms'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '统一登录', public: true },
  },
  {
    path: '/select',
    name: 'BackendSelect',
    component: () => import('@/views/select/index.vue'),
    meta: { title: '后台入口' },
  },
  {
    path: '/',
    component: () => import('@/layout/AdminLayout.vue'),
    redirect: '/select',
    children: [
      // ===== PLATFORM 平台运营后台 =====
      {
        path: 'admin/platform/tenants',
        name: 'PlatformTenants',
        component: () => import('@/views/platform/tenants.vue'),
        meta: { title: '租户管理', icon: 'OfficeBuilding', scope: 'PLATFORM' },
      },
      {
        path: 'admin/iam/roles',
        name: 'IamRoles',
        component: () => import('@/views/platform/iam/roleAdmin.vue'),
        meta: { title: '角色', icon: 'Avatar', scope: 'PLATFORM' },
      },
      {
        path: 'admin/iam/role-profiles',
        name: 'IamRoleProfiles',
        component: () => import('@/views/platform/iam/roles.vue'),
        meta: { title: '工作台默认值', icon: 'Setting', scope: 'PLATFORM', hidden: true },
      },
      {
        path: 'admin/iam/permissions',
        name: 'IamPermissions',
        component: () => import('@/views/platform/iam/permissions.vue'),
        meta: { title: '权限', icon: 'Key', scope: 'PLATFORM' },
      },
      {
        path: 'admin/platform/payment-methods',
        name: 'PlatformPaymentMethods',
        component: () => import('@/views/platform/payment-methods.vue'),
        meta: { title: '支付方式', icon: 'Money', scope: 'PLATFORM' },
      },
      {
        // 门店审批（服务端菜单 V14 下发，路径 `/admin/platform/store-approvals`）。
        // 租户侧只提交申请；平台运营在此跨租户审批，通过后由服务端在同一事务内执行 apply。
        path: 'admin/platform/store-approvals',
        name: 'PlatformStoreApprovals',
        component: () => import('@/views/platform/store-approvals.vue'),
        meta: {
          title: '门店审批',
          icon: 'Stamp',
          scope: 'PLATFORM',
          permission: 'platform.store.change.approve',
        },
      },
      // ===== TENANT 租户后台（B端管理后台） =====
      {
        path: 'admin/tenant/overview',
        name: 'TenantOverview',
        component: () => import('@/views/tenant/overview.vue'),
        meta: { title: '经营总览', icon: 'DataAnalysis', scope: 'TENANT' },
      },
      {
        path: 'store',
        name: 'StoreHome',
        component: () => import('@/views/store/index.vue'),
        meta: { title: '门店管理后台', icon: 'Shop', scope: 'STORE' },
      },
      {
        path: 'admin/tenant/settings',
        name: 'TenantSettings',
        component: () => import('@/views/tenant/settings.vue'),
        meta: { title: '租户设置', icon: 'Tools', scope: 'TENANT' },
      },
      {
        path: 'admin/store/settings',
        name: 'StoreSettings',
        component: () => import('@/views/store/settings.vue'),
        meta: { title: '门店设置', icon: 'SetUp', scope: 'STORE' },
      },
      {
        path: 'admin/tenant/stores',
        name: 'TenantStores',
        component: () => import('@/views/tenant/stores.vue'),
        // 门店写操作改为「申请 → 平台审批 → 执行」，提交/撤销用租户级 `tenant.tenant.manage`
        //（店长不持有），menuPermission 与 admin V14 菜单同码；这里作为第二道前端门禁。
        meta: { title: '门店', icon: 'Shop', scope: 'TENANT', permission: 'tenant.tenant.manage' },
      },
      // 币种设置：租户级唯一来源（docs/standards/16_CURRENCY_CONVENTIONS.md）。
      // 接口一律取签名上下文租户，因此平台运营切到目标租户上下文后走的是同一个入口/同一个页面。
      {
        path: 'admin/tenant/currency',
        name: 'TenantCurrency',
        component: () => import('@/views/tenant/currency.vue'),
        meta: { title: '币种', icon: 'Wallet', scope: 'TENANT' },
      },
      {
        path: 'admin/staff',
        name: 'Staff',
        component: () => import('@/views/tenant/staff.vue'),
        meta: { title: '运营人员', icon: 'Service', scope: 'TENANT' },
      },
      {
        path: 'admin/roles',
        name: 'TenantRoles',
        component: () => import('@/views/platform/iam/roleAdmin.vue'),
        meta: { title: '角色与权限', icon: 'Avatar', scope: 'TENANT' },
      },
      {
        path: 'admin/resources',
        name: 'Resources',
        component: () => import('@/views/tenant/resources.vue'),
        meta: { title: TERMS.roomManagement, icon: 'Grid', scope: 'TENANT' },
      },
      {
        path: 'admin/inventory',
        name: 'Inventory',
        component: () => import('@/views/tenant/inventory.vue'),
        meta: { title: '仓库管理', icon: 'Box', scope: 'TENANT' },
      },
      {
        path: 'admin/products',
        name: 'Products',
        component: () => import('@/views/tenant/products.vue'),
        meta: { title: '商品管理', icon: 'Goods', scope: 'TENANT' },
      },
      {
        path: 'business/reservations',
        name: 'Reservations',
        component: () => import('@/views/tenant/reservations.vue'),
        meta: { title: '预约管理', icon: 'Calendar', scope: 'TENANT' },
      },
      {
        path: 'business/orders',
        name: 'Orders',
        component: () => import('@/views/tenant/orders.vue'),
        // 该页实质是「包厢收银台」（房态看板 + 开台/点单/结台/收银），菜单名与页面口径统一；
        // 路径与 name 保持 orders 不变，避免既有链接与菜单授权漂移。
        meta: { title: '收银台', icon: 'Tickets', scope: 'TENANT' },
      },
      {
        path: 'admin/orders',
        name: 'OrderManagement',
        component: () => import('@/views/tenant/order-management.vue'),
        // 订单管理（列表）：只做查询与处置（详情/取消），现场收银动作留在收银台。
        meta: { title: '订单管理', icon: 'List', scope: 'TENANT' },
      },
      {
        path: 'business/payments',
        name: 'Payments',
        component: () => import('@/views/tenant/payments.vue'),
        meta: { title: '收银/支付', icon: 'CreditCard', scope: 'TENANT' },
      },
      {
        path: 'business/shifts',
        name: 'Shifts',
        component: () => import('@/views/tenant/shift.vue'),
        meta: { title: '交班/日结', icon: 'Clock', scope: 'TENANT' },
      },
      {
        path: 'admin/reports',
        name: 'Reports',
        component: () => import('@/views/tenant/reports.vue'),
        meta: { title: '报表', icon: 'DataAnalysis', scope: 'TENANT' },
      },
      {
        path: 'business/members',
        name: 'Members',
        component: () => import('@/views/tenant/members.vue'),
        // 页面口径是「客户」（cst_member 实际存客户，等级/权益业务未实现）；
        // 路径与 name 保持 members 不变，避免菜单授权与既有链接漂移。
        meta: { title: '客户管理', icon: 'User', scope: 'TENANT' },
      },
      {
        path: 'business/points',
        name: 'Points',
        component: () => import('@/views/tenant/points.vue'),
        meta: { title: '积分管理', icon: 'Star', scope: 'TENANT' },
      },
      {
        path: 'business/payment-methods',
        name: 'PaymentMethods',
        component: () => import('@/views/tenant/payment-methods.vue'),
        meta: { title: '支付方式', icon: 'Collection', scope: 'TENANT' },
      },
      {
        path: 'business/wallet',
        name: 'Wallet',
        component: () => import('@/views/tenant/wallet.vue'),
        meta: { title: '储值管理', icon: 'Coin', scope: 'TENANT' },
      },
      {
        path: 'admin/tenant/wallet-token-config',
        name: 'WalletTokenConfig',
        component: () => import('@/views/tenant/wallet-token-config.vue'),
        meta: { title: '代币配置', icon: 'Setting', scope: 'TENANT' },
      },
      {
        path: 'admin/security',
        name: 'Security',
        component: () => import('@/views/tenant/security.vue'),
        meta: { title: '脱敏权限', icon: 'Lock', scope: 'TENANT' },
      },
      {
        path: 'admin/ktv/config',
        name: 'KtvConfig',
        component: () => import('@/views/tenant/ktv-config.vue'),
        meta: { title: 'KTV 配置', icon: 'Setting', scope: 'TENANT' },
      },
      {
        // 酒店业务原型：接口未接入前只展示本地 mock；后续替换为酒店 BFF 数据。
        path: 'admin/tenant/hotel',
        name: 'HotelManagement',
        component: () => import('@/views/tenant/hotel.vue'),
        meta: { title: '酒店管理', icon: 'OfficeBuilding', scope: 'STORE' },
      },
      {
        path: 'admin/tenant/hotel-master',
        name: 'HotelMasterData',
        component: () => import('@/views/tenant/hotel-master.vue'),
        meta: { title: '酒店设置', icon: 'Setting', scope: 'STORE', hidden: true },
      },
      {
        path: 'admin/tenant/hotel-resources',
        name: 'HotelResources',
        component: () => import('@/views/tenant/hotel-master.vue'),
        meta: { title: '房型、房价与库存', icon: 'Calendar', scope: 'STORE', hidden: true },
      },
      // 审计日志：菜单与 audit.view 权限由后端下发（不新增后端菜单/权限），
      // 因此这里刻意不绑定 meta.scope —— 平台/租户两种视角都能直达本页，
      // 「租户」列由页面按当前 scope 决定是否展示，越权拦截由后端强制。
      {
        path: 'admin/audits',
        name: 'Audits',
        component: () => import('@/views/tenant/audits.vue'),
        meta: { title: '审计日志', icon: 'Document' },
      },
      // 动态菜单 path 未显式声明时，落到通用占位页
      {
        path: ':pathMatch(.*)*',
        name: 'GenericStub',
        component: () => import('@/views/GenericStub.vue'),
        meta: { title: '页面不存在' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

/**
 * 平台工作区权限快照（平台菜单 / 审批按钮 / 路由守卫的唯一来源）。
 *
 * 背景：平台账号进入 PLATFORM 工作区时 `contextStore.current` 通常还没有值（路由守卫只对
 * TENANT/STORE 调过 ensureContext），而菜单与按钮用的是**严格** hasPermission——快照缺失时
 * 服务端 V14 下发的「门店审批」菜单会被前端二次过滤掉。修根因而不是 fail-open：
 * 进入 PLATFORM 路由时用既有 `ensureContext('PLATFORM')` 取平台签名快照；若会话里记的是租户
 * 上下文而拿不到平台快照，再从候选里显式选一个 PLATFORM 上下文。
 * 取不到时**不阻断导航**（平台页面接口会 403），但菜单/按钮/路由守卫按快照缺失 fail-closed。
 * 30s 节流，避免平台后台每次导航都多打两次会话请求。
 */
const PLATFORM_SNAPSHOT_TTL_MS = 30_000
let platformSnapshotAt = 0

async function ensurePlatformPermissionSnapshot(contextStore) {
  if (contextStore.current?.scopeType === 'PLATFORM' && contextStore.current?.permissions) return
  if (Date.now() - platformSnapshotAt < PLATFORM_SNAPSHOT_TTL_MS) return
  platformSnapshotAt = Date.now()
  try {
    await contextStore.ensureContext('PLATFORM')
  } catch {
    // 失败原因已写入 contextStore.error；下面再尝试直接选平台候选
  }
  if (contextStore.current?.scopeType === 'PLATFORM') return
  if (!contextStore.items?.length) {
    try {
      await contextStore.fetchContexts()
    } catch {
      return
    }
  }
  const candidate = (contextStore.items || []).find((item) => item.scopeType === 'PLATFORM')
  if (!candidate || candidate.contextId === contextStore.current?.contextId) return
  try {
    await contextStore.select(candidate.contextId)
  } catch {
    // 仍然取不到平台快照：保留当前上下文，路由守卫按快照缺失处理
  }
}

router.beforeEach(async (to, from, next) => {
  document.title = `${to.meta.title || '管理后台'} - 管理后台`
  const authStore = useAuthStore()
  const contextStore = useContextStore()
  if (!to.meta.public && !(await authStore.initialize())) {
    next('/login')
    return
  }
  // 进入后台前确保服务端会话已选定运营上下文。
  // 平台运营后台的部分页面（如支付方式授权）也会调用租户维度接口，缺少上下文同样
  // 返回 401 SAAS_CONTEXT_REQUIRED；因此 PLATFORM 与 TENANT 两类路由都要确保上下文。
  //
  // 但「确保」不等于「每次导航都同步跑一遍鉴权」（2026-09 交互修复）：
  //  - 本 SPA 会话已解析过（settled，含「确实没有可用上下文」）→ 立即放行，
  //    校验丢进后台（节流只读一次会话），交互不再等网络；
  //  - 只有冷启动的第一次导航才等待，避免页面刚挂载就打出一串 401。
  // 权限/上下文真变了仍拦得住：服务端按会话签名授权，接口层 403/401 会自愈重试。
  // 平台工作区只对平台运营开放；租户/门店账号直达平台 URL 时直接回到自己的工作区。
  if (to.meta.scope === 'PLATFORM' && !authStore.workspaces.includes('PLATFORM')) {
    return next(authStore.workspaces.includes('STORE') ? '/store' : '/admin/tenant/overview')
  }
  // 租户经营页只对租户总部账号开放；店长仍可进入共享的业务运营页
  //（预约/收银/订单/资源/库存/报表/酒店前台/KTV 配置），但不能进入租户默认配置、
  // 角色权限和门店管理。
  const storeOperations = (path) =>
    (path.startsWith('/business/') && !path.startsWith('/business/tenant')) ||
    ['/admin/orders', '/admin/resources', '/admin/products', '/admin/inventory',
      '/admin/reports', '/admin/tenant/hotel', '/admin/tenant/hotel-master',
      '/admin/ktv/config'].some((prefix) => path === prefix || path.startsWith(prefix + '/'))
  if (to.meta.scope === 'TENANT' && !authStore.workspaces.includes('HEADQUARTERS')) {
    if (!(authStore.workspaces.includes('STORE') && storeOperations(to.path))) {
      return next(authStore.workspaces.includes('STORE') ? '/store' : '/select')
    }
  }

  // TENANT 工作区：确保选定了租户/门店上下文（平台工作区不走这里，平台上下文由下方单独解析）。
  if (to.meta.scope === 'TENANT' && authStore.workspaces.includes('HEADQUARTERS')) {
    if (contextStore.settled) {
      contextStore.revalidateInBackground(to.meta.scope)
    } else {
      try {
        await contextStore.ensureContext(to.meta.scope)
      } catch (e) {
        // 上下文选择失败不阻断导航，页面侧展示空态/提示
      }
    }
  }
  // PLATFORM 工作区：平台菜单/审批按钮/路由守卫统一依赖平台权限快照（见 ensurePlatformPermissionSnapshot）。
  // 取不到快照不阻断导航（页面接口会 403），但 meta.permission 守卫与菜单按快照 fail-closed。
  if (to.meta.scope === 'PLATFORM' && authStore.workspaces.includes('PLATFORM')) {
    await ensurePlatformPermissionSnapshot(contextStore)
  }
  // 店长直接打开 /store（刷新/书签）时也要自动选唯一可用的门店，
  // 否则工作台永远停“未选择门店”，什么都不加载。
  if (to.meta.scope === 'STORE' && !contextStore.current) {
    try {
      await contextStore.ensureContext('STORE')
    } catch (e) {
      // 保持门店工作台空态，不把导航打断
    }
  }
  // 页级权限兜底（meta.permission）：与后端菜单/接口守卫同码，越权时回退到本工作区首页。
  // 平台路由在此按「平台快照 + 严格 hasPermission」判定（快照缺失即回退），
  // 租户/门店路由保持兼容（快照缺失或跨工作区快照不拦，越权由后端 403 兜底）。
  if (routePermissionDenied(to.meta.scope, contextStore.current, to.meta.permission)) {
    ElMessage.warning(`没有访问「${to.meta.title || '该页面'}」的权限，请联系管理员分配角色。`)
    const fallback = to.meta.scope === 'PLATFORM'
      ? '/admin/platform/tenants'
      : authStore.workspaces.includes('HEADQUARTERS')
        ? '/admin/tenant/overview'
        : authStore.workspaces.includes('STORE') ? '/store' : '/select'
    return next(fallback)
  }
  next()
})

export default router
