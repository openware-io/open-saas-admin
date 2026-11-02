<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>{{ PAGE_TEXT.pageTitle }}</h2>
      <div class="header-actions">
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="loadError"
      class="approval-alert"
      type="error"
      show-icon
      :closable="false"
      :title="loadError"
    />
    <el-alert
      v-else
      class="approval-alert"
      type="info"
      show-icon
      :closable="false"
      :title="PAGE_TEXT.queueHint"
    />
    <el-alert
      v-if="!canApprove"
      class="approval-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="permissionHint"
    />

    <div class="admin-card">
      <div class="filter-bar">
        <!-- 后端空值默认 PENDING，因此状态下拉不做 clearable：清空会「看起来是全部、实际仍是待审批」。
             默认 PENDING，看其它/全部状态请显式选择。 -->
        <el-select v-model="query.status" placeholder="申请状态" style="width: 140px">
          <el-option
            v-for="option in statusOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-select v-model="query.requestType" placeholder="申请类型" clearable style="width: 150px">
          <el-option
            v-for="option in typeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-input
          v-model="query.tenantId"
          placeholder="租户 ID"
          clearable
          style="width: 150px"
          @keyup.enter="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column label="提交时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="租户" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ tenantText(row) }}</template>
        </el-table-column>
        <el-table-column label="门店" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ storeText(row) }}</template>
        </el-table-column>
        <el-table-column label="申请类型" width="110">
          <template #default="{ row }">{{ requestTypeText(row.requestType) }}</template>
        </el-table-column>
        <el-table-column label="摘要" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ requestSummaryText(row) }}</template>
        </el-table-column>
        <el-table-column label="申请人" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ applicantText(row) }}</template>
        </el-table-column>
        <el-table-column label="申请理由" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="requestStatusType(row.status)">{{ requestStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">查看审批</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无门店变更申请" />
        </template>
      </el-table>

      <div class="admin-pagination">
        <el-pagination
          layout="total, prev, pager, next, sizes"
          :total="total"
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="PAGE_SIZES"
          @current-change="load"
          @size-change="search"
        />
      </div>
    </div>

    <!-- 详情抽屉：before → after diff + payload + 理由，通过/驳回都在这里完成。 -->
    <el-drawer v-model="detailVisible" size="min(760px, 96vw)" :title="PAGE_TEXT.pageTitle">
      <div v-loading="detailLoading" class="approval-detail">
        <el-descriptions v-if="detail" :column="1" border size="small">
          <el-descriptions-item label="申请编号">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="租户">{{ tenantText(detail) }}</el-descriptions-item>
          <el-descriptions-item label="门店">{{ storeText(detail) }}</el-descriptions-item>
          <el-descriptions-item label="申请类型">{{ requestTypeText(detail.requestType) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="requestStatusType(detail.status)">{{ requestStatusText(detail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="PAGE_TEXT.applicantLabel">{{ applicantText(detail) }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item :label="PAGE_TEXT.reviewerLabel">{{ reviewerText(detail) }}</el-descriptions-item>
          <el-descriptions-item label="审批时间">{{ formatTime(detail.reviewedAt) }}</el-descriptions-item>
          <el-descriptions-item label="审批意见">{{ detail.reviewComment || '—' }}</el-descriptions-item>
          <el-descriptions-item label="执行时间">{{ formatTime(detail.appliedAt) }}</el-descriptions-item>
          <el-descriptions-item label="申请理由">{{ detail.reason || '—' }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="未选择申请" :image-size="60" />

        <h4 class="detail-title">{{ PAGE_TEXT.diffTitle }}</h4>
        <el-table v-if="detailDiff.length" :data="detailDiff" border size="small">
          <el-table-column prop="label" label="字段" width="150" show-overflow-tooltip />
          <el-table-column prop="before" label="变更前" min-width="180" show-overflow-tooltip />
          <el-table-column prop="after" label="变更后" min-width="180" show-overflow-tooltip />
        </el-table>
        <el-empty v-else :description="PAGE_TEXT.emptyDiff" :image-size="60" />

        <h4 class="detail-title">{{ PAGE_TEXT.payloadTitle }}</h4>
        <pre class="payload-block">{{ payloadText }}</pre>
      </div>

      <template #footer>
        <div v-if="detail && canReview" class="drawer-actions">
          <el-button
            type="success"
            :loading="reviewingId === detail.id && reviewingAction === 'approve'"
            @click="approve(detail)"
          >{{ PAGE_TEXT.approve }}</el-button>
          <el-button
            type="danger"
            :loading="reviewingId === detail.id && reviewingAction === 'reject'"
            @click="reject(detail)"
          >{{ PAGE_TEXT.reject }}</el-button>
        </div>
        <span v-else-if="detail" class="muted">{{ reviewFooterHint }}</span>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import {
  approveStoreChangeRequest,
  getPlatformStoreChangeRequest,
  listPlatformStoreChangeRequests,
  rejectStoreChangeRequest,
} from '@/api/store'
import { STORE_APPROVAL_TEXT as PAGE_TEXT } from '@/constants/terms'
import {
  buildChangeDiffForRequest,
  normalizeChangeRequestPage,
  requestStatusOptions,
  requestStatusText,
  requestStatusType,
  requestSummaryText,
  requestTypeOptions,
  requestTypeText,
} from '@/utils/storeChangeForm'
import { formatTime } from '@/utils/format'
import { hasPermission } from '@/utils/context'
import { useContextStore } from '@/stores/context'
import { notifyAdminRequestError, resolveAdminErrorMessage } from '@/utils/adminErrorMessage'

const contextStore = useContextStore()
const PAGE_SIZES = [10, 20, 50, 100]

const rows = ref([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const statusOptions = requestStatusOptions()
const typeOptions = requestTypeOptions()

const query = reactive({
  status: 'PENDING',
  requestType: '',
  tenantId: '',
  page: 1,
  pageSize: 20,
})

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const reviewingId = ref(null)
const reviewingAction = ref('')
/** 详情请求序号：快速切换行时旧响应不能覆盖新详情（竞态）。 */
let detailRequestSeq = 0

/** 平台权限快照（contextStore.current）由路由守卫进入 PLATFORM 工作区时 ensureContext('PLATFORM') 取得。 */
const permissionSnapshot = computed(() => contextStore.current?.permissions)
/**
 * 审批按钮门禁：快照存在时**严格**判断（不再 fail-open）；
 * 快照缺失说明平台会话拿不到权限快照，按钮不显示，页面顶部提示原因。
 */
const canApprove = computed(() => (
  !!permissionSnapshot.value
  && hasPermission(permissionSnapshot.value, 'platform.store.change.approve')
))

const permissionHint = computed(() => (
  permissionSnapshot.value ? PAGE_TEXT.noApprovePermission : PAGE_TEXT.snapshotMissingHint
))

const canReview = computed(() => !!detail.value && detail.value.status === 'PENDING' && canApprove.value)

/** footer 三种状态：可审批（按钮）/ 无审批权限 / 已审结，分开文案避免误导。 */
const reviewFooterHint = computed(() => {
  if (!detail.value) return ''
  if (detail.value.status !== 'PENDING') return PAGE_TEXT.reviewedHint
  return permissionSnapshot.value ? PAGE_TEXT.noApprovePermission : PAGE_TEXT.snapshotMissingHint
})

const detailDiff = computed(() => buildChangeDiffForRequest(detail.value))

const payloadText = computed(() => {
  const payload = detail.value?.payload
  if (payload === null || payload === undefined || payload === '') return '—'
  if (typeof payload === 'string') {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2)
    } catch {
      return payload
    }
  }
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
})

function tenantText(row) {
  const name = row?.tenantName
  if (name) return name
  return row?.tenantId !== null && row?.tenantId !== undefined ? `租户 #${row.tenantId}` : '—'
}

function storeText(row) {
  const name = row?.storeName
  if (name) return name
  if (row?.storeId !== null && row?.storeId !== undefined) return `门店 #${row.storeId}`
  return '新增门店（审批通过后创建）'
}

function applicantText(row) {
  return row?.applicantName || (row?.applicantAccountId ? `账号 #${row.applicantAccountId}` : '—')
}

function reviewerText(row) {
  if (row?.reviewerName) return row.reviewerName
  return row?.reviewerAccountId ? `账号 #${row.reviewerAccountId}` : '—'
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: query.page, pageSize: query.pageSize }
    if (query.status) params.status = query.status
    if (query.requestType) params.requestType = query.requestType
    const tenantId = String(query.tenantId || '').trim()
    if (tenantId) params.tenantId = tenantId
    const page = normalizeChangeRequestPage(await listPlatformStoreChangeRequests(params))
    // 审批掉最后一页的最后一条后 total 变小：自动回退到新的最后一页，避免停在空页。
    if (!page.items.length && page.total > 0 && query.page > 1) {
      const lastPage = Math.max(1, Math.ceil(page.total / query.pageSize))
      if (lastPage !== query.page) {
        query.page = lastPage
        return load()
      }
    }
    rows.value = page.items
    total.value = page.total
  } catch (e) {
    rows.value = []
    total.value = 0
    loadError.value = resolveAdminErrorMessage(e, PAGE_TEXT.loadFailed)
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  load()
}

function reset() {
  query.status = 'PENDING'
  query.requestType = ''
  query.tenantId = ''
  query.page = 1
  load()
}

async function openDetail(row) {
  detail.value = row
  detailVisible.value = true
  if (row?.id === null || row?.id === undefined) return
  // 请求序号：快速点不同行时，先发的旧响应可能后到，不能覆盖当前详情。
  const seq = ++detailRequestSeq
  detailLoading.value = true
  try {
    const full = await getPlatformStoreChangeRequest(row.id)
    if (seq !== detailRequestSeq) return
    if (full) detail.value = full
  } catch (e) {
    if (seq !== detailRequestSeq) return
    // 详情接口失败时退回列表行快照（不含 before/payload），不阻断查看。
    ElMessage.warning(resolveAdminErrorMessage(e, PAGE_TEXT.detailLoadFailedFallback))
  } finally {
    if (seq === detailRequestSeq) detailLoading.value = false
  }
}

/**
 * 审批失败后的刷新：apply 失败（409 STORE_CHANGE_CONFLICT / STORE_CHANGE_ALREADY_REVIEWED）
 * 时申请状态已被服务端改写，队列与详情都必须重拉——否则界面还显示「待审批」，运营会重复点。
 */
async function refreshAfterReview(requestId) {
  try {
    await load()
    if (requestId === null || requestId === undefined) return
    const full = await getPlatformStoreChangeRequest(requestId)
    if (!full) return
    if (detailVisible.value && detail.value?.id === requestId) detail.value = full
    if (full.status === 'CONFLICT') ElMessage.warning(PAGE_TEXT.reviewConflictHint)
  } catch {
    ElMessage.warning(PAGE_TEXT.refreshFailedHint)
  }
}

/** 通过：备注可选；确认后才会调用审批接口（apply 由服务端在同一事务内执行）。 */
async function approve(request) {
  if (!request || reviewingId.value) return
  let comment = ''
  try {
    const result = await ElMessageBox.prompt(
      PAGE_TEXT.approveCommentPlaceholder,
      PAGE_TEXT.approveTitle,
      {
        confirmButtonText: PAGE_TEXT.approve,
        cancelButtonText: '取消',
        type: 'warning',
        inputPlaceholder: PAGE_TEXT.approveCommentPlaceholder,
      },
    )
    comment = String(result?.value || '').trim()
  } catch {
    return
  }
  reviewingId.value = request.id
  reviewingAction.value = 'approve'
  try {
    await approveStoreChangeRequest(request.id, comment)
    ElMessage.success(PAGE_TEXT.approveSuccess)
    detailVisible.value = false
    await load()
  } catch (e) {
    notifyAdminRequestError(e, PAGE_TEXT.approveFailed)
    await refreshAfterReview(request.id)
  } finally {
    reviewingId.value = null
    reviewingAction.value = ''
  }
}

/** 驳回：理由必填（前端先拦 + 后端 400 双保险）；门店完全不变。 */
async function reject(request) {
  if (!request || reviewingId.value) return
  let comment = ''
  try {
    const result = await ElMessageBox.prompt(
      PAGE_TEXT.rejectCommentPlaceholder,
      PAGE_TEXT.rejectTitle,
      {
        confirmButtonText: PAGE_TEXT.reject,
        cancelButtonText: '取消',
        type: 'warning',
        inputPlaceholder: PAGE_TEXT.rejectCommentPlaceholder,
        inputValidator: (value) => (String(value || '').trim() ? true : PAGE_TEXT.rejectCommentRequired),
      },
    )
    comment = String(result?.value || '').trim()
  } catch {
    return
  }
  if (!comment) {
    ElMessage.warning(PAGE_TEXT.rejectCommentRequired)
    return
  }
  reviewingId.value = request.id
  reviewingAction.value = 'reject'
  try {
    await rejectStoreChangeRequest(request.id, comment)
    ElMessage.success(PAGE_TEXT.rejectSuccess)
    detailVisible.value = false
    await load()
  } catch (e) {
    notifyAdminRequestError(e, PAGE_TEXT.rejectFailed)
    await refreshAfterReview(request.id)
  } finally {
    reviewingId.value = null
    reviewingAction.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
.approval-alert { margin-bottom: 12px; }
.header-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.approval-detail { font-size: 13px; }
.detail-title { margin: 16px 0 10px; font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.payload-block {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 260px;
  overflow: auto;
}
.drawer-actions { display: flex; gap: 10px; justify-content: flex-end; }
.muted { color: var(--el-text-color-secondary); }
</style>
