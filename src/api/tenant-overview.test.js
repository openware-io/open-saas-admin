import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./request', () => ({ default: { get: vi.fn() } }))

import request from './request'
import { getTenantOverview } from './tenant-overview'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('租户总部总览接口契约', () => {
  it('使用 v1 BFF 路径并透传总部筛选参数', () => {
    getTenantOverview({ from: '2026-09-01', to: '2026-09-30', storeIds: '11,12' })

    expect(request.get).toHaveBeenCalledWith('/api/v1/admin/tenant/overview', {
      params: { from: '2026-09-01', to: '2026-09-30', storeIds: '11,12' },
    })
  })

  it('无筛选时不伪造 businessType 或租户标识', () => {
    getTenantOverview({})

    expect(request.get).toHaveBeenCalledWith('/api/v1/admin/tenant/overview', { params: {} })
    const params = request.get.mock.calls[0][1].params
    expect(params.businessType).toBeUndefined()
    expect(params.tenantId).toBeUndefined()
  })
})
