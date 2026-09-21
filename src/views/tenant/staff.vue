<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>运营人员</h2>
      <div style="display:flex;gap:10px">
        <el-button @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
        <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新增运营人员</el-button>
      </div>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <!-- 创建时间（createdAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59；
             本页没有「查询」按钮，选完即按区间重新拉取。 -->
        <DateRangeFilter v-model="range" @change="load" @clear="load" />
      </div>
      <p class="tip">运营人员使用账号密码登录管理后台，IM 账号可选。所有 IM 用户均可授权进入 A380；绑定运营人员后，可按所授角色使用管理功能。</p>
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column prop="username" label="登录账号" min-width="150" />
        <el-table-column prop="displayName" label="显示名" min-width="110" />
        <el-table-column label="IM 关联" width="92" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.imBound ? 'success' : 'info'">{{ row.imBound ? '已关联' : '未关联' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="平台账号" width="90" align="center">
          <template #default="{ row }">{{ row.platformAccountId ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="角色 / 作用域" min-width="240">
          <template #default="{ row }">
            <template v-if="(row.roles || []).length">
              <div v-for="(r, i) in row.roles" :key="i" class="role-line">
                <el-tag size="small" type="primary">{{ r.roleName || r.roleCode }}</el-tag>
                <span class="scope-text">{{ scopeText(r.scopeType) }}{{ r.storeName ? ' · ' + r.storeName : '' }}{{ r.tenantName ? ' · ' + r.tenantName : '' }}</span>
              </div>
            </template>
            <span v-else class="muted">未绑定</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="staffStatusType(row.status)">{{ staffStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center" fixed="right">
          <template #default="{ row }">
            <el-button v-if="!row.imBound" link type="primary" size="small" :disabled="!row.canManageAccount" @click="openBindIm(row)">关联 IM</el-button>
            <el-button v-else link type="primary" size="small" :disabled="!row.canManageAccount" @click="unbindIm(row)">解绑</el-button>
            <el-button link type="warning" size="small" :disabled="!row.canManageAccount" @click="toggleStatus(row)">
              {{ staffStatusActionText(row.status) }}
            </el-button>
            <el-button link type="danger" size="small" :disabled="!row.canManageAccount" @click="removeStaff(row)">删除</el-button>
            <div v-if="!row.canManageAccount" class="muted">涉及其他运营范围</div>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无运营人员" /></template>
      </el-table>
    </div>

    <el-dialog v-model="createVisible" title="新增运营人员" width="min(480px, 94vw)">
      <el-form ref="createFormRef" :model="form" :rules="formRules" label-width="90px" @keyup.enter="doCreate">
        <el-form-item label="IM 账号">
          <el-input v-model="form.imAccount" placeholder="可选，关联 IM 身份的管理权限" />
        </el-form-item>
        <el-form-item label="登录账号" prop="username" required>
          <el-input v-model="form.username" placeholder="3–64 位字母、数字、下划线、点或短横线" autocomplete="off" />
        </el-form-item>
        <el-form-item label="登录密码" prop="password" required>
          <el-input v-model="form.password" type="password" show-password placeholder="至少 8 位，最多 72 字节" autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="form.displayName" placeholder="员工姓名" />
        </el-form-item>
        <el-form-item label="角色" prop="roleId" required>
          <el-select v-model="form.roleId" style="width:100%" @change="onRoleChange">
            <el-option v-for="role in options.roles" :key="role.roleId" :label="role.name" :value="role.roleId" />
          </el-select>
        </el-form-item>
        <el-form-item label="作用域" prop="scopeType">
          {{ scopeTypeHintText(form.scopeType) }}
        </el-form-item>
        <el-form-item v-if="form.scopeType === 'STORE'" label="门店" prop="storeId" required>
          <el-select v-model="form.storeId" style="width:100%" placeholder="请选择门店">
            <el-option v-for="store in options.stores" :key="store.id" :label="store.name" :value="store.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="doCreate">开通</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="bindImVisible" title="关联 IM 账号" width="min(420px, 94vw)">
      <p class="tip">关联后，运营人员仍使用原登录账号和密码进入 SaaS 后台；该 IM 身份同时获得当前角色的管理权限。所有已授权 IM 用户进入 A380 C 端的能力不受影响。</p>
      <el-form label-width="80px">
        <el-form-item label="运营人员">
          {{ bindTarget?.displayName || bindTarget?.username }}
        </el-form-item>
        <el-form-item label="IM 账号" required>
          <el-input v-model="bindImAccount" placeholder="请输入已注册的 IM 账号" autocomplete="off" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bindImVisible = false">取消</el-button>
        <el-button type="primary" :loading="bindingIm" @click="doBindIm">确认关联</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus } from '@element-plus/icons-vue'
import { listStaff, createStaff, updateStaffStatus, bindStaffIm, unbindStaffIm, deleteStaff, getStaffOptions } from '@/api/staff'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { formatTime } from '@/utils/format'
import { scopeTypeHintText, scopeTypeText, staffStatusActionText, staffStatusText, staffStatusType } from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { useContextStore } from '@/stores/context'

const contextStore = useContextStore()

const rows = ref([])
const loading = ref(false)
/** 时间区间（创建时间 createdAt）：本页查询条件不是 reactive 对象，区间单独一个 ref。 */
const range = ref(emptyDateRange())
const createVisible = ref(false)
const creating = ref(false)
const createFormRef = ref()
const bindImVisible = ref(false)
const bindingIm = ref(false)
const bindTarget = ref(null)
const bindImAccount = ref('')
const options = ref({ roles: [], stores: [] })
const form = ref({ username: '', password: '', imAccount: '', displayName: '', roleId: null, scopeType: 'TENANT', storeId: null })

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/

// 行内校验：提交失败必须落在具体字段上，不能只靠一闪而过的浮层提示。
const formRules = {
  username: [
    { required: true, message: '请输入登录账号', trigger: 'blur' },
    { validator: (_rule, value, callback) => {
      if (value && !USERNAME_PATTERN.test(String(value).trim())) callback(new Error('3–64 位字母、数字、下划线、点或短横线，并以字母或数字开头'))
      else callback()
    }, trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入登录密码', trigger: 'blur' },
    { validator: (_rule, value, callback) => {
      if (value && (String(value).length < 8 || new TextEncoder().encode(String(value)).length > 72)) callback(new Error('密码至少 8 位，且不超过 72 字节'))
      else callback()
    }, trigger: 'blur' },
  ],
  roleId: [{ required: true, message: '请选择角色', trigger: 'change' }],
  storeId: [{ validator: (_rule, _value, callback) => {
    if (form.value.scopeType === 'STORE' && !form.value.storeId) callback(new Error('请选择门店'))
    else callback()
  }, trigger: 'change' }],
}

/** 作用域中文词表统一在 constants/terms（SCOPE_TYPE_TEXT / SCOPE_TYPE_HINT_TEXT）。 */
function scopeText(s) {
  return scopeTypeText(s)
}

async function load() {
  // 本页没有「查询」按钮，守卫放在加载入口：区间倒挂时只提示、不发请求。
  const warning = dateRangeWarning(range.value)
  if (warning) { ElMessage.warning(warning); return }
  loading.value = true
  try {
    const data = await listStaff({ ...dateRangeParams(range.value) })
    rows.value = Array.isArray(data) ? data : (data && data.items) || []
  } catch (e) {
    rows.value = []
    notifyAdminRequestError(e, '加载运营人员失败')
  } finally {
    loading.value = false
  }
}

async function openCreate() {
  try {
    options.value = await getStaffOptions()
    form.value = { username: '', password: '', imAccount: '', displayName: '', roleId: options.value.roles[0]?.roleId, scopeType: 'TENANT', storeId: contextStore.storeId }
    onRoleChange()
    createFormRef.value?.clearValidate()
    createVisible.value = true
  } catch (error) {
    notifyAdminRequestError(error, '加载角色和门店失败')
  }
}

function onRoleChange() {
  form.value.scopeType = options.value.roles.find(role => role.roleId === form.value.roleId)?.scopeType || 'TENANT'
  if (form.value.scopeType === 'TENANT') form.value.storeId = null
  else if (!form.value.storeId) form.value.storeId = options.value.stores[0]?.id ?? null
}

async function doCreate() {
  if (creating.value) return
  // 行内校验失败时给出明确反馈，避免「点了没反应」。
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) { ElMessage.warning('请先补全表单中标 * 的必填项'); return }
  const username = (form.value.username || '').trim()
  if (!USERNAME_PATTERN.test(username)) { ElMessage.warning('登录账号格式不正确'); return }
  if (!form.value.password?.trim() || form.value.password.length < 8 || new TextEncoder().encode(form.value.password).length > 72) { ElMessage.warning('密码至少 8 位，且不超过 72 字节'); return }
  const stores = Array.isArray(options.value.stores) ? options.value.stores : []
  const store = stores.find(item => item.id === form.value.storeId)
  if (!form.value.roleId || !contextStore.tenantId || (form.value.scopeType === 'STORE' && !store)) {
    ElMessage.warning('请先选择对应租户或门店')
    return
  }
  creating.value = true
  try {
    await createStaff({
      username,
      password: form.value.password,
      imAccount: (form.value.imAccount || '').trim() || null,
      displayName: form.value.displayName || username,
      roleId: form.value.roleId,
      scopeType: form.value.scopeType,
      tenantId: contextStore.tenantId,
      organizationId: form.value.scopeType === 'STORE' ? store.organizationId : null,
      storeId: form.value.scopeType === 'STORE' ? store.id : null,
    })
    ElMessage.success('已开通运营人员')
    createVisible.value = false
    form.value.password = ''
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '开通失败')
  } finally {
    creating.value = false
  }
}

function openBindIm(row) {
  bindTarget.value = row
  bindImAccount.value = ''
  bindImVisible.value = true
}

async function doBindIm() {
  const imAccount = bindImAccount.value.trim()
  if (!imAccount) { ElMessage.warning('请输入 IM 账号'); return }
  bindingIm.value = true
  try {
    await bindStaffIm(bindTarget.value.id, imAccount)
    ElMessage.success('已关联 IM 账号')
    bindImVisible.value = false
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '关联 IM 账号失败')
  } finally {
    bindingIm.value = false
  }
}

/**
 * 解绑 IM 账号：二次确认走本页既有的 ElMessageBox.confirm（不用 ElMessageBox.prompt：
 * 真机上点确认既不关闭也不发请求）。解绑只清 IM 关联，登录账号与角色权限都保留。
 */
async function unbindIm(row) {
  try {
    await ElMessageBox.confirm(
      `确认解除「${row.displayName || row.username}」与 IM 账号的关联？解除后该运营人员仍可用原登录账号进入后台，角色权限不受影响，之后可以重新关联其它 IM 账号。`,
      '解绑 IM 账号',
      { type: 'warning', confirmButtonText: '解绑' },
    )
  } catch {
    return // 运营取消确认：不发请求
  }
  try {
    await unbindStaffIm(row.id)
    ElMessage.success('已解绑 IM 账号')
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '解绑 IM 账号失败')
  }
}

async function toggleStatus(row) {
  const next = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  const label = staffStatusText(next)
  await ElMessageBox.confirm(`确认${label}运营人员「${row.displayName || row.username}」？`, label)
  try {
    await updateStaffStatus(row.id, next)
    ElMessage.success(`已${label}`)
    load()
  } catch (e) {
    notifyAdminRequestError(e, `${label}失败`)
  }
}

async function removeStaff(row) {
  await ElMessageBox.confirm(
    `确认删除运营人员「${row.displayName || row.username}」？删除后将撤销其全部角色并无法登录后台。`,
    '删除运营人员',
    { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  )
  try {
    await deleteStaff(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    notifyAdminRequestError(e, '删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.tip { margin: 0 0 12px; color: var(--el-text-color-secondary); font-size: 13px; }
.role-line { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.scope-text { color: var(--el-text-color-secondary); font-size: 12px; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }

@media (max-width: 800px) {
  .admin-card { padding: 12px; overflow-x: auto; }
  .page-header > div { width: 100%; justify-content: flex-end; }
}
</style>
