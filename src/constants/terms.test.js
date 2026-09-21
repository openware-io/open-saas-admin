import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  AUDIT_ACTION_FALLBACK_OPTIONS,
  AUDIT_ACTION_TEXT,
  AUDIT_OPERATOR_TYPE_TEXT,
  AUDIT_RESOURCE_TYPE_TEXT,
  AUDIT_RESULT_OPTIONS,
  AUDIT_RESULT_TEXT,
  AUDIT_RESULT_TYPE,
  CATALOG_ITEM_TYPE_TEXT,
  DURATION_LABELS,
  ERRORS,
  FORBIDDEN_TERMS,
  MONEY_FIELD_TEXT,
  PRODUCT_STATUS_TEXT,
  PRODUCT_STATUS_TYPE,
  RESERVATION_STATUS_TEXT,
  RESOURCE_STATE_TEXT,
  SALES_ITEM_TYPE_TEXT,
  SESSION_STATUS_TEXT,
  SHIFT_CASH_TEXT,
  TERMS,
  WALLET_BRAND_NAME_DEFAULT,
  activeStatusActionText,
  activeStatusText,
  auditActionText,
  auditResourceTypeText,
  auditResultText,
  auditResultType,
  billingUnitShortText,
  billingUnitText,
  employeeTypeText,
  enabledStatusText,
  inventorySourceTypeText,
  inventoryTransactionTypeTag,
  inventoryTransactionTypeText,
  memberStatusText,
  memberWalletStatusText,
  moneyColumnLabel,
  moneyLabel,
  orderItemStatusText,
  orderStatusText,
  permissionTypeText,
  pointsEntryTypeText,
  productStatusText,
  salesItemTypeText,
  sessionStatusText,
  productStatusType,
  resolveWalletBrandName,
  resourceStateText,
  roomTypeStatusText,
  scopeTypeHintText,
  scopeTypeText,
  shiftStatusText,
  staffStatusActionText,
  staffStatusText,
  storeStatusText,
  tenantStatusText,
  unknownEnumText,
} from './terms'

/**
 * 术语/状态/错误提示单一出处的守卫 + i18n 防回退。
 *
 * 前一半是词表本身的契约（值不能悄悄漂移），后一半是源码级扫描：
 * 本轮统一过的口径（金额只在 utils/format、时间只在 formatTime、品牌名只在本文件）
 * 一旦被页面重新内联实现，就让测试红掉，而不是等下一轮审计再发现。
 */

const srcRoot = fileURLToPath(new URL('..', import.meta.url))

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

const readSource = (absolute) => readFile(absolute, 'utf8')

/** 去掉注释后再断言，避免「说明为什么不再这么写」的注释被误判成实现。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * 已知欠账：当前为空（orders.vue 已随本轮收口修完：金额/时间/状态文案都走统一出处）。
 * 若后续确有「必须临时保留的页内实现」，在此登记 相对路径 → 规则 id，并注明原因与清理批次。
 */
const KNOWN_DEBT = {}

/** 源码级回退规则：命中即视为回退（除已登记欠账外）。 */
const RULES = [
  {
    id: 'forbidden-term',
    // 禁用词是用户可见术语，注释里也不该再出现（避免复制粘贴回文案）。
    pattern: new RegExp(FORBIDDEN_TERMS.join('|')),
    message: '出现已废弃术语（房间/包间/商家/待收/房台）',
    stripComments: false,
  },
  {
    id: 'money-arithmetic',
    pattern: /[/\s]\/\s*100\b|[/\s]\*\s*100\b/,
    message: '页内自行做分/元换算，应改走 utils/format 的 fenToYuan / yuanToFen',
  },
  {
    id: 'currency-symbol',
    pattern: /¥/,
    message: '页内硬编码货币符号，应改走 utils/format 的 formatMoney',
  },
  {
    id: 'local-money-helper',
    pattern: /function\s+(fenToYuan|yuanToFen|yuanToMinor|minorToYuan|formatYuan)\s*\(|const\s+(fmtCents|fmtYuan)\s*=/,
    message: '重复实现金额换算/格式化函数，应改从 utils/format 引入',
  },
  {
    id: 'date-format',
    pattern: /toLocaleString\(|toLocaleTimeString\(|toLocaleDateString\(/,
    message: '页内自行格式化日期，应改走 utils/format 的 formatTime（避免依赖运行环境 locale）',
  },
]

async function findOffenders(dirs, extensions) {
  const offenders = []
  for (const dir of dirs) {
    for (const file of await collectFiles(path.join(srcRoot, dir), extensions)) {
      const relative = path.relative(srcRoot, file).split(path.sep).join('/')
      const raw = await readSource(file)
      const debt = KNOWN_DEBT[relative] || []
      for (const rule of RULES) {
        if (debt.includes(rule.id)) continue
        const source = rule.stripComments === false ? raw : stripComments(raw)
        if (rule.pattern.test(source)) offenders.push(`${relative} → ${rule.id}：${rule.message}`)
      }
    }
  }
  return offenders
}

describe('术语词表', () => {
  it('包厢是用户面唯一叫法，且不再出现「包厢/资源」并列', () => {
    expect(TERMS.ktvRoom).toBe('包厢')
    expect(TERMS.ktvServer).toBe('服务人员')
    expect(TERMS.roomBoard).toBe('房态看板')
    expect(TERMS.roomManagement).toBe('包厢管理')
  })

  it('主体称谓分层：平台=租户、门店=门店、B 端=商户', () => {
    expect(TERMS.tenant).toBe('租户')
    expect(TERMS.store).toBe('门店')
    expect(TERMS.merchant).toBe('商户')
  })

  it('金额字段统一「应收/已收/可退」，且列名不再绑定「元」（币种由 constants/currency 决定）', () => {
    expect(MONEY_FIELD_TEXT.payableAmount).toBe('应收')
    expect(MONEY_FIELD_TEXT.paidAmount).toBe('已收')
    expect(MONEY_FIELD_TEXT.refundableAmount).toBe('可退')
    expect(moneyColumnLabel('paidAmount')).toBe('已收')
    expect(moneyLabel('售价')).toBe('售价')
    expect(moneyColumnLabel('paidAmount')).not.toContain('元')
    expect(moneyLabel('售价')).not.toContain('元')
  })

  it('交班「实收现金」保留为盘点术语，不并入账单「已收」', () => {
    expect(SHIFT_CASH_TEXT.expected).toBe('应收现金')
    expect(SHIFT_CASH_TEXT.actual).toBe('实收现金')
    expect(SHIFT_CASH_TEXT.actual).not.toBe(MONEY_FIELD_TEXT.paidAmount)
  })

  it('「递增粒度（分钟）」明确时长单位，不再出现歧义的「(分)」', () => {
    expect(DURATION_LABELS.incrementMinutes).toBe('递增粒度（分钟）')
    expect(DURATION_LABELS.incrementMinutes).not.toContain('(分)')
    expect(DURATION_LABELS.defaultSessionMinutes).toBe('标准时长（分钟）')
  })

  it('禁用词清单包含本轮定稿淘汰的叫法', () => {
    for (const word of ['房间', '包间', '商家', '待收', '房台']) {
      expect(FORBIDDEN_TERMS).toContain(word)
    }
  })

  it('客户侧操作人类型统一「客户」，不再出现「顾客」（与 cst_member 展示口径一致）', () => {
    expect(AUDIT_OPERATOR_TYPE_TEXT.CUSTOMER).toBe('客户')
    expect(Object.values(AUDIT_OPERATOR_TYPE_TEXT)).not.toContain('顾客')
  })

  it('商品/服务销售排行品类词表：商品/服务/套餐/包厢费/加项都有中文，未知值不裸透英文', () => {
    expect(SALES_ITEM_TYPE_TEXT.PRODUCT).toBe('商品')
    expect(SALES_ITEM_TYPE_TEXT.SERVICE).toBe('服务')
    expect(SALES_ITEM_TYPE_TEXT.PACKAGE).toBe('套餐')
    expect(SALES_ITEM_TYPE_TEXT.ROOM_FEE).toBe('包厢费')
    expect(SALES_ITEM_TYPE_TEXT.ADD_ON).toBe('加项')
    expect(salesItemTypeText('SOMETHING_NEW')).toContain('未知')
  })

  it('KTV 会话状态三端统一：RESERVED 用「待开台」，不裸透英文枚举', () => {
    expect(SESSION_STATUS_TEXT.RESERVED).toBe('待开台')
    expect(sessionStatusText('OPEN')).toBe('计时中')
    expect(sessionStatusText('PAUSED')).toBe('已暂停')
    expect(sessionStatusText('CLOSED')).toBe('已结台')
    expect(sessionStatusText('CANCELLED')).toBe('已取消')
    expect(sessionStatusText(null)).toBe('—')
    // 未登记的新状态必须带「未知（…）」前缀，不能与正常文案混淆
    expect(sessionStatusText('SOME_NEW')).toContain('未知')
    // 会话态与资源态是两回事：包厢被预订才是「已预订」
    expect(RESOURCE_STATE_TEXT.RESERVED).toBe('已预订')
  })

  it('订单详情不再直接渲染 sessionStatus 原码（必须走 sessionStatusText）', async () => {
    const source = await readSource(path.join(srcRoot, 'views/tenant/order-management.vue'))
    expect(source).toContain('sessionStatusText(detailOrder.sessionStatus)')
    expect(source).not.toContain("{{ detailOrder.sessionStatus || '—' }}")
  })
})

describe('储值品牌名', () => {
  it('默认值与后端 tnt_tenant_config.wallet_brand_name 的默认值一致', () => {
    expect(WALLET_BRAND_NAME_DEFAULT).toBe('A380币')
  })

  it('只认租户配置，缺配置/空配置回落唯一默认值', () => {
    expect(resolveWalletBrandName({ brandName: '欢乐币' })).toBe('欢乐币')
    expect(resolveWalletBrandName({ brandName: '  ' })).toBe(WALLET_BRAND_NAME_DEFAULT)
    expect(resolveWalletBrandName({})).toBe(WALLET_BRAND_NAME_DEFAULT)
    expect(resolveWalletBrandName(null)).toBe(WALLET_BRAND_NAME_DEFAULT)
  })
})

describe('状态词表', () => {
  it('包厢状态覆盖后端枚举，未知枚举回落「未知（CODE）」而不是英文原文', () => {
    expect(resourceStateText('CLEANING')).toBe('清洁中')
    expect(resourceStateText('IN_USE')).toBe('使用中')
    expect(resourceStateText('UNKNOWN')).toBe('未知（UNKNOWN）')
    expect(resourceStateText('')).toBe('')
    expect(Object.keys(RESOURCE_STATE_TEXT).length).toBeGreaterThanOrEqual(8)
  })

  it('未知枚举统一回落「未知（CODE）」，空值回落占位符', () => {
    expect(unknownEnumText('WAITING_SETTLEMENT')).toBe('未知（WAITING_SETTLEMENT）')
    expect(unknownEnumText(null)).toBe('—')
    expect(unknownEnumText(undefined)).toBe('—')
    expect(unknownEnumText('')).toBe('—')
  })

  it('商品状态：草稿 / 已上架 / 已下架，且 tag 类型同步', () => {
    expect(PRODUCT_STATUS_TEXT).toEqual({ DRAFT: '草稿', ON_SHELF: '已上架', OFF_SHELF: '已下架' })
    expect(PRODUCT_STATUS_TYPE.ON_SHELF).toBe('success')
    expect(PRODUCT_STATUS_TYPE.OFF_SHELF).toBe('info')
    expect(PRODUCT_STATUS_TYPE.DRAFT).toBe('warning')
    expect(productStatusText('ON_SHELF')).toBe('已上架')
    expect(productStatusText('OFF_SHELF')).toBe('已下架')
    expect(productStatusText('DRAFT')).toBe('草稿')
    expect(productStatusText('SOMETHING_NEW')).toBe('未知（SOMETHING_NEW）')
    expect(productStatusType('ON_SHELF')).toBe('success')
    expect(productStatusType('SOMETHING_NEW')).toBe('info')
  })

  it('会员 / 储值 / 积分 / 门店 / 租户 / 运营人员 / 交班 / 订单状态全部有中文映射', () => {
    expect(memberStatusText('SUSPENDED')).toBe('暂停')
    expect(memberWalletStatusText('FROZEN')).toBe('冻结')
    expect(pointsEntryTypeText('REDEEM')).toBe('核销')
    expect(storeStatusText('ACTIVE')).toBe('营业中')
    expect(tenantStatusText('PENDING')).toBe('待开通')
    expect(staffStatusText('DISABLED')).toBe('禁用')
    expect(staffStatusActionText('ACTIVE')).toBe('禁用')
    expect(staffStatusActionText('DISABLED')).toBe('启用')
    expect(shiftStatusText('OPEN')).toBe('进行中')
    expect(orderStatusText('WAITING_SETTLEMENT')).toBe('待结算')
    expect(orderItemStatusText('PENDING_APPROVAL')).toBe('待确认')
    expect(enabledStatusText('ENABLED')).toBe('启用')
    expect(roomTypeStatusText('ACTIVE')).toBe('启用')
    expect(activeStatusText('DISABLED')).toBe('停用')
    expect(activeStatusActionText('ACTIVE')).toBe('停用')
    expect(employeeTypeText('CASHIER')).toBe('收银')
    expect(permissionTypeText('MENU')).toBe('菜单')
    expect(scopeTypeText('STORE')).toBe('门店级')
    expect(scopeTypeHintText('TENANT')).toBe('租户级（全部门店）')
    // 未知值一律不回落英文原文
    for (const value of [memberStatusText, storeStatusText, tenantStatusText, orderStatusText, employeeTypeText]) {
      expect(value('BRAND_NEW')).toBe('未知（BRAND_NEW）')
    }
  })

  it('计费单位 / 舍入方向 / 库存类型与来源都有中文词表（含短写法）', () => {
    expect(billingUnitText('HALF_HOUR')).toBe('按半小时')
    expect(billingUnitShortText('HALF_HOUR')).toBe('半小时')
    expect(billingUnitShortText('HOUR')).toBe('小时')
    expect(inventoryTransactionTypeText('RECEIPT')).toBe('采购入库')
    expect(inventoryTransactionTypeTag('CONSUME')).toBe('danger')
    expect(inventorySourceTypeText('ORDER_ITEM')).toBe('点单消费')
    expect(inventorySourceTypeText('NOPE')).toBe('未知（NOPE）')
    expect(inventorySourceTypeText('')).toBe('—')
  })

  it('预约状态词表覆盖后端枚举', () => {
    expect(Object.keys(RESERVATION_STATUS_TEXT)).toEqual(
      expect.arrayContaining(['PENDING', 'CONFIRMED', 'ARRIVED', 'CONVERTED', 'CANCELLED', 'NO_SHOW']),
    )
  })

  it('前端兜底提示集中在本文件，便于后续抽取 key', () => {
    expect(ERRORS.csrfTokenMissing).toBe('服务端未返回 CSRF token')
    expect(ERRORS.sessionExpired).toBe('登录已过期，请重新登录')
  })
})

describe('审计日志词表', () => {
  it('结果枚举与 tag 类型一一对应，未知结果不展示英文', () => {
    expect(auditResultText('SUCCESS')).toBe('成功')
    expect(auditResultText('FAILURE')).toBe('失败')
    expect(auditResultText('SUCCEEDED')).toBe('成功')
    expect(auditResultType('SUCCESS')).toBe('success')
    expect(auditResultType('FAILURE')).toBe('danger')
    expect(auditResultType('UNKNOWN_RESULT')).toBe('info')
    expect(auditResultText('UNKNOWN_RESULT')).toBe('未知（UNKNOWN_RESULT）')
    expect(auditResultText(null)).toBe('—')
    expect(Object.keys(AUDIT_RESULT_TEXT).length).toBeGreaterThanOrEqual(2)
    expect(Object.keys(AUDIT_RESULT_TYPE).length).toBe(Object.keys(AUDIT_RESULT_TEXT).length)
  })

  it('结果筛选项只给后端允许的 SUCCESS / FAILURE（其它值后端 400）', () => {
    expect(AUDIT_RESULT_OPTIONS.map((item) => item.value)).toEqual(['SUCCESS', 'FAILURE'])
    for (const item of AUDIT_RESULT_OPTIONS) {
      expect(item.label).toBe(AUDIT_RESULT_TEXT[item.value])
      expect(/[A-Za-z]/.test(item.label)).toBe(false)
    }
  })

  it('操作优先用后端 actionLabel，缺标签时按动作码推导，最后才回落「未知（CODE）」', () => {
    expect(auditActionText('order.settle', '结台结算')).toBe('结台结算')
    expect(auditActionText('order.settle', null)).toBe('结算')
    expect(auditActionText('product.publish')).toBe('上架')
    expect(auditActionText('CREATE')).toBe(AUDIT_ACTION_TEXT.CREATE)
    expect(auditActionText('brand.new_verb')).toBe('未知（brand.new_verb）')
    expect(auditActionText(null)).toBe('—')
    // 兜底下拉的动作码与中文都不含英文裸码
    for (const item of AUDIT_ACTION_FALLBACK_OPTIONS) {
      expect(item.value).toMatch(/^[a-z][a-z0-9_.]*$/)
      expect(/[A-Za-z]/.test(item.label)).toBe(false)
    }
  })

  it('资源类型覆盖后端表名形态（ord_order / res_resource）与语义码形态', () => {
    expect(Object.keys(AUDIT_RESOURCE_TYPE_TEXT).length).toBeGreaterThanOrEqual(30)
    expect(auditResourceTypeText('ord_order')).toBe('订单')
    expect(auditResourceTypeText('ord_product')).toBe('商品')
    expect(auditResourceTypeText('res_resource')).toBe(TERMS.ktvRoom)
    expect(auditResourceTypeText('ORDER')).toBe('订单')
    expect(auditResourceTypeText('mystery_table')).toBe('未知（mystery_table）')
  })
})

describe('i18n 防回退（源码扫描）', () => {
  it('页面不再硬编码货币符号或自行做分/元换算', async () => {
    expect(await findOffenders(['views'], ['.vue', '.js'])).toEqual([])
  })

  it('只有 constants/terms.js 可以写死储值品牌名', async () => {
    for (const dir of ['views', 'constants', 'api', 'utils']) {
      for (const file of await collectFiles(path.join(srcRoot, dir), ['.vue', '.js'])) {
        const relative = path.relative(srcRoot, file).split(path.sep).join('/')
        if (relative === 'constants/terms.js') continue
        const source = await readSource(file)
        expect(`${relative}:${/A380币/.test(source)}`).toBe(`${relative}:false`)
      }
    }
  })

  it('formatTime 只在 utils/format.js 定义（页面统一引用）', async () => {
    for (const file of await collectFiles(path.join(srcRoot, 'views'), ['.vue', '.js'])) {
      const relative = path.relative(srcRoot, file).split(path.sep).join('/')
      const source = await readSource(file)
      expect(`${relative}:${/function\s+formatTime/.test(source)}`).toBe(`${relative}:false`)
    }
  })
})

// —— 枚举中文化防回退（模板 / 脚本扫描）———————————————————————————
/**
 * 每条规则都对应本轮实际改掉的一类问题：
 *  1) bare-enum-interpolation：模板直接插值后端枚举字段（原 pricing-plans.vue 的 `{{ row.status }}`、
 *     iam/permissions.vue 的 `{{ row.type }}`）；
 *  2) inline-enum-ternary：模板内联「英文枚举 → 中文」三元（原 shift/staff/resources/products.vue）；
 *  3) prop-only-enum-column：el-table-column 只给 prop 不给渲染（原 products.vue 的 `prop="status"`）；
 *  4) english-option-label：el-option 的 label 直接写英文枚举（原 iam/roles.vue 的 `label="PLATFORM"`）；
 *  5) inline-enum-map：页面内自建「英文枚举 → 中文」映射对象（原 members/points/stores/tenants/staff/
 *     inventory/orders.vue 各自的 statusText / TRANSACTION_TYPES / SOURCE_TYPES）。
 * 命中即视为回退：展示后端枚举一律走 constants/terms 的 *Text 函数。
 */
const ENUM_FIELD_NAMES = [
  'status', 'state', 'result', 'action', 'resourceType', 'operatorType',
  'transactionType', 'sourceType', 'entryType', 'billingUnit', 'roundingDirection',
  'scope', 'businessType', 'promotionType',
]
const ENUM_FIELD_ALTERNATION = ENUM_FIELD_NAMES.join('|')
const BARE_ENUM_INTERPOLATION = new RegExp(
  String.raw`\{\{\s*(?:[A-Za-z_$][\w$]*\.)*(?:${ENUM_FIELD_ALTERNATION})\s*\}\}`,
)
const INLINE_ENUM_TERNARY = /\{\{[^}]*===\s*'[A-Z][A-Z0-9_]*'[^}]*[\u4e00-\u9fff][^}]*\}\}/
const PROP_ONLY_ENUM_COLUMN = new RegExp(
  String.raw`<el-table-column(?=[^>]*\bprop="(?:${ENUM_FIELD_ALTERNATION})")[^>]*/>`,
)
const ENGLISH_OPTION_LABEL = /<el-option[^>]*\blabel="[A-Z][A-Z0-9_]*"/
const INLINE_ENUM_MAP = /\{\s*[A-Z][A-Z0-9_]*\s*:\s*'[^']*[\u4e00-\u9fff]/

/** 只取 `<template>…</template>`：脚本里的条件判断（v-if 之外的逻辑）不在「展示」的射程内。 */
function templateOf(source) {
  const match = source.match(/<template>([\s\S]*)<\/template>/)
  return match ? match[1] : ''
}

async function findEnumRenderingOffenders() {
  const offenders = []
  for (const dir of ['views', 'components']) {
    for (const file of await collectFiles(path.join(srcRoot, dir), ['.vue'])) {
      const relative = path.relative(srcRoot, file).split(path.sep).join('/')
      const stripped = stripComments(await readSource(file))
      const template = templateOf(stripped)
      const checks = [
        [BARE_ENUM_INTERPOLATION, template, '模板直接插值后端枚举字段，应改走 constants/terms 的 *Text 词表'],
        [INLINE_ENUM_TERNARY, template, '模板内联「英文枚举 → 中文」三元，应改走 constants/terms 的 *Text 词表'],
        [PROP_ONLY_ENUM_COLUMN, template, 'el-table-column 直接绑定枚举 prop 且无中文渲染'],
        [ENGLISH_OPTION_LABEL, template, 'el-option 的 label 直接写英文枚举，应改走 *Text 词表'],
        [INLINE_ENUM_MAP, stripped, '页面内自建「英文枚举 → 中文」映射对象，应上移到 constants/terms'],
      ]
      for (const [pattern, haystack, message] of checks) {
        if (pattern.test(haystack)) offenders.push(`${relative} → ${message}`)
      }
    }
  }
  return offenders
}

describe('枚举中文化防回退（模板 / 脚本扫描）', () => {
  it('views / components 不再直接渲染后端英文枚举', async () => {
    expect(await findEnumRenderingOffenders()).toEqual([])
  })

  it('每个词表都有中文映射，且不把后端枚举原文当兜底', () => {
    const dictionaries = {
      PRODUCT_STATUS_TEXT,
      CATALOG_ITEM_TYPE_TEXT,
      RESERVATION_STATUS_TEXT,
      RESOURCE_STATE_TEXT,
      AUDIT_RESULT_TEXT,
    }
    for (const [name, dictionary] of Object.entries(dictionaries)) {
      expect(`${name}:${Object.keys(dictionary).length > 0}`).toBe(`${name}:true`)
      for (const value of Object.values(dictionary)) {
        expect(`${name}:${/[A-Za-z]{4,}/.test(value)}`).toBe(`${name}:false`)
      }
    }
  })
})
