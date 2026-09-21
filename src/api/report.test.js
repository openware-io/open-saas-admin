import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./request', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import request from './request'
import {
  getEmployeePerformance,
  getInventoryGrossProfit,
  getOperations,
  getPayments,
  getResourceUtilization,
  getSales,
  getSalesItems,
} from './report'

/**
 * 报表接口契约（platform-admin-service 只读聚合，2026-09 统一时间/粒度口径）：
 *  - 六张报表同一套参数：`storeId` + `from`/`to`（`yyyy-MM-dd`，后端闭区间收口整天）+ `granularity`；
 *  - `granularity ∈ DAY|WEEK|MONTH|YEAR`（缺省 DAY 由后端兜，前端显式下发当前选择）；
 *  - 销售报表额外带明细分页 `page/pageSize`（Page 信封 records/total/current/size）与可选 `status`；
 *  - 参数一律走 axios `{ params }`（不拼查询串），筛选为空时**不下发该键**（不发送空串）。
 */

beforeEach(() => {
  vi.clearAllMocks()
})

const EXPECTED = [
  ['operations', getOperations, '/api/v1/admin/reports/operations'],
  ['payments', getPayments, '/api/v1/admin/reports/payments'],
  ['employee-performance', getEmployeePerformance, '/api/v1/admin/reports/employee-performance'],
  ['resources', getResourceUtilization, '/api/v1/admin/reports/resources'],
  ['inventory-gross-profit', getInventoryGrossProfit, '/api/v1/admin/reports/inventory-gross-profit'],
]

describe('报表接口：路径与参数透传', () => {
  it.each(EXPECTED)('%s 走固定路径，门店/区间/粒度原样透传', (_name, loader, path) => {
    loader({ storeId: 2501, from: '2026-09-01', to: '2026-09-30', granularity: 'WEEK' })
    expect(request.get).toHaveBeenCalledTimes(1)
    expect(request.get.mock.calls[0]).toEqual([
      path,
      { params: { storeId: 2501, from: '2026-09-01', to: '2026-09-30', granularity: 'WEEK' } },
    ])
  })

  it.each(EXPECTED)('%s 不带筛选时仍是同一路径（不伪造 storeId/from/to）', (_name, loader, path) => {
    loader({})
    expect(request.get.mock.calls[0]).toEqual([path, { params: {} }])
  })
})

describe('支付报表（回归：接口路径与参数不得再变）', () => {
  it('payments 走 /api/v1/admin/reports/payments，无自有日期参数名（from/to 一致）', () => {
    getPayments({ storeId: 100, from: '2026-09-01', to: '2026-09-30', granularity: 'DAY' })
    const [path, config] = request.get.mock.calls[0]
    expect(path).toBe('/api/v1/admin/reports/payments')
    expect(Object.keys(config.params)).toEqual(['storeId', 'from', 'to', 'granularity'])
    // 不接受 fromAt/toAt 这类历史命名（结束日会漏），时间口径只有 from/to
    expect(config.params.fromAt).toBeUndefined()
    expect(config.params.toAt).toBeUndefined()
  })
})

describe('销售报表（getSales）', () => {
  it('走 /admin/reports/sales，统计与明细分页在同一份参数下请求', () => {
    getSales({
      storeId: 2501,
      from: '2026-09-01',
      to: '2026-09-30',
      granularity: 'MONTH',
      page: 2,
      pageSize: 50,
      status: 'VOIDED',
    })
    expect(request.get).toHaveBeenCalledTimes(1)
    expect(request.get.mock.calls[0]).toEqual([
      '/api/v1/admin/reports/sales',
      {
        params: {
          storeId: 2501,
          from: '2026-09-01',
          to: '2026-09-30',
          granularity: 'MONTH',
          page: 2,
          pageSize: 50,
          status: 'VOIDED',
        },
      },
    ])
  })

  it('未选状态时不下发 status（后端按与统计同口径处理）', () => {
    getSales({ from: '2026-09-01', to: '2026-09-30', granularity: 'DAY', page: 1, pageSize: 20 })
    const params = request.get.mock.calls[0][1].params
    expect(params.status).toBeUndefined()
    expect(params).not.toHaveProperty('status')
  })

  it('分页参数是数字（后端按 Page 信封返回 records/total/current/size）', () => {
    getSales({ page: 3, pageSize: 100 })
    const params = request.get.mock.calls[0][1].params
    expect(typeof params.page).toBe('number')
    expect(typeof params.pageSize).toBe('number')
  })
})

describe('商品/服务销售排行（getSalesItems）', () => {
  it('走 /admin/reports/sales-items，门店/区间/品类/TOP N 原样透传', () => {
    getSalesItems({ storeId: 2501, from: '2026-09-01', to: '2026-09-30', itemType: 'PRODUCT', topN: 20 })
    expect(request.get).toHaveBeenCalledTimes(1)
    expect(request.get.mock.calls[0]).toEqual([
      '/api/v1/admin/reports/sales-items',
      {
        params: { storeId: 2501, from: '2026-09-01', to: '2026-09-30', itemType: 'PRODUCT', topN: 20 },
      },
    ])
  })

  it('不分营业日档：不传 granularity（排行看整段区间）；不选品类时不下发 itemType', () => {
    getSalesItems({ from: '2026-09-01', to: '2026-09-30', topN: 50 })
    const params = request.get.mock.calls[0][1].params
    expect(params.granularity).toBeUndefined()
    expect(params).not.toHaveProperty('itemType')
    expect(params.topN).toBe(50)
  })
})
