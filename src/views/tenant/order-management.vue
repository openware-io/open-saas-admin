<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>订单管理</h2>
      <div class="header-actions">
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <!-- 下单时间（created_at）闭区间：结束端由后端收口到当天 23:59:59.999 -->
        <DateRangeFilter v-model="query.range" />
        <el-select v-model="query.status" placeholder="订单状态" clearable style="width: 150px" @change="search">
          <el-option v-for="option in ORDER_STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="订单号 / 包厢 / 客户ID"
          clearable
          style="width: 240px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <!-- 客户自助加项待确认：一眼筛出「需要处理」的单，并直达集中处理抽屉 -->
        <el-badge :value="pendingApprovalStore.pendingCount" :max="99" :hidden="!pendingApprovalStore.pendingCount" type="danger">
          <el-button :type="onlyPending ? 'warning' : 'default'" @click="toggleOnlyPending">
            <el-icon><Bell /></el-icon>待确认加项
          </el-button>
        </el-badge>
        <el-button v-if="pendingApprovalStore.pendingCount" link type="warning" @click="pendingApprovalStore.openDrawer()">立即处理</el-button>
      </div>

      <div class="order-summary">
        <span>共 <b>{{ summary.total }}</b> 单</span>
        <span>在场 <b>{{ summary.active }}</b></span>
        <span>待结算 <b>{{ summary.waitingSettlement }}</b></span>
        <span>待支付 <b>{{ summary.waitingPayment }}</b></span>
        <span>已完成 <b>{{ summary.completed }}</b></span>
        <span>已作废 <b>{{ summary.voided }}</b></span>
        <!-- 金额合计只在命中行币种一致时给出；混币种不做跨币种相加（16_CURRENCY_CONVENTIONS §3） -->
        <span v-if="summary.mixedCurrency" class="order-summary__warn">命中多币种订单，金额请见明细逐单查看</span>
        <span v-else>应收 <b>{{ formatMoney(summary.payableAmount, summary.currencyCode) }}</b></span>
        <span v-if="!summary.mixedCurrency">已收 <b>{{ formatMoney(summary.paidAmount, summary.currencyCode) }}</b></span>
      </div>

      <el-table :data="pageRows" v-loading="loading" border stripe>
        <el-table-column label="订单号" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">{{ row.orderNo || ('#' + row.id) }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="包厢" min-width="150">
          <template #default="{ row }">{{ roomText(row) }}</template>
        </el-table-column>
        <el-table-column label="人数" width="80" align="center">
          <template #default="{ row }">{{ row.partySize != null ? row.partySize + ' 人' : '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="orderStatusTagType(row.status)" size="small">{{ orderStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <!-- 客户自助加项待确认：该单有几条未确认（不计入应收），点开直达集中处理 -->
        <el-table-column label="待确认加项" width="120" align="center">
          <template #default="{ row }">
            <el-button
              v-if="pendingApprovalStore.countOfOrder(row.id) > 0"
              link
              type="warning"
              @click="pendingApprovalStore.openDrawer()"
            >×{{ pendingApprovalStore.countOfOrder(row.id) }} 待处理</el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <!-- 消费金额取服务端**实时合计**（开台中＝明细 − 房费快照 + 实时房费，与收银台卡片/账单同一个数）；
             旧后端没有 liveTotalAmount 时才退回库内合计（已含上一次刷新的房费明细）。 -->
        <el-table-column label="消费金额" width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.liveTotalAmount != null ? row.liveTotalAmount : row.totalAmount, row.currencyCode) }}</template>
        </el-table-column>
        <el-table-column label="已收" width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.paidAmount, row.currencyCode) }}</template>
        </el-table-column>
        <!-- 收款方式：组合支付必须看得出「怎么收的」（分腿明细来自收款明细接口，未收款 ≠ 0 元） -->
        <el-table-column label="收款方式" min-width="160">
          <template #default="{ row }">
            <el-tooltip v-if="paymentSummaryOf(row)" placement="top">
              <template #content>
                <div v-for="leg in paymentLegsOf(row)" :key="leg.method">
                  {{ methodLabel(leg.method, walletBrand) }} {{ formatMoney(leg.amount, paymentCurrencyOf(row)) }}
                </div>
                <div v-if="!paymentLegsOf(row).length">该单无分腿明细（历史数据）</div>
              </template>
              <span class="pay-method">
                <el-tag v-if="isCombinedOf(row)" type="warning" size="small">组合</el-tag>
                <span>{{ paymentSummaryOf(row) }}</span>
              </span>
            </el-tooltip>
            <span v-else class="muted">{{ paymentEmptyTextOf(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="165">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <!-- 订单维度的「消费时间」看会话，不看订单：订单 created_at 是下单/预约时刻，
             中间可能夹着多次开台（下单→结束 直接相减会把多次消费算成一段）。 -->
        <el-table-column label="本次开台" width="230">
          <template #default="{ row }">{{ sessionSpanText(row) }}</template>
        </el-table-column>
        <el-table-column label="结束时间" width="165">
          <template #default="{ row }">{{ endTimeText(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="canCancelOrder(row)" link type="danger" @click="cancel(row)">取消订单</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="emptyText" />
        </template>
      </el-table>

      <div class="admin-pagination">
        <el-pagination
          layout="total, prev, pager, next, sizes"
          :total="page.total"
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50, 100]"
        />
      </div>
    </div>

    <!-- 订单详情：订单字段 + 服务端账单（金额一律取账单快照，不在前端重算） -->
    <el-drawer v-model="detailVisible" size="520px">
      <template #header>
        <div class="drawer-title">
          <div>
            <h3>{{ detailOrder?.orderNo || '订单详情' }}</h3>
            <p>{{ roomText(detailOrder) }}</p>
          </div>
          <el-tag v-if="detailOrder" :type="orderStatusTagType(detailOrder.status)">{{ orderStatusText(detailOrder.status) }}</el-tag>
        </div>
      </template>
      <div v-if="detailOrder" class="order-detail">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="订单ID">{{ detailOrder.id }}</el-descriptions-item>
          <el-descriptions-item label="包厢">{{ roomText(detailOrder) }}</el-descriptions-item>
          <el-descriptions-item label="人数">{{ detailOrder.partySize != null ? detailOrder.partySize + ' 人' : '—' }}</el-descriptions-item>
          <el-descriptions-item label="客户ID">{{ detailOrder.customerId != null ? detailOrder.customerId : '—' }}</el-descriptions-item>
          <el-descriptions-item label="会话状态">{{ sessionStatusText(detailOrder.sessionStatus) }}</el-descriptions-item>
          <el-descriptions-item label="本次开台">{{ sessionSpanText(detailOrder) }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatTime(detailOrder.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ endTimeText(detailOrder) }}</el-descriptions-item>
          <el-descriptions-item label="消费金额">{{ formatMoney(detailOrder.liveTotalAmount != null ? detailOrder.liveTotalAmount : detailOrder.totalAmount, detailOrder.currencyCode) }}</el-descriptions-item>
          <el-descriptions-item label="已收">{{ formatMoney(detailOrder.paidAmount, detailOrder.currencyCode) }}</el-descriptions-item>
        </el-descriptions>

        <div class="bill">
          <div class="bill-head__line">
            <b>账单明细</b>
            <span v-if="detailBill">币种：{{ currencyText(detailBill.currencyCode) }}</span>
          </div>
          <div v-if="detailBillLoading" class="detail-placeholder">账单加载中…</div>
          <template v-else-if="detailBill">
            <div v-if="detailBill.roomFee" class="bill-row">
              <span>{{ detailBill.roomFee.name || '包厢费' }}</span>
              <b>{{ money(detailBill.roomFee.amount) }}</b>
            </div>
            <!-- 包厢费「怎么算出来的」：方案 / 计费时长（扣暂停）/ 每递增粒度单价 × 块数 / 超时部分。
                 所有数字都来自服务端账单字段，页面不做任何算术；历史固化值会说清「时长未记录」。 -->
            <div v-if="detailBill.roomFee" class="bill-explain">
              <span v-if="detailBill.roomFee.planName">计费方案 {{ detailBill.roomFee.planName }}</span>
              <template v-if="detailBill.roomFee.durationKnown">
                <span>
                  计费 {{ durationTextFromSeconds(detailBill.roomFee.durationSeconds) }}
                  <template v-if="detailBill.roomFee.pausedSeconds > 0">（已扣暂停 {{ durationTextFromSeconds(detailBill.roomFee.pausedSeconds) }}）</template>
                </span>
              </template>
              <span v-else>时长未记录：{{ roomFeeSourceText(detailBill.roomFee) }}</span>
              <span>
                {{ money(detailBill.roomFee.unitPrice) }} × {{ detailBill.roomFee.quantity }} 个计费单位
                <template v-if="detailBill.roomFee.incrementMinutes > 0">（每 {{ detailBill.roomFee.incrementMinutes }} 分钟一档）</template>
              </span>
              <span v-if="detailBill.roomFee.overSeconds > 0">
                其中超时 {{ durationTextFromSeconds(detailBill.roomFee.overSeconds) }}（标准 {{ durationTextFromSeconds(detailBill.roomFee.standardSeconds) }}，按 {{ detailBill.roomFee.overtimeRate }} 倍计）
              </span>
              <span v-if="detailBill.roomFee.roomFeeIncludesServer">已含 1 名标准服务人员</span>
              <span v-if="detailBill.roomFee.snapshotAt">金额固化于 {{ formatTime(detailBill.roomFee.snapshotAt) }}</span>
            </div>
            <div v-for="(item, index) in (detailBill.items || [])" :key="'item' + index" class="bill-row">
              <span>{{ item.name || '加项' }}<em v-if="item.quantity != null">× {{ item.quantity }}</em><em v-if="item.unitPrice != null">@ {{ money(item.unitPrice) }}</em></span>
              <b>{{ money(item.amount) }}</b>
            </div>
            <div v-for="(server, index) in (detailBill.servers || [])" :key="'server' + index" class="bill-row">
              <span>{{ server.serverName || server.server_name || '服务人员' }}<em v-if="server.quantity != null">× {{ server.quantity }} 个计费单位</em></span>
              <b>{{ money(server.amount) }}</b>
            </div>
            <div v-for="(promotion, index) in (detailBill.promotions || [])" :key="'promo' + index" class="bill-row">
              <span>{{ promotionTypeText(promotion.type) }}</span>
              <b>-{{ money(promotion.amount) }}</b>
            </div>
            <div v-if="!hasBillLines" class="detail-placeholder">暂无消费明细</div>
            <div class="bill-total">
              <div v-if="detailBill.subtotalAmount != null" class="bill-explain">
                <span>原价合计 {{ money(detailBill.subtotalAmount) }}</span>
                <span v-if="detailBill.discountAmount > 0">优惠 -{{ money(detailBill.discountAmount) }}</span>
                <span v-if="detailBill.taxAmount > 0">税 +{{ money(detailBill.taxAmount) }}</span>
              </div>
              <div class="bill-row"><span>合计</span><b>{{ money(detailBill.totalAmount) }}</b></div>
              <div class="bill-row"><span>已收</span><b>{{ money(detailBill.paidAmount) }}</b></div>
              <div class="bill-row"><span>应收</span><b>{{ money(payableAmount) }}</b></div>
            </div>
          </template>
          <div v-else class="detail-placeholder">账单暂不可用</div>
        </div>

        <!-- 收款明细：组合支付的每一腿、渠道流水与退款都要看得到（缺一项就会对不上账） -->
        <div class="bill">
          <div class="bill-head__line">
            <b>收款明细</b>
            <span v-if="detailCollections">
              {{ detailCollections.mixedCurrency ? '命中多币种，请逐笔核对' : '合计已收 ' + collectionsTotalText }}
            </span>
          </div>
          <div v-if="detailCollectionsLoading" class="detail-placeholder">收款明细加载中…</div>
          <template v-else-if="detailCollections">
            <div v-if="!(detailCollections.collections || []).length" class="detail-placeholder">该单暂无收款记录（未收款）</div>
            <div v-for="(collection, ci) in (detailCollections.collections || [])" :key="collection.collectNo || ci" class="pay-collection">
              <div class="pay-collection__head">
                <span>{{ formatTime(collection.collectedAt) }} · {{ collection.currencyCode ? currencyText(collection.currencyCode) : '—' }}</span>
                <el-tag v-if="collection.combined" type="warning" size="small">组合支付</el-tag>
              </div>
              <div class="pay-collection__no">收款单号 {{ collection.collectNo }}</div>
              <div v-for="leg in collectionLegs(collection)" :key="leg.method" class="bill-row">
                <span>{{ methodLabel(leg.method, walletBrand) }}</span>
                <b>{{ formatMoney(leg.amount, collection.currencyCode) }}</b>
              </div>
              <div class="bill-row"><span>本次应收</span><b>{{ formatMoney(collection.payable, collection.currencyCode) }}</b></div>
            </div>

            <template v-if="(detailCollections.transactions || []).length">
              <div class="pay-section-title">渠道流水</div>
              <div v-for="tx in detailCollections.transactions" :key="'tx' + tx.id" class="bill-row">
                <span>
                  {{ methodLabel(tx.provider, walletBrand) }}
                  <em>{{ tx.providerTransactionNo || '线下无渠道交易号' }} · {{ formatTime(tx.occurredAt) }}</em>
                </span>
                <b>{{ formatMoney(tx.amount, tx.currencyCode) }}</b>
              </div>
            </template>

            <template v-if="(detailCollections.refunds || []).length">
              <div class="pay-section-title">退款</div>
              <div v-for="refund in detailCollections.refunds" :key="'rf' + refund.id" class="bill-row">
                <span>
                  {{ refundStatusText(refund.status) }}
                  <em>{{ refund.providerRefundNo || '—' }} · {{ formatTime(refund.createdAt) }}</em>
                </span>
                <b>{{ formatMoney(refund.approvedAmount || refund.requestedAmount, refund.currencyCode) }}</b>
              </div>
              <div class="bill-row"><span>已退款合计</span><b>{{ formatMoney(detailCollections.refundedAmount, detailCollections.currencyCode) }}</b></div>
            </template>
          </template>
          <div v-else class="detail-placeholder">收款明细不可用</div>
        </div>
      </div>
      <template #footer>
        <div v-if="detailOrder" class="drawer-actions">
          <el-button @click="openCashier(detailOrder)">到收银台处理</el-button>
          <el-button v-if="canCancelOrder(detailOrder)" type="danger" plain @click="cancel(detailOrder)">取消订单</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bell, Refresh } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { cancelOrder, getBill, getOrderCollections, listOrders } from '@/api/order'
import { getWalletTokenConfig } from '@/api/admin'
import { currencyText, formatMoney, formatTime, promotionTypeText } from '@/utils/format'
import { durationTextFromSeconds, roomFeeSourceText } from '@/utils/billExplain'
import { WALLET_BRAND_NAME_DEFAULT, orderStatusText, refundStatusText, resolveWalletBrandName, sessionStatusText } from '@/constants/terms'
import { methodLabel } from '@/constants/payment-methods'
import {
  collectionLegs,
  collectionMethodSummary,
  indexOrderCollections,
  isCombinedPayment,
  mergedLegsByMethod,
  viewCurrency,
} from '@/utils/orderPayments'
import { notifyAdminRequestError, notifyCancelRequestError } from '@/utils/adminErrorMessage'
import { cancelReasonInputValidator, submitCancelWithReason, CANCEL_REASON_MAX_LENGTH } from '@/utils/cancelAction'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import {
  ORDER_STATUS_OPTIONS,
  canCancelOrder,
  filterOrders,
  orderSummary,
  paginateOrders,
  sortOrdersByCreatedAtDesc,
} from '@/utils/orderList'
import { useContextStore } from '@/stores/context'
import { usePendingApprovalStore } from '@/stores/pendingApproval'

const router = useRouter()
const contextStore = useContextStore()
const pendingApprovalStore = usePendingApprovalStore()
/**
 * 待确认加项被确认/拒绝后，订单金额与明细在服务端已变：本页缓存的列表必须重拉，
 * 否则「消费金额/待确认加项」列停在旧值（与收银台、C 端账单不一致）。
 */
watch(() => pendingApprovalStore.orderDataRevision, () => { load() })

const rows = ref([])
const loading = ref(false)
const query = reactive({ range: emptyDateRange(), status: '', keyword: '', page: 1, pageSize: 20 })
/** 只显示「有客户待确认加项」的订单（提醒处理，不改查询口径）。 */
const onlyPending = ref(false)

const detailVisible = ref(false)
const detailOrder = ref(null)
const detailBill = ref(null)
const detailBillLoading = ref(false)

/**
 * 收款明细（组合支付）：按 orderId 索引当前页的收款数据。
 * 只在拿得到数据时展示方式摘要——「查不到」不等于「0 元」，未收款单独文案。
 */
const collectionsByOrder = ref({})
const collectionsLoading = ref(false)
const walletBrand = ref(WALLET_BRAND_NAME_DEFAULT)
const detailCollections = ref(null)
const detailCollectionsLoading = ref(false)

const currentStoreId = computed(() => contextStore.storeId)

/** 门店维度按会话门店过滤（与收银台同口径：storeId 为空的订单按当前门店展示）。 */
const scopedRows = computed(() => rows.value
  .filter((order) => order.storeId == null || String(order.storeId) === String(currentStoreId.value)))

const filteredRows = computed(() => sortOrdersByCreatedAtDesc(
  filterOrders(scopedRows.value, { status: query.status, keyword: query.keyword })
    .filter((order) => !onlyPending.value || pendingApprovalStore.countOfOrder(order.id) > 0),
))

const summary = computed(() => orderSummary(filteredRows.value))
const page = computed(() => paginateOrders(filteredRows.value, query.page, query.pageSize))
const pageRows = computed(() => page.value.rows)

const emptyText = computed(() => (rows.value.length ? '没有符合当前筛选条件的订单' : '该门店暂无订单'))

const billLines = computed(() => {
  const bill = detailBill.value
  if (!bill) return []
  return [bill.roomFee, ...(bill.items || []), ...(bill.servers || []), ...(bill.promotions || [])]
    .filter((line) => line && line.amount != null)
})

const hasBillLines = computed(() => billLines.value.length > 0)
/**
 * 应收：一律取服务端账单 {@code payableAmount}（= 合计 − 已收，服务端算好）。
 * 旧后端没有该字段时才退回「合计 − 已收」兜底，页面不重复实现口径。
 */
const payableAmount = computed(() => {
  const bill = detailBill.value
  if (!bill) return 0
  if (bill.payableAmount != null) return Math.max(0, Number(bill.payableAmount) || 0)
  return Math.max(0, (Number(bill.totalAmount) || 0) - (Number(bill.paidAmount) || 0))
})

/** 金额一律按**单据币种快照**渲染（账单缺币种时退回订单快照）。 */
function money(minor) {
  return formatMoney(minor, detailBill.value?.currencyCode || detailOrder.value?.currencyCode)
}

/** 状态标签色：与收银台/账单同一套语义（在场=warning/primary，完成=success，作废=info）。 */
function orderStatusTagType(status) {
  if (status === 'COMPLETED') return 'success'
  if (status === 'VOIDED' || status === 'CANCELLED') return 'info'
  if (status === 'WAITING_SETTLEMENT' || status === 'WAITING_PAYMENT') return 'warning'
  if (status === 'SERVING') return 'primary'
  return 'info'
}

function roomText(order) {
  if (!order) return '—'
  const name = order.roomName || order.roomCode
  if (name) return name
  return order.roomResourceId != null ? '包厢 #' + order.roomResourceId : '未关联包厢'
}

/**
 * 本次开台（会话）时段：订单维度的「消费时间」只能看会话。`sessionOpenedAt/sessionClosedAt` 由后端订单投影
 * 给出（同一订单多次开台时给的是**当前这一次**）；没有会话显示「—」，未结台显示「进行中」。
 */
function sessionSpanText(order) {
  if (!order) return '—'
  const opened = order.sessionOpenedAt || order.session_opened_at
  if (!opened) return '—'
  const closed = order.sessionClosedAt || order.session_closed_at
  return formatTime(opened) + ' ~ ' + (closed ? formatTime(closed) : '进行中')
}

/** 结束时间：已完成/已作废取完成或取消时刻，在场订单显示「—」（还在计时）。 */
function endTimeText(order) {
  if (!order) return '—'
  const value = order.completedAt || order.cancelledAt
  return value ? formatTime(value) : '—'
}

async function load() {
  if (!currentStoreId.value) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    rows.value = asList(await listOrders({ ...dateRangeParams(query.range) }))
  } catch (e) {
    rows.value = []
    notifyAdminRequestError(e, '加载订单列表失败')
  } finally {
    loading.value = false
  }
}

function search() {
  const warning = dateRangeWarning(query.range)
  if (warning) {
    ElMessage.warning(warning)
    return
  }
  query.page = 1
  load()
}

function reset() {
  query.range = emptyDateRange()
  query.status = ''
  query.keyword = ''
  query.page = 1
  onlyPending.value = false
  load()
}

function toggleOnlyPending() {
  onlyPending.value = !onlyPending.value
  query.page = 1
}

async function openDetail(row) {
  detailOrder.value = row
  detailBill.value = null
  detailVisible.value = true
  detailBillLoading.value = true
  // 收款明细与账单并行拉：组合支付的口径只认服务端，前端不拼
  loadDetailCollections(row.id)
  try {
    detailBill.value = await getBill(row.id)
  } catch (e) {
    detailBill.value = null
  } finally {
    detailBillLoading.value = false
  }
}

// —— 收款明细（组合支付） ——

/** 服务端一次最多 100 个 orderIds；当前页最多 100 行，单次请求即可。 */
async function loadCollectionsFor(rows) {
  const ids = (rows || []).map((row) => row.id).filter((id) => id != null)
  if (!ids.length) return
  collectionsLoading.value = true
  try {
    const data = await getOrderCollections(ids.slice(0, 100))
    collectionsByOrder.value = { ...collectionsByOrder.value, ...indexOrderCollections(data) }
  } catch (e) {
    // 提醒链路失败不打断订单列表：列上显示占位，详情抽屉会各自再拉一次
    notifyAdminRequestError(e, '加载收款方式失败')
  } finally {
    collectionsLoading.value = false
  }
}

async function loadDetailCollections(orderId) {
  detailCollections.value = null
  detailCollectionsLoading.value = true
  try {
    const map = indexOrderCollections(await getOrderCollections([orderId]))
    collectionsByOrder.value = { ...collectionsByOrder.value, ...map }
    detailCollections.value = map[String(orderId)] || null
  } catch (e) {
    detailCollections.value = null
  } finally {
    detailCollectionsLoading.value = false
  }
}

/** 储值展示名只认租户配置，缺配置回落 constants/terms 的默认值（页面不写死品牌名）。 */
async function loadWalletConfig() {
  try {
    walletBrand.value = resolveWalletBrandName(await getWalletTokenConfig(contextStore.tenantId))
  } catch (e) {
    /* 读取失败用默认展示名 */
  }
}

function paymentView(row) {
  return collectionsByOrder.value[String(row && row.id)] || null
}

/** 收款方式摘要（按抵扣顺序去重），无收款数据返回空串。 */
function paymentSummaryOf(row) {
  return collectionMethodSummary(paymentView(row), walletBrand.value)
}

/** 该单全部分腿按方式合并（混币种时为空数组，禁止跨币种相加）。 */
function paymentLegsOf(row) {
  return mergedLegsByMethod(paymentView(row))
}

function isCombinedOf(row) {
  return isCombinedPayment(paymentView(row))
}

/** 金额币种：混币种不给单一币种，退回订单快照。 */
function paymentCurrencyOf(row) {
  return viewCurrency(paymentView(row), row && row.currencyCode)
}

/** 无收款方式时列上的文案：加载中不能武断写「未收款」，否则会误导对账。 */
function paymentEmptyTextOf(row) {
  if (collectionsLoading.value) return '加载中…'
  if (paymentView(row)) return '无分腿明细'
  return Number(row && row.paidAmount) > 0 ? '明细待核对' : '未收款'
}

/** 详情抽屉的合计已收：混币种时不给合计（规范 16 §3 禁止跨币种相加）。 */
const collectionsTotalText = computed(() => {
  const view = detailCollections.value
  if (!view) return '—'
  if (view.mixedCurrency) return '多币种'
  return formatMoney(view.totalCollected, view.currencyCode || detailOrder.value?.currencyCode)
})

/** 到收银台处理：带上 orderId，收银台按「定位订单」态展示该单（含结算/收银入口）。 */
function openCashier(order) {
  router.push({ name: 'Orders', query: { orderId: String(order.id) } })
}

/**
 * 取消订单：原因**必填**（后端空白 → 400 CANCEL_REASON_REQUIRED；已收款 → 409 先退款）。
 * 弹窗内先拦空白/超长，提交前再兜一次，校验不过只提示、不发请求。
 */
async function cancel(row) {
  const target = row
  try {
    const { value } = await ElMessageBox.prompt(
      '请填写取消原因（必填，最多 ' + CANCEL_REASON_MAX_LENGTH + ' 个字符）：',
      '取消订单 · ' + (target.orderNo || '#' + target.id),
      {
        inputPlaceholder: '如：客户取消 / 重复下单',
        inputValidator: cancelReasonInputValidator,
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
      },
    )
    const result = await submitCancelWithReason(value, (reason) => cancelOrder(target.id, reason))
    if (!result.ok) {
      ElMessage.warning(result.message)
      return
    }
    ElMessage.success('已取消订单')
    detailVisible.value = false
    await load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      notifyCancelRequestError(e, '取消订单失败')
      await load()
    }
  }
}

/** 后端既可能直接回数组，也可能包一层 items（各服务历史口径不一）。 */
function asList(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.data)) return data.data
  return (data && data.items) || []
}

onMounted(() => {
  load()
  loadWalletConfig()
})

// 当前页变化（翻页/筛选/刷新）就重取该页的收款明细：服务端按订单批量给，不做每行一次请求。
watch(pageRows, (rows) => {
  loadCollectionsFor(rows)
}, { immediate: true })
</script>

<style scoped>
.order-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.order-summary b { color: var(--el-text-color-primary); }
.order-summary__warn { color: var(--el-color-warning); }
.drawer-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.drawer-title h3 { margin: 0; font-size: 16px; }
.drawer-title p { margin: 4px 0 0; color: var(--el-text-color-secondary); font-size: 12px; }
.bill { margin-top: 16px; }
.bill-head__line { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.bill-head__line span { color: var(--el-text-color-secondary); font-size: 12px; }
.bill-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px dashed var(--el-border-color-lighter); font-size: 13px; }
.bill-row em { margin-left: 6px; color: var(--el-text-color-secondary); font-style: normal; }
.bill-total { margin-top: 8px; }
.bill-total .bill-row:last-child b { color: var(--el-color-primary); }
.drawer-actions { display: flex; justify-content: flex-end; gap: 8px; }
.detail-placeholder { padding: 10px 0; color: var(--el-text-color-secondary); font-size: 12px; }
/* 收款方式 / 收款明细（组合支付） */
.pay-method { display: inline-flex; align-items: center; gap: 4px; }
.pay-collection { margin-bottom: 10px; padding: 8px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.pay-collection__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--el-text-color-secondary); font-size: 12px; }
.pay-collection__no { margin: 4px 0 2px; color: var(--el-text-color-secondary); font-size: 11px; word-break: break-all; }
.pay-section-title { margin: 10px 0 2px; color: var(--el-text-color-secondary); font-size: 12px; font-weight: 600; }
</style>
