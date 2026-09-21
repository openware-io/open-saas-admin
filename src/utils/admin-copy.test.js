import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * 后台文案与交互一致性守卫（源码级断言）。
 * 这些约束是运营可见的行为契约，回归时用测试挡住，而不是只靠代码评审。
 */

const srcRoot = fileURLToPath(new URL('..', import.meta.url))

async function collectVueFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectVueFiles(full))
    else if (entry.name.endsWith('.vue')) files.push(full)
  }
  return files
}

const readSource = (relative) => readFile(path.join(srcRoot, relative), 'utf8')

/** 去掉注释后再断言，避免「说明为什么不再使用某文案」的注释被误判成文案本身。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('订单/包厢看板（orders.vue）', () => {
  it('F5：删除自定义加项死按钮，加项只走点单目录（后端要求 catalogItemId）', async () => {
    const source = await readSource('views/tenant/orders.vue')
    expect(source).not.toContain('自定义加项')
    expect(source).not.toContain('doAddItem')
    expect(source).not.toContain('itemForm')
    expect(source).toContain('catalogItemId: catalogItem.id')
    // 房态卡片的结台入口必须保留；点单弹窗只确认本次选择，不得误触发结台。
    expect(source).toContain('closeOrderSession(room.order)')
    expect(source).toContain('@click="confirmCatalogSelection"')
    expect(source).toContain('>确认加项</el-button>')
    expect(source).toContain('@change="(value) => updateCatalogSelection(c, value)"')
    expect(source).toContain('@click="decreaseCatalogSelection(c)"')
    expect(source).toContain('@click="increaseCatalogSelection(c)"')
    expect(source).toContain('本次已选商品')
    expect(source).toContain('总价：{{ formatMoney(selectedCatalogTotal) }}')
  })

  it('F8：统计条包含「清洁中」卡片并与看板过滤联动（文案取 terms 的 RESOURCE_STATE_TEXT）', async () => {
    const source = await readSource('views/tenant/orders.vue')
    expect(source).toContain("boardStatus === 'cleaning'")
    expect(source).toContain('roomSummary.value.cleaning')
    expect(source).toContain("filterValue: 'cleaning'")
    expect(source).toContain('ROOM_STATE_LABEL.cleaning')
    expect(source).toContain('RESOURCE_STATE_TEXT')
  })

  it('F9：包厢卡片与目录项都有懒加载缩略图与失败占位', async () => {
    const source = await readSource('views/tenant/orders.vue')
    expect(source).toContain('loading="lazy"')
    expect(source).toContain('@error="markImageFailed(\'room-\' + room.id)"')
    expect(source).toContain('@error="markImageFailed(\'catalog-\' + c.id)"')
    expect(source).toContain('parseImageUrls')
    expect(source).toContain('room-thumb')
    expect(source).toContain('catalog-thumb')
  })

  it('F10：不再显示按容量编造的房型、默认区域、未分配服务人员等伪数据', async () => {
    const source = stripComments(await readSource('views/tenant/orders.vue'))
    for (const fake of ['迷你小包', '欢聚小包', '商务中包', '豪华大包', '派对大包', '默认区域', '房型未配置', "'未分配'", "'未分区'"]) {
      expect(source).not.toContain(fake)
    }
    expect(source).toContain('NOT_INTEGRATED')
  })

  it('F12：错误提示统一走 adminErrorMessage，不再直接拼接响应 message', async () => {
    const source = await readSource('views/tenant/orders.vue')
    expect(source).toContain("from '@/utils/adminErrorMessage'")
    expect(source).not.toContain('response?.data?.message')
  })

  it('i18n：币种与优惠类型转中文，时间统一走 formatTime', async () => {
    const source = await readSource('views/tenant/orders.vue')
    expect(source).toContain('currencyText(bill.currencyCode)')
    expect(source).toContain('promotionTypeText(p.type)')
    expect(source).toContain("from '@/utils/format'")
    expect(source).not.toContain('function formatTime')
  })
})

describe('全后台文案一致性', () => {
  it('formatTime 只在 utils/format.js 定义，各页面统一引用', async () => {
    const files = await collectVueFiles(path.join(srcRoot, 'views'))
    const offenders = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (/function formatTime/.test(source)) offenders.push(path.relative(srcRoot, file))
    }
    expect(offenders).toEqual([])
  })

  it('不再把 axios/框架英文原文（e.message）直接展示给运营人员', async () => {
    const files = await collectVueFiles(path.join(srcRoot, 'views'))
    const offenders = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (/ElMessage\.\w+\([^)]*\b(e|err|error)\?\.message/.test(source)) offenders.push(path.relative(srcRoot, file))
    }
    expect(offenders).toEqual([])
  })

  // F12：页面提示一律走 adminErrorMessage，避免把非统一错误体的英文原文透传给运营人员。
  it('页面不再自行拼接 response.data.message 作为唯一提示', async () => {
    const files = [
      ...await collectVueFiles(path.join(srcRoot, 'views')),
      ...await collectVueFiles(path.join(srcRoot, 'components')),
    ]
    const offenders = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (/ElMessage\.error\([^)]*\?\.response\?\.data\?\.message/.test(source)) offenders.push(path.relative(srcRoot, file))
    }
    expect(offenders).toEqual([])
  })

  it('消费端页面不在硬编码储值品牌名（取租户配置 wallet_brand_name）', async () => {
    for (const view of ['tenant/orders.vue', 'tenant/payments.vue', 'tenant/ktv-config.vue']) {
      const source = await readSource(`views/${view}`)
      expect(source).not.toContain('A380币')
    }
  })

  it('包厢/资源相关页面统一使用「包厢」术语，不出现「房间/包间」', async () => {
    for (const view of ['tenant/orders.vue', 'tenant/resources.vue', 'tenant/reservations.vue']) {
      const source = await readSource(`views/${view}`)
      expect(source).not.toContain('房间')
      expect(source).not.toContain('包间')
    }
  })

  it('订单中间加服务/商品统一表述为「加项」，不出现「加单/加菜/加点」（C 端口径一致）', async () => {
    const files = await collectVueFiles(srcRoot)
    const offenders = []
    for (const file of files) {
      const source = stripComments(await readFile(file, 'utf8'))
      if (/加单|加菜|加点/.test(source)) offenders.push(path.relative(srcRoot, file))
    }
    expect(offenders).toEqual([])
    // 两个入口按钮（房态卡片入口 + 点单弹窗提交）用统一文案
    const orders = await readSource('views/tenant/orders.vue')
    expect(orders).toContain('＋ 加项</el-button>')
    expect(orders).toContain('>确认加项</el-button>')
  })

  it('界面文案不出现英文占位词（SKELETON 等）', async () => {
    const files = await collectVueFiles(path.join(srcRoot, 'views'))
    const offenders = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (/\bSKELETON\b/.test(source)) offenders.push(path.relative(srcRoot, file))
    }
    expect(offenders).toEqual([])
  })
})
