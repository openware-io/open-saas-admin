import { describe, expect, it } from 'vitest'
import { chooseSingleContext, contextIdOf } from './context'

describe('chooseSingleContext', () => {
  it('返回唯一候选', () => {
    expect(chooseSingleContext([{ contextId: 'one' }])).toMatchObject({ contextId: 'one' })
  })

  it('多候选时也必选一个，避免进入后台后业务接口 401 SAAS_CONTEXT_REQUIRED', () => {
    const items = [{ contextId: 'one' }, { contextId: 'two' }]
    expect(chooseSingleContext(items)).toMatchObject({ contextId: 'one' })
  })

  it('进入租户后台优先带门店的上下文（开台/订单需要 storeId）', () => {
    const items = [
      { contextId: 'tenant-only', storeId: null, scopeType: 'TENANT' },
      { contextId: 'store-ctx', storeId: 100, scopeType: 'STORE' },
    ]
    expect(chooseSingleContext(items, 'TENANT')).toMatchObject({ contextId: 'store-ctx' })
  })

  it('进入平台运营后台优先 PLATFORM 上下文（即使另有门店上下文）', () => {
    const items = [
      { contextId: 'plat', scopeType: 'PLATFORM', storeId: null },
      { contextId: 'store-ctx', scopeType: 'STORE', storeId: 100 },
    ]
    expect(chooseSingleContext(items, 'PLATFORM')).toMatchObject({ contextId: 'plat' })
  })

  it('无门店候选时按 scopeType 偏好选择', () => {
    const items = [
      { contextId: 'plat', scopeType: 'PLATFORM' },
      { contextId: 'ten', scopeType: 'TENANT' },
    ]
    expect(chooseSingleContext(items, 'TENANT')).toMatchObject({ contextId: 'ten' })
  })

  it('空列表返回 null', () => {
    expect(chooseSingleContext([])).toBeNull()
    expect(chooseSingleContext(null)).toBeNull()
  })
})

/**
 * contextIdOf 是「前端缓存的上下文」与「服务端会话里的 selectedContextId」比对用的，
 * 拼接规则必须与服务端 ContextController.Scope.parse 完全一致，否则每次校准都会误判成「上下文变了」。
 */
describe('contextIdOf', () => {
  it('按 tenantId:organizationId:storeId 拼接，空段留空', () => {
    expect(contextIdOf({ tenantId: 100 })).toBe('100::')
    expect(contextIdOf({ tenantId: 100, organizationId: 200 })).toBe('100:200:')
    expect(contextIdOf({ tenantId: 100, organizationId: 200, storeId: 300 })).toBe('100:200:300')
    expect(contextIdOf({ tenantId: 100, organizationId: null, storeId: 300 })).toBe('100::300')
  })

  it('缺 tenantId / 空上下文返回空串（视为「没有上下文」）', () => {
    expect(contextIdOf(null)).toBe('')
    expect(contextIdOf(undefined)).toBe('')
    expect(contextIdOf({})).toBe('')
  })
})
