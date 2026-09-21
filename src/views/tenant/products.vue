<template>
  <div class="products-board-page">
    <OperationsBoard
      v-model:search="keyword"
      v-model:active-tab="categoryFilter"
      v-model:active-filter="statusFilter"
      v-model:view-mode="viewMode"
      title="商品管理"
      :subtitle="`商品与库存属性看板 · ${lastUpdatedText}`"
      :loading="loading"
      search-placeholder="搜索商品名称 / 编码 / 分类 / 描述"
      :stats="productStats"
      :active-stat="statusFilter"
      :tabs="productCategoryTabs"
      :filters="PRODUCT_STATUS_FILTERS"
      @stat-click="handleStatClick"
    >
      <template #actions>
        <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
        <el-button @click="openCategoryManage"><el-icon><Setting /></el-icon>分类管理</el-button>
        <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新增商品</el-button>
      </template>

      <template #toolbar-left-extra>
        <!-- 分类为空时给明确原因：底部「全部分类」下面什么都没有，操作员要知道是「没维护分类」而不是「筛选坏了」。 -->
        <span v-if="categoryFilterHint" class="category-hint">{{ categoryFilterHint }}</span>
        <!-- 创建/更新时间（createdAt、updatedAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59；
             本看板没有「查询」按钮，选完即按区间重新拉取。 -->
        <DateRangeFilter v-model="range" @change="load" @clear="load" />
      </template>

      <div v-if="filteredRows.length" class="product-grid" :class="{ 'list-mode': viewMode === 'list' }">
        <article
          v-for="product in filteredRows"
          :key="product.id"
          class="product-card"
          :class="productStatusClass(product.status)"
          @click="openProductDetail(product)"
        >
          <div class="product-cover" :class="{ empty: !mainImage(product) }">
            <el-image
              v-if="mainImage(product)"
              :src="mainImage(product)"
              :preview-src-list="images(product)"
              :initial-index="0"
              fit="cover"
              class="product-cover-image"
              preview-teleported
              @click.stop
            />
            <el-icon v-else><Picture /></el-icon>
            <span class="product-category">{{ product.category || '未分类' }}</span>
            <span v-if="images(product).length" class="image-count">{{ images(product).length }} 张</span>
          </div>

          <div class="product-body">
            <div class="product-card-head">
              <div class="product-title">
                <strong>{{ product.name || product.productCode }}</strong>
                <span>{{ product.productCode || '暂无编码' }}</span>
              </div>
              <span class="product-status">{{ productStatusText(product.status) }}</span>
            </div>

            <div class="product-price">
              <span>销售价格</span>
              <strong>{{ formatMoney(product.salePrice) }}</strong>
              <small>/ {{ product.unit || '份' }}</small>
            </div>

            <div class="product-meta">
              <div><span>商品属性</span><b>{{ stockTypeText(product) }}</b></div>
              <div><span>关联对象</span><b>{{ materialText(product) }}</b></div>
            </div>
            <p class="product-description">{{ product.description || '暂无商品描述' }}</p>

            <div class="product-actions">
              <span>{{ product.category || '未分类' }}</span>
              <el-button size="small" @click.stop="openProductDetail(product)">详情</el-button>
              <el-button size="small" type="primary" @click.stop="openEdit(product)">编辑</el-button>
              <el-button v-if="product.status !== 'ON_SHELF'" size="small" type="success" plain @click.stop="shelf(product)">上架</el-button>
              <el-button v-else size="small" type="warning" plain @click.stop="offShelf(product)">下架</el-button>
            </div>
          </div>
        </article>
      </div>
      <el-empty v-else :description="productEmptyText" :image-size="96" />
    </OperationsBoard>

    <el-drawer v-model="detailVisible" size="440px" class="product-detail-drawer">
      <template #header>
        <div v-if="detailProduct" class="drawer-title">
          <div>
            <h3>{{ detailProduct.name || detailProduct.productCode }}</h3>
            <p>{{ detailProduct.productCode }} · {{ detailProduct.category || '未分类' }}</p>
          </div>
          <span class="product-status" :class="productStatusClass(detailProduct.status)">{{ productStatusText(detailProduct.status) }}</span>
        </div>
      </template>
      <div v-if="detailProduct" class="product-detail">
        <div class="detail-cover" :class="{ empty: !mainImage(detailProduct) }">
          <el-image
            v-if="mainImage(detailProduct)"
            :src="mainImage(detailProduct)"
            :preview-src-list="images(detailProduct)"
            fit="cover"
            class="detail-cover-image"
            preview-teleported
          />
          <div v-else><el-icon><Picture /></el-icon><span>暂未上传商品图片</span></div>
        </div>
        <div class="detail-price">
          <span>销售价格</span>
          <strong>{{ formatMoney(detailProduct.salePrice) }}</strong>
          <small>/ {{ detailProduct.unit || '份' }}</small>
        </div>
        <div class="detail-grid">
          <div><span>商品分类</span><b>{{ detailProduct.category || '未分类' }}</b></div>
          <div><span>商品类型</span><b>{{ productItemTypeText(detailProduct.itemType) }}</b></div>
          <div><span>商品状态</span><b>{{ productStatusText(detailProduct.status) }}</b></div>
          <div><span>商品属性</span><b>{{ stockTypeText(detailProduct) }}</b></div>
          <div><span>关联对象</span><b>{{ materialText(detailProduct) }}</b></div>
          <div v-if="isServiceProduct(detailProduct)"><span>服务人员</span><b>{{ serverText(detailProduct) }}</b></div>
          <div><span>计量单位</span><b>{{ detailProduct.unit || '份' }}</b></div>
          <div><span>图片数量</span><b>{{ images(detailProduct).length }} 张</b></div>
          <div class="detail-wide"><span>商品描述</span><b>{{ detailProduct.description || '暂无商品描述' }}</b></div>
        </div>
      </div>
      <template #footer>
        <div v-if="detailProduct" class="drawer-actions">
          <el-button type="primary" @click="openEdit(detailProduct)">编辑商品</el-button>
          <el-button v-if="detailProduct.status !== 'ON_SHELF'" type="success" @click="shelf(detailProduct)">上架</el-button>
          <el-button v-else type="warning" @click="offShelf(detailProduct)">下架</el-button>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="dialog" :title="editingId ? '编辑商品' : '新增商品'" width="min(600px, 94vw)">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="140px">
        <el-form-item label="编码" prop="productCode">
          <el-input v-model="form.productCode" :disabled="!!editingId" placeholder="门店内唯一，如 DRINK-001" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" @input="markTouched('name')" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" filterable clearable placeholder="选择分类" style="width: 100%" @change="markTouched('category')">
            <el-option v-for="item in categoryOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <!-- 商品类型：实物商品（关联仓库商品、占用库存）/ 服务（人员的服务，关联服务人员，不占库存）。 -->
        <el-form-item label="商品类型">
          <el-select v-model="form.itemType" style="width: 100%" @change="onItemTypeChange">
            <el-option v-for="item in PRODUCT_ITEM_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="单位"><el-input v-model="form.unit" @input="markTouched('unit')" /></el-form-item>
        <el-form-item :label="withCurrencyLabel('售价')" prop="salePriceYuan">
          <el-input-number v-model="form.salePriceYuan" :min="0" :precision="2" :step="0.5" @change="markTouched('salePriceYuan')" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="255"
            show-word-limit
            placeholder="点单/展示用的补充说明，最多 255 字"
            @input="markTouched('description')"
          />
        </el-form-item>
        <el-form-item v-if="isServiceForm" label="关联服务人员" prop="serverResourceId">
          <el-select
            v-model="form.serverResourceId"
            clearable
            filterable
            placeholder="服务商品必须关联服务人员"
            style="width: 100%"
            @change="loadServers"
          >
            <el-option v-for="item in servers" :key="item.id" :label="serverLabel(item)" :value="item.id" />
          </el-select>
          <p class="autofill-hint">{{ SERVER_HINT }}</p>
        </el-form-item>
        <template v-else>
          <el-form-item label="实物商品（占用库存）">
            <el-switch v-model="form.stockControlled" @change="revalidateMaterial" />
          </el-form-item>
          <el-form-item v-if="form.stockControlled" label="关联仓库商品" prop="materialId">
            <el-select
              v-model="form.materialId"
              clearable
              filterable
              placeholder="实物商品必须关联仓库商品"
              style="width: 100%"
              @change="applyMaterialAutofill"
            >
              <el-option v-for="item in materials" :key="item.id" :label="materialLabel(item)" :value="item.id" />
            </el-select>
            <p class="autofill-hint">{{ AUTOFILL_HINT }}</p>
          </el-form-item>
        </template>
        <el-form-item label="商品图片">
          <ItemImageUploader
            :images="form.imageUrls"
            :main-image="form.mainImageUrl"
            @update:images="onFormImagesUpdate"
            @update:main-image="form.mainImageUrl = $event"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="categoryDialog" title="分类管理" width="min(720px, 94vw)">
      <el-alert
        class="store-hint"
        type="info"
        show-icon
        :closable="false"
        title="分类供商品管理选择；改名会自动同步到引用它的商品与点单目录，被商品引用的分类不能删除。"
      />
      <el-form :inline="true" class="category-form" @submit.prevent>
        <el-form-item label="分类名称">
          <el-input v-model="categoryForm.name" maxlength="64" placeholder="如 酒水" style="width: 200px" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="categoryForm.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="categorySaving" @click="saveCategory">
            {{ categoryEditingId ? '保存' : '新增' }}
          </el-button>
          <el-button v-if="categoryEditingId" @click="resetCategoryForm">取消编辑</el-button>
        </el-form-item>
      </el-form>
      <el-table :data="categories" v-loading="categoryLoading" border stripe size="small">
        <el-table-column prop="name" label="分类名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="activeStatusType(row.status)">{{ activeStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="editCategory(row)">改名/排序</el-button>
            <el-button link type="warning" size="small" @click="toggleCategory(row)">
              {{ activeStatusActionText(row.status) }}
            </el-button>
            <el-button link type="danger" size="small" @click="removeCategory(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无分类，新增一个吧" /></template>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, CircleClose, Grid, Picture, Plus, Refresh, Service, Setting, Tickets } from '@element-plus/icons-vue'
import {
  listProducts, createProduct, updateProduct, onShelfProduct, offShelfProduct,
  listInventoryMaterials,
  listProductCategories, createProductCategory, updateProductCategory, deleteProductCategory,
} from '@/api/order'
import { listResources } from '@/api/resource'
import { parseImageUrls } from '@/api/media'
import ItemImageUploader from '@/components/ItemImageUploader.vue'
import OperationsBoard from '@/components/OperationsBoard.vue'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { useContextStore } from '@/stores/context'
import { formatMoney, formatTimeWithSeconds, fenToYuan, withCurrencyLabel, yuanToFen } from '@/utils/format'
import {
  PRODUCT_ITEM_TYPE_OPTIONS,
  activeStatusActionText, activeStatusText, activeStatusType,
  productItemTypeText, productStatusText,
} from '@/constants/terms'
import { buildMaterialAutofill, materialAutofillKeptHint } from '@/utils/product-material-autofill'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'

const context = useContextStore()
const rows = ref([])
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
/** 时间区间（创建/更新时间）：本看板查询条件不是 reactive 对象，区间单独一个 ref。 */
const range = ref(emptyDateRange())
const categoryFilter = ref('all')
const statusFilter = ref('all')
const viewMode = ref('grid')
const lastUpdatedAt = ref(null)
const detailVisible = ref(false)
const detailProduct = ref(null)
const dialog = ref(false)
const editingId = ref(null)
const formRef = ref()
const form = ref(emptyForm())

/**
 * 用户手动编辑过的表单字段：选择关联仓库商品时这些字段不被自动覆盖（改为轻提示）。
 * 只在弹窗打开时清空；自动带出本身不算「用户编辑」。
 */
const touchedFields = ref([])

/** 关联仓库商品的带出说明（新增/编辑同一口径，编辑态只在字段为空时带出）。 */
const AUTOFILL_HINT = '选择后自动带出名称、分类、单位、售价（取自物料采购价）、描述、图片；已手动填写的内容不会被覆盖，物料没有图片时不动商品图片。'

/** 服务商品的关联说明：与后端 PRODUCT_SERVICE_SERVER_REQUIRED / SERVER_RESOURCE_* 口径一致。 */
const SERVER_HINT = '服务商品必须关联启用中的服务人员（在「KTV 配置 → 服务人员」维护）；服务不占库存，点单/加项按目录单价计费。'

/** 关联仓库商品下拉：只列启用中的仓库商品（物料）。 */
const materials = ref([])
/** 服务人员下拉（res_resource，resourceType=KTV_SERVER）：服务型商品必填。 */
const servers = ref([])
const serversLoaded = ref(false)
/** 分类字典（含停用，供分类管理）；商品弹窗下拉只取启用中的。 */
const categories = ref([])
const categoryDialog = ref(false)
const categoryLoading = ref(false)
const categorySaving = ref(false)
const categoryEditingId = ref(null)
const categoryForm = ref({ name: '', sortOrder: 0 })

const PRODUCT_STATUS_FILTERS = [
  { value: 'all', label: '全部', dot: false },
  { value: 'ON_SHELF', label: '已上架', tone: 'succeeded' },
  { value: 'OFF_SHELF', label: '已下架', tone: 'cancelled' },
  { value: 'DRAFT', label: '草稿', tone: 'pending' },
]

/** 商品分类下拉：启用中的分类 + 商品当前分类（历史数据可能不在字典里，避免编辑时被清空）。 */
const categoryOptions = computed(() => {
  const names = categories.value.filter((item) => item.status === 'ACTIVE').map((item) => item.name).filter(Boolean)
  if (form.value.category && !names.includes(form.value.category)) names.unshift(form.value.category)
  return names
})

/**
 * 分类快捷筛选的 tab 来源（第 1 点）：
 *  1) 门店分类字典（分类管理维护的「已有分类项」）——即便该分类下暂时没有商品也列出来，便于快捷筛选；
 *  2) 合并「已被商品引用但不在字典里」的历史分类（老数据），避免筛不到；
 *  3) 当前选中的分类始终保留，避免时间区间/数据变化后 tab 消失导致「筛选中却看不到选的是哪个」。
 * 只做前端过滤（本看板列表不分页、一次拉全量），与关键字/状态筛选、统计口径完全一致。
 */
const productCategoryTabs = computed(() => {
  const dictionary = categories.value
    .filter((item) => item.status === 'ACTIVE')
    .map((item) => item.name)
    .filter(Boolean)
  const used = rows.value.map((product) => product.category).filter(Boolean)
  const active = categoryFilter.value !== 'all' ? [categoryFilter.value] : []
  const names = [...new Set([...dictionary, ...used, ...active])]
    .sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))
  return [{ value: 'all', label: '全部分类' }, ...names.map((name) => ({ value: name, label: name }))]
})

/** 分类筛选为空的原因提示（分类字典与商品都没数据时不静默空白）。 */
const categoryFilterHint = computed(() => {
  if (productCategoryTabs.value.length > 1) return ''
  return '尚未维护商品分类：点右上角「分类管理」新增后，即可在这里按分类快捷筛选。'
})

const filteredRows = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  return rows.value.filter((product) => {
    if (categoryFilter.value !== 'all' && product.category !== categoryFilter.value) return false
    if (statusFilter.value !== 'all' && product.status !== statusFilter.value) return false
    if (!search) return true
    return [
      product.productCode,
      product.name,
      product.category,
      product.description,
      product.unit,
      productStatusText(product.status),
      stockTypeText(product),
    ].filter((value) => value != null).some((value) => String(value).toLowerCase().includes(search))
  })
})

const productSummary = computed(() => {
  const summary = { total: rows.value.length, onShelf: 0, offShelf: 0, draft: 0, stock: 0, service: 0, imaged: 0 }
  rows.value.forEach((product) => {
    if (product.status === 'ON_SHELF') summary.onShelf += 1
    else if (product.status === 'OFF_SHELF') summary.offShelf += 1
    else if (product.status === 'DRAFT') summary.draft += 1
    // 实物 / 服务按商品类型统计（第 3 点），不再用「是否占用库存」近似：服务不占库存。
    if (isServiceProduct(product)) summary.service += 1
    else summary.stock += 1
    if (images(product).length) summary.imaged += 1
  })
  return summary
})

const productStats = computed(() => [
  { key: 'all', label: '全部商品', value: productSummary.value.total, suffix: '件', icon: Grid, tone: 'total', filterValue: 'all' },
  { key: 'on-shelf', label: '已上架', value: productSummary.value.onShelf, suffix: '件', icon: CircleCheck, tone: 'succeeded', filterValue: 'ON_SHELF' },
  { key: 'off-shelf', label: '已下架', value: productSummary.value.offShelf, suffix: '件', icon: CircleClose, tone: 'cancelled', filterValue: 'OFF_SHELF' },
  { key: 'draft', label: '草稿', value: productSummary.value.draft, suffix: '件', icon: Tickets, tone: 'pending', filterValue: 'DRAFT' },
  { key: 'stock', label: '实物商品', value: productSummary.value.stock, suffix: '件', icon: Setting, tone: 'reserved', clickable: false },
  { key: 'service', label: '服务', value: productSummary.value.service, suffix: '件', icon: Service, tone: 'amount', clickable: false },
  { key: 'imaged', label: '已有图片', value: productSummary.value.imaged, suffix: '件', icon: Picture, tone: 'idle', clickable: false },
])

const lastUpdatedText = computed(() => lastUpdatedAt.value ? `最后同步 ${formatTimeWithSeconds(lastUpdatedAt.value)}` : '等待首次同步')

/** 空态文案：区分「没数据」与「筛出来是空的」，并对分类筛选给出明确原因（第 1 点）。 */
const productEmptyText = computed(() => {
  if (!rows.value.length) {
    return categoryFilter.value === 'all'
      ? '暂无商品'
      : `分类「${categoryFilter.value}」下暂无商品（该分类已在筛选条件中保留，可点「全部分类」查看全部）`
  }
  if (categoryFilter.value !== 'all' && !rows.value.some((product) => product.category === categoryFilter.value)) {
    return `分类「${categoryFilter.value}」下暂无商品（可能是当前时间区间内没有，或分类已在「分类管理」改名）`
  }
  return '没有符合当前筛选条件的商品'
})

const rules = {
  productCode: [{ required: true, message: '请输入商品编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  salePriceYuan: [{ required: true, message: '请输入售价', trigger: 'blur' }],
  materialId: [{ validator: validateMaterial, trigger: 'change' }],
  serverResourceId: [{ validator: validateServerResource, trigger: 'change' }],
}

/** 实物商品（占用库存）必须关联仓库商品；服务端同样强校验，这里是同一条消息的前置提示。 */
function validateMaterial(rule, value, callback) {
  if (!isServiceForm.value && form.value.stockControlled && !value) callback(new Error('实物商品必须关联仓库商品'))
  else callback()
}

/** 服务商品必须关联服务人员；服务端同样强校验（PRODUCT_SERVICE_SERVER_REQUIRED）。 */
function validateServerResource(rule, value, callback) {
  if (isServiceForm.value && !value) callback(new Error('服务商品必须关联服务人员'))
  else callback()
}

function revalidateMaterial() {
  formRef.value?.validateField('materialId').catch(() => {})
}

/** 商品类型切换：服务清掉库存/物料关联，实物恢复默认占用库存，并互相同步校验状态。 */
function onItemTypeChange(itemType) {
  if (itemType === 'SERVICE') {
    form.value.stockControlled = false
    form.value.materialId = null
    loadServers()
  } else {
    form.value.serverResourceId = null
    form.value.stockControlled = true
  }
  formRef.value?.clearValidate(['materialId', 'serverResourceId'])
}

function emptyForm() {
  return {
    productCode: '', name: '', category: '其他', itemType: 'PRODUCT', unit: '份', salePriceYuan: 1,
    description: '', stockControlled: true, materialId: null, serverResourceId: null,
    imageUrls: [], mainImageUrl: '',
  }
}

/** 表单当前是否为「服务」类型。 */
const isServiceForm = computed(() => form.value.itemType === 'SERVICE')

function images(row) {
  return parseImageUrls(row?.imageUrls)
}

function mainImage(row) {
  const urls = images(row)
  if (row?.mainImageUrl && urls.includes(row.mainImageUrl)) return row.mainImageUrl
  return urls[0] || ''
}

/** 是否服务型商品（后端 item_type=SERVICE；历史数据缺字段时按实物商品处理）。 */
function isServiceProduct(product) {
  return product?.itemType === 'SERVICE'
}

/** 商品属性文案：服务显示关联的服务人员，实物显示是否占用库存。 */
function stockTypeText(product) {
  if (isServiceProduct(product)) {
    return product.serverResourceName ? `服务（${product.serverResourceName}）` : '服务（未关联服务人员）'
  }
  return product?.stockControlled ? '实物商品 · 占用库存' : '实物商品 · 不占库存'
}

/** 服务人员展示文案：优先名称，缺名称时退回 ID（服务端跨域读资源失败时只给 ID）。 */
function serverText(product) {
  if (!isServiceProduct(product)) return '无需关联'
  if (product.serverResourceName) return product.serverResourceName
  return product.serverResourceId ? `服务人员 #${product.serverResourceId}` : '未关联'
}

/** 关联对象：服务 → 服务人员；实物 → 仓库商品；不占库存的实物 → 无需关联。 */
function materialText(product) {
  if (isServiceProduct(product)) return serverText(product)
  if (!product?.stockControlled) return '无需关联'
  return product.materialId ? `仓库商品 #${product.materialId}` : '未关联'
}

function productStatusClass(status) {
  if (status === 'ON_SHELF') return 'on-shelf'
  if (status === 'OFF_SHELF') return 'off-shelf'
  if (status === 'DRAFT') return 'draft'
  return 'unknown'
}

function handleStatClick(stat) {
  if (stat.filterValue != null) categoryFilter.value = 'all'
}

function openProductDetail(product) {
  detailProduct.value = product
  detailVisible.value = true
}

function materialLabel(item) {
  return `${item.name}（${item.materialCode}）`
}

async function load() {
  // 本看板没有「查询」按钮，守卫放在加载入口：区间倒挂时只提示、不发请求。
  const warning = dateRangeWarning(range.value)
  if (warning) { ElMessage.warning(warning); return }
  loading.value = true
  try {
    rows.value = (await listProducts({ storeId: context.storeId, ...dateRangeParams(range.value) })) || []
    lastUpdatedAt.value = new Date()
    if (detailProduct.value) {
      detailProduct.value = rows.value.find((product) => product.id === detailProduct.value.id) || null
      if (!detailProduct.value) detailVisible.value = false
    }
  } catch (e) {
    notifyAdminRequestError(e, '加载商品失败')
  } finally {
    loading.value = false
  }
}

async function loadMaterials() {
  if (!context.storeId) { materials.value = []; return }
  try {
    // 物料接口已改为 MyBatis-Plus 分页信封（records/total/current/size），下拉要的是数组，取 records。
    // pageSize 上限 200（超过会回落到默认 20）：这里按 200 取第一页，覆盖门店全部启用物料；
    // 门店启用物料超过 200 条时下拉只列前 200 条（简单场景不做循环拉全量，超出的物料仍可手填编码）。
    const data = await listInventoryMaterials({ storeId: context.storeId, status: 'ACTIVE', page: 1, pageSize: 200 })
    materials.value = data?.records || []
  } catch (e) {
    materials.value = []
  }
}

async function loadCategories() {
  if (!context.storeId) { categories.value = []; return }
  categoryLoading.value = true
  try {
    categories.value = (await listProductCategories({ storeId: context.storeId })) || []
  } catch (e) {
    categories.value = []
    notifyAdminRequestError(e, '加载分类失败')
  } finally {
    categoryLoading.value = false
  }
}

async function loadServers() {
  if (!context.storeId) { servers.value = []; return }
  if (serversLoaded.value) return
  serversLoaded.value = true
  try {
    // 服务人员 = res_resource(resourceType=KTV_SERVER) 的启用中资源（与「资源管理」同源）。
    const data = await listResources({ resourceType: 'KTV_SERVER', storeId: context.storeId })
    servers.value = (Array.isArray(data) ? data : []).filter((item) => item.status === 'ENABLED')
  } catch (e) {
    serversLoaded.value = false
    servers.value = []
  }
}

function serverLabel(item) {
  const code = item.resourceCode ? `（${item.resourceCode}）` : ''
  return `${item.name}${code}`
}

function openCreate() {
  editingId.value = null
  form.value = emptyForm()
  touchedFields.value = []
  lastAutofilledImages.value = []
  formRef.value?.clearValidate()
  dialog.value = true
}

function openEdit(row) {
  editingId.value = row.id
  form.value = {
    productCode: row.productCode || '',
    name: row.name || '',
    category: row.category || '其他',
    itemType: row.itemType || 'PRODUCT',
    unit: row.unit || '份',
    salePriceYuan: fenToYuan(row.salePrice),
    description: row.description || '',
    stockControlled: !!row.stockControlled,
    materialId: row.materialId ?? null,
    serverResourceId: row.serverResourceId ?? null,
    imageUrls: images(row),
    mainImageUrl: mainImage(row),
  }
  // 服务型商品需要服务人员下拉（只列启用中的：停用的会被服务端拒绝，直接不给出选项）。
  if (isServiceProduct(row)) loadServers()
  touchedFields.value = []
  lastAutofilledImages.value = []
  formRef.value?.clearValidate()
  detailVisible.value = false
  dialog.value = true
}

/** 标记字段被用户手动编辑过：选择关联仓库商品时不再覆盖它。 */
function markTouched(field) {
  if (!touchedFields.value.includes(field)) touchedFields.value = [...touchedFields.value, field]
}

/**
 * 图片来源自动带出的那批图（与用户自己上传的图区分）：
 * 上传组件在 props 变化后会回写一次 update:images，若不区分就会把「自动带出」误记成「用户手动编辑」，
 * 结果是「换个物料就不再覆盖图片」。这里按内容比对，只有真正变化的才标记为已编辑。
 */
const lastAutofilledImages = ref([])

function onFormImagesUpdate(urls) {
  const next = Array.isArray(urls) ? urls : []
  form.value.imageUrls = next
  const autofilled = lastAutofilledImages.value
  if (autofilled.length === next.length && autofilled.every((url, index) => url === next[index])) return
  markTouched('imageUrls')
}

/**
 * 选择关联仓库商品后自动带出字段（实现见 utils/product-material-autofill）。
 * 新增态：带出未被用户编辑过的字段；编辑态：只带出为空的字段；
 * 与用户已填内容冲突时只提示一次，不静默覆盖（图片成对带出，物料没图则完全不动）。
 */
function applyMaterialAutofill(materialId) {
  if (materialId === null || materialId === undefined || materialId === '') return
  const material = materials.value.find((item) => String(item.id) === String(materialId))
  if (!material) return
  const { patch, kept } = buildMaterialAutofill({
    material,
    form: form.value,
    touched: touchedFields.value,
    editing: !!editingId.value,
  })
  if (Object.keys(patch).length) {
    if (Array.isArray(patch.imageUrls)) lastAutofilledImages.value = patch.imageUrls
    form.value = { ...form.value, ...patch }
  }
  const hint = materialAutofillKeptHint(kept)
  if (hint) ElMessage.info(hint)
}

async function save() {
  if (saving.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) { ElMessage.warning('请先补全标 * 的必填项'); return }
  saving.value = true
  try {
    const service = isServiceForm.value
    const { salePriceYuan, ...rest } = form.value
      // 运营填主单位金额，落库仍是最小货币单位——最小货币单位只是技术实现。
      const payload = {
        ...rest,
        // 服务：不占库存、不带仓库商品，只带服务人员；实物：不带服务人员（服务端同样忽略/清空）。
        materialId: service || !form.value.stockControlled ? null : form.value.materialId,
        stockControlled: service ? false : form.value.stockControlled,
        serverResourceId: service ? form.value.serverResourceId : null,
        salePrice: yuanToFen(salePriceYuan),
        storeId: context.storeId,
      }
    if (editingId.value) await updateProduct(editingId.value, payload)
    else await createProduct(payload)
    dialog.value = false
    ElMessage.success(editingId.value ? '已保存' : '已创建')
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '保存失败')
  } finally {
    saving.value = false
  }
}

async function shelf(row) {
  // 上架前的可读提示，与后端 PRODUCT_INVALID / PRODUCT_SERVICE_SERVER_REQUIRED 的消息保持一致。
  if (isServiceProduct(row) && !row.serverResourceId) { ElMessage.warning('服务商品必须关联服务人员'); return }
  if (!isServiceProduct(row) && row.stockControlled && !row.materialId) { ElMessage.warning('实物商品必须关联仓库商品'); return }
  try {
    await onShelfProduct(row.id)
    ElMessage.success('已上架')
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '上架失败')
  }
}

async function offShelf(row) {
  try {
    await offShelfProduct(row.id)
    ElMessage.success('已下架')
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '下架失败')
  }
}

// —— 分类管理 ——

function openCategoryManage() {
  resetCategoryForm()
  categoryDialog.value = true
  loadCategories()
}

function resetCategoryForm() {
  categoryEditingId.value = null
  categoryForm.value = { name: '', sortOrder: 0 }
}

function editCategory(row) {
  categoryEditingId.value = row.id
  categoryForm.value = { name: row.name || '', sortOrder: Number(row.sortOrder ?? 0) }
}

async function saveCategory() {
  if (categorySaving.value) return
  const name = (categoryForm.value.name || '').trim()
  if (!name) { ElMessage.warning('请输入分类名称'); return }
  categorySaving.value = true
  try {
    const payload = { name, sortOrder: Number(categoryForm.value.sortOrder || 0) }
    if (categoryEditingId.value) {
      await updateProductCategory(categoryEditingId.value, payload)
      ElMessage.success('已保存分类')
    } else {
      await createProductCategory(payload)
      ElMessage.success('已新增分类')
    }
    resetCategoryForm()
    await loadCategories()
    // 改名会同步商品与点单目录的分类名，商品列表要跟着刷新。
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '保存分类失败')
  } finally {
    categorySaving.value = false
  }
}

async function toggleCategory(row) {
  try {
    await updateProductCategory(row.id, { status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
    ElMessage.success(row.status === 'ACTIVE' ? '已停用分类' : '已启用分类')
    await loadCategories()
  } catch (e) {
    notifyAdminRequestError(e, '更新分类失败')
  }
}

async function removeCategory(row) {
  try {
    await ElMessageBox.confirm(
      `删除分类「${row.name}」？仍被商品引用的分类不能删除。`,
      '删除分类',
      { type: 'warning' },
    )
  } catch (e) {
    return
  }
  try {
    await deleteProductCategory(row.id)
    ElMessage.success('已删除分类')
    await loadCategories()
  } catch (e) {
    notifyAdminRequestError(e, '删除分类失败')
  }
}

onMounted(async () => {
  await Promise.all([load(), loadMaterials(), loadCategories()])
})
</script>

<style scoped>
.products-board-page {
  --product-green: #21a876;
  --product-orange: #e98a2d;
  --product-blue: #3478f6;
}
.product-grid {
  padding: 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(245px, 1fr));
  gap: 20px;
  background: #fafbfc;
}
.product-card {
  min-width: 0;
  min-height: 390px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 2px 8px rgba(34, 42, 62, .035);
  cursor: pointer;
  transition: transform .18s, box-shadow .18s, border-color .18s;
}
.product-card:hover { transform: translateY(-2px); border-color: #cbdaf3; box-shadow: 0 10px 25px rgba(31, 44, 74, .1); }
.product-card.off-shelf { opacity: .82; }
.product-cover { height: 150px; position: relative; overflow: hidden; background: linear-gradient(135deg, #edf3ff, #e6edf9); }
.product-cover-image { width: 100%; height: 100%; display: block; transition: transform .25s; }
.product-card:hover .product-cover-image { transform: scale(1.025); }
.product-cover.empty { display: grid; place-items: center; color: #7890b4; font-size: 38px; }
.product-category,
.image-count { position: absolute; top: 10px; z-index: 2; padding: 4px 8px; border-radius: 13px; color: #fff; background: rgba(24, 33, 49, .68); font-size: 10px; backdrop-filter: blur(4px); }
.product-category { left: 10px; }
.image-count { right: 10px; }
.product-body { min-height: 0; flex: 1; padding: 15px 16px 16px; display: flex; flex-direction: column; }
.product-card-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.product-title { min-width: 0; flex: 1; }
.product-title strong { display: block; overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.product-title span { display: block; margin-top: 4px; color: var(--el-text-color-secondary); font-size: 11px; }
.product-status { flex: none; padding: 4px 8px; border-radius: 13px; color: #68707e; background: #f0f2f5; font-size: 11px; font-weight: 600; }
.on-shelf .product-status,
.product-status.on-shelf { color: #16895f; background: #eaf8f2; }
.off-shelf .product-status,
.product-status.off-shelf { color: #68707e; background: #eceff3; }
.draft .product-status,
.product-status.draft { color: #c76b10; background: #fff0dc; }
.product-price { margin-bottom: 12px; }
.product-price span { display: block; margin-bottom: 3px; color: var(--el-text-color-placeholder); font-size: 11px; }
.product-price strong { color: #d84653; font-size: 24px; line-height: 1.25; }
.product-price small { margin-left: 5px; color: var(--el-text-color-placeholder); font-size: 10px; }
.product-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; padding: 10px 0; border-top: 1px dashed var(--el-border-color); }
.product-meta div { min-width: 0; display: flex; gap: 5px; font-size: 11px; }
.product-meta span { flex: none; color: var(--el-text-color-placeholder); }
.product-meta b { min-width: 0; overflow: hidden; color: var(--el-text-color-regular); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.product-description { min-height: 34px; margin: 8px 0 12px; overflow: hidden; display: -webkit-box; color: var(--el-text-color-secondary); font-size: 11px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.product-actions { display: flex; align-items: center; gap: 6px; margin-top: auto; }
.product-actions > span { min-width: 0; flex: 1; overflow: hidden; color: var(--el-text-color-placeholder); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.product-actions > .el-button { margin-left: 0; }

.product-grid.list-mode { grid-template-columns: 1fr; }
.product-grid.list-mode .product-card { min-height: 160px; display: grid; grid-template-columns: 190px minmax(0, 1fr); }
.product-grid.list-mode .product-cover { height: 100%; min-height: 158px; }
.product-grid.list-mode .product-body { display: grid; grid-template-columns: minmax(180px, .7fr) minmax(150px, .5fr) minmax(250px, .9fr) minmax(180px, .7fr) minmax(270px, 1fr); align-items: center; gap: 20px; }
.product-grid.list-mode .product-card-head,
.product-grid.list-mode .product-price,
.product-grid.list-mode .product-description { margin: 0; }
.product-grid.list-mode .product-meta { padding: 0; border: 0; }
.product-grid.list-mode .product-actions { margin: 0; }

.drawer-title { width: 100%; padding-right: 8px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.drawer-title h3 { margin: 0; color: var(--el-text-color-primary); font-size: 20px; }
.drawer-title p { margin: 5px 0 0; color: var(--el-text-color-secondary); font-size: 12px; }
.detail-cover { height: 220px; margin-bottom: 16px; overflow: hidden; border-radius: 12px; background: var(--el-fill-color-light); }
.detail-cover-image { width: 100%; height: 100%; display: block; }
.detail-cover.empty { display: grid; place-items: center; color: var(--el-text-color-placeholder); }
.detail-cover.empty > div { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.detail-cover.empty .el-icon { font-size: 35px; }
.detail-cover.empty span { font-size: 12px; }
.detail-price { margin-bottom: 16px; padding: 16px 18px; border-radius: 10px; background: #fff7f7; }
.detail-price span { display: block; margin-bottom: 4px; color: var(--el-text-color-secondary); font-size: 11px; }
.detail-price strong { color: #d84653; font-size: 28px; }
.detail-price small { margin-left: 5px; color: var(--el-text-color-placeholder); }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--el-border-color-lighter); border-radius: 9px; overflow: hidden; }
.detail-grid > div { min-width: 0; padding: 12px; border-right: 1px solid var(--el-border-color-lighter); border-bottom: 1px solid var(--el-border-color-lighter); }
.detail-grid > div:nth-child(2n) { border-right: 0; }
.detail-grid > .detail-wide { grid-column: 1 / -1; border-right: 0; border-bottom: 0; }
.detail-grid span { display: block; margin-bottom: 4px; color: var(--el-text-color-placeholder); font-size: 10px; }
.detail-grid b { display: block; overflow-wrap: anywhere; color: var(--el-text-color-regular); font-size: 12px; }
.drawer-actions { display: flex; justify-content: flex-end; gap: 8px; }
.drawer-actions > .el-button { margin-left: 0; }

.category-form { margin-bottom: 4px; }
.store-hint { margin-bottom: 12px; }
.autofill-hint { flex: 1 0 100%; margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--el-text-color-secondary); }
.category-hint { max-width: 320px; padding: 4px 10px; border-radius: 6px; color: #c76b10; background: #fff0dc; font-size: 12px; line-height: 1.5; }

@media (max-width: 1500px) {
  .product-grid { grid-template-columns: repeat(3, minmax(235px, 1fr)); }
}
@media (max-width: 1180px) {
  .product-grid { grid-template-columns: repeat(2, minmax(230px, 1fr)); }
  .product-grid.list-mode .product-card { grid-template-columns: 160px minmax(0, 1fr); }
  .product-grid.list-mode .product-body { grid-template-columns: minmax(180px, .8fr) 1fr; }
}
@media (max-width: 720px) {
  .product-grid { grid-template-columns: 1fr; padding: 12px; gap: 16px; }
  .product-grid.list-mode .product-card { display: flex; }
  .product-grid.list-mode .product-cover { height: 150px; min-height: 150px; }
  .product-grid.list-mode .product-body { display: flex; }
}
</style>
