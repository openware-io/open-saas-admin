<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>交班/日结</h2>
      <el-button @click="reload">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
    </div>

    <el-tabs v-model="tab" class="admin-card">
      <!-- ===== 交班 ===== -->
      <el-tab-pane label="交班" name="shift">
        <div class="filter-bar">
          <!-- 交班时间（开班时间 openedAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59；
               本页没有「查询」按钮，选完即按区间重新拉取。 -->
          <DateRangeFilter v-model="query.range" @change="reload" @clear="reload" />
          <el-button type="primary" @click="openShiftVisible = true">
            <el-icon><Plus /></el-icon>开班
          </el-button>
        </div>
        <el-table :data="shifts" v-loading="shiftsLoading" border stripe>
          <el-table-column prop="id" label="班次" width="80" align="center" />
          <el-table-column label="门店" width="90" align="center">
            <template #default="{ row }">{{ row.storeId ? '#' + row.storeId : '—' }}</template>
          </el-table-column>
          <el-table-column :label="SHIFT_CASH_TEXT.opening" width="110" align="right">
            <template #default="{ row }">{{ formatMoney(row.openingCash, row.currencyCode) }}</template>
          </el-table-column>
          <el-table-column :label="SHIFT_CASH_TEXT.expected" width="110" align="right">
            <template #default="{ row }">{{ formatMoney(row.expectedCash, row.currencyCode) }}</template>
          </el-table-column>
          <el-table-column :label="SHIFT_CASH_TEXT.actual" width="110" align="right">
            <template #default="{ row }">{{ formatMoney(row.actualCash, row.currencyCode) }}</template>
          </el-table-column>
          <el-table-column :label="SHIFT_CASH_TEXT.difference" width="110" align="right">
            <template #default="{ row }">{{ formatMoney(row.differenceAmount, row.currencyCode) }}</template>
          </el-table-column>
          <el-table-column label="币种" width="100" align="center">
            <template #default="{ row }">{{ currencyText(row.currencyCode) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="shiftStatusType(row.status)">{{ shiftStatusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="开班时间" width="160">
            <template #default="{ row }">{{ formatTime(row.openedAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="110" align="center" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'OPEN'" link type="primary" @click="openCloseShift(row)">交班</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无班次" /></template>
        </el-table>
      </el-tab-pane>

      <!-- ===== 日结 ===== -->
      <el-tab-pane label="日结" name="daily">
        <div class="filter-bar">
          <!-- 营业日/提交时间（businessDate、createdAt）：与交班页共用同一个区间控件。 -->
          <DateRangeFilter v-model="query.range" @change="reload" @clear="reload" />
          <el-button type="primary" @click="dailyVisible = true">
            <el-icon><Plus /></el-icon>日结
          </el-button>
        </div>
        <el-table :data="dailyClosings" v-loading="dailyLoading" border stripe>
          <!-- 日结汇总（pay_daily_closing.summary_json）：按币种分组展开，混币种禁止合计 -->
          <el-table-column type="expand" width="46">
            <template #default="{ row }">
              <div class="summary-panel">
                <el-alert
                  v-if="!hasDailyClosingSummary(row.summary)"
                  type="info"
                  show-icon
                  :closable="false"
                  :title="SUMMARY_UNAVAILABLE_TEXT"
                />
                <template v-else>
                  <el-alert
                    v-if="isDailyClosingMixedCurrency(row.summary)"
                    type="warning"
                    show-icon
                    :closable="false"
                    :title="MIXED_CURRENCY_NOTICE"
                    description="该营业日存在多种币种，以下按币种分组分别展示；不同币种的金额不得相加，因此不显示合计。"
                  />
                  <div
                    v-for="(line, index) in dailyClosingCurrencyGroups(row.summary)"
                    :key="line.currencyCode || index"
                    class="summary-group"
                  >
                    <div class="summary-group-title">{{ currencyText(line.currencyCode) }}</div>
                    <el-descriptions :column="3" border size="small">
                      <el-descriptions-item label="收款笔数">{{ line.collectionCount }}</el-descriptions-item>
                      <el-descriptions-item label="收款总额">
                        {{ formatMoney(line.collectedAmount, line.currencyCode) }}
                      </el-descriptions-item>
                      <el-descriptions-item label="现金收款">
                        {{ formatMoney(line.cashAmount, line.currencyCode) }}（{{ line.cashCount }} 笔）
                      </el-descriptions-item>
                      <el-descriptions-item label="退款笔数">{{ line.refundCount }}</el-descriptions-item>
                      <el-descriptions-item label="退款合计">
                        {{ formatMoney(line.refundAmount, line.currencyCode) }}
                      </el-descriptions-item>
                      <el-descriptions-item label="交班班次">{{ line.shiftCount }}</el-descriptions-item>
                      <el-descriptions-item label="交班长短款">
                        {{ formatMoney(line.shiftDifferenceAmount, line.currencyCode) }}
                      </el-descriptions-item>
                    </el-descriptions>
                    <el-table :data="line.providers" size="small" border class="summary-providers">
                      <el-table-column label="支付方式" min-width="130">
                        <template #default="{ row: provider }">{{ methodLabel(provider.provider, walletBrand) }}</template>
                      </el-table-column>
                      <el-table-column label="笔数" width="90" align="right">
                        <template #default="{ row: provider }">{{ provider.count }}</template>
                      </el-table-column>
                      <!-- 现金 / 线上按金额（带币种符号）；储值币 / 积分只显示数量（不带单位，见 §9） -->
                      <el-table-column label="金额 / 数量" width="150" align="right">
                        <template #default="{ row: provider }">{{ paymentValueText(provider, walletRatio, line.currencyCode) }}</template>
                      </el-table-column>
                      <template #empty><span class="summary-empty">本币种暂无收款明细</span></template>
                    </el-table>
                  </div>
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="id" label="编号" width="80" align="center" />
          <el-table-column label="门店" width="90" align="center">
            <template #default="{ row }">{{ row.storeId ? '#' + row.storeId : '—' }}</template>
          </el-table-column>
          <el-table-column label="营业日期" width="130" align="center">
            <template #default="{ row }">{{ formatTime(row.businessDate) }}</template>
          </el-table-column>
          <el-table-column label="提交人" width="90" align="center">
            <template #default="{ row }">{{ row.submittedBy ? '#' + row.submittedBy : '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="110" align="center">
            <template #default="{ row }">{{ dailyClosingStatusText(row.status) }}</template>
          </el-table-column>
          <el-table-column label="提交时间" width="170">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <template #empty><el-empty description="暂无日结记录" /></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 开班 -->
    <el-dialog v-model="openShiftVisible" title="开班" width="460px">
      <el-form label-width="100px">
        <el-form-item label="门店">
          <el-input :model-value="'#' + currentStoreId" disabled />
        </el-form-item>
        <el-form-item label="终端号">
          <el-input-number v-model="openShiftForm.terminalId" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="withCurrencyLabel(SHIFT_CASH_TEXT.opening)">
          <el-input-number v-model="openShiftForm.openingCashYuan" :min="0" :precision="2" :step="100" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="openShiftVisible = false">取消</el-button>
        <el-button type="primary" :loading="shiftSubmitting" @click="doOpenShift">确认开班</el-button>
      </template>
    </el-dialog>

    <!-- 交班 -->
    <el-dialog v-model="closeShiftVisible" title="交班" width="460px">
      <el-form label-width="100px">
        <el-form-item :label="withCurrencyLabel(SHIFT_CASH_TEXT.actual)">
          <el-input-number v-model="closeShiftForm.actualCashYuan" :min="0" :precision="2" :step="100" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="closeShiftForm.remark" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeShiftVisible = false">取消</el-button>
        <el-button type="primary" :loading="shiftSubmitting" @click="doCloseShift">确认交班</el-button>
      </template>
    </el-dialog>

    <!-- 日结 -->
    <el-dialog v-model="dailyVisible" title="日结" width="460px">
      <el-form label-width="100px">
        <el-form-item label="门店">
          <el-input :model-value="'#' + currentStoreId" disabled />
        </el-form-item>
        <el-form-item label="营业日期">
          <el-date-picker v-model="dailyForm.businessDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dailyVisible = false">取消</el-button>
        <el-button type="primary" :loading="dailySubmitting" @click="doSubmitDaily">确认日结</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Plus } from '@element-plus/icons-vue'
import { listShifts, openShift, closeShift, listDailyClosings, submitDailyClosing } from '@/api/payment'
import { getWalletTokenConfig } from '@/api/admin'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { currencyText, formatMoney, formatTime, resolveTokenRatio, withCurrencyLabel, yuanToFen } from '@/utils/format'
import {
  SHIFT_CASH_TEXT,
  WALLET_BRAND_NAME_DEFAULT,
  dailyClosingStatusText,
  resolveWalletBrandName,
  shiftStatusText,
  shiftStatusType,
} from '@/constants/terms'
import { methodLabel, paymentValueText } from '@/constants/payment-methods'
import { MIXED_CURRENCY_NOTICE } from '@/utils/currency-summary'
import {
  SUMMARY_UNAVAILABLE_TEXT,
  dailyClosingCurrencyGroups,
  hasDailyClosingSummary,
  isDailyClosingMixedCurrency,
} from '@/utils/daily-closing-summary'
import { useContextStore } from '@/stores/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const contextStore = useContextStore()
const tab = ref('shift')
/** 时间区间：交班页按开班时间、日结页按营业日/提交时间，两个 tab 共用同一个区间控件与取值。 */
const query = reactive({ range: emptyDateRange() })

// 储值展示名与兑换比例取租户配置（wallet_brand_name / wallet_ratio），缺配置回落唯一默认值
// ——与收银页、日结明细（储值币按数量折算）同一口径。
const walletBrand = ref(WALLET_BRAND_NAME_DEFAULT)
const walletRatio = ref(resolveTokenRatio(null))

const shifts = ref([])
const shiftsLoading = ref(false)
const dailyClosings = ref([])
const dailyLoading = ref(false)
const shiftSubmitting = ref(false)
const dailySubmitting = ref(false)

const openShiftVisible = ref(false)
const openShiftForm = ref({ terminalId: 1, openingCashYuan: 0 })
const closeShiftVisible = ref(false)
const closeShiftForm = ref({ actualCashYuan: 0, remark: '' })
let closingShiftId = null

const dailyVisible = ref(false)
const dailyForm = ref({ businessDate: today() })

const currentStoreId = computed(() => contextStore.storeId)
const operatorId = computed(() => contextStore.current?.accountId ?? null)

function today() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

/** 日结状态与交班现金盘点术语见 constants/terms（「实收现金」是实点现金，不是账单「已收」）。 */

async function reload() {
  // 本页没有「查询」按钮，守卫放在刷新/区间变化的入口：区间倒挂时只提示、不发请求。
  const warning = dateRangeWarning(query.range)
  if (warning) { ElMessage.warning(warning); return }
  loadShifts()
  loadDaily()
}

async function loadShifts() {
  shiftsLoading.value = true
  try {
    const data = await listShifts({ ...dateRangeParams(query.range) })
    shifts.value = Array.isArray(data) ? data : (data && data.items) || []
  } catch (e) {
    notifyAdminRequestError(e, '加载班次失败')
  } finally {
    shiftsLoading.value = false
  }
}

async function loadDaily() {
  dailyLoading.value = true
  try {
    const data = await listDailyClosings({ ...dateRangeParams(query.range) })
    dailyClosings.value = Array.isArray(data) ? data : (data && data.items) || []
  } catch (e) {
    notifyAdminRequestError(e, '加载日结失败')
  } finally {
    dailyLoading.value = false
  }
}

/** 储值展示名 / 兑换比例加载失败不阻塞交班/日结，回落默认品牌名与默认比例。 */
async function loadWalletBrand() {
  if (!contextStore.tenantId) return
  try {
    const cfg = await getWalletTokenConfig(contextStore.tenantId)
    walletBrand.value = resolveWalletBrandName(cfg)
    walletRatio.value = resolveTokenRatio(cfg?.ratio)
  } catch (e) {
    walletBrand.value = WALLET_BRAND_NAME_DEFAULT
    walletRatio.value = resolveTokenRatio(null)
  }
}

async function doOpenShift() {
  if (!contextStore.tenantId || !currentStoreId.value) {
    ElMessage.warning('请先选择有效的租户/门店上下文')
    return
  }
  shiftSubmitting.value = true
  try {
    await openShift({
      storeId: currentStoreId.value,
      terminalId: openShiftForm.value.terminalId,
      operatorId: operatorId.value,
      openingCash: yuanToFen(openShiftForm.value.openingCashYuan),
    })
    ElMessage.success('已开班')
    openShiftVisible.value = false
    loadShifts()
  } catch (e) {
    notifyAdminRequestError(e, '开班失败')
  } finally {
    shiftSubmitting.value = false
  }
}

function openCloseShift(row) {
  closingShiftId = row.id
  closeShiftForm.value = { actualCashYuan: 0, remark: '' }
  closeShiftVisible.value = true
}

async function doCloseShift() {
  shiftSubmitting.value = true
  try {
    await closeShift(closingShiftId, {
      actualCash: yuanToFen(closeShiftForm.value.actualCashYuan),
      remark: closeShiftForm.value.remark || null,
    })
    ElMessage.success('已交班')
    closeShiftVisible.value = false
    loadShifts()
  } catch (e) {
    notifyAdminRequestError(e, '交班失败')
  } finally {
    shiftSubmitting.value = false
  }
}

async function doSubmitDaily() {
  if (!dailyForm.value.businessDate) {
    ElMessage.warning('请选择营业日期')
    return
  }
  if (!contextStore.tenantId || !currentStoreId.value) {
    ElMessage.warning('请先选择有效的租户/门店上下文')
    return
  }
  dailySubmitting.value = true
  try {
    await submitDailyClosing(0, {
      storeId: currentStoreId.value,
      businessDate: dailyForm.value.businessDate,
      submittedBy: operatorId.value,
    })
    ElMessage.success('已日结')
    dailyVisible.value = false
    loadDaily()
  } catch (e) {
    notifyAdminRequestError(e, '日结失败')
  } finally {
    dailySubmitting.value = false
  }
}

onMounted(() => {
  loadShifts()
  loadDaily()
  loadWalletBrand()
})
</script>

<style scoped>
.summary-panel { padding: 4px 8px; }
.summary-group { margin-top: 12px; }
.summary-group-title { margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
.summary-providers { margin-top: 8px; }
.summary-empty { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
