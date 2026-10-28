<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>门店</h2>
      <div style="display: flex; gap: 10px">
        <!-- 币种是租户级配置（门店列展示的是写穿后的租户币种），入口挂在门店设置旁边 -->
        <el-button v-if="canManageWorkspace" @click="workspaceVisible = true">
          <el-icon><Setting /></el-icon>工作区模式
        </el-button>
        <el-button v-if="canManageCurrency" @click="router.push('/admin/tenant/currency')">
          <el-icon><Money /></el-icon>{{ TERMS.currency }}
        </el-button>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <section v-if="onboardingIssues.length" class="admin-card onboarding-card">
      <div class="section-title">门店开通清单</div>
      <p class="subtle">以下门店还缺少业务类型或时区，补齐后才适合进入日常经营。</p>
      <div class="onboarding-list">
        <div v-for="store in onboardingIssues" :key="store.id" class="onboarding-item">
          <strong>{{ store.name }}</strong>
          <span>{{ store.businessType ? '缺少时区' : '缺少业务类型' }}</span>
        </div>
      </div>
    </section>

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
        <el-table-column label="Logo" width="92" align="center">
          <template #default="{ row }">
            <div class="store-logo-cell">
              <el-avatar v-if="row.logoUrl" shape="square" :size="38" :src="row.logoUrl" />
              <el-avatar v-else shape="square" :size="38">{{ (row.name || '店').slice(0, 1) }}</el-avatar>
              <el-button v-if="canManageLogo" link type="primary" size="small" @click="openLogo(row)">编辑</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="门店名称" min-width="180" />
        <el-table-column label="业务类型" width="100" align="center">
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

    <el-dialog v-model="logoVisible" title="门店 Logo" width="640px">
      <ImageUrlEditor
        v-model="logoDraft"
        label="门店 Logo"
        alt="门店 Logo 预览"
        :recommended-width="512"
        :recommended-height="512"
        :min-width="128"
        :min-height="128"
        :max-size-mb="1"
        aspect="1 / 1"
      />
      <template #footer>
        <el-button @click="logoVisible = false">取消</el-button>
        <el-button type="primary" :loading="logoSaving" @click="saveLogo">保存 Logo</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="workspaceVisible" title="门店工作区模式" width="480px">
      <el-radio-group v-model="workspaceMode" class="workspace-mode">
        <el-radio value="INDEPENDENT">门店独立工作台</el-radio>
        <p class="subtle">店长登录只进入门店工作台，不看到租户总部。</p>
        <el-radio value="TENANT_CONTEXT">租户后台内门店上下文</el-radio>
        <p class="subtle">门店作为租户后台内的经营上下文，适合小客户统一管理。</p>
      </el-radio-group>
      <template #footer>
        <el-button @click="workspaceVisible = false">取消</el-button>
        <el-button type="primary" :loading="workspaceSaving" @click="saveWorkspaceMode">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Money, Refresh, Setting } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import ImageUrlEditor from '@/components/ImageUrlEditor.vue'
import { listStores, updateStoreLogo } from '@/api/store'
import { getStoreWorkspaceMode, updateStoreWorkspaceMode } from '@/api/tenantWorkspace'
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
const workspaceVisible = ref(false)
const workspaceSaving = ref(false)
const workspaceMode = ref('INDEPENDENT')
const logoVisible = ref(false)
const logoSaving = ref(false)
const logoStore = ref(null)
const logoDraft = ref('')

/** 币种设置入口按权限显示（与后端 tenant.currency.manage 同码），越权由后端强制 403。 */
const canManageCurrency = computed(() => hasPermission(contextStore.current?.permissions, 'tenant.currency.manage'))
const canManageWorkspace = computed(() => hasPermission(contextStore.current?.permissions, 'tenant.tenant.manage'))
const canManageLogo = computed(() => hasPermission(contextStore.current?.permissions, 'tenant.store.manage'))

const filteredRows = computed(() => {
  let list = rows.value
  if (status.value) list = list.filter((r) => r.status === status.value)
  const k = keyword.value.trim()
  if (k) list = list.filter((r) => (r.code || '').includes(k) || (r.name || '').includes(k))
  return list
})

const onboardingIssues = computed(() =>
  rows.value.filter((store) => !store.businessType || !store.timezone),
)

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

async function loadWorkspaceMode() {
  try {
    workspaceMode.value = (await getStoreWorkspaceMode())?.storeWorkspaceMode || 'INDEPENDENT'
  } catch {
    workspaceMode.value = 'INDEPENDENT'
  }
}

async function saveWorkspaceMode() {
  workspaceSaving.value = true
  try {
    await updateStoreWorkspaceMode(workspaceMode.value)
    workspaceVisible.value = false
    ElMessage.success('门店工作区模式已更新，重新登录后生效')
  } catch (error) {
    notifyAdminRequestError(error, '保存工作区模式失败')
  } finally {
    workspaceSaving.value = false
  }
}

function openLogo(row) {
  logoStore.value = row
  logoDraft.value = row.logoUrl || ''
  logoVisible.value = true
}

async function saveLogo() {
  if (!logoStore.value) return
  logoSaving.value = true
  try {
    const updated = await updateStoreLogo(logoStore.value.id, logoDraft.value || '')
    logoStore.value.logoUrl = updated?.logoUrl || ''
    logoVisible.value = false
    ElMessage.success('门店 Logo 已更新')
  } catch (error) {
    notifyAdminRequestError(error, '保存门店 Logo 失败')
  } finally {
    logoSaving.value = false
  }
}

onMounted(load)
onMounted(loadWorkspaceMode)
</script>

<style scoped>
.currency-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.onboarding-card { margin-bottom: 16px; }
.onboarding-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.onboarding-item { display: flex; gap: 8px; align-items: center; padding: 6px 10px; border: 1px solid var(--el-color-warning-light-5); border-radius: 6px; font-size: 12px; color: var(--el-text-color-regular); }
.onboarding-item span { color: var(--el-color-warning); }
.store-logo-cell { display: flex; align-items: center; justify-content: center; gap: 4px; }
</style>
