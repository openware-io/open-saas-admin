/**
 * 全后台统一的展示口径（i18n 一致性）：
 *  - 金额一律「符号 + 金额」（`¥100.00` / `$100.00`），最小货币单位只落库，
 *    进入本文件前必须是最小货币单位整数；换算与符号见 constants/currency 与 utils/currency-runtime；
 *  - 储值币（代币）与积分**不是货币**：只显示数量，走 formatTokens / formatPoints，
 *    不得套货币符号或币种，页面也不得对代币数量调用 formatMoney；
 *  - 时间一律走 formatTime（YYYY-MM-DD HH:mm），不再各页面自行 slice；
 *  - 币种、优惠类型等枚举一律转简体中文，界面上不出现英文枚举原文。
 *  - 术语/状态词表见 `@/constants/terms`；本文件只负责「值 → 展示串」的格式化。
 *
 * 币种口径见 `gv_im_server/docs/standards/16_CURRENCY_CONVENTIONS.md`：
 * 金额展示的唯一入口是 {@link formatMoney}，页面不得自行 `÷100`/`×100`、不得自造货币符号；
 * 已结算单据/流水带 `currencyCode` 快照时以快照为准（把记录上的币种作为第二个参数传入）。
 */
import {
  DEFAULT_CURRENCY,
  currencyLabel,
  currencyMeta,
  resolveCurrencyCode,
} from '@/constants/currency'
import { resolveWalletBrandName } from '@/constants/terms'
import { currentCurrencyCode } from '@/utils/currency-runtime'

/** 空值/非法值的统一占位符。 */
const PLACEHOLDER = '—'

/** 1 个主单位 = 100 个最小货币单位（CNY 分 / USD cent，均为 2 位小数）。 */
export const MINOR_UNITS_PER_MAJOR = 100

/** 后端时间串统一成 `YYYY-MM-DD HH:mm(:ss)` 的中间形态；空值/非法值返回空串。 */
function normalizeTimeText(value) {
  if (value === null || value === undefined || value === '') return ''
  return String(value).trim().replace('T', ' ')
}

/** 本地时钟（Date / 毫秒时间戳）→ `YYYY-MM-DD HH:mm:ss`（本地时区）；非法值返回空串。 */
function localClockText(value) {
  const date = value instanceof Date ? value : new Date(Number(value))
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 统一时间格式：`YYYY-MM-DD HH:mm`；空值/非法值返回 '—'。 */
export function formatTime(value) {
  const text = normalizeTimeText(value)
  if (!text) return '—'
  return text.length > 16 ? text.slice(0, 16) : text
}

/**
 * 与 formatTime 同口径但保留秒：`YYYY-MM-DD HH:mm:ss`；空值/非法值返回 '—'。
 * 兼收本地时钟（Date / 毫秒时间戳），供「最后同步」这类前端自己产生的时间使用，
 * 页面不得再调 toLocaleTimeString（依赖运行环境 locale）。
 */
export function formatTimeWithSeconds(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (value instanceof Date || typeof value === 'number') return localClockText(value) || '—'
  const text = normalizeTimeText(value)
  if (!text) return '—'
  return text.length > 19 ? text.slice(0, 19) : text
}

// —— 金额 ————————————————————————————————————————————————————————————

/**
 * 解析一次金额的展示口径：币种定义（符号/小数位）+ 主单位数值。
 * `currency` 缺省用全局当前币种；未知值回退当前币种（constants/currency 会记一条 warn）。
 */
function resolveMoney(minor, currency) {
  const number = Number(minor)
  if (!Number.isFinite(number)) return null
  const fallback = currentCurrencyCode() || DEFAULT_CURRENCY
  const resolved = resolveCurrencyCode(currency || fallback, fallback)
  const meta = currencyMeta(resolved, fallback)
  const digits = Number.isFinite(meta.digits) ? meta.digits : 2
  return { meta, digits, major: number / 10 ** digits }
}

/**
 * 最小货币单位 → `¥100.00` / `$100.00`（§4，全后台金额展示的唯一入口）。
 *  - 负数：`-¥100.00`；0：`¥0.00`；大额千分位：`¥1,234,567.89`；
 *  - 空值/非法值返回 '—'（不会出现 `¥NaN`）；
 *  - `currency` 缺省用全局当前币种（store）；已结算单据/流水请传记录上的 `currencyCode` 快照。
 */
export function formatMoney(minor, currency) {
  if (minor === null || minor === undefined || minor === '') return PLACEHOLDER
  const money = resolveMoney(minor, currency)
  if (!money) return PLACEHOLDER
  const text = Math.abs(money.major).toLocaleString('zh-CN', {
    minimumFractionDigits: money.digits,
    maximumFractionDigits: money.digits,
  })
  return `${money.major < 0 ? '-' : ''}${money.meta.symbol}${text}`
}

/** 与 formatMoney 同口径（金额始终带千分位），保留旧名避免调用点两套写法。 */
export function formatMoneyCompact(minor, currency) {
  return formatMoney(minor, currency)
}

/** 已经是主单位（元/美元）的数值 → `¥12.00`；空值/非法值返回 '—'。 */
export function formatMoneyValue(major, currency) {
  if (major === null || major === undefined || major === '') return PLACEHOLDER
  const number = Number(major)
  if (!Number.isFinite(number)) return PLACEHOLDER
  const fallback = currentCurrencyCode() || DEFAULT_CURRENCY
  const meta = currencyMeta(resolveCurrencyCode(currency || fallback, fallback), fallback)
  const digits = Number.isFinite(meta.digits) ? meta.digits : 2
  const text = Math.abs(number).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${number < 0 ? '-' : ''}${meta.symbol}${text}`
}

// —— 代币（储值币）与积分：数量口径，不是货币 ——————————————————————————
/**
 * 储值代币（A380 币等租户自定义品牌）与积分**不是货币**
 * （`gv_im_server/docs/standards/16_CURRENCY_CONVENTIONS.md` §9）：
 *  - 只有现金与价格带币种，展示一律走 {@link formatMoney}（缺省 USD）；
 *  - 储值币 / 积分是组合支付里的**支付工具**，界面只显示数量，
 *    不得出现货币符号、币种名或「元」；
 *  - 数量展示的唯一入口是本节的 {@link formatTokens} / {@link formatPoints}，
 *    页面不得对代币数量 / 积分调用 formatMoney；
 *  - `tokenRatio` 只用于**展示折算**，禁止参与入账 / 扣减 / 对账计算（§9 硬约束），
 *    落库金额恒为最小货币单位整数。
 */
export const WALLET_TOKEN_DEFAULT_RATIO = 100

/** 租户「1 个主单位 = N 个代币」比例：空值/非法值/非正数回落默认值（不抛错、不出现 0 除）。 */
export function resolveTokenRatio(ratio) {
  const number = Number(ratio)
  return Number.isFinite(number) && number > 0 ? number : WALLET_TOKEN_DEFAULT_RATIO
}

/** 数量类字段解析：空值/非法值返回 null（由调用方决定是回落占位符还是按 0 处理）。 */
function parseCount(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** 主单位金额 → 代币数量（1 主单位 = ratio 个代币），四舍五入取整；只用于展示。 */
export function majorToTokens(major, ratio) {
  const number = parseCount(major)
  if (number === null) return 0
  return Math.round(number * resolveTokenRatio(ratio))
}

/** 最小货币单位金额 → 代币数量；余额 / 流水在服务端没给 tokenAmount 时的降级换算入口。 */
export function minorToTokens(minor, ratio) {
  const number = parseCount(minor)
  if (number === null) return 0
  return majorToTokens(number / MINOR_UNITS_PER_MAJOR, ratio)
}

/** 代币数量 → 主单位金额（majorToTokens 的逆运算），用于退还 / 收银把数量折回金额。 */
export function tokensToMajor(tokens, ratio) {
  const number = parseCount(tokens)
  if (number === null) return 0
  return number / resolveTokenRatio(ratio)
}

/** 代币数量 → 最小货币单位整数（四舍五入）；提交给服务端的金额仍是最小货币单位。 */
export function tokensToMinor(tokens, ratio) {
  return Math.round(tokensToMajor(tokens, ratio) * MINOR_UNITS_PER_MAJOR)
}

/**
 * 钱包记录 → 代币数量：服务端算好的 `tokenAmount` 优先，
 * 字段缺失（老接口 / 未发布）时按「金额 ÷ 100 × 租户比例」在同一页降级换算，取整；
 * ratio 缺失回落默认 100，字段全缺按 0 处理（不崩、也不会显示成货币）。
 */
export function resolveTokenCount(tokenAmount, amountMinor, ratio) {
  const fromServer = parseCount(tokenAmount)
  if (fromServer !== null) return Math.round(fromServer)
  return minorToTokens(amountMinor, ratio)
}

/** 代币品牌名：钱包记录上的 `tokenBrandName` 优先，缺省用页面已取到的租户配置 / 默认品牌名。 */
export function resolveTokenBrand(tokenBrandName, fallbackBrandName) {
  const fromServer = typeof tokenBrandName === 'string' ? tokenBrandName.trim() : ''
  if (fromServer) return fromServer
  return resolveWalletBrandName({ brandName: fallbackBrandName })
}

/**
 * 代币数量 → `1,000`：千分位整数，**不拼任何单位**（与 {@link formatPoints} 同一口径）。
 *
 * 储值币 / 积分只是一种代币 / 个数（§9）：只有现金与价格带币种单位，这两者连品牌名 /
 * 「积分」也不拼在值上——名字由支付方式、列头、表单标签与卡片标题承担，
 * 值里只出数字，既不出现货币符号 / 币种 / 「元」，也不出现品牌名 /「个」。
 * 空值 / 非法值回落占位符；负数（冲正 / 反向流水）保留负号。
 */
export function formatTokens(tokenCount) {
  return formatCount(tokenCount)
}

/**
 * 代币数量 / 积分个数 → `1,000`：千分位整数，**不拼任何单位**。
 *
 * 储值币与积分只是一种代币 / 个数（§9）：只有现金与价格带币种单位，而这两者的名字
 * 已经写在支付方式、列头或卡片标题里，值里不再重复品牌名 / 「积分」这类后缀。
 * {@link formatTokens} / {@link formatPoints} 与它是同一口径（保留旧名，
 * 调用点仍能读出「这是代币 / 积分的数量」）。
 * 空值 / 非法值回落占位符；负数（冲正 / 反向流水）保留负号。
 */
export function formatCount(value) {
  const count = parseCount(value)
  if (count === null) return PLACEHOLDER
  const rounded = Math.round(count)
  const text = Math.abs(rounded).toLocaleString('zh-CN')
  return `${rounded < 0 ? '-' : ''}${text}`
}

/**
 * 积分数量 → `300`：千分位整数，**不拼任何单位**（积分就是个数，1:1 不换算）。
 * 与 {@link formatTokens} 同一口径：`积分` 两个字只出现在列头 / 标签里。
 * 空值 / 非法值回落占位符；负数（冲正 / 反向流水）保留负号。
 */
export function formatPoints(count) {
  return formatCount(count)
}

// —— 比例与数量 ——————————————————————————————————————————————————————

/**
 * 比例 → 百分比的倍数（0.92 → 92）。
 * 具名常量而不是字面量：金额/比例换算只能有一处口径，也不能被源码守卫误当成手写金额换算。
 */
export const PERCENT_SCALE = 100

/** 数量展示的小数位上限，与库存 decimal(20,6) / 成本 scale=6 对齐。 */
export const QUANTITY_SCALE = 6

/**
 * 比例 → `92.00%`（§4 展示口径）。
 *
 * 后端「率」类字段一律是**比例**而不是已乘过的百分数：毛利报表的 `grossMarginRate=0.92`
 * 表示 92%，`turnoverRate`、折扣率同理。界面不得自行 `* 100`，统一走本函数。
 * 收入为 0 时后端给 null → 回落 '—'（不假装是 0%，也不做 0 除）。
 */
export function formatPercent(rate, digits = 2) {
  if (rate === null || rate === undefined || rate === '') return PLACEHOLDER
  const number = Number(rate)
  if (!Number.isFinite(number)) return PLACEHOLDER
  return (number * PERCENT_SCALE).toFixed(digits) + '%'
}

/**
 * 数量（decimal(20,6)，如 `2.000000`）→ 去掉无意义尾零的展示串（`2`）；空值/非法值返回 '—'。
 * 只用于数量，不用于金额：金额一律走 {@link formatMoney}。
 */
export function formatQuantity(value) {
  if (value === null || value === undefined || value === '') return PLACEHOLDER
  const number = Number(value)
  if (!Number.isFinite(number)) return PLACEHOLDER
  return String(Number(number.toFixed(QUANTITY_SCALE)))
}

/**
 * 金额标签补当前币种中文名：`采购价（人民币）`（表单/列头需要标注单位时用）。
 * 术语本身与币种无关（constants/terms 不再出现「元」），单位随当前币种响应式变化。
 */
export function withCurrencyLabel(label, currency) {
  const fallback = currentCurrencyCode() || DEFAULT_CURRENCY
  return `${label}（${currencyLabel(resolveCurrencyCode(currency || fallback, fallback), fallback)}）`
}

/**
 * 最小货币单位（分/cent）→ 主单位数值。
 * 用于表单回填与需要继续参与计算的场景；展示请用 formatMoney。
 * 空值/非法值按 0 处理（表单里比 '—' 更好用）。
 */
export function fenToYuan(minor) {
  const number = Number(minor)
  return Number.isFinite(number) ? number / MINOR_UNITS_PER_MAJOR : 0
}

/** 主单位（元/美元）→ 最小货币单位整数（四舍五入）；空值/非法值按 0 处理。 */
export function yuanToFen(yuan) {
  const number = Number(yuan)
  return Number.isFinite(number) ? Math.round(number * MINOR_UNITS_PER_MAJOR) : 0
}

/** 最小货币单位 → `¥100.00`（保留旧名，内部委托 formatMoney，不再有第二套口径）。 */
export function formatYuan(minor, currency) {
  return formatMoney(minor, currency)
}

/** 最小货币单位 → `¥1,234.56`（保留旧名，内部委托 formatMoney）。 */
export function formatYuanCompact(minor, currency) {
  return formatMoney(minor, currency)
}

/** 已经是主单位的值 → `¥12.00`（保留旧名，内部委托 formatMoneyValue）。 */
export function formatYuanValue(major, currency) {
  return formatMoneyValue(major, currency)
}

/** 币种代码 → 简体中文展示名（人民币 / 美元）；未知代码回退当前币种并记一条 warn。 */
export function currencyText(code) {
  const fallback = currentCurrencyCode() || DEFAULT_CURRENCY
  return currencyLabel(resolveCurrencyCode(code, fallback), fallback)
}

/** 账单优惠类型 → 简体中文（后端 type ∈ COUPON/DISCOUNT/FULL_REDUCTION/MEMBER_PRICE）。 */
export function promotionTypeText(type) {
  return {
    COUPON: '优惠券',
    DISCOUNT: '整单折扣',
    FULL_REDUCTION: '满减',
    MEMBER_PRICE: '会员价',
  }[type] || '优惠'
}
