<template>
  <el-drawer
    :model-value="visible"
    size="520px"
    :title="drawerTitle"
    @update:model-value="(value) => emit('update:visible', value)"
  >
    <div v-loading="store.loading" class="pending-approval">
      <el-alert
        v-if="!store.pendingCount"
        type="success"
        :closable="false"
        show-icon
        title="暂无待确认加项"
        description="客户在 C 端自助加项后会出现在这里，确认后才计入应收。"
      />
      <template v-else>
        <p class="pending-approval__hint">
          客户自助加项需门店确认后才计入应收；这里有
          <b>{{ store.pendingCount }}</b> 条待确认
          <span v-if="!store.mixedCurrency">（合计 {{ formatMoney(store.pendingAmount, store.currencyCode) }}）</span>
          <span v-else>（多币种订单，金额见各单明细）</span>
          。
        </p>
        <div v-for="group in store.orders" :key="group.orderId" class="pending-order">
          <div class="pending-order__head">
            <div>
              <!--
                包厢放最前加粗：门店处理客户自助加项时，第一件事是「哪间包厢点的」，
                订单号是次要定位信息。服务端 roomName 已按「会话名称 → 编码 → 资源回源」给全，
                仍然缺失（订单没有包厢会话）时明确说「未关联包厢」，不留空白。
              -->
              <span class="pending-order__room">包厢 {{ roomLabel(group) }}</span>
              <small class="pending-order__no">{{ group.orderNo || ('订单 #' + group.orderId) }}</small>
              <span v-if="group.orderElapsedSeconds" class="pending-order__elapsed">已开台 {{ elapsedText(group.orderElapsedSeconds) }}</span>
            </div>
            <span class="pending-order__count">待确认 {{ group.pendingCount }} 条</span>
          </div>
          <div v-for="item in group.items" :key="item.id" class="pending-row">
            <div class="pending-row__copy">
              <b>{{ item.name || '加项' }}</b>
              <small>
                × {{ quantityText(item.quantity) }}
                · {{ formatMoney(item.amount, item.currencyCode) }}
                <template v-if="item.createdAt"> · {{ formatTime(item.createdAt) }}</template>
              </small>
            </div>
            <div class="pending-row__actions">
              <el-button size="small" type="success" :loading="submittingId === item.id" @click="confirmItem(group, item)">确认</el-button>
              <el-button size="small" type="danger" plain :loading="submittingId === item.id" @click="rejectItem(group, item)">拒绝</el-button>
            </div>
          </div>
          <div class="pending-order__footer">
            <el-button size="small" type="primary" plain :disabled="group.pendingCount < 2" @click="confirmWholeOrder(group)">
              本单全部确认（{{ group.pendingCount }}）
            </el-button>
            <el-button size="small" link type="primary" @click="openCashier(group)">到收银台处理</el-button>
          </div>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { formatMoney, formatQuantity, formatTime } from '@/utils/format'
import { usePendingApprovalStore } from '@/stores/pendingApproval'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['update:visible'])

const router = useRouter()
const store = usePendingApprovalStore()
const submittingId = ref(null)

const drawerTitle = computed(() => (store.pendingCount
  ? `待确认加项（${store.pendingCount}）`
  : '待确认加项'))

function quantityText(quantity) {
  return quantity === null || quantity === undefined ? '—' : formatQuantity(quantity)
}

/**
 * 包厢展示标签：服务端 `roomName` 已是可直接展示的包厢名（会话名称 → 编码 → 资源服务回源），
 * 只有「订单没有包厢会话」或资源服务不可达时才缺失，此时明确显示「未关联包厢」而不是留空白。
 */
function roomLabel(group) {
  return group?.roomName || group?.roomCode || '未关联包厢'
}

function elapsedText(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

async function confirmItem(group, item) {
  submittingId.value = item.id
  try {
    // store 内部：乐观移除 + 服务端确认 + 立即刷新；返回结果如实反映服务端是否认这次确认。
    reportDecision(await store.confirm(group.orderId, item.id),
      '已确认「' + (item.name || '加项') + '」')
  } finally {
    submittingId.value = null
  }
}

async function rejectItem(group, item) {
  submittingId.value = item.id
  try {
    reportDecision(await store.reject(group.orderId, item.id),
      '已拒绝「' + (item.name || '加项') + '」')
  } finally {
    submittingId.value = null
  }
}

/**
 * 确认/拒绝的结果提示（唯一出口）：**只有服务端真的成功才报成功**。
 *
 * 此前 store 把异常吞成 `false`、这里又无条件弹成功，于是出现「前端提示已确认、后端实际 500」
 * 的结果不一致（2026-09-19 线上：后端写路径爆栈回 500 `服务内部错误`，界面照样说已确认，
 * 刷新后待确认项原样回来）。区分三种结果：
 *   - `ok`：服务端已确认/拒绝成功 → 成功提示；
 *   - `alreadyProcessed`：并发下已被同事处理（409）→ 轻提示「已为你刷新」；
 *   - 其它失败：`request` 响应拦截器已按错误码/状态码弹出可读中文（如 500 的中文兜底），
 *     这里不再重复弹一条一模一样的红条，避免同一动作两条错误提示。
 */
function reportDecision(result, successText) {
  if (result?.ok) {
    ElMessage.success(successText)
    return
  }
  if (result?.alreadyProcessed) {
    ElMessage.warning('该加项已被处理，已为你刷新最新数据')
  }
}

async function confirmWholeOrder(group) {
  const result = await store.confirmOrder(group.orderId)
  if (!result.ok) {
    // 有明细没确认成功：绝不能提示「全部确认」（失败项已由拦截器给出中文原因）。
    ElMessage.warning(`本单有 ${result.failed} 条加项未确认成功，已按服务端最新状态刷新，请重试`)
    return
  }
  ElMessage.success(result.alreadyProcessed > 0
    ? `已确认本单加项（${result.alreadyProcessed} 条已由他人处理）`
    : '已确认本单全部加项')
}

/** 到收银台处理：带上 orderId，收银台按「定位订单」态展示该单（点单/加项、结台、结算都在那里）。 */
function openCashier(group) {
  emit('update:visible', false)
  router.push({ name: 'Orders', query: { orderId: String(group.orderId) } })
}
</script>

<style scoped>
.pending-approval { font-size: 13px; }
.pending-approval__hint { margin: 0 0 12px; color: var(--el-text-color-secondary); }
.pending-approval__hint b { color: var(--el-color-danger); }
.pending-order { margin-bottom: 14px; padding: 10px 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.pending-order__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
/* 包厢是第一识别信息：加粗、主色，字号略大；订单号退成次要信息 */
.pending-order__room { font-size: 14px; font-weight: 600; color: var(--el-color-primary); }
.pending-order__no { margin-left: 8px; color: var(--el-text-color-secondary); }
.pending-order__elapsed { margin-left: 8px; color: var(--el-text-color-secondary); }
.pending-order__count { color: var(--el-color-warning); font-size: 12px; }
.pending-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--el-border-color-lighter); }
.pending-row__copy { display: grid; gap: 2px; }
.pending-row__copy small { color: var(--el-text-color-secondary); }
.pending-row__actions { display: inline-flex; gap: 6px; }
.pending-order__footer { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
</style>
