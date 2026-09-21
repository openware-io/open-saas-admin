import request from './request'

/**
 * 报表/对账（platform-admin-service 只读聚合）。
 *
 * 统一口径（六张报表一致，见 `docs/renovation/SAAS_PLATFORM_04_DATA.md` 与后端
 * `com.gvchat.infrastructure.time.ReportTimeBuckets`）：
 *  - `storeId` 空 = 全部门店（不传该键，不传空串）；
 *  - `from`/`to` 一律 `yyyy-MM-dd`（`@/utils/dateRange` 唯一序列化入口）：后端按**闭区间**收口整天，
 *    `from > to` 后端回 400 `TIME_RANGE_INVALID`（前端由 `dateRangeWarning` 先挡住不发请求）；
 *  - `granularity` = `DAY | WEEK | MONTH | YEAR`（缺省 DAY，不传键即可）；
 *    **营业日**按门店时区 + 营业日切点计算（KTV 通宵场次归前一营业日），周起点为周一，
 *    桶的起止与展示标签由后端给出（`row.bucket.label`），前端**不得**自行推算周数；
 *  - 金额一律最小货币单位整数，行内 `currencyCode` 是币种快照；混币种时信封
 *    `currencyCode=null` + `mixedCurrency=true`，**禁止跨行求和**（`@/utils/currency-summary`）。
 */
export function getOperations(params) {
  return request.get('/api/v1/admin/reports/operations', { params })
}
export function getPayments(params) {
  return request.get('/api/v1/admin/reports/payments', { params })
}
export function getEmployeePerformance(params) {
  return request.get('/api/v1/admin/reports/employee-performance', { params })
}
/**
 * 资源利用率（KTV 包厢）：`GET /api/v1/admin/reports/resources?storeId=&from=&to=&granularity=`
 *
 * **一次开台（一次消费）一行**，同一包厢同一天开台多次就是多行，各行只算自己那次的时长：
 *  - `openedAt` / `closedAt`：该次开台/结台时间（存储值 ISO，未结台 `closedAt=null`）；
 *  - `durationSeconds`：本次时长（秒）= 结台 − 开台 − 暂停；**未结台记 0**，绝不再从占用窗口求和；
 *  - `turnoverCount`：该次开台是否已完成（已完成 = 1）；同行同包厢同营业日相加 = 当日翻台次数；
 *  - `turnoverRate`：该包厢**该营业日**利用率（**比例值**，前端走 `formatPercent` 乘 100）
 *    = 当日会话时长合计 ÷ 24 小时；`utilizationBasis` 给出该口径标识。
 *
 * 注意：这是**唯一**按次开台出行的报表，不要把它当成「按包厢聚合」的统计来用。
 */
export function getResourceUtilization(params) {
  return request.get('/api/v1/admin/reports/resources', { params })
}

/**
 * 库存成本与毛利报表：`GET /api/v1/admin/reports/inventory-gross-profit?storeId=&from=&to=&granularity=`
 *
 * 成本 = 期间净售出数量（CONSUME − REVERSE）× 物料移动加权平均成本，毛利 = 收入 − 成本，
 * 毛利率 = 毛利 / 收入（收入为 0 时后端给 `null`，前端显示「—」）。
 *
 * 信封 `currencyCode`（单币种）/ `mixedCurrency`（混币种时 `currencyCode=null`）：
 * 行按 (门店, 统计桶, 币种) 拆分，混币种时**禁止跨行求和**（后端也不给合计），必须逐行按
 * 行内 `currencyCode` 渲染符号；`costBasis` 是成本口径（当前恒为 `PERIOD_END_MOVING_AVERAGE`）。
 * 按周/月/年看时，成本单价仍取自**查询时点**的平均成本（同一 `costBasis` 近似），不会因为桶更大而更准。
 */
export function getInventoryGrossProfit(params) {
  return request.get('/api/v1/admin/reports/inventory-gross-profit', { params })
}

/**
 * 销售报表：`GET /api/v1/admin/reports/sales?storeId=&from=&to=&granularity=&status=&page=&pageSize=`
 *
 * 一个端点同时给**统计**与**明细**，保证两者在同一份 `from/to/granularity/status` 下口径一致：
 *  - `buckets`：按 (门店, 统计桶, 币种) 一行的统计（销售额/订单数/客单价/折扣/退款/作废/收款 + 支付方式构成）；
 *  - `details`：明细分页，Page 信封 `records/total/current/size`（与后台其它列表同一约定）；
 *    `details.total` 等于 `buckets` 的 `orderCount` 之和（默认口径：排除 CANCELLED/VOIDED）。
 *
 * `status` 传空 = 与统计同口径；传具体状态（如 `VOIDED`）用于单独复核作废/取消单。
 */
export function getSales(params) {
  return request.get('/api/v1/admin/reports/sales', { params })
}

/**
 * 商品/服务销售排行：`GET /api/v1/admin/reports/sales-items?storeId=&from=&to=&itemType=&topN=`
 *
 * 口径与销售报表同源：同一份 `storeId/from/to`（排行不分营业日档，看整段区间）、
 * 排除已取消/已作废订单、只算已生效明细（待确认/被拒加项不计入）。
 *  - `itemType`：`PRODUCT`（商品）/`SERVICE`（服务）/`ROOM_FEE`（包厢费）/`ADD_ON`（加项兜底），空 = 全部；
 *  - `topN`：默认 20，后端上限 200；
 *  - `rows` 按销售额降序；**销售额是明细金额（已扣折扣）**，`discountAmount` 单列便于核对原价 → 实收；
 *  - `share` 是**同币种内**占比；混币种时 `currencyCode=null` + `mixedCurrency=true` 并逐币种给 `totals`，
 *    **禁止跨币种求和**（见 `@/utils/currency-summary`）。
 */
export function getSalesItems(params) {
  return request.get('/api/v1/admin/reports/sales-items', { params })
}
