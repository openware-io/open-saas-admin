/**
 * 币种字典：全后台「货币符号 / 中文名 / 小数位 / 支持列表」的唯一出处。
 *
 * 口径见 `gv_im_server/docs/standards/16_CURRENCY_CONVENTIONS.md`：
 *  - 币种是**租户级唯一来源**（`tnt_tenant_config.currency`），取值 CNY / USD，**默认 USD**；
 *  - 金额在接口里一律是**最小货币单位**（CNY 分 / USD cent），不做汇率换算；
 *  - 符号表只能出现在本文件，业务代码不得再写 `¥` / `$` / `元` / `CNY` 字面量
 *    （测试与本文档除外，由 `utils/currency-guard.test.js` 守住）。
 *
 * 新增币种只需在 CURRENCY_DEFINITIONS 加一条 + 后端枚举加一项，页面零改动。
 */

/** 缺省币种（§1：租户未配置时即 USD，非法值也回落到它）。 */
export const DEFAULT_CURRENCY = 'USD'

/**
 * 币种定义表（单一来源）。
 * `digits` 是最小货币单位换算到主单位的小数位数（CNY 分 / USD cent 都是 2）。
 */
export const CURRENCY_DEFINITIONS = {
  CNY: { code: 'CNY', symbol: '¥', digits: 2, label: '人民币' },
  USD: { code: 'USD', symbol: '$', digits: 2, label: '美元' },
}

/** 支持的币种代码（唯一白名单，页面下拉与守卫都读它）。 */
export const SUPPORTED_CURRENCY_CODES = Object.keys(CURRENCY_DEFINITIONS)

/** 已 warn 过的未知币种：同一非法值只提示一次，避免列表渲染时刷屏。 */
const warnedCurrencyCodes = new Set()

/** 规范化币种代码（去空白 + 大写）；空值返回空串。 */
export function normalizeCurrencyCode(code) {
  return code === null || code === undefined ? '' : String(code).trim().toUpperCase()
}

/** 是否是支持的币种代码。 */
export function isSupportedCurrency(code) {
  return SUPPORTED_CURRENCY_CODES.includes(normalizeCurrencyCode(code))
}

/**
 * 未知币种只提示一次，不整页报错（§4：前端回退当前币种并记一条 console warn）。
 * 抽成函数便于测试静音（`__resetCurrencyWarnings`）与页面统一引用。
 */
export function warnUnknownCurrency(code) {
  const normalized = normalizeCurrencyCode(code)
  if (!normalized || warnedCurrencyCodes.has(normalized)) return
  warnedCurrencyCodes.add(normalized)
  console.warn(`[currency] 未知币种 ${normalized}，已回退到当前币种`)
}

/** 仅测试用：清空「已提示」记录。 */
export function __resetCurrencyWarnings() {
  warnedCurrencyCodes.clear()
}

/**
 * 解析币种代码：支持的代码原样返回；未知/为空返回 `fallback`（缺省 USD）。
 * 未知值会记一条 warn（不回退到英文原文，也不抛错）。
 */
export function resolveCurrencyCode(code, fallback = DEFAULT_CURRENCY) {
  const normalized = normalizeCurrencyCode(code)
  if (isSupportedCurrency(normalized)) return normalized
  if (normalized) warnUnknownCurrency(normalized)
  const normalizedFallback = normalizeCurrencyCode(fallback)
  return isSupportedCurrency(normalizedFallback) ? normalizedFallback : DEFAULT_CURRENCY
}

/** 币种定义（永不返回 null）：未知/为空回落到 `fallback` 对应的定义。 */
export function currencyMeta(code, fallback = DEFAULT_CURRENCY) {
  return CURRENCY_DEFINITIONS[resolveCurrencyCode(code, fallback)]
}

/** 货币符号；未知币种回落到 `fallback` 的符号。 */
export function currencySymbol(code, fallback = DEFAULT_CURRENCY) {
  return currencyMeta(code, fallback).symbol
}

/** 币种中文名（人民币 / 美元）；未知币种回落到 `fallback` 的中文名。 */
export function currencyLabel(code, fallback = DEFAULT_CURRENCY) {
  return currencyMeta(code, fallback).label
}

/** 最小货币单位小数位（CNY/USD 都是 2）。 */
export function currencyDigits(code, fallback = DEFAULT_CURRENCY) {
  return currencyMeta(code, fallback).digits
}

/** 币种选项列表（下拉用，与后端 `supported` 同结构）。 */
export function currencyOptions() {
  return SUPPORTED_CURRENCY_CODES.map((code) => ({ ...CURRENCY_DEFINITIONS[code] }))
}

/**
 * 后端 `supported` 字段 → 统一的选项列表。
 * 后端给了就用后端给的（含新增币种），否则回落到本地字典；两者都保持 {code,symbol,label} 结构。
 */
export function parseSupportedCurrencies(supported) {
  const list = Array.isArray(supported) ? supported : []
  const parsed = list
    .map((item) => {
      const code = normalizeCurrencyCode(item && (item.code || item.currencyCode))
      if (!isSupportedCurrency(code)) return null
      const meta = CURRENCY_DEFINITIONS[code]
      return {
        code,
        symbol: (item && item.symbol) || meta.symbol,
        label: (item && item.label) || meta.label,
        digits: Number.isFinite(Number(item && item.minorUnitDigits)) ? Number(item.minorUnitDigits) : meta.digits,
      }
    })
    .filter(Boolean)
  const seen = new Set(parsed.map((item) => item.code))
  for (const option of currencyOptions()) {
    if (!seen.has(option.code)) parsed.push(option)
  }
  return parsed
}
