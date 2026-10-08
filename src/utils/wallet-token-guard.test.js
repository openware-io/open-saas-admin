import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { WALLET_BRAND_NAME_DEFAULT } from '@/constants/terms'
import {
  collectedLegText,
  isQuantityLeg,
  legInputToMinor,
  legMinorToInput,
  paymentValueLabel,
  paymentValueText,
  recordCurrencyText,
} from '@/constants/payment-methods'
import {
  formatCount,
  formatPoints,
  formatTokens,
  majorToTokens,
  minorToTokens,
  resolveTokenCount,
  resolveTokenRatio,
  tokensToMinor,
} from './format'
import { resetCurrencyRuntime, setCurrency } from './currency-runtime'

/**
 * 储值币（代币）与积分是**支付工具**、不是货币（`gv_im_server/docs/standards/16_CURRENCY_CONVENTIONS.md` §9）：
 *
 *  1. 展示层：代币 / 积分只显示数量（千分位、不带货币符号 / 币种 / 「元」），入口只有
 *     `formatTokens` / `formatPoints`；对 `availableAmount` / `tokenAmount` / `points` 这类字段
 *     调用 `formatMoney` 一律视为回退（本文件做源码级守卫）；
 *  2. 换算层：代币数量 = 金额（最小货币单位）÷ 100 × 租户比例 `wallet_ratio`（默认 100），
 *     积分是 1:1 的个数；服务端给了 `tokenAmount` 就以服务端为准，缺字段才降级；
 *  3. 组合支付：现金 / 线上分腿是金额（带币种），储值币 / 积分分腿按数量填写与展示，
 *     但提交给服务端的 `payments[].amount` 仍是最小货币单位整数（合计校验 = 应收）。
 */

const srcRoot = fileURLToPath(new URL('..', import.meta.url))

/** 与其它源码守卫同口径：先去掉注释，避免「说明为什么不再这么写」的注释被当成实现。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

async function collectFiles(dir, extensions) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(full, extensions))
    else if (extensions.some((ext) => entry.name.endsWith(ext)) && !entry.name.endsWith('.test.js')) files.push(full)
  }
  return files
}

const readView = async (relative) => stripComments(await readFile(path.join(srcRoot, 'views', relative), 'utf8'))

/** 代币 / 积分的字段名：这些字段喂给 formatMoney 就是把支付工具当钱渲染。 */
const TOKEN_FIELDS = [
  'availableAmount', 'frozenAmount', 'tokenAmount', 'walletTokenAmount',
  'availablePoints', 'frozenPoints', 'balanceAfter',
  'memberWalletMinor', 'memberPoints', 'memberWalletTokens', 'walletTokens',
  String.raw`collected\.wallet`, String.raw`collected\.points`,
].join('|')

const FORMAT_MONEY_ON_TOKEN = new RegExp(`formatMoney\\s*\\([^)]*(?:${TOKEN_FIELDS})`)

async function findMoneyOnTokenOffenders() {
  const offenders = []
  for (const dir of ['views', 'constants']) {
    for (const file of await collectFiles(path.join(srcRoot, dir), ['.vue', '.js'])) {
      const relative = path.relative(srcRoot, file).split(path.sep).join('/')
      if (FORMAT_MONEY_ON_TOKEN.test(stripComments(await readFile(file, 'utf8')))) offenders.push(relative)
    }
  }
  return offenders
}

describe('储值币 / 积分展示守卫（源码扫描）', () => {
  it('储值 / 积分字段不再交给 formatMoney 渲染（代币不是货币）', async () => {
    expect(await findMoneyOnTokenOffenders()).toEqual([])
  })

  it('储值 / 积分页面走 formatTokens / formatPoints 入口', async () => {
    expect(await readView('tenant/wallet.vue')).toContain('formatTokens(')
    expect(await readView('tenant/members.vue')).toContain('formatTokens(')
    expect(await readView('tenant/members.vue')).toContain('formatPoints(')
    expect(await readView('tenant/points.vue')).toContain('formatPoints(')
    // KTV 配置页已不再展示任何代币数量（储值统一在储值管理页）：这里改为守卫「没有第二套入口」。
    expect(await readView('tenant/ktv-config.vue')).not.toContain('formatTokens(')
  })

  it('储值管理 / 会员储值页不再有货币渲染（余额、充值到账、退还都是数量）', async () => {
    const wallet = await readView('tenant/wallet.vue')
    const members = await readView('tenant/members.vue')
    expect(wallet).not.toContain('formatMoney')
    expect(wallet).not.toContain('formatMoneyValue')
    expect(members).not.toContain('formatMoney')
    // 退还只显示数量：不再渲染「等值货币」行
    expect(wallet).not.toContain('退回金额')
  })

  it('KTV 配置页不再承载储值流水（原先那张「用余额拼出来的流水」已删除）', async () => {
    const source = await readView('tenant/ktv-config.vue')
    expect(source).not.toContain('ledgerTokenText(row)')
    expect(source).not.toContain('walletRows')
    expect(source).not.toContain('formatMoney(row.amount')
    expect(source).not.toContain('currencyText(row.currencyCode)')
    // 页面自身的现金列（计价 / 服务人员单价）不受影响
    expect(source).toContain('formatMoney(row.roomPricePerUnit')
  })

  it('储值流水（储值管理页）只显示代币数量，不按金额 + 币种渲染', async () => {
    const wallet = await readView('tenant/wallet.vue')
    expect(wallet).toContain('getMemberWalletLedger')
    expect(wallet).toContain('ledgerTokenCount(row)')
    expect(wallet).toContain('ledgerBalanceCount(row)')
    // 真实账本是金额字段（amount / balanceAfter），但展示口径是代币数量：不得交给 formatMoney
    expect(wallet).not.toContain('formatMoney')
  })

  it('代币配置文案不再出现「元」，比例按租户币种名动态显示', async () => {
    const source = await readView('tenant/wallet-token-config.vue')
    const stripped = stripComments(source)
    expect(stripped).not.toMatch(/元/)
    expect(stripped).toContain("withCurrencyLabel('主单位')")
    // 比例行只出数字：不再有「1 个主单位 = 100 100 欢乐币」这种把品牌名当单位的重复渲染
    expect(stripped).not.toContain('formatTokens(form.ratio')
    expect(stripped).toContain('v-model="form.ratio"')
  })

  it('组合支付：会员可用储值 / 积分提示只显示数量', async () => {
    for (const view of ['tenant/orders.vue', 'tenant/payments.vue']) {
      const source = await readView(view)
      expect(source).toContain('formatTokens(memberWalletTokens)')
      expect(source).toContain('formatPoints(memberPoints)')
      // 值里不拼品牌名（名字在支付方式 / 标签里）
      expect(source).not.toContain('formatTokens(memberWalletTokens, walletBrand)')
      // 旧写法（把最小货币单位当数量直接插值）不得复活
      expect(source).not.toContain('{{ walletBrand }} {{ memberWalletMinor }}')
    }
  })
})

describe('代币比例换算与降级路径', () => {
  it('降级公式：余额(最小货币单位) ÷ 100 × ratio，取整', () => {
    // 余额 880000（8800.00 主单位）× 默认比例 100 → 880000 个代币
    expect(resolveTokenCount(undefined, 880000, resolveTokenRatio(undefined))).toBe(880000)
    // 余额 9999（99.99 主单位）× 比例 50 → 4999.5 → 取整 5000
    expect(resolveTokenCount(undefined, 9999, resolveTokenRatio(50))).toBe(5000)
    // 非整除法时四舍五入，不留小数
    expect(resolveTokenCount(undefined, 1, 50)).toBe(1)
  })

  it('服务端 tokenAmount 存在时以服务端为准（不二次按本地比例换算）', () => {
    expect(resolveTokenCount('4999', 9999, 50)).toBe(4999)
    expect(formatTokens(resolveTokenCount('12345', 880000, 100))).toBe('12,345')
  })

  it('tokenAmount / ratio 缺字段时不崩、不报错，按默认比例降级', () => {
    expect(() => resolveTokenCount(undefined, undefined, undefined)).not.toThrow()
    expect(resolveTokenCount(undefined, undefined, undefined)).toBe(0)
    expect(formatTokens(resolveTokenCount(undefined, undefined, undefined))).toBe('0')
  })

  it('页面按同一公式降级：resolveTokenCount + resolveTokenRatio 出处在 utils/format', async () => {
    // KTV 配置页已不再展示代币数量（储值统一在储值管理页），因此不在本守卫范围内。
    for (const view of ['tenant/wallet.vue', 'tenant/members.vue', 'tenant/orders.vue', 'tenant/payments.vue']) {
      const source = await readView(view)
      expect(source).toContain('resolveTokenCount(')
      expect(source).toContain('resolveTokenRatio(')
    }
  })
})

describe('组合支付分腿：现金带币种，储值币 / 积分只显示数量', () => {
  it('已收分腿展示串：现金带币种，代币 / 积分是纯数量（不带品牌名与「积分」单位）', () => {
    resetCurrencyRuntime()
    setCurrency('USD')
    expect(collectedLegText({ method: 'CASH', amount: 12345 }, '欢乐币', 100, 'USD')).toBe('现金 $123.45')
    expect(collectedLegText({ method: 'ALIPAY', amount: 5000 }, '欢乐币', 100, 'USD')).toBe('支付宝 $50.00')
    expect(collectedLegText({ method: 'WALLET', amount: 3000 }, '欢乐币', 100, 'USD')).toBe('3,000')
    expect(collectedLegText({ method: 'POINT', amount: 700 }, '欢乐币', 100, 'USD')).toBe('700')
    for (const text of [collectedLegText({ method: 'WALLET', amount: 3000 }, '欢乐币', 100, 'USD'), collectedLegText({ method: 'POINT', amount: 700 })]) {
      expect(text).not.toMatch(/[¥$￥]|元|CNY|USD|积分|欢乐币/)
    }
  })

  it('分腿输入口径：现金 / 线上是金额，储值币是数量（按 ratio 折回金额），积分 1:1 个数', () => {
    expect(isQuantityLeg('WALLET')).toBe(true)
    expect(isQuantityLeg('POINT')).toBe(true)
    expect(isQuantityLeg('CASH')).toBe(false)
    // 默认比例 100：300 个代币 = 3 主单位 = 300 最小货币单位
    expect(legInputToMinor('WALLET', 300, 100)).toBe(300)
    expect(legInputToMinor('WALLET', 150, 50)).toBe(300)
    expect(legInputToMinor('POINT', 700, 100)).toBe(700)
    expect(legInputToMinor('CASH', 12.34, 100)).toBe(1234)
    // 自动抵扣回填与提交互为逆运算
    expect(legMinorToInput('WALLET', 300, 100)).toBe(300)
    expect(legMinorToInput('WALLET', 300, 50)).toBe(150)
    expect(legMinorToInput('POINT', 700, 100)).toBe(700)
    expect(legMinorToInput('CASH', 1234, 100)).toBe(12.34)
    // 可用余额 → 分腿数量的口径与降级换算一致
    expect(minorToTokens(300, 50)).toBe(legMinorToInput('WALLET', 300, 50))
    expect(tokensToMinor(majorToTokens(3, 50), 50)).toBe(300)
  })
})

describe('支付流水 / 日结明细的值列：现金按金额，储值币与积分只显示数量', () => {
  it('数量串不带任何单位（品牌名与「积分」由支付方式 / 列头承担）', () => {
    expect(formatCount(1000)).toBe('1,000')
    expect(formatCount('888000')).toBe('888,000')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(-700)).toBe('-700')
    expect(formatCount(null)).toBe('—')
    expect(formatCount('abc')).toBe('—')
    for (const text of [formatCount(1000), formatCount(-700)]) {
      expect(text).not.toMatch(/[¥$￥]|元|CNY|USD|币|积分/)
    }
  })

  it('paymentValueText：现金 / 线上带币种符号，储值币 / 积分只出数量', () => {
    resetCurrencyRuntime()
    setCurrency('USD')
    // 现金 / 线上：金额（符号 + 两位小数）
    expect(paymentValueText({ method: 'CASH', amount: 12345 }, 100, 'USD')).toBe('$123.45')
    expect(paymentValueText({ provider: 'ALIPAY', amount: 5000 }, 100, 'CNY')).toBe('¥50.00')
    // 储值币：记录里是最小货币单位金额 → 按租户 ratio 折成个数（默认 100 时 1:1）
    expect(paymentValueText({ provider: 'WALLET', amount: 3000 }, 100, 'USD')).toBe('3,000')
    expect(paymentValueText({ provider: 'WALLET', amount: 3000 }, 50, 'USD')).toBe('1,500')
    // 积分：记录里的 amount 就是积分个数（1:1，不乘比例）
    expect(paymentValueText({ provider: 'POINT', amount: 700 }, 100, 'USD')).toBe('700')
    expect(paymentValueText({ provider: 'POINT', amount: 700 }, 50, 'USD')).toBe('700')
    for (const text of [
      paymentValueText({ provider: 'WALLET', amount: 3000 }, 100, 'USD'),
      paymentValueText({ provider: 'POINT', amount: 700 }, 100, 'USD'),
    ]) {
      expect(text).not.toMatch(/[¥$￥]|元|CNY|USD|积分/)
      // 品牌名（默认展示名）也不得作为「单位」拼在数量后面
      expect(text).not.toContain(WALLET_BRAND_NAME_DEFAULT)
    }
  })

  it('值列标签与币种列：数量腿叫「数量」，币种列不伪装成货币', () => {
    expect(paymentValueLabel({ provider: 'WALLET' })).toBe('支付数量')
    expect(paymentValueLabel({ provider: 'POINT' })).toBe('支付数量')
    expect(paymentValueLabel({ provider: 'CASH' })).toBe('支付金额')
    expect(paymentValueLabel({ provider: 'WALLET' }, '本次支付金额', '本次支付数量')).toBe('本次支付数量')
    expect(recordCurrencyText({ provider: 'WALLET', currencyCode: 'USD' })).toBe('—')
    expect(recordCurrencyText({ provider: 'CASH', currencyCode: 'USD' })).toBe('美元')
  })

  it('日结明细 / 支付流水不再把储值币金额交给 formatMoney', async () => {
    const shift = await readView('tenant/shift.vue')
    const payments = await readView('tenant/payments.vue')
    // 日结明细的「金额 / 数量」列走唯一入口
    expect(shift).toContain('paymentValueText(provider, walletRatio, line.currencyCode)')
    expect(shift).not.toContain('formatMoney(provider.amount')
    expect(shift).toContain('resolveTokenRatio(')
    // 支付流水卡片 / 详情同样按值口径渲染
    expect(payments).toContain('paymentValueText(payment, walletRatio, payment.currencyCode)')
    expect(payments).not.toContain('formatYuan(payment.amount')
    expect(payments).not.toContain('formatYuan(detailPayment.amount')
    expect(payments).toContain('recordCurrencyText(')
  })
})
