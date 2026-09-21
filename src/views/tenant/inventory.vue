<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>仓库管理</h2>
      <div class="header-actions">
        <el-button @click="reload"><el-icon><Refresh /></el-icon>刷新</el-button>
        <el-button type="primary" :disabled="!storeId" @click="openMaterial"><el-icon><Plus /></el-icon>新增物料</el-button>
      </div>
    </div>

    <el-alert v-if="!storeId" class="store-hint" type="warning" show-icon :closable="false"
      title="仓库按门店管理，请先在右上角切换器中选择门店上下文。" />

    <div class="admin-card">
      <div class="filter-bar">
        <!-- 物料创建时间：from/to 是闭区间，结束端由后端收口到当天 23:59:59 -->
        <DateRangeFilter v-model="materialQuery.range" />
        <el-input v-model="materialQuery.keyword" placeholder="物料名称 / 编码" clearable style="width: 200px" @keyup.enter="searchMaterials" />
        <el-input v-model="materialQuery.category" placeholder="分类" clearable style="width: 140px" @keyup.enter="searchMaterials" />
        <el-select v-model="materialQuery.status" clearable placeholder="全部状态" style="width: 140px" @change="searchMaterials">
          <el-option label="启用" value="ACTIVE" />
          <el-option label="停用" value="INACTIVE" />
        </el-select>
        <el-button type="primary" @click="searchMaterials">查询</el-button>
        <el-button @click="resetMaterials">重置</el-button>
      </div>
      <p class="tip">「入库」用于采购/进货登记；「出库」用于报损、领用等手工调整。销售出库由点单消费自动记账，无需手工操作。</p>
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column prop="materialCode" label="物料编码" width="150" />
        <el-table-column label="图片" width="110">
          <template #default="{ row }">
            <div class="image-cell">
              <el-image
                v-if="mainImage(row)"
                :src="mainImage(row)"
                :preview-src-list="images(row)"
                :initial-index="0"
                fit="cover"
                class="image-thumb"
                preview-teleported
              />
              <span v-else class="image-empty">—</span>
              <span v-if="images(row).length > 1" class="image-count">共 {{ images(row).length }} 张</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '—' }}</template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="110" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="onHandQty" label="库存" width="110" />
        <el-table-column prop="safetyStock" label="安全库存" width="110" />
        <el-table-column prop="purchasePrice" :label="withCurrencyLabel('采购价')" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.purchasePrice) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="success" size="small" @click="openStock(row, 'IN')">入库</el-button>
            <el-button link type="warning" size="small" @click="openStock(row, 'OUT')">出库</el-button>
            <el-button link type="primary" size="small" @click="showTransactions(row)">流水</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty :description="materialEmptyText" /></template>
      </el-table>
      <div class="admin-pagination">
        <el-pagination
          layout="total, prev, pager, next, sizes"
          :total="materialTotal"
          v-model:current-page="materialQuery.page"
          v-model:page-size="materialQuery.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="loadMaterials"
          @size-change="searchMaterials"
        />
      </div>
    </div>

    <div class="admin-card">
      <div class="card-header">
        <h3>库存成本</h3>
        <div class="header-actions">
          <el-button @click="loadCosts">刷新</el-button>
        </div>
      </div>
      <div class="filter-bar">
        <el-input v-model="costQuery.keyword" placeholder="物料名称 / 编码" clearable style="width: 200px" @keyup.enter="searchCosts" />
        <el-button type="primary" @click="searchCosts">查询</el-button>
        <el-button @click="resetCosts">重置</el-button>
      </div>
      <p class="tip">库存成本 = 结存数量 × 移动加权平均成本（结存口径，非期间发生额）；成本按成本调整或入库批次单价加权得出。</p>
      <el-alert
        v-if="costsMixedCurrency"
        class="store-hint"
        type="warning"
        show-icon
        :closable="false"
        :title="MIXED_CURRENCY_NOTICE"
        description="当前门店库存存在多种币种，已按币种分行展示；不同币种的库存成本不得相加。"
      />
      <el-table :data="costs" v-loading="costLoading" border stripe>
        <el-table-column prop="materialCode" label="物料编码" width="150" />
        <el-table-column prop="materialName" label="物料" min-width="140">
          <template #default="{ row }">{{ row.materialName || '—' }}</template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="80">
          <template #default="{ row }">{{ row.unit || '—' }}</template>
        </el-table-column>
        <el-table-column label="结存数量" width="110" align="right">
          <template #default="{ row }">{{ formatQuantity(row.onHandQty) }}</template>
        </el-table-column>
        <el-table-column :label="withCurrencyLabel('平均成本')" width="130" align="right">
          <template #default="{ row }">{{ costCellText(row.avgCost, row.currencyCode) }}</template>
        </el-table-column>
        <el-table-column :label="withCurrencyLabel('库存成本')" width="130" align="right">
          <template #default="{ row }">{{ costCellText(row.inventoryCost, row.currencyCode) }}</template>
        </el-table-column>
        <el-table-column label="币种" width="100" align="center">
          <template #default="{ row }">{{ row.currencyCode ? currencyText(row.currencyCode) : '—' }}</template>
        </el-table-column>
        <template #empty><el-empty :description="costEmptyText" /></template>
      </el-table>
      <div class="admin-pagination">
        <el-pagination
          layout="total, prev, pager, next, sizes"
          :total="costTotal"
          v-model:current-page="costQuery.page"
          v-model:page-size="costQuery.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="loadCosts"
          @size-change="searchCosts"
        />
      </div>
      <div v-if="costsAsOf" class="tip">
        数据时点：{{ formatTime(costsAsOf) }}；本次命中 {{ costTotal }} 条物料，币种口径按全部命中行判定（不是仅当前页）。
      </div>
    </div>

    <div class="admin-card">
      <div class="card-header">
        <h3>出入库记录</h3>
        <div class="header-actions">
          <el-button @click="loadTransactions">刷新</el-button>
        </div>
      </div>
      <div class="filter-bar">
        <el-select v-model="transactionQuery.materialId" clearable placeholder="全部物料" style="width: 200px" @change="searchTransactions">
          <el-option v-for="item in materialOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="transactionQuery.transactionType" clearable placeholder="全部类型" style="width: 150px" @change="searchTransactions">
          <el-option v-for="item in transactionTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="transactionQuery.sourceType" clearable placeholder="全部来源" style="width: 150px" @change="searchTransactions">
          <el-option v-for="item in sourceTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <!-- 流水时间（createdAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59；
             与物料页共用同一个区间控件，不再各写一份 el-date-picker。 -->
        <DateRangeFilter v-model="transactionQuery.dateRange" />
        <el-button type="primary" @click="searchTransactions">查询</el-button>
        <el-button @click="resetTransactions">重置</el-button>
      </div>
      <el-table :data="transactions" v-loading="transactionLoading" border stripe>
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="物料" min-width="140">
          <template #default="{ row }">{{ materialLabel(row.materialId) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="inventoryTransactionTypeTag(row.transactionType)">
              {{ inventoryTransactionTypeText(row.transactionType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="数量" width="100" align="right">
          <template #default="{ row }">{{ deltaText(row.quantityDelta) }}</template>
        </el-table-column>
        <el-table-column prop="quantityBefore" label="变动前" width="90" align="right" />
        <el-table-column prop="quantityAfter" label="变动后" width="90" align="right" />
        <!-- V24 新增：升级前的历史流水 unitCost/totalCost 为 NULL，显示「—」而不是 0 -->
        <el-table-column :label="withCurrencyLabel('单价')" width="120" align="right">
          <template #default="{ row }">{{ costCellText(row.unitCost, row.currencyCode) }}</template>
        </el-table-column>
        <el-table-column :label="withCurrencyLabel('成本发生额')" width="140" align="right">
          <template #default="{ row }">{{ costCellText(row.totalCost, row.currencyCode) }}</template>
        </el-table-column>
        <el-table-column label="来源" width="150">
          <template #default="{ row }">{{ sourceText(row) }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="140" show-overflow-tooltip />
        <el-table-column label="币种" width="100" align="center">
          <template #default="{ row }">{{ row.currencyCode ? currencyText(row.currencyCode) : '—' }}</template>
        </el-table-column>
        <template #empty><el-empty :description="transactionEmptyText" /></template>
      </el-table>
      <div class="admin-pagination">
        <el-pagination
          layout="total, prev, pager, next, sizes"
          :total="transactionTotal"
          v-model:current-page="transactionQuery.page"
          v-model:page-size="transactionQuery.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="loadTransactions"
          @size-change="searchTransactions"
        />
      </div>
    </div>

    <el-dialog v-model="materialDialog" :title="editingId ? '编辑物料' : '新增物料'" width="min(560px, 94vw)">
      <el-form ref="materialFormRef" :model="material" :rules="materialRules" label-width="90px" @keyup.enter="saveMaterial">
        <el-form-item label="物料编码" prop="materialCode" required>
          <el-input v-model="material.materialCode" :disabled="!!editingId" placeholder="门店内唯一，如 DRINK-001" />
        </el-form-item>
        <el-form-item label="名称" prop="name" required>
          <el-input v-model="material.name" placeholder="如 可乐 330ml" />
        </el-form-item>
        <el-form-item label="分类"><el-input v-model="material.category" /></el-form-item>
        <el-form-item label="单位"><el-input v-model="material.unit" /></el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="material.description"
            type="textarea"
            :rows="3"
            maxlength="255"
            show-word-limit
            placeholder="仓库商品的补充说明，最多 255 字"
          />
        </el-form-item>
        <el-form-item label="安全库存">
          <el-input-number v-model="material.safetyStock" :min="0" />
        </el-form-item>
        <el-form-item :label="withCurrencyLabel('采购价')">
          <el-input-number
            v-model="material.purchasePriceYuan"
            :min="0"
            :precision="2"
            :controls="false"
            placeholder="留空表示不维护"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="物料图片">
          <ItemImageUploader v-model:images="material.imageUrls" v-model:main-image="material.mainImageUrl" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="materialDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveMaterial">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="stockDialog" :title="stockMode === 'IN' ? '物料入库（采购/进货）' : '物料出库（手工调整）'" width="min(440px, 94vw)">
      <el-form ref="stockFormRef" :model="stock" :rules="stockRules" label-width="120px" @keyup.enter="saveStock">
        <el-form-item label="物料">{{ stock.materialName }}</el-form-item>
        <el-form-item label="数量" prop="quantity" required>
          <el-input-number v-model="stock.quantity" :min="0.001" :precision="3" />
        </el-form-item>
        <!-- 本次入库批次单价：参与移动加权平均（后端 unitCost）。留空/0 = 沿用物料采购价 -->
        <el-form-item v-if="stockMode === 'IN'" :label="withCurrencyLabel('本次入库单价')">
          <el-input-number
            v-model="stock.unitCostYuan"
            :min="0"
            :precision="2"
            :controls="false"
            placeholder="留空表示沿用物料采购价"
            style="width: 100%"
          />
          <div class="tip">按当前币种主单位填写每个计量单位的本次入库价格；留空表示沿用物料采购价。</div>
        </el-form-item>
        <el-form-item :label="stockMode === 'IN' ? '入库原因' : '出库原因'" prop="reason" required>
          <el-input v-model="stock.reason" :placeholder="stockMode === 'IN' ? '如：采购入库、供应商送货' : '如：报损、内部领用'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stockDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveStock">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Plus } from '@element-plus/icons-vue'
import { listInventoryMaterials, createInventoryMaterial, updateInventoryMaterial, receiveInventory, adjustInventory, listInventoryTransactions, listInventoryCosts } from '@/api/order'
import { parseImageUrls } from '@/api/media'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { dateRangeParams, dateRangeWarning, emptyDateRange, hasDateRange } from '@/utils/dateRange'
import { currencyText, formatMoney, formatQuantity, formatTime, fenToYuan, withCurrencyLabel, yuanToFen } from '@/utils/format'
import {
  INVENTORY_SOURCE_TYPE_TEXT,
  INVENTORY_TRANSACTION_TYPE_TEXT,
  inventorySourceTypeText,
  inventoryTransactionTypeTag,
  inventoryTransactionTypeText,
} from '@/constants/terms'
import { MIXED_CURRENCY_NOTICE } from '@/utils/currency-summary'
import { costCellText, withReceiptUnitCost } from '@/utils/inventory-cost'
import ItemImageUploader from '@/components/ItemImageUploader.vue'
import { useContextStore } from '@/stores/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const context = useContextStore()
const storeId = computed(() => context.storeId)

/**
 * 仓库管理（物料）/ 库存成本 / 出入库记录三块都改走服务端分页（GET 各自端点，MyBatis-Plus Page 信封）：
 *  - `query.page` / `query.pageSize` 与 el-pagination 双向绑定，切页/改每页条数重新拉取；
 *  - 点「查询」或改筛选值时把页码复位到 1（search* 系列），否则会停在第 3 页看到空列表；
 *  - `total` 用后端信封的 total（命中总条数），不是当前页条数；空结果文案区分「无数据」与「无匹配」。
 */
const materialQuery = reactive({ page: 1, pageSize: 20, keyword: '', category: '', status: '', range: emptyDateRange() })
const costQuery = reactive({ page: 1, pageSize: 20, keyword: '' })
// dateRange 沿用字段名（不改既有 ref）：值语义与 DateRangeFilter 的 v-model 完全一致。
const transactionQuery = reactive({
  page: 1, pageSize: 20, materialId: null, transactionType: '', sourceType: '', dateRange: emptyDateRange(),
})

const rows = ref([])
const loading = ref(false)
const materialTotal = ref(0)
/** 流水「物料」下拉与行内物料名回填的快照（分页下拉，见 loadMaterialOptions 的上限说明）。 */
const materialOptions = ref([])

const transactions = ref([])
const transactionLoading = ref(false)
const transactionTotal = ref(0)

// 库存成本（结算口径）：数据源 GET /api/v1/admin/inventory/costs
const costs = ref([])
const costLoading = ref(false)
const costTotal = ref(0)
const costsMixedCurrency = ref(false)
const costsAsOf = ref('')

const materialDialog = ref(false)
const stockDialog = ref(false)
const saving = ref(false)
const materialFormRef = ref()
const stockFormRef = ref()
const stockMode = ref('IN')
const editingId = ref(null)
const material = ref(emptyMaterial())
const stock = ref({ materialId: null, materialName: '', quantity: 1, reason: '', unitCostYuan: null })

/** 出库/入库类型与来源的筛选项：中文词表唯一出处是 constants/terms，页面不自建枚举映射。 */
const transactionTypeOptions = Object.entries(INVENTORY_TRANSACTION_TYPE_TEXT)
  .map(([value, label]) => ({ value, label }))
const sourceTypeOptions = Object.entries(INVENTORY_SOURCE_TYPE_TEXT)
  .map(([value, label]) => ({ value, label }))

const hasMaterialFilters = computed(() => !!(materialQuery.keyword || materialQuery.category || materialQuery.status || hasDateRange(materialQuery.range)))
const hasTransactionFilters = computed(() => !!(
  transactionQuery.materialId
  || transactionQuery.transactionType
  || transactionQuery.sourceType
  || hasDateRange(transactionQuery.dateRange)
))
const hasCostFilters = computed(() => !!costQuery.keyword)
const materialEmptyText = computed(() => (hasMaterialFilters.value ? '没有符合查询条件的物料' : '暂无物料'))
const transactionEmptyText = computed(() => (hasTransactionFilters.value ? '没有符合查询条件的出入库记录' : '暂无出入库记录'))
const costEmptyText = computed(() => (hasCostFilters.value ? '没有符合查询条件的库存成本数据' : '暂无库存成本数据'))

function emptyMaterial() {
  return {
    materialCode: '', name: '', category: '其他', unit: '份', description: '',
    safetyStock: 0, purchasePriceYuan: null, imageUrls: [], mainImageUrl: '',
  }
}

/**
 * 采购价主单位表单值 → 后端最小货币单位。
 *
 * 留空（null/undefined/空串）提交 0：后端约定「null = 不修改，0 = 清空」，0 会归一为 NULL 落库，
 * 因此无论新增还是编辑，「留空」都稳定表示「该物料不维护采购价」，不需要前端区分新建/编辑。
 */
function purchasePriceFen(yuan) {
  if (yuan === null || yuan === undefined || yuan === '') return 0
  return yuanToFen(yuan)
}

/** 列表接口的 imageUrls 可能是数组或 JSON 数组字符串。 */
function images(row) {
  return parseImageUrls(row?.imageUrls)
}

/** 主图：显式主图优先，否则退回第一张。 */
function mainImage(row) {
  const urls = images(row)
  if (row?.mainImageUrl && urls.includes(row.mainImageUrl)) return row.mainImageUrl
  return urls[0] || ''
}

// 出入库类型 / 来源的中文词表唯一出处是 constants/terms（采购入库为进，销售消费与手工调整为出，作废回补为进）。

const materialRules = {
  materialCode: [{ required: true, message: '请输入物料编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入物料名称', trigger: 'blur' }],
}
const stockRules = {
  quantity: [{ required: true, message: '请输入数量', trigger: 'blur' }],
  reason: [{ required: true, message: '请填写原因', trigger: 'blur' }],
}

function deltaText(delta) {
  const value = Number(delta || 0)
  return (value > 0 ? '+' : '') + value
}

/** 来源 = 来源类型中文 + 单据号（来源缺失回落「未知（CODE）」，不展示英文枚举）。 */
function sourceText(row) {
  const label = inventorySourceTypeText(row.sourceType)
  return row.sourceId ? `${label}（${row.sourceId}）` : label
}

function materialLabel(materialId) {
  const hit = materialOptions.value.find((item) => item.id === materialId)
    || rows.value.find((item) => item.id === materialId)
  return hit ? `${hit.name}（${hit.materialCode}）` : `#${materialId}`
}

/**
 * 物料分页列表：分页/筛选都下发到服务端，`records` 只是当前页。
 */
async function loadMaterials() {
  if (!storeId.value) {
    rows.value = []
    materialTotal.value = 0
    return
  }
  loading.value = true
  try {
    const data = await listInventoryMaterials({
      storeId: storeId.value,
      page: materialQuery.page,
      pageSize: materialQuery.pageSize,
      keyword: materialQuery.keyword || undefined,
      category: materialQuery.category || undefined,
      status: materialQuery.status || undefined,
      ...dateRangeParams(materialQuery.range),
    })
    rows.value = data?.records || []
    materialTotal.value = Number(data?.total || 0)
  } catch (e) {
    rows.value = []
    materialTotal.value = 0
    notifyAdminRequestError(e, '加载库存失败')
  } finally {
    loading.value = false
  }
}

/**
 * 流水下拉与行内物料名用的轻量快照。
 *
 * 物料接口 pageSize 上限 200（超过会回落到默认 20），下拉只取第一页：门店启用/停用物料超过 200 条时，
 * 下拉只覆盖前 200 条，未覆盖的流水行按既有兜底显示 `#物料ID`（不为了下拉去循环拉全量）。
 */
async function loadMaterialOptions() {
  if (!storeId.value) {
    materialOptions.value = []
    return
  }
  try {
    const data = await listInventoryMaterials({ storeId: storeId.value, page: 1, pageSize: 200 })
    materialOptions.value = data?.records || []
  } catch (e) {
    materialOptions.value = []
  }
}

/**
 * 库存成本（结存数量 × 移动加权平均成本），按门店/物料/币种，服务端分页。
 *
 * 混币种（`mixedCurrency=true`）与币种信封（`currencyCode`）都由服务端按**全部命中行**给出，
 * 翻页不会漂移；因此这里只逐行按行内币种渲染，不做仅当前页的合计。
 */
async function loadCosts() {
  if (!storeId.value) {
    costs.value = []
    costTotal.value = 0
    costsMixedCurrency.value = false
    costsAsOf.value = ''
    return
  }
  costLoading.value = true
  try {
    const data = await listInventoryCosts({
      storeId: storeId.value,
      page: costQuery.page,
      pageSize: costQuery.pageSize,
      keyword: costQuery.keyword || undefined,
    })
    costs.value = data?.records || []
    costTotal.value = Number(data?.total || 0)
    costsMixedCurrency.value = data?.mixedCurrency === true
    costsAsOf.value = data?.dataAsOf || ''
  } catch (e) {
    costs.value = []
    costTotal.value = 0
    costsMixedCurrency.value = false
    costsAsOf.value = ''
    notifyAdminRequestError(e, '加载库存成本失败')
  } finally {
    costLoading.value = false
  }
}

/**
 * 出入库记录：物料 / 类型 / 来源 / 时间区间都下发到服务端，区间参数统一由 `dateRangeParams()` 产出。
 */
async function loadTransactions() {
  if (!storeId.value) {
    transactions.value = []
    transactionTotal.value = 0
    return
  }
  transactionLoading.value = true
  try {
    const data = await listInventoryTransactions({
      page: transactionQuery.page,
      pageSize: transactionQuery.pageSize,
      materialId: transactionQuery.materialId || undefined,
      transactionType: transactionQuery.transactionType || undefined,
      sourceType: transactionQuery.sourceType || undefined,
      ...dateRangeParams(transactionQuery.dateRange),
    })
    transactions.value = data?.records || []
    transactionTotal.value = Number(data?.total || 0)
  } catch (e) {
    transactions.value = []
    transactionTotal.value = 0
    notifyAdminRequestError(e, '加载出入库记录失败')
  } finally {
    transactionLoading.value = false
  }
}

// 查询条件变化一律把页码复位到第 1 页，再拉取。
function searchMaterials() {
  // 查询入口统一守一道门：区间倒挂时只提示、不发请求（后端也会兜 400）。
  const warning = dateRangeWarning(materialQuery.range)
  if (warning) { ElMessage.warning(warning); return }
  materialQuery.page = 1
  return loadMaterials()
}
function resetMaterials() {
  materialQuery.keyword = ''
  materialQuery.category = ''
  materialQuery.status = ''
  materialQuery.range = emptyDateRange()
  return searchMaterials()
}
function searchCosts() {
  costQuery.page = 1
  return loadCosts()
}
function resetCosts() {
  costQuery.keyword = ''
  return searchCosts()
}
function searchTransactions() {
  // 查询入口统一守一道门：区间倒挂时只提示、不发请求（后端也会兜 400）。
  const warning = dateRangeWarning(transactionQuery.dateRange)
  if (warning) { ElMessage.warning(warning); return }
  transactionQuery.page = 1
  return loadTransactions()
}
function resetTransactions() {
  transactionQuery.materialId = null
  transactionQuery.transactionType = ''
  transactionQuery.sourceType = ''
  transactionQuery.dateRange = emptyDateRange()
  return searchTransactions()
}

async function load() {
  if (!storeId.value) {
    rows.value = []
    materialTotal.value = 0
    materialOptions.value = []
    transactions.value = []
    transactionTotal.value = 0
    costs.value = []
    costTotal.value = 0
    costsMixedCurrency.value = false
    costsAsOf.value = ''
    return
  }
  await Promise.all([loadMaterials(), loadMaterialOptions()])
  await loadTransactions()
  await loadCosts()
}

async function reload() {
  await load()
}

function openMaterial() {
  editingId.value = null
  material.value = emptyMaterial()
  materialFormRef.value?.clearValidate()
  materialDialog.value = true
}

function openEdit(row) {
  editingId.value = row.id
  material.value = {
    materialCode: row.materialCode || '',
    name: row.name || '',
    category: row.category || '其他',
    unit: row.unit || '份',
    description: row.description || '',
    safetyStock: Number(row.safetyStock ?? 0),
    // 后端返回的是最小货币单位，表单按主单位（当前币种）回填；未维护（null）保持空，不显示 0.00。
    purchasePriceYuan: row.purchasePrice === null || row.purchasePrice === undefined
      ? null
      : fenToYuan(row.purchasePrice),
    imageUrls: images(row),
    mainImageUrl: mainImage(row),
  }
  materialFormRef.value?.clearValidate()
  materialDialog.value = true
}

async function saveMaterial() {
  if (saving.value) return
  const valid = await materialFormRef.value?.validate().catch(() => false)
  if (!valid) { ElMessage.warning('请先补全标 * 的必填项'); return }
  saving.value = true
  try {
    const { purchasePriceYuan, ...rest } = material.value
    // 运营填主单位金额，落库仍是最小货币单位——最小货币单位只是技术实现。
    const payload = { ...rest, storeId: storeId.value, purchasePrice: purchasePriceFen(purchasePriceYuan) }
    if (editingId.value) await updateInventoryMaterial(editingId.value, payload)
    else await createInventoryMaterial(payload)
    materialDialog.value = false
    ElMessage.success(editingId.value ? '已保存物料' : '已创建物料')
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '保存失败')
  } finally {
    saving.value = false
  }
}

function openStock(row, mode) {
  stockMode.value = mode
  stock.value = { materialId: row.id, materialName: `${row.name}（${row.materialCode}）`, quantity: 1, reason: '', unitCostYuan: null }
  stockFormRef.value?.clearValidate()
  stockDialog.value = true
}

function showTransactions(row) {
  transactionQuery.materialId = row.id
  transactionQuery.page = 1
  loadTransactions()
}

async function saveStock() {
  if (saving.value) return
  const valid = await stockFormRef.value?.validate().catch(() => false)
  if (!valid) { ElMessage.warning('请先补全标 * 的必填项'); return }
  saving.value = true
  try {
    // 本次入库单价留空时**不带** unitCost 字段（后端沿用物料采购价），填了才按最小货币单位提交。
    const data = withReceiptUnitCost(
      { ...stock.value, idempotencyKey: `manual-${stockMode.value}-${stock.value.materialId}-${Date.now()}` },
      stock.value.unitCostYuan,
    )
    if (stockMode.value === 'IN') await receiveInventory(data)
    else await adjustInventory({ ...data, direction: 'OUT' })
    stockDialog.value = false
    ElMessage.success(stockMode.value === 'IN' ? '已入库' : '已出库')
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '库存更新失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.tip { margin: 0 0 12px; color: var(--el-text-color-secondary); font-size: 13px; }
.store-hint { margin-bottom: 16px; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.card-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--el-text-color-primary); }
.header-actions { display: flex; gap: 10px; }
.image-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.image-thumb { width: 48px; height: 48px; border-radius: 6px; }
.image-empty { color: var(--el-text-color-placeholder); }
.image-count { font-size: 11px; color: var(--el-text-color-secondary); }
</style>
