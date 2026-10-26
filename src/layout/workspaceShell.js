/**
 * 三层工作区的 shell 配置。
 *
 * 这是一个共享外壳 + 显式 workspace 配置，而不是三份复制布局：
 * - 平台：无租户门户切换器、无门店上下文
 * - 租户：租户/门店上下文区域 + 门店选择
 * - 门店：门店上下文区域、独立首页，不展示租户切换器
 */
export const WORKSPACE_SHELLS = {
  PLATFORM: {
    title: 'SaaS 平台管理后台',
    home: '/admin/platform/tenants',
    menuScope: 'PLATFORM',
    showTenantSelector: false,
    showStoreContext: false,
    className: 'workspace-platform',
  },
  TENANT: {
    title: 'SaaS 租户管理后台',
    home: '/admin/tenant/overview',
    menuScope: 'TENANT',
    showTenantSelector: true,
    showStoreContext: true,
    className: 'workspace-tenant',
  },
  STORE: {
    title: 'SaaS 门店经营后台',
    home: '/store',
    menuScope: 'STORE',
    showTenantSelector: false,
    showStoreContext: true,
    className: 'workspace-store',
  },
}

export function workspaceShell(scope) {
  return WORKSPACE_SHELLS[scope] || WORKSPACE_SHELLS.PLATFORM
}
