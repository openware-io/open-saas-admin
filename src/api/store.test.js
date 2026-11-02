import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./request', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import request from './request'
import * as storeApi from './store'
import {
  buildChangeRequestBody,
  buildStoreChangeActions,
  storeChangeFormFromRow,
  validateChangeRequest,
} from '../utils/storeChangeForm'

/**
 * 门店 API 契约守卫（STORE_CHANGE_APPROVAL_WORKFLOW.md rev3）。
 *
 * 关键口径：门店写操作不再有直写接口，租户侧一律提交「变更申请」（`/tenant/store-change-requests`），
 * 平台侧在 `/platform/store-change-requests` 审批；旧的 `createStore/updateStore/updateStoreStatus/
 * deleteStore/updateStoreLogo` 不得再出现在本模块（页面也就无从调用）。
 */
beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * 真实 `StoreView[]` 响应形状（后端 `StoreView` record + V40 新增 `version`）。
 * 之前漏字段的教训：门店列表少了 `version`，申请制下 UPDATE/STATUS/DELETE 会被前端
 * 以「缺少版本号」拦下或提交后被 400，所以把「响应 → 申请动作/baseVersion」钉成契约测试。
 */
const STORE_VIEW = Object.freeze({
  id: 12,
  tenantId: 3,
  organizationId: 7,
  code: 'SZ-001',
  name: '深圳旗舰店',
  businessType: 'KTV',
  countryCode: 'CN',
  regionCode: '440305',
  timezone: 'Asia/Shanghai',
  defaultCurrency: 'CNY',
  locale: 'zh-CN',
  taxProfileId: null,
  businessDayCutoff: '04:00:00',
  status: 'ACTIVE',
  logoUrl: null,
  version: 5,
})

describe('响应形状契约：GET /admin/tenant/stores 的 StoreView[]', () => {
  it('带 version 的 StoreView 可直接进入申请动作与 baseVersion 校验，不被拦', async () => {
    request.get.mockResolvedValueOnce([STORE_VIEW])
    const rows = await storeApi.listStores()
    expect(request.get).toHaveBeenCalledWith('/api/v1/admin/tenant/stores', { params: undefined })
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.version).toBe(5)
    expect(row.id).toBe(12)

    // 申请动作按状态生成（缺 version 不会让动作消失）
    expect(buildStoreChangeActions(row).map((action) => action.key)).toEqual(['UPDATE', 'SUSPEND', 'CLOSE'])

    // UPDATE 校验不因 version 缺失被拦
    const form = { ...storeChangeFormFromRow(row), name: '深圳旗舰店（新）' }
    expect(validateChangeRequest({ requestType: 'UPDATE', form, row, reason: '门店更名' })).toEqual({ ok: true })

    // UPDATE/STATUS/DELETE 的 baseVersion 一律取门店 version
    expect(buildChangeRequestBody({ requestType: 'UPDATE', form, row, reason: '门店更名' }).baseVersion).toBe(5)
    expect(buildChangeRequestBody({ requestType: 'STATUS', row, targetStatus: 'SUSPENDED', reason: '暂停经营' }).baseVersion).toBe(5)
    expect(buildChangeRequestBody({
      requestType: 'DELETE', row: { ...STORE_VIEW, status: 'SUSPENDED' }, reason: '撤店归档',
    }).baseVersion).toBe(5)
  })

  it('缺 version 时前端显式拦截并提示刷新（可解释失败，而不是提交后 400）', () => {
    const { version, ...withoutVersion } = STORE_VIEW
    expect(version).toBe(5)
    const form = { ...storeChangeFormFromRow(withoutVersion), name: '新名字' }
    expect(validateChangeRequest({
      requestType: 'UPDATE', form, row: withoutVersion, reason: '门店更名',
    })).toMatchObject({ ok: false, field: 'baseVersion' })
    expect(buildChangeRequestBody({
      requestType: 'UPDATE', form, row: withoutVersion, reason: '门店更名',
    })).not.toHaveProperty('baseVersion')
  })
})

describe('门店只读接口', () => {
  it('门店列表 GET /api/v1/admin/tenant/stores（带筛选参数）', () => {
    storeApi.listStores({ status: 'ACTIVE' })
    expect(request.get).toHaveBeenCalledWith('/api/v1/admin/tenant/stores', { params: { status: 'ACTIVE' } })
  })

  it('建店默认值 GET /api/v1/admin/tenant/stores/create-defaults', () => {
    storeApi.getStoreCreateDefaults()
    expect(request.get).toHaveBeenCalledWith('/api/v1/admin/tenant/stores/create-defaults')
  })
})

describe('租户侧门店变更申请', () => {
  it('提交 POST /api/v1/admin/tenant/store-change-requests，body 原样透传', () => {
    const body = { requestType: 'STATUS', storeId: 12, baseVersion: 3, payload: { targetStatus: 'SUSPENDED' }, reason: '合同到期' }
    storeApi.submitStoreChangeRequest(body)
    expect(request.post).toHaveBeenCalledWith('/api/v1/admin/tenant/store-change-requests', body)
  })

  it('列表 GET /api/v1/admin/tenant/store-change-requests（status/storeId/page/pageSize）', () => {
    storeApi.listStoreChangeRequests({ status: 'PENDING', storeId: 12, page: 1, pageSize: 20 })
    expect(request.get).toHaveBeenCalledWith('/api/v1/admin/tenant/store-change-requests', {
      params: { status: 'PENDING', storeId: 12, page: 1, pageSize: 20 },
    })
  })

  it('详情 GET /{id}；撤销 POST /{id}/cancel', () => {
    storeApi.getStoreChangeRequest(88)
    expect(request.get).toHaveBeenCalledWith('/api/v1/admin/tenant/store-change-requests/88')
    storeApi.cancelStoreChangeRequest(88)
    expect(request.post).toHaveBeenCalledWith('/api/v1/admin/tenant/store-change-requests/88/cancel')
  })
})

describe('平台侧门店审批', () => {
  it('队列 GET /api/v1/admin/platform/store-change-requests（status/tenantId/requestType/page/pageSize）', () => {
    storeApi.listPlatformStoreChangeRequests({ status: 'PENDING', tenantId: 5, requestType: 'CREATE', page: 2, pageSize: 50 })
    expect(request.get).toHaveBeenCalledWith('/api/v1/admin/platform/store-change-requests', {
      params: { status: 'PENDING', tenantId: 5, requestType: 'CREATE', page: 2, pageSize: 50 },
    })
  })

  it('详情 GET /{id}', () => {
    storeApi.getPlatformStoreChangeRequest(88)
    expect(request.get).toHaveBeenCalledWith('/api/v1/admin/platform/store-change-requests/88')
  })

  it('通过 POST /{id}/approve body {comment}（备注可选）', () => {
    storeApi.approveStoreChangeRequest(88, '同意')
    expect(request.post).toHaveBeenCalledWith(
      '/api/v1/admin/platform/store-change-requests/88/approve',
      { comment: '同意' },
    )
  })

  it('驳回 POST /{id}/reject body {comment}（理由必填由页面先拦，接口层不做空值替换）', () => {
    storeApi.rejectStoreChangeRequest(88, '资料不全')
    expect(request.post).toHaveBeenCalledWith(
      '/api/v1/admin/platform/store-change-requests/88/reject',
      { comment: '资料不全' },
    )
    storeApi.rejectStoreChangeRequest(88, '')
    expect(request.post.mock.calls[1][1]).toEqual({ comment: '' })
  })
})

describe('源码守卫：旧直写函数已从 API 层移除', () => {
  it('不再导出 createStore/updateStore/updateStoreStatus/deleteStore/updateStoreLogo', () => {
    for (const legacy of ['createStore', 'updateStore', 'updateStoreStatus', 'deleteStore', 'updateStoreLogo']) {
      expect(storeApi[legacy]).toBeUndefined()
    }
  })

  it('不再引用已删除的直写端点（PUT/PATCH/DELETE 写路径全部移除）', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(new URL('./store.js', import.meta.url), 'utf8')
    // 只允许 GET/POST（申请与审批都是 POST 动作），直写端点（PUT/PATCH/DELETE）一个都不留
    expect(source).not.toMatch(/request\.(put|patch|delete)\(/)
    expect(source).not.toMatch(/\/stores\/[^'`\s]*\/(logo|status)/)
  })
})
