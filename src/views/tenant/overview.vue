<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2>经营总览</h2>
        <p class="subtle">总部实时读取各业务领域权威数据；当前已接入客户、积分和储值。</p>
      </div>
      <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <el-alert
      v-if="contextStore.storeId"
      type="warning"
      :closable="false"
      show-icon
      title="经营总览仅限租户总部上下文"
      description="请通过右上角经营上下文切换到租户总部后查看。门店上下文不能查看跨店汇总。"
    />

    <template v-else>
      <div class="admin-card filter-bar">
        <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" range-separator="至"
          start-placeholder="开始日期" end-placeholder="结束日期" clearable />
        <el-select v-model="selectedStoreIds" multiple collapse-tags collapse-tags-tooltip clearable
          placeholder="全部可见门店" style="width: 320px">
          <el-option v-for="store in stores" :key="store.id" :label="store.name" :value="store.id" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="load">查询</el-button>
      </div>

      <el-alert v-if="error" type="error" :closable="false" show-icon :title="error" class="error-alert" />

      <div v-if="overview" class="metric-grid" v-loading="loading">
        <section class="metric-card"><span>客户数</span><strong>{{ integer(customer.memberCount) }}</strong><small>租户去重客户，不按门店相加</small></section>
        <section class="metric-card"><span>共享积分余额</span><strong>{{ integer(customer.pointsBalance) }}</strong><small>租户共享余额，门店筛选不拆分</small></section>
        <section class="metric-card"><span>共享储值余额</span><strong>{{ money(customer.walletBalance) }}</strong><small>租户共享余额，门店筛选不拆分</small></section>
        <section class="metric-card"><span>期间积分变动</span><strong>{{ signed(customer.pointsDelta) }}</strong><small>按实际操作门店与时间筛选</small></section>
        <section class="metric-card"><span>期间储值变动</span><strong>{{ signedMoney(customer.walletDelta) }}</strong><small>按实际操作门店与时间筛选</small></section>
      </div>
      <section v-if="overview?.payment" class="admin-card payment-summary">
        <div class="section-title">支付事实</div>
        <el-table :data="overview.payment.rows || []" size="small" border>
          <el-table-column prop="provider" label="支付渠道" />
          <el-table-column prop="currencyCode" label="币种" width="100" />
          <el-table-column prop="transactionCount" label="成功笔数" width="110" />
          <el-table-column label="成功金额" width="160">
            <template #default="{ row }">{{ formatMoney(row.amount, row.currencyCode) }}</template>
          </el-table-column>
        </el-table>
        <p class="subtle">支付事实按领域权威库实时读取，按币种分组，不跨币种相加。</p>
        <div class="section-title refund-title">退款事实</div>
        <el-table :data="overview.payment.refunds || []" size="small" border>
          <el-table-column prop="currencyCode" label="币种" width="120" />
          <el-table-column prop="refundCount" label="已退款笔数" width="140" />
          <el-table-column label="已退款金额" width="180">
            <template #default="{ row }">{{ formatMoney(row.amount, row.currencyCode) }}</template>
          </el-table-column>
        </el-table>
        <p class="subtle">仅统计已完成退款，按退款完成时间与实际操作门店筛选。</p>
      </section>
      <section v-if="overview?.order" class="admin-card payment-summary">
        <div class="section-title">订单经营事实</div>
        <el-table :data="overview.order.rows || []" size="small" border>
          <el-table-column prop="storeId" label="门店" width="100" />
          <el-table-column label="业态" width="120">
            <template #default="{ row }">{{ businessTypeText(row.businessType) }}</template>
          </el-table-column>
          <el-table-column prop="currencyCode" label="币种" width="100" />
          <el-table-column prop="orderCount" label="订单数" width="100" />
          <el-table-column label="成交金额" width="160">
            <template #default="{ row }">{{ formatMoney(Number(row.revenueAmount || 0), row.currencyCode) }}</template>
          </el-table-column>
          <el-table-column label="已收金额" width="160">
            <template #default="{ row }">{{ formatMoney(Number(row.paidAmount || 0), row.currencyCode) }}</template>
          </el-table-column>
        </el-table>
        <p class="subtle">订单事实按门店、业态和币种分组；退款事实由支付领域独立展示。</p>
      </section>
      <el-alert v-if="overview?.dataStatus === 'PARTIAL'" type="warning" :closable="false" show-icon
        title="部分领域暂不可用" description="页面展示的指标来自当前可用领域，失败项可稍后刷新重试。" class="error-alert" />
      <el-empty v-if="!overview && !loading && !error" description="暂无可展示的总览数据" />

      <p v-if="overview?.updatedAt" class="updated-at">数据状态：{{ overview.dataStatus }} · 查询完成：{{ formatTime(overview.updatedAt) }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { getTenantOverview } from '@/api/tenant-overview'
import { listStores } from '@/api/store'
import { useContextStore } from '@/stores/context'
import { formatMoney, formatTime } from '@/utils/format'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { businessTypeText } from '@/constants/terms'

const contextStore = useContextStore()
const loading = ref(false)
const error = ref('')
const overview = ref(null)
const stores = ref([])
const selectedStoreIds = ref([])
const range = ref([])
const customer = computed(() => overview.value?.customer || {})

function integer(value) { return new Intl.NumberFormat('zh-CN').format(Number(value || 0)) }
function signed(value) { const number = Number(value || 0); return `${number > 0 ? '+' : ''}${integer(number)}` }
function money(value) { return formatMoney(Number(value || 0), overview.value?.currencyCode) }
function signedMoney(value) { const number = Number(value || 0); return `${number > 0 ? '+' : ''}${money(number)}` }

async function loadStores() {
  try { stores.value = (await listStores({ status: 'ACTIVE' })) || [] } catch { stores.value = [] }
}

async function load() {
  if (contextStore.storeId) return
  loading.value = true
  error.value = ''
  try {
    overview.value = await getTenantOverview({
      from: range.value?.[0] || undefined,
      to: range.value?.[1] || undefined,
      storeIds: selectedStoreIds.value.length ? selectedStoreIds.value.join(',') : undefined,
    })
  } catch (exception) {
    overview.value = null
    error.value = '加载经营总览失败'
    notifyAdminRequestError(exception, '加载经营总览失败')
  } finally { loading.value = false }
}

onMounted(async () => { await loadStores(); await load() })
</script>

<style scoped>
.subtle, .updated-at { color: var(--el-text-color-secondary); font-size: 13px; margin: 6px 0 0; }
.filter-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; margin-top: 16px; }
.metric-card { display: flex; flex-direction: column; min-height: 120px; padding: 20px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color); }
.metric-card span, .metric-card small { color: var(--el-text-color-secondary); }
.metric-card strong { margin: 10px 0; font-size: 28px; color: var(--el-text-color-primary); }
.error-alert { margin-top: 16px; }
.payment-summary { margin-top: 16px; }
.section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
.refund-title { margin-top: 20px; }
</style>
