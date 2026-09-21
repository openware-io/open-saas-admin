<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>门店</h2>
      <div style="display: flex; gap: 10px">
        <!-- 币种是租户级配置（门店列展示的是写穿后的租户币种），入口挂在门店设置旁边 -->
        <el-button v-if="canManageCurrency" @click="router.push('/admin/tenant/currency')">
          <el-icon><Money /></el-icon>{{ TERMS.currency }}
        </el-button>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <div class="admin-card">
      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="门店名称 / 编号" clearable style="width: 240px" />
        <el-select v-model="status" placeholder="状态" clearable style="width: 150px">
          <el-option label="营业中" value="ACTIVE" />
          <el-option label="停用" value="SUSPENDED" />
          <el-option label="已关闭" value="CLOSED" />
        </el-select>
      </div>

      <el-table :data="filteredRows" v-loading="loading" border stripe>
        <el-table-column prop="code" label="门店编号" width="160" />
        <el-table-column prop="name" label="门店名称" min-width="180" />
        <el-table-column label="业态" width="100" align="center">
          <template #default="{ row }">{{ row.businessTypeName || businessTypeText(row.businessType) }}</template>
        </el-table-column>
        <el-table-column label="币种" width="140" align="center">
          <!-- 币种是租户级唯一来源（tnt_tenant_config.currency），门店随租户统一；
               门店行上的 default_currency 由后端写穿，页面不再各读一个来源。 -->
          <template #default>{{ currencyStore.label }}（{{ currencyStore.symbol }}）</template>
        </el-table-column>        <el-table-column prop="timezone" label="时区" width="140" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="storeStatusType(row.status)">{{ storeStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无门店" />
        </template>
      </el-table>

      <p class="currency-hint">币种为租户级配置，全部门店统一；历史已结算单据按自身币种快照展示。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Money, Refresh } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { listStores } from '@/api/store'
import { TERMS, businessTypeText, storeStatusText, storeStatusType } from '@/constants/terms'
import { useContextStore } from '@/stores/context'
import { useCurrencyStore } from '@/stores/currency'
import { hasPermission } from '@/utils/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const router = useRouter()
const contextStore = useContextStore()
/** 全站币种唯一来源：门店列表按租户币种展示，不再逐店读自身字段。 */
const currencyStore = useCurrencyStore()
const rows = ref([])
const loading = ref(false)
const keyword = ref('')
const status = ref('')

/** 币种设置入口按权限显示（与后端 tenant.currency.manage 同码），越权由后端强制 403。 */
const canManageCurrency = computed(() => hasPermission(contextStore.current?.permissions, 'tenant.currency.manage'))

const filteredRows = computed(() => {
  let list = rows.value
  if (status.value) list = list.filter((r) => r.status === status.value)
  const k = keyword.value.trim()
  if (k) list = list.filter((r) => (r.code || '').includes(k) || (r.name || '').includes(k))
  return list
})

async function load() {
  loading.value = true
  try {
    rows.value = (await listStores()) || []
  } catch (e) {
    notifyAdminRequestError(e, '加载门店失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.currency-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
