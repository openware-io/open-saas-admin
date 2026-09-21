/**
 * 取消预约 / 取消订单的「原因必填」共用规则（两个入口共用一份，避免各写一份后漂移）。
 *
 * 后端契约（platform-order-service）：
 *  - POST /business/reservations/{id}/cancel、POST /business/orders/{id}/cancel 的 `reason` 必填，
 *    空白 → 400 `CANCEL_REASON_REQUIRED`；
 *  - `reason` 上限 255（与备注字段同口径），超长在前端先拦，不把注定失败的请求发出去。
 *
 * 因此后台的取消弹窗不再是「原因选填」：空/纯空格直接提示并**不发起请求**。
 */
export const CANCEL_REASON_MAX_LENGTH = 255
export const CANCEL_REASON_REQUIRED_TEXT = '请填写取消原因'
export const CANCEL_REASON_TOO_LONG_TEXT = '取消原因不能超过 ' + CANCEL_REASON_MAX_LENGTH + ' 个字符'

/**
 * 归一化并校验取消原因。
 * @returns {{ ok: boolean, reason: string, message: string }} ok=false 时 message 是可直接展示的中文提示
 */
export function normalizeCancelReason(raw) {
  const reason = typeof raw === 'string' ? raw.trim() : ''
  if (!reason) return { ok: false, reason: '', message: CANCEL_REASON_REQUIRED_TEXT }
  if (reason.length > CANCEL_REASON_MAX_LENGTH) return { ok: false, reason, message: CANCEL_REASON_TOO_LONG_TEXT }
  return { ok: true, reason, message: '' }
}

/**
 * ElMessageBox.prompt 的 inputValidator：通过返回空串，不通过返回中文提示（弹窗保持打开，不提交）。
 */
export function cancelReasonInputValidator(value) {
  return normalizeCancelReason(value).message
}

/**
 * 执行「原因必填」的取消动作：校验不通过时**不调用** submit（即不发起请求），
 * 由调用方用返回的 message 提示运营人员；校验通过才把去空白的 reason 交给 submit。
 */
export async function submitCancelWithReason(raw, submit) {
  const { ok, reason, message } = normalizeCancelReason(raw)
  if (!ok) return { ok: false, reason, message }
  await submit(reason)
  return { ok: true, reason, message: '' }
}
