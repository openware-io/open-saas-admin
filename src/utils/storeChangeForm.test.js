import { describe, expect, it } from 'vitest'
import {
  CUTOFF_MAX,
  CUTOFF_MIN,
  STORE_CHANGE_REASON_MAX_LENGTH,
  STORE_CODE_PATTERN,
  STORE_STATUS_TRANSITIONS,
  buildChangeDiff,
  buildChangeDiffForRequest,
  buildChangeRequestBody,
  buildCreatePayload,
  buildStatusPayload,
  buildStoreChangeActions,
  buildUpdatePayload,
  canTransitionStoreStatus,
  changeActionLabel,
  createIdempotencyKey,
  emptyStoreChangeForm,
  isValidBusinessDayCutoff,
  isValidTimezone,
  mergePendingRequests,
  normalizeChangeRequestPage,
  normalizeCreateDefaults,
  normalizeServerDiff,
  organizationOptionsWithCurrent,
  pendingCreateRequests,
  pendingRequestLabel,
  requestStatusText,
  requestStatusType,
  requestSummaryText,
  requestTypeText,
  storeChangeFormFromRow,
  validateChangeRequest,
  withCurrentOption,
} from './storeChangeForm'

/**
 * 门店变更申请（申请 → 审批 → 执行）纯函数契约。
 *
 * 这些断言对应后端 `StoreChangeRequest` 请求体：`requestType` 决定 payload 形状，
 * `reason` 必填，UPDATE/STATUS/DELETE 必须带 `baseVersion`（= 门店 `version`）；
 * 页面只是调用本模块，因此把「payload 裁剪 / 校验 / 状态机 / diff / 状态文案」都钉在单测里。
 */
const CREATE_DEFAULTS = {
  timezone: 'Asia/Shanghai',
  locale: 'zh-CN',
  businessDayCutoff: '04:00',
  defaultCurrency: 'CNY',
  businessTypes: ['KTV', 'HOTEL'],
  organizations: [{ id: 7, name: '华南区' }],
}

const STORE_ROW = {
  id: 12,
  version: 3,
  code: 'SZ-001',
  name: '深圳旗舰店',
  businessType: 'KTV',
  timezone: 'Asia/Shanghai',
  businessDayCutoff: '04:00:00',
  organizationId: 7,
  locale: 'zh-CN',
  logoUrl: '',
  status: 'ACTIVE',
}

const PENDING_UPDATE = {
  id: 88,
  storeId: 12,
  requestType: 'UPDATE',
  status: 'PENDING',
  payload: { name: '新名字' },
  before: { name: '深圳旗舰店' },
  summary: '编辑：名称「深圳旗舰店」→「新名字」',
}

describe('create-defaults 与表单默认值', () => {
  it('兼容字符串数组与对象数组，缺省时回落后端同款默认值', () => {
    expect(normalizeCreateDefaults(CREATE_DEFAULTS)).toEqual({
      timezone: 'Asia/Shanghai',
      locale: 'zh-CN',
      businessDayCutoff: '04:00',
      defaultCurrency: 'CNY',
      businessTypes: ['KTV', 'HOTEL'],
      organizations: [{ id: 7, name: '华南区' }],
    })
    expect(normalizeCreateDefaults({
      businessTypes: [{ code: 'KTV', name: 'KTV' }, { businessType: 'HOTEL' }],
      organizations: [3, { organizationId: 4 }],
    })).toMatchObject({
      timezone: 'Asia/Shanghai',
      locale: 'zh-CN',
      businessDayCutoff: '04:00',
      businessTypes: ['KTV', 'HOTEL'],
      organizations: [{ id: 3, name: '组织 #3' }, { id: 4, name: '组织 #4' }],
    })
    expect(normalizeCreateDefaults(null).businessTypes).toEqual(['KTV'])
    expect(normalizeCreateDefaults(null).organizations).toEqual([])
  })

  it('新增表单默认值：时区/语言/切点取默认值，组织兜底 0（未归属组织）', () => {
    const form = emptyStoreChangeForm(CREATE_DEFAULTS)
    expect(form).toMatchObject({
      code: '',
      name: '',
      businessType: 'KTV',
      timezone: 'Asia/Shanghai',
      locale: 'zh-CN',
      businessDayCutoff: '04:00',
      organizationId: 0,
      logoUrl: '',
    })
  })

  it('编辑回填：营业日切点转 HH:mm，组织空值归一 0', () => {
    const form = storeChangeFormFromRow(STORE_ROW)
    expect(form.businessDayCutoff).toBe('04:00')
    expect(form.organizationId).toBe(7)
    expect(storeChangeFormFromRow({ organizationId: null }).organizationId).toBe(0)
  })
})

describe('payload 构建', () => {
  it('CREATE 只带建店白名单字段，不含 status/tenantId/version 等后端决定字段', () => {
    const payload = buildCreatePayload({
      code: ' SZ-002 ',
      name: ' 深圳二店 ',
      businessType: 'KTV',
      timezone: 'Asia/Shanghai',
      locale: 'zh-CN',
      businessDayCutoff: '04:00:00',
      organizationId: 7,
      countryCode: '',
      regionCode: '440305',
      logoUrl: '/media/store.png',
    })
    expect(payload).toEqual({
      code: 'SZ-002',
      name: '深圳二店',
      businessType: 'KTV',
      timezone: 'Asia/Shanghai',
      locale: 'zh-CN',
      businessDayCutoff: '04:00',
      organizationId: 7,
      regionCode: '440305',
      logoUrl: '/media/store.png',
    })
    for (const forbidden of ['status', 'tenantId', 'version', 'baseVersion', 'id']) {
      expect(payload).not.toHaveProperty(forbidden)
    }
  })

  it('UPDATE 只提交变化字段（编号不可改），切点 04:00:00 与 04:00 视为相同', () => {
    const form = { ...storeChangeFormFromRow(STORE_ROW), name: '深圳旗舰店（新）' }
    expect(buildUpdatePayload(form, STORE_ROW)).toEqual({ name: '深圳旗舰店（新）' })
    expect(buildUpdatePayload(storeChangeFormFromRow(STORE_ROW), STORE_ROW)).toBeNull()
  })

  it('UPDATE 业态/时区/切点/组织/Logo 变化都进入 payload', () => {
    const form = {
      ...storeChangeFormFromRow(STORE_ROW),
      businessType: 'HOTEL',
      timezone: 'UTC',
      businessDayCutoff: '00:00',
      organizationId: 0,
      logoUrl: '/media/logo.png',
    }
    expect(buildUpdatePayload(form, STORE_ROW)).toEqual({
      businessType: 'HOTEL',
      timezone: 'UTC',
      businessDayCutoff: '00:00',
      organizationId: 0,
      logoUrl: '/media/logo.png',
    })
  })

  it('STATUS payload 为目标状态', () => {
    expect(buildStatusPayload('suspended')).toEqual({ targetStatus: 'SUSPENDED' })
  })
})

describe('提交请求体组装', () => {
  it('CREATE：无 storeId/baseVersion，带 payload/reason/idempotencyKey', () => {
    const body = buildChangeRequestBody({
      requestType: 'CREATE',
      form: { ...emptyStoreChangeForm(CREATE_DEFAULTS), code: 'SZ-002', name: '深圳二店' },
      reason: ' 华南区新店开业 ',
      idempotencyKey: 'idem-1',
    })
    expect(body.requestType).toBe('CREATE')
    expect(body.reason).toBe('华南区新店开业')
    expect(body.idempotencyKey).toBe('idem-1')
    expect(body).not.toHaveProperty('storeId')
    expect(body).not.toHaveProperty('baseVersion')
    expect(body.payload).toMatchObject({ code: 'SZ-002', name: '深圳二店', organizationId: 0 })
  })

  it('UPDATE/STATUS/DELETE 都必须带 storeId + baseVersion（取门店 version）', () => {
    const form = { ...storeChangeFormFromRow(STORE_ROW), name: '新名字' }
    const update = buildChangeRequestBody({ requestType: 'UPDATE', form, row: STORE_ROW, reason: '门店更名' })
    expect(update).toMatchObject({
      requestType: 'UPDATE',
      storeId: 12,
      baseVersion: 3,
      reason: '门店更名',
      payload: { name: '新名字' },
    })

    const status = buildChangeRequestBody({
      requestType: 'STATUS', row: STORE_ROW, targetStatus: 'SUSPENDED', reason: '合同到期暂停经营',
    })
    expect(status).toMatchObject({
      requestType: 'STATUS',
      storeId: 12,
      baseVersion: 3,
      payload: { targetStatus: 'SUSPENDED' },
    })

    const remove = buildChangeRequestBody({ requestType: 'DELETE', row: STORE_ROW, reason: '门店撤店归档' })
    expect(remove).toMatchObject({ requestType: 'DELETE', storeId: 12, baseVersion: 3 })
    expect(remove).not.toHaveProperty('payload')
  })

  it('显式 baseVersion 优先；不支持的类型返回 null；空 idempotencyKey 不下发', () => {
    const body = buildChangeRequestBody({
      requestType: 'DELETE', row: STORE_ROW, reason: '归档', baseVersion: 9, idempotencyKey: '  ',
    })
    expect(body.baseVersion).toBe(9)
    expect(body).not.toHaveProperty('idempotencyKey')
    expect(buildChangeRequestBody({ requestType: 'UNKNOWN', row: STORE_ROW, reason: 'x' })).toBeNull()
  })
})

describe('提交前校验（理由必填 + 按类型校验）', () => {
  const createForm = () => ({
    ...emptyStoreChangeForm(CREATE_DEFAULTS),
    code: 'SZ-002',
    name: '深圳二店',
    reason: '',
  })

  it('理由必填且不超过 512 字（所有类型一致）', () => {
    for (const requestType of ['CREATE', 'UPDATE', 'STATUS', 'DELETE']) {
      const result = validateChangeRequest({ requestType, form: createForm(), row: STORE_ROW, targetStatus: 'SUSPENDED', reason: '  ' })
      expect(result).toMatchObject({ ok: false, field: 'reason', message: '请填写申请理由。' })
    }
    const tooLong = validateChangeRequest({
      requestType: 'DELETE',
      row: STORE_ROW,
      reason: 'x'.repeat(STORE_CHANGE_REASON_MAX_LENGTH + 1),
    })
    expect(tooLong.ok).toBe(false)
    expect(tooLong.message).toContain('512')
  })

  it('CREATE：编号/名称/时区/营业日切点逐项校验', () => {
    const valid = validateChangeRequest({ requestType: 'CREATE', form: { ...createForm(), reason: '开新店' }, reason: '开新店' })
    expect(valid.ok).toBe(true)
    expect(validateChangeRequest({ requestType: 'CREATE', form: { ...createForm(), code: '1', reason: 'x' }, reason: 'x' }).field).toBe('code')
    expect(validateChangeRequest({ requestType: 'CREATE', form: { ...createForm(), code: 'SZ-2', name: ' ', reason: 'x' }, reason: 'x' }).field).toBe('name')
    expect(validateChangeRequest({ requestType: 'CREATE', form: { ...createForm(), timezone: '+08:00', reason: 'x' }, reason: 'x' }).field).toBe('timezone')
    expect(validateChangeRequest({ requestType: 'CREATE', form: { ...createForm(), businessDayCutoff: '13:00', reason: 'x' }, reason: 'x' }).field).toBe('businessDayCutoff')
  })

  it('UPDATE：没有变化不提交；缺 version 不提交；有变化放行', () => {
    const noChange = validateChangeRequest({
      requestType: 'UPDATE', form: storeChangeFormFromRow(STORE_ROW), row: STORE_ROW, reason: '更名',
    })
    expect(noChange).toMatchObject({ ok: false, field: 'payload' })
    expect(noChange.message).toBe('没有检测到需要审批的修改。')

    const noVersion = validateChangeRequest({
      requestType: 'UPDATE',
      form: { ...storeChangeFormFromRow(STORE_ROW), name: '新名字' },
      row: { ...STORE_ROW, version: null },
      reason: '更名',
    })
    expect(noVersion).toMatchObject({ ok: false, field: 'baseVersion' })

    const ok = validateChangeRequest({
      requestType: 'UPDATE',
      form: { ...storeChangeFormFromRow(STORE_ROW), name: '新名字' },
      row: STORE_ROW,
      reason: '更名',
    })
    expect(ok.ok).toBe(true)
  })

  it('STATUS：目标状态合法且状态机允许（CLOSED 为终态）', () => {
    const suspend = validateChangeRequest({ requestType: 'STATUS', row: STORE_ROW, targetStatus: 'SUSPENDED', reason: '暂停经营' })
    expect(suspend.ok).toBe(true)
    expect(validateChangeRequest({ requestType: 'STATUS', row: STORE_ROW, targetStatus: 'DELETED', reason: 'x' }).field).toBe('targetStatus')
    expect(validateChangeRequest({ requestType: 'STATUS', row: { ...STORE_ROW, status: 'CLOSED' }, targetStatus: 'ACTIVE', reason: 'x' }).ok).toBe(false)
  })

  it('DELETE：只有停用/已关闭的门店可以申请删除', () => {
    expect(validateChangeRequest({ requestType: 'DELETE', row: { ...STORE_ROW, status: 'ACTIVE' }, reason: '撤店' }).message)
      .toBe('只有停用或已关闭的门店才能申请删除。')
    expect(validateChangeRequest({ requestType: 'DELETE', row: { ...STORE_ROW, status: 'SUSPENDED' }, reason: '撤店' }).ok).toBe(true)
    expect(validateChangeRequest({ requestType: 'DELETE', row: { ...STORE_ROW, status: 'CLOSED' }, reason: '撤店' }).ok).toBe(true)
  })
})

describe('门店状态机与可申请动作', () => {
  it('状态机：ACTIVE ⇄ SUSPENDED，ACTIVE|SUSPENDED → CLOSED，CLOSED 终态', () => {
    expect(canTransitionStoreStatus('ACTIVE', 'SUSPENDED')).toBe(true)
    expect(canTransitionStoreStatus('SUSPENDED', 'ACTIVE')).toBe(true)
    expect(canTransitionStoreStatus('ACTIVE', 'CLOSED')).toBe(true)
    expect(canTransitionStoreStatus('SUSPENDED', 'CLOSED')).toBe(true)
    expect(canTransitionStoreStatus('CLOSED', 'ACTIVE')).toBe(false)
    expect(STORE_STATUS_TRANSITIONS.CLOSED).toEqual([])
  })

  it('ACTIVE 门店：申请编辑/停用/关闭；SUSPENDED：编辑/启用/关闭/删除；CLOSED：只能删除', () => {
    expect(buildStoreChangeActions({ status: 'ACTIVE' }).map((action) => action.key)).toEqual(['UPDATE', 'SUSPEND', 'CLOSE'])
    expect(buildStoreChangeActions({ status: 'SUSPENDED' }).map((action) => action.key)).toEqual(['UPDATE', 'RESUME', 'CLOSE', 'DELETE'])
    expect(buildStoreChangeActions({ status: 'CLOSED' }).map((action) => action.key)).toEqual(['DELETE'])
    expect(buildStoreChangeActions({ status: 'UNKNOWN' })).toEqual([])
    // 标签来自 terms：租户侧一律「申请 xxx」，不能出现立即生效的直写措辞
    for (const action of buildStoreChangeActions({ status: 'ACTIVE' })) {
      expect(action.label.startsWith('申请')).toBe(true)
      expect(action.disabled).toBe(false)
    }
  })

  it('有 PENDING 申请时全部动作置灰（同门店只允许一张 PENDING）', () => {
    for (const action of buildStoreChangeActions({ status: 'SUSPENDED' }, PENDING_UPDATE)) {
      expect(action.disabled).toBe(true)
    }
  })

  it('PENDING 合并到门店行；新增申请单独成卡片', () => {
    const stores = [{ id: 12, name: 'A' }, { id: 13, name: 'B' }]
    const merged = mergePendingRequests(stores, [
      PENDING_UPDATE,
      { id: 89, storeId: 13, requestType: 'CREATE', status: 'PENDING', payload: { code: 'SZ-9', name: 'C' } },
      { id: 90, storeId: 12, requestType: 'UPDATE', status: 'APPROVED', payload: {} },
      { id: 91, storeId: null, requestType: 'CREATE', status: 'PENDING', payload: { code: 'SZ-8' } },
    ])
    expect(merged[0].pendingRequest.id).toBe(88)
    expect(merged[1].pendingRequest).toBeUndefined()
    const creates = pendingCreateRequests([
      { id: 89, storeId: 13, requestType: 'CREATE', status: 'PENDING' },
      { id: 91, requestType: 'CREATE', status: 'PENDING' },
      { id: 92, requestType: 'CREATE', status: 'APPROVED' },
    ])
    expect(creates.map((request) => request.id)).toEqual([89, 91])
  })
})

describe('状态文案 / 摘要', () => {
  it('申请类型 / 状态都有中文，未知枚举回落「未知（CODE）」而不是英文原文', () => {
    expect(requestTypeText('CREATE')).toBe('新增门店')
    expect(requestTypeText('STATUS')).toBe('状态变更')
    expect(requestStatusText('PENDING')).toBe('待审批')
    expect(requestStatusText('CONFLICT')).toBe('执行冲突')
    expect(requestStatusType('PENDING')).toBe('warning')
    expect(requestStatusType('APPROVED')).toBe('success')
    expect(requestStatusText('SOMETHING')).toBe('未知（SOMETHING）')
  })

  it('动作短标签与审批中提示按目标状态区分', () => {
    expect(changeActionLabel({ requestType: 'UPDATE' })).toBe('编辑')
    expect(changeActionLabel({ requestType: 'STATUS', payload: { targetStatus: 'SUSPENDED' } })).toBe('停用')
    expect(changeActionLabel({ requestType: 'STATUS', payload: { targetStatus: 'ACTIVE' } })).toBe('启用')
    expect(changeActionLabel({ requestType: 'DELETE' })).toBe('删除')
    expect(pendingRequestLabel({ requestType: 'STATUS', payload: { targetStatus: 'SUSPENDED' } })).toBe('审批中：停用申请')
  })

  it('摘要：服务端 summary 优先，缺失时按类型本地兜底', () => {
    expect(requestSummaryText(PENDING_UPDATE)).toBe('编辑：名称「深圳旗舰店」→「新名字」')
    expect(requestSummaryText({
      requestType: 'CREATE', payload: { code: 'SZ-002', name: '深圳二店' },
    })).toBe('新增门店：深圳二店（SZ-002）')
    expect(requestSummaryText({
      requestType: 'STATUS', storeName: '深圳旗舰店', payload: { targetStatus: 'SUSPENDED' },
    })).toBe('停用门店：深圳旗舰店')
    expect(requestSummaryText({
      requestType: 'DELETE', storeName: '深圳旗舰店',
    })).toBe('删除门店：深圳旗舰店（归档）')
  })
})

describe('字段级 diff（before → after）', () => {
  it('UPDATE 只显示真正变化的字段，未变更字段不显示成「—」', () => {
    const diff = buildChangeDiff(
      { name: 'A', timezone: 'Asia/Shanghai', businessDayCutoff: '04:00:00' },
      { name: 'B' },
    )
    expect(diff).toEqual([
      { field: 'name', label: '门店名称', before: 'A', after: 'B' },
    ])
  })

  it('CREATE 显示新增字段（变更前为 —）；DELETE 显示归档字段（变更后为 —）', () => {
    expect(buildChangeDiff(null, { code: 'SZ-002', name: '深圳二店', businessType: 'KTV' })).toEqual([
      { field: 'code', label: '门店编号', before: '—', after: 'SZ-002' },
      { field: 'name', label: '门店名称', before: '—', after: '深圳二店' },
      { field: 'businessType', label: '业务类型', before: '—', after: 'KTV' },
    ])
    expect(buildChangeDiff({ name: '深圳旗舰店', status: 'SUSPENDED' }, null)).toEqual([
      { field: 'name', label: '门店名称', before: '深圳旗舰店', after: '—' },
      { field: 'status', label: '门店状态', before: '停用', after: '—' },
    ])
  })

  it('STATUS 只显示状态变化，枚举走中文词表', () => {
    const diff = buildChangeDiff(
      { name: 'A', status: 'ACTIVE' },
      { name: 'A', status: 'SUSPENDED' },
    )
    expect(diff).toEqual([{ field: 'status', label: '门店状态', before: '营业中', after: '停用' }])
  })

  it('申请单 diff：STATUS 用 payload.targetStatus 推演；无 before/payload 时退回服务端 diff', () => {
    expect(buildChangeDiffForRequest({
      requestType: 'STATUS',
      before: { name: 'A', status: 'ACTIVE' },
      payload: { targetStatus: 'CLOSED' },
    })).toEqual([{ field: 'status', label: '门店状态', before: '营业中', after: '已关闭' }])

    expect(buildChangeDiffForRequest({
      requestType: 'UPDATE',
      diff: [{ field: 'name', before: 'A', after: 'B' }],
    })).toEqual([{ field: 'name', label: '门店名称', before: 'A', after: 'B' }])
  })

  it('服务端 diff 兼容对象形态与 JSON 字符串 payload', () => {
    expect(normalizeServerDiff({ name: ['A', 'B'] })).toEqual([
      { field: 'name', label: '门店名称', before: 'A', after: 'B' },
    ])
    expect(buildChangeDiffForRequest({
      requestType: 'UPDATE',
      before: JSON.stringify({ name: 'A' }),
      payload: JSON.stringify({ name: 'B' }),
    })).toEqual([{ field: 'name', label: '门店名称', before: 'A', after: 'B' }])
  })

  it('组织 0 展示为「未归属组织」，Logo 只展示上传状态（不铺 URL）', () => {
    const diff = buildChangeDiff(
      { organizationId: 0, logoUrl: '' },
      { organizationId: 0, logoUrl: '/media/a.png' },
    )
    expect(diff).toEqual([{ field: 'logoUrl', label: '门店 Logo', before: '未设置', after: '已上传' }])
  })
})

describe('列表响应归一与幂等键', () => {
  it('兼容数组 / items / records / list / rows 五种分页信封', () => {
    expect(normalizeChangeRequestPage([{ id: 1 }])).toEqual({ items: [{ id: 1 }], total: 1 })
    expect(normalizeChangeRequestPage({ items: [{ id: 1 }], total: 5 })).toEqual({ items: [{ id: 1 }], total: 5 })
    expect(normalizeChangeRequestPage({ records: [{ id: 1 }], total: 9 })).toEqual({ items: [{ id: 1 }], total: 9 })
    expect(normalizeChangeRequestPage({ list: [{ id: 1 }], count: 2 })).toEqual({ items: [{ id: 1 }], total: 2 })
    expect(normalizeChangeRequestPage({ rows: [{ id: 1 }] })).toEqual({ items: [{ id: 1 }], total: 1 })
    expect(normalizeChangeRequestPage(null)).toEqual({ items: [], total: 0 })
  })

  it('幂等键非空且长度可控（同一表单提交只产生一张申请单）', () => {
    const key = createIdempotencyKey()
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(8)
    expect(createIdempotencyKey()).not.toBe(key)
  })
})

describe('编号 / 时区 / 营业日切点规则', () => {
  it('编号 2–64 位，以字母或数字开头', () => {
    expect(STORE_CODE_PATTERN.test('SZ-001')).toBe(true)
    expect(STORE_CODE_PATTERN.test('a1')).toBe(true)
    expect(STORE_CODE_PATTERN.test('1')).toBe(false)
    expect(STORE_CODE_PATTERN.test('-SZ')).toBe(false)
    expect(STORE_CODE_PATTERN.test('x'.repeat(65))).toBe(false)
  })

  it('时区必须是合法 IANA；切点格式 HH:mm 且 00:00–12:00', () => {
    expect(isValidTimezone('Asia/Shanghai')).toBe(true)
    expect(isValidTimezone('+08:00')).toBe(false)
    expect(isValidTimezone('Z')).toBe(false)
    expect(isValidBusinessDayCutoff('04:00')).toBe(true)
    expect(isValidBusinessDayCutoff('04:00:00')).toBe(true)
    expect(isValidBusinessDayCutoff(CUTOFF_MIN)).toBe(true)
    expect(isValidBusinessDayCutoff(CUTOFF_MAX)).toBe(true)
    expect(isValidBusinessDayCutoff('12:01')).toBe(false)
    expect(isValidBusinessDayCutoff('4:00')).toBe(false)
  })
})

describe('下拉选项兜底（create-defaults 失败/新业态）', () => {
  it('当前业态不在候选里时补进选项，否则原样返回', () => {
    expect(withCurrentOption(['KTV'], 'HOTEL')).toEqual(['KTV', 'HOTEL'])
    expect(withCurrentOption(['KTV', 'HOTEL'], 'KTV')).toEqual(['KTV', 'HOTEL'])
    expect(withCurrentOption(['KTV'], '')).toEqual(['KTV'])
    expect(withCurrentOption(null, 'HOTEL')).toEqual(['HOTEL'])
  })

  it('门店归属组织不在候选里时补「组织 #ID」，0/空不补', () => {
    expect(organizationOptionsWithCurrent([{ id: 7, name: '华南区' }], 9)).toEqual([
      { id: 7, name: '华南区' },
      { id: 9, name: '组织 #9' },
    ])
    expect(organizationOptionsWithCurrent([{ id: 7, name: '华南区' }], 7)).toEqual([{ id: 7, name: '华南区' }])
    expect(organizationOptionsWithCurrent([], 0)).toEqual([])
    expect(organizationOptionsWithCurrent(null, null)).toEqual([])
  })
})
