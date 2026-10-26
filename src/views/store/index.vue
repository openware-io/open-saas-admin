<template>
  <div class="admin-page store-home">
    <div class="page-header">
      <div>
        <h2>门店管理后台</h2>
        <p class="subtle">
          {{ context?.storeName || '未选择门店' }}
          <span v-if="context?.businessType"> · {{ businessTypeText(context.businessType) }}</span>
        </p>
      </div>
      <el-button :loading="loading" @click="loadTasks">刷新</el-button>
    </div>

    <el-alert
      v-if="!context?.storeId"
      type="warning"
      :closable="false"
      title="请先在顶部选择具体门店，门店工作台只展示当前门店数据"
    />

    <div class="metric-grid">
      <div class="metric-card">
        <span>待入住</span>
        <strong>{{ counts.ARRIVAL }}</strong>
        <small>前台今日到店</small>
      </div>
      <div class="metric-card">
        <span>在住</span>
        <strong>{{ counts.IN_HOUSE }}</strong>
        <small>当前在店</small>
      </div>
      <div class="metric-card">
        <span>待退房</span>
        <strong>{{ counts.DUE_OUT }}</strong>
        <small>今日离店</small>
      </div>
      <div class="metric-card">
        <span>待处理</span>
        <strong>{{ tasks.length }}</strong>
        <small>前台任务</small>
      </div>
    </div>

    <div class="admin-card">
      <div class="section-head">
        <h3>前台任务</h3>
        <el-tag effect="plain">{{ tasks.length }} 条</el-tag>
      </div>
      <el-table v-loading="loading" :data="tasks" border stripe>
        <el-table-column prop="bookingNo" label="预订号" width="150" />
        <el-table-column prop="guestName" label="住客" width="120" />
        <el-table-column prop="roomType" label="房型" min-width="140" />
        <el-table-column prop="roomNo" label="房号" width="90" align="center">
          <template #default="{ row }">{{ row.roomNo || '待分配' }}</template>
        </el-table-column>
        <el-table-column label="入住 / 离店" min-width="180">
          <template #default="{ row }">{{ row.checkInDate }} → {{ row.checkOutDate }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ hotelBookingStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'ARRIVAL' && canCheckIn"
              link
              type="primary"
              @click="checkIn(row)"
            >
              办理入住
            </el-button>
            <el-button
              v-else-if="(row.status === 'IN_HOUSE' || row.status === 'DUE_OUT') && canCheckOut"
              link
              type="primary"
              @click="checkOut(row)"
            >
              办理退房
            </el-button>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="admin-card quick-card">
      <div class="section-head"><h3>门店业务</h3></div>
      <div class="quick-grid">
        <button v-for="entry in entries" :key="entry.path" class="quick-entry" @click="router.push(entry.path)">
          <span>{{ entry.label }}</span>
          <small>{{ entry.hint }}</small>
        </button>
        <el-empty v-if="!entries.length" description="当前门店没有可进入的业务模块" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { checkInHotelBooking, checkOutHotelBooking, listHotelFrontDeskTasks } from '@/api/hotel'
import { hotelBookingStatusText, businessTypeText } from '@/constants/terms'
import { hasPermission } from '@/utils/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { useContextStore } from '@/stores/context'

const router = useRouter()
const contextStore = useContextStore()
const tasks = ref([])
const loading = ref(false)
const context = computed(() => contextStore.current)
const canCheckIn = computed(() => hasPermission(context.value?.permissions, 'hotel.checkin'))
const canCheckOut = computed(() => hasPermission(context.value?.permissions, 'hotel.checkout'))
const canViewHotel = computed(() => hasPermission(context.value?.permissions, 'hotel.booking.view'))

const counts = computed(() => {
  const result = { ARRIVAL: 0, IN_HOUSE: 0, DUE_OUT: 0 }
  for (const task of tasks.value) result[task.status] = (result[task.status] || 0) + 1
  return result
})

const entries = computed(() => {
  const permissions = context.value?.permissions
  const hotelCandidates = [
    { path: '/admin/tenant/hotel', label: '酒店前台', hint: '预订与入住', permission: 'hotel.booking.view' },
    { path: '/admin/orders', label: '订单管理', hint: '住客订单', permission: 'order.view' },
    { path: '/business/members', label: '客户管理', hint: '住客档案', permission: 'member.view' },
    { path: '/admin/inventory', label: '库存管理', hint: '客耗与物料', permission: 'inventory.material.view' },
    { path: '/admin/reports', label: '门店报表', hint: '经营数据' },
  ]
  const ktvCandidates = [
    { path: '/business/reservations', label: '预约管理', hint: '到店与排期', permission: 'reservation.view' },
    { path: '/business/orders', label: '收银台', hint: '订单与收款', permission: 'order.view' },
    { path: '/admin/resources', label: '资源管理', hint: '房态与占用', permission: 'resource.manage' },
    { path: '/admin/inventory', label: '库存', hint: '物料与盘点', permission: 'inventory.material.view' },
    { path: '/admin/reports', label: '门店报表', hint: '经营数据', permission: 'tenant.overview.view' },
  ]
  const candidates = context.value?.businessType === 'HOTEL' ? hotelCandidates : ktvCandidates
  return candidates.filter((entry) => !entry.permission || hasPermission(permissions, entry.permission))
})

function statusType(status) {
  return { ARRIVAL: 'warning', IN_HOUSE: 'success', DUE_OUT: 'warning' }[status] || 'info'
}

async function loadTasks() {
  if (!context.value?.storeId || !canViewHotel.value) {
    tasks.value = []
    return
  }
  loading.value = true
  try {
    tasks.value = (await listHotelFrontDeskTasks()) || []
  } catch (error) {
    notifyAdminRequestError(error, '加载门店前台任务失败')
  } finally {
    loading.value = false
  }
}

async function checkIn(row) {
  try {
    await checkInHotelBooking(row.id)
    ElMessage.success(`${row.guestName} 已办理入住`)
    await loadTasks()
  } catch (error) {
    notifyAdminRequestError(error, '办理入住失败')
  }
}

async function checkOut(row) {
  try {
    await checkOutHotelBooking(row.id)
    ElMessage.success(`${row.guestName} 已退房`)
    await loadTasks()
  } catch (error) {
    notifyAdminRequestError(error, '办理退房失败')
  }
}

onMounted(loadTasks)
</script>

<style scoped>
.store-home { padding-bottom: 32px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.quick-card { margin-top: 16px; }
.quick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.quick-entry { text-align: left; border: 1px solid var(--el-border-color-light); background: var(--el-bg-color); border-radius: 8px; padding: 14px; cursor: pointer; }
.quick-entry span { display: block; font-weight: 600; color: var(--el-text-color-primary); }
.quick-entry small { display: block; margin-top: 4px; color: var(--el-text-color-secondary); }
.quick-entry:hover { border-color: var(--el-color-primary); }
.muted { color: var(--el-text-color-placeholder); }
</style>
