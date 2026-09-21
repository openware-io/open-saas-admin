<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>报表/对账</h2>
      <el-button @click="load">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <el-select v-model="storeId" placeholder="选择门店" clearable style="width: 200px">
          <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <DateRangeFilter v-model="range" @change="onFilterChange" />
        <GranularitySelect v-model="granularity" @change="onFilterChange" />
        <el-select
          v-if="isSales"
          v-model="statusFilter"
          placeholder="明细状态筛选"
          clearable
          style="width: 160px"
          @change="onFilterChange"
        >
          <el-option v-for="s in ORDER_STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
      </div>

      <el-tabs v-model="type" @tab-change="onTabChange">
        <el-tab-pane label="经营报表" name="operations" />
        <el-tab-pane label="支付报表" name="payments" />
        <el-tab-pane label="销售报表" name="sales" />
        <el-tab-pane label="员工业绩" name="employee-performance" />
        <el-tab-pane label="资源利用率" name="resources" />
        <el-tab-pane label="库存成本与毛利" name="inventory-gross-profit" />
      </el-tabs>

      <el-alert
        v-if="showMixedCurrencyNotice"
        class="report-alert"
        type="warning"
        show-icon
        :closable="false"
        :title="MIXED_CURRENCY_NOTICE"
        description="本次报表包含多种币种，已按币种分行展示；不同币种的金额不得相加，因此不显示合计行。"
      />

      <el-table
        :data="rows"
        v-loading="loading"
        border
        stripe
        :show-summary="showSummary"
        :summary-method="summaryMethod"
      >
        <el-table-column v-for="c in columns" :key="c.prop" :prop="c.prop" :label="c.label"
          :width="c.width" :min-width="c.minWidth" :align="c.align">
          <template #default="{ row }">{{ format(c, row) }}</template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无数据" />
        </template>
      </el-table>

      <!-- 销售报表：统计（上表）+ 商品/服务排行 + 明细（下表，服务端分页）。同一份 from/to/granularity/status。 -->
      <template v-if="isSales">
        <!-- 商品/服务销售排行：回答「哪些商品/服务卖得好、各占多少」；口径与上方统计同源 -->
        <div class="report-section-title">
          商品/服务销售排行（TOP {{ salesItemsTopN }}）
          <el-select v-model="salesItemsType" size="small" class="report-inline-select" @change="loadSalesItems">
            <el-option label="全部品类" value="" />
            <el-option v-for="(label, key) in SALES_ITEM_TYPE_TEXT" :key="key" :label="label" :value="key" />
          </el-select>
          <el-select v-model="salesItemsTopN" size="small" class="report-inline-select" @change="loadSalesItems">
            <el-option v-for="n in SALES_ITEM_TOP_N" :key="n" :label="'TOP ' + n" :value="n" />
          </el-select>
        </div>
        <el-table :data="salesItems.rows" v-loading="salesItemsLoading" border stripe>
          <el-table-column type="index" label="#" width="56" />
          <el-table-column prop="itemName" label="商品/服务" min-width="200" show-overflow-tooltip />
          <el-table-column label="品类" width="90">
            <template #default="{ row }">{{ salesItemTypeText(row.itemType) }}</template>
          </el-table-column>
          <el-table-column label="销量" width="90" align="right">
            <template #default="{ row }">{{ formatQuantity(row.quantity) }}</template>
          </el-table-column>
          <el-table-column label="销售额" width="130" align="right">
            <template #default="{ row }">{{ formatMoney(row.salesAmount, row.currencyCode) }}</template>
          </el-table-column>
          <el-table-column label="折扣" width="110" align="right">
            <template #default="{ row }">{{ formatMoney(row.discountAmount, row.currencyCode) }}</template>
          </el-table-column>
          <el-table-column prop="orderCount" label="订单数" width="90" align="right" />
          <el-table-column prop="storeCount" label="售卖门店" width="96" align="right" />
          <el-table-column label="占比" width="96" align="right">
            <template #default="{ row }">{{ formatPercent(row.share) }}</template>
          </el-table-column>
          <template #empty>
            <el-empty description="该区间没有商品/服务销售" />
          </template>
        </el-table>

        <div class="report-section-title">销售明细（{{ detailsHint }}）</div>
        <el-table :data="details.records" v-loading="loading" border stripe>
          <el-table-column v-for="c in detailColumns" :key="c.prop" :prop="c.prop" :label="c.label"
            :width="c.width" :min-width="c.minWidth" :align="c.align">
            <template #default="{ row }">{{ format(c, row) }}</template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无明细" />
          </template>
        </el-table>
        <el-pagination
          class="report-pagination"
          background
          :total="details.total"
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="PAGE_SIZES"
          layout="total, sizes, prev, pager, next"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </template>

      <div v-if="meta" class="report-hint">{{ meta }}</div>

      <!-- 口径必须显式写给使用方，避免把近似值当成精确值 -->
      <div v-if="isGrossProfit" class="report-hint">
        <div>成本口径：{{ costBasisLabel }}——成本按查询时点的移动加权平均成本计算，不是售出当时的成本，不做追溯重算。</div>
        <div>未计成本数量：平均成本为 0（历史未建账或未维护采购价）的售出数量，不计入成本；该值不为 0 时成本覆盖不完整。</div>
      </div>
      <div v-if="businessZoneHint" class="report-hint">{{ businessZoneHint }}</div>
      <!-- 资源利用率的口径必须显式写给使用方：行粒度、完成判定、利用率分母都不能靠猜 -->
      <div v-if="isResources" class="report-hint">
        <div>一行 = 一次开台（一次消费）：同一包厢同一天开台多次就是多行，各行只算自己那次的时长（开台 → 结台，扣暂停；未结台记 0）。</div>
        <div>「是否完成」按该次开台是否已结台判定（结台 = 已完成）；同一包厢同一营业日各行相加即当日翻台次数。</div>
        <div>「当日利用率」= 该包厢该营业日会话时长合计 ÷ 24 小时（营业日按 24 小时可用计，暂不支持按门店营业时段配置），同一包厢同一营业日各行显示同一个值。</div>
      </div>
      <div v-if="isSales" class="report-hint">
        <div>统计口径固定为有效销售单据（排除已取消、已作废；作废金额单列）；下方明细可用「明细状态筛选」单独复核某个状态的单据，不影响统计。</div>
        <div>统计与明细共用同一份门店 / 时间区间 / 统计粒度，未加状态筛选时明细总数等于统计口径下的单据数。</div>
        <div>支付构成按支付方式归类（现金 / 线上 / 储值币 / 积分 / 其它），五列之和等于收款金额；「其它」不为 0 说明出现了未归类渠道。</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import GranularitySelect from '@/components/GranularitySelect.vue'
import { getOperations, getPayments, getSales, getSalesItems, getEmployeePerformance, getResourceUtilization, getInventoryGrossProfit } from '@/api/report'
import { getWalletTokenConfig } from '@/api/admin'
import { listStores } from '@/api/store'
import { useContextStore } from '@/stores/context'
import { currencyText, formatMoney, formatPercent, formatQuantity, formatTime } from '@/utils/format'
import {
  GRANULARITY_DEFAULT,
  ORDER_STATUS_OPTIONS,
  PAY_CHANNEL_PROPS,
  PAY_CHANNEL_TEXT,
  SALES_ITEM_TYPE_TEXT,
  WALLET_BRAND_NAME_DEFAULT,
  businessDayHint,
  costBasisText,
  employeeTypeText,
  moneyColumnLabel,
  orderStatusText,
  resolveWalletBrandName,
  salesColumnLabel,
  salesItemTypeText,
} from '@/constants/terms'
import { emptyDateRange, dateRangeParams, dateRangeWarning } from '@/utils/dateRange'
import { MIXED_CURRENCY_NOTICE, sumMinorAmounts } from '@/utils/currency-summary'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

/** 库存成本与毛利 tab 的标识（与服务端 /admin/reports/inventory-gross-profit 一一对应）。 */
const INVENTORY_GROSS_PROFIT = 'inventory-gross-profit'
/** 销售报表 tab 的标识（与服务端 /admin/reports/sales 一一对应）。 */
const SALES = 'sales'

/** 只有「有合计意义」的报表显示合计行：混币种时后端不给合计，前端也**不得**自行相加。 */
const TOTAL_PROPS = {
  [INVENTORY_GROSS_PROFIT]: ['revenueAmount', 'costAmount', 'grossProfitAmount', 'soldQuantity', 'uncostedQuantity'],
  [SALES]: ['salesAmount', 'discountAmount', 'refundAmount', 'voidedAmount', 'collectedAmount']
    .concat(PAY_CHANNEL_PROPS),
}

/** 销售报表明细的页大小候选（与后端 MAX_PAGE_SIZE=100 对齐，超出会被服务端收敛）。 */
const PAGE_SIZES = [20, 50, 100]

/** 商品/服务销售排行的 TOP 候选（后端上限 200，超出会被收敛）。 */
const SALES_ITEM_TOP_N = [10, 20, 50, 100]

const type = ref('operations')
const rows = ref([])
const loading = ref(false)
const storeId = ref(null)
const range = ref(emptyDateRange())
const granularity = ref(GRANULARITY_DEFAULT)
/** 明细分页请求参数（仅销售报表用）；响应的 Page 信封回显为 `details.current/size`。 */
const page = ref(1)
const pageSize = ref(PAGE_SIZES[0])
/** 明细结果（仅销售报表用；服务端 Page 信封 records/total/current/size）。 */
const details = ref({ records: [], total: 0, current: 1, size: PAGE_SIZES[0] })
/** 明细状态过滤（仅销售报表用）：空 = 与统计同口径（排除取消/作废）。 */
const statusFilter = ref(null)
const stores = ref([])
const meta = ref('')
/** 聚合报表的币种信封：单币种给 currencyCode；混币种 currencyCode=null 且 mixedCurrency=true。 */
const envelope = ref({ currencyCode: null, mixedCurrency: false })
/** 成本口径（仅库存成本与毛利报表返回），如 PERIOD_END_MOVING_AVERAGE。 */
const costBasis = ref('')
/** 营业日时区（销售报表返回，如 Asia/Shanghai）——用于把「营业日」口径写给使用方。 */
const businessZone = ref('')

/**
 * 储值展示名：只从租户配置读，缺配置回落 `constants/terms` 的唯一默认值
 * （品牌名的字面量只允许出现在 constants/terms，页面不得硬编码，审计 §4.7）。
 */
const walletBrand = ref(WALLET_BRAND_NAME_DEFAULT)

/** 运营上下文（取当前租户，用于读租户级储值展示名）。 */
const contextStore = useContextStore()

const isGrossProfit = computed(() => type.value === INVENTORY_GROSS_PROFIT)
const isSales = computed(() => type.value === SALES)
/** 资源利用率 tab：一次开台一行，口径提示只在它展示（见下方 report-hint）。 */
const isResources = computed(() => type.value === 'resources')
const mixedCurrency = computed(() => envelope.value.mixedCurrency === true)
/** 混币种提示：毛利与销售报表都要提示（两者都是跨行金额的聚合视图）。 */
const showMixedCurrencyNotice = computed(() => mixedCurrency.value && (isGrossProfit.value || isSales.value))
const showSummary = computed(() => {
  const props = TOTAL_PROPS[type.value]
  return !!props && !mixedCurrency.value && rows.value.length > 0
})
const costBasisLabel = computed(() => costBasisText(costBasis.value))
const businessZoneHint = computed(() => (businessZone.value ? businessDayHint(businessZone.value) : ''))
const detailsHint = computed(() =>
  `共 ${details.value.total} 单，第 ${page.value} 页 / 每页 ${pageSize.value} 条`)

/** 列头不再写死金额单位；币种由 `currencyCode` 列逐行标注（kind: 'currency'）。 */
const CURRENCY_COLUMN = { prop: 'currencyCode', label: '币种', width: 90, align: 'center', kind: 'currency' }
/** 时间桶列：标签由服务端按粒度生成（2026-09-19 / 2026年第38周 / 2026-09 / 2026年）。 */
const BUCKET_COLUMN = { prop: 'bucket', label: '统计区间', width: 140, kind: 'bucket' }

const COLUMNS = {
  operations: [
    BUCKET_COLUMN,
    { prop: 'storeName', label: '门店', minWidth: 150 },
    { prop: 'orderCount', label: '订单数', width: 90, align: 'right' },
    { prop: 'receivableAmount', label: moneyColumnLabel('receivableAmount'), width: 110, align: 'right', kind: 'money' },
    { prop: 'paidAmount', label: moneyColumnLabel('paidAmount'), width: 110, align: 'right', kind: 'money' },
    { prop: 'refundAmount', label: moneyColumnLabel('refundAmount'), width: 110, align: 'right', kind: 'money' },
    { prop: 'discountAmount', label: moneyColumnLabel('discountAmount'), width: 110, align: 'right', kind: 'money' },
    { prop: 'averageTicketAmount', label: moneyColumnLabel('averageTicketAmount'), width: 120, align: 'right', kind: 'money' },
    CURRENCY_COLUMN,
  ],
  payments: [
    BUCKET_COLUMN,
    { prop: 'storeName', label: '门店', minWidth: 150 },
    { prop: 'collectionCount', label: '收款笔数', width: 100, align: 'right' },
    { prop: 'collectedAmount', label: moneyColumnLabel('collectedAmount'), width: 120, align: 'right', kind: 'money' },
    { prop: 'refundCount', label: '退款笔数', width: 100, align: 'right' },
    { prop: 'refundAmount', label: moneyColumnLabel('refundAmount'), width: 120, align: 'right', kind: 'money' },
    CURRENCY_COLUMN,
  ],
  [SALES]: [
    BUCKET_COLUMN,
    { prop: 'storeName', label: '门店', minWidth: 140 },
    { prop: 'orderCount', label: salesColumnLabel('orderCount'), width: 90, align: 'right' },
    { prop: 'salesAmount', label: salesColumnLabel('salesAmount'), width: 120, align: 'right', kind: 'money' },
    { prop: 'averageTicketAmount', label: salesColumnLabel('averageTicketAmount'), width: 110, align: 'right', kind: 'money' },
    { prop: 'discountAmount', label: salesColumnLabel('discountAmount'), width: 110, align: 'right', kind: 'money' },
    { prop: 'refundCount', label: salesColumnLabel('refundCount'), width: 100, align: 'right' },
    { prop: 'refundAmount', label: salesColumnLabel('refundAmount'), width: 110, align: 'right', kind: 'money' },
    { prop: 'voidedCount', label: salesColumnLabel('voidedCount'), width: 100, align: 'right' },
    { prop: 'voidedAmount', label: salesColumnLabel('voidedAmount'), width: 110, align: 'right', kind: 'money' },
    { prop: 'paymentCount', label: salesColumnLabel('paymentCount'), width: 100, align: 'right' },
    { prop: 'collectedAmount', label: salesColumnLabel('collectedAmount'), width: 120, align: 'right', kind: 'money' },
    // 支付方式构成：五列之和 = 收款金额（「其它」用于暴露未归类渠道，不平白消失）
    { prop: 'cashAmount', label: payChannelLabel('cashAmount'), width: 110, align: 'right', kind: 'money' },
    { prop: 'onlineAmount', label: payChannelLabel('onlineAmount'), width: 100, align: 'right', kind: 'money' },
    { prop: 'walletAmount', label: payChannelLabel('walletAmount'), width: 120, align: 'right', kind: 'money' },
    { prop: 'pointsAmount', label: payChannelLabel('pointsAmount'), width: 100, align: 'right', kind: 'money' },
    { prop: 'otherAmount', label: payChannelLabel('otherAmount'), width: 100, align: 'right', kind: 'money' },
    CURRENCY_COLUMN,
  ],
  'employee-performance': [
    BUCKET_COLUMN,
    { prop: 'employeeType', label: '类型', width: 90, align: 'center', kind: 'empType' },
    { prop: 'employeeId', label: '员工ID', width: 90, align: 'right' },
    { prop: 'employeeName', label: '姓名', minWidth: 110 },
    { prop: 'storeId', label: '门店ID', width: 90, align: 'right' },
    { prop: 'openOrderCount', label: '开单数', width: 90, align: 'right' },
    { prop: 'serviceSeconds', label: '服务时长', width: 110, align: 'right', kind: 'seconds' },
    { prop: 'collectedAmount', label: moneyColumnLabel('collectedAmount'), width: 120, align: 'right', kind: 'money' },
    { prop: 'addOnCount', label: '加项数', width: 90, align: 'right' },
    CURRENCY_COLUMN,
  ],
  resources: [
    BUCKET_COLUMN,
    { prop: 'storeName', label: '门店', minWidth: 140 },
    { prop: 'resourceName', label: '包厢', minWidth: 120 },
    // 一次开台一行：开台/结台时间与**本次**时长（后端 durationSeconds，未结台记 0）
    { prop: 'openedAt', label: '开台时间', width: 150, kind: 'time' },
    { prop: 'closedAt', label: '结台时间', width: 150, kind: 'time' },
    { prop: 'durationSeconds', label: '本次时长', width: 110, align: 'right', kind: 'seconds' },
    // turnoverCount 现在表示「该次开台是否已完成」（CLOSED=1），同行同包厢同营业日相加 = 当日翻台次数
    { prop: 'turnoverCount', label: '是否完成', width: 90, align: 'center', kind: 'completed' },
    // turnoverRate 是该包厢**该营业日**利用率（后端比例值，前端乘 100），与逐行时长同源
    { prop: 'turnoverRate', label: '当日利用率', width: 110, align: 'right', kind: 'percent' },
  ],
  [INVENTORY_GROSS_PROFIT]: [
    { prop: 'storeName', label: '门店', minWidth: 150 },
    BUCKET_COLUMN,
    CURRENCY_COLUMN,
    { prop: 'revenueAmount', label: moneyColumnLabel('revenueAmount'), width: 120, align: 'right', kind: 'money' },
    { prop: 'costAmount', label: moneyColumnLabel('costAmount'), width: 120, align: 'right', kind: 'money' },
    { prop: 'grossProfitAmount', label: moneyColumnLabel('grossProfitAmount'), width: 120, align: 'right', kind: 'money' },
    // 后端 grossMarginRate 是**比例**（0.92 = 92%），收入为 0 时为 null → 显示「—」
    { prop: 'grossMarginRate', label: '毛利率', width: 100, align: 'right', kind: 'percent' },
    { prop: 'soldQuantity', label: '售出数量', width: 110, align: 'right', kind: 'quantity' },
    { prop: 'uncostedQuantity', label: '未计成本数量', width: 130, align: 'right', kind: 'quantity' },
  ],
}

/** 销售明细列：单据维度（订单号 / 时间 / 营业日 / 门店 / 包厢 / 金额 / 状态 / 支付构成）。 */
const DETAIL_COLUMNS = [
  { prop: 'orderNo', label: '订单号', minWidth: 170 },
  { prop: 'createdAt', label: '单据时间', width: 150, kind: 'time' },
  { prop: 'businessDate', label: '营业日', width: 110 },
  { prop: 'storeName', label: '门店', minWidth: 140 },
  { prop: 'roomName', label: '包厢', minWidth: 100 },
  { prop: 'status', label: '状态', width: 100, align: 'center', kind: 'orderStatus' },
  { prop: 'subtotalAmount', label: salesColumnLabel('subtotalAmount'), width: 110, align: 'right', kind: 'money' },
  { prop: 'discountAmount', label: salesColumnLabel('discountAmount'), width: 100, align: 'right', kind: 'money' },
  { prop: 'totalAmount', label: salesColumnLabel('totalAmount'), width: 110, align: 'right', kind: 'money' },
  { prop: 'paidAmount', label: salesColumnLabel('paidAmount'), width: 110, align: 'right', kind: 'money' },
  { prop: 'refundableAmount', label: salesColumnLabel('refundableAmount'), width: 100, align: 'right', kind: 'money' },
  { prop: 'payment.cashAmount', label: payChannelLabel('cashAmount'), width: 100, align: 'right', kind: 'money' },
  { prop: 'payment.onlineAmount', label: payChannelLabel('onlineAmount'), width: 100, align: 'right', kind: 'money' },
  { prop: 'payment.walletAmount', label: payChannelLabel('walletAmount'), width: 120, align: 'right', kind: 'money' },
  { prop: 'payment.pointsAmount', label: payChannelLabel('pointsAmount'), width: 100, align: 'right', kind: 'money' },
  { prop: 'payment.otherAmount', label: payChannelLabel('otherAmount'), width: 100, align: 'right', kind: 'money' },
  CURRENCY_COLUMN,
]

/**
 * 支付构成列名：储值列用**租户配置的展示名**（缺配置回落唯一默认值），其余取词表。
 * 品牌名字面量只允许出现在 constants/terms，页面不得自行拼接（审计 §4.7）。
 */
function payChannelLabel(prop) {
  return prop === 'walletAmount' ? `${walletBrand.value}（${PAY_CHANNEL_TEXT.walletAmount}）` : PAY_CHANNEL_TEXT[prop]
}

/** 储值列名依赖租户配置：在 computed 里重新求值，配置到达后表头自动更新。 */
function withWalletBrandLabel(column) {
  return column.prop.endsWith('walletAmount')
    ? { ...column, label: `${walletBrand.value}（${PAY_CHANNEL_TEXT.walletAmount}）` }
    : column
}

const columns = computed(() => (COLUMNS[type.value] || []).map(withWalletBrandLabel))
const detailColumns = computed(() => DETAIL_COLUMNS.map(withWalletBrandLabel))

/** 商品/服务销售排行（销售报表内的子区块）：与统计/明细共用同一份门店与时间区间。 */
const salesItems = ref({ rows: [], totals: [], currencyCode: null, mixedCurrency: false })
const salesItemsType = ref('')
const salesItemsTopN = ref(SALES_ITEM_TOP_N[1])
const salesItemsLoading = ref(false)

/**
 * 取商品/服务销售排行：跟着销售报表的区间与门店走；品类、TOP N 变化时单独重取。
 *
 * 后端口径与销售报表同源（排除已取消/已作废、只算已生效明细），所以两者可以直接对照着看。
 */
async function loadSalesItems() {
  if (dateRangeWarning(range.value)) return
  salesItemsLoading.value = true
  try {
    const data = await getSalesItems({
      storeId: storeId.value || undefined,
      ...dateRangeParams(range.value),
      itemType: salesItemsType.value || undefined,
      topN: salesItemsTopN.value,
    })
    salesItems.value = {
      rows: data?.rows || [],
      totals: data?.totals || [],
      currencyCode: data?.currencyCode ?? null,
      mixedCurrency: data?.mixedCurrency === true,
    }
  } catch (e) {
    salesItems.value = { rows: [], totals: [], currencyCode: null, mixedCurrency: false }
    notifyAdminRequestError(e, '加载商品/服务销售排行失败')
  } finally {
    salesItemsLoading.value = false
  }
}

const LOADERS = {
  operations: getOperations,
  payments: getPayments,
  [SALES]: getSales,
  'employee-performance': getEmployeePerformance,
  resources: getResourceUtilization,
  [INVENTORY_GROSS_PROFIT]: getInventoryGrossProfit,
}

/** 查询参数：门店 + 时间区间（共享工具序列化）+ 粒度；销售报表再带明细分页与状态。 */
function params() {
  const query = {
    storeId: storeId.value || undefined,
    ...dateRangeParams(range.value),
    granularity: granularity.value || GRANULARITY_DEFAULT,
  }
  if (isSales.value) {
    query.page = page.value
    query.pageSize = pageSize.value
    if (statusFilter.value) query.status = statusFilter.value
  }
  return query
}

/** 取嵌套字段（明细的支付构成是 `payment.cashAmount` 这种两级路径）。 */
function valueOf(row, prop) {
  if (!prop.includes('.')) return row[prop]
  return prop.split('.').reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), row)
}

function format(c, row) {
  const v = valueOf(row, c.prop)
  // 报表是跨单据的汇总视图：每行显式标注币种（后端按币种分组时以记录为准，缺省回落当前币种），
  // 避免不同币种的行被当成同一口径静默混算（§3.5）。
  if (c.kind === 'currency') return currencyText(v)
  if (c.kind === 'bucket') return v?.label || '—'
  if (c.kind === 'orderStatus') return orderStatusText(v)
  if (v === null || v === undefined || v === '') return '—'
  // turnoverCount：1 = 该次开台已结台（已完成），0 = 进行中；两者都不是「空值」，不能被 '—' 吞掉
  if (c.kind === 'completed') return Number(v) === 1 ? '已完成' : '进行中'
  if (c.kind === 'time') return formatTime(v)
  if (c.kind === 'money') return formatMoney(v, row.currencyCode)
  if (c.kind === 'percent') return formatPercent(v)
  if (c.kind === 'quantity') return formatQuantity(v)
  if (c.kind === 'seconds') return secondsText(Number(v))
  if (c.kind === 'empType') return employeeTypeText(v)
  return v
}

/**
 * 合计行：混币种时整表不显示合计（showSummary=false），这里再加一道 —— 逐列只合计白名单字段，
 * 金额一律走 formatMoney 并按信封币种渲染符号（不用 el-table 默认的裸数字合计）。
 */
function summaryMethod({ columns: tableColumns }) {
  const allowed = TOTAL_PROPS[type.value] || []
  return tableColumns.map((column, index) => {
    if (index === 0) return '合计'
    const prop = column.property
    if (!allowed.includes(prop)) return ''
    const total = sumMinorAmounts(rows.value, prop, envelope.value)
    if (total === null) return '—'
    if (prop === 'soldQuantity' || prop === 'uncostedQuantity') return formatQuantity(total)
    return formatMoney(total, envelope.value.currencyCode)
  })
}

function secondsText(s) {
  if (!s) return '0 分钟'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return h + ' 小时 ' + m + ' 分'
  return m + ' 分钟'
}

/** 筛选条件变更：不发请求，等「查询」；但要把明细分页复位到第 1 页，避免停在不存在的页码上。 */
function onFilterChange() {
  page.value = 1
}

function onPageChange(nextPage) {
  page.value = nextPage
  load()
}

function onPageSizeChange(size) {
  pageSize.value = size
  page.value = 1
  load()
}

function onTabChange(name) {
  type.value = name
  page.value = 1
  load()
}

async function load() {
  // from > to 时**不发起请求**（与其它列表页同一守卫）：后端也会兜 400，但没必要多打一次。
  const warning = dateRangeWarning(range.value)
  if (warning) {
    ElMessage.warning(warning)
    return
  }
  loading.value = true
  try {
    const data = await LOADERS[type.value](params())
    if (isSales.value) {
      rows.value = data?.buckets || []
      details.value = {
        records: data?.details?.records || [],
        total: data?.details?.total || 0,
        current: data?.details?.current || page.value,
        size: data?.details?.size || pageSize.value,
      }
      businessZone.value = data?.businessZone || ''
      await loadSalesItems()
    } else {
      rows.value = data?.rows || []
      details.value = { records: [], total: 0, current: 1, size: pageSize.value }
      businessZone.value = ''
      salesItems.value = { rows: [], totals: [], currencyCode: null, mixedCurrency: false }
    }
    envelope.value = {
      currencyCode: data?.currencyCode ?? null,
      mixedCurrency: data?.mixedCurrency === true,
    }
    costBasis.value = data?.costBasis || ''
    meta.value = data?.dataAsOf ? '数据时点：' + formatTime(data.dataAsOf) : ''
  } catch (e) {
    rows.value = []
    details.value = { records: [], total: 0, current: 1, size: pageSize.value }
    envelope.value = { currencyCode: null, mixedCurrency: false }
    costBasis.value = ''
    businessZone.value = ''
    notifyAdminRequestError(e, '加载报表失败')
  } finally {
    loading.value = false
  }
}

async function loadStores() {
  try { stores.value = (await listStores()) || [] } catch (e) { /* 门店加载失败不阻塞报表 */ }
}

/** 储值展示名只从租户配置读；读取失败沿用 constants/terms 的默认名，不让报表白屏。 */
async function loadWalletBrand() {
  try {
    walletBrand.value = resolveWalletBrandName(await getWalletTokenConfig(contextStore.tenantId))
  } catch (e) { /* 沿用默认展示名 */ }
}

onMounted(() => { loadStores(); loadWalletBrand(); load() })
</script>

<style scoped>
.report-hint { margin-top: 12px; font-size: 12px; color: var(--el-text-color-secondary); }
.report-alert { margin-bottom: 12px; }
.report-section-title { margin: 16px 0 8px; font-weight: 600; }
/* 报表内的行内筛选（品类 / TOP N）：跟在区块标题右侧，窄屏也能换行 */
.report-inline-select { width: 130px; margin-left: 8px; vertical-align: middle; }
.report-pagination { margin-top: 12px; justify-content: flex-end; }
</style>
