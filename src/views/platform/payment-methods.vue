<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>支付方式管理</h2>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <span style="color: var(--el-text-color-secondary); font-size: 13px">租户</span>
        <el-select v-model="tenantId" placeholder="选择租户" filterable style="width: 240px" @change="load">
          <el-option v-for="t in tenants" :key="t.id" :label="(t.name || t.tenantCode) + '（' + (t.tenantCode || t.id) + '）'" :value="t.id" />
        </el-select>
        <el-button type="primary" @click="load">查询授权</el-button>
      </div>

      <p class="tip">平台给租户授权支付方式（授权后默认向用户开放）；现金为通用兜底、无需授权。</p>

      <el-table :data="catalog" v-loading="loading" border stripe>
        <el-table-column label="支付方式" width="180">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120" align="center">
          <template #default="{ row }">{{ paymentCategoryText(row.category) }}</template>
        </el-table-column>
        <el-table-column prop="method" label="编码" min-width="120" />
        <el-table-column label="授权状态" width="140" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.method === 'CASH'" type="success" size="small">默认开放</el-tag>
            <el-tag v-else :type="row.granted ? 'success' : 'info'" size="small">{{ row.granted ? '已授权' : '未授权' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center">
          <template #default="{ row }">
            <el-switch
              v-if="row.method !== 'CASH'"
              :model-value="row.granted"
              :loading="row.saving"
              @change="(v) => toggle(row, v)"
            />
            <span v-else style="color: var(--el-text-color-secondary)">—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { PAYMENT_METHODS, paymentCategoryText } from '@/constants/payment-methods'
import { listPaymentMethodGrants, setPaymentMethodGrant } from '@/api/payment'
import { listTenants } from '@/api/admin'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const tenantId = ref(null)
const tenants = ref([])
const loading = ref(false)
const catalog = ref([])

async function loadTenants() {
  try {
    const data = await listTenants()
    tenants.value = Array.isArray(data) ? data : (data && (data.items || data.list)) || []
    if (tenants.value.length && tenantId.value == null) {
      tenantId.value = tenants.value[0].id
      load()
    }
  } catch (e) {
    notifyAdminRequestError(e, '加载租户列表失败')
  }
}

async function load() {
  if (tenantId.value == null) return
  loading.value = true
  try {
    const grants = await listPaymentMethodGrants(tenantId.value)
    const list = Array.isArray(grants) ? grants : (grants && grants.items) || []
    const grantMap = Object.fromEntries(list.map((g) => [g.method, g.granted === 1 || g.granted === true]))
    catalog.value = PAYMENT_METHODS.map((m) => ({ ...m, granted: !!grantMap[m.method], saving: false }))
  } catch (e) {
    notifyAdminRequestError(e, '加载授权失败')
  } finally {
    loading.value = false
  }
}

async function toggle(row, granted) {
  row.saving = true
  try {
    await setPaymentMethodGrant(tenantId.value, row.method, granted)
    row.granted = granted
    ElMessage.success((granted ? '已授权 ' : '已回收 ') + row.name)
  } catch (e) {
    notifyAdminRequestError(e, '操作失败')
  } finally {
    row.saving = false
  }
}

onMounted(loadTenants)
</script>

<style scoped>
.filter-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.tip { margin: 0 0 12px; color: var(--el-text-color-secondary); font-size: 13px; }
</style>
