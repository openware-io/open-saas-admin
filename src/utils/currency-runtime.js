/**
 * 当前币种的运行时持有者（叶子模块，只依赖 vue + constants/currency）。
 *
 * 为什么单独一个文件：`formatMoney`（utils/format）、全局 store（stores/currency）与
 * axios 拦截器（api/request，网关 `X-Currency` 兜底）都要读写同一个当前币种，
 * 把它放在这里可避免 `request ↔ stores` 的循环依赖。
 *
 * 口径（§2/§4）：全站只此一份；页面不得各请求一套、不得各存一个币种。
 */
import { ref } from 'vue'
import {
  DEFAULT_CURRENCY,
  currencyMeta,
  currencyOptions,
  isSupportedCurrency,
  normalizeCurrencyCode,
  warnUnknownCurrency,
} from '@/constants/currency'

/** 当前币种代码（唯一响应式来源）。 */
const activeCurrencyCode = ref(DEFAULT_CURRENCY)
const activeSupported = ref(currencyOptions())

/** 当前币种代码（formatMoney 缺省参数与页面展示都读它）。 */
export function currentCurrencyCode() {
  return activeCurrencyCode.value
}

/** 当前币种定义 `{code,symbol,digits,label}`。 */
export function currentCurrencyMeta() {
  return currencyMeta(activeCurrencyCode.value)
}

/** 当前币种中文名（人民币 / 美元）——需要中文单位时的唯一出处。 */
export function currentCurrencyLabel() {
  return currentCurrencyMeta().label
}

/** 当前货币符号。 */
export function currentCurrencySymbol() {
  return currentCurrencyMeta().symbol
}

/** 当前租户支持的币种列表（后端 supported 优先，缺省本地字典）。 */
export function currentSupportedCurrencies() {
  return activeSupported.value
}

/** 整体替换支持的币种列表（结构 `{code,symbol,label,digits}`）；空值回落本地字典。 */
export function setSupportedCurrencies(options) {
  activeSupported.value = Array.isArray(options) && options.length ? options : currencyOptions()
}

/**
 * 当前币种是否已由**权威来源**写入（context select 响应体 / 币种接口 GET / PUT）。
 * 权威值一旦写入，网关注入的 `X-Currency` 只能作为「还没拿到权威值」时的兜底，不得反向覆盖，
 * 否则刚在「币种」设置里保存的值会被旧上下文 token 的响应头改回去。
 */
let authoritative = false
/** 最近一次网关注入的币种（§3.4 老接口兜底），响应体缺币种时用它而不是直接回落 USD。 */
let gatewayCurrency = ''

/**
 * 写入当前币种（登录 / 上下文切换 / 币种设置保存后调用）。
 *  - 空值：优先用网关注入的 `X-Currency`，都没有才按 §1 缺省 USD；
 *  - 非法值：保留当前币种并记一条 warn（§4，不整页报错），返回当前币种；
 *  - 合法值：立即生效（响应式）并标记为权威值，返回该代码。
 */
export function setCurrency(code) {
  const normalized = normalizeCurrencyCode(code)
  if (!normalized) {
    activeCurrencyCode.value = gatewayCurrency || DEFAULT_CURRENCY
    return activeCurrencyCode.value
  }
  if (!isSupportedCurrency(normalized)) {
    warnUnknownCurrency(normalized)
    return activeCurrencyCode.value
  }
  activeCurrencyCode.value = normalized
  authoritative = true
  return normalized
}

/**
 * 老接口兜底：网关注入的 `X-Currency` 响应头。
 * 只接受支持的币种，非法值静默忽略（响应头兜底不该刷提示，更不该整页报错）；
 * 已经有权威值时只记录不覆盖。
 */
export function applyGatewayCurrency(code) {
  const normalized = normalizeCurrencyCode(code)
  if (!isSupportedCurrency(normalized)) return false
  gatewayCurrency = normalized
  if (!authoritative) activeCurrencyCode.value = normalized
  return true
}

/** 仅测试用：恢复出厂状态（USD + 本地字典，无权威值/无网关兜底）。 */
export function resetCurrencyRuntime() {
  activeCurrencyCode.value = DEFAULT_CURRENCY
  activeSupported.value = currencyOptions()
  authoritative = false
  gatewayCurrency = ''
}
