import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  GRANULARITY_DEFAULT,
  GRANULARITY_OPTIONS,
  GRANULARITY_TEXT,
  ORDER_STATUS_OPTIONS,
  PAY_CHANNEL_PROPS,
  PAY_CHANNEL_TEXT,
  businessDayHint,
  granularityText,
  payChannelText,
  salesColumnLabel,
} from '@/constants/terms'

/**
 * 报表「统计粒度 + 销售报表」的源码守卫。
 *
 * 这轮改动引入两条容易回退的约定，必须由测试挡住：
 *  1. **粒度是六个报表的公共筛选条件**：页面必须用共享控件 `GranularitySelect.vue`、把 `granularity`
 *     下发给接口、且时间列展示服务端给的桶标签（`bucket.label`）——不允许某页自己推算周/月边界
 *     （周起点、跨年周归属一旦各写一套就必然对不上账）；
 *  2. **销售报表必须同时有统计与明细**：明细走服务端分页（page/pageSize + Page 信封），
 *     并沿用混币种提示（`MIXED_CURRENCY_NOTICE`）与统一金额格式化（`formatMoney`）。
 *
 * 断言按「页面结构 / 词表」写，不按文案，措辞调整不会让测试失败。
 */

const srcRoot = fileURLToPath(new URL('..', import.meta.url))

/** 与其它源码守卫同口径：去掉注释，避免「说明为什么不再这么写」的注释被当成实现。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const readSource = async (relative) => stripComments(await readFile(path.join(srcRoot, relative), 'utf8'))

describe('统计粒度词表（constants/terms）', () => {
  it('四档粒度都有中文，界面上不出现 DAY/WEEK 这类英文码', () => {
    expect(Object.keys(GRANULARITY_TEXT)).toEqual(['DAY', 'WEEK', 'MONTH', 'YEAR'])
    for (const code of Object.keys(GRANULARITY_TEXT)) {
      expect(GRANULARITY_TEXT[code]).toMatch(/[\u4e00-\u9fa5]/)
      expect(GRANULARITY_TEXT[code]).not.toBe(code)
    }
  })

  it('下拉选项按 日 → 周 → 月 → 年 排列，缺省为 DAY（与后端 ReportGranularity.parse(null) 一致）', () => {
    expect(GRANULARITY_OPTIONS.map((item) => item.value)).toEqual(['DAY', 'WEEK', 'MONTH', 'YEAR'])
    expect(GRANULARITY_OPTIONS.map((item) => item.label)).toEqual(['按天', '按周', '按月', '按年'])
    expect(GRANULARITY_DEFAULT).toBe('DAY')
  })

  it('未知粒度不把英文码透到界面（走 unknownEnumText 的「未知（CODE）」口径）', () => {
    expect(granularityText('QUARTER')).toBe('未知（QUARTER）')
    expect(granularityText('WEEK')).toBe('按周')
  })

  it('销售报表支付构成五类齐全，顺序与后端字段一致', () => {
    expect(Object.keys(PAY_CHANNEL_TEXT)).toEqual(PAY_CHANNEL_PROPS)
    expect(PAY_CHANNEL_PROPS).toEqual(['cashAmount', 'onlineAmount', 'walletAmount', 'pointsAmount', 'otherAmount'])
    expect(payChannelText('cashAmount')).toBe('现金')
    expect(payChannelText('walletAmount')).toBe('储值币')
    expect(payChannelText('pointsAmount')).toBe('积分')
    // 「其它」是兜底分类，必须存在，否则新增渠道的金额会从界面上消失
    expect(payChannelText('otherAmount')).toBe('其它')
  })

  it('销售列头走 moneyLabel 口径（不绑定「元」与币种符号）', () => {
    expect(salesColumnLabel('salesAmount')).toBe('销售额')
    expect(salesColumnLabel('totalAmount')).toBe('单据金额')
    expect(salesColumnLabel('salesAmount')).not.toMatch(/[¥￥元]/)
  })

  it('营业日提示必须包含时区与「归前一营业日」的口径说明', () => {
    expect(businessDayHint('Asia/Shanghai')).toContain('Asia/Shanghai')
    expect(businessDayHint('Asia/Shanghai')).toContain('营业日')
    expect(businessDayHint('')).toContain('营业日')
  })
})

describe('订单状态词表（销售明细按状态复核）', () => {
  it('ord_order 的 10 个状态都有中文（含 WAITING_ARRIVAL / 退款态）', () => {
    const codes = ORDER_STATUS_OPTIONS.map((item) => item.value)
    expect(codes).toContain('WAITING_ARRIVAL')
    expect(codes).toContain('VOIDED')
    expect(codes).toContain('REFUNDED')
    expect(codes).toContain('PARTIAL_REFUNDED')
    for (const option of ORDER_STATUS_OPTIONS) {
      expect(option.label).not.toBe(option.value)
    }
  })
})

describe('报表页（views/tenant/reports.vue）', () => {
  it('新增「销售报表」tab，并接入 getSales', async () => {
    const source = await readSource('views/tenant/reports.vue')
    expect(source).toContain('name="sales"')
    expect(source).toContain('销售报表')
    expect(source).toMatch(/import \{[^}]*getSales[^}]*\} from '@\/api\/report'/)
    expect(source).toMatch(/\[SALES\]: getSales/)
  })

  it('用共享粒度控件（不再各页自造粒度选择器）', async () => {
    const source = await readSource('views/tenant/reports.vue')
    expect(source).toContain("import GranularitySelect from '@/components/GranularitySelect.vue'")
    expect(source).toContain('<GranularitySelect')
  })

  it('把 granularity 下发给接口（六张报表同一套参数）', async () => {
    const source = await readSource('views/tenant/reports.vue')
    expect(source).toMatch(/granularity:\s*(\w+\.value|granularity)/)
    expect(source).toContain('granularity.value')
  })

  it('时间桶展示服务端给的标签，不自己算周/月边界', async () => {
    const source = await readSource('views/tenant/reports.vue')
    expect(source).toContain("c.kind === 'bucket'")
    expect(source).toMatch(/kind:\s*'bucket'/)
    // 页面不得自行推算周数/月份（周起点与跨年周归属只在服务端一处实现）
    expect(source).not.toMatch(/getMonth\(|getDay\(|getISOWeek|weekOfYear|WEEK_BASED/i)
  })

  it('销售明细走服务端分页（page/pageSize + Page 信封字段）', async () => {
    const source = await readSource('views/tenant/reports.vue')
    expect(source).toContain('query.page = page.value')
    expect(source).toContain('query.pageSize = pageSize.value')
    expect(source).toContain(':total="details.total"')
    expect(source).toContain('details.records')
    expect(source).toContain('@current-change="onPageChange"')
    expect(source).toContain('@size-change="onPageSizeChange"')
    // 筛条件变化要把明细分页复位，避免停在不存在的页码上
    expect(source).toMatch(/page\.value = 1/)
  })

  it('混币种提示与统一金额格式化都在（销售报表也是跨行聚合视图）', async () => {
    const source = await readSource('views/tenant/reports.vue')
    expect(source).toContain('MIXED_CURRENCY_NOTICE')
    expect(source).toContain('sumMinorAmounts')
    expect(source).toContain('formatMoney')
    expect(source).toContain('currencyText')
    // 混币种时整表不显示合计
    expect(source).toContain('showSummary')
  })

  it('明细表展示营业日与单据时间两列（跨零点场次能核对归属）', async () => {
    const source = await readSource('views/tenant/reports.vue')
    expect(source).toContain("prop: 'businessDate'")
    expect(source).toContain("prop: 'createdAt'")
    expect(source).toContain('orderStatusText')
  })

  it('资源利用率按「一次开台一行」展示（开台/结台/本次时长/是否完成/当日利用率）', async () => {
    const source = await readSource('views/tenant/reports.vue')
    // 后端按 ord_ktv_session 出数：一次开台一行，行内是这一次的时间与时长
    expect(source).toContain("prop: 'openedAt'")
    expect(source).toContain("prop: 'closedAt'")
    expect(source).toContain("prop: 'durationSeconds'")
    expect(source).toContain("prop: 'turnoverCount'")
    expect(source).toContain("prop: 'turnoverRate'")
    // 口径必须显式写给使用方（行粒度 / 完成判定 / 利用率分母）
    expect(source).toContain('一次开台')
    expect(source).toContain('当日利用率')
    // occupiedSeconds 是「res_occupation 占用窗口求和」的旧口径字段（固定 24h 窗口，开 4 次台显示 96h），
    // 后端已删除，页面不得再引用
    expect(source).not.toContain('occupiedSeconds')
  })

  it('费用/数量展示不与禁用术语混用（含包间/房间等）', async () => {
    const source = await readSource('views/tenant/reports.vue')
    expect(source).toContain('包厢')
    expect(source).not.toMatch(/房间|包间|商家|待收|房台/)
  })
})

describe('GranularitySelect 组件', () => {
  it('选项只来自词表，界面只出现中文', async () => {
    const source = await readSource('components/GranularitySelect.vue')
    expect(source).toContain("from '@/constants/terms'")
    expect(source).toContain('GRANULARITY_OPTIONS')
    // 组件不得把英文码写进 label
    expect(source).not.toMatch(/label:\s*'(DAY|WEEK|MONTH|YEAR)'/)
    expect(source).toContain('@change="onChange"')
  })

  it('改粒度不发请求（由页面「查询」统一触发）', async () => {
    const source = await readSource('components/GranularitySelect.vue')
    expect(source).not.toMatch(/request|axios|api\//)
  })
})
