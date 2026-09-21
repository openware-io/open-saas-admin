import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }))

import { ElMessage } from 'element-plus'
import {
  CANCEL_REASON_MAX_LENGTH,
  CANCEL_REASON_REQUIRED_TEXT,
  cancelReasonInputValidator,
  normalizeCancelReason,
  submitCancelWithReason,
} from './cancelAction'
import {
  ORDER_HAS_PAYMENT_REFUND_FIRST_TEXT,
  notifyCancelRequestError,
  resolveCancelErrorMessage,
} from './adminErrorMessage'
import { hasPermissionOrMissing } from './context'
import { AUDIT_ACTION_FALLBACK_OPTIONS, auditActionText } from '@/constants/terms'

/**
 * 后台「取消预约 / 取消订单」行为契约：
 *  1) 原因必填（空白/超长不发起请求）；
 *  2) 错误码 → 中文提示（含 ORDER_HAS_PAYMENT_REFUND_FIRST），绝不把裸码/英文原文给运营；
 *  3) 权限门禁：无权限码时入口不显示/禁用，权限快照缺失时不误伤；
 *  4) 操作日志可见性：order.cancel / reservation.cancel 有中文兜底标签；
 *  5) 两个页面的交互守卫（源码级断言，防止回退成「原因选填」）。
 */

const readView = async (relative) => readFile(new URL(`../views/tenant/${relative}`, import.meta.url), 'utf8')

/** 去掉注释后再断言，避免「说明为什么不再这么写」的注释被当成实现。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('取消原因必填校验（utils/cancelAction）', () => {
  it('空值 / 纯空格一律校验不通过，并给出可直接展示的中文提示', () => {
    for (const blank of ['', '   ', '\t\n', null, undefined, 0]) {
      const result = normalizeCancelReason(blank)
      expect(result).toEqual({ ok: false, reason: '', message: CANCEL_REASON_REQUIRED_TEXT })
    }
    expect(CANCEL_REASON_REQUIRED_TEXT).toBe('请填写取消原因')
  })

  it('合法原因去首尾空白后提交', () => {
    expect(normalizeCancelReason('  客户取消  ')).toEqual({ ok: true, reason: '客户取消', message: '' })
  })

  it('长度上限 255：边界通过、超长拦下', () => {
    expect(CANCEL_REASON_MAX_LENGTH).toBe(255)
    expect(normalizeCancelReason('a'.repeat(CANCEL_REASON_MAX_LENGTH)).ok).toBe(true)
    const tooLong = normalizeCancelReason('a'.repeat(CANCEL_REASON_MAX_LENGTH + 1))
    expect(tooLong.ok).toBe(false)
    expect(tooLong.message).toContain('255')
  })

  it('prompt 的 inputValidator：通过返回空串，不通过返回中文提示（弹窗不关闭）', () => {
    expect(cancelReasonInputValidator('客户取消')).toBe('')
    expect(cancelReasonInputValidator('   ')).toBe(CANCEL_REASON_REQUIRED_TEXT)
    expect(cancelReasonInputValidator('a'.repeat(CANCEL_REASON_MAX_LENGTH + 1))).toContain('255')
  })

  it('空原因 / 超长原因不发起请求', async () => {
    const submit = vi.fn()
    await expect(submitCancelWithReason('   ', submit)).resolves.toEqual({ ok: false, reason: '', message: CANCEL_REASON_REQUIRED_TEXT })
    await expect(submitCancelWithReason('a'.repeat(CANCEL_REASON_MAX_LENGTH + 1), submit)).resolves.toMatchObject({ ok: false })
    expect(submit).not.toHaveBeenCalled()
  })

  it('校验通过只提交一次，且提交的是去空白后的原因', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    const result = await submitCancelWithReason(' 客户取消 ', submit)
    expect(result).toEqual({ ok: true, reason: '客户取消', message: '' })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith('客户取消')
  })

  it('接口失败向上抛，由页面统一提示（不在校验层吞掉）', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('409'))
    await expect(submitCancelWithReason('客户取消', submit)).rejects.toThrow('409')
  })
})

describe('取消动作错误码 → 中文提示（utils/adminErrorMessage）', () => {
  const errorWith = (code, message = 'Conflict') => ({ response: { status: 409, data: { code, message } } })

  it('后端 409 错误码映射为可执行的中文提示', () => {
    expect(resolveCancelErrorMessage(errorWith('ORDER_HAS_PAYMENT_REFUND_FIRST'), '取消订单失败'))
      .toBe('该订单已有收款，请先退款后再取消。')
    expect(resolveCancelErrorMessage(errorWith('ORDER_STATUS_INVALID'), '取消订单失败'))
      .toBe('该订单已完成或已取消。')
    expect(resolveCancelErrorMessage(errorWith('RESERVATION_STATUS_INVALID'), '取消预约失败'))
      .toBe('已到店/已开台的预约不能取消，请改为取消订单。')
    expect(resolveCancelErrorMessage({ response: { status: 400, data: { code: 'CANCEL_REASON_REQUIRED' } } }, '取消订单失败'))
      .toBe('请填写取消原因。')
    expect(resolveCancelErrorMessage({ response: { status: 400, data: { code: 'CANCEL_REASON_TOO_LONG' } } }, '取消订单失败'))
      .toBe('取消原因不能超过 255 个字符。')
  })

  it('「已收款不可取消」文案与页面提交前预检同源（导出常量，避免两处漂移）', () => {
    expect(ORDER_HAS_PAYMENT_REFUND_FIRST_TEXT).toBe('该订单已有收款，请先退款后再取消。')
  })

  it('未登记的错误码回落到通用中文解析，不展示裸码或英文原文', () => {
    const message = resolveCancelErrorMessage(errorWith('ORDER_SOMETHING_NEW', 'Conflict'), '取消订单失败')
    expect(message).toBe('数据已被其他操作更新，请刷新后重试。')
    expect(/[A-Za-z]/.test(message)).toBe(false)
    expect(message).not.toContain('ORDER_SOMETHING_NEW')
  })

  it('网络失败也回落到中文，绝不出现空串', () => {
    expect(resolveCancelErrorMessage({ message: 'Network Error' }, '取消订单失败')).toBe('网络连接异常，请检查网络后重试。')
    expect(resolveCancelErrorMessage({ response: { status: 418, data: {} } }, '取消订单失败')).toBe('取消订单失败')
  })

  it('notifyCancelRequestError 弹出并返回同一句中文提示', () => {
    const message = notifyCancelRequestError(errorWith('ORDER_HAS_PAYMENT_REFUND_FIRST'), '取消订单失败')
    expect(ElMessage.error).toHaveBeenCalledWith('该订单已有收款，请先退款后再取消。')
    expect(message).toBe('该订单已有收款，请先退款后再取消。')
  })

  it('所有取消专属提示都不含拉丁字母（运营看不到英文/裸错误码）', () => {
    const codes = ['CANCEL_REASON_REQUIRED', 'CANCEL_REASON_TOO_LONG', 'ORDER_HAS_PAYMENT_REFUND_FIRST', 'ORDER_STATUS_INVALID', 'RESERVATION_STATUS_INVALID']
    for (const code of codes) {
      const message = resolveCancelErrorMessage({ response: { status: 409, data: { code } } }, '取消失败')
      expect(`${code}:${/[A-Za-z]/.test(message)}`).toBe(`${code}:false`)
    }
  })
})

describe('取消入口权限门禁（utils/context.hasPermissionOrMissing）', () => {
  it('快照含权限码时放行（数组字符串 / {code} / {permissionCode} / 对象映射）', () => {
    expect(hasPermissionOrMissing(['order.settle', 'order.void'], 'order.void')).toBe(true)
    expect(hasPermissionOrMissing([{ code: 'order.void' }], 'order.void')).toBe(true)
    expect(hasPermissionOrMissing([{ permissionCode: 'order.void' }], 'order.void')).toBe(true)
    expect(hasPermissionOrMissing({ 'order.void': true }, 'order.void')).toBe(true)
    expect(hasPermissionOrMissing(['reservation.confirm', 'reservation.cancel'], 'reservation.cancel')).toBe(true)
  })

  it('快照明确不含权限码时判定不可见（收银员没有 reservation.cancel 就看不到取消入口）', () => {
    expect(hasPermissionOrMissing(['order.settle', 'payment.collect'], 'order.void')).toBe(false)
    expect(hasPermissionOrMissing([{ code: 'order.settle' }], 'order.void')).toBe(false)
    expect(hasPermissionOrMissing({ 'order.settle': true }, 'order.void')).toBe(false)
    expect(hasPermissionOrMissing(['reservation.confirm', 'reservation.arrival'], 'reservation.cancel')).toBe(false)
  })

  it('权限快照缺失（旧会话 / 平台上下文）不误伤：入口保留，越权仍由后端 403 兜底', () => {
    for (const empty of [null, undefined, [], {}]) {
      expect(hasPermissionOrMissing(empty, 'order.void')).toBe(true)
      expect(hasPermissionOrMissing(empty, 'reservation.cancel')).toBe(true)
    }
  })
})

describe('操作日志可见性（动作码中文标签）', () => {
  it('兜底动作字典登记了 order.cancel / reservation.cancel 的中文标签', () => {
    expect(AUDIT_ACTION_FALLBACK_OPTIONS).toContainEqual({ value: 'order.cancel', label: '取消订单' })
    expect(AUDIT_ACTION_FALLBACK_OPTIONS).toContainEqual({ value: 'reservation.cancel', label: '取消预约' })
    // 与既有「订单作废」并列，两者不混用
    expect(AUDIT_ACTION_FALLBACK_OPTIONS).toContainEqual({ value: 'order.void', label: '订单作废' })
  })

  it('后端未给 actionLabel 时也不会把动作码原样展示', () => {
    expect(auditActionText('order.cancel', '取消订单')).toBe('取消订单')
    expect(auditActionText('order.cancel')).toBe('取消')
    expect(auditActionText('reservation.cancel')).toBe('取消')
    expect(/[A-Za-z]/.test(auditActionText('order.cancel'))).toBe(false)
  })
})

describe('两个入口的交互守卫（源码级）', () => {
  it('预约页：取消走应用内弹窗（原因必填），校验不过不提交，成功后刷新列表', async () => {
    const source = await readView('reservations.vue')
    expect(source).toContain('请填写取消原因')
    expect(source).toContain('CancelReasonDialog')
    expect(source).toContain('submitCancelWithReason')
    expect(source).toContain('cancelReservation(row.id, normalized)')
    expect(source).toContain('await load()')
    const code = stripComments(source)
    expect(code).not.toContain('取消原因（选填）')
    // 真机上 ElMessageBox.prompt 点确认既不关闭也不发请求、还残留节点：取消入口不得再用它。
    expect(code).not.toContain('ElMessageBox.prompt')
    // 空原因一律不发请求：不得再用 `reason: xxx || null` 这类「空值也提交」的写法发空原因。
    expect(code).not.toMatch(/reason:\s*[^,\n]*\|\|\s*null/)
  })

  it('预约页：取消按钮按 reservation.cancel 权限显示', async () => {
    const source = await readView('reservations.vue')
    expect(source).toContain('RESERVATION_CANCEL_PERMISSION')
    expect(source).toContain("'reservation.cancel'")
    expect(source).toContain('hasPermissionOrMissing')
    expect(source).toContain('v-if="canCancelReservation &&')
  })

  it('订单页：作废入口改为「取消订单」，走新接口且原因必填', async () => {
    const source = await readView('orders.vue')
    expect(source).toContain('取消订单')
    expect(source).toContain('cancelOrder(row.id, normalized)')
    expect(source).toContain('submitCancelWithReason')
    expect(source).toContain('CancelReasonDialog')
    expect(source).toContain("command === 'cancel'")
    const code = stripComments(source)
    expect(code).not.toContain('作废原因（选填）')
    expect(code).not.toContain('voidOrder(')
    // 真机上 ElMessageBox.prompt 点确认既不关闭也不发请求、还残留节点：取消入口不得再用它。
    expect(code).not.toContain('ElMessageBox.prompt')
    // 空原因一律不发请求：不得再用 `reason: xxx || null` 这类「空值也提交」的写法发空原因。
    expect(code).not.toMatch(/reason:\s*[^,\n]*\|\|\s*null/)
  })

  it('订单页：二次确认写清释放包厢与记入操作日志', async () => {
    const source = await readView('orders.vue')
    expect(source).toContain('取消后会释放该订单占用的包厢，操作会记入操作日志')
    expect(source).toContain('await load()')
  })

  it('订单页：已收款订单提交前给出「先退款」提示，不发起注定失败的请求', async () => {
    const source = await readView('orders.vue')
    expect(source).toContain('paidAmountOf(row) > 0')
    expect(source).toContain('ORDER_HAS_PAYMENT_REFUND_FIRST_TEXT')
  })

  it('订单页：取消订单入口按 order.void 权限显示（延续作废的状态门槛）', async () => {
    const source = await readView('orders.vue')
    expect(source).toContain('ORDER_CANCEL_PERMISSION')
    expect(source).toContain("'order.void'")
    expect(source).toContain('hasPermissionOrMissing')
    // 状态门槛从「直接隐藏入口」改成「入口显示但禁用并写明原因」：隐藏时运营点开 ··· 只看到「订单详情」，
    // 会以为「取消订单没反应」（2026-09-19 修）；已作废/已取消才不出现。
    expect(source).toContain('canCancelOrder && showCancelItem(room.order.status)')
    expect(source).toContain(':disabled="!canVoid(room.order.status)"')
    expect(source).toContain('取消订单（已完成，须先退款）')
  })

  it('订单页：填写原因后无论成功失败都有反馈（不出现「点了没反应」的静默路径）', async () => {
    const source = await readView('orders.vue')
    // 原因校验与请求异常都要有明确反馈；请求失败不允许静默返回。
    expect(source).toContain('if (!row?.id)')
    expect(source).toContain('订单信息不完整')
    // 弹窗是应用内的，提交走 CancelReasonDialog 的 confirm（不再有 prompt 异常分支）
    expect(source).toContain('@confirm="submitCancelOrder"')
    expect(source).toContain('ElMessage.warning(result.message)')
    expect(source).toContain("ElMessage.success('已取消订单，包厢占用已释放')")
    expect(source).toContain("notifyCancelRequestError(e, '取消订单失败')")
    // 提交期间有 loading 态，避免重复点击看起来「没反应」
    expect(source).toContain(':loading="cancelSubmitting"')
  })

  it('两个页面都用取消专属中文错误提示（不弹原始英文错误码）', async () => {
    expect(await readView('orders.vue')).toContain("notifyCancelRequestError(e, '取消订单失败')")
    expect(await readView('reservations.vue')).toContain("notifyCancelRequestError(e, '取消预约失败')")
  })
})
