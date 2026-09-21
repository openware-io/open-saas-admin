<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>KTV 配置</h2>
      <span class="page-desc">计价方案 / 服务人员 / 支付开关（租户后台）</span>
      <!-- 储值是租户级、跨门店共用的资产，不在 KTV 配置里再开一套充值入口：统一去「储值管理」。 -->
      <el-button link type="primary" class="wallet-entry" @click="goWallet">
        {{ walletBrand }}储值在「储值管理」<el-icon><ArrowRight /></el-icon>
      </el-button>
    </div>

    <el-tabs v-model="activeTab" class="ktv-tabs">
      <!-- ============ 计价方案 ============ -->
      <el-tab-pane label="计价方案" name="pricing">
        <div class="admin-card">
          <p class="tip">
            包厢费 = 房型单价 + 服务单价（C 端展示与结台收费同一口径）。
            服务单价 = 每计费单位服务费，已含 1 名标准服务人员，超出按服务人员单价另计。
          </p>
          <div class="filter-bar">
            <el-button type="primary" @click="openPricingDialog()">
              <el-icon><Plus /></el-icon>新增计价方案
            </el-button>
            <el-button @click="loadPricing">刷新</el-button>
          </div>
          <el-table :data="pricingRows" border stripe>
            <el-table-column prop="storeName" label="门店" min-width="150" />
            <el-table-column label="计费单位" width="100" align="center">
              <template #default="{ row }">{{ billingUnitText(row.billingUnit) }}</template>
            </el-table-column>
            <el-table-column label="包厢单价（每计费单位）" min-width="180" align="right">
              <template #default="{ row }">{{ formatMoney(row.roomPricePerUnit ?? firstRoomPrice(row)) }}</template>
            </el-table-column>
            <el-table-column label="递增粒度" width="100" align="center">
              <template #default="{ row }">{{ row.incrementMinutes || 30 }} {{ DURATION_LABELS.minutes }}</template>
            </el-table-column>
            <el-table-column label="舍入方向" width="130" align="center">
              <template #default="{ row }">{{ roundingDirectionText(row.roundingDirection) }}</template>
            </el-table-column>
            <el-table-column prop="defaultSessionMinutes" :label="DURATION_LABELS.defaultSessionMinutes" width="130" align="center" />
            <el-table-column prop="overtimeRate" label="超时费率" width="100" align="center" />
            <el-table-column label="服务人员单价（每递增）" width="180" align="right">
              <template #default="{ row }">{{ formatMoney(row.serverPricePerIncrement) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openPricingDialog(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- ============ 服务人员 ============ -->
      <el-tab-pane label="服务人员" name="server">
        <div class="admin-card">
          <div class="filter-bar">
            <el-button type="primary" @click="openServerDialog()">
              <el-icon><Plus /></el-icon>新增服务人员
            </el-button>
            <el-button @click="loadServer">刷新</el-button>
          </div>
          <el-table :data="serverRows" border stripe>
            <el-table-column prop="resourceCode" label="编码" width="100" />
            <el-table-column prop="name" label="姓名/花名" min-width="120" />
            <el-table-column prop="storeName" label="门店" min-width="150" />
            <el-table-column prop="status" label="状态" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="enabledStatusType(row.status)">{{ enabledStatusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="计费单位" width="100" align="center">
              <template #default="{ row }">{{ billingUnitText(row.billingUnit) }}</template>
            </el-table-column>
            <el-table-column prop="incrementMinutes" :label="DURATION_LABELS.incrementMinutes" width="130" align="center" />
            <el-table-column label="舍入方向" width="140" align="center">
              <template #default="{ row }">{{ roundingDirectionText(row.roundingDirection) }}</template>
            </el-table-column>
            <el-table-column label="单价（每递增）" width="130" align="right">
              <template #default="{ row }">{{ formatMoney(row.pricePerIncrement) }}</template>
            </el-table-column>
            <el-table-column prop="participatePromotion" label="参与优惠" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.participatePromotion ? 'success' : 'info'">{{ row.participatePromotion ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <!--
              反向关联：服务型商品（商品管理里 itemType=SERVICE）通过 ord_product.server_resource_id
              指向这里的服务人员；本列把「这个人在卖哪个服务商品」显示出来，避免两侧各看一半。
            -->
            <el-table-column label="关联服务型商品" min-width="150">
              <template #default="{ row }">
                <span v-if="boundProductText(row)">{{ boundProductText(row) }}</span>
                <span v-else class="muted">未关联（在「商品管理」新增服务型商品时选择该服务人员）</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openServerDialog(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- ============ 支付开关 ============ -->
      <el-tab-pane label="支付开关" name="payment">
        <div class="admin-card">
          <div class="filter-bar">
            <span class="muted">仅展示平台已授权的线上渠道（支付宝 / 微信支付 / Stripe）；未授权渠道不显示。现金 / {{ walletBrand }} / 积分不依赖渠道配置。</span>
          </div>
          <el-empty v-if="!paymentForm.channels.length" description="暂无平台授权的线上支付渠道" :image-size="80" />
          <el-table v-else :data="paymentForm.channels" border stripe>
            <el-table-column prop="name" label="渠道" width="140" />
            <el-table-column label="启用" width="100" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="退款启用" width="120" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.refundEnabled" />
              </template>
            </el-table-column>
            <el-table-column label="最小单笔" width="160" align="center">
              <template #default="{ row }">
                <el-input-number v-model="row.minAmount" :min="0" :precision="2" :step="100" controls-position="right" style="width: 130px" />
              </template>
            </el-table-column>
            <el-table-column label="最大单笔" width="160" align="center">
              <template #default="{ row }">
                <el-input-number v-model="row.maxAmount" :min="0" :precision="2" :step="100" controls-position="right" style="width: 130px" />
              </template>
            </el-table-column>
          </el-table>
          <div class="filter-bar">
            <el-button type="primary" @click="savePayment">保存支付开关</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ 营业时间 ============ -->
      <el-tab-pane label="营业时间" name="hours">
        <div class="admin-card">
          <p class="tip">
            KTV 是夜间业态，默认营业时间 <b>18:00 – 次日 05:00</b>（跨自然日）。<b>预约到店时间必须落在营业时段内</b>：
            这条规则由服务端在所有预约入口统一校验（C 端下单、B 端/后台代客预约都一样），
            本页只维护那一份配置。门店未单独配置时继承租户默认；判定为左闭右开（18:00 可约、05:00 已打烊）。
          </p>
          <el-alert
            v-if="effectiveHours"
            class="hours-effective"
            type="info"
            :closable="false"
            show-icon
            :title="`当前门店生效营业时间：${effectiveHours.displayText}（${
              effectiveHours.source === 'STORE' ? '门店已单独配置'
                : effectiveHours.source === 'TENANT' ? '继承租户默认' : '系统缺省值'
            }）`"
          />

          <el-divider content-position="left">租户默认（所有未单独配置的门店继承）</el-divider>
          <div class="hours-row">
            <span class="hours-label">开始营业</span>
            <el-time-select v-model="tenantHoursForm.openTime" start="00:00" step="00:30" end="23:30" placeholder="18:00" />
            <span class="hours-label">打烊（次日）</span>
            <el-time-select v-model="tenantHoursForm.closeTime" start="00:00" step="00:30" end="23:30" placeholder="05:00" />
            <el-button type="primary" :loading="hoursSaving" @click="saveBusinessHours('TENANT')">保存租户默认</el-button>
          </div>

          <el-divider content-position="left">当前门店覆盖（留空/不保存即继承租户默认）</el-divider>
          <div class="hours-row">
            <span class="hours-label">开始营业</span>
            <el-time-select v-model="storeHoursForm.openTime" start="00:00" step="00:30" end="23:30" placeholder="18:00" />
            <span class="hours-label">打烊（次日）</span>
            <el-time-select v-model="storeHoursForm.closeTime" start="00:00" step="00:30" end="23:30" placeholder="05:00" />
            <el-button type="primary" :loading="hoursSaving" @click="saveBusinessHours('STORE')">保存本门店</el-button>
          </div>
          <p class="tip">
            跨自然日直接按「开始 &gt; 打烊」填即可（例如 18:00 与 05:00）；两者相同表示全天营业。
            修改营业时间**不会**改动已有预约：历史预约如果落在新时段之外，会在「预约管理」里标注出来。
          </p>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 计价方案 编辑弹窗 -->
    <el-dialog v-model="pricingDialogVisible" title="计价方案" width="560px">
      <el-form label-width="150px">
        <el-form-item label="门店"><el-input v-model="pricingForm.storeName" placeholder="门店名称" /></el-form-item>
        <el-form-item label="计费单位">
          <el-select v-model="pricingForm.billingUnit" style="width: 100%">
            <el-option label="按小时" value="HOUR" />
            <el-option label="按半小时" value="HALF_HOUR" />
            <el-option label="套餐" value="PACKAGE" />
          </el-select>
        </el-form-item>
        <el-form-item :label="withCurrencyLabel('包厢单价')">
          <el-input-number v-model="pricingForm.roomPriceYuan" :min="0" :precision="2" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="DURATION_LABELS.incrementMinutes">
          <el-select v-model="pricingForm.incrementMinutes" style="width: 100%">
            <el-option label="15 分钟" :value="15" />
            <el-option label="30 分钟" :value="30" />
            <el-option label="60 分钟" :value="60" />
          </el-select>
        </el-form-item>
        <el-form-item label="舍入方向">
          <el-select v-model="pricingForm.roundingDirection" style="width: 100%">
            <el-option label="让利消费者（不足一档不计费）" value="CONSUMER_FAVOR" />
            <el-option label="向上取整（不足一档按一档）" value="ROUND_UP" />
            <el-option label="封顶" value="FLOOR_BLOCK" />
          </el-select>
        </el-form-item>
        <el-form-item label="标准时长（分钟）"><el-input-number v-model="pricingForm.defaultSessionMinutes" :min="0" :step="30" style="width: 100%" /></el-form-item>
        <el-form-item label="超时费率"><el-input-number v-model="pricingForm.overtimeRate" :min="0" :step="0.1" :precision="2" style="width: 100%" /></el-form-item>
        <el-form-item :label="withCurrencyLabel('服务人员单价')">
          <el-input-number v-model="pricingForm.serverPriceYuan" :min="0" :precision="2" :step="5" style="width: 100%" />
        </el-form-item>
        <el-alert type="info" :closable="false" show-icon title="价格按当前币种填写，例如每小时 100 就填 100；系统内部会换算成最小货币单位。" />
      </el-form>
      <template #footer>
        <el-button @click="pricingDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePricing">保存</el-button>
      </template>
    </el-dialog>

    <!-- 服务人员 编辑弹窗 -->
    <el-dialog v-model="serverDialogVisible" title="服务人员" width="520px">
      <el-form label-width="120px">
        <el-form-item label="编码"><el-input v-model="serverForm.resourceCode" placeholder="如 S01" /></el-form-item>
        <el-form-item label="姓名/花名"><el-input v-model="serverForm.name" placeholder="服务人员姓名" /></el-form-item>
        <el-form-item label="门店"><el-input v-model="serverForm.storeName" placeholder="门店名称" /></el-form-item>
        <el-form-item label="计费单位">
          <el-select v-model="serverForm.billingUnit" style="width: 100%">
            <el-option label="小时" value="HOUR" />
            <el-option label="半小时" value="HALF_HOUR" />
          </el-select>
        </el-form-item>
        <el-form-item :label="DURATION_LABELS.incrementMinutes">
          <el-select v-model="serverForm.incrementMinutes" style="width: 100%">
            <el-option label="15 分钟" :value="15" />
            <el-option label="30 分钟" :value="30" />
            <el-option label="60 分钟" :value="60" />
          </el-select>
        </el-form-item>
        <el-form-item label="舍入方向">
          <el-select v-model="serverForm.roundingDirection" style="width: 100%">
            <el-option label="让利消费者" value="CONSUMER_FAVOR" />
            <el-option label="向上取整" value="ROUND_UP" />
            <el-option label="封顶" value="FLOOR_BLOCK" />
          </el-select>
        </el-form-item>
        <el-form-item :label="withCurrencyLabel('单价')"><el-input-number v-model="serverForm.priceYuan" :min="0" :precision="2" :step="5" style="width: 100%" /></el-form-item>
        <el-form-item label="参与优惠"><el-switch v-model="serverForm.participatePromotion" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="serverDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveServer">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getPricingPlans,
  createPricingPlan,
  updatePricingPlan,
  getPaymentSwitches,
  createPaymentSwitch,
  getServerCatalog,
  createServerCatalogItem,
  updateServerCatalogItem
} from '@/api/ktv'
import { listPaymentMethodGrants } from '@/api/payment'
import { listProducts } from '@/api/order'
import { getWalletTokenConfig, getBusinessHours, updateBusinessHours } from '@/api/admin'
import { PAYMENT_METHODS } from '@/constants/payment-methods'
import { fenToYuan, formatMoney, withCurrencyLabel, yuanToFen } from '@/utils/format'
import { DEFAULT_BUSINESS_HOURS, parseBusinessHours } from '@/utils/businessHours'
import {
  DURATION_LABELS,
  WALLET_BRAND_NAME_DEFAULT,
  billingUnitText,
  enabledStatusText,
  enabledStatusType,
  resolveWalletBrandName,
  roundingDirectionText,
} from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { useContextStore } from '@/stores/context'
import { useCurrencyStore } from '@/stores/currency'
import { useRouter } from 'vue-router'

const activeTab = ref('pricing')
const router = useRouter()
const contextStore = useContextStore()
// 全局币种（唯一来源）：写请求体的 currencyCode 取它（后端按「收款币种 = 订单币种」校验）。
const currencyStore = useCurrencyStore()
const loadError = ref('')
/**
 * 储值展示名取租户配置（tnt_tenant_config.wallet_brand_name），缺配置走 constants/terms 的唯一默认值。
 * 本页只用它做「去储值管理」的入口文案：储值是租户级、跨门店共用的资产，
 * 充值/退还/流水统一在「储值管理」页维护，KTV 配置不再重复一套入口。
 */
const walletBrand = ref(WALLET_BRAND_NAME_DEFAULT)

/** 跳转「储值管理」（租户级页面，与门店上下文无关）。 */
function goWallet() {
  router.push('/business/wallet')
}

// 服务人员启用状态、计费单位与舍入方向的中文词表统一放在 constants/terms，页面不再各写一份。

// —— 计价方案（价格一律以主单位交互，提交前换算成最小货币单位） ——
const pricingRows = ref([])
const pricingDialogVisible = ref(false)
const pricingForm = ref(emptyPricing())

function firstRoomPrice(row) {
  const map = row?.unitPriceByRoomType || {}
  const values = Object.values(map)
  return values.length ? values[0] : 0
}

function emptyPricing() {
  return {
    id: null,
    storeId: null,
    storeName: '',
    billingUnit: 'HOUR',
    roomPriceYuan: 0,
    incrementMinutes: 30,
    roundingDirection: 'CONSUMER_FAVOR',
    overtimeRate: 1.0,
    defaultSessionMinutes: 120,
    serverPriceYuan: 0
  }
}

async function loadPricing() {
  try {
    pricingRows.value = await getPricingPlans()
  } catch (e) {
    pricingRows.value = []
    loadError.value = '计价方案加载失败'
  }
}

/** 后端返回最小货币单位，编辑时换算成主单位（当前币种）展示。 */
function openPricingDialog(row) {
  if (!row) {
    pricingForm.value = emptyPricing()
  } else {
    pricingForm.value = {
      id: row.id,
      storeId: row.storeId,
      storeName: row.storeName || '',
      billingUnit: row.billingUnit || 'HOUR',
      roomPriceYuan: fenToYuan(row.roomPricePerUnit ?? firstRoomPrice(row)),
      incrementMinutes: row.incrementMinutes || 30,
      roundingDirection: row.roundingDirection || 'CONSUMER_FAVOR',
      overtimeRate: Number(row.overtimeRate ?? 1),
      defaultSessionMinutes: row.defaultSessionMinutes || 120,
      serverPriceYuan: fenToYuan(row.serverPricePerIncrement)
    }
  }
  pricingDialogVisible.value = true
}

async function savePricing() {
  if (!contextStore.storeId) { ElMessage.error('请先选择门店'); return }
  if (!(Number(pricingForm.value.roomPriceYuan) > 0)) { ElMessage.error('包厢单价需大于 0'); return }
  const roomMinor = yuanToFen(pricingForm.value.roomPriceYuan)
  const serverMinor = yuanToFen(pricingForm.value.serverPriceYuan)
  const data = {
    id: pricingForm.value.id,
    storeId: contextStore.storeId,
    storeName: pricingForm.value.storeName,
    billingUnit: pricingForm.value.billingUnit,
    // 金额统一换成最小货币单位后再提交（主单位 → 最小货币单位）
    roomPricePerUnit: roomMinor,
    unitPriceByRoomType: { 标准: roomMinor },
    incrementMinutes: pricingForm.value.incrementMinutes,
    roundingDirection: pricingForm.value.roundingDirection,
    overtimeRate: Number(pricingForm.value.overtimeRate),
    defaultSessionMinutes: pricingForm.value.defaultSessionMinutes,
    serverPricePerIncrement: serverMinor,
    serverBillingUnit: pricingForm.value.billingUnit === 'HALF_HOUR' ? 'HALF_HOUR' : 'HOUR',
    serverIncrementMinutes: pricingForm.value.incrementMinutes,
    serverRoundingDirection: pricingForm.value.roundingDirection
  }
  try {
    if (data.id) {
      await updatePricingPlan(data.id, data)
    } else {
      await createPricingPlan(data)
    }
    pricingDialogVisible.value = false
    ElMessage.success('已保存')
    await loadPricing()
  } catch (e) {
    notifyAdminRequestError(e, '保存失败')
  }
}

// —— 服务人员 ——
const serverRows = ref([])
const serverDialogVisible = ref(false)
const serverForm = ref(emptyServer())
/** 服务型商品按 serverResourceId 建索引：服务人员行显示「关联服务型商品」。 */
const productByServerResource = ref({})

function emptyServer() {
  return {
    id: null,
    storeId: null,
    storeName: '',
    resourceCode: '',
    name: '',
    status: 'ENABLED',
    billingUnit: 'HOUR',
    incrementMinutes: 30,
    roundingDirection: 'CONSUMER_FAVOR',
    priceYuan: 0,
    participatePromotion: false
  }
}

/** 该服务人员当前被哪个服务型商品关联（商品管理里单选，服务端唯一键兜底）。 */
function boundProductText(row) {
  const product = row && row.id != null ? productByServerResource.value[String(row.id)] : null
  return product ? (product.name || '商品 #' + product.id) : ''
}

/**
 * 服务型商品列表（`ord_product.itemType=SERVICE`）→ `serverResourceId → 商品` 映射。
 * 只为反查展示，失败不影响服务人员配置页（退回「未关联」）。
 */
async function loadBoundProducts() {
  try {
    const data = await listProducts({ storeId: contextStore.storeId, page: 1, pageSize: 200 })
    const list = Array.isArray(data) ? data : (data && (data.records || data.items)) || []
    const map = {}
    list.forEach((product) => {
      if (product && product.serverResourceId != null) map[String(product.serverResourceId)] = product
    })
    productByServerResource.value = map
  } catch (e) {
    productByServerResource.value = {}
  }
}

async function loadServer() {
  try {
    serverRows.value = await getServerCatalog()
  } catch (e) {
    serverRows.value = []
    loadError.value = '服务人员配置加载失败'
  }
  await loadBoundProducts()
}

function openServerDialog(row) {
  // 单价以主单位交互，后端收最小货币单位
  serverForm.value = row ? { ...row, priceYuan: fenToYuan(row.pricePerIncrement) } : emptyServer()
  serverDialogVisible.value = true
}

async function saveServer() {
  if (!contextStore.storeId) { ElMessage.error('请先选择门店'); return }
  const data = {
    ...serverForm.value,
    storeId: contextStore.storeId,
    // 主单位 → 最小货币单位
    pricePerIncrement: yuanToFen(serverForm.value.priceYuan)
  }
  try {
    if (data.id) {
      await updateServerCatalogItem(data.id, data)
    } else {
      await createServerCatalogItem(data)
    }
    serverDialogVisible.value = false
    ElMessage.success('已保存')
    await loadServer()
  } catch (e) {
    notifyAdminRequestError(e, '保存失败')
  }
}

// —— 支付开关 ——
// 渠道列表不再写死：只展示平台已授权（tenantAllowed）的线上渠道；未授权一律不显示。
const ONLINE_CHANNELS = ['ALIPAY', 'WECHAT', 'STRIPE']
const paymentForm = ref({
  id: null,
  storeId: null,
  storeName: '',
  merchantAccountId: null,
  currencyCode: '',
  channels: []
})

async function loadPayment() {
  try {
    // 1) 平台已授权（granted）的支付方式
    const grants = await listPaymentMethodGrants(contextStore.tenantId)
    const list = Array.isArray(grants) ? grants : (grants && grants.items) || []
    const grantMap = Object.fromEntries(list.map((g) => [g.method, g]))
    const grantedOnline = ONLINE_CHANNELS.filter((m) => grantMap[m] && grantMap[m].granted === 1)
    const nameMap = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.method, m.name]))
    // 2) 已保存的渠道配置（启用/退款/限额），按 channel 对齐
    const cfgMap = {}
    let cfg = {}
    try {
      const list = await getPaymentSwitches()
      cfg = (Array.isArray(list) && list.length) ? list[0] : {}
      ;((cfg && cfg.channels) || []).forEach((c) => { cfgMap[c.channel] = c })
    } catch (e) { /* 无配置则用默认 */ }
    // 3) 只展示已授权的线上渠道，配置缺失时用默认关闭值
    paymentForm.value = {
      ...paymentForm.value,
      id: cfg.id || null,
       storeId: cfg.storeId || contextStore.storeId || null,
      merchantAccountId: cfg.merchantAccountId || null,
      // 支付开关的币种与全局币种同源（后端按上下文租户校验），页面不再写死
      currencyCode: cfg.currencyCode || currencyStore.code,
      channels: grantedOnline.map((method) => ({
        channel: method,
        name: nameMap[method] || method,
        enabled: cfgMap[method]?.enabled ?? false,
        refundEnabled: cfgMap[method]?.refundEnabled ?? false,
        // 后端限额是最小货币单位整数（PaymentSwitchConfig.PaymentChannelSwitch），界面一律以主单位交互。
        minAmount: fenToYuan(cfgMap[method]?.minAmount ?? 1),
        maxAmount: fenToYuan(cfgMap[method]?.maxAmount ?? 500000),
      })),
    }
  } catch (e) {
    // 加载失败：清空，不展示任何未授权渠道
    paymentForm.value.channels = []
  }
}

async function savePayment() {
  if (!contextStore.storeId) { ElMessage.error('请先选择门店'); return }
  try {
    // 限额以主单位交互，提交前换算成最小货币单位整数（与计价方案、储值充值同一口径）。
    const payload = {
      ...paymentForm.value,
      storeId: contextStore.storeId,
      // 已保存配置带币种时沿用它，否则取全局当前币种（写路径不写死、也不会漏字段）
      currencyCode: paymentForm.value.currencyCode || currencyStore.code,
      channels: (paymentForm.value.channels || []).map((channel) => ({
        ...channel,
        minAmount: yuanToFen(channel.minAmount),
        maxAmount: yuanToFen(channel.maxAmount),
      })),
    }
    await createPaymentSwitch(payload)
    ElMessage.success('支付开关已保存')
  } catch (e) {
    notifyAdminRequestError(e, '保存失败')
  }
}

/**
 * 储值展示名：只认租户配置，缺配置回落 constants/terms 的唯一默认值。
 * 储值本身不在这里维护（见 goWallet），本页只用它渲染入口文案。
 */
async function loadWalletBrand() {
  try {
    const cfg = await getWalletTokenConfig(contextStore.tenantId)
    walletBrand.value = resolveWalletBrandName(cfg)
  } catch (e) { /* 读取失败用 constants/terms 的默认展示名 */ }
}

// —— 营业时间（门店级覆盖租户默认；预约到店时间由服务端按它校验）——
const hoursSaving = ref(false)
/** 当前门店上下文（营业时间是门店级配置，门店覆盖行写在它上面）。 */
const currentStoreId = computed(() => contextStore.storeId)
/** 当前门店生效值（含 source，用来告诉运营「这是继承来的还是本店配的」）。 */
const effectiveHours = ref(null)
const tenantHoursForm = ref({ openTime: DEFAULT_BUSINESS_HOURS.openTime, closeTime: DEFAULT_BUSINESS_HOURS.closeTime })
const storeHoursForm = ref({ openTime: DEFAULT_BUSINESS_HOURS.openTime, closeTime: DEFAULT_BUSINESS_HOURS.closeTime })

/** 一次拉两份：当前门店生效值（含继承来源）与租户默认值（租户默认编辑框的初值）。 */
async function loadBusinessHours() {
  try {
    const [tenant, store] = await Promise.all([
      getBusinessHours(0),
      currentStoreId.value ? getBusinessHours(currentStoreId.value) : Promise.resolve(null),
    ])
    const tenantHours = parseBusinessHours(tenant)
    tenantHoursForm.value = { openTime: tenantHours.openTime, closeTime: tenantHours.closeTime }
    const effective = parseBusinessHours(store || tenant)
    effectiveHours.value = effective
    // 门店编辑框：门店已单独配置则回显门店值，否则以租户默认作为起点（保存即覆盖）
    const source = store ? parseBusinessHours(store) : tenantHours
    storeHoursForm.value = { openTime: source.openTime, closeTime: source.closeTime }
  } catch (e) {
    effectiveHours.value = null
    /* 读不到就保持缺省展示，不阻断本页其它配置 */
  }
}

/** 保存营业时间：scope = TENANT 写租户默认（storeId=0），STORE 写当前门店覆盖。 */
async function saveBusinessHours(scope) {
  const form = scope === 'TENANT' ? tenantHoursForm.value : storeHoursForm.value
  if (!form.openTime || !form.closeTime) {
    ElMessage.warning('请选择开始营业时间与打烊时间')
    return
  }
  if (scope === 'STORE' && !currentStoreId.value) {
    ElMessage.warning('请先在顶部选择门店上下文')
    return
  }
  hoursSaving.value = true
  try {
    await updateBusinessHours({
      storeId: scope === 'TENANT' ? 0 : currentStoreId.value,
      openTime: form.openTime,
      closeTime: form.closeTime,
    })
    ElMessage.success(scope === 'TENANT' ? '已保存租户默认营业时间' : '已保存本门店营业时间')
    await loadBusinessHours()
  } catch (e) {
    notifyAdminRequestError(e, '保存营业时间失败')
  } finally {
    hoursSaving.value = false
  }
}

onMounted(() => {
  loadPricing()
  loadServer()
  loadPayment()
  loadWalletBrand()
  loadBusinessHours()
})
</script>

<style scoped>
.page-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.tip {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.ktv-tabs {
  margin-top: 4px;
}
.tag-chip {
  display: inline-block;
  margin-right: 8px;
  padding: 0 8px;
  line-height: 22px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.muted {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
/* 储值入口：储值是租户级资产，本页只留跳转，不再自带充值表单。 */
.wallet-entry {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
/* 营业时间：两行配置（租户默认 / 本门店覆盖）在同一页并排可读。 */
.hours-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hours-row .hours-label { color: var(--el-text-color-secondary); font-size: 13px; }
.hours-effective { margin-bottom: 8px; }
</style>
