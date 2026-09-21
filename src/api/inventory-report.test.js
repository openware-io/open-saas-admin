import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./request', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import request from './request'
import { getInventoryGrossProfit } from './report'
import { listInventoryCosts, listInventoryMaterials, listInventoryTransactions } from './order'

/**
 * 库存成本 / 毛利报表的接口契约（后端 6635995a + f6732c4a，尚未发布，以契约为准）：
 *  - 毛利报表经平台 BFF：GET /api/v1/admin/reports/inventory-gross-profit?storeId=&from=&to=
 *    （服务端按 (门店, 日期, 币种) 分行；混币种 currencyCode=null、mixedCurrency=true，
 *     行内 grossMarginRate 是**比例**、收入为 0 时为 null）；
 *  - 库存成本在 order 域：GET /api/v1/admin/inventory/costs?storeId=
 *    （库存成本 = 结存数量 × 移动加权平均成本，信封 currencyCode / mixedCurrency）。
 *
 * 参数一律走 axios `{ params }`（不拼查询串，避免门店/日期编码差异），且筛选为空时不传该键。
 *
 * 列表端点已改为服务端分页（MyBatis-Plus Page 信封 records/total/current/size）：
 *  - materials：page/pageSize/storeId/status/category/keyword；
 *  - transactions：page/pageSize/materialId/transactionType/sourceType/from/to/keyword；
 *  - costs：page/pageSize/storeId/keyword（total 与币种信封按全部命中行计算）。
 */

beforeEach(() => {
  vi.clearAllMocks()
})

describe('库存成本与毛利报表（getInventoryGrossProfit）', () => {
  it('走 /admin/reports/inventory-gross-profit，门店与日期区间走 params', () => {
    getInventoryGrossProfit({ storeId: 2501, from: '2026-09-01', to: '2026-09-30' })
    expect(request.get).toHaveBeenCalledTimes(1)
    expect(request.get.mock.calls[0]).toEqual([
      '/api/v1/admin/reports/inventory-gross-profit',
      { params: { storeId: 2501, from: '2026-09-01', to: '2026-09-30' } },
    ])
  })

  it('不带筛选时仍是同一路径（不传 storeId 表示全部门店）', () => {
    getInventoryGrossProfit({})
    expect(request.get.mock.calls[0]).toEqual([
      '/api/v1/admin/reports/inventory-gross-profit',
      { params: {} },
    ])
  })
})

describe('库存成本查询（listInventoryCosts）', () => {
  it('走 /admin/inventory/costs，storeId 走 params', () => {
    listInventoryCosts({ storeId: 2 })
    expect(request.get).toHaveBeenCalledTimes(1)
    expect(request.get.mock.calls[0]).toEqual([
      '/api/v1/admin/inventory/costs',
      { params: { storeId: 2 } },
    ])
  })

  it('入库/调整仍复用既有路径（新增 unitCost 不改变端点）', async () => {
    const { receiveInventory, adjustInventory } = await import('./order')
    receiveInventory({ materialId: 7, quantity: 2, unitCost: 350 })
    adjustInventory({ materialId: 7, quantity: 1, direction: 'OUT' })
    expect(request.post.mock.calls[0][0]).toBe('/api/v1/admin/inventory/receipts')
    expect(request.post.mock.calls[0][1]).toEqual({ materialId: 7, quantity: 2, unitCost: 350 })
    expect(request.post.mock.calls[1][0]).toBe('/api/v1/admin/inventory/adjustments')
  })

  it('分页与关键字同走 params（不拼查询串，空筛选不传键）', () => {
    listInventoryCosts({ storeId: 2, page: 2, pageSize: 20, keyword: '可乐' })
    expect(request.get.mock.calls[0]).toEqual([
      '/api/v1/admin/inventory/costs',
      { params: { storeId: 2, page: 2, pageSize: 20, keyword: '可乐' } },
    ])
  })
})

describe('物料 / 出入库记录列表（分页与查询参数走 params）', () => {
  it('物料列表：page/pageSize/storeId/status/category/keyword 原样透传', () => {
    listInventoryMaterials({ storeId: 2, page: 1, pageSize: 20, status: 'ACTIVE', category: '饮品', keyword: '可乐' })
    expect(request.get).toHaveBeenCalledTimes(1)
    expect(request.get.mock.calls[0]).toEqual([
      '/api/v1/admin/inventory/materials',
      { params: { storeId: 2, page: 1, pageSize: 20, status: 'ACTIVE', category: '饮品', keyword: '可乐' } },
    ])
  })

  it('流水列表：物料/类型/来源/日期闭区间原样透传（日期不拼进查询串）', () => {
    listInventoryTransactions({
      page: 1,
      pageSize: 20,
      materialId: 7,
      transactionType: 'RECEIPT',
      sourceType: 'RECEIPT',
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(request.get.mock.calls[0]).toEqual([
      '/api/v1/admin/inventory/transactions',
      {
        params: {
          page: 1,
          pageSize: 20,
          materialId: 7,
          transactionType: 'RECEIPT',
          sourceType: 'RECEIPT',
          from: '2026-09-01',
          to: '2026-09-30',
        },
      },
    ])
  })

  it('未传筛选时仍是同一路径与空 params（不伪造分页键）', () => {
    listInventoryMaterials({ page: 1, pageSize: 20 })
    expect(request.get.mock.calls[0]).toEqual([
      '/api/v1/admin/inventory/materials',
      { params: { page: 1, pageSize: 20 } },
    ])
  })
})
