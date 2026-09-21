// 支付方式目录（与后端 PaymentMethodApplicationService.CATALOG 一致）
import { WALLET_BRAND_NAME_DEFAULT, unknownEnumText } from './terms'
import { currencyText, fenToYuan, formatCount, formatMoney, formatPoints, formatTokens, minorToTokens, tokensToMinor, yuanToFen } from '@/utils/format'

export const PAYMENT_METHODS = [
  { method: 'CASH', name: '现金', category: 'cash' },
  { method: 'WALLET', name: '储值', category: 'wallet' },
  { method: 'POINT', name: '积分', category: 'point' },
  { method: 'ALIPAY', name: '支付宝', category: 'online' },
  { method: 'WECHAT', name: '微信支付', category: 'online' },
  { method: 'STRIPE', name: 'Stripe', category: 'online' },
]

export const CATEGORY_TEXT = { cash: '现金', wallet: '储值', point: '积分', online: '线上' }

/** 支付方式分类：未知分类回落「未知（CODE）」，不把后端英文分类码透到界面。 */
export function paymentCategoryText(category) {
  return CATEGORY_TEXT[category] || unknownEnumText(category)
}

// —— 收银展示口径（KTV_BUSINESS_01 §7.2 / SAAS_PLATFORM_06 组合收款舍入口径）——
// 抵扣顺序固定「积分 → 储值 → 现金/线上补差额」；储值是品牌展示名，
// 取租户配置 tnt_tenant_config.wallet_brand_name，默认值与缺配置兜底
// 统一在 constants/terms.js（WALLET_BRAND_NAME_DEFAULT / resolveWalletBrandName），不得硬编码。

export const METHOD_LABELS = {
  CASH: '现金', POINT: '积分', ALIPAY: '支付宝', WECHAT: '微信支付', STRIPE: 'Stripe',
}

export const DEDUCTION_PRIORITY = { POINT: 0, WALLET: 1, CASH: 2, ALIPAY: 2, WECHAT: 2, STRIPE: 2 }

/** WALLET 的展示名必须由调用方传入（来自租户配置），缺省也只用 constants/terms 的默认品牌名。 */
export function methodLabel(method, walletBrand = WALLET_BRAND_NAME_DEFAULT) {
  if (method === 'WALLET') return walletBrand
  // 后端新增/下线的支付方式：映射不到时回落「未知（CODE）」，不展示英文枚举原文。
  return METHOD_LABELS[method] || unknownEnumText(method)
}

/** 按抵扣顺序排列后台已授权（tenantAllowed）的支付方式。 */
export function orderAllowedMethods(methods) {
  return (Array.isArray(methods) ? methods : [])
    .filter((item) => item.tenantAllowed)
    .slice()
    .sort((a, b) => (DEDUCTION_PRIORITY[a.method] ?? 9) - (DEDUCTION_PRIORITY[b.method] ?? 9))
}

// —— 组合支付分腿的输入口径（代币 / 积分不是货币）——
// 现金 / 线上分腿是**金额**（主单位输入，提交最小货币单位）；
// 储值币 / 积分分腿是**数量**（储值币个数按租户 ratio 折回金额，积分就是个 1:1 的个数），
// 但 `payments[].amount` 提交给服务端时恒为最小货币单位整数：
//  - 服务端 `CollectApplicationService` 对 POINT 腿按**积分个数**核销、对 WALLET 腿按**最小货币单位**扣减，
//    两者都要满足 `amount ≤ 剩余应收`，因此「合计 = 应收」的校验必须按折算后的金额做；
//  - 折算只发生在展示与合计口径，入账口径不变（16_CURRENCY_CONVENTIONS §9 硬约束）。

/** 分腿输入是否按数量（储值币 / 积分）：页面据此切换「数量」与「金额」的提示与精度。 */
export function isQuantityLeg(method) {
  return method === 'WALLET' || method === 'POINT'
}

/** 数量腿的精度（个数无小数），金额腿保留两位小数。 */
export function legInputPrecision(method) {
  return isQuantityLeg(method) ? 0 : 2
}

/** 数量腿按「个」递增（与移动端 `legInputStep` 一致，均为 1 个），金额腿按主单位递增。 */
export function legInputStep(method) {
  return isQuantityLeg(method) ? 1 : 10
}

/** 分腿输入值 → 最小货币单位整数（页内合计与提交的唯一换算入口）。 */
export function legInputToMinor(method, value, walletRatio) {
  if (method === 'WALLET') return tokensToMinor(value, walletRatio)
  // 积分就是个数（1:1 不换算），服务端按同一个数核销积分。
  if (method === 'POINT') return countOf(value)
  return yuanToFen(value)
}

/** 可用金额 / 可用数量 → 分腿输入值（legInputToMinor 的逆运算，供自动抵扣回填）。 */
export function legMinorToInput(method, minor, walletRatio) {
  if (method === 'WALLET') return minorToTokens(minor, walletRatio)
  if (method === 'POINT') return countOf(minor)
  return fenToYuan(minor)
}

/** 个数取整（空值/非法值按 0，避免把 NaN 填进输入框）。 */
function countOf(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : 0
}

/**
 * 已收分腿 → 展示串：现金 / 线上是「金额（带币种）」，储值币 / 积分是「数量」（纯数字，不带单位）。
 * 服务端 `collectedByMethod[].amount` 的口径：WALLET 是最小货币单位金额、
 * POINT 是积分个数（服务端按同一个数核销积分），其余渠道是金额。
 * 数量串里不拼品牌名 / 「积分」（名字由支付方式列与调用方的标签承担），金额串才带币种符号。
 */
export function collectedLegText(leg, walletBrand, walletRatio, currencyCode) {
  if (leg?.method === 'WALLET') return formatTokens(minorToTokens(leg.amount, walletRatio))
  if (leg?.method === 'POINT') return formatPoints(leg.amount)
  return `${methodLabel(leg?.method, walletBrand)} ${formatMoney(leg?.amount, currencyCode)}`
}

// —— 支付流水 / 日结明细的「值」列口径（现金按金额，储值币 / 积分按数量）——
// 与分腿输入同一套模型：储值币与积分是**代币 / 个数**，值里只出数量、不带任何单位
// （支付方式的展示名与列头已经写明是哪一个），只有现金 / 线上才带币种符号。

/** 记录 / 分腿上的支付方式码（兼容 `method` / `paymentMethod` / `provider` 三种字段名）。 */
export function recordMethod(record) {
  return record?.method || record?.paymentMethod || record?.provider || ''
}

/** 「值」口径：储值币 / 积分是数量（不带单位），其余（现金 / 线上）是金额（带币种符号）。 */
export function isCountMethod(method) {
  return method === 'WALLET' || method === 'POINT'
}

/**
 * 支付流水 / 日结明细里的「值」→ 展示串（值列的唯一入口）：
 *  - 现金 / 线上：{@link formatMoney}（符号 + 金额，如 `$123.45`）；
 *  - 储值币（WALLET）：记录里的 `amount` 是**最小货币单位**金额，按租户 `wallet_ratio`
 *    折成代币**个数**后只显示数量（`3,000`）；
 *  - 积分（POINT）：记录里的 `amount` 就是积分个数（1:1，不乘比例），只显示数量（`700`）。
 *
 * 数量串**不带任何单位**（品牌名与「积分」在支付方式 / 列头里），换算只用于展示，
 * 入账与对账口径不变（16_CURRENCY_CONVENTIONS §9 硬约束：金额恒为最小货币单位整数）。
 */
export function paymentValueText(record, walletRatio, currencyCode) {
  const method = recordMethod(record)
  if (method === 'WALLET') return formatCount(minorToTokens(record?.amount, walletRatio))
  if (method === 'POINT') return formatCount(record?.amount)
  return formatMoney(record?.amount, currencyCode)
}

/** 值列的标签：数量腿（储值币 / 积分）叫「数量」，金额腿叫「金额」。 */
export function paymentValueLabel(record, moneyLabel = '支付金额', countLabel = '支付数量') {
  return isCountMethod(recordMethod(record)) ? countLabel : moneyLabel
}

/**
 * 记录的币种列：储值币 / 积分是数量口径，没有币种单位可言 → 占位符；
 * 现金 / 线上仍按快照优先展示币种（缺快照回落当前全局币种）。
 */
export function recordCurrencyText(record, fallbackCode) {
  if (isCountMethod(recordMethod(record))) return '—'
  return currencyText(record?.currencyCode || fallbackCode)
}
