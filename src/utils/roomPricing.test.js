import { describe, expect, it, beforeEach } from 'vitest'
import { fenToYuan, yuanToFen } from './format'
import { resetCurrencyRuntime, setCurrency } from './currency-runtime'
import { BILLING_UNIT_LABEL, resolveRoomPrice, roomBasePriceText, roomPriceFromPricing } from './roomPricing'

/**
 * 「生效房费单价」口径固化：与后端 KtvPricingPlan.forRoomType / /business/ktv/pricing 同源。
 * 取值顺序（房型字典价 > 方案按房型价 > 门店价）一旦被页面改乱，账单与看板就会各说一套。
 * 金额符号由 formatMoney 按「快照币种 > 全局币种」渲染，本文件同时守住这条传播路径。
 */
// 本文件的价格样例沿用 CNY 租户的历史数据（符号随全局币种变化，切换行为在下方单独覆盖）。
beforeEach(() => {
  resetCurrencyRuntime()
  setCurrency('CNY')
})
const storePlan = {
  billingUnit: 'HOUR',
  roomUnitPrice: 10000,
  unitPriceByRoomType: { VIP: 20000 },
}

/** 新口径门店级方案：房型 ¥100/小时 + 服务 ¥50/小时 = 合计 ¥150/小时（含 1 名服务人员）。 */
const storePlanWithServer = {
  billingUnit: 'HOUR',
  roomUnitPrice: 10000,
  serverUnitPrice: 5000,
  combinedUnitPrice: 15000,
  unitPriceByRoomType: { VIP: 20000 },
}

describe('resolveRoomPrice：按房型取生效单价', () => {
  it('房型字典单价优先于门店价与方案按房型价', () => {
    const price = resolveRoomPrice({ plan: storePlan, roomTypeCode: 'VIP', roomTypeName: '豪华包', roomTypeUnitPrice: 30000 })
    expect(price.unitPrice).toBe(30000)
    expect(price.priceApplied).toBe(true)
    expect(price.roomTypeName).toBe('豪华包')
  })

  it('房型字典未定价时用计价方案按房型单价', () => {
    const price = resolveRoomPrice({ plan: storePlan, roomTypeCode: 'VIP', roomTypeName: '豪华包', roomTypeUnitPrice: null })
    expect(price.unitPrice).toBe(20000)
    expect(price.priceApplied).toBe(true)
  })

  it('两个来源都没定价：回退门店价且 priceApplied=false（与 roomTypePriceApplied 同口径）', () => {
    const price = resolveRoomPrice({ plan: storePlan, roomTypeCode: 'SMALL', roomTypeName: '小包', roomTypeUnitPrice: 0 })
    expect(price.unitPrice).toBe(10000)
    expect(price.priceApplied).toBe(false)
  })

  it('未指定房型：直接用门店价，不标注房型', () => {
    const price = resolveRoomPrice({ plan: storePlan, roomTypeCode: '', roomTypeUnitPrice: 30000 })
    expect(price.unitPrice).toBe(10000)
    expect(price.priceApplied).toBe(false)
    expect(price.roomTypeCode).toBe(null)
  })

  it('门店级方案缺失时返回 null 单价，由页面展示「待配置」而不是臆造价格', () => {
    expect(resolveRoomPrice({}).unitPrice).toBe(null)
    expect(resolveRoomPrice({ roomTypeCode: 'VIP' }).unitPrice).toBe(null)
  })

  it('服务单价随房型字典覆盖房型单价，合计 = 房型 + 服务（与后端 forRoomType 同序）', () => {
    const price = resolveRoomPrice({
      plan: storePlanWithServer, roomTypeCode: 'VIP', roomTypeName: '豪华包',
      roomTypeUnitPrice: 30000, roomTypeServerUnitPrice: 8000,
    })
    expect(price.unitPrice).toBe(30000)
    expect(price.serverUnitPrice).toBe(8000)
    expect(price.combinedUnitPrice).toBe(38000)
  })

  it('房型字典没有服务单价时回退门店级/方案服务单价', () => {
    const price = resolveRoomPrice({ plan: storePlanWithServer, roomTypeCode: 'VIP', roomTypeUnitPrice: 30000 })
    expect(price.serverUnitPrice).toBe(5000)
    expect(price.combinedUnitPrice).toBe(35000)
  })

  it('旧方案（无服务单价）服务分项为 0，合计等于房型价——展示退回原样', () => {
    const price = resolveRoomPrice({ plan: storePlan, roomTypeCode: 'VIP', roomTypeUnitPrice: 30000 })
    expect(price.serverUnitPrice).toBe(0)
    expect(price.combinedUnitPrice).toBe(30000)
  })
})

describe('roomPriceFromPricing：服务端按包厢计价结果', () => {
  it('直接采用服务端生效单价、服务单价与 roomTypePriceApplied', () => {
    const resolved = roomPriceFromPricing({
      billingUnit: 'HALF_HOUR',
      roomUnitPrice: 15000,
      serverUnitPrice: 2500,
      combinedUnitPrice: 17500,
      appliedRoomTypeCode: 'VIP',
      appliedRoomTypeName: '豪华包',
      roomTypePriceApplied: true,
    })
    expect(resolved).toEqual({
      unitPrice: 15000, priceApplied: true, roomTypeCode: 'VIP', roomTypeName: '豪华包',
      billingUnit: 'HALF_HOUR', serverUnitPrice: 2500, combinedUnitPrice: 17500,
      // 响应没带币种快照时为 null（展示回落全局币种），带快照时随结果传出
      currencyCode: null,
    })
  })

  it('缺 roomUnitPrice 时返回 null，调用方退回本地推算', () => {
    expect(roomPriceFromPricing(null)).toBe(null)
    expect(roomPriceFromPricing({})).toBe(null)
  })

  it('后端未返回分项（旧响应）时合计等于房型价，不臆造服务费', () => {
    const resolved = roomPriceFromPricing({ billingUnit: 'HOUR', roomUnitPrice: 15000 })
    expect(resolved.serverUnitPrice).toBe(0)
    expect(resolved.combinedUnitPrice).toBe(15000)
  })
})

describe('roomBasePriceText：基础房费文案', () => {
  it('命中房型价：标注「房型「X」生效单价」', () => {
    const text = roomBasePriceText(resolveRoomPrice({
      plan: storePlan, roomTypeCode: 'VIP', roomTypeName: '豪华包', roomTypeUnitPrice: 30000,
    }))
    expect(text).toBe('基础房费 ¥300.00/小时 · 房型「豪华包」生效单价')
  })

  it('房型未定价：标注「未定价，回退门店单价」', () => {
    const text = roomBasePriceText(resolveRoomPrice({
      plan: storePlan, roomTypeCode: 'SMALL', roomTypeName: '小包', roomTypeUnitPrice: null,
    }))
    expect(text).toBe('基础房费 ¥100.00/小时 · 房型「小包」未定价，回退门店单价')
  })

  it('未指定房型：只给门店基础房费；无方案时提示待配置', () => {
    expect(roomBasePriceText(resolveRoomPrice({ plan: storePlan }))).toBe('基础房费 ¥100.00/小时')
    expect(roomBasePriceText(resolveRoomPrice({}))).toBe('基础房费待配置')
  })

  it('计费单位后缀与后端 displayText 同口径', () => {
    expect(BILLING_UNIT_LABEL.HOUR).toBe('/小时')
    expect(roomBasePriceText({ unitPrice: 10000, billingUnit: 'HALF_HOUR' })).toBe('基础房费 ¥100.00/半小时')
  })

  it('后端已返回服务分项：按「房型 + 服务 = 合计（含 1 名服务人员）」展示', () => {
    const text = roomBasePriceText(roomPriceFromPricing({
      billingUnit: 'HOUR', roomUnitPrice: 18800, serverUnitPrice: 5000, combinedUnitPrice: 23800,
      appliedRoomTypeCode: 'VIP', appliedRoomTypeName: '豪华包', roomTypePriceApplied: true,
    }))
    expect(text).toBe('基础房费 房型 ¥188.00 + 服务 ¥50.00 = ¥238.00/小时（含 1 名服务人员） · 房型「豪华包」生效单价')
  })

  it('未指定房型时同样给出分项与合计（只按门店级）', () => {
    expect(roomBasePriceText({ unitPrice: 18800, serverUnitPrice: 5000, combinedUnitPrice: 23800, billingUnit: 'HOUR' }))
      .toBe('基础房费 房型 ¥188.00 + 服务 ¥50.00 = ¥238.00/小时（含 1 名服务人员）')
  })

  it('服务单价为 0：退回原样，不出现「+ ¥0.00」', () => {
    expect(roomBasePriceText({ unitPrice: 18800, serverUnitPrice: 0, combinedUnitPrice: 18800, billingUnit: 'HOUR' }))
      .toBe('基础房费 ¥188.00/小时')
  })
})

describe('基础房费文案：币种快照优先于全局币种', () => {
  it('方案/计价响应带 currencyCode 时按快照币种渲染', () => {
    setCurrency('USD')
    const price = resolveRoomPrice({ plan: { ...storePlan, currencyCode: 'CNY' } })
    expect(price.currencyCode).toBe('CNY')
    expect(roomBasePriceText(price)).toBe('基础房费 ¥100.00/小时')
    const fromServer = roomPriceFromPricing({
      billingUnit: 'HOUR', roomUnitPrice: 10000, currencyCode: 'CNY',
    })
    expect(roomBasePriceText(fromServer)).toBe('基础房费 ¥100.00/小时')
  })

  it('没有快照时跟随全局币种（切币种后文案符号同步变化）', () => {
    setCurrency('CNY')
    expect(roomBasePriceText({ unitPrice: 10000, billingUnit: 'HOUR' })).toBe('基础房费 ¥100.00/小时')
    setCurrency('USD')
    expect(roomBasePriceText({ unitPrice: 10000, billingUnit: 'HOUR' })).toBe('基础房费 $100.00/小时')
  })
})

describe('房型单价：主单位输入 ↔ 最小货币单位', () => {
  it('主单位表单值提交前换算成最小货币单位，0 保留「清空/回退门店价」语义', () => {
    expect(yuanToFen(150)).toBe(15000)
    expect(yuanToFen(99.99)).toBe(9999)
    expect(yuanToFen(0)).toBe(0)
  })

  it('最小货币单位回填为主单位（房型单价列与编辑表单同一口径）', () => {
    expect(fenToYuan(15000)).toBe(150)
    expect(fenToYuan(null)).toBe(0)
  })
})

/**
 * 「订单/KTV」页（business/orders）房型筛选（2026-09-19）：筛选条件必须能按房型收敛，
 * 且房型名可能很长——页面必须限宽 + 省略号 + 悬停可见，工具栏必须允许换行，
 * 否则长名会把搜索框/状态筛选挤出容器（门店反馈「数据超出宽度」的场景）。
 */
describe('订单/KTV 页房型筛选与长名溢出处理', () => {
  const readSource = async (relative) => {
    const { readFile } = await import('node:fs/promises')
    return readFile(new URL(relative, import.meta.url), 'utf8')
  }

  it('看板按房型筛选，未设置房型的包厢有独立入口（不被筛选器藏起来）', async () => {
    const source = await readSource('../views/tenant/orders.vue')

    expect(source).toContain('const selectedRoomType = ref(ROOM_TYPE_ALL)')
    expect(source).toContain("label: '全部房型'")
    expect(source).toContain("label: '未设置房型'")
    expect(source).toContain('room.roomType !== selectedRoomType.value')
    expect(source).toContain('board-room-type-select')
  })

  it('房型名过长不横向溢出：选择器限宽 + 选中项省略号 + 工具栏换行', async () => {
    const source = await readSource('../views/tenant/orders.vue')
    expect(source).toContain('text-overflow: ellipsis')
    expect(source).toContain('max-width: 46vw')
    expect(source).toContain('el-tooltip v-if="roomTypeOptions.length"')

    const board = await readSource('../components/OperationsBoard.vue')
    expect(board).toContain('flex-wrap: wrap')
    expect(board).toContain('min-width: 0')
  })
})
