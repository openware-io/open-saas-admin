/**
 * 「币种信封」的统一口径 —— 纯函数，日结汇总 / 库存成本 / 毛利报表三处共用。
 *
 * 后端聚合接口（日结 `summary`、`/admin/inventory/costs`、`/admin/reports/inventory-gross-profit`）
 * 一律给同一个信封：
 *  - 单币种：顶层 `currencyCode` 有值、`mixedCurrency=false`；
 *  - 混币种：顶层 `currencyCode=null`、`mixedCurrency=true`，金额只散在按币种分组的行里。
 *
 * 混币种时**跨行相加没有汇率依据**，等于把两种货币当成一种货币求和（§3.5/§6），
 * 因此合计入口统一收敛到 {@link sumMinorAmounts}：混币种一律返回 null，调用方据此**不渲染合计行**。
 * 金额一律最小货币单位整数，本文件只做加总，不做任何分/元或汇率换算。
 */

/** 混币种提示文案（日结 / 库存成本 / 毛利报表共用同一句，避免各处措辞漂移）。 */
export const MIXED_CURRENCY_NOTICE = '多币种，禁止合计'

/** 信封是否混币种（以后端 `mixedCurrency` 标记为唯一判据）。 */
export function isMixedCurrency(envelope) {
  return !!envelope && envelope.mixedCurrency === true
}

/** 混币种时禁止把多行金额相加（合计行/汇总卡片都必须先问它）。 */
export function canAggregateAmounts(envelope) {
  return !isMixedCurrency(envelope)
}

/**
 * 合计金额（最小货币单位整数）：混币种返回 `null`（禁止相加），单币种返回各行 `prop` 之和。
 *
 * @param {Array<object>} rows 报表/库存成本行
 * @param {string} prop 参与合计的字段名（如 `revenueAmount` / `inventoryCost`）
 * @param {object} envelope 币种信封（含 `mixedCurrency` / `currencyCode`）
 * @returns {number|null} 合计值；`null` 表示「本信封下不允许合计」
 */
export function sumMinorAmounts(rows, prop, envelope) {
  if (!canAggregateAmounts(envelope)) return null
  const list = Array.isArray(rows) ? rows : []
  let total = 0
  for (const row of list) {
    const value = Number(row?.[prop])
    if (Number.isFinite(value)) total += value
  }
  return total
}
