<template>
  <div class="admin-page">
    <div class="page-header">
      <h2>币种</h2>
      <el-button :loading="currencyStore.loading" @click="reload">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="币种是租户级配置，全站金额展示统一使用它；切换只改符号与语义，不做汇率换算，金额数字不变。"
    >
      <template #default>
        <p class="hint-line">
          平台运营请先在右上角切换到目标租户上下文，再修改该租户的币种（接口一律取当前上下文租户）。
          已结算的历史单据 / 流水 / 入库单按其自身币种快照展示，不受本次修改影响。
        </p>
      </template>
    </el-alert>

    <div class="admin-card">
      <div v-loading="currencyStore.loading">
        <el-form label-width="120px">
          <el-form-item label="当前币种">
            <span class="current">
              {{ currencyStore.label }}（{{ currencyStore.symbol }}）
              <span class="muted">最小货币单位 {{ currencyStore.minorUnitDigits }} 位小数</span>
            </span>
          </el-form-item>
          <el-form-item label="金额示例">
            <span class="sample">{{ formatMoney(123456) }} · {{ formatMoney(-5000) }}</span>
          </el-form-item>
          <el-form-item label="切换币种">
            <el-radio-group v-model="selected" :disabled="!canManage || currencyStore.saving">
              <el-radio-button v-for="item in currencyStore.supported" :key="item.code" :label="item.code">
                {{ item.label }}（{{ item.symbol }}）
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :disabled="!canManage || !changed"
              :loading="currencyStore.saving"
              @click="save"
            >保存并全站生效</el-button>
            <el-button :disabled="!changed || currencyStore.saving" @click="resetSelection">还原</el-button>
            <span v-if="!canManage" class="muted">当前账号没有「修改租户币种」权限（tenant.currency.manage），仅可查看。</span>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useCurrencyStore } from '@/stores/currency'
import { useContextStore } from '@/stores/context'
import { hasPermission } from '@/utils/context'
import { formatMoney } from '@/utils/format'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

/** 修改租户币种所需权限（与后端 `tenant.currency.manage` 同码）。 */
const CURRENCY_MANAGE_PERMISSION = 'tenant.currency.manage'

const currencyStore = useCurrencyStore()
const contextStore = useContextStore()
const selected = ref(currencyStore.code)

const canManage = computed(() => hasPermission(contextStore.current?.permissions, CURRENCY_MANAGE_PERMISSION))
const changed = computed(() => !!selected.value && selected.value !== currencyStore.code)

function syncSelection() {
  selected.value = currencyStore.code
}

async function reload() {
  await currencyStore.load(true)
  syncSelection()
}

function resetSelection() {
  syncSelection()
}

async function save() {
  if (!changed.value) return
  try {
    await currencyStore.update(selected.value)
    // 币种写入的是全局唯一来源：保存后全站（订单/账单/商品/库存/钱包/报表）立即按新币种展示。
    ElMessage.success(`币种已切换为${currencyStore.label}（${currencyStore.symbol}），全站金额已按新币种展示`)
    syncSelection()
  } catch (e) {
    notifyAdminRequestError(e, '保存币种失败')
  }
}

onMounted(async () => {
  await currencyStore.load()
  syncSelection()
})
</script>

<style scoped>
.hint-line {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
}
.admin-card {
  margin-top: 16px;
}
.current {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.sample {
  font-family: var(--el-font-family-mono, monospace);
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
