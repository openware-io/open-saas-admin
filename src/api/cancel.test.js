import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./request', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import request from './request'
import { cancelOrder, voidOrder } from './order'
import { cancelReservation } from './reservation'

/**
 * 运营代客取消的接口契约：
 *  - 取消订单走**新**接口 POST /api/v1/business/orders/{id}/cancel（不是 /void）；
 *  - 取消预约走 POST /api/v1/admin/reservations/{id}/cancel（与确认/到店同一组 BFF 路径）；
 *  - 两者的 body 都是 `{ reason }`，reason 必填由页面校验，接口层不做「空 → null」的兜底替换
 *    （历史实现用 `value || null` 发空原因，后端 reason 必填后会 400）。
 */

beforeEach(() => {
  vi.clearAllMocks()
})

describe('取消订单（cancelOrder）', () => {
  it('走 /business/orders/{id}/cancel，body 带 reason', () => {
    cancelOrder(42, '客户取消')
    expect(request.post).toHaveBeenCalledTimes(1)
    expect(request.post.mock.calls[0]).toEqual(['/api/v1/business/orders/42/cancel', { reason: '客户取消' }])
  })

  it('不再用 /void 承载取消动作（作废与取消是两个语义/两套校验）', () => {
    cancelOrder(42, '客户取消')
    expect(request.post.mock.calls[0][0]).not.toContain('/void')
    voidOrder(42, '客户取消')
    expect(request.post.mock.calls[1][0]).toContain('/void')
  })

  it('reason 原样透传：不把空串/值偷偷换成 null（空原因由页面拦下）', () => {
    cancelOrder(7, '')
    expect(request.post.mock.calls[0][1]).toEqual({ reason: '' })
    cancelOrder(7, ' 客户取消 ')
    expect(request.post.mock.calls[1][1]).toEqual({ reason: ' 客户取消 ' })
  })
})

describe('取消预约（cancelReservation）', () => {
  it('走 /admin/reservations/{id}/cancel，body 带 reason', () => {
    cancelReservation(9, '客户改期')
    expect(request.post).toHaveBeenCalledTimes(1)
    expect(request.post.mock.calls[0]).toEqual(['/api/v1/admin/reservations/9/cancel', { reason: '客户改期' }])
  })

  it('reason 原样透传（与确认/到店共用同一 BFF 前缀）', () => {
    cancelReservation(9, '')
    expect(request.post.mock.calls[0][0]).toBe('/api/v1/admin/reservations/9/cancel')
    expect(request.post.mock.calls[0][1]).toEqual({ reason: '' })
  })
})
