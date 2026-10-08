<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>代币配置</h2>
      <span class="page-desc">租户级配置，对当前租户下所有业务和门店统一生效</span>
    </div>

    <div class="admin-card config-card" v-loading="loading">
      <el-form label-width="120px">
        <el-form-item label="代币名称">
          <el-input v-model="form.brandName" :placeholder="'如 ' + WALLET_BRAND_NAME_DEFAULT" />
        </el-form-item>
        <el-form-item label="兑换比例">
          <div class="ratio-line">
            <span>1 {{ withCurrencyLabel('主单位') }} =</span>
            <el-input-number v-model="form.ratio" :min="1" :precision="0" style="width: 160px" />
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
          <el-button @click="load">恢复当前配置</el-button>
        </el-form-item>
      </el-form>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="代币名称与比例是租户级配置，对该租户所有门店的储值展示同时生效。"
      />
      <el-alert
        class="config-note"
        type="info"
        :closable="false"
        show-icon
        title="比例只用于代币数量展示，不参与储值入账、消费、退款、对账或日结金额计算。"
      />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getWalletTokenConfig, updateWalletTokenConfig } from '@/api/admin'
import { WALLET_BRAND_NAME_DEFAULT, resolveWalletBrandName } from '@/constants/terms'
import { WALLET_TOKEN_DEFAULT_RATIO, resolveTokenRatio, withCurrencyLabel } from '@/utils/format'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { useContextStore } from '@/stores/context'

const contextStore = useContextStore()
const loading = ref(false)
const saving = ref(false)
const form = ref({ brandName: WALLET_BRAND_NAME_DEFAULT, ratio: WALLET_TOKEN_DEFAULT_RATIO })

async function load() {
  loading.value = true
  try {
    const config = await getWalletTokenConfig(contextStore.tenantId)
    form.value = {
      brandName: resolveWalletBrandName(config),
      ratio: resolveTokenRatio(config?.ratio),
    }
  } catch (error) {
    notifyAdminRequestError(error, '加载代币配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  const brandName = form.value.brandName?.trim()
  if (!brandName) { ElMessage.warning('请填写代币名称'); return }
  if (!form.value.ratio || form.value.ratio <= 0) { ElMessage.warning('比例需大于 0'); return }
  saving.value = true
  try {
    const updated = await updateWalletTokenConfig({
      tenantId: contextStore.tenantId,
      brandName,
      ratio: form.value.ratio,
    })
    form.value = {
      brandName: resolveWalletBrandName(updated),
      ratio: resolveTokenRatio(updated?.ratio),
    }
    ElMessage.success('代币配置已保存')
  } catch (error) {
    notifyAdminRequestError(error, '保存代币配置失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page-desc { font-size: 13px; color: var(--el-text-color-secondary); }
.config-card { max-width: 720px; }
.ratio-line { display: flex; align-items: center; gap: 8px; }
.config-note { margin-top: 12px; }
</style>
