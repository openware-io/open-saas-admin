import { createRouter, createWebHashHistory } from 'vue-router'
import { useContextStore } from '@/stores/context'
import { useAuthStore } from '@/stores/auth'
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
        path: 'admin/pricing-plans',
        name: 'PricingPlans',
        component: () => import('@/views/platform/pricing-plans.vue'),
        meta: { title: '计价方案', icon: 'PriceTag', scope: 'PLATFORM' },
      },
      {
        path: 'admin/iam/roles',
        name: 'IamRoles',
        component: () => import('@/views/platform/iam/roles.vue'),
        meta: { title: '角色', icon: 'Avatar', scope: 'PLATFORM' },
      },
      {
        path: 'admin/iam/permissions',
        name: 'IamPermissions',
        component: () => import('@/views/platform/iam/permissions.vue'),
        meta: { title: '权限', icon: 'Lock', scope: 'PLATFORM' },
      },
      {
        path: 'admin/platform/payment-methods',
        name: 'PlatformPaymentMethods',
        component: () => import('@/views/platform/payment-methods.vue'),
        meta: { title: '支付方式', icon: 'Money', scope: 'PLATFORM' },
      },
      // ===== TENANT 租户后台（B端管理后台） =====
      {
        path: 'admin/tenant/stores',
        name: 'TenantStores',
        component: () => import('@/views/tenant/stores.vue'),
        meta: { title: '门店', icon: 'Shop', scope: 'TENANT' },
      },
      // 币种设置：租户级唯一来源（docs/standards/16_CURRENCY_CONVENTIONS.md）。
      // 接口一律取签名上下文租户，因此平台运营切到目标租户上下文后走的是同一个入口/同一个页面。
      {
        path: 'admin/tenant/currency',
        name: 'TenantCurrency',
        component: () => import('@/views/tenant/currency.vue'),
        meta: { title: '币种', icon: 'Money', scope: 'TENANT' },
      },
      {
        path: 'admin/staff',
        name: 'Staff',
        component: () => import('@/views/tenant/staff.vue'),
        meta: { title: '运营人员', icon: 'User', scope: 'TENANT' },
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
        meta: { title: '支付方式', icon: 'Money', scope: 'TENANT' },
      },
      {
        path: 'business/wallet',
        name: 'Wallet',
        component: () => import('@/views/tenant/wallet.vue'),
        meta: { title: '储值管理', icon: 'Coin', scope: 'TENANT' },
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
      // 审计日志：菜单与 audit.view 权限由后端下发（不新增后端菜单/权限），
      // 因此这里刻意不绑定 meta.scope —— 平台/租户两种视角都能直达本页，
      // 「租户」列由页面按当前 scope 决定是否展示，越权拦截由后端强制。
      {
        path: 'admin/audits',
        name: 'Audits',
        component: () => import('@/views/tenant/audits.vue'),
        meta: { title: '审计日志', icon: 'audit' },
      },
      // 动态菜单 path 未显式声明时，落到通用占位页
      {
        path: ':pathMatch(.*)*',
        name: 'GenericStub',
        component: () => import('@/views/GenericStub.vue'),
        meta: { title: '页面开发中' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  document.title = `${to.meta.title || 'SaaS 管理后台'} - SaaS 管理后台`
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
  if (to.meta.scope === 'TENANT' || to.meta.scope === 'PLATFORM') {
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
  next()
})

export default router
