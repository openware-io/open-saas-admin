import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolveAdminErrorMessage } from './adminErrorMessage'

/**
 * 区域 / 房型 / 开台人数的「编辑入口」源码级断言。
 *
 * 契约来自后端 2a87f4b4：
 *  - 资源 body 收 areaName（>64 → 400 AREA_NAME_TOO_LONG）与 roomTypeId（0 = 清空，创建时 0 非法）；
 *  - 房型字典 /admin/resources/types CRUD，单价为「最小货币单位/计费单位」；
 *  - 开台 body 收 partySize（>0 且 ≤ 包厢容量，非法 400 PARTY_SIZE_INVALID）；
 *  - /business/ktv/pricing 返回生效单价与 roomTypePriceApplied。
 * 这里把「页面确实接上了这些入口」固化下来，避免只改后端不改前端。
 */
const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

describe('包厢/资源页（resources.vue）：区域 + 房型 + 房型管理', () => {
  it('表单提交 areaName 与 roomTypeId（编辑 0 = 清空，创建 0 非法需转 null）', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('areaName: form.value.areaName')
    expect(source).toContain('roomTypeId: form.value.roomTypeId || (isEditing.value ? 0 : null)')
    expect(source).toContain('不指定（清空房型）')
    // 区域上限与后端 res_resource.area_name varchar(64) 对齐
    expect(source).toContain('maxlength="64"')
  })

  it('资源卡片带「区域」「房型」信息，取值来自资源响应的 areaName/roomTypeName/roomTypeCode', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('label="区域"')
    expect(source).toContain('resource.areaName')
    expect(source).toContain('label="房型"')
    expect(source).toContain('resource.roomTypeName')
    expect(source).toContain('resource.roomTypeCode')
  })

  it('房型管理：CRUD 四个接口齐备（列表/新增/编辑/停用-删除）', async () => {
    const source = await read('../views/tenant/resources.vue')
    for (const fn of ['listResourceTypes', 'createResourceType', 'updateResourceType', 'deleteResourceType']) {
      expect(source).toContain(fn)
    }
    // 停用/启用走同一条 update，状态枚举只有 ACTIVE/DISABLED
    expect(source).toContain("row.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED'")
    expect(source).toContain('roomTypeStatusText')
  })

  it('房型单价按当前币种主单位输入与展示：提交 yuanToFen、回填/列展示 fenToYuan/formatMoney', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('unitPrice: yuanToFen(draft.unitPriceYuan)')
    expect(source).toContain('serverUnitPrice: yuanToFen(draft.serverUnitPriceYuan)')
    expect(source).toContain('fenToYuan(row.unitPrice)')
    expect(source).toContain('formatMoney(row.unitPrice)')
    expect(source).toContain('withCurrencyLabel')
    // 页面不得自行做最小/主单位换算，也不得写死「元」
    expect(source).not.toMatch(/\/\s*100\b|\*\s*100\b/)
    expect(source).not.toMatch(/元/)
  })

  it('房型列表按需加载：首屏只加载资源与门店，不请求房型字典', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('onMounted(() => { load(); loadStores() })')
    const mountedBlock = source.slice(source.indexOf('onMounted('))
    expect(mountedBlock).not.toContain('loadResourceTypes')
    // 打开包厢弹窗 / 房型管理时才加载
    expect(source).toContain('loadResourceTypes()')
    expect(source).toContain('loadResourceTypes(true)')
  })

  it('资源列表仍按需加载图片且 lazy（未被本轮改动破坏）', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('loading="lazy"')
    expect(source).toContain('parseImageUrls')
  })
})

describe('订单/看板页（orders.vue）：开台人数 + 生效房型价', () => {
  it('开台弹窗有「人数」输入，提交 partySize 且前端先校验 >0 与包厢容量', async () => {
    const source = await read('../views/tenant/orders.vue')
    expect(source).toContain('label="人数"')
    expect(source).toContain('createForm.partySize')
    expect(source).toContain('normalizedPartySize')
    expect(source).toContain('await openSession(order.sessionId, 0, partySize)')
    expect(source).toContain('人数需为大于 0 的整数')
    expect(source).toContain('超过该包厢容纳上限')
    // 容量取所选包厢的 capacity（与后端 upper bound 同源）
    expect(source).toContain('selectedRoomCapacity')
  })

  it('看板卡片与详情展示区域/房型/人数/服务人员，缺值仍走「未接入」', async () => {
    const source = await read('../views/tenant/orders.vue')
    expect(source).toContain("pickField(resource, 'areaName', 'area_name')")
    expect(source).toContain("pickField(resource, 'roomTypeName', 'room_type_name')")
    expect(source).toContain("pickField(session, 'partySize', 'party_size')")
    expect(source).toContain("pickField(session, 'serverId', 'server_id')")
    expect(source).toContain('NOT_INTEGRATED')
    expect(source).toContain('room.guests != null')
  })

  it('「基础房费」优先生效房型价并按 roomTypePriceApplied 标注', async () => {
    const source = await read('../views/tenant/orders.vue')
    expect(source).toContain('roomBasePriceText')
    expect(source).toContain('roomPriceFromPricing')
    expect(source).toContain('resolveRoomPrice')
    // 详情/卡片都用同一份推导，且不出现页内自行换算
    expect(source).not.toMatch(/\/\s*100\b|\*\s*100\b/)
  })

  it('按包厢取计价只缓存一次（看板刷新不重复请求）', async () => {
    const source = await read('../views/tenant/orders.vue')
    expect(source).toContain('roomPricingByResource')
    expect(source).toContain('if (roomPricingByResource.value[key]) return')
    expect(source).toContain('getKtvPricing(currentStoreId.value, resourceId)')
  })

  it('「基础房费」与 C 端/结台同口径：带房型服务单价，明细名由后端账单给出', async () => {
    const source = await read('../views/tenant/orders.vue')
    // 房型服务单价一并参与「房型 + 服务 = 合计」推导
    expect(source).toContain('roomTypeServerUnitPrice')
    // 包间费明细名（含 1 名服务人员）来自后端账单，页面不得再硬编码成旧口径
    expect(source).toContain("bill.roomFee.name")
    expect(source).not.toContain('包厢计时费')
  })
})

describe('服务单价口径说明（已含 1 名标准服务人员）', () => {
  const COPY = '服务单价 = 每计费单位服务费，已含 1 名标准服务人员，超出按服务人员单价另计'

  it('房型字典页（列表说明 + 编辑表单）写明服务单价含 1 名标准服务人员', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain(COPY)
    expect(source).toContain("withCurrencyLabel('服务单价')")
    expect(source).toContain('serverUnitPrice: yuanToFen(draft.serverUnitPriceYuan)')
  })

  it('计价方案页写明「包厢费 = 房型单价 + 服务单价」与同一说明', async () => {
    const source = await read('../views/tenant/ktv-config.vue')
    expect(source).toContain('包厢费 = 房型单价 + 服务单价')
    expect(source).toContain(COPY)
  })
})

describe('房型/区域错误码中文化', () => {
  it('重码 / 重名 / 被引用删除 / 参数非法都给可执行中文提示', () => {
    const codes = {
      ROOM_TYPE_CODE_EXISTS: '编码',
      ROOM_TYPE_NAME_EXISTS: '名称',
      ROOM_TYPE_IN_USE: '仍被包厢使用',
      ROOM_TYPE_INVALID: '不合法',
      ROOM_TYPE_NOT_FOUND: '不存在',
      AREA_NAME_TOO_LONG: '区域名称',
      PARTY_SIZE_INVALID: '人数',
    }
    for (const [code, keyword] of Object.entries(codes)) {
      const message = resolveAdminErrorMessage({ response: { status: 409, data: { code } } })
      expect(`${code}:${message.includes(keyword)}`).toBe(`${code}:true`)
      // 不得把英文枚举原文透给运营人员
      expect(/[A-Za-z]/.test(message)).toBe(false)
    }
  })
})

/**
 * 包厢管理页（resources.vue）不再有「类型」与「房型」两套重复概念：
 * 本页只维护**包厢**（resourceType 固定 KTV_ROOM），分类由「房型」表达；
 * 查询条件同样统一到「房型」（原来可按类型筛包厢/服务人员，容易与房型混淆）。
 * 服务人员资源在「KTV 配置 → 服务人员」维护（BFF /admin/ktv/server-catalog）。
 */
describe('包厢管理：类型与房型不再重复（查询条件统一到房型）', () => {
  it('新增/编辑包厢表单不再有「类型」可选项，创建时固定 KTV_ROOM', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).not.toContain('label="类型"')
    expect(source).not.toContain('value="KTV_SERVER"')
    expect(source).toContain("const ROOM_RESOURCE_TYPE = 'KTV_ROOM'")
    expect(source).toContain('resourceType: ROOM_RESOURCE_TYPE,')
    // 表单状态里也不再保留可编辑的类型字段
    const emptyFormBlock = source.slice(source.indexOf('const emptyForm = () => ({'), source.indexOf('const form = ref(emptyForm())'))
    expect(emptyFormBlock).not.toContain('resourceType')
  })

  it('列表查询固定包厢类型，不再由筛选条件决定', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain("resourceType: 'KTV_ROOM',")
    expect(source).toContain("storeId: storeId.value || undefined,")
    // 类型筛选变量已移除
    expect(source).not.toContain("const resourceType = ref('')")
  })

  it('查询条件用「房型」替代「类型」：字典同源，展开时才加载', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('v-model="roomTypeFilter"')
    expect(source).toContain('placeholder="房型"')
    expect(source).toContain('@visible-change="onRoomTypeFilterOpen"')
    expect(source).toContain('ROOM_TYPE_FILTER_NONE')
    // 首屏仍只请求资源与门店：房型字典在展开筛选 / 打开弹窗时才取
    expect(source).toContain('onMounted(() => { load(); loadStores() })')
    // 表单的房型下拉与筛选的房型下拉共用同一份字典
    expect((source.match(/v-for="t in resourceTypes"/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('列表不再重复出「类型」列（房型列已表达同一概念）', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).not.toContain('prop="resourceType" label="类型"')
    expect(source).not.toContain('resourceTypeText(row.resourceType)')
    expect(source).toContain('<span>房型</span>')
  })
})

/**
 * 房型图片（V8__res_room_type_media.sql）：C 端「选择包厢类型」直接展示房型，
 * 房型必须能自己维护多图，而不是只能借用某个包厢的主图。
 */
describe('房型图片：新增/编辑支持多图 + 主图，列表出缩略图', () => {
  it('房型表单挂多图上传（复用包厢同一组件，最多 9 张、主图可选）', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('v-model:images="typeForm.imageUrls"')
    expect(source).toContain('v-model:main-image="typeForm.mainImageUrl"')
    // 包厢与房型都用同一个上传组件（两处挂载），不各写一套
    expect(source.match(/<ItemImageUploader/g) || []).toHaveLength(2)
    // 上传组件自身限制 9 张、只收图片类型
    const uploader = await read('../components/ItemImageUploader.vue')
    expect(uploader).toContain(':limit="9"')
    expect(uploader).toContain('accept="image/jpeg,image/png,image/webp"')
  })

  it('提交体带 imageUrls/mainImageUrl，主图必须落在列表里（否则置空由后端取第一张）', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('imageUrls: typeImagesDraft')
    expect(source).toContain("mainImageUrl: typeImagesDraft.includes(draft.mainImageUrl) ? draft.mainImageUrl : ''")
    // 编辑回填：主图不合法时退回第一张，避免提交被后端 400 拒绝
    expect(source).toContain("mainImageUrl: urls.includes(main) ? main : (urls[0] || '')")
  })

  it('房型列表出图片列：主图缩略 + 张数，无图/加载失败都不出破图', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('function typeImages(row)')
    expect(source).toContain('function typeThumb(row)')
    expect(source).toContain('markTypeImageFailed(row)')
    expect(source).toContain('共 {{ typeImages(row).length }} 张')
    // 与包厢图片分表记录失败态，避免 id 相同的包厢/房型互相污染占位状态
    expect(source).toContain('const failedTypeImages = ref({})')
  })

  it('房型图片请求走同一套解析（JSON 数组或数组字符串）', async () => {
    const source = await read('../views/tenant/resources.vue')
    expect(source).toContain('return parseImageUrls(row?.imageUrls)')
    // 房型与包厢都通过 parseImageUrls 解析（rowImages / typeImages 两处），不各自 JSON.parse
    expect(source.match(/parseImageUrls\(/g).length).toBeGreaterThanOrEqual(2)
  })
})
