import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetCurrencyWarnings } from '@/constants/currency'
import { WALLET_BRAND_NAME_DEFAULT } from '@/constants/terms'
import { resetCurrencyRuntime, setCurrency } from './currency-runtime'
import {
  WALLET_TOKEN_DEFAULT_RATIO,
  currencyText,
  fenToYuan,
  formatCount,
  formatMoney,
  formatMoneyCompact,
  formatMoneyValue,
  formatPoints,
  formatTime,
  formatTimeWithSeconds,
  formatTokens,
  formatYuan,
  formatYuanCompact,
  formatYuanValue,
  majorToTokens,
  minorToTokens,
  promotionTypeText,
  resolveTokenBrand,
  resolveTokenCount,
  resolveTokenRatio,
  tokensToMajor,
  tokensToMinor,
  withCurrencyLabel,
  yuanToFen,
} from './format'

// 每个用例都从缺省 USD 的干净状态开始（与「租户未配置币种 = USD」同口径）。
beforeEach(() => {
  resetCurrencyRuntime()
  __resetCurrencyWarnings()
})

describe('formatTime', () => {
  it('统一为 YYYY-MM-DD HH:mm', () => {
    expect(formatTime('2026-09-20T14:05:33')).toBe('2026-09-20 14:05')
    expect(formatTime('2026-09-20 14:05:33')).toBe('2026-09-20 14:05')
  })

  it('日期型字段（只有 YYYY-MM-DD）原样展示', () => {
    expect(formatTime('2026-09-20')).toBe('2026-09-20')
  })

  it('空值与非法值统一返回占位符', () => {
    expect(formatTime(null)).toBe('—')
    expect(formatTime(undefined)).toBe('—')
    expect(formatTime('')).toBe('—')
  })
})

describe('formatTimeWithSeconds', () => {
  it('与 formatTime 同口径但保留秒', () => {
    expect(formatTimeWithSeconds('2026-09-20T14:05:33')).toBe('2026-09-20 14:05:33')
    expect(formatTimeWithSeconds('2026-09-20 14:05:33.123')).toBe('2026-09-20 14:05:33')
  })

  it('本地时钟（Date / 毫秒时间戳）按本地时区格式化，不依赖运行环境 locale', () => {
    const clock = new Date(2026, 8, 20, 14, 5, 33)
    expect(formatTimeWithSeconds(clock)).toBe('2026-09-20 14:05:33')
    expect(formatTimeWithSeconds(clock.getTime())).toBe('2026-09-20 14:05:33')
  })

  it('空值与非法值统一返回占位符（与 formatTime 同口径）', () => {
    expect(formatTimeWithSeconds(null)).toBe('—')
    expect(formatTimeWithSeconds(undefined)).toBe('—')
    expect(formatTimeWithSeconds('')).toBe('—')
    expect(formatTimeWithSeconds(Number.NaN)).toBe('—')
    expect(formatTimeWithSeconds('2026-09-20')).toBe('2026-09-20')
  })
})

describe('formatMoney（全后台金额展示唯一入口）', () => {
  it('缺省使用全局当前币种，符号取 constants/currency', () => {
    expect(formatMoney(12345)).toBe('$123.45')
    setCurrency('CNY')
    expect(formatMoney(12345)).toBe('¥123.45')
    setCurrency('USD')
    expect(formatMoney(12345)).toBe('$123.45')
  })

  it('显式传入币种时以记录币种为准（已结算单据快照优先于全局币种）', () => {
    setCurrency('USD')
    expect(formatMoney(12345, 'CNY')).toBe('¥123.45')
    setCurrency('CNY')
    expect(formatMoney(12345, 'USD')).toBe('$123.45')
  })

  it('0 与负数都正确（负数符号在货币符号之前）', () => {
    setCurrency('USD')
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(-12345)).toBe('-$123.45')
    setCurrency('CNY')
    expect(formatMoney(0)).toBe('¥0.00')
    expect(formatMoney(-1)).toBe('-¥0.01')
  })

  it('大额带千分位', () => {
    setCurrency('CNY')
    expect(formatMoney(123456789)).toBe('¥1,234,567.89')
    expect(formatMoney('123456789')).toBe('¥1,234,567.89')
  })

  it('空值/非法值返回占位符，避免出现符号 + NaN', () => {
    setCurrency('CNY')
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney('')).toBe('—')
    expect(formatMoney('abc')).toBe('—')
  })

  it('未知币种回退当前币种并记一条 console.warn（不抛错、不整页报错）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      setCurrency('CNY')
      expect(formatMoney(100, 'JPY')).toBe('¥1.00')
      expect(warn).toHaveBeenCalledTimes(1)
      // 同一个非法值只提示一次，避免列表渲染刷屏
      expect(formatMoney(100, 'JPY')).toBe('¥1.00')
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('formatMoneyCompact / formatYuan / formatYuanCompact 委托同一实现（不留两套口径）', () => {
    setCurrency('CNY')
    expect(formatMoneyCompact(12345)).toBe(formatMoney(12345))
    expect(formatYuan(12345)).toBe(formatMoney(12345))
    expect(formatYuanCompact(123456789)).toBe(formatMoney(123456789))
    expect(formatYuan(null)).toBe('—')
    expect(formatYuanCompact(null)).toBe('—')
    expect(formatYuanCompact('abc')).toBe('—')
  })

  it('formatMoneyValue 处理已经是主单位的值', () => {
    setCurrency('CNY')
    expect(formatMoneyValue(123.45)).toBe('¥123.45')
    expect(formatYuanValue(12.3)).toBe(formatMoneyValue(12.3))
    expect(formatMoneyValue(null)).toBe('—')
    expect(formatMoneyValue('abc')).toBe('—')
  })

  it('withCurrencyLabel 用币种中文名标注单位（术语本身与币种无关）', () => {
    expect(withCurrencyLabel('采购价')).toBe('采购价（美元）')
    setCurrency('CNY')
    expect(withCurrencyLabel('采购价')).toBe('采购价（人民币）')
    expect(withCurrencyLabel('售价', 'USD')).toBe('售价（美元）')
  })
})

describe('fenToYuan / yuanToFen', () => {
  it('最小货币单位 → 主单位，供表单回填与计算使用（不带货币符号）', () => {
    expect(fenToYuan(12345)).toBe(123.45)
    expect(fenToYuan(0)).toBe(0)
    expect(fenToYuan(null)).toBe(0)
    expect(fenToYuan('')).toBe(0)
    expect(fenToYuan('abc')).toBe(0)
  })

  it('主单位 → 最小货币单位，落库前取整', () => {
    expect(yuanToFen(123.45)).toBe(12345)
    expect(yuanToFen('100')).toBe(10000)
    expect(yuanToFen(0.1 + 0.2)).toBe(30)
    expect(yuanToFen(null)).toBe(0)
    expect(yuanToFen('abc')).toBe(0)
  })

  it('互为逆运算（两位小数以内）', () => {
    for (const minor of [0, 1, 99, 100, 12345, 500000]) {
      expect(yuanToFen(fenToYuan(minor))).toBe(minor)
    }
  })
})

describe('currencyText', () => {
  it('币种代码转中文名，界面不出现裸 CNY/USD 码', () => {
    expect(currencyText('CNY')).toBe('人民币')
    expect(currencyText('usd')).toBe('美元')
  })

  it('空值回退当前币种', () => {
    expect(currencyText('')).toBe('美元')
    setCurrency('CNY')
    expect(currencyText('')).toBe('人民币')
    expect(currencyText(undefined)).toBe('人民币')
  })

  it('未知币种回退当前币种并记 warn，而不是把英文码透到界面', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      setCurrency('USD')
      expect(currencyText('JPY')).toBe('美元')
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('promotionTypeText', () => {
  it('优惠类型转中文', () => {
    expect(promotionTypeText('DISCOUNT')).toBe('整单折扣')
    expect(promotionTypeText('COUPON')).toBe('优惠券')
  })

  it('未知类型不展示英文枚举', () => {
    expect(promotionTypeText('UNKNOWN_TYPE')).toBe('优惠')
  })
})

describe('代币与积分（数量口径，不是货币）', () => {
  it('formatTokens：只出数量（千分位整数），0 / 负数 / 大额都正确', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(1000)).toBe('1,000')
    expect(formatTokens('1234567')).toBe('1,234,567')
    expect(formatTokens(-300)).toBe('-300')
    // 代币是个数，不保留小数
    expect(formatTokens(12.4)).toBe('12')
  })

  it('formatTokens：绝不出现货币符号、币种码、「元」，也不拼品牌名 / 「个」这类单位', () => {
    const samples = [
      formatTokens(1234567),
      formatTokens(0),
      formatTokens(-1),
      formatTokens(880000),
      formatCount(880000),
    ]
    for (const text of samples) {
      expect(text).not.toMatch(/[¥$￥]/)
      expect(text).not.toMatch(/(?:元|CNY|USD|RMB)/)
      // 值里不出现品牌名 / 「积分」/「币」/「个」：名字只留给列头与标签
      expect(text).not.toContain(WALLET_BRAND_NAME_DEFAULT)
      expect(text).not.toMatch(/(?:积分|币|个)/)
    }
  })

  it('formatTokens 与 formatCount 同一口径（品牌名不再是参数）', () => {
    expect(formatTokens(1000)).toBe(formatCount(1000))
    expect(formatTokens).toHaveLength(1)
    expect(formatPoints).toHaveLength(1)
  })

  it('formatTokens：空值 / 非法值回落占位符（不会显示成金额）', () => {
    expect(formatTokens(null)).toBe('—')
    expect(formatTokens(undefined)).toBe('—')
    expect(formatTokens('')).toBe('—')
    expect(formatTokens('abc')).toBe('—')
  })

  it('formatPoints：积分就是个数（1:1 不换算），只出数量、不带「积分」单位', () => {
    expect(formatPoints(0)).toBe('0')
    expect(formatPoints(300)).toBe('300')
    expect(formatPoints('1234567')).toBe('1,234,567')
    expect(formatPoints(-50)).toBe('-50')
    expect(formatPoints(88.6)).toBe('89')
  })

  it('formatPoints：绝不出现货币符号或「元」，空值回落占位符', () => {
    expect(formatPoints(1234567)).not.toMatch(/[¥$￥]|元/)
    expect(formatPoints(300)).not.toMatch(/积分/)
    expect(formatPoints(null)).toBe('—')
    expect(formatPoints('abc')).toBe('—')
  })

  it('金额 ↔ 代币数量：1 主单位 = ratio 个代币，ratio 缺失回落默认 100', () => {
    expect(WALLET_TOKEN_DEFAULT_RATIO).toBe(100)
    expect(resolveTokenRatio(undefined)).toBe(WALLET_TOKEN_DEFAULT_RATIO)
    expect(resolveTokenRatio(null)).toBe(WALLET_TOKEN_DEFAULT_RATIO)
    expect(resolveTokenRatio(0)).toBe(WALLET_TOKEN_DEFAULT_RATIO)
    expect(resolveTokenRatio(-5)).toBe(WALLET_TOKEN_DEFAULT_RATIO)
    expect(resolveTokenRatio('abc')).toBe(WALLET_TOKEN_DEFAULT_RATIO)
    expect(resolveTokenRatio(50)).toBe(50)
    expect(resolveTokenRatio('120')).toBe(120)

    expect(majorToTokens(100, 100)).toBe(10000)
    expect(majorToTokens(3, 50)).toBe(150)
    expect(majorToTokens(null, 100)).toBe(0)
    expect(minorToTokens(10000, 100)).toBe(10000)
    expect(minorToTokens(10000, 50)).toBe(5000)
    expect(minorToTokens(undefined, 100)).toBe(0)
    // 数量 ↔ 金额互为逆运算（整数个数以内）
    expect(tokensToMajor(150, 50)).toBe(3)
    expect(tokensToMinor(300, 100)).toBe(300)
    expect(tokensToMinor(150, 50)).toBe(300)
    expect(tokensToMinor(null, 100)).toBe(0)
  })

  it('resolveTokenCount：服务端 tokenAmount 优先，缺失按「金额 ÷ 100 × ratio」降级，ratio 缺失不报错', () => {
    // 服务端已算好：以它为准（即使与本地比例不一致，也不二次换算）
    expect(resolveTokenCount('12345', 10000, 100)).toBe(12345)
    expect(resolveTokenCount(12345, 10000, 100)).toBe(12345)
    // 字段缺失（老接口 / 服务端未发布）：按余额与租户比例降级
    expect(resolveTokenCount(undefined, 10000, 100)).toBe(10000)
    expect(resolveTokenCount(null, 10000, 50)).toBe(5000)
    expect(resolveTokenCount('', 66, 100)).toBe(66)
    // ratio 缺失：回落默认 100，不抛错
    expect(resolveTokenCount(undefined, 10000, undefined)).toBe(10000)
    // 非法 tokenAmount 同样降级，字段全缺按 0
    expect(resolveTokenCount('abc', 10000, 100)).toBe(10000)
    expect(resolveTokenCount(undefined, undefined, undefined)).toBe(0)
  })

  it('resolveTokenBrand：记录上的品牌名优先，缺失回落页面已取的品牌名', () => {
    expect(resolveTokenBrand('欢乐币', '储值')).toBe('欢乐币')
    expect(resolveTokenBrand('  欢乐币  ', '储值')).toBe('欢乐币')
    expect(resolveTokenBrand('', ' 储值 ')).toBe('储值')
    expect(resolveTokenBrand(undefined, undefined)).toBe(WALLET_BRAND_NAME_DEFAULT)
  })
})
