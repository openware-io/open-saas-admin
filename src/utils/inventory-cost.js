/**
 * 库存成本 / 入库单价的展示口径 —— 纯函数，库存页与单测共用。
 *
 * 后端口径（gv_im_server order 域，V24 + `InventoryApplicationService`）：
 *  - 入库/调整入参 `unitCost` = **本次入库批次单价**（最小货币单位/计量单位，与 `purchasePrice` 同口径）；
 *    可空：null 或 0 表示未填（沿用物料采购价 `purchase_price`），显式 > 0 优先参与移动加权平均；
 *  - 库存流水每行新增 `unitCost` / `totalCost`（带符号：入库正、出库负）/ `currencyCode`；
 *    升级前的历史行 `unit_cost`/`total_cost` 为 NULL（当时没采集批次单价，不用 0 冒充真实成本）；
 *  - `GET /admin/inventory/costs`：库存成本 = 结存数量 × 移动加权平均成本，按门店/物料/币种，
 *    信封 `currencyCode`（单币种）/ `mixedCurrency`（混币种时禁止求和）。
 *
 * 这里只负责「表单主单位 → 最小货币单位」「金额单元格 → 展示串」两件事；
 * 金额展示一律走 `utils/format` 的 `formatMoney`，本文件不做第二套换算。
 */
import { formatMoney, yuanToFen } from './format'
import { canAggregateAmounts, isMixedCurrency, sumMinorAmounts } from './currency-summary'

export { canAggregateAmounts, isMixedCurrency, sumMinorAmounts }

/** 历史流水没有成本信息时的占位（NULL 表示「该行无成本信息」，不显示 0）。 */
export const COST_UNAVAILABLE_TEXT = '—'

/**
 * 「本次入库单价」（主单位，如 12.34）→ 最小货币单位整数（1234）。
 * 留空（null / undefined / 空串）返回 `null`，调用方据此**不提交** `unitCost` 字段
 * （后端未收到该字段即沿用物料采购价）；显式填 0 返回 0（后端同样按「沿用采购价」处理）。
 */
export function receiptUnitCostFen(yuan) {
  if (yuan === null || yuan === undefined || yuan === '') return null
  return yuanToFen(yuan)
}

/**
 * 组装入库/调整请求体：把表单里的 `unitCostYuan` 摘出来换算，留空时**不出现** `unitCost` 键。
 * 不能提交 `unitCost: null`——那是「显式未填」而不是「沿用采购价」的语义边界，少一个字段更不容易越权覆盖。
 */
export function withReceiptUnitCost(payload, yuan) {
  const { unitCostYuan, ...rest } = payload || {}
  const fen = receiptUnitCostFen(yuan === undefined ? unitCostYuan : yuan)
  return fen === null ? rest : { ...rest, unitCost: fen }
}

/**
 * 流水/库存成本的金额单元格：历史行（null/undefined/空串）显示占位符，否则走 `formatMoney`
 * 并按行内币种快照渲染符号（改设置不改历史）。
 */
export function costCellText(value, currencyCode) {
  if (value === null || value === undefined || value === '') return COST_UNAVAILABLE_TEXT
  return formatMoney(value, currencyCode)
}
