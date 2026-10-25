<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>租户管理</h2>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>新增租户
      </el-button>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <!-- 创建时间（createdAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59；
             本页没有「查询」按钮，选完即按区间重新拉取。 -->
        <DateRangeFilter v-model="range" @change="load" @clear="load" />
      </div>
      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column prop="tenantCode" label="租户编码" width="160" />
        <el-table-column prop="name" label="租户名称" min-width="160" />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="tenantStatusType(row.status)">{{ tenantStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :loading="row.saving" @click="toggleStatus(row)">
              {{ tenantStatusActionText(row.status) }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无租户" /></template>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="新增租户" width="480px">
      <el-form label-width="90px">
        <el-form-item label="租户编码"><el-input v-model="form.tenantCode" placeholder="如 t-1001" /></el-form-item>
        <el-form-item label="租户名称"><el-input v-model="form.name" placeholder="租户名称" /></el-form-item>
        <el-form-item label="默认语言"><el-input v-model="form.defaultLocale" placeholder="zh-CN" /></el-form-item>
        <el-form-item label="默认时区"><el-input v-model="form.defaultTimezone" placeholder="Asia/Shanghai" /></el-form-item>
        <el-divider content-position="left">初始租户管理员（必填）</el-divider>
        <el-form-item label="登录账号">
          <el-input v-model="form.adminUsername" placeholder="3–64 位字母、数字、下划线、点或短横线" autocomplete="off" />
        </el-form-item>
        <el-form-item label="初始密码">
          <el-input v-model="form.adminPassword" type="password" show-password placeholder="至少 8 位，最多 72 字节" autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="form.adminDisplayName" placeholder="租户管理员姓名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { listTenants, createTenant, bootstrapTenantOwner, updateTenantStatus } from '@/api/admin'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { formatTime } from '@/utils/format'
import { tenantStatusActionText, tenantStatusText, tenantStatusType } from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const rows = ref([])
const loading = ref(false)
/** 时间区间（创建时间 createdAt）：本页查询条件不是 reactive 对象，区间单独一个 ref。 */
const range = ref(emptyDateRange())
const saving = ref(false)
const dialogVisible = ref(false)
const form = ref({ tenantCode: '', name: '', defaultLocale: 'zh-CN', defaultTimezone: 'Asia/Shanghai', adminUsername: '', adminPassword: '', adminDisplayName: '' })

// 租户状态词表统一在 constants/terms（TENANT_STATUS_TEXT），未知枚举回落「未知（CODE）」。

async function load() {
  // 本页没有「查询」按钮，守卫放在加载入口：区间倒挂时只提示、不发请求。
  const warning = dateRangeWarning(range.value)
  if (warning) { ElMessage.warning(warning); return }
  loading.value = true
  try {
    const data = await listTenants({ ...dateRangeParams(range.value) })
    rows.value = Array.isArray(data) ? data : (data && (data.items || data.list)) || []
  } catch (e) {
    notifyAdminRequestError(e, '加载租户失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = { tenantCode: '', name: '', defaultLocale: 'zh-CN', defaultTimezone: 'Asia/Shanghai', adminUsername: '', adminPassword: '', adminDisplayName: '' }
  dialogVisible.value = true
}

async function toggleStatus(row) {
  const target = row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
  try {
    await ElMessageBox.confirm(
      target === 'ACTIVE' ? '启用后该租户的成员可登录租户后台。' : '停用后该租户成员将无法选择该租户上下文。',
      target === 'ACTIVE' ? '启用租户' : '停用租户',
      { confirmButtonText: target === 'ACTIVE' ? '启用' : '停用', cancelButtonText: '取消', type: 'warning' }
    )
    row.saving = true
    await updateTenantStatus(row.id, target)
    row.status = target
    ElMessage.success(target === 'ACTIVE' ? '已启用租户' : '已停用租户')
    load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') notifyAdminRequestError(e, '更新租户状态失败')
  } finally {
    row.saving = false
  }
}

async function save() {
  if (!form.value.tenantCode || !form.value.name) { ElMessage.warning('请填写租户编码和名称'); return }
  if (!form.value.adminUsername || !form.value.adminPassword) { ElMessage.warning('请填写初始管理员的登录账号和密码'); return }
  saving.value = true
  let tenant = null
  try {
    tenant = await createTenant({
      tenantCode: form.value.tenantCode,
      name: form.value.name,
      defaultLocale: form.value.defaultLocale,
      defaultTimezone: form.value.defaultTimezone
    })
    await bootstrapTenantOwner(tenant.id, {
      username: form.value.adminUsername.trim(),
      password: form.value.adminPassword,
      displayName: (form.value.adminDisplayName || form.value.adminUsername).trim()
    })
    ElMessage.success('已创建租户和初始管理员')
    dialogVisible.value = false
    load()
  } catch (e) {
    if (tenant) {
      ElMessage.warning('租户已创建，但初始管理员创建失败，请用相同租户编码重试')
    } else {
      notifyAdminRequestError(e, '创建失败')
    }
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
