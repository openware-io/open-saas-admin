<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>支付方式</h2>
      <el-button @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <div class="admin-card">
      <p class="tip">以下为平台已授权给你的支付方式；可自行决定是否向 C 端用户开放（默认开放）。现金为通用兜底、始终开放。</p>

      <el-table :data="rows" v-loading="loading" border stripe>
        <el-table-column label="支付方式" width="180">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column prop="method" label="编码" min-width="120" />
        <el-table-column label="向用户开放" width="140" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.method === 'CASH'" type="success" size="small">始终开放</el-tag>
            <el-switch
              v-else
              :model-value="row.userEnabled"
              :loading="row.saving"
              @change="(v) => toggle(row, v)"
            />
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { PAYMENT_METHODS } from '@/constants/payment-methods'
import { listPaymentMethodGrants, setPaymentMethodSwitch } from '@/api/payment'
import { useContextStore } from '@/stores/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const contextStore = useContextStore()
const loading = ref(false)
const rows = ref([])

async function load() {
  loading.value = true
  try {
    const grants = await listPaymentMethodGrants(contextStore.tenantId)
    const list = Array.isArray(grants) ? grants : (grants && grants.items) || []
    const grantMap = Object.fromEntries(list.map((g) => [g.method, g]))
    // 只展示平台已授权的方式；现金始终开放
    rows.value = PAYMENT_METHODS
      .filter((m) => m.method === 'CASH' || (grantMap[m.method] && grantMap[m.method].granted === 1))
      .map((m) => ({
        ...m,
        userEnabled: m.method === 'CASH' ? true : (grantMap[m.method]?.userEnabled !== 0),
        saving: false,
      }))
  } catch (e) {
    notifyAdminRequestError(e, '加载失败')
  } finally {
    loading.value = false
  }
}

async function toggle(row, enabled) {
  row.saving = true
  try {
    await setPaymentMethodSwitch(contextStore.tenantId, row.method, enabled)
    row.userEnabled = enabled
    ElMessage.success((enabled ? '已向用户开放 ' : '已关闭 ') + row.name)
  } catch (e) {
    notifyAdminRequestError(e, '操作失败')
  } finally {
    row.saving = false
  }
}

onMounted(load)
</script>

<style scoped>
.tip { margin: 0 0 12px; color: var(--el-text-color-secondary); font-size: 13px; }
</style>
