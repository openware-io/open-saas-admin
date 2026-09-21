/**
 * 日结汇总（`pay_daily_closing.summary_json` → `DailyClosingDto.summary`）的展示口径。
 *
 * 后端结构（common-payment-service `DailyClosingSummary`，**按币种分组**）：
 * ```json
 * { "businessDate":"2025-01-02", "storeId":2, "currencyCode":null, "mixedCurrency":true,
 *   "currencies":[{ "currencyCode":"CNY", "collectionCount":2, "collectedAmount":8000,
 *     "cashCount":1, "cashAmount":5000, "refundCount":1, "refundAmount":2000,
 *     "shiftCount":2, "shiftDifferenceAmount":60,
 *     "providers":[{ "provider":"ALIPAY", "count":1, "amount":3000 }] }] }
 * ```
 * 口径（`docs/standards/16_CURRENCY_CONVENTIONS.md` §5/§6）：
 *  - 金额一律**最小货币单位整数**，渲染只走 `utils/format` 的 `formatMoney`；
 *  - 单币种时顶层 `currencyCode` 有值；混币种时 `currencyCode=null` 且 `mixedCurrency=true`，
 *    调用方必须按 `currencies[].currencyCode` **逐组**渲染，禁止跨币种合计；
 *  - 历史行（本能力上线前从不写入汇总）与损坏结构的 `summary` 解析为 `null`：
 *    页面降级显示 {@link SUMMARY_UNAVAILABLE_TEXT}，不得整页报错。
 */
import { isMixedCurrency } from './currency-summary'

/** 历史 / 无法解析的汇总占位文案（降级展示，不报错、不显示空表）。 */
export const SUMMARY_UNAVAILABLE_TEXT = '暂无汇总（历史数据）'

/** 是否存在可渲染的日结汇总（null / 非对象 / 无分组一律视为历史数据）。 */
export function hasDailyClosingSummary(summary) {
  return !!summary
    && typeof summary === 'object'
    && Array.isArray(summary.currencies)
    && summary.currencies.length > 0
}

/** 汇总是否混币种（与其它聚合接口同一信封口径）。 */
export function isDailyClosingMixedCurrency(summary) {
  return hasDailyClosingSummary(summary) && isMixedCurrency(summary)
}

function toCount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/** 金额保持后端原值（可能是 0），只在缺失时归一为 null（渲染层 formatMoney 会显示 '—'）。 */
function toAmount(value) {
  return value === null || value === undefined || value === '' ? null : value
}

function toProviders(providers) {
  return (Array.isArray(providers) ? providers : []).map((line) => ({
    provider: line?.provider ?? '',
    count: toCount(line?.count),
    amount: toAmount(line?.amount),
  }))
}

/**
 * 归一成页面渲染用的币种分组（字段名与后端一致，缺失值有确定兜底）。
 * `summary` 为 null（历史数据）时返回空数组，页面据此显示「暂无汇总（历史数据）」。
 */
export function dailyClosingCurrencyGroups(summary) {
  if (!hasDailyClosingSummary(summary)) return []
  return summary.currencies.map((line) => ({
    currencyCode: line?.currencyCode ?? null,
    collectionCount: toCount(line?.collectionCount),
    collectedAmount: toAmount(line?.collectedAmount),
    cashCount: toCount(line?.cashCount),
    cashAmount: toAmount(line?.cashAmount),
    refundCount: toCount(line?.refundCount),
    refundAmount: toAmount(line?.refundAmount),
    shiftCount: toCount(line?.shiftCount),
    shiftDifferenceAmount: toAmount(line?.shiftDifferenceAmount),
    providers: toProviders(line?.providers),
  }))
}
