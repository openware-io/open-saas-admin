<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>审计日志</h2>
      <div class="header-actions">
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="loadError"
      class="audit-alert"
      type="error"
      show-icon
      :closable="false"
      :title="loadError"
    />
    <el-alert
      v-else
      class="audit-alert"
      type="info"
      show-icon
      :closable="false"
      :title="scopeHint"
    />
    <!-- 保留策略回执：早于 retentionFloor 的月份已归档并移出可查范围（数据仍在库里）。
         不提示的话，运营会以为「查不到就是没有」——这正是要避免的静默行为。 -->
    <el-alert
      v-if="retentionFloor"
      class="audit-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="retentionHint"
    />

    <div class="admin-card">
      <div class="filter-bar">
        <!--
          发生时间区间：与其它列表共用同一个筛选控件（src/components/DateRangeFilter.vue）。
          只到日即可 —— 后端的统一 from/to 口径会把结束日收口到当天末尾（审计仓储是左闭右开，
          因此排他上界取次日零点），不需要用户自己选时分秒。
        -->
        <DateRangeFilter v-model="range" />
        <el-input
          v-model="query.operatorKeyword"
          placeholder="操作人（姓名 / 账号 / ID）"
          clearable
          style="width: 220px"
          @keyup.enter="search"
        />
        <el-select
          v-model="query.action"
          placeholder="操作类型（可输入动作码）"
          clearable
          filterable
          allow-create
          default-first-option
          style="width: 200px"
        >
          <el-option v-for="item in actionOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select
          v-model="query.resourceType"
          placeholder="资源类型"
          clearable
          filterable
          allow-create
          default-first-option
          style="width: 160px"
        >
          <el-option v-for="(label, value) in AUDIT_RESOURCE_TYPE_TEXT" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="query.result" placeholder="结果" clearable style="width: 120px">
          <el-option v-for="item in AUDIT_RESULT_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" border stripe @row-click="openDetail">
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ row.createdAtText }}</template>
        </el-table-column>
        <!-- 租户列只在平台视角展示；租户视角由后端按会话上下文过滤，越权拦截同样在后端。 -->
        <el-table-column v-if="showTenantColumn" label="租户" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.tenantText }}</template>
        </el-table-column>
        <el-table-column label="操作人" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.operatorText }}</span>
            <small v-if="row.operatorTypeText" class="operator-type">{{ row.operatorTypeText }}</small>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.actionText }}</template>
        </el-table-column>
        <el-table-column label="资源" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.resourceText }}</template>
        </el-table-column>
        <el-table-column label="结果" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.resultType">{{ row.resultText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="IP" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.ipText }}</template>
        </el-table-column>
        <el-table-column label="详情" width="90" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无审计记录" /></template>
      </el-table>

      <div class="admin-pagination">
        <el-pagination
          layout="total, prev, pager, next, sizes"
          :total="total"
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="AUDIT_PAGE_SIZES"
          @current-change="changePage"
          @size-change="search"
        />
        <!-- 后端统计到达上界（audit.query.count-cap）时 total 只是下限，显式标注避免当成精确总数。 -->
        <span v-if="totalCapped" class="total-capped">匹配记录过多，仅统计到 {{ total }} 条</span>
      </div>
    </div>

    <el-drawer v-model="detailVisible" size="520px">
      <template #header>
        <h3 class="drawer-title">审计详情</h3>
      </template>
      <div v-loading="detailLoading" class="audit-detail">
        <el-descriptions v-if="detail" :column="1" border size="small">
          <el-descriptions-item label="时间">{{ detail.createdAtText }}</el-descriptions-item>
          <el-descriptions-item v-if="showTenantColumn" label="租户">{{ detail.tenantText }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{ detail.operatorText }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.operatorTypeText" label="操作人类型">{{ detail.operatorTypeText }}</el-descriptions-item>
          <el-descriptions-item label="操作">{{ detail.actionText }}</el-descriptions-item>
          <el-descriptions-item label="资源">{{ detail.resourceText }}</el-descriptions-item>
          <el-descriptions-item label="结果">
            <el-tag :type="detail.resultType">{{ detail.resultText }}</el-tag>
            <span v-if="detail.errorCode" class="error-code">错误码：{{ detail.errorCode }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="IP">{{ detail.ipText }}</el-descriptions-item>
          <el-descriptions-item label="客户端">{{ detail.userAgentText }}</el-descriptions-item>
          <el-descriptions-item label="请求 ID">{{ detail.requestIdText }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="未选择审计记录" :image-size="60" />

        <h4 class="detail-title">明细（已脱敏）</h4>
        <el-alert
          v-if="detailParseFailed"
          type="warning"
          show-icon
          :closable="false"
          title="该记录的明细不是合法 JSON，已隐藏原始内容（避免把未经脱敏的报文展示出来）。"
        />
        <el-table v-else-if="detailEntries.length" :data="detailEntries" border size="small" max-height="320">
          <el-table-column prop="label" label="字段" width="150" show-overflow-tooltip />
          <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
        </el-table>
        <el-empty v-else description="该条审计没有明细" :image-size="60" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getAudit, listAuditActions, listAudits } from '@/api/audit'
import {
  AUDIT_ACTION_FALLBACK_OPTIONS,
  AUDIT_RESOURCE_TYPE_TEXT,
  AUDIT_RESULT_OPTIONS,
} from '@/constants/terms'
import { resolveAdminErrorMessage } from '@/utils/adminErrorMessage'
import { dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import {
  AUDIT_PAGE_SIZES,
  buildAuditQuery,
  flattenAuditDetail,
  normalizeAuditRow,
  parseAuditListResponse,
  shouldShowTenantColumn,
} from '@/utils/audit'
import { useAuthStore } from '@/stores/auth'
import { useContextStore } from '@/stores/context'

const authStore = useAuthStore()
const contextStore = useContextStore()

const rows = ref([])
const total = ref(0)
const totalCapped = ref(false)
const loading = ref(false)
const loadError = ref('')
const range = ref([])
const query = reactive({
  page: 1,
  pageSize: AUDIT_PAGE_SIZES[0],
  operatorKeyword: '',
  action: '',
  resourceType: '',
  resourceId: '',
  result: '',
  tenantId: null,
})

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

/**
 * 租户列只在平台视角展示（前端只做展示分层，真正的越权拦截在后端）。
 * 页面不设固定 scope：菜单由后端下发（/admin/audits + audit.view），平台/租户视角都能直达。
 */
const showTenantColumn = computed(() => shouldShowTenantColumn(authStore.scope))
const scopeHint = computed(() => (
  showTenantColumn.value
    ? '平台视角：可查询全部租户的审计记录；结果与操作类型由后端返回的中文标签优先展示。'
    : '租户视角：仅展示当前运营上下文可读的审计记录（由后端按会话上下文与权限过滤）。'
))

/**
 * 保留策略回执（后端 AuditPageView.retentionFloor）：早于它的月份已登记归档、移出可查范围。
 * 时间筛选早于下限时后端会收敛左边界，这里明确告诉运营「是归档了，不是没有」，避免误判成数据缺失。
 */
const retentionFloor = ref(null)
const retentionHint = computed(() => (
  `仅显示 ${retentionFloor.value} 之后的审计记录：更早的月份已归档并移出可查范围`
  + '（数据仍在平台侧留存，如需调阅请联系平台按归档流程申请）。'
))

const detailDetail = computed(() => flattenAuditDetail(detail.value?.detailJson))
const detailEntries = computed(() => detailDetail.value.entries)
const detailParseFailed = computed(() => !detailDetail.value.ok)

/**
 * 操作类型下拉：后端 `GET /admin/audits/actions` 是动作码字典的唯一出处（形如 order.settle），
 * 接口缺位时退回本地常见动作码，仍允许手工输入任意动作码。
 */
const actionOptions = ref([...AUDIT_ACTION_FALLBACK_OPTIONS])

async function loadActionOptions() {
  try {
    const data = await listAuditActions()
    const items = Array.isArray(data) ? data : (data && data.items) || []
    const options = items
      .map((item) => ({ value: item.code || item.value, label: item.label || item.name || item.code }))
      .filter((item) => item.value)
    if (options.length) actionOptions.value = options
  } catch (e) {
    /* 动作码字典接口未上线：保留本地兜底词表 */
  }
}

async function load(options = {}) {
  loading.value = true
  loadError.value = ''
  try {
    // 时间区间走全仓统一的 from/to 口径（闭区间；后端把 to 收口到当天末尾）。
    // buildAuditQuery 同时兼容 fromAt/toAt 与 occurredFrom/occurredTo，但统一参数优先级最高，
    // 因此这里只传 from/to，不再把区间塞进 fromAt/toAt —— 后者按「当天 00:00」解释，会漏掉结束日。
    const params = buildAuditQuery({
      ...query,
      from: range.value?.[0],
      to: range.value?.[1],
      skipCount: options.skipCount === true,
    })
    const data = parseAuditListResponse(await listAudits(params))
    rows.value = data.items.map(normalizeAuditRow)
    retentionFloor.value = data.retentionFloor
    // 后端跳过统计（total=-1）时沿用上一次同筛选条件的总数，翻页不会把总数显示成 0。
    if (!data.totalSkipped) {
      total.value = data.total
      totalCapped.value = data.totalCapped
    }
  } catch (e) {
    rows.value = []
    total.value = 0
    totalCapped.value = false
    // 403 等由 utils/adminErrorMessage 统一转成可读中文（拦截器已弹出，这里做页内常驻提示）。
    loadError.value = resolveAdminErrorMessage(e, '加载审计日志失败')
  } finally {
    loading.value = false
  }
}

/** 翻页：第 2 页起跳过总数统计（只有第 1 页和筛选变化需要精确总数）。 */
function changePage() {
  load({ skipCount: query.page > 1 })
}

function search() {
  // 倒挂区间直接提示且不发起请求（与其它列表同一道守卫，逻辑在 utils/dateRange）。
  const warning = dateRangeWarning(range.value)
  if (warning) {
    ElMessage.warning(warning)
    return
  }
  query.page = 1
  load()
}

function reset() {
  range.value = emptyDateRange()
  query.page = 1
  query.operatorKeyword = ''
  query.action = ''
  query.resourceType = ''
  query.resourceId = ''
  query.result = ''
  query.tenantId = null
  load()
}

async function openDetail(row) {
  detail.value = row
  detailVisible.value = true
  if (row?.id === null || row?.id === undefined) return
  detailLoading.value = true
  try {
    const full = await getAudit(row.id)
    if (full) detail.value = normalizeAuditRow(full)
  } catch (e) {
    // 详情接口不可用/无权限：退回列表行快照（已含 detailJson），不阻断查看。
    ElMessage.warning(resolveAdminErrorMessage(e, '详情加载失败，已展示列表中的信息'))
  } finally {
    detailLoading.value = false
  }
}

onMounted(async () => {
  // 本页不绑定固定 scope（平台/租户都可达），因此自己确保一次运营上下文；
  // 深链进入且上下文缺失时，接口会返回 401 SAAS_CONTEXT_REQUIRED，由错误提示兜底。
  if (!contextStore.current) {
    try {
      await contextStore.ensureContext(authStore.scope)
    } catch (e) {
      /* 上下文失败不阻断页面：列表请求会给出可读错误 */
    }
  }
  loadActionOptions()
  load()
})
</script>

<style scoped>
.audit-alert { margin-bottom: 12px; }
.header-actions { display: flex; gap: 10px; }
.operator-type { margin-left: 6px; color: var(--el-text-color-secondary); font-size: 12px; }
.drawer-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--el-text-color-primary); }
.detail-title { margin: 16px 0 10px; font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.error-code { margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px; }
.total-capped { margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px; }
</style>
