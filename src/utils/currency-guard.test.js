import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { effect, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { getTenantCurrency, updateTenantCurrency } from '@/api/currency'
import {
  CURRENCY_DEFINITIONS,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCY_CODES,
  __resetCurrencyWarnings,
  currencyLabel,
  currencyOptions,
  currencySymbol,
  isSupportedCurrency,
  normalizeCurrencyCode,
  parseSupportedCurrencies,
  resolveCurrencyCode,
} from '@/constants/currency'
import { applyGatewayCurrency, currentCurrencyCode, resetCurrencyRuntime, setCurrency } from './currency-runtime'
import { formatMoney, formatMoneyValue } from './format'

vi.mock('@/api/currency', () => ({
  getTenantCurrency: vi.fn(),
  updateTenantCurrency: vi.fn(),
}))

/**
 * 币种守卫（源码级 + 响应式）——对齐 `gv_im_server/docs/standards/16_CURRENCY_CONVENTIONS.md` §4/§7：
 *
 *  1. 字典单一来源：符号/币种码/中文名只能出现在 `constants/currency.js`，业务代码一律走
 *     `formatMoney` / `currencyText` / `withCurrencyLabel`；
 *  2. 源码扫描 `src/**`（排除 `*.test.js`）：不得出现硬编码 `¥`/`￥`/`CNY`/`USD`/`RMB`/「元」，
 *     也不得手写 `/100`、`*100` 换算；
 *  3. 切币种后关键页面（订单/账单、商品、库存、钱包、报表）的金额展示同步变化；
 *  4. 已结算单据/流水的 `currencyCode` 快照优先于全局币种（改设置不改历史）。
 */

const srcRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * 唯一豁免与理由（不是欠账）：币种字典本身就是「符号/代码/中文名」的落点，
 * 这是 §2「代码侧唯一定义」的要求；除它之外任何文件出现这些字面量都视为回退。
 */
const SINGLE_SOURCE_EXEMPTIONS = {
  'constants/currency.js': '币种字典（符号 / 币种码 / 中文名）的唯一出处，§2 单一来源',
}

/**
 * 已知欠账：当前为空，不得新增。
 * key = 相对 `src/` 的路径，value = 命中的规则 id 数组（并需在本文件写明原因与清理批次）。
 */
const KNOWN_DEBT = {}

const RULES = [
  {
    id: 'currency-symbol',
    pattern: /[¥￥]/,
    message: '硬编码货币符号，应改走 utils/format 的 formatMoney（符号只允许出现在 constants/currency）',
  },
  {
    id: 'currency-code',
    pattern: /\b(?:CNY|USD|RMB)\b/,
    message: '硬编码币种代码，应取全局币种（stores/currency / utils/currency-runtime）或 constants/currency',
  },
  {
    id: 'money-unit-word',
    pattern: /元/,
    message: '金额文案绑定「元」，应改走 formatMoney（符号 + 金额）或 withCurrencyLabel（币种中文名）',
  },
  {
    id: 'money-arithmetic',
    pattern: /[/\s]\/\s*100\b|[/\s]\*\s*100\b/,
    message: '手写最小/主单位换算，应改走 utils/format 的 fenToYuan / yuanToFen / formatMoney',
  },
]

async function collectSourceFiles(dir, extensions) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectSourceFiles(full, extensions))
    else if (extensions.some((ext) => entry.name.endsWith(ext)) && !entry.name.endsWith('.test.js')) files.push(full)
  }
  return files
}

/** 去掉注释后再断言：说明「为什么不再这么写」的注释不是实现（与 terms.test.js 同口径）。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

async function findCurrencyOffenders() {
  const offenders = []
  for (const file of await collectSourceFiles(srcRoot, ['.vue', '.js'])) {
    const relative = path.relative(srcRoot, file).split(path.sep).join('/')
    if (SINGLE_SOURCE_EXEMPTIONS[relative]) continue
    const debt = KNOWN_DEBT[relative] || []
    const source = stripComments(await readFile(file, 'utf8'))
    for (const rule of RULES) {
      if (debt.includes(rule.id)) continue
      if (rule.pattern.test(source)) offenders.push(`${relative} → ${rule.id}：${rule.message}`)
    }
  }
  return offenders
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetCurrencyRuntime()
  __resetCurrencyWarnings()
  vi.resetAllMocks()
})

describe('币种字典（constants/currency）', () => {
  it('CNY/USD 的符号、中文名与最小单位小数位固定', () => {
    expect(CURRENCY_DEFINITIONS.CNY).toEqual({ code: 'CNY', symbol: '¥', digits: 2, label: '人民币' })
    expect(CURRENCY_DEFINITIONS.USD).toEqual({ code: 'USD', symbol: '$', digits: 2, label: '美元' })
    expect(SUPPORTED_CURRENCY_CODES).toEqual(['CNY', 'USD'])
    expect(DEFAULT_CURRENCY).toBe('USD')
  })

  it('未知/空值一律回退（缺省 USD），空值不告警、未知值告警一次', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(normalizeCurrencyCode(' cny ')).toBe('CNY')
      expect(isSupportedCurrency('cny')).toBe(true)
      expect(isSupportedCurrency('JPY')).toBe(false)
      expect(resolveCurrencyCode('')).toBe('USD')
      expect(resolveCurrencyCode(null, 'CNY')).toBe('CNY')
      expect(warn).not.toHaveBeenCalled()
      expect(resolveCurrencyCode('JPY')).toBe('USD')
      expect(resolveCurrencyCode('JPY')).toBe('USD')
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('符号与中文名跟随入参币种，未知值回落 fallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(currencySymbol('CNY')).toBe('¥')
      expect(currencySymbol('USD')).toBe('$')
      expect(currencySymbol('JPY', 'CNY')).toBe('¥')
      expect(currencyLabel('CNY')).toBe('人民币')
      expect(currencyLabel('USD')).toBe('美元')
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('后端 supported 优先，缺项用本地字典补齐（页面下拉不依赖后端字段完整性）', () => {
    const parsed = parseSupportedCurrencies([
      { code: 'CNY', symbol: '¥', label: '人民币', minorUnitDigits: 2 },
    ])
    expect(parsed.map((item) => item.code)).toEqual(['CNY', 'USD'])
    expect(parsed[0].label).toBe('人民币')
    expect(parseSupportedCurrencies(null).map((item) => item.code)).toEqual(SUPPORTED_CURRENCY_CODES)
    expect(currencyOptions()).toHaveLength(2)
  })
})

describe('全局币种 store（stores/currency）', () => {
  it('load() 应用接口 currencyCode 与 supported，缺省回落 USD', async () => {
    const { useCurrencyStore } = await import('@/stores/currency')
    getTenantCurrency.mockResolvedValue({
      currencyCode: 'CNY',
      symbol: '¥',
      minorUnitDigits: 2,
      supported: [{ code: 'CNY', symbol: '¥', label: '人民币' }, { code: 'USD', symbol: '$', label: '美元' }],
    })
    const store = useCurrencyStore()
    await store.load()
    expect(store.code).toBe('CNY')
    expect(store.label).toBe('人民币')
    expect(store.supported.map((item) => item.code)).toEqual(['CNY', 'USD'])
    expect(formatMoney(12345)).toBe('¥123.45')
  })

  it('update() 保存后立刻全站生效，且请求体用 currencyCode 字段', async () => {
    const { useCurrencyStore } = await import('@/stores/currency')
    updateTenantCurrency.mockResolvedValue({ currencyCode: 'CNY', symbol: '¥', minorUnitDigits: 2, supported: [] })
    const store = useCurrencyStore()
    expect(store.code).toBe('USD')
    await store.update('CNY')
    expect(updateTenantCurrency).toHaveBeenCalledWith('CNY')
    expect(currentCurrencyCode()).toBe('CNY')
    expect(store.label).toBe('人民币')
  })

  it('update() 失败时不改变当前币种（向上抛给页面提示）', async () => {
    const { useCurrencyStore } = await import('@/stores/currency')
    const store = useCurrencyStore()
    setCurrency('USD')
    updateTenantCurrency.mockRejectedValue(new Error('403 无权限'))
    await expect(store.update('CNY')).rejects.toThrow('403')
    expect(store.code).toBe('USD')
  })

  it('reset() 回到缺省 USD（退出登录 / 切账号不串币种）', async () => {
    const { useCurrencyStore } = await import('@/stores/currency')
    const store = useCurrencyStore()
    setCurrency('CNY')
    store.reset()
    expect(store.code).toBe('USD')
    expect(store.supported.map((item) => item.code)).toEqual(SUPPORTED_CURRENCY_CODES)
  })
})

describe('网关注入 X-Currency 的兜底优先级（§3.4）', () => {
  it('还没有权威值时，响应头可以补位；响应体缺币种时也用响应头而不是直接回落 USD', () => {
    expect(applyGatewayCurrency('CNY')).toBe(true)
    expect(currentCurrencyCode()).toBe('CNY')
    // 响应体没带币种（老接口）：保留网关值
    expect(setCurrency(undefined)).toBe('CNY')
    // 非法响应头静默忽略
    expect(applyGatewayCurrency('JPY')).toBe(false)
    expect(currentCurrencyCode()).toBe('CNY')
  })

  it('权威值（context select / 币种接口）写入后，旧响应头不会把它改回去', () => {
    setCurrency('CNY')
    applyGatewayCurrency('USD')
    expect(currentCurrencyCode()).toBe('CNY')
  })

  it('无网关注入、响应体也缺币种时才回落到缺省 USD', () => {
    expect(setCurrency('')).toBe('USD')
    expect(currentCurrencyCode()).toBe('USD')
  })
})

describe('切币种后关键页面金额同步变化（响应式）', () => {
  /** 用 Vue 的 effect 复现页面渲染表达式：币种一变，同一个表达式必须重新求值。 */
  function trackValue(compute) {
    const seen = []
    effect(() => { seen.push(compute()) })
    return seen
  }

  it('订单/账单页：全局金额随币种切换（$100.00 → ¥100.00）', async () => {
    const seen = trackValue(() => formatMoney(10000))
    expect(seen.at(-1)).toBe('$100.00')
    setCurrency('CNY')
    await nextTick()
    expect(seen.at(-1)).toBe('¥100.00')
  })

  it('账单快照优先：已结算单据改设置不改显示', async () => {
    setCurrency('USD')
    const bill = { currencyCode: 'CNY', totalAmount: 18800 }
    const seen = trackValue(() => formatMoney(bill.totalAmount, bill.currencyCode))
    setCurrency('CNY')
    await nextTick()
    setCurrency('USD')
    await nextTick()
    expect(seen.every((text) => text === '¥188.00')).toBe(true)
  })

  it('商品 / 库存 / 钱包金额都跟着币种走', async () => {
    const product = trackValue(() => formatMoney(350))
    const inventory = trackValue(() => formatMoney(1999))
    const wallet = trackValue(() => formatMoneyValue(12.3))
    expect([product.at(-1), inventory.at(-1), wallet.at(-1)]).toEqual(['$3.50', '$19.99', '$12.30'])
    setCurrency('CNY')
    await nextTick()
    expect([product.at(-1), inventory.at(-1), wallet.at(-1)]).toEqual(['¥3.50', '¥19.99', '¥12.30'])
  })

  it('扫码/报表的币种标注（currencyText）也随快照与全局币种变化', async () => {
    const { currencyText } = await import('@/utils/format')
    setCurrency('USD')
    const snapshot = trackValue(() => currencyText('CNY'))
    const global = trackValue(() => currencyText(undefined))
    expect([snapshot.at(-1), global.at(-1)]).toEqual(['人民币', '美元'])
    setCurrency('CNY')
    await nextTick()
    expect([snapshot.at(-1), global.at(-1)]).toEqual(['人民币', '人民币'])
  })
})

describe('关键页面走统一格式化入口（源码断言）', () => {
  // 与源码守卫同口径：先去掉注释，避免「说明为什么不再这么写」的注释被当成实现。
  const readView = async (relative) => stripComments(await readFile(path.join(srcRoot, 'views', relative), 'utf8'))

  it.each([
    ['tenant/orders.vue', '订单/账单'],
    ['tenant/payments.vue', '支付流水'],
    ['tenant/products.vue', '商品'],
    ['tenant/inventory.vue', '库存'],
    ['tenant/wallet.vue', '钱包'],
    ['tenant/members.vue', '客户储值'],
    ['tenant/reports.vue', '报表'],
    ['tenant/resources.vue', '房型单价'],
    ['tenant/ktv-config.vue', '计价/储值配置'],
    ['platform/pricing-plans.vue', '平台计价方案'],
  ])('%s（%s）金额 / 数量展示走统一入口，且不再自带换算', async (relative) => {
    const source = await readView(relative)
    // 现金 / 价格走 formatMoney；储值币 / 积分（不是货币）走 formatTokens / formatPoints，
    // 代币字段不得交给 formatMoney —— 见 wallet-token-guard.test.js。
    expect(source).toMatch(/formatMoney|formatTokens|formatPoints/)
    expect(source).not.toMatch(/[¥￥]/)
    expect(source).not.toMatch(/元/)
    expect(source).not.toMatch(/\/\s*100\b|\*\s*100\b/)
  })

  it('现金与价格列仍走 formatMoney，储值 / 积分页改走数量入口（不套货币符号）', async () => {
    for (const relative of [
      'tenant/orders.vue', 'tenant/payments.vue', 'tenant/products.vue', 'tenant/inventory.vue',
      'tenant/reports.vue', 'tenant/resources.vue', 'tenant/ktv-config.vue', 'platform/pricing-plans.vue',
    ]) {
      expect(`${relative}:${(await readView(relative)).includes('formatMoney')}`).toBe(`${relative}:true`)
    }
    for (const relative of ['tenant/wallet.vue', 'tenant/members.vue']) {
      expect(`${relative}:${(await readView(relative)).includes('formatMoney')}`).toBe(`${relative}:false`)
    }
  })

  it('写路径不再写死币种（建单 / 收款 / 支付开关 / 储值充值取全局 store）', async () => {
    // 储值充值只在储值管理页：KTV 配置页保留的是支付开关的写路径（沿用已存快照币种，否则取全局 store）。
    for (const relative of ['tenant/orders.vue', 'tenant/payments.vue', 'tenant/ktv-config.vue', 'tenant/wallet.vue']) {
      const source = await readView(relative)
      expect(source).toMatch(/currency(Code)?: (currencyStore\.code|billCurrencyCode\.value \|\| currencyStore\.code|collectOrder\.value\?\.currencyCode \|\| currencyStore\.code|paymentForm\.value\.currencyCode \|\| currencyStore\.code)/)
    }
  })

  it('单据/流水列表显示币种标识（不得静默混算）', async () => {
    expect(await readView('tenant/orders.vue')).toContain('currencyText(bill.currencyCode)')
    // 支付流水页已从表格改为卡片布局（列表变量 payment，不再是 row）：两种形态都必须展示币种快照。
    // 值列与币种列走 payment-methods 的同一个入口：现金 / 线上按快照币种，储值币 / 积分是数量、没有币种。
    expect(await readView('tenant/payments.vue')).toContain('recordCurrencyText(payment)')
    expect(await readView('tenant/payments.vue')).toContain('recordCurrencyText(detailPayment)')
    expect(await readView('tenant/inventory.vue')).toContain('currencyText(row.currencyCode)')
    expect(await readView('tenant/reports.vue')).toContain("kind: 'currency'")
    // 储值流水不是货币：只显示代币数量，币种列随口径移除（见 wallet-token-guard.test.js）
    expect(await readView('tenant/ktv-config.vue')).not.toContain('currencyText(row.currencyCode)')
  })

  it('预约页只保留一种价格来源（不再渲染后端**价格** displayText，避免同页两种符号）', async () => {
    const source = await readView('tenant/reservations.vue')
    expect(source).toContain('formatMoney')
    // 价格文案一律前端按当前币种重算：不得渲染服务端拼好的价格串（pricing.displayText）。
    // 注意：营业时间的 displayText 是时间文案（不含货币符号），不受本守卫约束。
    expect(source).not.toMatch(/pricing[^\n]*displayText|displayText[^\n]*pricing/)
    expect(source).not.toMatch(/价格[^\n]*displayText/)
  })
})

describe('硬编码货币符号源码守卫（src/**，排除 *.test.js）', () => {
  it('KNOWN_DEBT 必须为空（临时豁免要写明原因与清理批次）', () => {
    expect(Object.keys(KNOWN_DEBT)).toEqual([])
  })

  it('只有 constants/currency.js 可以出现货币符号 / 币种码 / 「元」', () => {
    expect(Object.keys(SINGLE_SOURCE_EXEMPTIONS)).toEqual(['constants/currency.js'])
  })

  it('src/** 不再出现硬编码符号、币种码、「元」与手写 /100、*100', async () => {
    expect(await findCurrencyOffenders()).toEqual([])
  })
})
