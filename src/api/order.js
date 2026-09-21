import request from './request'

// —— 订单/KTV 领域服务（服务端按会话上下文授权）——

/**
 * 订单列表。筛选参数原样透传（统一时间区间口径 `from`/`to`，闭区间，见 `@/utils/dateRange`）。
 *
 * @param {object} [params] `{ from, to }`（可选，缺省不下发 = 不筛），由 `dateRangeParams()` 产出
 */
export function listOrders(params) {
  return request.get('/api/v1/business/orders', { params })
}

/**
 * 订单收款明细（批量）：组合支付到底怎么收的——每一笔已确认收款的分腿（积分/储值/现金/支付宝/微信/Stripe
 * 各自一行，不合并）、渠道支付流水（含渠道交易号与状态）与退款记录。
 *
 * 口径：**没有收款数据的订单不会出现在返回里**（页面据此显示「未收款」，而不是 ¥0.00）；
 * 混币种订单 `mixedCurrency=true` 且不给单一币种金额，调用方不得跨币种相加。
 * 服务端要求 `orderIds` 非空且 ≤ 100 个（超限 400），因此调用方按当前页/单笔传入。
 */
export function getOrderCollections(orderIds) {
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).filter((id) => id != null && id !== '')
  return request.get('/api/v1/business/payments/order-collections', { params: { orderIds: ids.join(',') } })
}

export function createOrder(data) {
  return request.post('/api/v1/business/orders', data)
}

export function confirmOrder(id) {
  return request.post('/api/v1/business/orders/' + id + '/confirm')
}

export function settleOrder(id, expectedVersion) {
  return request.post('/api/v1/business/orders/' + id + '/settle', { expectedVersion })
}

export function voidOrder(id, reason) {
  return request.post('/api/v1/business/orders/' + id + '/void', { reason })
}

/**
 * 取消订单（运营代客取消）：`reason` 必填，空白 → 400 `CANCEL_REASON_REQUIRED`；
 * 已收款 → 409 `ORDER_HAS_PAYMENT_REFUND_FIRST`（先退款再取消）；
 * 已完成/已作废 → 409 `ORDER_STATUS_INVALID`。
 * 成功后订单置 VOIDED 并释放包厢占用，审计动作 `order.cancel`（中文「取消订单」）。
 */
export function cancelOrder(id, reason) {
  return request.post('/api/v1/business/orders/' + id + '/cancel', { reason })
}

/**
 * 开台：freeWaitMinutes = 免费等待分钟；partySize = 到店人数（null/undefined = 不登记）。
 * 服务端校验 partySize > 0 且不超过包厢容量，非法返回 400 PARTY_SIZE_INVALID 且不产生占用。
 */
export function openSession(sessionId, freeWaitMinutes, partySize) {
  return request.post('/api/v1/business/ktv/sessions/' + sessionId + '/open', { freeWaitMinutes, partySize })
}

export function closeSession(sessionId) {
  return request.post('/api/v1/business/ktv/sessions/' + sessionId + '/close')
}

export function getOrderSession(orderId) {
  return request.get('/api/v1/business/orders/' + orderId + '/session')
}

export function getBill(orderId) {
  return request.get('/api/v1/business/orders/' + orderId + '/bill')
}

/**
 * KTV 计价方案（包厢价格）：与后台「计价方案」同源，预约/开台/看板展示用。
 *  - 不带 resourceId：返回门店级方案（roomUnitPrice 为门店生效单价）与按房型单价映射 unitPriceByRoomType；
 *  - 带 resourceId：返回该包厢「生效单价」（房型字典价 > 方案按房型价 > 门店价）与
 *    roomTypePriceApplied / appliedRoomTypeCode / appliedRoomTypeName，用于标注房型是否定价。
 */
export function getKtvPricing(storeId, resourceId) {
  return request.get('/api/v1/business/ktv/pricing', { params: { storeId, resourceId } })
}

export function addItem(orderId, data) {
  return request.post('/api/v1/business/orders/' + orderId + '/items', data)
}
// 订单加项列表（含待确认状态，B 端确认 C 端提交的加项用）
export function listOrderItems(orderId) {
  return request.get('/api/v1/business/orders/' + orderId + '/items')
}

/**
 * 客户待确认加项（门店维度聚合，一次拿全）：后台角标 / 收银台卡片标记 / 订单管理列表 / 处理抽屉共用。
 *
 * 返回 `{ pendingCount, pendingAmount, currencyCode, mixedCurrency, revision, serverTimeMillis, orders:[…] }`；
 * 服务端读走 3s TTL 缓存、写路径（客户提交/确认/拒绝）后立即失效，客户端 15s 轮询即可近似实时。
 * 未来接入消息中心后本接口保留为兜底快照。
 */
export function getPendingApprovalItems() {
  return request.get('/api/v1/business/orders/pending-approval')
}
export function confirmItem(orderId, itemId) {
  return request.post('/api/v1/business/orders/' + orderId + '/items/' + itemId + '/confirm')
}
export function rejectItem(orderId, itemId) {
  return request.post('/api/v1/business/orders/' + orderId + '/items/' + itemId + '/reject')
}

// 包厢资源（开台选包厢用，resource 服务）
export function listResources(params) {
  return request.get('/api/v1/business/resources', { params })
}

// —— 商品/服务目录（点单加项用，order 服务 /business/catalog）——
export function listCatalog(params) {
  return request.get('/api/v1/business/catalog/items', { params })
}

/**
 * 物料分页列表：`params` = page/pageSize/storeId/status/category/keyword，响应是 MyBatis-Plus 分页信封
 * （`records`/`total`/`current`/`size`），调用方按 `records` 取数组，不要再当数组用。
 */
export function listInventoryMaterials(params) { return request.get('/api/v1/admin/inventory/materials', { params }) }
export function createInventoryMaterial(data) { return request.post('/api/v1/admin/inventory/materials', data) }
export function updateInventoryMaterial(id, data) { return request.put('/api/v1/admin/inventory/materials/' + id, data) }
/**
 * 入库（采购/进货）：`data.unitCost` 为**可选的本次入库批次单价**（最小货币单位/计量单位）。
 * 留空（不传或传 0）表示沿用物料采购价 `purchasePrice`；显式 > 0 优先参与移动加权平均。
 * 为负或超上限 → 400 `PURCHASE_PRICE_INVALID`；与库存既有平均成本币种不一致 → 400 `INVENTORY_CURRENCY_MISMATCH`。
 */
export function receiveInventory(data) { return request.post('/api/v1/admin/inventory/receipts', data) }
/** 调整：`direction=IN` 时 `unitCost` 语义同入库；`direction=OUT` 时后端忽略该字段（按平均成本结转）。 */
export function adjustInventory(data) { return request.post('/api/v1/admin/inventory/adjustments', data) }
/**
 * 库存流水分页列表：每行含 `unitCost`/`totalCost`/`currencyCode`（升级前的历史行为 null，展示「—」）。
 * `params` = page/pageSize/materialId/transactionType/sourceType/from/to/keyword，响应是分页信封（`records`/`total`）；
 * `from`/`to` 按流水发生时刻 `created_at` 的**闭区间**过滤，接受 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm:ss`
 * （结束日按当天最后一刻收口），`from > to` → 400 `INVENTORY_FILTER_INVALID`。
 */
export function listInventoryTransactions(params) { return request.get('/api/v1/admin/inventory/transactions', { params }) }
/**
 * 库存成本（结存口径：结存数量 × 移动加权平均成本），按门店/物料/币种。
 * `params` = page/pageSize/storeId/keyword，响应是分页信封；`total` = 命中物料条数，
 * `records` 只是当前页的物料成本行，而信封 `currencyCode`（单币种）/ `mixedCurrency`（混币种时
 * `currencyCode=null`，禁止求和）按**全部命中行**计算，翻页不漂移。
 */
export function listInventoryCosts(params) { return request.get('/api/v1/admin/inventory/costs', { params }) }
export function listProducts(params) { return request.get('/api/v1/admin/products', { params }) }
export function createProduct(data) { return request.post('/api/v1/admin/products', data) }
export function updateProduct(id, data) { return request.put('/api/v1/admin/products/' + id, data) }
export function onShelfProduct(id) { return request.post('/api/v1/admin/products/' + id + '/on-shelf') }
export function offShelfProduct(id) { return request.post('/api/v1/admin/products/' + id + '/off-shelf') }

// 商品分类字典：挂在商品既有 /api/v1/admin/products 前缀下（复用商品权限，不新增菜单/权限）
export function listProductCategories(params) { return request.get('/api/v1/admin/products/categories', { params }) }
export function createProductCategory(data) { return request.post('/api/v1/admin/products/categories', data) }
export function updateProductCategory(id, data) { return request.put('/api/v1/admin/products/categories/' + id, data) }
export function deleteProductCategory(id) { return request.delete('/api/v1/admin/products/categories/' + id) }
export function listInventoryRecovery(orderId) { return request.get('/api/v1/admin/orders/' + orderId + '/inventory-recovery') }
export function decideInventoryRecovery(orderId, itemId, data) { return request.post('/api/v1/admin/orders/' + orderId + '/items/' + itemId + '/inventory-recovery', data) }
export function createCatalogItem(data) {
  return request.post('/api/v1/business/catalog/items', data)
}
export function updateCatalogItem(id, data) {
  return request.put('/api/v1/business/catalog/items/' + id, data)
}
export function disableCatalogItem(id) {
  return request.delete('/api/v1/business/catalog/items/' + id)
}
