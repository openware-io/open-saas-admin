import { formatMoney } from './format'

/**
 * 包厢「生效房费单价」的展示口径（与后端 KtvPricingPlan.forRoomType / /business/ktv/pricing 同源）。
 *
 * 后端取值顺序固定为「房型字典单价（res_room_type.unit_price） > 计价方案按房型单价
 * （tnt_pricing_plan.unit_price_by_room_type[房型编码]） > 门店级单价（plan.roomUnitPrice）」。
 * 看板卡片在门店级方案（一次请求，带 unitPriceByRoomType 映射）+ 资源行上的房型单价/编码
 * 即可算出同一结果，无需按包厢逐个再请求一次计价接口；
 * 打开详情时可用带 resourceId 的 /business/ktv/pricing 结果覆盖（那里直接给 roomTypePriceApplied）。
 *
 * 返回的 priceApplied 与后端 roomTypePriceApplied 同口径：房型未指定时为 false，
 * 指定房型但两个来源都没定价时也为 false（即「未定价，回退门店单价」）。
 */

/** 计费单位 → 展示后缀（与后端 displayText 同口径，避免各页面各写一套）。 */
export const BILLING_UNIT_LABEL = { HOUR: '/小时', HALF_HOUR: '/半小时', PACKAGE: '/套餐' }

/** 非负数值（金额最小单位整数，含 0）；非法/缺失返回 null。 */
function nonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

/** 正数（<= 0 视为「未定价」）；非法/缺失返回 null。 */
function positiveNumber(value) {
  const number = nonNegativeNumber(value)
  return number !== null && number > 0 ? number : null
}

/** 去空白后的非空串；否则 null。 */
function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * 补上「服务单价 + 合计单价」（分项与合计），与后端 KtvPricingPlan 同一口径：
 * {@code serverUnitPrice} 是每计费单位的服务单价（后端由 res_room_type.server_unit_price 推导，
 * 缺省回退门店级/方案值），{@code combinedUnitPrice = 房型单价 + 服务单价}。
 * 后端口径的回退顺序与房费一致：房型字典值 > 门店级/方案值（KtvPricingPlan.forRoomType）。
 * 合计由本函数按最终生效的两个单价相加得出；仅在服务端整包给了自洽的三元组
 * （{@link roomPriceFromPricing}）时才直接采用服务端 combinedUnitPrice。
 */
function withCombinedPrice(resolved, serverUnitPrice, backendCombined) {
  const server = nonNegativeNumber(serverUnitPrice) ?? 0
  const combined = positiveNumber(backendCombined)
  return {
    ...resolved,
    serverUnitPrice: server,
    combinedUnitPrice: combined ?? (resolved.unitPrice == null ? null : resolved.unitPrice + server),
  }
}

/**
 * 解析包厢生效房费单价。
 * @param {object} input
 * @param {object|null} input.plan 门店级计价方案（/business/ktv/pricing 不带 resourceId 的响应）
 * @param {string|null} input.roomTypeCode 资源房型编码
 * @param {string|null} input.roomTypeName 资源房型名称（仅用于文案）
 * @param {number|string|null} input.roomTypeUnitPrice 资源房型字典单价（最小货币单位/计费单位）
 * @param {number|string|null} input.roomTypeServerUnitPrice 资源房型字典服务单价（最小货币单位/计费单位）
 */
export function resolveRoomPrice({ plan, roomTypeCode, roomTypeName, roomTypeUnitPrice, roomTypeServerUnitPrice } = {}) {
  const billingUnit = plan?.billingUnit || null
  const storePrice = nonNegativeNumber(plan?.roomUnitPrice)
  // 门店级/方案的服务单价（每计费单位）：房型字典没给服务单价时回退到它（与后端 forRoomType 同序）。
  const storeServerPrice = nonNegativeNumber(plan?.serverUnitPrice) ?? 0
  const code = textOrNull(roomTypeCode)
  // 单据/方案自带币种快照时随结果带出，展示时优先于全局币种（§3.5「快照优先」）。
  const currencyCode = textOrNull(plan?.currencyCode)
  if (!code) {
    // 未指定房型：门店级单价与门店级服务单价配对，合计按两者相加。
    return withCombinedPrice(
      { unitPrice: storePrice, priceApplied: false, roomTypeCode: null, roomTypeName: null, billingUnit, currencyCode },
      storeServerPrice,
    )
  }
  const planPrice = positiveNumber(plan?.unitPriceByRoomType?.[code])
  const dictionaryPrice = positiveNumber(roomTypeUnitPrice)
  const dictionaryServerPrice = positiveNumber(roomTypeServerUnitPrice)
  return withCombinedPrice({
    unitPrice: dictionaryPrice ?? planPrice ?? storePrice,
    priceApplied: dictionaryPrice !== null || planPrice !== null,
    roomTypeCode: code,
    roomTypeName: textOrNull(roomTypeName) || code,
    billingUnit,
    currencyCode,
  }, dictionaryServerPrice ?? storeServerPrice)
}

/**
 * 服务端带 resourceId 的计价响应 → 与 resolveRoomPrice 相同的结构。
 * 这里直接用服务端的生效单价、服务单价与 roomTypePriceApplied，页面不再自行推断。
 */
export function roomPriceFromPricing(plan) {
  if (!plan || plan.roomUnitPrice == null) return null
  return withCombinedPrice({
    unitPrice: nonNegativeNumber(plan.roomUnitPrice),
    priceApplied: plan.roomTypePriceApplied === true,
    roomTypeCode: textOrNull(plan.appliedRoomTypeCode),
    roomTypeName: textOrNull(plan.appliedRoomTypeName),
    billingUnit: plan.billingUnit || null,
    currencyCode: textOrNull(plan.currencyCode),
  }, plan.serverUnitPrice, plan.combinedUnitPrice)
}

/**
 * 「基础房费」文案：与 C 端 / 结台同一口径（包间费 = 房型单价 + 服务单价，已含 1 名标准服务人员）。
 * 后端已返回服务分项时按「房型 + 服务 = 合计」展示，缺分项（服务单价缺失/为 0）时退回原样；
 * 房型生效时标注「房型「X」生效单价」，房型未定价时标注「未定价，回退门店单价」。
 * 金额一律走 utils/format 的 formatMoney（符号取自当前币种），页面不得自行换算、不得自造货币符号。
 */
export function roomBasePriceText(resolved) {
  if (!resolved || resolved.unitPrice == null) return '基础房费待配置'
  const unit = BILLING_UNIT_LABEL[resolved.billingUnit] || ''
  const server = nonNegativeNumber(resolved.serverUnitPrice) ?? 0
  const combined = nonNegativeNumber(resolved.combinedUnitPrice) ?? (resolved.unitPrice + server)
  const text = server > 0
    ? `基础房费 房型 ${formatMoney(resolved.unitPrice, resolved.currencyCode)} + 服务 ${formatMoney(server, resolved.currencyCode)} = ${formatMoney(combined, resolved.currencyCode)}${unit}（含 1 名服务人员）`
    : `基础房费 ${formatMoney(resolved.unitPrice, resolved.currencyCode)}${unit}`
  if (!resolved.roomTypeCode) return text
  const roomType = resolved.roomTypeName || resolved.roomTypeCode
  return resolved.priceApplied
    ? `${text} · 房型「${roomType}」生效单价`
    : `${text} · 房型「${roomType}」未定价，回退门店单价`
}
