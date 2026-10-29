<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2>平台运营人员</h2>
        <p class="subtle">管理平台运营账号及其 IAM 平台角色；平台超级管理员不在此列表中。</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="平台超级管理员是后台固定角色"
      description="当前页面只管理 identity PLATFORM_OPERATOR 账号与平台 IAM 角色的绑定。超级管理员/平台管理员由后台 AdminRole 固定控制，不能在这里授权或编辑。"
    />

    <div class="admin-card">
      <el-table v-loading="loading" :data="operators" border stripe empty-text="暂无平台运营账号">
        <el-table-column prop="accountId" label="账号 ID" width="110" />
        <el-table-column label="登录标识" min-width="180">
          <template #default="{ row }">{{ row.loginIdentifier || '未绑定登录标识' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="activeStatusType(row.status)">{{ activeStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="平台角色" min-width="260">
          <template #default="{ row }">
            <el-tag
              v-for="role in row.roles"
              :key="role.bindingId"
              class="role-tag"
              closable
              @close="revoke(row, role)"
            >
              {{ role.roleName || role.roleCode }}
            </el-tag>
            <span v-if="!row.roles?.length" class="muted">未授予平台角色</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openAssign(row)">授予角色</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="assignVisible" title="授予平台角色" width="480px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="运营账号">
          <span>{{ current?.loginIdentifier || current?.accountId }}</span>
        </el-form-item>
        <el-form-item label="平台角色">
          <el-select v-model="selectedRoleId" style="width: 100%" placeholder="选择平台角色">
            <el-option
              v-for="role in assignableRoles"
              :key="role.id"
              :label="`${role.name}（${role.code}）`"
              :value="role.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="assigning" :disabled="!selectedRoleId" @click="assign">授予</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  assignPlatformRole,
  listPlatformOperators,
  listRoleCatalog,
  revokePlatformRole,
} from '@/api/admin'
import { activeStatusText, activeStatusType } from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const loading = ref(false)
const operators = ref([])
const roles = ref([])
const assignVisible = ref(false)
const assigning = ref(false)
const current = ref(null)
const selectedRoleId = ref(null)

const assignableRoles = computed(() => roles.value.filter((role) => role.scopeLevel === 'PLATFORM'))

async function load() {
  loading.value = true
  try {
    const [accounts, catalog] = await Promise.all([listPlatformOperators(), listRoleCatalog()])
    operators.value = Array.isArray(accounts) ? accounts : []
    roles.value = Array.isArray(catalog) ? catalog : []
  } catch (error) {
    notifyAdminRequestError(error, '加载平台运营人员失败')
  } finally {
    loading.value = false
  }
}

function openAssign(row) {
  current.value = row
  selectedRoleId.value = null
  assignVisible.value = true
}

async function assign() {
  if (!current.value || !selectedRoleId.value) return
  assigning.value = true
  try {
    await assignPlatformRole(current.value.accountId, selectedRoleId.value)
    ElMessage.success('平台角色已授予')
    assignVisible.value = false
    await load()
  } catch (error) {
    notifyAdminRequestError(error, '授予平台角色失败')
  } finally {
    assigning.value = false
  }
}

async function revoke(row, role) {
  try {
    await ElMessageBox.confirm(`确认撤销角色“${role.roleName || role.roleCode}”？`, '撤销平台角色', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await revokePlatformRole(role.bindingId)
    ElMessage.success('平台角色已撤销')
    await load()
  } catch (error) {
    notifyAdminRequestError(error, '撤销平台角色失败')
  }
}

onMounted(load)
</script>

<style scoped>
.role-tag { margin: 2px 6px 2px 0; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
