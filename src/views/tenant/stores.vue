<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>门店</h2>
      <div class="header-actions">
        <!-- 申请制：新增/编辑/停用/启用/关闭/删除全部提交「门店变更申请」，平台审批通过后才生效。
             门店上下文下这些入口不可用（租户级数据 + 服务端会 400 拒绝），见下方提示条。 -->
        <el-button v-if="canSubmitChange" type="primary" :disabled="isStoreScope" @click="openCreate">
          <el-icon><Plus /></el-icon>{{ CHANGE_TEXT.createTitle }}
        </el-button>
        <el-button v-if="canSubmitChange" :disabled="isStoreScope" @click="openRecords">
          <el-icon><Document /></el-icon>{{ CHANGE_TEXT.recordsTitle }}
        </el-button>
        <!-- 币种是租户级配置（门店列展示的是写穿后的租户币种），入口挂在门店设置旁边 -->
        <el-button v-if="canManageWorkspace" @click="workspaceVisible = true">
          <el-icon><Setting /></el-icon>工作区模式
        </el-button>
        <el-button v-if="canManageCurrency" @click="router.push('/admin/tenant/currency')">
          <el-icon><Money /></el-icon>{{ TERMS.currency }}
        </el-button>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="!canSubmitChange"
      class="store-alert"
      type="info"
      show-icon
      :closable="false"
      :title="CHANGE_TEXT.adminOnlyHint"
    />
    <!-- 门店上下文：申请/变更记录都是租户级数据，提交还会被服务端 400 拒绝；
         这里显式告知并提供一键切回总部，避免点下去静默失败。 -->
    <el-alert
      v-if="canSubmitChange && isStoreScope"
      class="store-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="CHANGE_TEXT.storeScopeHint"
    >
      <el-button link type="primary" @click="switchToHeadquarter">
        {{ CHANGE_TEXT.switchToHeadquarter }}
      </el-button>
    </el-alert>
    <el-alert
      v-if="canSubmitChange && !isStoreScope && pendingLoadFailed"
      class="store-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="CHANGE_TEXT.pendingLoadFailedHint"
    />

    <!-- 待审批的新增门店申请：CREATE 审批通过前不创建门店行，必须单独提示，否则运营会以为提交丢了。 -->
    <section v-if="pendingCreates.length" class="admin-card pending-create-card">
      <div class="section-title">{{ CHANGE_TEXT.pendingCreateTitle }}</div>
      <p class="subtle">{{ CHANGE_TEXT.pendingCreateHint }}</p>
      <div class="pending-create-list">
        <div v-for="request in pendingCreates" :key="request.id" class="pending-create-item">
          <div class="pending-create-copy">
            <strong>{{ pendingCreateName(request) }}</strong>
            <span class="pending-create-code">{{ pendingCreateCode(request) }}</span>
            <small>{{ requestSummaryText(request) }}</small>
            <small>理由：{{ request.reason || '—' }} · 提交于 {{ formatTime(request.createdAt) }}</small>
          </div>
          <el-button
            v-if="canSubmitChange"
            link
            type="danger"
            size="small"
            :loading="cancellingId === request.id"
            @click="cancelRequest(request)"
          >撤销申请</el-button>
        </div>
      </div>
    </section>

    <section v-if="onboardingIssues.length" class="admin-card onboarding-card">
      <div class="section-title">门店开通清单</div>
      <p class="subtle">以下门店还缺少业务类型或时区，补齐后才适合进入日常经营。</p>
      <div class="onboarding-list">
        <div v-for="store in onboardingIssues" :key="store.id" class="onboarding-item">
          <strong>{{ store.name }}</strong>
          <span>{{ store.businessType ? '缺少时区' : '缺少业务类型' }}</span>
        </div>
      </div>
    </section>

    <div class="admin-card">
      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="门店名称 / 编号" clearable style="width: 240px" />
        <el-select v-model="status" placeholder="状态" clearable style="width: 150px">
          <el-option label="营业中" value="ACTIVE" />
          <el-option label="停用" value="SUSPENDED" />
          <el-option label="已关闭" value="CLOSED" />
          <el-option label="已删除" value="DELETED" />
        </el-select>
      </div>

      <el-table :data="filteredRows" v-loading="loading" border stripe>
        <el-table-column prop="code" label="门店编号" width="160" />
        <el-table-column label="Logo" width="92" align="center">
          <template #default="{ row }">
            <div class="store-logo-cell">
              <el-avatar v-if="row.logoUrl" shape="square" :size="38" :src="row.logoUrl" />
              <el-avatar v-else shape="square" :size="38">{{ (row.name || '店').slice(0, 1) }}</el-avatar>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="门店名称" min-width="180" />
        <el-table-column label="业务类型" width="100" align="center">
          <template #default="{ row }">{{ row.businessTypeName || businessTypeText(row.businessType) }}</template>
        </el-table-column>
        <el-table-column label="币种" width="140" align="center">
          <!-- 币种是租户级唯一来源（tnt_tenant_config.currency），门店随租户统一；
               门店行上的 default_currency 由后端写穿，页面不再各读一个来源。 -->
          <template #default>{{ currencyStore.label }}（{{ currencyStore.symbol }}）</template>
        </el-table-column>
        <el-table-column prop="timezone" label="时区" width="140" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="storeStatusType(row.status)">{{ storeStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审批" width="160" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.pendingRequest" type="warning">{{ pendingRequestLabel(row.pendingRequest) }}</el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" align="center" fixed="right">
          <template #default="{ row }">
            <template v-if="canSubmitChange">
              <!-- 窄屏下按钮换行而不是被裁掉（操作列 fixed 宽度有限） -->
              <div class="row-actions">
                <el-button
                  v-for="action in actionsOf(row)"
                  :key="action.key"
                  link
                  size="small"
                  :type="action.key === 'DELETE' ? 'danger' : 'primary'"
                  :disabled="action.disabled || isStoreScope"
                  @click="openAction(action, row)"
                >{{ action.label }}</el-button>
              </div>
              <span v-if="row.pendingRequest" class="pending-hint">{{ CHANGE_TEXT.pendingRowHint }}</span>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无门店" />
        </template>
      </el-table>

      <p class="currency-hint">币种为租户级配置，全部门店统一；历史已结算单据按自身币种快照展示。</p>
    </div>

    <!-- 申请抽屉：CREATE/UPDATE 复用同一套字段；STATUS/DELETE 只填理由并展示影响说明。 -->
    <el-drawer
      v-model="formDrawerVisible"
      :title="formTitle"
      size="min(680px, 94vw)"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="110px"
        scroll-to-error
      >
        <template v-if="isFieldForm">
          <el-alert
            class="form-alert"
            type="info"
            show-icon
            :closable="false"
            :title="CHANGE_TEXT.createDefaultsHint"
          />
          <el-form-item label="门店编号" prop="code">
            <el-input
              v-model="form.code"
              :disabled="formAction.requestType !== 'CREATE'"
              placeholder="门店内唯一，如 SZ-001"
            />
            <p v-if="formAction.requestType !== 'CREATE'" class="field-hint">门店编号创建后不可修改，编辑申请不包含编号。</p>
          </el-form-item>
          <el-form-item label="门店名称" prop="name">
            <el-input v-model="form.name" maxlength="128" show-word-limit placeholder="门店名称" />
          </el-form-item>
          <el-form-item label="业务类型" prop="businessType">
            <el-select v-model="form.businessType" style="width: 100%" placeholder="选择业务类型">
              <el-option
                v-for="type in businessTypeOptions"
                :key="type"
                :label="businessTypeText(type)"
                :value="type"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="时区" prop="timezone">
            <el-select v-model="form.timezone" filterable allow-create style="width: 100%" placeholder="如 Asia/Shanghai">
              <el-option v-for="zone in TIMEZONE_OPTIONS" :key="zone" :label="zone" :value="zone" />
            </el-select>
          </el-form-item>
          <el-form-item label="营业日切点" prop="businessDayCutoff">
            <el-time-picker
              v-model="form.businessDayCutoff"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="如 04:00"
              style="width: 100%"
            />
            <p class="field-hint">营业日切点取 00:00–12:00，凌晨场次归前一营业日。</p>
          </el-form-item>
          <el-form-item label="所属组织">
            <el-select v-model="form.organizationId" style="width: 100%" placeholder="未归属组织">
              <el-option label="未归属组织" :value="0" />
              <el-option
                v-for="org in organizationOptions"
                :key="org.id"
                :label="org.name"
                :value="org.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="门店 Logo">
            <ImageUrlEditor
              v-model="form.logoUrl"
              label="门店 Logo"
              alt="门店 Logo 预览"
              :recommended-width="512"
              :recommended-height="512"
              :min-width="128"
              :min-height="128"
              :max-size-mb="1"
              aspect="1 / 1"
            />
          </el-form-item>
        </template>
        <el-alert
          v-else
          class="form-alert"
          :type="formAction.requestType === 'DELETE' ? 'warning' : 'info'"
          show-icon
          :closable="false"
          :title="statusActionHint"
        />
        <el-divider content-position="left">申请信息</el-divider>
        <el-form-item :label="CHANGE_TEXT.reasonLabel" prop="reason">
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            maxlength="512"
            show-word-limit
            :placeholder="CHANGE_TEXT.reasonPlaceholder"
          />
          <p class="field-hint">{{ CHANGE_TEXT.reasonHint }}</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDrawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">{{ CHANGE_TEXT.submit }}</el-button>
      </template>
    </el-drawer>

    <!-- 变更记录：本租户申请单（状态/摘要/理由/审批意见/时间），PENDING 可撤销。 -->
    <el-drawer v-model="recordsVisible" :title="CHANGE_TEXT.recordsTitle" size="min(760px, 96vw)">
      <div class="filter-bar records-filter">
        <el-select v-model="recordStatus" placeholder="申请状态" clearable style="width: 150px" @change="searchRecords">
          <el-option
            v-for="option in REQUEST_STATUS_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-button :loading="recordsLoading" @click="loadRecords">刷新</el-button>
      </div>
      <el-table :data="records" v-loading="recordsLoading" border stripe size="small">
        <el-table-column label="提交时间" width="150">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">{{ requestTypeText(row.requestType) }}</template>
        </el-table-column>
        <el-table-column label="摘要" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ requestSummaryText(row) }}</template>
        </el-table-column>
        <el-table-column label="申请理由" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="requestStatusType(row.status)">{{ requestStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审批意见" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reviewComment || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'PENDING' && canSubmitChange"
              link
              type="danger"
              size="small"
              :disabled="isStoreScope"
              :loading="cancellingId === row.id"
              @click="cancelRequest(row)"
            >撤销</el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="CHANGE_TEXT.recordsEmpty" />
        </template>
      </el-table>
      <div class="admin-pagination">
        <el-pagination
          layout="total, prev, pager, next"
          :total="recordPage.total"
          v-model:current-page="recordPage.page"
          v-model:page-size="recordPage.pageSize"
          @current-change="loadRecords"
        />
      </div>
    </el-drawer>

    <el-dialog v-model="workspaceVisible" title="门店工作区模式" width="480px">
      <el-radio-group v-model="workspaceMode" class="workspace-mode">
        <el-radio value="INDEPENDENT">门店独立工作台</el-radio>
        <p class="subtle">店长登录只进入门店工作台，不看到租户总部。</p>
        <el-radio value="TENANT_CONTEXT">租户后台内门店上下文</el-radio>
        <p class="subtle">门店作为租户后台内的经营上下文，适合小客户统一管理。</p>
      </el-radio-group>
      <template #footer>
        <el-button @click="workspaceVisible = false">取消</el-button>
        <el-button type="primary" :loading="workspaceSaving" @click="saveWorkspaceMode">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Money, Plus, Refresh, Setting } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import ImageUrlEditor from '@/components/ImageUrlEditor.vue'
import {
  cancelStoreChangeRequest,
  getStoreCreateDefaults,
  listStoreChangeRequests,
  listStores,
  submitStoreChangeRequest,
} from '@/api/store'
import { getStoreWorkspaceMode, updateStoreWorkspaceMode } from '@/api/tenantWorkspace'
import {
  STORE_CHANGE_FORM_TEXT as CHANGE_TEXT,
  STORE_CHANGE_VALIDATION_TEXT as VALIDATION,
  TERMS,
  businessTypeText,
  storeChangeActionText,
  storeStatusText,
  storeStatusType,
} from '@/constants/terms'
import {
  STORE_CODE_PATTERN,
  buildChangeRequestBody,
  buildStoreChangeActions,
  createIdempotencyKey,
  emptyStoreChangeForm,
  isValidBusinessDayCutoff,
  isValidTimezone,
  mergePendingRequests,
  normalizeChangeRequestPage,
  normalizeCreateDefaults,
  organizationOptionsWithCurrent,
  pendingCreateRequests,
  pendingRequestLabel,
  requestStatusOptions,
  requestStatusText,
  requestStatusType,
  requestSummaryText,
  requestTypeText,
  storeChangeFormFromRow,
  validateChangeRequest,
  withCurrentOption,
} from '@/utils/storeChangeForm'
import { formatTime } from '@/utils/format'
import { hasPermission } from '@/utils/context'
import { useContextStore } from '@/stores/context'
import { useCurrencyStore } from '@/stores/currency'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const router = useRouter()
const contextStore = useContextStore()
/** 全站币种唯一来源：门店列表按租户币种展示，不再逐店读自身字段。 */
const currencyStore = useCurrencyStore()

/** 常用 IANA 时区候选（服务端仍做权威校验，这里只减少手输）。 */
const TIMEZONE_OPTIONS = [
  'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei', 'Asia/Tokyo',
  'Asia/Seoul', 'Asia/Singapore', 'Asia/Bangkok', 'Asia/Dubai', 'Europe/London',
  'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'UTC',
]
const REQUEST_STATUS_OPTIONS = requestStatusOptions()

const storeRows = ref([])
const pendingRequests = ref([])
const loading = ref(false)
const keyword = ref('')
const status = ref('')
const workspaceVisible = ref(false)
const workspaceSaving = ref(false)
const workspaceMode = ref('INDEPENDENT')

const createDefaults = ref(normalizeCreateDefaults(null))

const formDrawerVisible = ref(false)
const submitting = ref(false)
const formRef = ref()
const formAction = ref({ key: 'CREATE', requestType: 'CREATE', targetStatus: null, row: null })
const form = ref({ ...emptyStoreChangeForm(null), reason: '' })

const recordsVisible = ref(false)
const recordsLoading = ref(false)
const records = ref([])
const recordStatus = ref('')
const recordPage = reactive({ page: 1, pageSize: 20, total: 0 })
const cancellingId = ref(null)
/** 待审批申请（行内「审批中」标签）加载失败：不能静默，页面顶部提示重试。 */
const pendingLoadFailed = ref(false)

/** 门店变更申请（提交/查看记录）统一要求 `tenant.tenant.manage`；店长不持有该权限。 */
const canSubmitChange = computed(() => hasPermission(contextStore.current?.permissions, 'tenant.tenant.manage'))
const canManageWorkspace = canSubmitChange
/** 门店级上下文（storeId 非空）：申请单/变更记录/撤销都是租户级动作，页面禁用并提示切回总部。 */
const isStoreScope = computed(() => {
  const storeId = contextStore.current?.storeId
  return storeId !== null && storeId !== undefined && Number(storeId) !== 0
})
/** 币种设置入口按权限显示（与后端 tenant.currency.manage 同码），越权由后端强制 403。 */
const canManageCurrency = computed(() => hasPermission(contextStore.current?.permissions, 'tenant.currency.manage'))

/** 列表数据 = 门店行 + 合并进来的 PENDING 申请（行内「审批中」标签与按钮置灰依据）。 */
const rows = computed(() => mergePendingRequests(storeRows.value, pendingRequests.value))
const pendingCreates = computed(() => pendingCreateRequests(pendingRequests.value))

const filteredRows = computed(() => {
  let list = rows.value
  if (status.value) list = list.filter((r) => r.status === status.value)
  const k = keyword.value.trim()
  if (k) list = list.filter((r) => (r.code || '').includes(k) || (r.name || '').includes(k))
  return list
})

const onboardingIssues = computed(() =>
  storeRows.value.filter((store) => !store.businessType || !store.timezone),
)

const businessTypeOptions = computed(() => withCurrentOption(createDefaults.value.businessTypes, form.value.businessType))
const organizationOptions = computed(() => organizationOptionsWithCurrent(
  createDefaults.value.organizations,
  form.value.organizationId,
))

/** 字段表单（CREATE/UPDATE）与纯理由表单（STATUS/DELETE）共用同一个抽屉。 */
const isFieldForm = computed(() => (
  formAction.value.requestType === 'CREATE' || formAction.value.requestType === 'UPDATE'
))

const formTitle = computed(() => {
  const action = formAction.value
  if (action.requestType === 'CREATE') return CHANGE_TEXT.createTitle
  if (action.requestType === 'UPDATE') return CHANGE_TEXT.updateTitle
  if (action.requestType === 'STATUS') return storeChangeActionText(action.key)
  return CHANGE_TEXT.deleteTitle
})

const statusActionHint = computed(() => {
  const action = formAction.value
  const store = action.row || {}
  if (action.requestType === 'DELETE') {
    return `申请删除门店「${store.name || store.code || ''}」：审批通过后门店归档，同编号不可复用；已产生的单据与数据仍按归档口径保留。`
  }
  return `申请将门店「${store.name || store.code || ''}」由「${storeStatusText(store.status)}」变更为「${storeStatusText(action.targetStatus)}」，审批通过后生效。`
})

function validateTimezoneRule(_rule, value, callback) {
  if (!value) return callback(new Error(VALIDATION.timezoneRequired))
  if (!isValidTimezone(value)) return callback(new Error(VALIDATION.timezoneInvalid))
  return callback()
}

function validateCutoffRule(_rule, value, callback) {
  if (!value) return callback(new Error(VALIDATION.cutoffRequired))
  if (!isValidBusinessDayCutoff(value)) return callback(new Error(VALIDATION.cutoffInvalid))
  return callback()
}

const formRules = computed(() => {
  const base = {
    reason: [
      { required: true, message: VALIDATION.reasonRequired, trigger: 'blur' },
      { max: 512, message: VALIDATION.reasonTooLong, trigger: 'blur' },
    ],
  }
  if (!isFieldForm.value) return base
  return {
    code: formAction.value.requestType === 'CREATE'
      ? [
        { required: true, message: VALIDATION.codeRequired, trigger: 'blur' },
        { pattern: STORE_CODE_PATTERN, message: VALIDATION.codePattern, trigger: 'blur' },
      ]
      : [],
    name: [{ required: true, message: VALIDATION.nameRequired, trigger: 'blur' }],
    businessType: [{ required: true, message: VALIDATION.businessTypeRequired, trigger: 'change' }],
    timezone: [{ validator: validateTimezoneRule, trigger: 'change' }],
    businessDayCutoff: [{ validator: validateCutoffRule, trigger: 'change' }],
    ...base,
  }
})

/** 门店行可提交的申请动作（有 PENDING 时全部置灰；没有直写按钮）。 */
function actionsOf(row) {
  return buildStoreChangeActions(row, row.pendingRequest)
}

function pendingCreateName(request) {
  return request?.payload?.name || request?.storeName || '新增门店'
}

function pendingCreateCode(request) {
  return request?.payload?.code || request?.targetCode || ''
}

async function loadStores() {
  loading.value = true
  try {
    const data = await listStores()
    storeRows.value = Array.isArray(data) ? data : (data && (data.items || data.list)) || []
  } catch (e) {
    storeRows.value = []
    notifyAdminRequestError(e, '加载门店失败')
  } finally {
    loading.value = false
  }
}

/** PENDING 申请单独拉取：失败不影响门店列表（顶部提示重试，不静默丢标签）。 */
async function loadPendingRequests() {
  // 门店级上下文没有租户级申请的读取范围：跳过请求，由顶部提示条引导切回总部。
  if (isStoreScope.value) {
    pendingRequests.value = []
    pendingLoadFailed.value = false
    return
  }
  try {
    const page = normalizeChangeRequestPage(await listStoreChangeRequests({
      status: 'PENDING',
      page: 1,
      pageSize: 100,
    }))
    pendingRequests.value = page.items
    pendingLoadFailed.value = false
  } catch {
    pendingRequests.value = []
    pendingLoadFailed.value = true
  }
}

async function load() {
  await Promise.all([loadStores(), loadPendingRequests()])
}

async function loadCreateDefaults() {
  try {
    createDefaults.value = normalizeCreateDefaults(await getStoreCreateDefaults())
  } catch {
    // 默认值接口不可用时保留本地缺省值，表单仍可提交（服务端会权威校验）。
  }
}

async function loadWorkspaceMode() {
  try {
    workspaceMode.value = (await getStoreWorkspaceMode())?.storeWorkspaceMode || 'INDEPENDENT'
  } catch {
    workspaceMode.value = 'INDEPENDENT'
  }
}

async function saveWorkspaceMode() {
  workspaceSaving.value = true
  try {
    await updateStoreWorkspaceMode(workspaceMode.value)
    workspaceVisible.value = false
    ElMessage.success('门店工作区模式已更新，重新登录后生效')
  } catch (error) {
    notifyAdminRequestError(error, '保存工作区模式失败')
  } finally {
    workspaceSaving.value = false
  }
}

/**
 * 申请必须在「租户总部」上下文提交：门店级上下文会被服务端
 * 400 `STORE_CHANGE_REQUIRES_TENANT_CONTEXT` 拒绝，因此提交前先切回总部（不自动切门店）。
 */
async function ensureHeadquarterContext() {
  if (!contextStore.storeId) return true
  if (!contextStore.items.length) {
    try {
      await contextStore.fetchContexts()
    } catch {
      /* 候选拿不到时交给下面的提示 */
    }
  }
  const target = contextStore.items.find((item) => item.storeId === 0 || item.scopeType === 'TENANT')
  if (!target) {
    ElMessage.warning(CHANGE_TEXT.noHeadquarterContext)
    return false
  }
  try {
    await contextStore.select(target.contextId)
  } catch (e) {
    notifyAdminRequestError(e, CHANGE_TEXT.switchToHeadquarterFailed)
    return false
  }
  ElMessage.success(CHANGE_TEXT.switchedToHeadquarter)
  return true
}

/** 顶部提示条「切回总部」：切成功后重新拉取 PENDING（门店级上下文下不发申请请求）。 */
async function switchToHeadquarter() {
  if (!(await ensureHeadquarterContext())) return
  await load()
}

function resetFormFor(requestType, action = {}) {
  formAction.value = {
    key: action.key || requestType,
    requestType,
    targetStatus: action.targetStatus || null,
    row: action.row || null,
  }
  formRef.value?.clearValidate()
}

async function openCreate() {
  await loadCreateDefaults()
  resetFormFor('CREATE')
  form.value = { ...emptyStoreChangeForm(createDefaults.value), reason: '' }
  formDrawerVisible.value = true
}

function openAction(action, row) {
  if (action.requestType === 'UPDATE') {
    resetFormFor('UPDATE', { key: 'UPDATE', row })
    form.value = { ...storeChangeFormFromRow(row), reason: '' }
  } else if (action.requestType === 'STATUS') {
    resetFormFor('STATUS', { key: action.key, targetStatus: action.targetStatus, row })
    form.value = { reason: '' }
  } else {
    resetFormFor('DELETE', { key: 'DELETE', row })
    form.value = { reason: '' }
  }
  formDrawerVisible.value = true
}

async function submitForm() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    ElMessage.warning(CHANGE_TEXT.formIncomplete)
    return
  }
  const action = formAction.value
  const check = validateChangeRequest({
    requestType: action.requestType,
    form: form.value,
    row: action.row,
    targetStatus: action.targetStatus,
    reason: form.value.reason,
  })
  if (!check.ok) {
    ElMessage.warning(check.message)
    return
  }
  if (!(await ensureHeadquarterContext())) return
  const body = buildChangeRequestBody({
    requestType: action.requestType,
    form: form.value,
    row: action.row,
    targetStatus: action.targetStatus,
    reason: form.value.reason,
    idempotencyKey: createIdempotencyKey(),
  })
  if (!body) {
    ElMessage.warning(VALIDATION.typeUnsupported)
    return
  }
  submitting.value = true
  try {
    await submitStoreChangeRequest(body)
    ElMessage.success(CHANGE_TEXT.submitSuccess)
    formDrawerVisible.value = false
    await load()
  } catch (e) {
    notifyAdminRequestError(e, CHANGE_TEXT.submitFailed)
  } finally {
    submitting.value = false
  }
}

function openRecords() {
  recordsVisible.value = true
  recordStatus.value = ''
  recordPage.page = 1
  loadRecords()
}

function searchRecords() {
  recordPage.page = 1
  loadRecords()
}

async function loadRecords() {
  recordsLoading.value = true
  try {
    const params = { page: recordPage.page, pageSize: recordPage.pageSize }
    if (recordStatus.value) params.status = recordStatus.value
    const page = normalizeChangeRequestPage(await listStoreChangeRequests(params))
    records.value = page.items
    recordPage.total = page.total
  } catch (e) {
    records.value = []
    recordPage.total = 0
    notifyAdminRequestError(e, CHANGE_TEXT.recordsLoadFailed)
  } finally {
    recordsLoading.value = false
  }
}

async function cancelRequest(request) {
  if (!request || request.id === null || request.id === undefined) return
  try {
    await ElMessageBox.confirm(
      CHANGE_TEXT.cancelConfirmText.replace('{type}', requestTypeText(request.requestType)),
      CHANGE_TEXT.cancelConfirmTitle,
      {
        type: 'warning',
        confirmButtonText: CHANGE_TEXT.cancelConfirmButton,
        cancelButtonText: CHANGE_TEXT.cancelCancelButton,
      },
    )
  } catch {
    return
  }
  cancellingId.value = request.id
  try {
    await cancelStoreChangeRequest(request.id)
    ElMessage.success(CHANGE_TEXT.cancelSuccess)
    await loadPendingRequests()
    if (recordsVisible.value) await loadRecords()
  } catch (e) {
    notifyAdminRequestError(e, CHANGE_TEXT.cancelFailed)
  } finally {
    cancellingId.value = null
  }
}

onMounted(() => {
  loadCreateDefaults()
  loadWorkspaceMode()
  load()
})
</script>

<style scoped>
.currency-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.header-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.store-alert { margin-bottom: 12px; }
.onboarding-card { margin-bottom: 16px; }
.onboarding-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.onboarding-item { display: flex; gap: 8px; align-items: center; padding: 6px 10px; border: 1px solid var(--el-color-warning-light-5); border-radius: 6px; font-size: 12px; color: var(--el-text-color-regular); }
.onboarding-item span { color: var(--el-color-warning); }
.store-logo-cell { display: flex; align-items: center; justify-content: center; gap: 4px; }
.pending-create-card { margin-bottom: 16px; }
.pending-create-list { display: grid; gap: 10px; margin-top: 10px; }
.pending-create-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--el-color-warning-light-5); border-radius: 8px; background: var(--el-color-warning-light-9); }
.pending-create-copy { display: grid; gap: 2px; }
.pending-create-copy small { color: var(--el-text-color-secondary); font-size: 12px; }
.pending-create-code { margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px; }
.pending-hint { margin-left: 8px; color: var(--el-color-warning); font-size: 12px; }
/* 操作列 fixed 宽度有限：窄屏下按钮换行，避免「删除」等末尾动作被裁掉 */
.row-actions { display: flex; flex-wrap: wrap; gap: 0 4px; justify-content: center; line-height: 1.4; }
.row-actions :deep(.el-button + .el-button) { margin-left: 0; }
.muted { color: var(--el-text-color-secondary); }
.form-alert { margin-bottom: 12px; }
.field-hint { margin: 4px 0 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; }
.records-filter { margin-bottom: 10px; }
</style>
