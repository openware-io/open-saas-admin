import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { confirmItem, getPendingApprovalItems, rejectItem } from '@/api/order'
import { isAlreadyProcessed, usePendingApprovalStore } from './pendingApproval'

vi.mock('@/api/order', () => ({
  getPendingApprovalItems: vi.fn(),
  confirmItem: vi.fn(),
  rejectItem: vi.fn(),
}))

/**
 * 「待确认加项」写路径的结果一致性守卫（2026-09-19 线上故障的回归）。
 *
 * 线上现象：运营点「确认加项」→ 界面弹「服务内部错误，请稍后重试」（后端 500），
 * **同时**前端已经乐观移除并把该条按成功处理 —— 两边结果不一致。
 *
 * 后端根因是 `OrderItemController#invalidatePendingApproval()` 自递归爆栈
 * （守卫在 `OrderItemControllerPendingApprovalTest`）。这里守前端两件事：
 *   1) 服务端没认这次确认时，`confirm/reject/confirmOrder` 必须返回 `ok:false`，
 *      调用方（抽屉/收银台）才可能**不**弹「已确认」；
 *   2) 失败后的回滚刷新必须**绕过 revision 去抖**：服务端那条还在 → revision 不变，
 *      普通刷新会被跳过，乐观移除的条目将永远从界面消失（角标少算），同样是两边不一致。
 */

/** 服务端侧的可变状态：模拟「本门店的待确认加项」。 */
let serverItems

function viewOf(items) {
  const groups = new Map()
  items.forEach((item) => {
    const group = groups.get(item.orderId)
      || { orderId: item.orderId, orderNo: 'O' + item.orderId, pendingCount: 0, pendingAmount: 0, items: [] }
    group.items.push(item)
    group.pendingCount += 1
    group.pendingAmount += item.amount
    groups.set(item.orderId, group)
  })
  return {
    pendingCount: items.length,
    pendingAmount: items.reduce((sum, item) => sum + item.amount, 0),
    currencyCode: 'CNY',
    mixedCurrency: false,
    // 与服务端口径一致：命中行最大 id（一条没被处理掉的待确认项不会改变它）
    revision: items.reduce((max, item) => Math.max(max, item.id), 0),
    serverTimeMillis: 1,
    orders: [...groups.values()],
  }
}

function serverError(status, code, message) {
  return Object.assign(new Error(message || code), { response: { status, data: { code, message } } })
}

const item = (id, orderId, name, amount) => ({ id, orderId, name, quantity: '1', amount, currencyCode: 'CNY' })

const itemIdsOf = (store, orderId) => (store.orders
  .find((group) => String(group.orderId) === String(orderId))?.items || []).map((entry) => entry.id)

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  serverItems = [item(11, 1, '精酿啤酒', 100), item(12, 1, '果盘', 200)]
  getPendingApprovalItems.mockImplementation(async () => viewOf(serverItems))
})

describe('确认/拒绝：服务端没成功就不能算成功', () => {  it('服务端 500：ok=false，且乐观移除的条目按服务端状态回到列表（角标不少算）', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    expect(store.pendingCount).toBe(2)

    confirmItem.mockRejectedValue(serverError(500, 'INTERNAL_ERROR', '服务内部错误，请稍后重试'))

    const result = await store.confirm(1, 11)

    expect(result.ok).toBe(false)
    expect(result.alreadyProcessed).toBe(false)
    expect(result.error).toBeTruthy()
    // 服务端那条还在 → revision 未变；回滚刷新必须仍然生效
    expect(store.pendingCount).toBe(2)
    expect(store.countOfOrder(1)).toBe(2)
    expect(itemIdsOf(store, 1)).toEqual([11, 12])
  })

  it('拒绝失败同口径：ok=false 且列表回到服务端状态', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    rejectItem.mockRejectedValue(serverError(500, 'INTERNAL_ERROR', '服务内部错误，请稍后重试'))

    const result = await store.reject(1, 12)

    expect(result.ok).toBe(false)
    expect(store.pendingCount).toBe(2)
    expect(itemIdsOf(store, 1)).toEqual([11, 12])
  })

  it('并发下已被同事处理（409）：alreadyProcessed=true（调用方轻提示，不报红色失败）', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    confirmItem.mockRejectedValue(serverError(409, 'ORDER_ITEM_STATUS_INVALID', '该加项已被处理，请刷新后查看'))

    const result = await store.confirm(1, 11)

    expect(result.ok).toBe(false)
    expect(result.alreadyProcessed).toBe(true)
  })

  it('成功：ok=true，服务端视图覆盖本地乐观移除', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    confirmItem.mockImplementation(async (orderId, itemId) => {
      serverItems = serverItems.filter((entry) => entry.id !== itemId)
    })

    const result = await store.confirm(1, 11)

    expect(result).toEqual({ ok: true })
    expect(confirmItem).toHaveBeenCalledWith(1, 11)
    expect(store.pendingCount).toBe(1)
    expect(itemIdsOf(store, 1)).toEqual([12])
  })
})

describe('本单全部确认：逐条串行，失败不谎报「全部确认」', () => {
  it('一条成功一条 500：ok=false、failed=1，界面按服务端最新状态刷新', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    confirmItem.mockImplementation(async (orderId, itemId) => {
      if (itemId === 12) throw serverError(500, 'INTERNAL_ERROR', '服务内部错误，请稍后重试')
      serverItems = serverItems.filter((entry) => entry.id !== itemId)
    })

    const result = await store.confirmOrder(1)

    expect(result).toMatchObject({ ok: false, total: 2, failed: 1, alreadyProcessed: 0 })
    expect(store.countOfOrder(1)).toBe(1)
    expect(itemIdsOf(store, 1)).toEqual([12])
  })

  it('一条已被别人处理：不算失败（ok=true、alreadyProcessed=1）', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    confirmItem.mockImplementation(async (orderId, itemId) => {
      if (itemId === 11) throw serverError(409, 'ORDER_ITEM_STATUS_INVALID', '该加项已被处理，请刷新后查看')
      serverItems = serverItems.filter((entry) => entry.id !== itemId)
    })

    const result = await store.confirmOrder(1)

    expect(result).toMatchObject({ ok: true, total: 2, failed: 0, alreadyProcessed: 1 })
    expect(itemIdsOf(store, 1)).toEqual([11])
  })
})

describe('isAlreadyProcessed：并发/幂等结果判定', () => {
  it('409 与 ORDER_ITEM_STATUS_INVALID（旧服务端放在 400）都算「已被处理」', () => {
    expect(isAlreadyProcessed(serverError(409, 'ORDER_ITEM_STATUS_INVALID', ''))).toBe(true)
    expect(isAlreadyProcessed(serverError(400, 'ORDER_ITEM_STATUS_INVALID', ''))).toBe(true)
  })

  it('真正的失败（500 / 网络）不算「已被处理」', () => {
    expect(isAlreadyProcessed(serverError(500, 'INTERNAL_ERROR', ''))).toBe(false)
    expect(isAlreadyProcessed(new Error('Network Error'))).toBe(false)
  })
})

/**
 * 确认/拒绝会让**服务端订单的明细与金额**发生变化（这是本次要修的真实缺陷）：
 * 以前只刷新了抽屉里的待确认列表，收银台卡片、订单管理列表各自缓存的订单数据没重拉，
 * 卡片金额停在旧值 → 与结账抽屉/账单（以及 C 端看到的金额）不一致。
 * 现在 store 用 `orderDataRevision` 作为「订单数据被改动过」的信号，页面 watch 它重拉。
 */
describe('确认/拒绝后必须让页面重拉订单数据', () => {
  it('确认成功：orderDataRevision 自增（页面据此重拉）', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    const before = store.orderDataRevision
    confirmItem.mockImplementation(async (orderId, itemId) => {
      serverItems = serverItems.filter((entry) => entry.id !== itemId)
    })

    const result = await store.confirm(1, 11)

    expect(result.ok).toBe(true)
    expect(store.orderDataRevision).toBe(before + 1)
  })

  it('确认失败：不自增（服务端没变，页面无需重拉）', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    const before = store.orderDataRevision
    confirmItem.mockRejectedValue(serverError(500, 'INTERNAL_ERROR', '服务内部错误，请稍后重试'))

    await store.confirm(1, 11)

    expect(store.orderDataRevision).toBe(before)
  })

  it('本单全部确认：只要有一条被处理掉（含已被同事处理）就自增', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    const before = store.orderDataRevision
    confirmItem.mockImplementation(async (orderId, itemId) => {
      if (itemId === 11) throw serverError(409, 'ORDER_ITEM_STATUS_INVALID', '该加项已被处理，请刷新后查看')
      serverItems = serverItems.filter((entry) => entry.id !== itemId)
    })

    const result = await store.confirmOrder(1)

    expect(result).toMatchObject({ ok: true, alreadyProcessed: 1 })
    expect(store.orderDataRevision).toBe(before + 1)
  })

  it('全部失败：不自增', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    const before = store.orderDataRevision
    confirmItem.mockRejectedValue(serverError(500, 'INTERNAL_ERROR', ''))

    const result = await store.confirmOrder(1)

    expect(result.ok).toBe(false)
    expect(store.orderDataRevision).toBe(before)
  })

  it('reset（切门店/登出）归零，避免跨门店误触发', async () => {
    const store = usePendingApprovalStore()
    await store.refresh()
    confirmItem.mockResolvedValue({})
    await store.confirm(1, 11)
    expect(store.orderDataRevision).toBeGreaterThan(0)

    store.reset()

    expect(store.orderDataRevision).toBe(0)
  })
})
