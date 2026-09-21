// 订单收款明细（组合支付）的展示口径 —— 纯函数，便于单测与守卫。
//
// 数据源唯一：`GET /api/v1/business/payments/order-collections`（服务端按订单一次给出
// 每一笔已确认收款的全部分腿、渠道流水与退款）。页面**不在前端拼资金口径**：
// 分腿金额、已退金额都由服务端算好，这里只做「怎么显示」。
//
// 三条硬口径：
// 1. **不遗漏**：分腿按后端给的顺序逐条展示（积分/储值/现金/支付宝/微信/Stripe 各自一行），
//    线上渠道绝不并进「现金」；同一订单的多笔收款逐笔展示，不合并成一行。
// 2. **不跨币种相加**：`mixedCurrency=true`（或 currencyCode 为空）时不给任何合计金额，
//    只给「多币种」提示；每笔收款/每条流水按自己的币种快照渲染。
// 3. **未收款 ≠ 0 元**：接口对没有收款数据的订单不返回条目，页面显示「未收款」而不是 ¥0.00。

import { DEDUCTION_PRIORITY, methodLabel } from '@/constants/payment-methods'

/** 把接口返回的数组按 orderId 建索引；顺带兼容 `data`/`items` 包装。 */
export function indexOrderCollections(payload) {
  const list = Array.isArray(payload) ? payload : (payload?.data || payload?.items || [])
  const map = {}
  for (const view of list) {
    if (view && view.orderId != null) map[String(view.orderId)] = view
  }
  return map
}

/** 该订单是否有收款记录（没有 ⇒ 未收款，不能显示成 0 元）。 */
export function hasCollections(view) {
  return Boolean(view && Array.isArray(view.collections) && view.collections.length)
}

/** 分腿排序键：按全仓统一的抵扣顺序（积分 → 储值 → 现金/线上），同序保持后端顺序。 */
function legRank(method) {
  return DEDUCTION_PRIORITY[method] ?? 9
}

/** 一笔收款的分腿（保持后端顺序，仅在抵扣除顺序上稳定排序；零金额后端已剔除）。 */
export function collectionLegs(collection) {
  const legs = Array.isArray(collection?.legs) ? collection.legs.slice() : []
  return legs
    .map((leg, index) => ({ ...leg, index }))
    .sort((a, b) => (legRank(a.method) - legRank(b.method)) || (a.index - b.index))
    .map(({ index, ...leg }) => leg)
}

/** 该单的收款方式摘要：去重后的方式名（按抵扣顺序），如「积分+储值+现金」；未收款 → 空串。 */
export function collectionMethodSummary(view, walletBrand) {
  if (!hasCollections(view)) return ''
  const seen = new Map()
  for (const collection of view.collections) {
    for (const leg of collectionLegs(collection)) {
      if (!seen.has(leg.method)) seen.set(leg.method, legRank(leg.method))
    }
  }
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([method]) => methodLabel(method, walletBrand))
    .join('+')
}

/** 是否组合支付（任一笔记账分腿 > 1）。 */
export function isCombinedPayment(view) {
  if (!hasCollections(view)) return false
  return view.collections.some((collection) => collection.combined === true
    || (Array.isArray(collection.legs) && collection.legs.length > 1))
}

/** 该单全部分腿按方式合并的金额（**只在单一币种下可用**；混币种返回空数组，禁止相加）。 */
export function mergedLegsByMethod(view) {
  if (!hasCollections(view) || view.mixedCurrency === true || !view.currencyCode) return []
  const totals = new Map()
  for (const collection of view.collections) {
    for (const leg of collectionLegs(collection)) {
      totals.set(leg.method, (totals.get(leg.method) || 0) + (Number(leg.amount) || 0))
    }
  }
  return [...totals.entries()]
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => legRank(a.method) - legRank(b.method))
}

/** 该单是否有退款记录（含审批中/被拒，运营需要看到全过程）。 */
export function hasRefunds(view) {
  return Boolean(view && Array.isArray(view.refunds) && view.refunds.length)
}

/** 金额渲染用的币种：混币种时不给币种（调用方必须逐笔用自己的币种快照）。 */
export function viewCurrency(view, fallback) {
  if (!view) return fallback
  if (view.mixedCurrency === true || !view.currencyCode) return fallback
  return view.currencyCode
}
