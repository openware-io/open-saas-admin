<template>
  <div class="payments-board-page">
    <OperationsBoard
      v-model:search="keyword"
      v-model:active-tab="methodFilter"
      v-model:active-filter="statusFilter"
      v-model:view-mode="viewMode"
      title="收银/支付"
      :subtitle="`支付流水与收款管理 · ${lastUpdatedText}`"
      :loading="loading"
      search-placeholder="搜索流水号 / 订单号 / 支付方式"
      :stats="paymentStats"
      :active-stat="statusFilter"
      :tabs="methodTabs"
      :filters="PAYMENT_FILTERS"
    >
      <template #actions>
        <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
        <el-button @click="refundVisible = true">退款处理</el-button>
        <el-button type="primary" @click="openCollect"><el-icon><Plus /></el-icon>发起收款</el-button>
      </template>

      <template #toolbar-left-extra>
        <!-- 支付时间（createdAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59；
             本看板没有「查询」按钮，选完即按区间重新拉取。 -->
        <DateRangeFilter v-model="range" @change="load" @clear="load" />
      </template>

      <div v-if="filteredRows.length" class="payment-grid" :class="{ 'list-mode': viewMode === 'list' }">
        <article
          v-for="payment in filteredRows"
          :key="payment.id || payment.idempotencyKey"
          class="payment-card"
          :class="paymentStatusClass(payment.status)"
          @click="openPaymentDetail(payment)"
        >
          <div class="payment-card-head">
            <span class="method-icon"><el-icon><CreditCard /></el-icon></span>
            <div class="method-title">
              <strong>{{ methodLabel(payment.paymentMethod || payment.provider, walletBrand) }}</strong>
              <span>{{ formatTime(payment.createdAt) }}</span>
            </div>
            <span class="payment-status">{{ payStatusText(payment.status) }}</span>
          </div>

          <div class="payment-amount">
            <span>{{ paymentValueLabel(payment) }}</span>
            <strong>{{ paymentValueText(payment, walletRatio, payment.currencyCode) }}</strong>
          </div>

          <div class="payment-meta">
            <div><span>支付流水</span><b :title="payment.idempotencyKey">{{ payment.idempotencyKey || '—' }}</b></div>
            <div><span>关联订单</span><b>{{ payment.orderId ? '#' + payment.orderId : '—' }}</b></div>
            <!-- 币种展示走快照优先的统一入口；储值币 / 积分是数量口径，没有币种可言 -->
            <div><span>币种</span><b>{{ recordCurrencyText(payment) }}</b></div>
          </div>

          <div class="payment-actions">
            <span>{{ payment.provider || payment.paymentMethod || '系统收款' }}</span>
            <el-button size="small" @click.stop="openPaymentDetail(payment)">查看详情</el-button>
          </div>
        </article>
      </div>
      <el-empty v-else :description="paymentEmptyText" :image-size="96" />
    </OperationsBoard>

    <el-drawer v-model="detailVisible" size="420px" class="payment-detail-drawer">
      <template #header>
        <div v-if="detailPayment" class="drawer-title">
          <div>
            <h3>支付流水详情</h3>
            <p>{{ detailPayment.idempotencyKey || '暂无流水号' }}</p>
          </div>
          <span class="payment-status" :class="paymentStatusClass(detailPayment.status)">{{ payStatusText(detailPayment.status) }}</span>
        </div>
      </template>
      <div v-if="detailPayment" class="payment-detail">
        <div class="detail-amount" :class="paymentStatusClass(detailPayment.status)">
          <span>{{ paymentValueLabel(detailPayment, '本次支付金额', '本次支付数量') }}</span>
          <strong>{{ paymentValueText(detailPayment, walletRatio, detailPayment.currencyCode) }}</strong>
        </div>
        <div class="detail-grid">
          <div><span>关联订单</span><b>{{ detailPayment.orderId ? '#' + detailPayment.orderId : '—' }}</b></div>
          <div><span>支付方式</span><b>{{ methodLabel(detailPayment.paymentMethod || detailPayment.provider, walletBrand) }}</b></div>
          <div><span>支付状态</span><b>{{ payStatusText(detailPayment.status) }}</b></div>
          <div><span>币种</span><b>{{ recordCurrencyText(detailPayment) }}</b></div>
          <div><span>支付时间</span><b>{{ formatTime(detailPayment.createdAt) }}</b></div>
          <div class="detail-wide"><span>支付流水号</span><b>{{ detailPayment.idempotencyKey || '—' }}</b></div>
          <div class="detail-wide"><span>支付渠道</span><b>{{ detailPayment.provider || detailPayment.paymentMethod || '—' }}</b></div>
        </div>
      </div>
    </el-drawer>

    <el-dialog v-model="refundVisible" title="退款处理" width="860px" @open="loadRefunds">
      <el-table :data="refunds" v-loading="refundLoading" border>
        <el-table-column prop="orderId" label="订单" width="90" />
        <el-table-column label="申请金额" width="120">
          <template #default="{ row }">{{ formatMoney(row.requestedAmount, row.currencyCode) }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="150" />
        <el-table-column label="状态" width="100"><template #default="{ row }">{{ refundStatusText(row.status) }}</template></el-table-column>
        <el-table-column label="操作" width="260">
          <template #default="{ row }">
            <template v-if="row.status === 'PENDING'">
              <el-button size="small" type="success" @click="approveRefundRow(row)">批准</el-button>
              <el-button size="small" type="danger" @click="rejectRefundRow(row)">驳回</el-button>
            </template>
            <el-button v-else-if="row.status === 'APPROVED'" size="small" type="primary" @click="completeRefundRow(row)">登记退款</el-button>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-divider content-position="left">发起退款申请</el-divider>
      <el-form label-width="90px">
        <el-form-item label="订单 ID"><el-input v-model="refundForm.orderId" /></el-form-item>
        <el-form-item label="退款金额"><el-input-number v-model="refundForm.amountYuan" :min="0.01" :precision="2" :step="1" style="width:100%" /></el-form-item>
        <el-form-item label="原因"><el-input v-model="refundForm.reason" maxlength="255" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundVisible = false">关闭</el-button>
        <el-button type="primary" :loading="refundSaving" @click="submitRefund">提交退款申请</el-button>
      </template>
    </el-dialog>

    <!-- 组合收款：抵扣顺序「积分 → 储值 → 现金补差额」，每笔 ≤ 剩余应收，合计必须等于应收 -->
    <el-dialog v-model="collectVisible" title="发起收款（组合支付）" width="560px">
      <el-form label-width="110px">
        <el-form-item label="订单号">
          <el-input v-model="collectForm.orderId" placeholder="关联订单号" @change="loadOrderBill" />
        </el-form-item>
        <el-form-item :label="moneyColumnLabel('payableAmount')">
          <span class="sum">{{ formatMoney(payableMinor, billCurrencyCode) }}</span>
          <span class="muted">账单合计 − 已收（服务端口径）</span>
        </el-form-item>
        <el-form-item v-if="memberSelectable" label="客户">
          <div class="member-picker">
            <el-input v-model="memberKeyword" placeholder="手机号 / 客户号" style="width: 170px" @keyup.enter="searchMembers" />
            <el-button :loading="searchingMembers" @click="searchMembers">查询</el-button>
            <el-select v-if="memberResults.length" v-model="selectedMemberId" placeholder="选择客户" style="width: 190px" @change="onMemberChange">
              <el-option v-for="m in memberResults" :key="m.id" :label="m.name || m.phone || m.memberNo" :value="m.id" />
            </el-select>
            <span v-if="selectedMember" class="muted">{{ formatTokens(memberWalletTokens) }} · {{ formatPoints(memberPoints) }}</span>
          </div>
        </el-form-item>
        <el-divider content-position="left">支付拆分（抵扣顺序：积分 → {{ walletBrand }} → 现金）</el-divider>
        <el-form-item v-for="m in orderedMethods" :key="m.method" :label="methodLabel(m.method, walletBrand)">
          <el-input-number
            v-model="payByLeg[m.method]"
            :min="0"
            :precision="legInputPrecision(m.method)"
            :step="legInputStep(m.method)"
            style="width: 100%"
            @change="() => clampLeg(m.method)"
          />
          <span v-if="isQuantityLeg(m.method)" class="muted">按数量填写（{{ methodLabel(m.method, walletBrand) }}个数，不带币种）</span>
        </el-form-item>
        <el-form-item label="已填合计">
          <span :class="balanced ? 'sum' : 'mismatch'">{{ formatMoney(filledMinor, billCurrencyCode) }}</span>
          <span v-if="!balanced" class="mismatch">（须等于应收 {{ formatMoney(payableMinor, billCurrencyCode) }}）</span>
          <el-button link type="primary" @click="autoFill">自动抵扣</el-button>
          <el-button link @click="clearLegs">清零</el-button>
          <span class="muted">合计是金额口径：储值币 / 积分数量按租户比例折算为金额后再校验</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="collectVisible = false">取消</el-button>
        <el-button type="primary" :loading="collecting" :disabled="!orderedMethods.length" @click="doCollect">确认收款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, CircleClose, Clock, CreditCard, Grid, Money, Plus, Refresh } from '@element-plus/icons-vue'
import OperationsBoard from '@/components/OperationsBoard.vue'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { listPayments, collect, listPaymentMethods, getOrderBill, listRefunds, requestRefund, approveRefund, rejectRefund, markRefunded } from '@/api/payment'
import { listMembers, getMemberWallet, getMemberPoints } from '@/api/member'
import { getWalletTokenConfig } from '@/api/admin'
import { formatMoney, formatPoints, formatTime, formatTimeWithSeconds, formatTokens, formatYuan, resolveTokenCount, resolveTokenRatio, yuanToFen } from '@/utils/format'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { collectedLegText, isQuantityLeg, legInputPrecision, legInputStep, legInputToMinor, legMinorToInput, methodLabel, orderAllowedMethods, paymentValueLabel, paymentValueText, recordCurrencyText } from '@/constants/payment-methods'
import { WALLET_BRAND_NAME_DEFAULT, moneyColumnLabel, payStatusText, refundStatusText, resolveWalletBrandName } from '@/constants/terms'
import { useContextStore } from '@/stores/context'
import { useCurrencyStore } from '@/stores/currency'

const contextStore = useContextStore()
// 全局币种（唯一来源）：写请求体的 currencyCode 取它。
const currencyStore = useCurrencyStore()
const rows = ref([])
const loading = ref(false)
const keyword = ref('')
/** 时间区间（支付时间 createdAt）：本看板查询条件不是 reactive 对象，区间单独一个 ref。 */
const range = ref(emptyDateRange())
const statusFilter = ref('all')
const methodFilter = ref('all')
const viewMode = ref('grid')
const lastUpdatedAt = ref(null)
const detailVisible = ref(false)
const detailPayment = ref(null)
const refundVisible = ref(false)
const refundLoading = ref(false)
const refundSaving = ref(false)
const refunds = ref([])
const refundForm = ref({ orderId: '', amountYuan: 0.01, reason: '' })
const operatorId = computed(() => contextStore.current?.accountId ?? null)

const PAYMENT_FILTERS = [
  { value: 'all', label: '全部', dot: false },
  { value: 'SUCCEEDED', label: '成功', tone: 'succeeded' },
  { value: 'PENDING', label: '处理中', tone: 'pending' },
  { value: 'FAILED', label: '失败', tone: 'failed' },
]

const collectVisible = ref(false)
const collecting = ref(false)
const availableMethods = ref([])
const methodsLoading = ref(false)
const collectForm = ref({ orderId: '' })
/** 分腿输入：现金/线上是金额（主单位），储值币/积分是数量（个数）。 */
const payByLeg = ref({})
const billedMinor = ref(0)
const paidMinor = ref(0)
/** 服务端账单给出的应收（最小货币单位）；为空时退回「合计 − 已收」。 */
const serverPayableMinor = ref(null)
/** 储值展示名 / 兑换比例只认租户配置，缺配置回落 constants/terms 的默认值。 */
const walletBrand = ref(WALLET_BRAND_NAME_DEFAULT)
const walletRatio = ref(resolveTokenRatio(null))
/** 账单币种快照（§3.5）：单据自带 currencyCode 时优先于全局币种，避免与全局混算。 */
const billCurrencyCode = ref('')
const memberKeyword = ref('')
const searchingMembers = ref(false)
const memberResults = ref([])
const selectedMemberId = ref(null)
/** 会员储值余额（最小货币单位，参与合计校验）与其代币数量（只用于展示）。 */
const memberWalletMinor = ref(0)
const memberWalletTokens = ref(0)
const memberPoints = ref(0)

const filteredRows = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  return rows.value.filter((payment) => {
    if (statusFilter.value !== 'all' && payment.status !== statusFilter.value) return false
    const method = payment.paymentMethod || payment.provider || ''
    if (methodFilter.value !== 'all' && method !== methodFilter.value) return false
    if (!search) return true
    return [
      payment.idempotencyKey,
      payment.orderId,
      method,
      methodLabel(method, walletBrand.value),
      payment.status,
      payStatusText(payment.status),
    ].filter((value) => value != null).some((value) => String(value).toLowerCase().includes(search))
  })
})

const methodTabs = computed(() => {
  const methods = [...new Set(rows.value.map((payment) => payment.paymentMethod || payment.provider).filter(Boolean))]
  return [
    { value: 'all', label: '全部方式' },
    ...methods.map((method) => ({ value: method, label: methodLabel(method, walletBrand.value) })),
  ]
})

const paymentSummary = computed(() => {
  const summary = { total: rows.value.length, succeeded: 0, pending: 0, failed: 0, todayAmount: 0, succeededAmount: 0 }
  const today = new Date()
  rows.value.forEach((payment) => {
    const amount = Number(payment.amount || 0)
    if (payment.status === 'SUCCEEDED') {
      summary.succeeded += 1
      summary.succeededAmount += amount
      const createdAt = new Date(payment.createdAt)
      if (!Number.isNaN(createdAt.getTime()) && createdAt.getFullYear() === today.getFullYear() && createdAt.getMonth() === today.getMonth() && createdAt.getDate() === today.getDate()) {
        summary.todayAmount += amount
      }
    } else if (payment.status === 'PENDING') summary.pending += 1
    else if (payment.status === 'FAILED') summary.failed += 1
  })
  return summary
})

const paymentStats = computed(() => [
  { key: 'all', label: '全部流水', value: paymentSummary.value.total, suffix: '笔', icon: Grid, tone: 'total', filterValue: 'all' },
  { key: 'today', label: '今日实收', value: formatYuan(paymentSummary.value.todayAmount), icon: Money, tone: 'amount', clickable: false },
  { key: 'succeeded', label: '支付成功', value: paymentSummary.value.succeeded, suffix: '笔', icon: CircleCheck, tone: 'succeeded', filterValue: 'SUCCEEDED' },
  { key: 'pending', label: '处理中', value: paymentSummary.value.pending, suffix: '笔', icon: Clock, tone: 'pending', filterValue: 'PENDING' },
  { key: 'failed', label: '支付失败', value: paymentSummary.value.failed, suffix: '笔', icon: CircleClose, tone: 'failed', filterValue: 'FAILED' },
  { key: 'average', label: '成功均价', value: formatYuan(paymentSummary.value.succeeded ? Math.round(paymentSummary.value.succeededAmount / paymentSummary.value.succeeded) : 0), icon: CreditCard, tone: 'average', clickable: false },
])

const lastUpdatedText = computed(() => lastUpdatedAt.value ? `最后同步 ${formatTimeWithSeconds(lastUpdatedAt.value)}` : '等待首次同步')
const paymentEmptyText = computed(() => rows.value.length ? '没有符合当前筛选条件的支付流水' : '暂无支付流水')

const orderedMethods = computed(() => orderAllowedMethods(availableMethods.value))
const memberSelectable = computed(() => orderedMethods.value.some((m) => m.method === 'POINT' || m.method === 'WALLET'))
const selectedMember = computed(() => memberResults.value.find((m) => m.id === selectedMemberId.value) || null)
/** 应收 = 服务端账单 payableAmount（缺省时 合计 − 已收），与服务端 collect 校验口径一致。 */
const payableMinor = computed(() => {
  if (serverPayableMinor.value != null) return Math.max(0, serverPayableMinor.value)
  return Math.max(0, billedMinor.value - paidMinor.value)
})
/** 已填合计：分腿数量先按各自口径折成最小货币单位再相加（服务端要求合计 = 应收），界面合计恒为金额。 */
const filledMinor = computed(() => orderedMethods.value.reduce(
  (sum, m) => sum + legInputToMinor(m.method, payByLeg.value[m.method], walletRatio.value), 0,
))
const balanced = computed(() => filledMinor.value === payableMinor.value && payableMinor.value > 0)

function paymentStatusClass(status) {
  if (status === 'SUCCEEDED') return 'succeeded'
  if (status === 'PENDING') return 'pending'
  if (status === 'FAILED') return 'failed'
  return 'unknown'
}

function openPaymentDetail(payment) {
  detailPayment.value = payment
  detailVisible.value = true
}

async function loadRefunds() {
  refundLoading.value = true
  try {
    const data = await listRefunds(dateRangeParams(range.value))
    refunds.value = Array.isArray(data) ? data : (data && data.items) || []
  } catch (e) {
    notifyAdminRequestError(e, '加载退款申请失败')
  } finally {
    refundLoading.value = false
  }
}

async function submitRefund() {
  const orderId = Number(String(refundForm.value.orderId || '').replace(/^#/, ''))
  const amount = yuanToFen(refundForm.value.amountYuan)
  const reason = String(refundForm.value.reason || '').trim()
  if (!orderId) { ElMessage.warning('请输入订单 ID'); return }
  if (amount <= 0) { ElMessage.warning('退款金额需大于 0'); return }
  if (!reason) { ElMessage.warning('请输入退款原因'); return }
  refundSaving.value = true
  try {
    await requestRefund({ storeId: contextStore.storeId, orderId, amount, reason, requestedBy: operatorId.value })
    ElMessage.success('退款申请已提交')
    refundForm.value = { orderId: '', amountYuan: 0.01, reason: '' }
    await loadRefunds()
  } catch (e) {
    notifyAdminRequestError(e, '提交退款申请失败')
  } finally {
    refundSaving.value = false
  }
}

async function approveRefundRow(row) {
  try {
    await approveRefund(row.id, { approvedAmount: row.requestedAmount, approvedBy: operatorId.value })
    ElMessage.success('退款已批准')
    await loadRefunds()
  } catch (e) { notifyAdminRequestError(e, '批准退款失败') }
}

async function rejectRefundRow(row) {
  try {
    await rejectRefund(row.id, { rejectedBy: operatorId.value })
    ElMessage.success('退款已驳回')
    await loadRefunds()
  } catch (e) { notifyAdminRequestError(e, '驳回退款失败') }
}

async function completeRefundRow(row) {
  try {
    await markRefunded(row.id, { providerRefundNo: `OFFLINE-${row.id}`, operatorId: operatorId.value })
    ElMessage.success('线下退款已登记')
    await Promise.all([loadRefunds(), load()])
  } catch (e) { notifyAdminRequestError(e, '登记退款失败') }
}

async function load() {
  // 本看板没有「查询」按钮，守卫放在加载入口：区间倒挂时只提示、不发请求。
  const warning = dateRangeWarning(range.value)
  if (warning) { ElMessage.warning(warning); return }
  loading.value = true
  try {
    const data = await listPayments({ ...dateRangeParams(range.value) })
    rows.value = Array.isArray(data) ? data : (data && data.items) || []
    lastUpdatedAt.value = new Date()
  } catch (e) {
    notifyAdminRequestError(e, '加载支付流水失败')
  } finally {
    loading.value = false
  }
}

async function loadWalletConfig() {
  try {
    const cfg = await getWalletTokenConfig(contextStore.tenantId)
    walletBrand.value = resolveWalletBrandName(cfg)
    walletRatio.value = resolveTokenRatio(cfg?.ratio)
  } catch { /* 读取失败用 constants/terms 的默认展示名与默认比例 */ }
}

async function loadPaymentMethods() {
  methodsLoading.value = true
  try {
    const list = await listPaymentMethods('admin')
    availableMethods.value = Array.isArray(list) ? list : (list && list.items) || []
  } catch (e) {
    availableMethods.value = []
    notifyAdminRequestError(e, '加载支付方式失败')
  } finally {
    methodsLoading.value = false
  }
}

async function openCollect() {
  collectForm.value = { orderId: '' }
  payByLeg.value = {}
  billedMinor.value = 0
  paidMinor.value = 0
  memberKeyword.value = ''
  memberResults.value = []
  selectedMemberId.value = null
  memberWalletMinor.value = 0
  memberWalletTokens.value = 0
  memberPoints.value = 0
  collectVisible.value = true
  if (!availableMethods.value.length) await loadPaymentMethods()
  clearLegs()
}

async function loadOrderBill() {
  const orderId = (collectForm.value.orderId || '').trim().replace(/^#/, '')
  billedMinor.value = 0
  paidMinor.value = 0
  if (!orderId) return
  try {
    // 账单字段就是最小货币单位整数：payableAmount（应收，缺省时用 totalAmount − paidAmount）。
    // 历史实现误读不存在的 totalMinor，导致应收恒为 0、根本无法收款。
    const bill = await getOrderBill(orderId)
    billedMinor.value = Number(bill?.totalAmount || 0)
    paidMinor.value = Number(bill?.paidAmount || 0)
    billCurrencyCode.value = bill?.currencyCode || ''
    serverPayableMinor.value = bill?.payableAmount != null ? Number(bill.payableAmount) : null
    autoFill()
  } catch (e) {
    notifyAdminRequestError(e, '无法读取服务端账单，请检查订单号')
  }
}

async function searchMembers() {
  const kw = (memberKeyword.value || '').trim()
  if (!kw) { ElMessage.warning('请输入手机号或客户号'); return }
  searchingMembers.value = true
  try {
    const data = await listMembers({ page: 1, pageSize: 10, keyword: kw })
    const list = Array.isArray(data) ? data : (data && (data.records || data.items || data.list)) || []
    memberResults.value = list
    if (!list.length) ElMessage.info('未找到客户')
    if (list.length === 1) await onMemberChange(list[0].id)
  } catch (e) {
    memberResults.value = []
    notifyAdminRequestError(e, '查询客户失败')
  } finally {
    searchingMembers.value = false
  }
}

async function onMemberChange(memberId) {
  selectedMemberId.value = memberId
  memberWalletMinor.value = 0
  memberWalletTokens.value = 0
  memberPoints.value = 0
  if (!memberId) return
  try {
    const wallet = await getMemberWallet(memberId)
    memberWalletMinor.value = Number(wallet?.availableAmount || 0)
    // 代币数量：服务端 tokenAmount 优先，缺字段按「余额 ÷ 100 × 租户比例」降级换算（只用于展示）。
    memberWalletTokens.value = resolveTokenCount(wallet?.tokenAmount, memberWalletMinor.value, walletRatio.value)
  } catch { /* 余额读取失败不阻塞，收款时以服务端校验为准 */ }
  try {
    const points = await getMemberPoints(memberId)
    memberPoints.value = Number(points?.account?.availablePoints ?? points?.availablePoints ?? 0)
  } catch { /* 同上 */ }
  autoFill()
}

/**
 * 按抵扣顺序用可用积分 / 储值填满应收，余额由现金兜底。
 * 储值币 / 积分分腿按**数量**回填（储值币数量由金额按租户比例折算，积分是 1:1 的个数）。
 */
function autoFill() {
  let left = payableMinor.value
  const next = {}
  for (const m of orderedMethods.value) {
    let amount = 0
    if (m.method === 'POINT') amount = Math.min(left, selectedMemberId.value ? memberPoints.value : 0)
    else if (m.method === 'WALLET') amount = Math.min(left, selectedMemberId.value ? memberWalletMinor.value : 0)
    else if (m.method === 'CASH') amount = left
    next[m.method] = legMinorToInput(m.method, amount, walletRatio.value)
    left -= amount
  }
  payByLeg.value = next
}

function clearLegs() {
  const next = {}
  for (const m of orderedMethods.value) next[m.method] = 0
  payByLeg.value = next
}

/** 单笔不得超过「应收 − 其他方式已填」，避免服务端超收校验失败。 */
function clampLeg(method) {
  const others = orderedMethods.value
    .filter((m) => m.method !== method)
    .reduce((sum, m) => sum + legInputToMinor(m.method, payByLeg.value[m.method], walletRatio.value), 0)
  const max = Math.max(0, payableMinor.value - others)
  const filled = legInputToMinor(method, payByLeg.value[method], walletRatio.value)
  const value = Math.min(Math.max(0, filled), max)
  payByLeg.value = { ...payByLeg.value, [method]: legMinorToInput(method, value, walletRatio.value) }
}

async function doCollect() {
  const orderId = (collectForm.value.orderId || '').trim().replace(/^#/, '')
  if (!orderId) { ElMessage.warning('请输入订单号'); return }
  const payable = payableMinor.value
  if (payable <= 0) { ElMessage.warning('应收金额需大于 0（请先确认订单号）'); return }
  // 提交给服务端的 amount 恒为最小货币单位整数（POINT 腿服务端按同一个数核销积分）。
  const payments = orderedMethods.value
    .map((m) => ({ method: m.method, amount: legInputToMinor(m.method, payByLeg.value[m.method], walletRatio.value) }))
    .filter((p) => p.amount > 0)
  if (!payments.length) { ElMessage.warning('请至少填写一种支付方式的金额'); return }
  const total = payments.reduce((s, p) => s + p.amount, 0)
  if (total !== payable) { ElMessage.warning('拆分金额合计须等于应收金额'); return }
  const usesMember = payments.some((p) => p.method === 'POINT' || p.method === 'WALLET')
  if (usesMember && !selectedMemberId.value) { ElMessage.warning('积分 / 储值抵扣需要先选择客户'); return }
  collecting.value = true
  try {
    const result = await collect(Number(orderId), {
      customerId: selectedMemberId.value,
      // 收款币种必须与订单币种一致：优先账单快照，缺快照回落全局当前币种
      currencyCode: billCurrencyCode.value || currencyStore.code,
      payable,
      payments,
    })
    // 已收分腿：现金 / 线上带币种，储值币 / 积分只显示数量。
    const collected = (result?.collectedByMethod || [])
      .map((c) => collectedLegText(c, walletBrand.value, walletRatio.value, result?.currencyCode || billCurrencyCode.value))
      .join('，')
    ElMessage.success('收款成功' + (collected ? '：' + collected : ''))
    collectVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '收款失败')
  } finally {
    collecting.value = false
  }
}

onMounted(() => { load(); loadWalletConfig() })
</script>

<style scoped>
.payments-board-page {
  --payment-green: #21a876;
  --payment-red: #e2545f;
  --payment-orange: #e98a2d;
  --payment-blue: #3478f6;
}
.payment-grid {
  padding: 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(245px, 1fr));
  gap: 20px;
  background: #fafbfc;
}
.payment-card {
  min-width: 0;
  min-height: 232px;
  padding: 16px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 11px;
  background: var(--el-bg-color);
  box-shadow: 0 2px 8px rgba(34, 42, 62, .035);
  cursor: pointer;
  transition: transform .18s, box-shadow .18s, border-color .18s;
}
.payment-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: #aeb7c5;
}
.payment-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(31, 44, 74, .1); }
.payment-card.succeeded::before { background: var(--payment-green); }
.payment-card.pending::before { background: var(--payment-orange); }
.payment-card.failed::before { background: var(--payment-red); }
.payment-card.succeeded { border-color: #d8ece5; background: linear-gradient(145deg, #fff 0%, #fff 72%, #f4fbf8 100%); }
.payment-card.pending { border-color: #f1dec6; background: linear-gradient(145deg, #fff 0%, #fff 72%, #fff9f1 100%); }
.payment-card.failed { border-color: #f0d7da; background: linear-gradient(145deg, #fff 0%, #fff 72%, #fff7f7 100%); }

.payment-card-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 18px; }
.method-icon {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--payment-blue);
  background: #edf3ff;
  font-size: 19px;
}
.method-title { min-width: 0; flex: 1; }
.method-title strong { display: block; overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.method-title span { display: block; margin-top: 5px; color: var(--el-text-color-secondary); font-size: 11px; }
.payment-status { flex: none; padding: 4px 8px; border-radius: 13px; color: #68707e; background: #f0f2f5; font-size: 11px; font-weight: 600; }
.succeeded .payment-status,
.payment-status.succeeded { color: #16895f; background: #eaf8f2; }
.pending .payment-status,
.payment-status.pending { color: #c76b10; background: #fff0dc; }
.failed .payment-status,
.payment-status.failed { color: #ce3e4a; background: #ffeaec; }

.payment-amount { margin-bottom: 15px; }
.payment-amount span { display: block; margin-bottom: 3px; color: var(--el-text-color-placeholder); font-size: 11px; }
.payment-amount strong { color: #d84653; font-size: 25px; line-height: 1.25; }
.succeeded .payment-amount strong { color: #16895f; }
.pending .payment-amount strong { color: #d97819; }

.payment-meta { display: grid; gap: 7px; padding: 10px 0; border-top: 1px dashed var(--el-border-color); }
.payment-meta div { min-width: 0; display: grid; grid-template-columns: 62px minmax(0, 1fr); gap: 8px; font-size: 11px; }
.payment-meta span { color: var(--el-text-color-placeholder); }
.payment-meta b { overflow: hidden; color: var(--el-text-color-regular); font-weight: 500; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.payment-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; padding-top: 9px; }
.payment-actions > span { overflow: hidden; color: var(--el-text-color-placeholder); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }

.payment-grid.list-mode { grid-template-columns: 1fr; }
.payment-grid.list-mode .payment-card {
  min-height: auto;
  display: grid;
  grid-template-columns: minmax(230px, .9fr) minmax(150px, .5fr) minmax(280px, 1.1fr) minmax(170px, .6fr);
  align-items: center;
  gap: 22px;
}
.payment-grid.list-mode .payment-card-head,
.payment-grid.list-mode .payment-amount { margin: 0; }
.payment-grid.list-mode .payment-meta { padding: 0; border: 0; }
.payment-grid.list-mode .payment-actions { margin: 0; padding: 0; }

.drawer-title { width: 100%; padding-right: 8px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.drawer-title h3 { margin: 0; color: var(--el-text-color-primary); font-size: 20px; }
.drawer-title p { max-width: 280px; margin: 5px 0 0; overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.detail-amount { margin-bottom: 18px; padding: 20px; border-radius: 12px; color: #fff; background: linear-gradient(135deg, #64748b, #334155); }
.detail-amount.succeeded { background: linear-gradient(135deg, #3fbe91, #18855f); }
.detail-amount.pending { background: linear-gradient(135deg, #f0a14f, #cf741a); }
.detail-amount.failed { background: linear-gradient(135deg, #eb6b75, #cb3d49); }
.detail-amount span { display: block; opacity: .8; font-size: 11px; }
.detail-amount strong { display: block; margin-top: 6px; font-size: 28px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--el-border-color-lighter); border-radius: 9px; overflow: hidden; }
.detail-grid > div { min-width: 0; padding: 12px; border-right: 1px solid var(--el-border-color-lighter); border-bottom: 1px solid var(--el-border-color-lighter); }
.detail-grid > div:nth-child(2n) { border-right: 0; }
.detail-grid > .detail-wide { grid-column: 1 / -1; border-right: 0; }
.detail-grid > div:last-child { border-bottom: 0; }
.detail-grid span { display: block; margin-bottom: 4px; color: var(--el-text-color-placeholder); font-size: 10px; }
.detail-grid b { display: block; overflow-wrap: anywhere; color: var(--el-text-color-regular); font-size: 12px; }

.member-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sum { font-size: 16px; font-weight: 700; color: var(--el-color-danger); }
.mismatch { margin-left: 8px; color: var(--el-color-warning); font-size: 13px; }
.muted { margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px; }

@media (max-width: 1500px) {
  .payment-grid { grid-template-columns: repeat(3, minmax(235px, 1fr)); }
}
@media (max-width: 1180px) {
  .payment-grid { grid-template-columns: repeat(2, minmax(230px, 1fr)); }
  .payment-grid.list-mode .payment-card { grid-template-columns: minmax(210px, 1fr) minmax(130px, .6fr) 1fr; }
  .payment-grid.list-mode .payment-actions { grid-column: 1 / -1; }
}
@media (max-width: 720px) {
  .payment-grid { grid-template-columns: 1fr; padding: 12px; gap: 16px; }
  .payment-grid.list-mode .payment-card { display: flex; }
}
</style>
