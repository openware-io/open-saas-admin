import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  AUDIT_PAGE_SIZES,
  buildAuditQuery,
  flattenAuditDetail,
  maskAuditDetailValue,
  normalizeAuditRow,
  parseAuditDetail,
  parseAuditListResponse,
  shouldShowTenantColumn,
} from './audit'

/**
 * 审计日志（GET /api/v1/admin/audits，平台侧并行开发）字段映射与容错。
 *
 * 后端契约见 src/api/audit.js；本文件固化的口径：
 *  - 列表字段缺失不报错、操作优先 actionLabel、结果 tag 与中文同源 terms 词表；
 *  - 租户列只在平台视角展示（前端只做展示分层，越权拦截在后端）；
 *  - detailJson 只做「格式化 + 脱敏」，非法 JSON 时隐藏原始内容。
 */

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

describe('parseAuditListResponse', () => {
  it('契约字段 items/total 正常解析', () => {
    const data = parseAuditListResponse({ items: [{ id: 1 }], total: 42, page: 2, pageSize: 20 })
    expect(data.items).toHaveLength(1)
    expect(data.total).toBe(42)
    expect(data.page).toBe(2)
    expect(data.pageSize).toBe(20)
  })

  it('items 缺失 / 命名不同（records、list、rows）都能容错，total 缺失退回当前页条数', () => {
    expect(parseAuditListResponse(null)).toEqual({
      items: [], total: 0, totalSkipped: false, totalCapped: false, retentionFloor: null,
      page: 1, pageSize: AUDIT_PAGE_SIZES[0],
    })
    expect(parseAuditListResponse({ records: [{ id: 1 }, { id: 2 }] }).total).toBe(2)
    expect(parseAuditListResponse({ list: [] }).items).toEqual([])
    expect(parseAuditListResponse({ rows: [{ id: 3 }] }).items).toHaveLength(1)
    expect(parseAuditListResponse([{ id: 1 }]).total).toBe(1)
  })

  // 保留策略回执：早于该时间的月份已归档并移出可查范围，界面必须据此提示而不是静默显示空列表。
  it('retentionFloor 透传，缺失或空值归一为 null', () => {
    expect(parseAuditListResponse({ items: [], retentionFloor: '2024-10-01T00:00' }).retentionFloor)
      .toBe('2024-10-01T00:00')
    expect(parseAuditListResponse({ items: [] }).retentionFloor).toBeNull()
    expect(parseAuditListResponse({ items: [], retentionFloor: '   ' }).retentionFloor).toBeNull()
    expect(parseAuditListResponse({ items: [], retentionFloor: 123 }).retentionFloor).toBeNull()
  })

  // 后端 skipCount 约定回 total=-1：必须被识别为「本次没统计」，不能让翻页把总数刷成 0/1。
  it('total=-1 识别为「本次跳过统计」，退回当前页条数并打标记', () => {
    const data = parseAuditListResponse({ items: [{ id: 1 }, { id: 2 }], total: -1, page: 3, pageSize: 20 })
    expect(data.totalSkipped).toBe(true)
    expect(data.total).toBe(2)
    expect(data.page).toBe(3)
  })

  it('totalCapped 透传，供界面显示「仅统计到 N 条」', () => {
    expect(parseAuditListResponse({ items: [], total: 100000, totalCapped: true }).totalCapped).toBe(true)
    expect(parseAuditListResponse({ items: [], total: 12 }).totalCapped).toBe(false)
  })
})

describe('buildAuditQuery', () => {
  it('空值不下发（避免后端把空串当筛选条件）', () => {
    expect(buildAuditQuery({
      page: 1,
      pageSize: 10,
      fromAt: '',
      toAt: null,
      operatorKeyword: '  ',
      action: 'order.settle',
      resourceType: undefined,
      result: 'FAILURE',
      tenantId: '',
    })).toEqual({ page: 1, pageSize: 10, action: 'order.settle', result: 'FAILURE' })
  })

  it('时间区间用后端参数名 fromAt/toAt，同时兼容契约文档的 from/to 写法', () => {
    expect(buildAuditQuery({
      page: 2,
      pageSize: 20,
      fromAt: '2026-09-01 00:00:00',
      toAt: '2026-09-30 23:59:59',
      operatorKeyword: ' 张三 ',
      resourceId: 88,
      tenantId: 12,
    })).toEqual({
      page: 2,
      pageSize: 20,
      tenantId: 12,
      operatorKeyword: '张三',
      resourceId: 88,
      fromAt: '2026-09-01 00:00:00',
      toAt: '2026-09-30 23:59:59',
      from: '2026-09-01 00:00:00',
      to: '2026-09-30 23:59:59',
    })
  })

  it('只给 from/to 时同样能生成 fromAt/toAt（兼容两种入参命名）', () => {
    expect(buildAuditQuery({ from: '2026-09-01 00:00:00', to: '2026-09-02 00:00:00' })).toEqual({
      fromAt: '2026-09-01 00:00:00',
      toAt: '2026-09-02 00:00:00',
      from: '2026-09-01 00:00:00',
      to: '2026-09-02 00:00:00',
    })
  })

  it('result 只按后端允许的枚举下发（历史拼写不下发）', () => {
    expect(buildAuditQuery({ result: 'SUCCESS' }).result).toBe('SUCCESS')
    expect(buildAuditQuery({ result: 'FAILURE' }).result).toBe('FAILURE')
    expect(buildAuditQuery({ result: '' }).result).toBeUndefined()
  })

  // skipCount 只在翻页（第 2 页起）下发；筛选变化时必须重新统计，所以默认不下发。
  it('skipCount 仅在显式为 true 时下发（缺省与 false 都不带该参数）', () => {
    expect(buildAuditQuery({ page: 1, pageSize: 20 }).skipCount).toBeUndefined()
    expect(buildAuditQuery({ page: 2, pageSize: 20, skipCount: false }).skipCount).toBeUndefined()
    expect(buildAuditQuery({ page: 2, pageSize: 20, skipCount: true })).toEqual({
      page: 2, pageSize: 20, skipCount: true,
    })
  })
})

describe('normalizeAuditRow', () => {
  it('完整契约字段的展示映射', () => {
    const row = normalizeAuditRow({
      id: 1,
      createdAt: '2026-09-20T14:05:33',
      tenantId: 12,
      tenantName: '欢乐 KTV',
      operatorId: 9,
      operatorName: '张三',
      operatorType: 'PLATFORM',
      action: 'CREATE',
      actionLabel: '新增商品',
      resourceType: 'PRODUCT',
      resourceId: 88,
      resourceName: '可乐 330ml',
      result: 'SUCCESS',
      errorCode: null,
      ip: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
      requestId: 'req-1',
      detailJson: '{"name":"可乐 330ml"}',
    })
    expect(row.createdAtText).toBe('2026-09-20 14:05')
    expect(row.tenantText).toBe('欢乐 KTV')
    expect(row.operatorText).toBe('张三')
    expect(row.operatorTypeText).toBe('平台账号')
    expect(row.actionText).toBe('新增商品')
    expect(row.resourceText).toBe('商品 · 可乐 330ml')
    expect(row.resultText).toBe('成功')
    expect(row.resultType).toBe('success')
    expect(row.ipText).toBe('10.0.0.1')
    expect(row.requestIdText).toBe('req-1')
  })

  it('actionLabel 缺失回落 action（走词表/动作码推导），再缺失回落占位', () => {
    expect(normalizeAuditRow({ action: 'order.settle' }).actionText).toBe('结算')
    expect(normalizeAuditRow({ action: 'product.publish' }).actionText).toBe('上架')
    expect(normalizeAuditRow({ action: 'CREATE' }).actionText).toBe('新增')
    expect(normalizeAuditRow({ action: 'BRAND_NEW' }).actionText).toBe('未知（BRAND_NEW）')
    expect(normalizeAuditRow({}).actionText).toBe('—')
  })

  it('时间列：createdAt 优先，只有业务发生时间 occurredAt 时也能展示', () => {
    expect(normalizeAuditRow({ createdAt: '2026-09-20T14:05:33' }).createdAtText).toBe('2026-09-20 14:05')
    expect(normalizeAuditRow({ occurredAt: '2026-09-21T09:00:00' }).createdAtText).toBe('2026-09-21 09:00')
    expect(normalizeAuditRow({}).createdAtText).toBe('—')
  })

  it('结果缺失 / 未知都不报错：tag 类型回落 info，文案回落「未知（CODE）」', () => {
    const missing = normalizeAuditRow({})
    expect(missing.resultText).toBe('—')
    expect(missing.resultType).toBe('info')
    const failed = normalizeAuditRow({ result: 'FAILURE' })
    expect(failed.resultText).toBe('失败')
    expect(failed.resultType).toBe('danger')
    const unknown = normalizeAuditRow({ result: 'UNHEARD_OF' })
    expect(unknown.resultText).toBe('未知（UNHEARD_OF）')
    expect(unknown.resultType).toBe('info')
  })

  it('字段大面积缺失时全部走占位，不出现 undefined / null 文案', () => {
    const row = normalizeAuditRow(undefined)
    for (const key of ['createdAtText', 'tenantText', 'operatorText', 'actionText', 'resourceText', 'resultText', 'ipText', 'userAgentText', 'requestIdText']) {
      expect(row[key], key).toBeDefined()
      expect(String(row[key]), key).not.toContain('undefined')
      expect(String(row[key]), key).not.toContain('null')
    }
    expect(row.ipText).toBe('—')
    expect(row.userAgentText).toBe('—')
  })

  it('资源只有 ID 时展示类型 + #ID；资源类型未知回落「未知（CODE）」', () => {
    expect(normalizeAuditRow({ resourceType: 'ord_order', resourceId: 5 }).resourceText).toBe('订单 · #5')
    expect(normalizeAuditRow({ resourceType: 'ORDER' }).resourceText).toBe('订单')
    expect(normalizeAuditRow({ resourceType: 'MYSTERY' }).resourceText).toBe('未知（MYSTERY）')
    expect(normalizeAuditRow({}).resourceText).toBe('—')
  })

  it('操作人缺姓名时退账号，再退 #ID', () => {
    expect(normalizeAuditRow({ operatorAccount: 'zhangsan' }).operatorText).toBe('zhangsan')
    expect(normalizeAuditRow({ operatorId: 9 }).operatorText).toBe('#9')
    expect(normalizeAuditRow({}).operatorText).toBe('—')
  })
})

describe('租户列展示分层', () => {
  it('只有平台视角展示租户列', () => {
    expect(shouldShowTenantColumn('PLATFORM')).toBe(true)
    expect(shouldShowTenantColumn('TENANT')).toBe(false)
    expect(shouldShowTenantColumn(undefined)).toBe(false)
  })

  it('audits.vue 的租户列由 showTenantColumn 控制，时间/操作/资源/结果/IP 列齐备', async () => {
    const source = await read('../views/tenant/audits.vue')
    expect(source).toContain('v-if="showTenantColumn"')
    expect(source).toContain('shouldShowTenantColumn(authStore.scope)')
    for (const header of ['时间', '租户', '操作人', '操作', '资源', '结果', 'IP']) {
      expect(source).toContain(`label="${header}"`)
    }
    // 统一分页骨架
    expect(source).toContain('admin-pagination')
    // 时间/金额口径：时间走 formatTime（utils/audit.normalizeAuditRow），页面不自行格式化
    expect(source).not.toContain('toLocaleString(')
  })
})

describe('parseAuditDetail / flattenAuditDetail', () => {
  it('对象与 JSON 字符串都能解析，非法 JSON 标记 ok:false（页面隐藏原始内容）', () => {
    expect(parseAuditDetail({ a: 1 })).toEqual({ ok: true, value: { a: 1 } })
    expect(parseAuditDetail('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseAuditDetail('').ok).toBe(true)
    expect(parseAuditDetail(null).value).toBeNull()
    expect(parseAuditDetail('not-json').ok).toBe(false)
  })

  it('扁平化为「标签 / 值」行，嵌套字段保留路径', () => {
    const { ok, entries } = flattenAuditDetail({
      before: { salePrice: 100 },
      after: { salePrice: 200 },
      reason: '调价',
    })
    expect(ok).toBe(true)
    const byKey = Object.fromEntries(entries.map((item) => [item.key, item]))
    expect(byKey['before.salePrice'].value).toBe('100')
    expect(byKey['after.salePrice'].value).toBe('200')
    expect(byKey.reason.label).toBe('原因')
    expect(byKey.reason.value).toBe('调价')
  })

  it('敏感字段脱敏：密码/令牌打码，手机号与邮箱保留可辨识片段', () => {
    expect(maskAuditDetailValue('password', 'P@ssw0rd')).toBe('***')
    expect(maskAuditDetailValue('accessToken', 'abc.def.ghi')).toBe('***')
    expect(maskAuditDetailValue('phone', '13812341234')).toBe('138****1234')
    expect(maskAuditDetailValue('email', 'zhangsan@example.com')).toBe('z***@example.com')
    expect(maskAuditDetailValue('idCard', '310101199001011234')).toBe('31****34')
    expect(maskAuditDetailValue('remark', '')).toBe('—')

    const { entries } = flattenAuditDetail({ password: 'P@ssw0rd', phone: '13812341234', note: 'ok' })
    const byKey = Object.fromEntries(entries.map((item) => [item.key, item.value]))
    expect(byKey.password).toBe('***')
    expect(byKey.phone).toBe('138****1234')
    expect(byKey.note).toBe('ok')
  })

  it('超长值截断，过深层级与超长数组不会撑爆页面', () => {
    const longText = 'x'.repeat(500)
    const { entries } = flattenAuditDetail({ note: longText, deep: { a: { b: { c: { d: 1 } } } }, list: Array.from({ length: 25 }, (_, i) => ({ i })) })
    const byKey = Object.fromEntries(entries.map((item) => [item.key, item.value]))
    expect(byKey.note.endsWith('…')).toBe(true)
    expect(byKey.note.length).toBeLessThanOrEqual(201)
    expect(byKey['deep.a.b']).toBe('（层级过深，已省略）')
    expect(entries.filter((item) => item.key.startsWith('list[')).length).toBeLessThanOrEqual(20)
    expect(entries.some((item) => String(item.value).includes('其余 5 项已省略'))).toBe(true)
  })

  it('明细里的枚举值按统一词表转中文（result / action / resourceType / operatorType）', () => {
    const { entries } = flattenAuditDetail({
      result: 'FAILED',
      action: 'CREATE',
      resourceType: 'PRODUCT',
      operatorType: 'PLATFORM',
    })
    const byKey = Object.fromEntries(entries.map((item) => [item.key, item.value]))
    expect(byKey.result).toBe('失败')
    expect(byKey.action).toBe('新增')
    expect(byKey.resourceType).toBe('商品')
    expect(byKey.operatorType).toBe('平台账号')
  })

  it('非法 JSON 不渲染原始字符串，只返回 ok:false', () => {
    const result = flattenAuditDetail('{"broken": ')
    expect(result.ok).toBe(false)
    expect(result.entries).toEqual([])
  })

  it('空明细返回空行数组', () => {
    expect(flattenAuditDetail(null)).toEqual({ ok: true, entries: [] })
    expect(flattenAuditDetail('')).toEqual({ ok: true, entries: [] })
  })
})
