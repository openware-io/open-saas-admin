/**
 * 全后台术语 / 状态 / 错误提示的唯一出处（为 2.0 多语言抽取预留）。
 *
 * 背景：审计（`docs/audit-2026-09-17-exceptions-and-i18n.md` §4.6~§4.9、§7.2）确认同一概念
 * 在后台存在 2~4 种叫法（包厢/资源、应收/实收/待收、储值/储值币/品牌名），状态枚举则各页面
 * 各自实现。多语言已纳入 2.0 规划，页面继续内联中文会让后续抽取 key 无锚点，
 * 因此本轮先把「术语 / 状态 / 错误提示」收敛到本文件，页面只引用常量。
 *
 * 约定：
 *  - 只放「用户可见」的中文；技术枚举（resource / payableAmount / TENANT）保持后端原名做 key。
 *  - 状态映射一律「后端枚举 → 中文」，未知枚举保留原值（不臆造），由各 *Text 函数兜底。
 *  - 界面禁用词见 FORBIDDEN_TERMS，由 `constants/terms.test.js` 做源码守卫。
 *  - 服务端错误码 → 中文的映射不在本文件，见 `utils/adminErrorMessage.js`（已是单一出处）；
 *    本文件只收「前端自己产生」的提示文案（ERRORS）。
 *  - 后续接入 vue-i18n 的目录结构、key 命名与替换步骤见 `docs/i18n-migration-plan.md`。
 */

// —— 1. 术语（名词）———————————————————————————————————————————————
/** 用户可见术语；代码与接口里仍用 resource / tenant / store，不在界面上混用。 */
export const TERMS = {
  /** KTV 房间：用户面一律「包厢」（接口与代码仍叫 resource，不改）。 */
  ktvRoom: '包厢',
  /** 后台菜单名：包厢/资源页只维护包厢（服务人员在「KTV 配置 → 服务人员」），故叫「包厢管理」。 */
  roomManagement: '包厢管理',
  ktvServer: '服务人员',
  /** 平台侧经营主体一律「租户」。 */
  tenant: '租户',
  /** 门店侧经营主体一律「门店」。 */
  store: '门店',
  /** B 端工作台对外统一「商户」（不再用「商家」）。 */
  merchant: '商户',
  /** 订单看板沿用既有叫法「房态看板」，不自造「包厢状态」。 */
  roomBoard: '房态看板',
  /** 商品/服务目录：后台统一「点单目录」。 */
  orderCatalog: '点单目录',
  addOn: '加项',
  /** 储值（钱包）的中性叫法；品牌展示名见 WALLET_BRAND_NAME_DEFAULT。 */
  wallet: '储值',
  /** 租户级币种设置入口（取值 CNY/USD，名称取 constants/currency 的 label）。 */
  currency: '币种',
}

/** 界面禁用词：新文案不得出现，由 terms.test.js 扫描 views/ 守住。 */
export const FORBIDDEN_TERMS = ['房间', '包间', '商家', '待收', '房台']

// —— 2. 金额字段与单位 —————————————————————————————————————————————
/**
 * 金额字段术语（key 对齐后端字段名）。
 * 「实收/待收」是旧叫法：paidAmount 一律「已收」，payableAmount 一律「应收」。
 * 注意：交班的 actualCash 是「实点现金」，与 paidAmount 不是同一口径，见 SHIFT_CASH_TEXT。
 */
export const MONEY_FIELD_TEXT = {
  payableAmount: '应收',
  receivableAmount: '应收',
  paidAmount: '已收',
  refundableAmount: '可退',
  refundAmount: '退款',
  discountAmount: '优惠',
  averageTicketAmount: '客单价',
  collectedAmount: '收款',
  // 库存成本与毛利报表（/admin/reports/inventory-gross-profit）：列头不再绑定单位，币种由符号承担
  revenueAmount: '收入',
  costAmount: '成本',
  grossProfitAmount: '毛利',
}

/**
 * 金额标签不再绑定「元」：币种是租户级配置（CNY/USD，默认 USD，见
 * `gv_im_server/docs/standards/16_CURRENCY_CONVENTIONS.md` §4），界面文案统一写金额名词
 * （金额 / 采购价 / 售价 / 房型单价 / 服务单价…），币种标识由 `formatMoney` 的符号承担。
 * 确需中文单位（人民币/美元）时用 `utils/format` 的 `withCurrencyLabel`，名称取自 `constants/currency`。
 */
export function moneyLabel(label) {
  return label === null || label === undefined ? '' : String(label)
}

/** 金额列名统一「术语」（原「术语（元）」写法已废弃：币种不再写死在列头）。 */
export function moneyColumnLabel(field) {
  return moneyLabel(MONEY_FIELD_TEXT[field] || field)
}

/**
 * 「分」在后台同时表示分币与分钟，界面上一律写全：金额单位随币种（默认 USD），时长写「分钟」。
 * 递增粒度写「（分钟）」而不是「(分)」。
 */
export const DURATION_LABELS = {
  minutes: '分钟',
  incrementMinutes: '递增粒度（分钟）',
  defaultSessionMinutes: '标准时长（分钟）',
}

// —— 3. 储值品牌名 ————————————————————————————————————————————————
/**
 * 储值品牌展示名默认值。规则：只取租户配置 `tnt_tenant_config.wallet_brand_name`，
 * 没有配置时才回落本默认值；全后台只有这一处可以写死品牌名（审计 §4.7）。
 */
export const WALLET_BRAND_NAME_DEFAULT = 'A380币'

/** 解析储值展示名：只认租户配置，缺配置回落唯一默认值（页面不得自行拼默认名）。 */
export function resolveWalletBrandName(config) {
  const configured = config && typeof config.brandName === 'string' ? config.brandName.trim() : ''
  return configured || WALLET_BRAND_NAME_DEFAULT
}

// —— 4. 状态映射（后端枚举 → 中文）————————————————————————————————
/**
 * 枚举没有映射时的**唯一**回落：渲染成「未知（CODE）」，绝不把后端英文枚举原文透到界面上。
 *
 * 为什么不是原样返回 code：运营看不懂 `WAITING_SETTLEMENT`，也不该在界面上看到它；保留 code
 * 是为了「看到就知道后端契约缺了哪一条」，配合 `terms.test.js` 的模板守卫防止回退。
 * 后端补契约后只需在对应词表加一条映射，页面不用改。
 */
export function unknownEnumText(value) {
  if (value === null || value === undefined || value === '') return '—'
  return `未知（${String(value).trim()}）`
}

/** 资源类型（resource_type）。 */
export const RESOURCE_TYPE_TEXT = { KTV_ROOM: TERMS.ktvRoom, KTV_SERVER: TERMS.ktvServer }
export function resourceTypeText(type) {
  return RESOURCE_TYPE_TEXT[type] || unknownEnumText(type)
}

/**
 * 包厢运行 / 清洁状态（房态看板口径）。
 * 消费方：订单看板 orders.vue 的 boardStatus → 本词表（空闲 / 使用中 / 清洁中 / 已预订）；
 * 「待结账」是订单派生态（WAITING_SETTLEMENT / WAITING_PAYMENT），不在资源状态词表内，由看板单独登记。
 */
export const RESOURCE_STATE_TEXT = {
  IDLE: '空闲',
  AVAILABLE: '空闲',
  HELD: '已占用',
  RESERVED: '已预订',
  IN_USE: '使用中',
  OCCUPIED: '使用中',
  CLEANING: '清洁中',
  MAINTENANCE: '维护中',
  OUT_OF_SERVICE: '停用',
  DISABLED: '停用',
}
export function resourceStateText(state) {
  // 看板把「未知资源状态」当空串处理（决定权在调用方），但绝不能回落英文原文。
  if (RESOURCE_STATE_TEXT[state]) return RESOURCE_STATE_TEXT[state]
  return state ? unknownEnumText(state) : ''
}

/**
 * KTV 会话状态（`ord_ktv_session.status`）：三端统一，**不得把英文枚举透到界面**。
 *
 * `RESERVED` 的口径：H5 用「待开台」——它描述的是「会话还没开台」，不是「包厢被预订」；
 * 包厢被预订属于资源态（见 {@link RESOURCE_STATE_TEXT}.RESERVED =「已预订」），两者不要混用。
 */
export const SESSION_STATUS_TEXT = {
  RESERVED: '待开台',
  OPEN: '计时中',
  PAUSED: '已暂停',
  CLOSED: '已结台',
  CANCELLED: '已取消',
}
export function sessionStatusText(status) {
  if (!status) return '—'
  return SESSION_STATUS_TEXT[status] || unknownEnumText(status)
}

/** 启用 / 停用（资源、服务人员等）：后端枚举为 ENABLED / DISABLED。 */
export const ENABLED_STATUS_TEXT = { ENABLED: '启用', DISABLED: '停用' }
export const ENABLED_STATUS_TYPE = { ENABLED: 'success', DISABLED: 'info' }
export function enabledStatusText(status) {
  return ENABLED_STATUS_TEXT[status] || unknownEnumText(status)
}
export function enabledStatusType(status) {
  return ENABLED_STATUS_TYPE[status] || 'info'
}

/**
 * 通用字典启用状态（ACTIVE / DISABLED）：商品分类、房型字典、仓库商品等
 * `*.status` 为 ACTIVE 的字典表都用它，避免各页面各写一份三元表达式。
 */
export const ACTIVE_STATUS_TEXT = { ACTIVE: '启用', DISABLED: '停用' }
export const ACTIVE_STATUS_TYPE = { ACTIVE: 'success', DISABLED: 'info' }
export function activeStatusText(status) {
  return ACTIVE_STATUS_TEXT[status] || unknownEnumText(status)
}
export function activeStatusType(status) {
  return ACTIVE_STATUS_TYPE[status] || 'info'
}

/**
 * 「启用/停用」按钮文案：当前状态 → 点击后的动作。
 * 放在词表里是为了让模板不必再写 `row.status === 'ACTIVE' ? '停用' : '启用'`（模板守卫会拦）。
 */
export function activeStatusActionText(status) {
  if (status === 'ACTIVE') return '停用'
  if (status === 'DISABLED') return '启用'
  return '切换状态'
}

/**
 * 房型字典状态（res_room_type.status）：启用用 ACTIVE（不是资源的 ENABLED），停用同为 DISABLED。
 * 与 ACTIVE_STATUS_TEXT 同值但单独登记，便于房型页以后单独演进。
 */
export const ROOM_TYPE_STATUS_TEXT = { ...ACTIVE_STATUS_TEXT }
export function roomTypeStatusText(status) {
  return ROOM_TYPE_STATUS_TEXT[status] || unknownEnumText(status)
}

/** 支付流水状态（pay_intent.status）。 */
export const PAY_STATUS_TEXT = { SUCCEEDED: '成功', PENDING: '处理中', FAILED: '失败' }
export const PAY_STATUS_TYPE = { SUCCEEDED: 'success', PENDING: 'warning', FAILED: 'danger' }
export function payStatusText(status) {
  return PAY_STATUS_TEXT[status] || unknownEnumText(status)
}
export function payStatusType(status) {
  return PAY_STATUS_TYPE[status] || 'info'
}

/** 日结状态（pay_daily_closing.status）。 */
export const DAILY_CLOSING_STATUS_TEXT = {
  DRAFT: '待提交',
  SUBMITTED: '已提交',
  REVIEWED: '已审核',
  REOPENED: '已重开',
}
export function dailyClosingStatusText(status) {
  return DAILY_CLOSING_STATUS_TEXT[status] || unknownEnumText(status)
}

/** 预约状态（reservation.status）。 */
export const RESERVATION_STATUS_TEXT = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  ARRIVED: '已到店',
  CONVERTED: '已开台',
  CANCELLED: '已取消',
  NO_SHOW: '未到店',
}
export const RESERVATION_STATUS_TYPE = {
  PENDING: 'warning',
  CONFIRMED: 'primary',
  ARRIVED: 'success',
  CONVERTED: 'success',
  CANCELLED: 'info',
  NO_SHOW: 'info',
}
export function reservationStatusText(status) {
  return RESERVATION_STATUS_TEXT[status] || unknownEnumText(status)
}
export function reservationStatusType(status) {
  return RESERVATION_STATUS_TYPE[status] || 'info'
}

/** 计费单位（ktv_pricing_plan.billing_unit）。*/
export const BILLING_UNIT_TEXT = { HOUR: '按小时', HALF_HOUR: '按半小时', PACKAGE: '套餐' }
/** 计费单位短写法：用于「金额/小时」这类拼接（金额与符号一律走 utils/format 的 formatMoney）。 */
export const BILLING_UNIT_SHORT_TEXT = { HOUR: '小时', HALF_HOUR: '半小时', PACKAGE: '套餐' }
export function billingUnitText(unit) {
  // 缺省（空值）按小时计费是既有契约；未知枚举仍回落「未知（CODE）」，不透英文。
  return BILLING_UNIT_TEXT[unit] || (unit ? unknownEnumText(unit) : BILLING_UNIT_TEXT.HOUR)
}
export function billingUnitShortText(unit) {
  return BILLING_UNIT_SHORT_TEXT[unit] || (unit ? unknownEnumText(unit) : BILLING_UNIT_SHORT_TEXT.HOUR)
}

/** 舍入方向（ktv_pricing_plan.rounding_direction）。 */
export const ROUNDING_DIRECTION_TEXT = {
  CONSUMER_FAVOR: '让利消费者',
  ROUND_UP: '向上取整',
  FLOOR_BLOCK: '封顶',
}
export function roundingDirectionText(direction) {
  return ROUNDING_DIRECTION_TEXT[direction]
    || (direction ? unknownEnumText(direction) : ROUNDING_DIRECTION_TEXT.CONSUMER_FAVOR)
}

/** 储值流水类型 / 渠道 / 状态（cst_wallet_ledger）。类型取值与表定义一致：RECHARGE/CONSUME/REFUND/HOLD/RELEASE/ADJUST。 */
export const WALLET_LEDGER_TYPE_TEXT = {
  RECHARGE: '充值',
  CONSUME: '消费抵扣',
  REFUND: '退还',
  HOLD: '冻结',
  RELEASE: '释放归还',
  ADJUST: '人工调整',
}
export const WALLET_LEDGER_CHANNEL_TEXT = { CASH: '现金', OFFLINE_TRANSFER: '线下转账', TRANSFER: '线下转账' }
export const WALLET_LEDGER_STATUS_TEXT = {
  SUCCESS: '成功',
  SUCCEEDED: '成功',
  PENDING: '处理中',
  FAILED: '失败',
  REFUNDED: '已退还',
}
export function walletLedgerTypeText(type) {
  return WALLET_LEDGER_TYPE_TEXT[type] || unknownEnumText(type)
}
export function walletLedgerChannelText(channel) {
  return WALLET_LEDGER_CHANNEL_TEXT[channel] || unknownEnumText(channel)
}
export function walletLedgerStatusText(status) {
  return WALLET_LEDGER_STATUS_TEXT[status] || unknownEnumText(status)
}

/**
 * 退款申请状态（pay_refund）：取值与 RefundApplicationService 的
 * PENDING/APPROVED/REJECTED/REFUNDED 一一对应。
 * `APPROVED` 只表示「已批准、钱还没退」，只有 `REFUNDED` 才是已退款——展示与合计必须区分。
 */
export const REFUND_STATUS_TEXT = {
  PENDING: '待审批',
  APPROVED: '已批准（待退款）',
  REJECTED: '已拒绝',
  REFUNDED: '已退款',
}
export function refundStatusText(status) {
  return REFUND_STATUS_TEXT[status] || unknownEnumText(status)
}

/**
 * 交班现金盘点（pay_shift）：expectedCash 是「应收现金」，actualCash 是收银员**实点**现金。
 * 它与账单字段 paidAmount（已收）不是同一口径，因此这里保留「实收现金」这一盘点术语，
 * 不并入「已收」。若产品统一口径，只需改本常量。
 */
export const SHIFT_CASH_TEXT = {
  opening: '备用金',
  expected: '应收现金',
  actual: '实收现金',
  difference: '长短款',
}

// —— 5. 其它业务枚举（列表 / 筛选展示）——————————————————————————
// 全部遵守同一条规则：词表命中给中文；未命中回落 unknownEnumText(value)（未知（CODE））。
// 页面不得再内联 `row.status === 'X' ? '中文' : '中文'` 或页内自建映射对象（terms.test.js 模板守卫）。

/** 商品状态（ord_product.status）：新增即 DRAFT，上/下架切换 ON_SHELF / OFF_SHELF。 */
export const PRODUCT_STATUS_TEXT = { DRAFT: '草稿', ON_SHELF: '已上架', OFF_SHELF: '已下架' }
export const PRODUCT_STATUS_TYPE = { DRAFT: 'warning', ON_SHELF: 'success', OFF_SHELF: 'info' }
export function productStatusText(status) {
  return PRODUCT_STATUS_TEXT[status] || unknownEnumText(status)
}
export function productStatusType(status) {
  return PRODUCT_STATUS_TYPE[status] || 'info'
}

/**
 * 商品类型（ord_product.item_type，2.1.22 新增）：
 *  - PRODUCT = 实物商品（关联仓库商品、占用库存）；
 *  - SERVICE = 服务（人员的服务，必须关联服务人员 resourceType=KTV_SERVER，不占库存）。
 * 与点单目录项类型（CATALOG_ITEM_TYPE_TEXT）同源但**不同词**：商品侧说「实物商品」，目录侧说「商品」。
 */
export const PRODUCT_ITEM_TYPE_TEXT = { PRODUCT: '实物商品', SERVICE: '服务' }
export const PRODUCT_ITEM_TYPE_TAG = { PRODUCT: 'primary', SERVICE: 'warning' }
export function productItemTypeText(itemType) {
  if (itemType === null || itemType === undefined || itemType === '') return PRODUCT_ITEM_TYPE_TEXT.PRODUCT
  return PRODUCT_ITEM_TYPE_TEXT[itemType] || unknownEnumText(itemType)
}
export function productItemTypeTag(itemType) {
  return PRODUCT_ITEM_TYPE_TAG[itemType] || 'info'
}
/** 新增/编辑商品表单的「商品类型」下拉项（值即后端枚举）。 */
export const PRODUCT_ITEM_TYPE_OPTIONS = [
  { value: 'PRODUCT', label: PRODUCT_ITEM_TYPE_TEXT.PRODUCT },
  { value: 'SERVICE', label: PRODUCT_ITEM_TYPE_TEXT.SERVICE },
]

/** 点单目录项类型（ord_catalog_item.item_type）。 */
export const CATALOG_ITEM_TYPE_TEXT = {
  PRODUCT: '商品',
  SERVICE: '服务',
  PACKAGE: '套餐',
  ADD_ON: '加项',
}
export function catalogItemTypeText(type) {
  return CATALOG_ITEM_TYPE_TEXT[type] || unknownEnumText(type)
}

/**
 * 商品/服务销售排行（销售报表 → `/admin/reports/sales-items`）的品类词表。
 *
 * <p>与点单目录类型同源，额外含**包厢计时费**（`ROOM_FEE`，报表里单列一类）；
 * 明细上的 `ADD_ON` 只表示「从加项入口点的」，后端已按目录项类型归一，这里只负责展示。
 */
export const SALES_ITEM_TYPE_TEXT = {
  PRODUCT: '商品',
  SERVICE: '服务',
  PACKAGE: '套餐',
  ROOM_FEE: '包厢费',
  ADD_ON: '加项',
}
export function salesItemTypeText(type) {
  return SALES_ITEM_TYPE_TEXT[type] || unknownEnumText(type)
}

/** 会员状态（cst_member.status）。 */
export const MEMBER_STATUS_TEXT = { PENDING: '待激活', ACTIVE: '正常', SUSPENDED: '暂停', CLOSED: '已关闭' }
export const MEMBER_STATUS_TYPE = { PENDING: 'warning', ACTIVE: 'success', SUSPENDED: 'warning', CLOSED: 'info' }
export function memberStatusText(status) {
  return MEMBER_STATUS_TEXT[status] || unknownEnumText(status)
}
export function memberStatusType(status) {
  return MEMBER_STATUS_TYPE[status] || 'info'
}

/** 会员储值账户状态（cst_wallet_account.status）。 */
export const MEMBER_WALLET_STATUS_TEXT = { ACTIVE: '正常', FROZEN: '冻结', CLOSED: '已关闭' }
export function memberWalletStatusText(status) {
  return MEMBER_WALLET_STATUS_TEXT[status] || unknownEnumText(status)
}

/** 积分流水类型（cst_point_ledger.entry_type）。 */
export const POINTS_ENTRY_TYPE_TEXT = {
  EARN: '获取',
  REDEEM: '核销',
  EXPIRE: '过期',
  ADJUST: '调整',
  REVERSE: '冲正',
}
export function pointsEntryTypeText(type) {
  return POINTS_ENTRY_TYPE_TEXT[type] || unknownEnumText(type)
}

/**
 * 门店业态（tnt_store.business_type，字典 tnt_business_type.code）：后端已种子的唯一业态是
 * KTV（字典里的 name 也是「KTV」），因此界面展示保持「KTV」；新增业态必须补进本词表。
 */
export const BUSINESS_TYPE_TEXT = { KTV: 'KTV' }
export function businessTypeText(type) {
  return BUSINESS_TYPE_TEXT[type] || unknownEnumText(type)
}

/** 门店状态（tnt_store.status）。 */
export const STORE_STATUS_TEXT = { ACTIVE: '营业中', SUSPENDED: '停用', CLOSED: '已关闭' }
export const STORE_STATUS_TYPE = { ACTIVE: 'success', SUSPENDED: 'warning', CLOSED: 'info' }
export function storeStatusText(status) {
  return STORE_STATUS_TEXT[status] || unknownEnumText(status)
}
export function storeStatusType(status) {
  return STORE_STATUS_TYPE[status] || 'info'
}

/** 租户状态（tnt_tenant.status）。 */
export const TENANT_STATUS_TEXT = { ACTIVE: '正常', PENDING: '待开通', SUSPENDED: '停用', CLOSED: '已关闭' }
export const TENANT_STATUS_TYPE = { ACTIVE: 'success', PENDING: 'warning', SUSPENDED: 'info', CLOSED: 'info' }
export function tenantStatusText(status) {
  return TENANT_STATUS_TEXT[status] || unknownEnumText(status)
}
export function tenantStatusType(status) {
  return TENANT_STATUS_TYPE[status] || 'info'
}

/** 运营人员账号状态（后台账号：ACTIVE 启用 / DISABLED 禁用）。 */
export const STAFF_STATUS_TEXT = { ACTIVE: '启用', DISABLED: '禁用' }
export const STAFF_STATUS_TYPE = { ACTIVE: 'success', DISABLED: 'info' }
export function staffStatusText(status) {
  return STAFF_STATUS_TEXT[status] || unknownEnumText(status)
}
export function staffStatusType(status) {
  return STAFF_STATUS_TYPE[status] || 'info'
}

/** 运营人员「启用/禁用」按钮文案：当前状态 → 点击后的动作。 */
export function staffStatusActionText(status) {
  if (status === 'ACTIVE') return '禁用'
  if (status === 'DISABLED') return '启用'
  return '切换状态'
}

/**
 * 权限作用域（运营人员 scopeType / 角色 scope）：短称谓用于列表与选项，
 * HINT 版本用于表单里需要说明「管到哪些门店」的场景。
 */
export const SCOPE_TYPE_TEXT = {
  TENANT: '租户级',
  STORE: '门店级',
  ORGANIZATION: '组织级',
  PLATFORM: '平台级',
  SELF: '本人',
}
export const SCOPE_TYPE_HINT_TEXT = {
  TENANT: '租户级（全部门店）',
  STORE: '门店级（所选门店）',
  ORGANIZATION: '组织级（所选组织）',
  PLATFORM: '平台级',
  SELF: '本人',
}
export function scopeTypeText(scope) {
  return SCOPE_TYPE_TEXT[scope] || unknownEnumText(scope)
}
export function scopeTypeHintText(scope) {
  return SCOPE_TYPE_HINT_TEXT[scope] || scopeTypeText(scope)
}

/** IAM 权限项类型（iam_permission.type）。 */
export const PERMISSION_TYPE_TEXT = { MENU: '菜单', ACTION: '操作' }
export const PERMISSION_TYPE_TAG = { MENU: 'primary', ACTION: 'warning' }
export function permissionTypeText(type) {
  return PERMISSION_TYPE_TEXT[type] || unknownEnumText(type)
}
export function permissionTypeTag(type) {
  return PERMISSION_TYPE_TAG[type] || 'info'
}

/** 交班状态（pay_shift.status）。 */
export const SHIFT_STATUS_TEXT = { OPEN: '进行中', CLOSED: '已交班' }
export const SHIFT_STATUS_TYPE = { OPEN: 'warning', CLOSED: 'success' }
export function shiftStatusText(status) {
  return SHIFT_STATUS_TEXT[status] || unknownEnumText(status)
}
export function shiftStatusType(status) {
  return SHIFT_STATUS_TYPE[status] || 'info'
}

/** 订单状态（ord_order.status，取值见 V1__ord_order_baseline.sql:8）。 */
export const ORDER_STATUS_TEXT = {
  DRAFT: '进行中',
  SERVING: '服务中',
  WAITING_SETTLEMENT: '待结算',
  WAITING_PAYMENT: '待支付',
  WAITING_ARRIVAL: '待到店',
  COMPLETED: '已完成',
  PARTIAL_REFUNDED: '部分退款',
  REFUNDED: '已退款',
  VOIDED: '已作废',
  CANCELLED: '已取消',
}
export function orderStatusText(status) {
  return ORDER_STATUS_TEXT[status] || unknownEnumText(status)
}

/** 订单状态下拉项（销售报表明细按状态复核时用，顺序=词表顺序）。 */
export const ORDER_STATUS_OPTIONS = Object.keys(ORDER_STATUS_TEXT).map((value) => ({
  value,
  label: ORDER_STATUS_TEXT[value],
}))

/** 订单加项状态（ord_order_item.status）。 */
export const ORDER_ITEM_STATUS_TEXT = { ACTIVE: '已生效', PENDING_APPROVAL: '待确认', REJECTED: '已拒绝' }
export const ORDER_ITEM_STATUS_TYPE = { ACTIVE: 'success', PENDING_APPROVAL: 'warning', REJECTED: 'info' }
export function orderItemStatusText(status) {
  return ORDER_ITEM_STATUS_TEXT[status] || unknownEnumText(status)
}
export function orderItemStatusType(status) {
  return ORDER_ITEM_STATUS_TYPE[status] || 'info'
}

/**
 * 看板预约态文案（前端派生的展示态，不是后端枚举）：看板把「已确认」直接叫「已预订」，
 * 与预约列表的 reservationStatusText 用词不同，因此单独登记。
 *
 * <p>注意：**分配包厢不会改预约状态**（后端 ReservationApplicationService#assignRoom 只写 resource_id），
 * 所以「提前锁房」的预约仍然显示「已预订」；只有门店登记到店（ARRIVED）才显示「客户已到店」。
 */
export const RESERVATION_BOARD_STATE_TEXT = {
  PENDING: '待确认预约',
  CONFIRMED: RESOURCE_STATE_TEXT.RESERVED,
  ARRIVED: '客户已到店',
  NO_SHOW: '未到店',
}
/** 看板预约卡片按钮文案（动作，不是状态）。 */
export const RESERVATION_BOARD_ACTION_TEXT = {
  PENDING: '确认预约',
  CONFIRMED: '客户到店',
  ARRIVED: '到店开台',
}
export function reservationBoardStateText(status) {
  return RESERVATION_BOARD_STATE_TEXT[status] || RESOURCE_STATE_TEXT.RESERVED
}
/**
 * 看板预约卡片主按钮：已确认（CONFIRMED）且**已分配包厢**时直接给「到店开台」——
 * 后端 open-table 同时接受 ARRIVED/CONFIRMED，并在 CONFIRMED 开台时隐含登记到店时间，
 * 于是「客人到了、房间也留好了」只需一次点击，不必先点「客户到店」再点「到店开台」。
 */
export function reservationBoardActionText(status, roomAssigned = false) {
  if (status === 'CONFIRMED' && roomAssigned) return '到店开台'
  return RESERVATION_BOARD_ACTION_TEXT[status] || '处理预约'
}

/** 库存出入库类型（ord_inventory_transaction.transaction_type）。 */
export const INVENTORY_TRANSACTION_TYPE_TEXT = {
  RECEIPT: '采购入库',
  ADJUST_IN: '调整入库',
  REVERSE: '作废回补',
  CONSUME: '销售出库',
  ADJUST_OUT: '调整出库',
}
export const INVENTORY_TRANSACTION_TYPE_TAG = {
  RECEIPT: 'success',
  ADJUST_IN: 'success',
  REVERSE: 'success',
  CONSUME: 'danger',
  ADJUST_OUT: 'warning',
}
export function inventoryTransactionTypeText(type) {
  return INVENTORY_TRANSACTION_TYPE_TEXT[type] || unknownEnumText(type)
}
export function inventoryTransactionTypeTag(type) {
  return INVENTORY_TRANSACTION_TYPE_TAG[type] || 'info'
}

/** 库存流水来源（ord_inventory_transaction.source_type）。 */
export const INVENTORY_SOURCE_TYPE_TEXT = {
  RECEIPT: '手工入库',
  ADJUSTMENT: '手工调整',
  ORDER_ITEM: '点单消费',
}
export function inventorySourceTypeText(source) {
  return source ? (INVENTORY_SOURCE_TYPE_TEXT[source] || unknownEnumText(source)) : '—'
}

/** 员工类型（报表 employee_type）。 */
export const EMPLOYEE_TYPE_TEXT = { CASHIER: '收银', SERVER: '服务' }
export function employeeTypeText(type) {
  return EMPLOYEE_TYPE_TEXT[type] || unknownEnumText(type)
}

/**
 * 库存成本与毛利报表的成本口径（`costBasis`）。
 *
 * `PERIOD_END_MOVING_AVERAGE` = 成本取**查询时点**的移动加权平均成本（服务端 `avg_cost`），
 * 而不是「售出当时」的成本流水：期初/期中进过货的物料，本期成本会带期末单价的成分，
 * 这是后端明确声明的近似，不做追溯重算。页面必须把口径显式写给使用方，避免被当成精确成本。
 */
export const COST_BASIS_TEXT = { PERIOD_END_MOVING_AVERAGE: '期末移动加权平均' }
export function costBasisText(code) {
  return code ? (COST_BASIS_TEXT[code] || unknownEnumText(code)) : '—'
}

/**
 * 报表统计粒度（后端 `granularity` ∈ DAY/WEEK/MONTH/YEAR，缺省 DAY）。
 *
 * 词表是唯一的「英文码 → 中文」落点：界面上不得出现 DAY/WEEK 这类码（审计 §4.6 的同类问题）。
 * 桶的**标签**（`2026-09-19` / `2026年第38周` / `2026-09` / `2026年`）由后端按同一份粒度口径生成，
 * 前端只展示 `row.bucket.label`，不自己算周数（周起点、跨年周的归属都在服务端一处实现）。
 */
export const GRANULARITY_TEXT = {
  DAY: '按天',
  WEEK: '按周',
  MONTH: '按月',
  YEAR: '按年',
}

/** 粒度下拉项（顺序即界面顺序：日 → 周 → 月 → 年）。 */
export const GRANULARITY_OPTIONS = ['DAY', 'WEEK', 'MONTH', 'YEAR'].map((value) => ({
  value,
  label: GRANULARITY_TEXT[value],
}))

export function granularityText(code) {
  return code ? (GRANULARITY_TEXT[code] || unknownEnumText(code)) : GRANULARITY_TEXT.DAY
}

/** 统计粒度缺省值（与后端 `ReportGranularity.parse(null)` 一致）。 */
export const GRANULARITY_DEFAULT = 'DAY'

/**
 * 销售报表的收款构成分类（后端 `pay_transaction.provider` 已归类，前端只做展示，不再自己映射渠道）。
 *
 * 口径：现金 CASH / 线上（ALIPAY、WECHAT、STRIPE）/ 储值币 WALLET（A380币）/ 积分 POINT /
 * 其它（新增渠道未归类时后端显式暴露，保证「构成之和 = 收款金额」可核对）。
 *
 * 五个字段都是**金额**（最小货币单位、行内币种），不是代币数量：储值币/积分支付时，
 * `pay_transaction.amount` 记录的是这笔支付抵扣的**货币金额**。因此一律走 formatMoney，
 * 不要套用代币/积分的数量格式化（那会把金额渲染成裸数字）。
 */
export const PAY_CHANNEL_TEXT = {
  cashAmount: '现金',
  onlineAmount: '线上',
  walletAmount: '储值币',
  pointsAmount: '积分',
  otherAmount: '其它',
}

/** 支付构成列的展示顺序（与后端字段名一一对应）。 */
export const PAY_CHANNEL_PROPS = ['cashAmount', 'onlineAmount', 'walletAmount', 'pointsAmount', 'otherAmount']

export function payChannelText(prop) {
  return PAY_CHANNEL_TEXT[prop] || unknownEnumText(prop)
}

/**
 * 销售报表统计列的列头文案（与库存/经营报表同源：金额列只写金额名词，单位由币种符号承担）。
 */
export const SALES_COLUMN_TEXT = {
  orderCount: '订单数',
  salesAmount: '销售额',
  averageTicketAmount: '客单价',
  discountAmount: '折扣/优惠',
  refundCount: '退款笔数',
  refundAmount: '退款金额',
  voidedCount: '作废单数',
  voidedAmount: '作废金额',
  paymentCount: '收款笔数',
  collectedAmount: '收款金额',
  subtotalAmount: '小计',
  totalAmount: '单据金额',
  paidAmount: '已收',
  refundableAmount: '可退',
}

export function salesColumnLabel(prop) {
  return moneyLabel(SALES_COLUMN_TEXT[prop] || prop)
}

/**
 * 报表时间口径提示：营业日 = 门店本地日 + 营业日切点（KTV 通宵场次归前一营业日）。
 * `businessZone` 由后端响应给出（当前为 Asia/Shanghai），桶标签与明细分页都按它划分。
 */
export function businessDayHint(businessZone) {
  return `营业日按 ${businessZone || '门店时区'} 划分（凌晨场次归前一营业日），跨零点场次可能与单据时间不在同一天。`
}

// —— 5.1 审计日志（iam_audit_log，平台 /admin/audits 契约）———————————————
/**
 * 审计结果：后端 `iam_audit_log.result` 只落 SUCCESS / FAILURE（default 'SUCCESS'）。
 * 同时兼容历史/其它服务的 SUCCEEDED / FAILED / DENIED 拼写，避免旧数据落成英文原文。
 */
export const AUDIT_RESULT_TEXT = {
  SUCCESS: '成功',
  SUCCEEDED: '成功',
  FAILED: '失败',
  FAILURE: '失败',
  DENIED: '已拒绝',
}
export const AUDIT_RESULT_TYPE = {
  SUCCESS: 'success',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  FAILURE: 'danger',
  DENIED: 'warning',
}
export function auditResultText(result) {
  return AUDIT_RESULT_TEXT[result] || unknownEnumText(result)
}
export function auditResultType(result) {
  return AUDIT_RESULT_TYPE[result] || 'info'
}

/**
 * 审计结果筛选项：取值必须是后端允许的两个枚举（`AuditQueryRequest.RESULTS`），
 * 传其它值后端直接 400，因此下拉只给 SUCCESS / FAILURE（历史拼写仅在展示层兼容）。
 */
export const AUDIT_RESULT_OPTIONS = [
  { value: 'SUCCESS', label: AUDIT_RESULT_TEXT.SUCCESS },
  { value: 'FAILURE', label: AUDIT_RESULT_TEXT.FAILURE },
]

/** 审计操作人类型（operator_type）：后端只落 PLATFORM / TENANT，其余为兼容项。 */
export const AUDIT_OPERATOR_TYPE_TEXT = {
  PLATFORM: '平台账号',
  TENANT: '租户账号',
  ADMIN: '后台账号',
  STAFF: '运营人员',
  SYSTEM: '系统',
  MEMBER: '会员',
  // 客户侧一律「客户」（与 cst_member 的展示口径一致）：历史上这里写「顾客」，
  // 与同一张表里的 cst_member='客户' 是同一个业务两套叫法。
  CUSTOMER: '客户',
  ANONYMOUS: '匿名',
}
export function auditOperatorTypeText(type) {
  return AUDIT_OPERATOR_TYPE_TEXT[type] || unknownEnumText(type)
}

/**
 * 审计资源类型（resource_type）：后端口径是**表名**（`iam_audit_log.resource_type` 注释「如 ord_order」），
 * 同时兼容部分服务可能上报的大写语义码（ORDER / PRODUCT …）。
 */
export const AUDIT_RESOURCE_TYPE_TEXT = {
  // 表名形态（当前后端实际写入）
  ord_order: '订单',
  ord_order_item: '订单加项',
  ord_product: '商品',
  ord_product_category: '商品分类',
  ord_catalog_item: '点单目录',
  ord_inventory_material: '仓库商品',
  ord_inventory_stock: '库存',
  ord_inventory_transaction: '库存流水',
  ord_ktv_session: 'KTV 会话',
  ord_ktv_server_session: '服务人员会话',
  ord_reservation: '预约',
  res_resource: '包厢',
  res_room_type: '房型',
  res_occupation: '包厢占用',
  // cst_member 实际存的是**客户**（等级/权益/成长值业务未实现）：审计里的资源名按客户口径展示。
  // 其余 cst_wallet_* / cst_point_* 属于储值/积分口径，保持原样。
  cst_member: '客户',
  cst_wallet_account: '客户储值',
  cst_wallet_ledger: '储值流水',
  cst_point_account: '客户积分',
  cst_point_ledger: '积分流水',
  pay_intent: '支付流水',
  pay_collect: '收款',
  pay_transaction: '支付交易',
  pay_refund: '退款',
  pay_shift: '交班',
  pay_daily_closing: '日结',
  pay_channel_config: '支付渠道',
  tenant_payment_method: '支付方式',
  tnt_tenant: '租户',
  tnt_tenant_config: '租户配置',
  tnt_store: '门店',
  tnt_organization: '组织',
  tnt_pricing_plan: '计价方案',
  tnt_business_type: '业态',
  iam_role: '角色',
  iam_permission: '权限',
  iam_user_role: '账号角色',
  iam_audit_log: '审计日志',
  saa_admin_account: '后台账号',
  // 语义码形态（兼容）
  ORDER: '订单',
  ORDER_ITEM: '订单加项',
  PRODUCT: '商品',
  PRODUCT_CATEGORY: '商品分类',
  CATALOG_ITEM: '点单目录',
  INVENTORY_MATERIAL: '仓库商品',
  INVENTORY: '库存',
  RESOURCE: TERMS.ktvRoom,
  ROOM: TERMS.ktvRoom,
  ROOM_TYPE: '房型',
  RESERVATION: '预约',
  MEMBER: '会员',
  CUSTOMER: '会员',
  WALLET: '储值',
  POINTS: '积分',
  PAYMENT: '支付',
  REFUND: '退款',
  STORE: TERMS.store,
  TENANT: TERMS.tenant,
  STAFF: '运营人员',
  ROLE: '角色',
  PERMISSION: '权限',
  PRICING_PLAN: '计价方案',
  SHIFT: '交班',
  DAILY_CLOSING: '日结',
  KTV_SESSION: 'KTV 会话',
  CONFIG: '配置',
  AUDIT: '审计日志',
  AUTH: '登录认证',
}
export function auditResourceTypeText(type) {
  return AUDIT_RESOURCE_TYPE_TEXT[type] || unknownEnumText(type)
}

/**
 * 审计动作（action）是稳定码 `<模块>.<对象>.<动作>`（如 `order.settle`）。
 * 后端写入时一定会补 `action_label` 中文标签（未登记的动作码也会按模块/动作推导），
 * 因此这里的词表只是「后端没给标签」时的兜底，取动作码最后一段查动词表。
 */
export const AUDIT_ACTION_VERB_TEXT = {
  create: '新建',
  update: '修改',
  delete: '删除',
  remove: '移除',
  assign: '分配',
  revoke: '撤销',
  grant: '授权',
  toggle: '启停',
  submit: '提交',
  approve: '审批通过',
  reject: '审批驳回',
  cancel: '取消',
  void: '作废',
  adjust: '调整',
  confirm: '确认',
  upload: '上传',
  download: '下载',
  export: '导出',
  import: '导入',
  publish: '上架',
  unpublish: '下架',
  open: '开台/开启',
  close: '结台/关闭',
  settle: '结算',
  collect: '收款',
  request: '申请',
  select: '切换',
  login: '登录',
  logout: '登出',
  change: '修改',
  reset: '重置',
  bind: '绑定',
  unbind: '解绑',
  operate: '操作',
  operation: '操作',
  recharge: '充值',
  view: '查看',
  hold: '挂单',
  transfer: '转台',
  occupy: '占用',
  release: '释放',
  add: '加项',
  correct_pause: '暂停时长修正',
}

/** 历史/其它服务上报的大写动作码（非 `<模块>.<动作>` 形态）兼容词表。 */
export const AUDIT_ACTION_TEXT = {
  LOGIN: '登录',
  LOGOUT: '登出',
  SSO_LOGIN: '单点登录',
  CREATE: '新增',
  UPDATE: '修改',
  DELETE: '删除',
  VIEW: '查看',
  QUERY: '查询',
  EXPORT: '导出',
  IMPORT: '导入',
  ENABLE: '启用',
  DISABLE: '停用',
  ON_SHELF: '上架',
  OFF_SHELF: '下架',
  CONFIRM: '确认',
  REJECT: '拒绝',
  CANCEL: '取消',
  VOID: '作废',
  SETTLE: '结算',
  COLLECT: '收款',
  REFUND: '退款',
  RECHARGE: '充值',
  ADJUST: '调整',
  RECEIVE: '入库',
  ISSUE: '出库',
  GRANT: '授权',
  REVOKE: '回收',
  TOGGLE: '切换',
  RESET_PASSWORD: '重置密码',
  CHANGE_PASSWORD: '修改密码',
}

/**
 * 动作筛选兜底选项：后端 `GET /admin/audits/actions` 提供完整「动作码 → 中文标签」目录，
 * 页面优先用它；接口缺位时用这份最常见的动作码，保证下拉不为空（仍可手工输入任意码）。
 */
export const AUDIT_ACTION_FALLBACK_OPTIONS = [
  { value: 'order.settle', label: '结台结算' },
  { value: 'order.void', label: '订单作废' },
  // 运营代客取消（POST /business/orders/{id}/cancel）：与「订单作废」区分，审计动作码 order.cancel。
  { value: 'order.cancel', label: '取消订单' },
  { value: 'order.item.add', label: '订单加项' },
  { value: 'order.ktv_session.open', label: '开台' },
  { value: 'order.ktv_session.close', label: '结台' },
  { value: 'payment.collect', label: '组合收款' },
  { value: 'payment.refund.request', label: '退款申请' },
  { value: 'cashier.shift.close', label: '交班结账' },
  { value: 'cashier.daily_closing.close', label: '营业日结' },
  { value: 'inventory.receipt.create', label: '物料入库' },
  { value: 'inventory.adjust', label: '库存调整' },
  { value: 'product.create', label: '商品新建' },
  { value: 'product.update', label: '商品修改' },
  { value: 'product.publish', label: '商品上架' },
  { value: 'product.unpublish', label: '商品下架' },
  { value: 'wallet.recharge', label: '储值充值' },
  { value: 'wallet.refund', label: '储值退还' },
  { value: 'points.adjust', label: '积分调整' },
  { value: 'member.create', label: '客户新建' },
  { value: 'resource.roomtype.create', label: '房型新建' },
  { value: 'reservation.confirm', label: '预约确认' },
  { value: 'reservation.cancel', label: '取消预约' },
  { value: 'reservation.no_show', label: '预约未到店' },
  { value: 'iam.role.permissions.assign', label: '角色权限分配' },
  { value: 'auth.login', label: '后台登录' },
  { value: 'auth.password.change', label: '密码修改' },
]

/** 动作码 → 中文：actionLabel 优先，其次精确词表，再按动作码最后一段推导，最后才回落「未知（CODE）」。 */
export function auditActionText(action, actionLabel) {
  const label = typeof actionLabel === 'string' ? actionLabel.trim() : ''
  if (label) return label
  const code = action === null || action === undefined ? '' : String(action).trim()
  if (!code) return '—'
  if (AUDIT_ACTION_TEXT[code]) return AUDIT_ACTION_TEXT[code]
  const segments = code.split('.')
  const verb = segments[segments.length - 1].toLowerCase()
  if (AUDIT_ACTION_VERB_TEXT[verb]) return AUDIT_ACTION_VERB_TEXT[verb]
  return unknownEnumText(code)
}


// —— 6. 错误提示（前端自己产生的文案）———————————————————————————
/** 前端兜底提示；服务端错误码映射见 utils/adminErrorMessage.js。 */
export const ERRORS = {
  csrfTokenMissing: '服务端未返回 CSRF token',
  contextNotRefreshable: '会话中没有可刷新的运营上下文',
  contextMissing: '请先选择运营上下文。',
  permissionDenied: '没有操作权限，请联系管理员。',
  sessionExpired: '登录已过期，请重新登录',
  forbiddenHint: '（请先在右上角重新选择门店上下文；仍失败请联系平台为该账号分配对应角色后重新登录）',
}
/**
 * 历史占位姓名：客户档案建档时被填成这些词的（如字面「会员」）**不作为姓名展示**。
 * 放在词表而不是页面里，一是口径集中，二是「客户管理」页要满足「面向用户不出现『会员』」的源码守卫。
 * 展示规则见 `views/tenant/members.vue#memberNameText`：IM 昵称优先 → 档案姓名（排除占位）→ 「—」。
 */
export const LEGACY_PLACEHOLDER_NAMES = ['会员', '客户', '顾客']
/**
 * 统一账号主体类型（`idt_account.account_type`）。
 *
 * 客户档案与运营人员**共用一张账号表**：同一个人可以既是客户又是员工（员工也可以是消费者），
 * 所以客户管理页要能把「这条客户档案挂的是不是一个员工账号」显示出来，避免运营按客户口径误处理。
 */
export const ACCOUNT_TYPE_TEXT = { CUSTOMER: '客户', EMPLOYEE: '员工', PLATFORM_OPERATOR: '平台运营' }
export function accountTypeText(type) {
  return ACCOUNT_TYPE_TEXT[type] || unknownEnumText(type)
}