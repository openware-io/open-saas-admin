<template>
  <div class="resources-board-page">
    <OperationsBoard
      v-model:search="keyword"
      v-model:active-filter="statusFilter"
      v-model:view-mode="viewMode"
      :title="TERMS.ktvRoom"
      :subtitle="`包厢资源看板 · ${lastUpdatedText}`"
      :loading="loading"
      search-placeholder="搜索编号 / 名称 / 区域 / 房型"
      :stats="resourceStats"
      :active-stat="statusFilter"
      :filters="RESOURCE_STATUS_FILTERS"
      @stat-click="handleStatClick"
    >
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button @click="openTypeManage">
          <el-icon><Setting /></el-icon>房型管理
        </el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新增包厢
        </el-button>
      </template>
      <template #toolbar-left-extra>
        <!-- 创建时间（createdAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59；
             本看板没有「查询」按钮，选完即按区间重新拉取。 -->
        <DateRangeFilter v-model="range" @change="load" @clear="load" />
        <el-select v-model="storeId" placeholder="选择门店" clearable class="store-filter" @change="load">
          <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <!-- 查询条件与表单统一到「房型」：本页只维护包厢（resourceType 固定 KTV_ROOM），
             「类型」不再是可选项（服务人员资源在 KTV 配置页维护）。 -->
        <el-select
          v-model="roomTypeFilter"
          placeholder="房型"
          clearable
          class="room-type-filter"
          @visible-change="onRoomTypeFilterOpen"
        >
          <el-option label="未指定房型" :value="ROOM_TYPE_FILTER_NONE" />
          <el-option v-for="t in resourceTypes" :key="t.id" :label="roomTypeOptionLabel(t)" :value="t.id" />
        </el-select>
      </template>

      <div v-if="filteredRows.length" class="resource-grid" :class="{ 'list-mode': viewMode === 'list' }">
        <article
          v-for="resource in filteredRows"
          :key="resource.id"
          class="resource-card"
          :class="resourceStatusClass(resource.status)"
          @click="openResourceDetail(resource)"
        >
          <div class="resource-cover" :class="{ empty: !rowThumb(resource) }">
            <img
              v-if="rowThumb(resource)"
              :src="rowThumb(resource)"
              :alt="resource.name || resource.resourceCode"
              loading="lazy"
              @error="markRowImageFailed(resource)"
            />
            <el-icon v-else><Picture /></el-icon>
            <span v-if="rowImages(resource).length" class="image-count">{{ rowImages(resource).length }} 张</span>
            <span class="resource-type">{{ resource.roomTypeCode || '包厢' }}</span>
          </div>

          <div class="resource-body">
            <div class="resource-card-head">
              <div class="resource-title">
                <strong>{{ resource.name || resource.resourceCode }}</strong>
                <span>{{ resource.resourceCode || '暂无编号' }}</span>
              </div>
              <span class="resource-status">{{ enabledStatusText(resource.status) }}</span>
            </div>
            <div class="resource-meta">
              <div><span>所属门店</span><b>{{ storeName(resource.storeId) }}</b></div>
              <div><span>所在区域</span><b>{{ resource.areaName || '未设置' }}</b></div>
              <div><span>房型</span><b>{{ roomTypeName(resource) }}</b></div>
              <div><span>容纳人数</span><b>{{ resource.capacity != null ? resource.capacity + ' 人' : '未设置' }}</b></div>
            </div>

            <p class="resource-description">{{ resource.description || '暂无资源描述' }}</p>
            <div class="resource-actions">
              <span>{{ resource.roomTypeCode || '未指定房型' }}</span>
              <el-button size="small" @click.stop="openResourceDetail(resource)">详情</el-button>
              <el-button size="small" type="primary" @click.stop="openEdit(resource)">编辑</el-button>
            </div>
          </div>
        </article>
      </div>
      <el-empty v-else :description="resourceEmptyText" :image-size="96" />
    </OperationsBoard>

    <el-drawer v-model="detailVisible" size="440px" class="resource-detail-drawer">
      <template #header>
        <div v-if="detailResource" class="drawer-title">
          <div>
            <h3>{{ detailResource.name || detailResource.resourceCode }}</h3>
            <p>{{ detailResource.resourceCode }} · 包厢</p>
          </div>
          <span class="resource-status" :class="resourceStatusClass(detailResource.status)">{{ enabledStatusText(detailResource.status) }}</span>
        </div>
      </template>
      <div v-if="detailResource" class="resource-detail">
        <div class="detail-cover" :class="{ empty: !rowThumb(detailResource) }">
          <img
            v-if="rowThumb(detailResource)"
            :src="rowThumb(detailResource)"
            :alt="detailResource.name || detailResource.resourceCode"
            @error="markRowImageFailed(detailResource)"
          />
          <div v-else><el-icon><Picture /></el-icon><span>暂未上传图片</span></div>
        </div>
        <div class="detail-grid">
          <div><span>所属门店</span><b>{{ storeName(detailResource.storeId) }}</b></div>
          <div><span>资源类型</span><b>包厢</b></div>
          <div><span>所在区域</span><b>{{ detailResource.areaName || '未设置' }}</b></div>
          <div><span>房型</span><b>{{ detailRoomTypeName(detailResource) }}</b></div>
          <div><span>容纳人数</span><b>{{ detailResource.capacity != null ? detailResource.capacity + ' 人' : '未设置' }}</b></div>
          <div><span>图片数量</span><b>{{ rowImages(detailResource).length }} 张</b></div>
          <div class="detail-wide"><span>资源描述</span><b>{{ detailResource.description || '暂无资源描述' }}</b></div>
        </div>
      </div>
      <template #footer>
        <el-button v-if="detailResource" type="primary" @click="openEdit(detailResource)">编辑资源</el-button>
      </template>
    </el-drawer>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px">
      <p v-if="!isEditing" class="tip">包厢归属门店由运行上下文决定：保存时若所选门店与当前上下文不一致，会先自动切换门店上下文再创建。</p>
      <p v-else class="tip">编号创建后不可修改；图片与描述保存后立即同步到 B 端房态看板与 C 端选包厢页。</p>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="88px" @keyup.enter="save">
        <el-form-item label="所属门店" prop="storeId" required>
          <el-select v-model="form.storeId" placeholder="选择门店" style="width: 100%" :disabled="isEditing">
            <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <!-- 本页只维护包厢：不再有「类型」可选项（原来可选包厢/服务人员，容易与「房型」混淆；
             服务人员资源在「KTV 配置 → 服务人员」维护），resourceType 固定 KTV_ROOM 由代码写入。 -->
        <el-form-item label="编号" prop="resourceCode" required>
          <el-input v-model="form.resourceCode" placeholder="如 V01" :disabled="isEditing" />
        </el-form-item>
        <el-form-item label="名称" prop="name" required>
          <el-input v-model="form.name" placeholder="包厢名称" />
        </el-form-item>
        <el-form-item label="区域" prop="areaName">
          <el-input
            v-model="form.areaName"
            maxlength="64"
            show-word-limit
            clearable
            placeholder="如：三楼 A 区（选填，最多 64 个字符）"
          />
        </el-form-item>
        <el-form-item label="房型" prop="roomTypeId">
          <el-select v-model="form.roomTypeId" placeholder="选择房型" style="width: 100%" :loading="typesLoading">
            <el-option label="不指定（清空房型）" :value="0" />
            <el-option v-for="t in resourceTypes" :key="t.id" :label="roomTypeOptionLabel(t)" :value="t.id" />
          </el-select>
          <p class="tip-inline">
            房型按右上角当前门店上下文加载；不指定房型时按门店级单价计费，房型单价在「房型管理」中维护。
            <template v-if="form.storeId && contextStore.storeId && form.storeId !== contextStore.storeId">
              当前表单门店与门店上下文不一致，保存前会先切换上下文。
            </template>
          </p>
        </el-form-item>
        <el-form-item label="容纳人数">
          <el-input-number v-model="form.capacity" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="包厢图片">
          <ItemImageUploader v-model:images="form.imageUrls" v-model:main-image="form.mainImageUrl" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="255"
            show-word-limit
            placeholder="包厢介绍、可用设备、适合场合等（选填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 房型管理：门店级字典，包厢通过「房型」引用它，并按房型单价计费 -->
    <el-dialog v-model="typeDialogVisible" title="房型管理" width="880px">
      <p class="tip">
        房型是门店级字典：编码与名称在本门店内唯一，包厢通过「房型」引用；房型单价与门店级价共同决定
        「生效房费单价」（房型单价优先，为 0/空则回退门店级单价）。
        服务单价 = 每计费单位服务费，已含 1 名标准服务人员，超出按服务人员单价另计；
        结台与 C 端展示同一口径：包厢费 = 房型单价 + 服务单价。
      </p>
      <el-table :data="resourceTypes" v-loading="typesLoading" border stripe size="small" max-height="300">
        <el-table-column prop="code" label="编码" width="110" />
        <el-table-column prop="name" label="名称" min-width="110" show-overflow-tooltip />
        <el-table-column label="图片" width="112" align="center">
          <template #default="{ row }">
            <div v-if="typeImages(row).length" class="room-image">
              <div class="room-image__box">
                <img
                  v-if="typeThumb(row)"
                  class="room-image__thumb"
                  :src="typeThumb(row)"
                  alt="房型图片"
                  loading="lazy"
                  @error="markTypeImageFailed(row)"
                />
                <span v-else class="room-image__thumb room-image__thumb--empty">无图</span>
                <span v-if="typeThumb(row)" class="room-image__badge">主图</span>
              </div>
              <small class="room-image__count">共 {{ typeImages(row).length }} 张</small>
            </div>
            <span v-else class="room-image__none">无图</span>
          </template>
        </el-table-column>
        <el-table-column label="容纳人数" width="90" align="center">
          <template #default="{ row }">{{ row.capacity != null ? row.capacity + ' 人' : '—' }}</template>
        </el-table-column>
        <el-table-column :label="withCurrencyLabel('房型单价')" width="125" align="right">
          <template #default="{ row }">
            <span v-if="row.unitPrice != null">{{ formatMoney(row.unitPrice) }}</span>
            <span v-else class="cell-empty">回退门店价</span>
          </template>
        </el-table-column>
        <el-table-column :label="withCurrencyLabel('服务单价')" width="125" align="right">
          <template #default="{ row }">
            <span v-if="row.serverUnitPrice != null">{{ formatMoney(row.serverUnitPrice) }}</span>
            <span v-else class="cell-empty">回退门店价</span>
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="70" align="center" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="activeStatusType(row.status)" size="small">
              {{ roomTypeStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="165" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openTypeEdit(row)">编辑</el-button>
            <el-button
              link
              size="small"
              :type="row.status === 'DISABLED' ? 'success' : 'warning'"
              @click="toggleTypeStatus(row)"
            >{{ activeStatusActionText(row.status) }}</el-button>
            <el-button link type="danger" size="small" @click="removeType(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="该门店暂未维护房型" :image-size="60" /></template>
      </el-table>

      <el-divider content-position="left">{{ typeForm.id ? '编辑房型' : '新增房型' }}</el-divider>
      <el-form :model="typeForm" label-width="120px">
        <el-form-item label="编码" required>
          <el-input v-model="typeForm.code" maxlength="32" placeholder="如 SMALL（门店内唯一，保存时统一为大写）" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="typeForm.name" maxlength="64" placeholder="如 小包（门店内唯一）" />
        </el-form-item>
        <el-form-item label="容纳人数">
          <el-input-number v-model="typeForm.capacity" :min="1" :max="999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="房型图片">
          <!-- C 端「选择包厢类型」按房型展示，房型自带样板图（最多 9 张，主图用于卡片与列表） -->
          <ItemImageUploader v-model:images="typeForm.imageUrls" v-model:main-image="typeForm.mainImageUrl" />
        </el-form-item>
        <el-form-item :label="withCurrencyLabel('房型单价')">
          <el-input-number v-model="typeForm.unitPriceYuan" :min="0" :precision="2" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="withCurrencyLabel('服务单价')">
          <el-input-number v-model="typeForm.serverUnitPriceYuan" :min="0" :precision="2" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="typeForm.sortOrder" :min="0" :max="9999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="typeForm.status">
            <el-radio-button label="ACTIVE">{{ roomTypeStatusText('ACTIVE') }}</el-radio-button>
            <el-radio-button label="DISABLED">{{ roomTypeStatusText('DISABLED') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <p class="tip-inline">
        单价一律按当前币种的主单位输入与展示（单位与计价方案一致：最小货币单位/计费单位，提交时换算）；
        0 表示该房型不定价，计费回退门店级单价。
        服务单价 = 每计费单位服务费，已含 1 名标准服务人员，超出按服务人员单价另计。
      </p>
      <template #footer>
        <el-button @click="typeDialogVisible = false">关闭</el-button>
        <el-button v-if="typeForm.id" @click="resetTypeForm">取消编辑</el-button>
        <el-button type="primary" :loading="typeSaving" @click="saveType">
          {{ typeForm.id ? '保存房型' : '新增房型' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useContextStore } from '@/stores/context'
import { Check, CircleClose, Grid, Picture, Plus, Refresh, Setting, Tickets } from '@element-plus/icons-vue'
import OperationsBoard from '@/components/OperationsBoard.vue'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import {
  listResources,
  createResource,
  updateResource,
  listResourceTypes,
  createResourceType,
  updateResourceType,
  deleteResourceType,
} from '@/api/resource'
import { listStores } from '@/api/store'
import { parseImageUrls } from '@/api/media'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { formatMoney, formatTimeWithSeconds, fenToYuan, withCurrencyLabel, yuanToFen } from '@/utils/format'
import { TERMS, activeStatusActionText, activeStatusType, enabledStatusText, roomTypeStatusText } from '@/constants/terms'
import ItemImageUploader from '@/components/ItemImageUploader.vue'

/** 本页（包厢管理）固定维护的类型：服务人员资源在「KTV 配置 → 服务人员」维护。 */
const ROOM_RESOURCE_TYPE = 'KTV_ROOM'
/** 房型筛选项「未指定房型」的哨兵值（与真实房型 id 不冲突）。 */
const ROOM_TYPE_FILTER_NONE = 'none'

const rows = ref([])
const stores = ref([])
const contextStore = useContextStore()
const loading = ref(false)
const keyword = ref('')
/** 时间区间（创建时间 createdAt）：本看板查询条件不是 reactive 对象，区间单独一个 ref。 */
const range = ref(emptyDateRange())
const storeId = ref(null)
const statusFilter = ref('all')
const viewMode = ref('grid')
const lastUpdatedAt = ref(null)
const detailVisible = ref(false)
const detailResource = ref(null)
/** 房型筛选（替代原「类型」筛选）：按包厢所属房型过滤，与表单/列表的「房型」概念统一。 */
const roomTypeFilter = ref(null)
const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref()
/** 图片加载失败的资源：退回占位，避免表格里出现破图。 */
const failedImages = ref({})
/** 图片加载失败的**房型**：与资源分表存放，避免 id 相同的包厢与房型互相污染占位状态。 */
const failedTypeImages = ref({})
/** 房型字典：按需加载（打开包厢弹窗或房型管理时），不在列表首屏请求。 */
const resourceTypes = ref([])
const typesLoading = ref(false)
let typesLoaded = false
const typeDialogVisible = ref(false)
const typeSaving = ref(false)
const emptyTypeForm = () => ({
  id: null,
  code: '',
  name: '',
  capacity: 1,
  // 房型样板图（C 端「选择包厢类型」直接展示房型，图片落在房型本身，见 V8__res_room_type_media.sql）
  imageUrls: [],
  mainImageUrl: '',
  unitPriceYuan: 0,
  serverUnitPriceYuan: 0,
  sortOrder: 0,
  status: 'ACTIVE',
})
const typeForm = ref(emptyTypeForm())
const emptyForm = () => ({
  id: null,
  storeId: null,
  resourceCode: '',
  name: '',
  areaName: '',
  // 0 = 不指定/清空房型（后端约定：更新传 0 清空，创建传 null/不传表示不设置）。
  roomTypeId: 0,
  capacity: 8,
  imageUrls: [],
  mainImageUrl: '',
  description: '',
})
const form = ref(emptyForm())

const RESOURCE_STATUS_FILTERS = [
  { value: 'all', label: '全部', dot: false },
  { value: 'ENABLED', label: '启用', tone: 'succeeded' },
  { value: 'DISABLED', label: '停用', tone: 'cancelled' },
]

const isEditing = computed(() => form.value.id != null)
const dialogTitle = computed(() => (isEditing.value ? '编辑' : '新增') + TERMS.ktvRoom)

const rules = {
  storeId: [{ required: true, message: '请选择门店', trigger: 'change' }],
  resourceCode: [{ required: true, message: '请输入编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  description: [{ max: 255, message: '描述不能超过 255 个字符', trigger: 'blur' }],
}

const storeMap = computed(() => {
  const m = {}
  stores.value.forEach((s) => { m[s.id] = s.name })
  return m
})

const filteredRows = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  return rows.value.filter((resource) => {
    if (statusFilter.value !== 'all' && resource.status !== statusFilter.value) return false
    if (roomTypeFilter.value === ROOM_TYPE_FILTER_NONE && resource.roomTypeId != null) return false
    if (roomTypeFilter.value != null && roomTypeFilter.value !== '' && roomTypeFilter.value !== ROOM_TYPE_FILTER_NONE
      && Number(resource.roomTypeId) !== Number(roomTypeFilter.value)) return false
    if (!search) return true
    return [
      resource.resourceCode,
      resource.name,
      resource.areaName,
      resource.roomTypeName,
      resource.roomTypeCode,
      resource.description,
      storeName(resource.storeId),
      enabledStatusText(resource.status),
    ].filter((value) => value != null).some((value) => String(value).toLowerCase().includes(search))
  })
})

const resourceSummary = computed(() => {
  const summary = { total: rows.value.length, enabled: 0, disabled: 0, typed: 0, untyped: 0, imaged: 0 }
  rows.value.forEach((resource) => {
    if (resource.status === 'ENABLED') summary.enabled += 1
    else if (resource.status === 'DISABLED') summary.disabled += 1
    if (resource.roomTypeId || resource.roomTypeName) summary.typed += 1
    else summary.untyped += 1
    if (rowImages(resource).length) summary.imaged += 1
  })
  return summary
})

const resourceStats = computed(() => [
  { key: 'all', label: '全部包厢', value: resourceSummary.value.total, suffix: '间', icon: Grid, tone: 'total', filterValue: 'all', statusFilter: 'all' },
  { key: 'enabled', label: '启用', value: resourceSummary.value.enabled, suffix: '个', icon: Check, tone: 'succeeded', filterValue: 'ENABLED', statusFilter: 'ENABLED' },
  { key: 'disabled', label: '停用', value: resourceSummary.value.disabled, suffix: '个', icon: CircleClose, tone: 'cancelled', filterValue: 'DISABLED', statusFilter: 'DISABLED' },
  { key: 'typed', label: '已配房型', value: resourceSummary.value.typed, suffix: '间', icon: Setting, tone: 'average', clickable: false },
  { key: 'untyped', label: '未配房型', value: resourceSummary.value.untyped, suffix: '间', icon: Tickets, tone: 'pending', clickable: false },
  { key: 'imaged', label: '已有图片', value: resourceSummary.value.imaged, suffix: '个', icon: Picture, tone: 'idle', clickable: false },
])

const lastUpdatedText = computed(() => lastUpdatedAt.value ? `最后同步 ${formatTimeWithSeconds(lastUpdatedAt.value)}` : '等待首次同步')
const resourceEmptyText = computed(() => rows.value.length ? '没有符合当前筛选条件的包厢' : '暂无包厢')

/** 房型下拉按需加载：展开筛选时再取字典，首屏仍只请求资源与门店。 */
function onRoomTypeFilterOpen(visible) {
  if (visible) loadResourceTypes()
}

function storeName(id) {
  return storeMap.value[id] || (id ? '门店 #' + id : '—')
}
function roomTypeName(resource) {
  if (!resource.roomTypeName) return '未指定'
  return resource.roomTypeName + (resource.roomTypeCode ? `（${resource.roomTypeCode}）` : '')
}
function detailRoomTypeName(resource) {
  return roomTypeName(resource)
}
function resourceStatusClass(status) {
  return status === 'ENABLED' ? 'enabled' : status === 'DISABLED' ? 'disabled' : 'unknown'
}
function handleStatClick(stat) {
  if (stat.statusFilter != null) statusFilter.value = stat.statusFilter
}
function openResourceDetail(resource) {
  detailResource.value = resource
  detailVisible.value = true
}
/** 图片列可能是 JSON 数组或 JSON 数组字符串（历史数据），统一解析。 */
function rowImages(row) {
  return parseImageUrls(row?.imageUrls)
}
/** 主图必须属于列表；列表非空但主图缺失/不合法时退回第一张，与后端规则一致。 */
function rowThumb(row) {
  const urls = rowImages(row)
  if (!urls.length || failedImages.value[row.id]) return ''
  const main = typeof row.mainImageUrl === 'string' ? row.mainImageUrl.trim() : ''
  return main && urls.includes(main) ? main : urls[0]
}
function markRowImageFailed(row) {
  failedImages.value = { ...failedImages.value, [row.id]: true }
}
/** 房型图片列（与包厢同一解析规则：可能是 JSON 数组或 JSON 数组字符串）。 */
function typeImages(row) {
  return parseImageUrls(row?.imageUrls)
}
/** 房型缩略图：主图优先，缺失/不合法时退回第一张（与后端「主图必须属于列表」同规则）。 */
function typeThumb(row) {
  const urls = typeImages(row)
  if (!urls.length || failedTypeImages.value[row.id]) return ''
  const main = typeof row.mainImageUrl === 'string' ? row.mainImageUrl.trim() : ''
  return main && urls.includes(main) ? main : urls[0]
}
function markTypeImageFailed(row) {
  failedTypeImages.value = { ...failedTypeImages.value, [row.id]: true }
}
async function load() {
  // 本看板没有「查询」按钮，守卫放在加载入口：区间倒挂时只提示、不发请求。
  const warning = dateRangeWarning(range.value)
  if (warning) { ElMessage.warning(warning); return }
  loading.value = true
  try {
    rows.value = (await listResources({
      // 本页只维护包厢：类型固定 KTV_ROOM（服务人员资源在 KTV 配置页维护），不再由查询条件决定。
      resourceType: 'KTV_ROOM',
      storeId: storeId.value || undefined,
      ...dateRangeParams(range.value),
    })) || []
    lastUpdatedAt.value = new Date()
    if (detailResource.value) {
      detailResource.value = rows.value.find((resource) => resource.id === detailResource.value.id) || null
      if (!detailResource.value) detailVisible.value = false
    }
  } catch (e) {
    notifyAdminRequestError(e, '加载资源失败')
  } finally {
    loading.value = false
  }
}

async function loadStores() {
  try { stores.value = (await listStores()) || [] } catch (e) { /* 门店加载失败不阻塞资源列表 */ }
}

async function openCreate() {
  typeDialogVisible.value = false
  detailVisible.value = false
  form.value = {
    ...emptyForm(),
    storeId: storeId.value || contextStore.storeId || null,
  }
  formRef.value?.clearValidate()
  await nextTick()
  dialogVisible.value = true
  // 房型下拉按需加载：只在真正需要选择时才请求，首屏列表不带这次请求。
  // 房型是门店级字典，租户级上下文（无门店）下不请求，避免弹无意义的上下文错误。
  if (form.value.storeId) loadResourceTypes()
}

/** 编辑回填：图片与主图来自列表接口，主图缺失时按后端规则取第一张，保证上传组件有主图角标。 */
function openEdit(row) {
  const urls = rowImages(row)
  const main = typeof row.mainImageUrl === 'string' ? row.mainImageUrl.trim() : ''
  form.value = {
    id: row.id,
    storeId: row.storeId ?? null,
    resourceCode: row.resourceCode || '',
    name: row.name || '',
    areaName: typeof row.areaName === 'string' ? row.areaName : '',
    roomTypeId: row.roomTypeId ?? 0,
    capacity: row.capacity ?? 1,
    imageUrls: urls,
    mainImageUrl: urls.includes(main) ? main : (urls[0] || ''),
    description: row.description || '',
  }
  formRef.value?.clearValidate()
  detailVisible.value = false
  dialogVisible.value = true
  if (form.value.storeId) loadResourceTypes()
}

/**
 * 资源归属门店由运行上下文决定：所选门店与当前上下文不一致（或当前是租户级上下文）时先切换上下文，
 * 否则服务端会以 STORE_SCOPE_DENIED 拒绝，用户看到的就是「创建失败」。
 */
async function switchToStore(tenantId, targetStoreId) {
  const target = contextStore.items.find((item) => item.tenantId === tenantId && item.storeId === targetStoreId)
  if (!target) throw new Error('当前账号没有该门店的运营上下文，请先在右上角切换到该门店')
  await contextStore.select(target.contextId)
  // 房型是门店级字典：上下文换了，缓存必须失效，下次需要时按新门店重新拉取。
  typesLoaded = false
  ElMessage.success(`已切换到「${storeName(targetStoreId)}」门店上下文`)
}

async function save() {
  if (saving.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) { ElMessage.warning('请先补全表单中标 * 的必填项'); return }
  const tenantId = contextStore.tenantId
  if (!tenantId) { ElMessage.error('缺少租户上下文，无法保存'); return }
  saving.value = true
  try {
    if (contextStore.storeId !== form.value.storeId) {
      await switchToStore(tenantId, form.value.storeId)
      // 切换后房型字典缓存已失效：已选房型时按新门店立即重取，避免下拉里显示成裸 id。
      if (form.value.roomTypeId) await loadResourceTypes(true)
    }
    const payload = {
      name: form.value.name,
      areaName: form.value.areaName,
      // 编辑时「不指定」提交 0（服务端按 0 清空房型）；创建时 0 会被服务端判为非法，统一提交 null（不设置）。
      roomTypeId: form.value.roomTypeId || (isEditing.value ? 0 : null),
      capacity: form.value.capacity,
      imageUrls: form.value.imageUrls,
      mainImageUrl: form.value.mainImageUrl,
      description: form.value.description,
    }
    if (isEditing.value) {
      await updateResource(form.value.id, payload)
      ElMessage.success('已保存')
    } else {
      await createResource({
        tenantId,
        storeId: form.value.storeId,
        // 本页只创建包厢：类型固定 KTV_ROOM（不再由表单选择，避免与「房型」混淆）。
        resourceType: ROOM_RESOURCE_TYPE,
        resourceCode: form.value.resourceCode,
        ...payload,
      })
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '保存失败')
  } finally {
    saving.value = false
  }
}

// —— 房型管理（门店级字典）————————————————————————————————————————
/** 房型列表按需加载：只在打开包厢弹窗或房型管理时请求一次（同一门店上下文内复用）。 */
async function loadResourceTypes(force = false) {
  if (typesLoaded && !force) return
  typesLoading.value = true
  try {
    resourceTypes.value = (await listResourceTypes()) || []
    typesLoaded = true
  } catch (e) {
    resourceTypes.value = []
    notifyAdminRequestError(e, '加载房型失败')
  } finally {
    typesLoading.value = false
  }
}

/** 下拉展示：名称（编码）· 容纳 N 人；已停用房型仍可被引用，但明确标注。 */
function roomTypeOptionLabel(item) {
  const name = item?.name || item?.code || `房型 #${item?.id}`
  const code = item?.code && item?.name ? `（${item.code}）` : ''
  const capacity = item?.capacity ? ` · 容纳 ${item.capacity} 人` : ''
  const disabled = item?.status === 'DISABLED' ? ' · 已停用' : ''
  return `${name}${code}${capacity}${disabled}`
}

function openTypeManage() {
  typeDialogVisible.value = true
  loadResourceTypes(true)
}

function resetTypeForm() {
  typeForm.value = emptyTypeForm()
}

function openTypeEdit(row) {
  const urls = typeImages(row)
  const main = typeof row.mainImageUrl === 'string' ? row.mainImageUrl.trim() : ''
  typeForm.value = {
    id: row.id,
    code: row.code || '',
    name: row.name || '',
    capacity: row.capacity ?? 1,
    // 图片列表与主图：主图必须落在列表里，否则退回第一张（与后端规则一致，避免提交被 400 拒绝）。
    imageUrls: urls,
    mainImageUrl: urls.includes(main) ? main : (urls[0] || ''),
    // 最小货币单位 → 主单位回填（页面只出现主单位金额）；0 表示「不定价，回退门店级单价」。
    unitPriceYuan: row.unitPrice != null ? fenToYuan(row.unitPrice) : 0,
    serverUnitPriceYuan: row.serverUnitPrice != null ? fenToYuan(row.serverUnitPrice) : 0,
    sortOrder: row.sortOrder ?? 0,
    status: row.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
  }
}

async function saveType() {
  if (typeSaving.value) return
  const draft = typeForm.value
  const code = (draft.code || '').trim()
  const name = (draft.name || '').trim()
  if (!code) { ElMessage.warning('请输入房型编码'); return }
  if (code.length > 32) { ElMessage.warning('房型编码不能超过 32 个字符'); return }
  if (!name) { ElMessage.warning('请输入房型名称'); return }
  if (name.length > 64) { ElMessage.warning('房型名称不能超过 64 个字符'); return }
  if (draft.capacity != null && (!Number.isInteger(Number(draft.capacity)) || Number(draft.capacity) <= 0)) {
    ElMessage.warning('容纳人数必须为大于 0 的整数'); return
  }
  if (Number(draft.unitPriceYuan) < 0 || Number(draft.serverUnitPriceYuan) < 0) {
    ElMessage.warning('单价不能为负数（0 表示回退门店级单价）'); return
  }
  // 图片与主图：C 端「选择包厢类型」卡片用主图，多图用于详情预览；空数组 = 清空图片。
  const typeImagesDraft = Array.isArray(draft.imageUrls) ? draft.imageUrls.filter((url) => url && String(url).trim()) : []
  const payload = {
    code,
    name,
    capacity: draft.capacity == null ? null : Number(draft.capacity),
    imageUrls: typeImagesDraft,
    mainImageUrl: typeImagesDraft.includes(draft.mainImageUrl) ? draft.mainImageUrl : '',
    // 主单位 → 最小货币单位：0 传给服务端表示「清空单价，回退门店级单价」。
    unitPrice: yuanToFen(draft.unitPriceYuan),
    serverUnitPrice: yuanToFen(draft.serverUnitPriceYuan),
    sortOrder: draft.sortOrder == null ? 0 : Number(draft.sortOrder),
    status: draft.status || 'ACTIVE',
  }
  typeSaving.value = true
  try {
    if (draft.id) {
      await updateResourceType(draft.id, payload)
      ElMessage.success('房型已保存')
    } else {
      await createResourceType(payload)
      ElMessage.success('房型已新增')
    }
    resetTypeForm()
    await loadResourceTypes(true)
    // 房型名称/单价会回填到资源列表列上，一并刷新。
    await load()
  } catch (e) {
    // 重码 / 重名 / 参数非法：错误码已由 utils/adminErrorMessage 映射为中文提示。
    notifyAdminRequestError(e, '保存房型失败')
  } finally {
    typeSaving.value = false
  }
}

async function toggleTypeStatus(row) {
  const next = row.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED'
  const action = activeStatusActionText(next)
  try {
    await ElMessageBox.confirm(
      `${action}房型「${row.name || row.code}」？${next === 'DISABLED' ? '停用后不影响已引用它的包厢计费，但不再建议分配给新包厢。' : ''}`,
      `${action}房型`,
      { type: 'warning' },
    )
  } catch (e) {
    return
  }
  try {
    await updateResourceType(row.id, { status: next })
    ElMessage.success(`已${action}`)
    await loadResourceTypes(true)
  } catch (e) {
    notifyAdminRequestError(e, `${action}房型失败`)
  }
}

async function removeType(row) {
  try {
    await ElMessageBox.confirm(
      `删除房型「${row.name || row.code}」？仍被包厢引用时服务端会拒绝删除，需先把这些包厢改到其他房型。`,
      '删除房型',
      { type: 'warning' },
    )
  } catch (e) {
    return
  }
  try {
    await deleteResourceType(row.id)
    ElMessage.success('房型已删除')
    await loadResourceTypes(true)
  } catch (e) {
    notifyAdminRequestError(e, '删除房型失败')
  }
}

onMounted(() => { load(); loadStores() })
</script>

<style scoped>
.resources-board-page {
  --resource-green: #21a876;
  --resource-red: #e2545f;
  --resource-blue: #3478f6;
  --resource-purple: #7658c9;
}
.store-filter,
.room-type-filter { width: 190px; }
.resource-grid {
  padding: 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(245px, 1fr));
  gap: 20px;
  background: #fafbfc;
}
.resource-card {
  min-width: 0;
  min-height: 350px;
  position: relative;
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
.resource-card:hover { transform: translateY(-2px); border-color: #cbdaf3; box-shadow: 0 10px 25px rgba(31, 44, 74, .1); }
.resource-card.disabled { opacity: .78; }
.resource-cover { height: 138px; position: relative; overflow: hidden; background: linear-gradient(135deg, #edf3ff, #e7eef9); }
.resource-cover img { width: 100%; height: 100%; display: block; object-fit: cover; transition: transform .25s; }
.resource-card:hover .resource-cover img { transform: scale(1.025); }
.resource-cover.empty { display: grid; place-items: center; color: #7890b4; font-size: 34px; }
.resource-card.server .resource-cover.empty { color: #775dc1; background: linear-gradient(135deg, #f2edff, #eae3fb); }
.image-count,
.resource-type { position: absolute; top: 10px; padding: 4px 8px; border-radius: 13px; color: #fff; background: rgba(24, 33, 49, .68); font-size: 10px; backdrop-filter: blur(4px); }
.image-count { right: 10px; }
.resource-type { left: 10px; }
.resource-body { min-height: 0; flex: 1; padding: 15px 16px 16px; display: flex; flex-direction: column; }
.resource-card-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.resource-title { min-width: 0; flex: 1; }
.resource-title strong { display: block; overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.resource-title span { display: block; margin-top: 4px; color: var(--el-text-color-secondary); font-size: 11px; }
.resource-status { flex: none; padding: 4px 8px; border-radius: 13px; color: #68707e; background: #f0f2f5; font-size: 11px; font-weight: 600; }
.enabled .resource-status,
.resource-status.enabled { color: #16895f; background: #eaf8f2; }
.disabled .resource-status,
.resource-status.disabled { color: #68707e; background: #eceff3; }
.resource-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; padding: 10px 0; border-top: 1px dashed var(--el-border-color); }
.resource-meta div { min-width: 0; display: flex; gap: 5px; font-size: 11px; }
.resource-meta span { flex: none; color: var(--el-text-color-placeholder); }
.resource-meta b { min-width: 0; overflow: hidden; color: var(--el-text-color-regular); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.resource-description { min-height: 34px; margin: 8px 0 12px; overflow: hidden; display: -webkit-box; color: var(--el-text-color-secondary); font-size: 11px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.resource-actions { display: flex; align-items: center; gap: 7px; margin-top: auto; }
.resource-actions > span { min-width: 0; flex: 1; overflow: hidden; color: var(--el-text-color-placeholder); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.resource-actions > .el-button { margin-left: 0; }

.resource-grid.list-mode { grid-template-columns: 1fr; }
.resource-grid.list-mode .resource-card { min-height: 150px; display: grid; grid-template-columns: 190px minmax(0, 1fr); }
.resource-grid.list-mode .resource-cover { height: 100%; min-height: 148px; }
.resource-grid.list-mode .resource-body { display: grid; grid-template-columns: minmax(180px, .7fr) minmax(300px, 1.2fr) minmax(180px, .7fr) minmax(220px, .8fr); align-items: center; gap: 20px; }
.resource-grid.list-mode .resource-card-head,
.resource-grid.list-mode .resource-description { margin: 0; }
.resource-grid.list-mode .resource-meta { padding: 0; border: 0; }
.resource-grid.list-mode .resource-actions { margin: 0; }

.drawer-title { width: 100%; padding-right: 8px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.drawer-title h3 { margin: 0; color: var(--el-text-color-primary); font-size: 20px; }
.drawer-title p { margin: 5px 0 0; color: var(--el-text-color-secondary); font-size: 12px; }
.detail-cover { height: 220px; margin-bottom: 18px; overflow: hidden; border-radius: 12px; background: var(--el-fill-color-light); }
.detail-cover img { width: 100%; height: 100%; display: block; object-fit: cover; }
.detail-cover.empty { display: grid; place-items: center; color: var(--el-text-color-placeholder); }
.detail-cover.empty > div { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.detail-cover.empty .el-icon { font-size: 35px; }
.detail-cover.empty span { font-size: 12px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--el-border-color-lighter); border-radius: 9px; overflow: hidden; }
.detail-grid > div { min-width: 0; padding: 12px; border-right: 1px solid var(--el-border-color-lighter); border-bottom: 1px solid var(--el-border-color-lighter); }
.detail-grid > div:nth-child(2n) { border-right: 0; }
.detail-grid > .detail-wide { grid-column: 1 / -1; border-right: 0; border-bottom: 0; }
.detail-grid span { display: block; margin-bottom: 4px; color: var(--el-text-color-placeholder); font-size: 10px; }
.detail-grid b { display: block; overflow-wrap: anywhere; color: var(--el-text-color-regular); font-size: 12px; }

.tip { margin: 0 0 12px; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.5; }
.tip-inline { flex: 1 0 100%; margin: 6px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
.cell-empty { color: var(--el-text-color-placeholder); }
.cell-type small { color: var(--el-text-color-secondary); }
.room-image { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.room-image__box { position: relative; width: 44px; height: 44px; }
.room-image__thumb { display: block; width: 44px; height: 44px; border-radius: 6px; object-fit: cover; background: #f2f3f5; }
.room-image__thumb--empty { display: grid; place-items: center; color: var(--el-text-color-placeholder); font-size: 11px; }
.room-image__badge {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0 4px;
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 6px 0 6px 0;
  font-size: 10px;
  line-height: 14px;
}
.room-image__count { color: var(--el-text-color-secondary); font-size: 11px; }
.room-image__none { color: var(--el-text-color-placeholder); }

@media (max-width: 1500px) {
  .resource-grid { grid-template-columns: repeat(3, minmax(235px, 1fr)); }
}
@media (max-width: 1180px) {
  .resource-grid { grid-template-columns: repeat(2, minmax(230px, 1fr)); }
  .resource-grid.list-mode .resource-card { grid-template-columns: 160px minmax(0, 1fr); }
  .resource-grid.list-mode .resource-body { grid-template-columns: minmax(180px, .8fr) 1fr; }
}
@media (max-width: 720px) {
  .resource-grid { grid-template-columns: 1fr; padding: 12px; gap: 16px; }
  .resource-grid.list-mode .resource-card { display: flex; }
  .resource-grid.list-mode .resource-cover { height: 138px; min-height: 138px; }
  .resource-grid.list-mode .resource-body { display: flex; }
  .store-filter,
  .room-type-filter { width: 100%; }
}
</style>
