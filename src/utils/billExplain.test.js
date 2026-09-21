import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { durationTextFromSeconds, roomFeeDurationText, roomFeeSourceText } from './billExplain'

/**
 * 账单可解释性守卫（产品口径：账单金额必须让用户明白是怎么算出来的）。
 *
 * 三件事必须锁死：
 *  1. 「怎么算出来的」的判定与文案只有一份（utils/billExplain），收银台账单弹窗与订单管理账单区共用；
 *  2. 包厢费的解释（方案 / 计费时长·扣暂停 / 每递增粒度单价 × 块数 / 超时部分 / 已含 1 名服务人员 /
 *     固化时刻）全部读**服务端字段**，页面不得自己算块数、自己加总优惠（金额算术一律在服务端）；
 *  3. 「历史固化值（没有结台时刻）」不能显示成「0 分钟」——线上订单 72「0 分钟却收 40」就是这么来的。
 */
const orders = readFileSync(new URL('../views/tenant/orders.vue', import.meta.url), 'utf8')
const orderManagement = readFileSync(new URL('../views/tenant/order-management.vue', import.meta.url), 'utf8')

describe('账单解释文案（utils/billExplain）', () => {
  it('时长文案：小时/分钟复合，不足 1 分钟不显示 0 分钟', () => {
    expect(durationTextFromSeconds(0)).toBe('0 分钟')
    expect(durationTextFromSeconds(30)).toBe('不足 1 分钟')
    expect(durationTextFromSeconds(1800)).toBe('30 分钟')
    expect(durationTextFromSeconds(3660)).toBe('1 小时 1 分钟')
    expect(durationTextFromSeconds(7200)).toBe('2 小时')
  })

  it('金额来源：实时值 / 结台固化 / 历史固化（时长不可知）三态各有说法', () => {
    expect(roomFeeSourceText({ source: 'LIVE' })).toContain('实时值')
    expect(roomFeeSourceText({ source: 'CLOSED' })).toContain('结台固化')
    expect(roomFeeSourceText({ source: 'HISTORICAL' })).toContain('历史固化')
  })

  it('没有结台时刻的历史房费：明说「时长未记录」，绝不输出 0 分钟（线上订单 72）', () => {
    const historical = { source: 'HISTORICAL', durationKnown: false, durationSeconds: 0, quantity: 1, unitPrice: 4000 }
    expect(roomFeeDurationText(historical)).toContain('时长未记录')
    expect(roomFeeDurationText(historical)).not.toContain('0 分钟')
    // 已有的结台账单（closed_at 有值、时长真的是 0）仍照实显示 0 分钟
    expect(roomFeeDurationText({ source: 'CLOSED', durationKnown: true, durationSeconds: 0 })).toBe('0 分钟')
  })
})

describe('账单解释只读服务端字段（源码守卫）', () => {
  it.each([
    ['收银台账单弹窗', orders],
    ['订单管理账单区', orderManagement],
  ])('%s：包厢费解释字段齐全，且不再自己算块数', (_label, source) => {
    for (const field of [
      'roomFee.planName',
      'roomFee.durationSeconds',
      'roomFee.pausedSeconds',
      'roomFee.unitPrice',
      'roomFee.quantity',
      'roomFee.incrementMinutes',
      'roomFee.overSeconds',
      'roomFee.standardSeconds',
      'roomFee.overtimeRate',
      'roomFee.snapshotAt',
    ]) {
      expect(source).toContain(field)
    }
    // 块数只能来自服务端 roomFee.quantity：客户端不得再按递增粒度取整算一遍
    expect(source).not.toContain('billBlocks')
    expect(source).not.toMatch(/Math\.ceil\([^\n]*increment/i)
    // 金额来源与时长文案共用同一份工具
    expect(source).toContain("from '@/utils/billExplain'")
  })

  it('合计构成（原价合计 − 优惠 + 税 = 合计）用服务端字段，不再自己把行加总', () => {
    for (const source of [orders, orderManagement]) {
      expect(source).toContain('subtotalAmount')
      expect(source).toContain('discountAmount')
      expect(source).toContain('taxAmount')
      expect(source).not.toContain('billPromotionTotal')
    }
    // 订单管理的应收取服务端 payableAmount，不重复实现「合计 − 已收」
    expect(orderManagement).toContain('bill.payableAmount')
  })

  it('订单管理列表/详情的消费金额取服务端实时合计（与收银台卡片、账单同一个数）', () => {
    expect(orderManagement).toContain('row.liveTotalAmount')
    expect(orderManagement).toContain('detailOrder.liveTotalAmount')
    // 绝不再把实时房费加到合计上（那会把包厢费算两遍：线上 6150 vs 10150）
    for (const source of [orders, orderManagement]) {
      expect(source).not.toContain('totalAmount + roomEstimatedFee')
      expect(source).not.toContain('roomEstimatedFee +')
    }
  })
})
