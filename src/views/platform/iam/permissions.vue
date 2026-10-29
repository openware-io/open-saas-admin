<template>
  <div class="admin-page permission-catalog">
    <div class="page-header">
      <div>
        <h2>{{ isTenantMatrix ? '角色权限矩阵' : '权限目录' }}</h2>
        <p class="subtle">
          {{ isTenantMatrix
            ? '聚合本租户预置角色与自定义角色，按下表对照每个权限的授予情况。'
            : '权限由平台统一维护；右侧矩阵列展示全局角色对每个权限的授予情况。' }}
        </p>
      </div>
      <div class="header-actions">
        <el-button :disabled="!filteredRows.length" @click="exportCsv">导出当前视图</el-button>
        <el-button :loading="loading" @click="load(true)">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      :title="isTenantMatrix ? '角色权限矩阵' : '权限目录与角色矩阵对照'"
      :description="isTenantMatrix
        ? '左侧列表与右侧矩阵共用同一行序，排序/筛选同步；矩阵列包含本租户预置角色与自定义角色。⚠ 表示越界授权，需要治理。'
        : '左侧列表与右侧矩阵共用同一行序，排序/筛选同步；矩阵列是平台统一维护的全局角色模板（不含租户自定义角色）。⚠ 表示已授予但该角色作用域不可授予，需要治理。'"
    />

    <el-alert
      v-if="isTenantMatrix && tenantScopeHint"
      type="warning"
      :closable="false"
      show-icon
      :title="tenantScopeHint"
    />

    <el-alert
      v-if="stateCounts.anomaly > 0"
      class="anomaly-alert"
      type="error"
      :closable="false"
      show-icon
      :title="`检测到 ${stateCounts.anomaly} 项越界授权`"
    >
      <template #default>
        <div class="anomaly-body">
          <span>存在“已授予但不可授予”的权限，需要立即核查并修复。</span>
          <el-button size="small" link type="danger" @click="stateFilter = 'anomaly'">只看这些</el-button>
        </div>
      </template>
    </el-alert>

    <el-alert
      v-if="stale"
      class="stale-alert"
      type="warning"
      :closable="false"
      show-icon
      title="检测到权限数据已更新"
    >
      <template #default>
        <div class="stale-body">
          <span>当前页面显示的是旧快照，点击刷新获取最新矩阵。</span>
          <el-button size="small" type="warning" plain @click="load(true)">立即刷新</el-button>
        </div>
      </template>
    </el-alert>

    <div class="admin-card">
      <div class="filter-bar catalog-toolbar">
        <el-input v-model="keyword" placeholder="权限编码 / 名称 / 模块 / 业务域" clearable style="width: 280px" />
        <el-select v-model="moduleFilter" clearable placeholder="全部模块" style="width: 130px" aria-label="模块筛选">
          <el-option v-for="item in moduleOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="domainFilter" clearable placeholder="全部业务域" style="width: 130px" aria-label="业务域筛选">
          <el-option v-for="item in domainOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="scopeFilter" clearable placeholder="全部作用域" style="width: 130px" aria-label="作用域筛选">
          <el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="stateFilter" style="width: 170px" aria-label="矩阵状态筛选">
          <el-option label="全部状态" value="all" />
          <el-option :label="`只看越界授权（${stateCounts.anomaly}）`" value="anomaly" />
          <el-option label="只看未授予" value="ungranted" />
          <el-option :label="`只看可补充（${stateCounts.grantable}）`" value="grantable" />
        </el-select>
        <el-select
          v-model="selectedRoleCodes"
          multiple
          collapse-tags
          :max-collapse-tags="2"
          style="width: 230px"
          placeholder="选择角色列"
          aria-label="选择矩阵角色列"
          @change="onRoleSelectionChange"
        >
          <el-option
            v-for="role in allRoleColumns"
            :key="role.code"
            :label="`${role.name}（${scopeTypeText(role.scopeLevel)}）`"
            :value="role.code"
          />
        </el-select>
        <el-button link @click="resetFilters">重置</el-button>
      </div>
      <div class="matrix-legend" aria-label="矩阵状态图例">
        <span class="legend-item"><span class="legend-dot legend-granted">✓</span>已授予</span>
        <span class="legend-item"><span class="legend-dot legend-grantable">○</span>可授予未授予</span>
        <span class="legend-item"><span class="legend-dot legend-forbidden">—</span>不可授予</span>
        <span class="legend-item legend-anomaly"><span class="legend-dot">⚠</span>越界授权</span>
        <span class="legend-item muted">列：{{ roleColumns.length }}/{{ allRoleColumns.length }} 个{{ isTenantMatrix ? '角色' : '全局角色' }}</span>
      </div>

      <el-alert
        v-if="focusRole"
        type="info"
        :closable="false"
        class="focus-role-alert"
      >
        <template #title>
          正在聚焦角色：{{ focusRole.name }}（{{ focusRole.code }}）
          <el-button link type="primary" @click="showAllRoles">显示全部角色</el-button>
        </template>
      </el-alert>

      <el-alert
        v-if="allRoleColumns.length > 0 && roleColumns.length === 0"
        class="no-role-alert"
        type="info"
        :closable="false"
        show-icon
        title="未选择角色列"
        description="请在上方“选择角色列”中选择至少一个角色，以显示权限矩阵。"
      />

      <el-table
        v-loading="loading"
        :data="filteredRows"
        row-key="code"
        border
        stripe
        max-height="calc(100vh - 360px)"
        @sort-change="onSortChange"
      >
        <el-table-column prop="code" label="权限编码" min-width="220" fixed sortable="custom" show-overflow-tooltip />
        <el-table-column prop="description" label="名称" min-width="170" sortable="custom" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || row.code }}</template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="120" sortable="custom" />
        <el-table-column prop="domainCode" label="业务域" width="110" sortable="custom" />
        <el-table-column prop="scopeLevel" label="适用作用域" width="110" align="center" sortable="custom">
          <template #default="{ row }">{{ scopeTypeText(row.scopeLevel) }}</template>
        </el-table-column>
        <el-table-column prop="grantableLevels" label="可授予" width="200" sortable="custom" show-overflow-tooltip />

        <el-table-column
          v-for="role in roleColumns"
          :key="role.code"
          width="104"
          align="center"
          fixed="right"
          class-name="matrix-cell"
        >
          <template #header>
            <el-tooltip :content="`${role.name} · ${role.code} · ${role.roleType}；点击打开角色权限矩阵`" placement="top">
              <div
                class="role-head role-head-link"
                role="button"
                tabindex="0"
                :aria-label="`打开 ${role.name} 的角色权限矩阵`"
                @click="openRole(role)"
                @keydown.enter="openRole(role)"
                @keydown.space.prevent="openRole(role)"
              >
                <span class="role-name">{{ role.name }}</span>
                <el-tag size="small" effect="plain">{{ scopeTypeText(role.scopeLevel) }}</el-tag>
              </div>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <span
              :class="['matrix-state', `matrix-state-${cellStateOf(row, role)}`]"
              :title="cellTitle(row, role)"
              :aria-label="cellTitle(row, role)"
            >
              <el-icon v-if="cellStateOf(row, role) === 'granted'"><Check /></el-icon>
              <el-icon v-else-if="cellStateOf(row, role) === 'anomaly'"><WarningFilled /></el-icon>
              <template v-else>{{ cellStateOf(row, role) === 'grantable' ? '○' : '—' }}</template>
            </span>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty :description="emptyDescription" />
        </template>
      </el-table>

      <div class="catalog-meta">
        <span>{{ rows.length }} 个权限 · {{ roleColumns.length === allRoleColumns.length ? `${roleColumns.length} 个${isTenantMatrix ? '角色' : '全局角色'}` : `${roleColumns.length}/${allRoleColumns.length} 个${isTenantMatrix ? '角色' : '全局角色'}` }}</span>
        <span class="muted" v-if="meta.generatedAt">数据更新于 {{ generatedAtText }}</span>
        <el-button
          v-if="stateCounts.anomaly > 0"
          link
          type="danger"
          @click="stateFilter = 'anomaly'"
        >
          ⚠ {{ stateCounts.anomaly }} 项越界授权
        </el-button>
        <el-tooltip
          v-if="meta.version"
          :content="`版本 ${meta.version} · ${meta.cached ? '缓存命中' : '实时构建'}`"
          placement="top"
        >
          <span class="muted technical-detail">技术详情</span>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Check, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { useContextStore } from '@/stores/context'
import {
  getPermissionMatrix,
  getPermissionMatrixVersion,
  getTenantPermissionMatrix,
  getTenantPermissionMatrixVersion,
} from '@/api/admin'
import { formatTimeWithSeconds } from '@/utils/format'
import { scopeTypeText } from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import {
  CELL_STATES,
  buildGrantLookup,
  buildGrantableLookup,
  buildPermissionMatrixCsv,
  cellState,
  countCellStates,
  filterPermissionRows,
  roleMatrixColumns,
  rowHasCellState,
  sortPermissionRows,
} from '@/utils/permissionMatrix'

const rows = ref([])
const roles = ref([])
const router = useRouter()
const route = useRoute()
const isTenantMatrix = computed(() => route.meta?.tenantMatrix === true)
const contextStore = useContextStore()
const tenantScopeHint = computed(() => {
  if (!isTenantMatrix.value) return ''
  const current = contextStore.current
  if (!current) return '当前未选择租户/门店上下文，无法确定角色适用范围。'
  if (current.storeId && current.storeId > 0) {
    return `当前数据范围：门店 ${current.storeName || current.storeId}。角色模板仍是租户级定义，列头按角色作用域标注。`
  }
  return `当前数据范围：${current.tenantName || '租户总部'}（跨门店），角色模板为租户级定义。`
})
const keyword = ref('')
const moduleFilter = ref(null)
const domainFilter = ref(null)
const scopeFilter = ref(null)
const stateFilter = ref('all')
const selectedRoleCodes = ref([])
const roleSelectionTouched = ref(false)
const focusRoleCode = ref('')
const loading = ref(false)
const stale = ref(false)
const sortState = ref({ prop: '', order: '' })
const meta = ref({ version: '', generatedAt: '', cached: false })

const allRoleColumns = computed(() => roleMatrixColumns(roles.value))
const focusRole = computed(() => allRoleColumns.value.find((role) => role.code === focusRoleCode.value) || null)
const roleColumns = computed(() => {
  if (!roleSelectionTouched.value) return allRoleColumns.value
  return allRoleColumns.value.filter((role) => selectedRoleCodes.value.includes(role.code))
})
const moduleOptions = computed(() => [...new Set(rows.value.map((row) => row.module).filter(Boolean))].sort())
const domainOptions = computed(() => [...new Set(rows.value.map((row) => row.domainCode).filter(Boolean))].sort())
const scopeOptions = computed(() => {
  const levels = [...new Set(rows.value.map((row) => row.scopeLevel).filter(Boolean))]
  return levels.sort().map((level) => ({ value: level, label: scopeTypeText(level) }))
})
const grantLookup = computed(() => buildGrantLookup(roleColumns.value))
const grantableLookup = computed(() => buildGrantableLookup(roleColumns.value))
const stateCounts = computed(() => countCellStates(rows.value, roleColumns.value, grantLookup.value, grantableLookup.value))

const filteredRows = computed(() => {
  let list = filterPermissionRows(rows.value, keyword.value)
  if (moduleFilter.value) list = list.filter((row) => row.module === moduleFilter.value)
  if (domainFilter.value) list = list.filter((row) => row.domainCode === domainFilter.value)
  if (scopeFilter.value) list = list.filter((row) => row.scopeLevel === scopeFilter.value)
  if (stateFilter.value === 'anomaly') {
    list = list.filter((row) => rowHasCellState(row, roleColumns.value, grantLookup.value, grantableLookup.value, CELL_STATES.ANOMALY))
  } else if (stateFilter.value === 'ungranted') {
    list = list.filter((row) => !roleColumns.value.some((role) => grantLookup.value.get(role.code)?.has(row.code)))
  } else if (stateFilter.value === 'grantable') {
    list = list.filter((row) => rowHasCellState(row, roleColumns.value, grantLookup.value, grantableLookup.value, CELL_STATES.GRANTABLE))
  }
  return sortPermissionRows(list, sortState.value)
})

function onRoleSelectionChange() {
  roleSelectionTouched.value = true
  if (!focusRoleCode.value) return
  focusRoleCode.value = ''
  const query = { ...route.query }
  delete query.role
  router.replace({ query })
}

function resetFilters() {
  keyword.value = ''
  moduleFilter.value = null
  domainFilter.value = null
  scopeFilter.value = null
  stateFilter.value = 'all'
  selectedRoleCodes.value = allRoleColumns.value.map((role) => role.code)
  roleSelectionTouched.value = false
  focusRoleCode.value = ''
  if (route.query.role) {
    const query = { ...route.query }
    delete query.role
    router.replace({ query })
  }
}

/** 首次加载默认全选；用户手动选择过则保留其选择，只剔除已失效角色。 */
function applyRoleSelection() {
  const codes = allRoleColumns.value.map((role) => role.code)
  if (!roleSelectionTouched.value) {
    selectedRoleCodes.value = codes
    return
  }
  selectedRoleCodes.value = selectedRoleCodes.value.filter((code) => codes.includes(code))
}

/** 角色页/深链传入 ?role=CODE 时只聚焦该角色列，避免在几十列里手动找。 */
function applyRouteRoleFocus() {
  const code = typeof route.query.role === 'string' ? route.query.role : ''
  if (!code || !allRoleColumns.value.some((role) => role.code === code)) {
    focusRoleCode.value = ''
    return
  }
  focusRoleCode.value = code
  selectedRoleCodes.value = [code]
  roleSelectionTouched.value = true
}

function showAllRoles() {
  focusRoleCode.value = ''
  roleSelectionTouched.value = false
  selectedRoleCodes.value = allRoleColumns.value.map((role) => role.code)
  const query = { ...route.query }
  delete query.role
  router.replace({ query })
}

const emptyDescription = computed(() => {
  if (stateFilter.value === 'anomaly') return '没有越界授权'
  if (stateFilter.value === 'ungranted') return '没有未授予的权限'
  if (stateFilter.value === 'grantable') return '没有可补充的权限'
  if (keyword.value || moduleFilter.value || domainFilter.value || scopeFilter.value) return '没有匹配当前筛选条件的权限'
  return '暂无权限'
})

const generatedAtText = computed(() => {
  if (!meta.value.generatedAt) return '—'
  const generatedAt = new Date(meta.value.generatedAt)
  return Number.isFinite(generatedAt.getTime()) ? formatTimeWithSeconds(generatedAt).slice(0, 16) : '—'
})

function cellStateOf(row, role) {
  return cellState(row?.code, role?.code, grantLookup.value, grantableLookup.value)
}

function cellTitle(row, role) {
  const state = cellStateOf(row, role)
  const labels = {
    granted: '已授予',
    grantable: '可授予，未授予',
    forbidden: '不可授予（角色作用域不在该权限可授予范围）',
    anomaly: '越界授权：已授予但该角色作用域不可授予，请核查',
  }
  return `${role.name} · ${row.code}：${labels[state]}（${role.roleType === 'PRESET' ? '预置角色' : '自定义角色'}）`
}

function onSortChange({ prop, order }) {
  sortState.value = { prop: prop || '', order: order || '' }
}

/** 从矩阵列头进入角色权限编辑：角色页按 query.role 自动打开对应矩阵。 */
function openRole(role) {
  router.push({ name: isTenantMatrix.value ? 'TenantRoles' : 'IamRoles', query: { role: role.code } })
}

/** 导出当前筛选结果与当前角色列，供 Excel 复核。 */
function exportCsv() {
  const csv = buildPermissionMatrixCsv(filteredRows.value, roleColumns.value, grantLookup.value, grantableLookup.value)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const now = new Date()
  const pad = (part) => String(part).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const link = document.createElement('a')
  link.href = url
  link.download = `permission-matrix-${stamp}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('已导出当前视图')
}

async function checkVersion() {
  if (loading.value || !meta.value.version || document.visibilityState !== 'visible') return
  try {
    const data = isTenantMatrix.value
      ? await getTenantPermissionMatrixVersion()
      : await getPermissionMatrixVersion()
    if (data?.version && data.version !== meta.value.version) stale.value = true
  } catch {
    // 轻量校验失败不影响主数据；下次聚焦/刷新会重试
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') checkVersion()
}

async function load(refresh = false) {
  loading.value = true
  try {
    const data = isTenantMatrix.value
      ? await getTenantPermissionMatrix(refresh ? { refresh: true } : undefined)
      : await getPermissionMatrix(refresh ? { refresh: true } : undefined)
    rows.value = Array.isArray(data?.permissions) ? data.permissions : []
    roles.value = Array.isArray(data?.roles) ? data.roles : []
    applyRoleSelection()
    applyRouteRoleFocus()
    meta.value = {
      version: data?.version || '',
      generatedAt: data?.generatedAt || '',
      cached: Boolean(data?.cached),
    }
    stale.value = false
    if (refresh) ElMessage.success(isTenantMatrix.value ? '角色权限矩阵已刷新' : '权限目录已刷新')
  } catch (error) {
    rows.value = []
    roles.value = []
    meta.value = { version: '', generatedAt: '', cached: false }
    notifyAdminRequestError(error, '加载权限目录矩阵失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load(false)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', checkVersion)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', checkVersion)
})
</script>

<style scoped>
.catalog-toolbar {
  justify-content: space-between;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.matrix-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.focus-role-alert { margin-bottom: 12px; }

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 13px;
  line-height: 1;
}

.legend-granted {
  color: var(--el-color-success);
  font-weight: 600;
}

.legend-grantable {
  color: var(--el-color-primary);
  font-weight: 600;
}

.legend-forbidden {
  color: var(--el-text-color-placeholder);
}

.legend-anomaly {
  color: var(--el-color-danger);
}

.no-role-alert {
  margin-bottom: 12px;
}

.stale-alert {
  margin-bottom: 12px;
}

.anomaly-alert {
  margin-bottom: 12px;
}

.anomaly-body {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.stale-body {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.role-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  line-height: 1.2;
}

.role-name {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.role-head-link {
  cursor: pointer;
  border-radius: 4px;
  outline: none;
}

.role-head-link:hover,
.role-head-link:focus-visible {
  background: var(--el-fill-color-light);
}

.matrix-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  min-height: 16px;
  font-size: 15px;
  line-height: 1;
}

.matrix-state-granted {
  color: var(--el-color-success);
}

.matrix-state-grantable {
  color: var(--el-color-primary);
  font-weight: 600;
}

.matrix-state-forbidden {
  color: var(--el-text-color-placeholder);
}

.matrix-state-anomaly {
  color: var(--el-color-danger);
}

.catalog-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.muted {
  color: var(--el-text-color-secondary);
}

.technical-detail {
  text-decoration: underline dotted;
  cursor: help;
}

@media (max-width: 900px) {
  .catalog-toolbar {
    align-items: flex-start;
  }

  .matrix-legend {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
