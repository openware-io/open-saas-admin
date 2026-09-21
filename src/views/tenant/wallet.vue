<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>储值管理</h2>
      <span class="page-desc">租户级储值：同一租户内<b>跨门店共用</b>同一账户，充值与消费都按客户（不是按门店）记账</span>
      <div style="display: flex; gap: 10px">
        <el-button v-if="walletGranted" @click="openConfig">
          <el-icon><Setting /></el-icon>代币配置
        </el-button>
        <el-button @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
    </div>

    <el-alert v-if="!walletGranted" title="当前租户未开通储值代币，如需使用请联系平台授权" type="warning" show-icon :closable="false" />

    <template v-else>
      <div class="admin-card">
        <div class="filter-bar">
          <!-- 客户建档时间：from/to 是闭区间，结束端由后端收口到当天 23:59:59 -->
          <DateRangeFilter v-model="range" />
          <el-input v-model="keyword" placeholder="客户号 / 手机号" clearable style="width: 240px" @keyup.enter="search" />
          <el-button type="primary" @click="search">查询</el-button>
          <!-- 账户懒初始化：只有充过值的会员才有账户，其余显示「未开立」，不再逐个会员查余额报错。 -->
          <span class="muted">储值账户按需开立：客户首次充值时自动开立，没有储值的客户显示「未开立」。</span>
        </div>

        <el-table :data="rows" v-loading="loading" border stripe>
          <el-table-column prop="memberNo" label="会员号" width="200" show-overflow-tooltip />
          <el-table-column prop="name" label="姓名" width="120" />
          <el-table-column prop="phone" label="手机号" width="140" />
          <el-table-column :label="tokenName + '余额'" width="140" align="right">
            <template #default="{ row }">
              <span v-if="!row.opened" class="muted">未开立</span>
              <span v-else>{{ formatTokens(row.tokenCount) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openLedger(row)">流水</el-button>
              <el-button link type="success" @click="openRecharge(row)">充值</el-button>
              <el-button link type="danger" :disabled="!row.opened" @click="openRefund(row)">退还</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          class="wallet-pager"
          layout="total, sizes, prev, pager, next"
          :total="total"
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </template>

    <el-dialog v-model="rechargeVisible" title="储值充值" width="440px">
      <el-form label-width="110px">
        <el-form-item label="客户"><span>{{ current?.memberNo }}</span></el-form-item>
        <el-form-item :label="withCurrencyLabel('充值金额')">
          <el-input-number v-model="rechargeForm.amountYuan" :min="0" :precision="2" :step="100" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="'到账' + tokenName">
          <span class="converted">{{ formatTokens(rechargeTokens) }}</span>
        </el-form-item>
        <el-form-item label="支付方式">
          <el-select v-model="rechargeForm.paymentMethod" style="width: 100%">
            <el-option label="现金" value="CASH" />
            <el-option label="线下转账" value="TRANSFER" />
          </el-select>
        </el-form-item>
        <el-form-item label="凭证号"><el-input v-model="rechargeForm.referenceNo" placeholder="选填" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rechargeVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doRecharge">确认充值</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="refundVisible" title="储值退还" width="440px">
      <el-form label-width="110px">
        <el-form-item label="客户"><span>{{ current?.memberNo }}</span></el-form-item>
        <el-form-item :label="'退还' + tokenName">
          <el-input-number v-model="refundForm.tokens" :min="0" :precision="0" :step="50" style="width: 100%" />
        </el-form-item>
        <el-form-item label="原因"><el-input v-model="refundForm.reason" placeholder="选填" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundVisible = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="doRefund">确认退还</el-button>
      </template>
    </el-dialog>

    <!-- 储值流水：真实账本（cst_wallet_ledger）逐笔，含变动后余额；取代 KTV 配置里那张「用余额拼出来的流水」。 -->
    <el-dialog v-model="ledgerVisible" :title="`储值流水 · ${current?.memberNo || ''}`" width="720px">
      <el-table v-loading="ledgerLoading" :data="ledgerRows" border stripe>
        <el-table-column label="类型" width="110" align="center">
          <template #default="{ row }">{{ walletLedgerTypeText(row.entryType) }}</template>
        </el-table-column>
        <el-table-column :label="tokenName + '数量'" width="130" align="right">
          <template #default="{ row }">{{ formatTokens(ledgerTokenCount(row)) }}</template>
        </el-table-column>
        <el-table-column label="变动后余额（数量）" width="160" align="right">
          <template #default="{ row }">{{ formatTokens(ledgerBalanceCount(row)) }}</template>
        </el-table-column>
        <el-table-column prop="orderId" label="关联订单" width="110" align="center" />
        <el-table-column label="发生时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.occurredAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!ledgerLoading && !ledgerRows.length" description="该客户暂无储值流水（未开立账户或尚未发生充值/消费）" />
      <el-pagination
        v-if="ledgerTotal > ledgerPageSize"
        class="wallet-pager"
        layout="total, prev, pager, next"
        :total="ledgerTotal"
        :current-page="ledgerPage"
        :page-size="ledgerPageSize"
        @current-change="onLedgerPageChange"
      />
    </el-dialog>

    <el-dialog v-model="configVisible" title="代币配置" width="460px">
      <el-form label-width="120px">
        <el-form-item label="代币名称">
          <el-input v-model="configForm.brandName" :placeholder="'如 ' + WALLET_BRAND_NAME_DEFAULT" />
        </el-form-item>
        <el-form-item label="兑换比例">
          <!-- 比例是「1 主单位 = N 个代币」：值只出数字，不拼品牌名（名字由上面的代币名称与说明承担） -->
          <div class="ratio-line">
            <span>1 {{ withCurrencyLabel('主单位') }} =</span>
            <el-input-number v-model="configForm.ratio" :min="1" :precision="0" style="width: 140px" />
          </div>
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="代币只按数量展示（千分位，不带货币符号、币种与品牌名后缀）；比例仅用于折算展示，不参与入账金额。"
        />
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="代币名称与比例是租户级配置，对该租户所有门店的储值展示同时生效。"
        />
      </el-form>
      <template #footer>
        <el-button @click="configVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Setting } from '@element-plus/icons-vue'
import { listMemberWallets, getMemberWalletLedger } from '@/api/member'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { walletRecharge, walletRefund, listPaymentMethods } from '@/api/payment'
import { getWalletTokenConfig, updateWalletTokenConfig } from '@/api/admin'
import { useContextStore } from '@/stores/context'
import { useCurrencyStore } from '@/stores/currency'
import {
  WALLET_TOKEN_DEFAULT_RATIO,
  formatTime,
  formatTokens,
  majorToTokens,
  resolveTokenCount,
  resolveTokenRatio,
  tokensToMinor,
  withCurrencyLabel,
  yuanToFen,
} from '@/utils/format'
import {
  WALLET_BRAND_NAME_DEFAULT,
  resolveWalletBrandName,
  walletLedgerTypeText,
} from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const contextStore = useContextStore()
// 全局币种（唯一来源）：写请求体的 currencyCode 取它（后端按币种隔离钱包账本）。
const currencyStore = useCurrencyStore()
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
/** 时间区间（客户建档时间）：本页查询条件不是 reactive 对象，区间单独一个 ref。 */
const range = ref(emptyDateRange())
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const walletGranted = ref(true)

/** 储值展示名 / 兑换比例：唯一出处是租户配置（constants/terms 只兜底品牌名默认值）。 */
const tokenName = ref(WALLET_BRAND_NAME_DEFAULT)
const tokenRatio = ref(WALLET_TOKEN_DEFAULT_RATIO)

const rechargeVisible = ref(false)
const refundVisible = ref(false)
const configVisible = ref(false)
const ledgerVisible = ref(false)
const ledgerLoading = ref(false)
const ledgerRows = ref([])
const ledgerTotal = ref(0)
const ledgerPage = ref(1)
const ledgerPageSize = 10
const current = ref(null)
const rechargeForm = ref({ amountYuan: 0, paymentMethod: 'CASH', referenceNo: '' })
const refundForm = ref({ tokens: 0, reason: '' })
const configForm = ref({ brandName: WALLET_BRAND_NAME_DEFAULT, ratio: WALLET_TOKEN_DEFAULT_RATIO })

/**
 * 「到账代币」展示值：按租户比例把充值金额（主单位）折成代币**数量**，仅用于展示；
 * 落库金额一律是最小货币单位整数（见 doRecharge），两者口径不同，不要互相代入。
 */
const rechargeTokens = computed(() => majorToTokens(rechargeForm.value.amountYuan || 0, tokenRatio.value))
/** 退还数量（代币）→ 提交金额（最小货币单位）：数量 ÷ 比例 折回主单位；界面只显示数量，不显示等值货币。 */
const refundMinor = computed(() => tokensToMinor(refundForm.value.tokens || 0, tokenRatio.value))

/**
 * 流水行的代币数量：服务端 `tokenAmount` 优先（金额 ÷ 100 × 租户比例，四舍五入），
 * 缺字段按本行金额降级换算。金额字段（amount/balanceAfter）仍是「这笔钱」的最小货币单位，
 * 但**按储值口径只展示数量**：代币不是货币，界面不出现货币符号/币种（16_CURRENCY_CONVENTIONS §9）。
 */
function ledgerTokenCount(row) {
  return resolveTokenCount(row?.tokenAmount, row?.amount, tokenRatio.value)
}

/** 变动后的代币数量（余额字段是最小货币单位金额 → 按同一公式折成数量）。 */
function ledgerBalanceCount(row) {
  return resolveTokenCount(undefined, row?.balanceAfter, tokenRatio.value)
}

async function loadConfig() {
  try {
    const cfg = await getWalletTokenConfig(contextStore.tenantId)
    if (cfg) {
      tokenName.value = resolveWalletBrandName(cfg)
      tokenRatio.value = resolveTokenRatio(cfg.ratio)
    }
  } catch { /* 用默认值 */ }
}

async function checkGrant() {
  try {
    const list = await listPaymentMethods('admin')
    const arr = Array.isArray(list) ? list : (list && list.items) || []
    const w = arr.find((x) => x.method === 'WALLET')
    walletGranted.value = !!(w && w.tenantAllowed)
  } catch {
    walletGranted.value = false
  }
}

/**
 * 客户储值列表：**一次**分页请求（服务端一次批量余额查询），不再逐会员拉钱包。
 * 服务端对「没有储值账户」的会员返回余额 0 + accountOpened=false，界面显示「未开立」。
 */
async function load() {
  loading.value = true
  try {
    const data = await listMemberWallets({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      ...dateRangeParams(range.value),
    })
    const list = Array.isArray(data) ? data : (data && (data.records || data.items || data.list)) || []
    total.value = Number((data && data.total) ?? list.length) || 0
    rows.value = list.map((row) => ({
      ...row,
      // 充值与退还按**会员 ID**提交（储值账户属会员、属租户，与门店无关）。
      id: row.memberId,
      balance: row.availableAmount ?? 0,
      tokenCount: resolveTokenCount(row.tokenAmount, row.availableAmount, tokenRatio.value),
      opened: row.accountOpened !== false,
    }))
  } catch (e) {
    rows.value = []
    total.value = 0
    notifyAdminRequestError(e, '加载客户储值失败')
  } finally {
    loading.value = false
  }
}

function search() {
  // 查询入口统一守一道门：区间倒挂时只提示、不发请求（后端也会兜 400）。
  const warning = dateRangeWarning(range.value)
  if (warning) { ElMessage.warning(warning); return }
  page.value = 1
  load()
}

function onPageChange(next) {
  page.value = next
  load()
}

function onPageSizeChange(size) {
  pageSize.value = size
  page.value = 1
  load()
}

/** 储值流水（真实账本）：按客户分页查询，没有账户时返回空页（不是错误）。 */
async function loadLedger() {
  if (!current.value?.id) return
  ledgerLoading.value = true
  try {
    const data = await getMemberWalletLedger(current.value.id, {
      page: ledgerPage.value,
      pageSize: ledgerPageSize,
    })
    const list = Array.isArray(data) ? data : (data && (data.records || data.items || data.list)) || []
    ledgerRows.value = list
    ledgerTotal.value = Number((data && data.total) ?? list.length) || 0
  } catch (e) {
    ledgerRows.value = []
    ledgerTotal.value = 0
    notifyAdminRequestError(e, '加载储值流水失败')
  } finally {
    ledgerLoading.value = false
  }
}

async function openLedger(row) {
  current.value = row
  ledgerRows.value = []
  ledgerTotal.value = 0
  ledgerPage.value = 1
  ledgerVisible.value = true
  await loadLedger()
}

function onLedgerPageChange(next) {
  ledgerPage.value = next
  loadLedger()
}

function openRecharge(row) {
  current.value = row
  rechargeForm.value = { amountYuan: 0, paymentMethod: 'CASH', referenceNo: '' }
  rechargeVisible.value = true
}
function openRefund(row) {
  current.value = row
  refundForm.value = { tokens: 0, reason: '' }
  refundVisible.value = true
}
function openConfig() {
  configForm.value = { brandName: tokenName.value, ratio: tokenRatio.value }
  configVisible.value = true
}

async function doRecharge() {
  const amountYuan = Number(rechargeForm.value.amountYuan || 0)
  if (!(amountYuan > 0)) { ElMessage.warning('充值金额需大于 0'); return }
  saving.value = true
  try {
    await walletRecharge(current.value.id, {
      // 后端 amount 是最小货币单位整数（cst_wallet_account.available_amount / cst_wallet_ledger.amount 同口径），
      // 表单以主单位输入（与全站同一口径），提交前统一走 yuanToFen；代币比例只用于展示，不参与落库金额。
      amount: yuanToFen(amountYuan),
      // 写路径币种取全局唯一来源：钱包账本按币种隔离，页面不得写死
      currency: currencyStore.code,
      paymentMethod: rechargeForm.value.paymentMethod,
      referenceNo: rechargeForm.value.referenceNo || null,
    })
    ElMessage.success('充值成功')
    rechargeVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '充值失败')
  } finally {
    saving.value = false
  }
}

async function doRefund() {
  const tokens = Math.round(refundForm.value.tokens || 0)
  if (tokens <= 0) { ElMessage.warning('退还数量需大于 0'); return }
  saving.value = true
  try {
    // 退还同样按最小货币单位整数提交：退还的代币数量先按租户比例折回主单位金额，再换算成最小单位；
    // 界面只显示退还数量，不显示等值货币（代币不是货币）。
    await walletRefund(current.value.id, { amount: refundMinor.value, reason: refundForm.value.reason || null })
    ElMessage.success('退还成功')
    refundVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '退还失败')
  } finally {
    saving.value = false
  }
}

async function saveConfig() {
  if (!configForm.value.brandName) { ElMessage.warning('请填写代币名称'); return }
  if (!configForm.value.ratio || configForm.value.ratio <= 0) { ElMessage.warning('比例需大于 0'); return }
  saving.value = true
  try {
    await updateWalletTokenConfig({
      tenantId: contextStore.tenantId,
      brandName: configForm.value.brandName,
      ratio: configForm.value.ratio,
    })
    tokenName.value = configForm.value.brandName
    tokenRatio.value = resolveTokenRatio(configForm.value.ratio)
    ElMessage.success('已保存代币配置')
    configVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadConfig()
  await checkGrant()
  if (walletGranted.value) load()
})
</script>

<style scoped>
.page-desc { font-size: 13px; color: var(--el-text-color-secondary); }
.filter-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; min-width: 0; }
.filter-bar .muted { font-size: 12px; color: var(--el-text-color-secondary); }
.wallet-pager { margin-top: 12px; justify-content: flex-end; }
.ratio-line { display: flex; align-items: center; gap: 8px; }
.converted { color: var(--el-color-primary); font-weight: 700; }
.muted { color: var(--el-text-color-secondary); }
</style>
