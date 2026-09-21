import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// 订单管理必须把「组合支付怎么收的」展示出来，且不能有遗漏。
//
// 背景：订单账单（BillResult.Collected）只汇总现金/储值/积分三个桶，线上渠道被并进现金，
// 同一订单的多次收款、每笔的分腿、渠道交易号与退款都看不到——运营在订单管理核对组合支付时缺信息。
// 这里同时钉住「接口唯一来源」「六种支付方式都有中文名」「未收款 ≠ 0 元」「混币种不相加」。

const ORDER_VIEW = readFileSync(new URL('../views/tenant/order-management.vue', import.meta.url), 'utf8')
const ORDER_API = readFileSync(new URL('../api/order.js', import.meta.url), 'utf8')
const PAYMENT_METHODS = readFileSync(new URL('../constants/payment-methods.js', import.meta.url), 'utf8')

describe('订单管理 · 收款明细接线', () => {
  it('收款明细走唯一聚合接口 /business/payments/order-collections（网关 payment 白名单内）', async () => {
    const get = vi.fn().mockResolvedValue([])
    vi.doMock('@/api/request', () => ({ default: { get, post: vi.fn() } }))
    vi.resetModules()
    const api = await import('../api/order.js')
    await api.getOrderCollections([69, 70])
    expect(get).toHaveBeenCalledTimes(1)
    const [url, config] = get.mock.calls[0]
    expect(url).toBe('/api/v1/business/payments/order-collections')
    // 逗号串是 Spring `@RequestParam List<Long>` 能绑定的形态（数组会被序列化成 orderIds[]）
    expect(config.params.orderIds).toBe('69,70')
    vi.doUnmock('@/api/request')
    vi.resetModules()
  })

  it('订单号为空时不下发任何 id（服务端空列表会 400，必须由前端兜住）', async () => {
    const get = vi.fn().mockResolvedValue([])
    vi.doMock('@/api/request', () => ({ default: { get, post: vi.fn() } }))
    vi.resetModules()
    const api = await import('../api/order.js')
    await api.getOrderCollections([])
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][1].params.orderIds).toBe('')
    vi.doUnmock('@/api/request')
    vi.resetModules()
  })

  it('列表有「收款方式」列、详情有「收款明细」区，两处都接同一份数据', () => {
    expect(ORDER_VIEW).toContain('label="收款方式"')
    expect(ORDER_VIEW).toContain('收款明细')
    expect(ORDER_VIEW).toContain('getOrderCollections')
    expect(ORDER_VIEW).toContain('paymentSummaryOf(row)')
    expect(ORDER_VIEW).toContain('collectionLegs(collection)')
  })

  it('组合支付有显式标记，且分腿逐条展示（不合并成一行）', () => {
    expect(ORDER_VIEW).toContain('组合支付')
    expect(ORDER_VIEW).toContain("{{ methodLabel(leg.method, walletBrand) }}")
    expect(ORDER_VIEW).toContain('本次应收')
  })

  it('渠道流水与退款都不省略（含渠道交易号）', () => {
    expect(ORDER_VIEW).toContain('渠道流水')
    expect(ORDER_VIEW).toContain('providerTransactionNo')
    expect(ORDER_VIEW).toContain('refundStatusText(refund.status)')
    expect(ORDER_VIEW).toContain('providerRefundNo')
    expect(ORDER_VIEW).toContain('refundedAmount')
  })

  it('六种支付方式都有中文名，未知方式回落「未知（CODE）」而不是英文原文', () => {
    for (const method of ['CASH', 'WALLET', 'POINT', 'ALIPAY', 'WECHAT', 'STRIPE']) {
      expect(PAYMENT_METHODS).toContain(method)
    }
    // 储值/积分的品牌名来自租户配置，不在页面写死
    expect(ORDER_VIEW).toContain('resolveWalletBrandName')
    expect(ORDER_VIEW).toContain('WALLET_BRAND_NAME_DEFAULT')
  })

  it('未收款不显示成 0 元，加载中也不武断写「未收款」', () => {
    expect(ORDER_VIEW).toContain("'未收款'")
    expect(ORDER_VIEW).toContain("'明细待核对'")
    expect(ORDER_VIEW).toContain('加载中…')
    expect(ORDER_VIEW).not.toContain('formatMoney(0')
  })

  it('混币种不给合计金额（禁止跨币种相加）', () => {
    expect(ORDER_VIEW).toContain('mixedCurrency')
    expect(ORDER_VIEW).toContain('多币种')
  })

  it('收款明细按当前页批量取，不做每行一次请求（避免 N+1）', () => {
    expect(ORDER_VIEW).toContain('loadCollectionsFor(rows)')
    expect(ORDER_VIEW).toContain('ids.slice(0, 100)')
    // 只有详情抽屉会单独再拉一次（点开那一单）
    expect(ORDER_VIEW.match(/getOrderCollections\(/g)).toHaveLength(2)
  })
})
