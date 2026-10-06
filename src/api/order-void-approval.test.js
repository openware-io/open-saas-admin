import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./request', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import request from './request'
import { approveVoidApproval, listVoidApprovals, rejectVoidApproval, requestVoidApproval } from './order'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('订单作废审批接口', () => {
  it('提交申请使用订单 ID 和幂等键', () => {
    const body = { reason: '测试作废', idempotencyKey: 'e2e-1' }
    requestVoidApproval(42, body)
    expect(request.post).toHaveBeenCalledWith('/api/v1/business/orders/void-approvals/42/request', body)
  })

  it('列表和审批动作保持 v1 路径', () => {
    listVoidApprovals({ status: 'PENDING' })
    approveVoidApproval(7, '同意')
    rejectVoidApproval(8, '驳回')
    expect(request.get).toHaveBeenCalledWith('/api/v1/business/orders/void-approvals', { params: { status: 'PENDING' } })
    expect(request.post).toHaveBeenNthCalledWith(1, '/api/v1/business/orders/void-approvals/7/approve', { comment: '同意' })
    expect(request.post).toHaveBeenNthCalledWith(2, '/api/v1/business/orders/void-approvals/8/reject', { comment: '驳回' })
  })
})
