<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2>角色与权限</h2>
        <p class="subtle">
          平台角色、租户角色、门店角色分层管理；权限按角色作用域过滤，保存后立即生效。
        </p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="isPlatform" @click="router.push('/admin/iam/role-profiles')">工作台默认值</el-button>
        <el-button v-if="isPlatform" @click="router.push('/admin/iam/permissions')">查看权限目录</el-button>
        <el-button type="primary" :disabled="!canCreate" @click="openCreate()">新建角色</el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="权限范围由角色作用域决定"
      :description="scopeHint"
    />

    <div class="admin-card">
      <el-table v-loading="loading" :data="roles" border stripe>
        <el-table-column prop="name" label="角色" min-width="160" />
        <el-table-column prop="code" label="角色编码" min-width="190" />
        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.roleType === 'PRESET' ? 'info' : 'success'">
              {{ roleTypeText(row.roleType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="作用域" width="110" align="center">
          <template #default="{ row }">{{ scopeTypeText(row.scopeLevel) }}</template>
        </el-table-column>
        <el-table-column label="权限" width="90" align="center">
          <template #default="{ row }">{{ permissionCounts[row.id] ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="250" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openPermissions(row)">权限矩阵</el-button>
            <el-button link type="primary" :disabled="!canCreate" @click="openCreate(row)">复制</el-button>
            <el-button
              v-if="!isPlatform"
              link
              type="primary"
              @click="openMembers(row)"
            >
              分配人员
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="createVisible" title="新建角色" width="520px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="角色名称">
          <el-input v-model="form.name" maxlength="64" placeholder="例如：值班主管" />
        </el-form-item>
        <el-form-item label="角色编码">
          <el-input v-model="form.code" maxlength="64" placeholder="例如：store.supervisor" />
        </el-form-item>
        <el-form-item label="作用域">
          <el-select v-model="form.scopeLevel" style="width: 100%" :disabled="isPlatform">
            <el-option v-for="option in scopeOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        <el-alert
          type="warning"
          :closable="false"
          :title="isPlatform ? '平台角色只能选择已标记为可授予 PLATFORM 的权限' : '租户角色只能授予本租户范围内的权限'"
        />
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRole">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="permissionVisible"
      :title="currentRole ? `权限矩阵 · ${currentRole.name}` : '权限矩阵'"
      width="720px"
      :close-on-click-modal="false"
      :before-close="beforePermissionClose"
    >
        <el-alert
          v-if="!canManage && !isPreset(currentRole)"
          type="info"
          :closable="false"
          title="当前账号只有角色查看权限，权限矩阵为只读"
          class="permission-alert"
        />
        <el-alert
          v-if="isPreset(currentRole)"
          type="warning"
          :closable="false"
          title="预置角色只读；需要调整请复制为租户自定义角色"
          class="permission-alert"
        />
        <div v-loading="permissionLoading" class="permission-groups">
          <section v-for="group in permissionGroups" :key="group.module" class="permission-group">
            <h4>{{ group.module }}</h4>
            <el-checkbox-group v-model="selectedPermissionIds" :disabled="isPreset(currentRole) || !canManage">
              <el-checkbox v-for="permission in group.items" :key="permission.id" :value="permission.id">
                {{ permission.description || permission.code }}
              </el-checkbox>
            </el-checkbox-group>
          </section>
          <el-empty v-if="!permissionLoading && !permissionGroups.length" description="当前作用域没有可授予权限" />
        </div>
        <template #footer>
          <el-button @click="requestPermissionClose">取消</el-button>
          <el-button
            v-if="!isPreset(currentRole) && canManage"
            type="primary"
            :loading="savingPermissions"
            @click="savePermissions"
          >
            保存权限
          </el-button>
          <el-button v-else-if="isPreset(currentRole)" type="primary" @click="copyCurrentRole">复制角色</el-button>
        </template>
    </el-dialog>
    <el-dialog v-model="memberVisible" :title="memberRole ? `分配人员 · ${memberRole.name}` : '分配人员'" width="620px">
      <el-alert
        v-if="memberRole?.scopeLevel === 'STORE'"
        type="info"
        :closable="false"
        title="门店角色只分配到当前门店；请在顶部先选择门店"
        class="permission-alert"
      />
      <el-table v-loading="membersLoading" :data="assignedMembers" border stripe>
        <el-table-column prop="username" label="账号" min-width="140" />
        <el-table-column prop="displayName" label="姓名" min-width="120" />
        <el-table-column label="作用域" min-width="180">
          <template #default="{ row }">{{ memberScope(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="openScope(row)">调整</el-button>
            <el-button link type="danger" @click="removeMember(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="member-add">
        <el-select v-model="selectedStaffId" filterable placeholder="选择未分配该角色的运营人员" style="flex:1">
          <el-option
            v-for="staff in assignableStaff"
            :key="staff.id"
            :label="`${staff.displayName || staff.username}（${staff.username}）`"
            :value="staff.id"
          />
        </el-select>
        <el-button type="primary" :loading="assigning" @click="assignMember">分配</el-button>
      </div>
      <template #footer>
        <el-button @click="memberVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="scopeVisible" title="调整作用域" width="480px">
      <el-form label-width="90px">
        <el-form-item label="人员">
          {{ scopeStaff?.displayName || scopeStaff?.username }}
        </el-form-item>
        <el-form-item v-if="memberRole?.scopeLevel === 'STORE'" label="门店">
          <el-select v-model="scopeStoreId" style="width:100%" placeholder="选择门店">
            <el-option
              v-for="item in storeOptions"
              :key="item.storeId"
              :label="item.storeName"
              :value="item.storeId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scopeVisible = false">取消</el-button>
        <el-button type="primary" :loading="scopeSaving" @click="saveScope">保存</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  assignRolePermissions,
  assignUserRole,
  createRole,
  getRolePermissionCounts,
  getRolePermissionSnapshot,
  listPermissions,
  listRoleCatalog,
  revokeRoleMember,
  updateRoleMemberScope,
} from '@/api/admin'
import { listStaff } from '@/api/staff'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { hasPermission } from '@/utils/context'
import { useContextStore } from '@/stores/context'
import { roleTypeText, scopeTypeText } from '@/constants/terms'

const router = useRouter()
const route = useRoute()
const contextStore = useContextStore()
const roles = ref([])
const permissions = ref([])
const permissionCounts = reactive({})
const loading = ref(false)
const permissionLoading = ref(false)
const createVisible = ref(false)
const permissionVisible = ref(false)
const saving = ref(false)
const savingPermissions = ref(false)
const currentRole = ref(null)
const selectedPermissionIds = ref([])
const initialPermissionIds = ref([])
const permissionVersion = ref('')
const memberVisible = ref(false)
const memberRole = ref(null)
const members = ref([])
const membersLoading = ref(false)
const selectedStaffId = ref(null)
const assigning = ref(false)
const scopeVisible = ref(false)
const scopeStaff = ref(null)
const scopeStoreId = ref(null)
const scopeSaving = ref(false)
const form = reactive({ code: '', name: '', scopeLevel: 'TENANT' })

const isPlatform = computed(() => {
  const current = contextStore.current
  return current?.scopeType === 'PLATFORM' || !current?.tenantId
})
const canManage = computed(() => hasPermission(contextStore.current?.permissions,
  isPlatform.value ? 'platform.iam.role.manage' : 'iam.role.manage'))
const canCreate = canManage
const scopeHint = computed(() => isPlatform.value
  ? '平台角色按 PLATFORM 可授予范围配置权限；平台运营进入租户上下文时使用同一权限快照。'
  : '租户可创建 TENANT/STORE 角色；预置角色只读，修改请复制。')
const storeOptions = computed(() => (contextStore.items || []).filter((item) => item.storeId != null))

const assignedMembers = computed(() => {
  if (!memberRole.value) return []
  return members.value.filter((staff) =>
    (staff.roles || []).some((binding) => binding.roleCode === memberRole.value.code && binding.status === 'ACTIVE'))
})

const assignableStaff = computed(() => {
  if (!memberRole.value) return []
  const assignedIds = new Set(assignedMembers.value.map((staff) => staff.id))
  return members.value.filter((staff) => !assignedIds.has(staff.id))
})

const scopeOptions = computed(() => isPlatform.value
  ? [{ value: 'PLATFORM', label: '平台' }]
  : [
      { value: 'TENANT', label: '租户' },
      { value: 'STORE', label: '门店' },
    ])

const permissionGroups = computed(() => {
  if (!currentRole.value) return []
  const level = currentRole.value.scopeLevel
  const groups = new Map()
  for (const permission of permissions.value) {
    const levels = String(permission.grantableLevels || '').split(',').map((item) => item.trim())
    if (!levels.includes(level)) continue
    const module = permission.module || '其它'
    if (!groups.has(module)) groups.set(module, [])
    groups.get(module).push(permission)
  }
  return [...groups.entries()].map(([module, items]) => ({ module, items }))
})

function isPreset(role) {
  return role?.roleType === 'PRESET'
}

async function load() {
  if (loading.value) return
  loading.value = true
  try {
    roles.value = (await listRoleCatalog()) || []
    permissions.value = (await listPermissions()) || []
    const counts = (await getRolePermissionCounts()) || []
    for (const key of Object.keys(permissionCounts)) delete permissionCounts[key]
    for (const item of counts) permissionCounts[item.roleId] = item.permissionCount
  } catch (error) {
    notifyAdminRequestError(error, '加载角色失败')
  } finally {
    loading.value = false
  }
}

/**
 * 从权限目录矩阵列头深链进入：query.role 指定角色 code，加载完成后自动打开该角色的权限矩阵。
 * 打开后清掉 query，避免刷新/返回时重复弹出。
 */
async function openRoleFromQuery() {
  const roleCode = typeof route.query.role === 'string' ? route.query.role : ''
  if (!roleCode) return
  const role = roles.value.find((item) => item.code === roleCode)
  if (!role) return
  const query = { ...route.query }
  delete query.role
  await router.replace({ query })
  await openPermissions(role)
}

function openCreate(source) {
  form.code = source ? `${source.code}.copy` : ''
  form.name = source ? `${source.name} 副本` : ''
  form.scopeLevel = isPlatform.value ? 'PLATFORM' : (source?.scopeLevel || 'TENANT')
  createVisible.value = true
}

async function saveRole() {
  if (!form.name.trim() || !form.code.trim()) {
    ElMessage.warning('请填写角色名称和编码')
    return
  }
  saving.value = true
  try {
    await createRole({
      code: form.code.trim(),
      name: form.name.trim(),
      scopeLevel: form.scopeLevel,
    })
    createVisible.value = false
    ElMessage.success('角色已创建')
    await load()
  } catch (error) {
    notifyAdminRequestError(error, '创建角色失败')
  } finally {
    saving.value = false
  }
}

async function openPermissions(role) {
  currentRole.value = role
  selectedPermissionIds.value = []
  initialPermissionIds.value = []
  permissionVersion.value = ''
  permissionVisible.value = true
  permissionLoading.value = true
  try {
    // 权限元数据（grantableLevels）可能已被迁移/其他管理员修改，打开弹窗前重新拉取。
    permissions.value = (await listPermissions()) || []
    const snapshot = await getRolePermissionSnapshot(role.id)
    const codes = snapshot?.permissionCodes || []
    const byCode = new Map(permissions.value.map((permission) => [permission.code, permission.id]))
    const ids = codes.map((code) => byCode.get(code)).filter(Boolean)
    selectedPermissionIds.value = ids
    initialPermissionIds.value = [...ids]
    permissionVersion.value = snapshot?.version || ''
  } catch (error) {
    notifyAdminRequestError(error, '加载角色权限失败')
  } finally {
    permissionLoading.value = false
  }
}

function normalizeIds(ids) {
  return [...(Array.isArray(ids) ? ids : [])].sort((left, right) => Number(left) - Number(right)).join(',')
}

function permissionDirty() {
  if (isPreset(currentRole.value)) return false
  return normalizeIds(selectedPermissionIds.value) !== normalizeIds(initialPermissionIds.value)
}

async function closePermissionDialog() {
  permissionVisible.value = false
}

function requestPermissionClose() {
  beforePermissionClose(closePermissionDialog)
}

/** 有未保存修改时二次确认；预置角色只读，直接关闭。 */
async function beforePermissionClose(done) {
  if (!permissionDirty()) {
    done()
    return
  }
  try {
    await ElMessageBox.confirm('权限修改尚未保存，确定关闭吗？', '未保存的修改', {
      type: 'warning',
      confirmButtonText: '放弃修改',
      cancelButtonText: '继续编辑',
    })
    done()
  } catch {
    // 用户选择继续编辑
  }
}

function isVersionConflict(error) {
  return error?.response?.status === 409 || error?.response?.data?.code === 'PERMISSION_VERSION_CONFLICT'
}

async function savePermissions() {
  if (!currentRole.value) return
  savingPermissions.value = true
  try {
    await assignRolePermissions(currentRole.value.id, selectedPermissionIds.value, permissionVersion.value)
    permissionCounts[currentRole.value.id] = selectedPermissionIds.value.length
    initialPermissionIds.value = [...selectedPermissionIds.value]
    ElMessage.success('角色权限已保存')
    permissionVisible.value = false
  } catch (error) {
    if (isVersionConflict(error)) {
      ElMessage.warning('权限已被其他管理员修改，已重新加载最新授权')
      await openPermissions(currentRole.value)
      return
    }
    notifyAdminRequestError(error, '保存角色权限失败')
  } finally {
    savingPermissions.value = false
  }
}

function copyCurrentRole() {
  const role = currentRole.value
  permissionVisible.value = false
  openCreate(role)
}

async function openMembers(role) {
  memberRole.value = role
  selectedStaffId.value = null
  memberVisible.value = true
  membersLoading.value = true
  try {
    members.value = (await listStaff()) || []
  } catch (error) {
    members.value = []
    notifyAdminRequestError(error, '加载运营人员失败')
  } finally {
    membersLoading.value = false
  }
}

function memberScope(staff) {
  const binding = (staff.roles || []).find((item) => item.roleCode === memberRole.value?.code)
  if (!binding) return '-'
  return scopeTypeText(binding.scopeType)
}

function openScope(staff) {
  scopeStaff.value = staff
  const binding = (staff.roles || []).find((item) => item.roleCode === memberRole.value?.code)
  scopeStoreId.value = binding?.storeId || contextStore.current?.storeId || null
  scopeVisible.value = true
}

async function saveScope() {
  if (!scopeStaff.value || !memberRole.value) return
  if (memberRole.value.scopeLevel === 'STORE' && !scopeStoreId.value) {
    ElMessage.warning('请选择门店')
    return
  }
  scopeSaving.value = true
  try {
    await updateRoleMemberScope(memberRole.value.id, scopeStaff.value.platformAccountId, {
      organizationId: contextStore.current?.organizationId,
      storeId: memberRole.value.scopeLevel === 'STORE' ? scopeStoreId.value : null,
      scopeType: memberRole.value.scopeLevel,
    })
    ElMessage.success('作用域已调整')
    scopeVisible.value = false
    await openMembers(memberRole.value)
  } catch (error) {
    notifyAdminRequestError(error, '调整作用域失败')
  } finally {
    scopeSaving.value = false
  }
}

async function removeMember(staff) {
  try {
    await ElMessageBox.confirm(
      `确认移除 ${staff.displayName || staff.username} 的「${memberRole.value?.name}」角色？`,
      '移除角色',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await revokeRoleMember(memberRole.value.id, staff.platformAccountId)
    ElMessage.success('角色已移除')
    await openMembers(memberRole.value)
  } catch (error) {
    notifyAdminRequestError(error, '移除角色失败')
  }
}

async function assignMember() {  if (!selectedStaffId.value || !memberRole.value) {
    ElMessage.warning('请选择运营人员')
    return
  }
  const staff = members.value.find((item) => item.id === selectedStaffId.value)
  if (!staff?.platformAccountId) {
    ElMessage.warning('该运营人员没有可分配的平台账号')
    return
  }
  const context = contextStore.current
  if (memberRole.value.scopeLevel === 'STORE' && !context?.storeId) {
    ElMessage.warning('请在顶部先选择门店，再分配门店角色')
    return
  }
  assigning.value = true
  try {
    await assignUserRole({
      accountId: staff.platformAccountId,
      tenantId: context?.tenantId,
      organizationId: context?.organizationId,
      storeId: memberRole.value.scopeLevel === 'STORE' ? context?.storeId : null,
      roleId: memberRole.value.id,
      scopeType: memberRole.value.scopeLevel,
    })
    ElMessage.success('角色已分配')
    selectedStaffId.value = null
    await openMembers(memberRole.value)
  } catch (error) {
    notifyAdminRequestError(error, '分配角色失败')
  } finally {
    assigning.value = false
  }
}

let reloadTimer = null

/** 回到页面时刷新角色与权限计数，避免 V36 或其他人修改后长期显示旧数据。 */
function scheduleReload() {
  if (document.visibilityState !== 'visible' || loading.value) return
  if (permissionVisible.value || createVisible.value || memberVisible.value) return
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => load(), 300)
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') scheduleReload()
}

onMounted(async () => {
  await load()
  await openRoleFromQuery()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', scheduleReload)
})

onBeforeUnmount(() => {
  if (reloadTimer) clearTimeout(reloadTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', scheduleReload)
})
</script>

<style scoped>
.header-actions { display: flex; gap: 10px; }
.permission-alert { margin-bottom: 12px; }
.permission-groups { max-height: 52vh; overflow: auto; }
.permission-group { padding: 10px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.permission-group h4 { margin: 0 0 8px; font-size: 13px; color: var(--el-text-color-regular); }
.permission-group :deep(.el-checkbox) { width: 46%; margin-right: 0; }
.member-add { display: flex; gap: 10px; margin-top: 14px; }
</style>
