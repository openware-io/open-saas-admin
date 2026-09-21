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
        <template #empty><el-empty description="暂无租户" /></template>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="新增租户" width="480px">
      <el-form label-width="90px">
        <el-form-item label="租户编码"><el-input v-model="form.tenantCode" placeholder="如 t-1001" /></el-form-item>
        <el-form-item label="租户名称"><el-input v-model="form.name" placeholder="租户名称" /></el-form-item>
        <el-form-item label="默认语言"><el-input v-model="form.defaultLocale" placeholder="zh-CN" /></el-form-item>
        <el-form-item label="默认时区"><el-input v-model="form.defaultTimezone" placeholder="Asia/Shanghai" /></el-form-item>
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
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { listTenants, createTenant } from '@/api/admin'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { formatTime } from '@/utils/format'
import { tenantStatusText, tenantStatusType } from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const rows = ref([])
const loading = ref(false)
/** 时间区间（创建时间 createdAt）：本页查询条件不是 reactive 对象，区间单独一个 ref。 */
const range = ref(emptyDateRange())
const saving = ref(false)
const dialogVisible = ref(false)
const form = ref({ tenantCode: '', name: '', defaultLocale: 'zh-CN', defaultTimezone: 'Asia/Shanghai' })

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
  form.value = { tenantCode: '', name: '', defaultLocale: 'zh-CN', defaultTimezone: 'Asia/Shanghai' }
  dialogVisible.value = true
}

async function save() {
  if (!form.value.tenantCode || !form.value.name) { ElMessage.warning('请填写租户编码和名称'); return }
  saving.value = true
  try {
    await createTenant(form.value)
    ElMessage.success('已创建租户')
    dialogVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '创建失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
