import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./request', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import request from './request'
import { assignRoomReservation, noShowReservation, openTableReservation } from './reservation'

/**
 * 预约改房型的接口契约（后端 6dffcf55，经 platform-admin-service BFF）：
 *  - 到店分配包厢走 POST /api/v1/admin/reservations/{id}/assign-room，body `{ resourceId, override }`；
 *  - 开台仍是 POST /api/v1/admin/reservations/{id}/open-table（未分配包厢后端 409，前端按钮先禁用）；
 *  - 未到店走 POST /api/v1/admin/reservations/{id}/no-show（到店前且已过预约开始时间 → NO_SHOW）。
 */

beforeEach(() => {
  vi.clearAllMocks()
})

describe('分配包厢（assignRoomReservation）', () => {
  it('走 /admin/reservations/{id}/assign-room，body 带 resourceId 与 override', () => {
    assignRoomReservation(9, 33)
    expect(request.post).toHaveBeenCalledTimes(1)
    expect(request.post.mock.calls[0]).toEqual([
      '/api/v1/admin/reservations/9/assign-room',
      { resourceId: 33, override: false },
    ])
  })

  it('改派显式带 override=true（换包厢后端要求显式覆盖才允许）', () => {
    assignRoomReservation(9, 33, true)
    expect(request.post.mock.calls[0]).toEqual([
      '/api/v1/admin/reservations/9/assign-room',
      { resourceId: 33, override: true },
    ])
  })

  it('override 归一化为布尔值，不把 undefined 透给后端', () => {
    assignRoomReservation(9, 33, undefined)
    expect(request.post.mock.calls[0][1]).toEqual({ resourceId: 33, override: false })
    assignRoomReservation(9, 33, false)
    expect(request.post.mock.calls[1][1]).toEqual({ resourceId: 33, override: false })
  })
})

describe('开台（openTableReservation）', () => {
  it('仍走 /admin/reservations/{id}/open-table，且不带 body', () => {
    openTableReservation(9)
    expect(request.post.mock.calls[0]).toEqual(['/api/v1/admin/reservations/9/open-table'])
  })
})

describe('未到店（noShowReservation）', () => {
  it('走 /admin/reservations/{id}/no-show，且不带 body', () => {
    noShowReservation(9)
    expect(request.post.mock.calls[0]).toEqual(['/api/v1/admin/reservations/9/no-show'])
  })
})
