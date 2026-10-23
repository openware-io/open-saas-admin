<template>
  <div class="admin-page hotel-page">
    <div class="page-header">
      <div>
        <h2>酒店前台</h2>
        <p class="subtle">当前只开放已接入后端的前台任务；酒店资料、房型房价、库存日历待酒店域 H1 实现。</p>
      </div>
      <el-button :loading="loading" @click="loadTasks">刷新</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      class="hotel-notice"
      title="酒店主数据尚未接入"
      description="本页不会保存酒店资料/房型/房价/库存；这些能力将在酒店域 H1/H2 实现。"
    />

    <div class="metric-grid">
      <div v-for="metric in metrics" :key="metric.label" class="metric-card">
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <small>{{ metric.hint }}</small>
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
            <el-button v-if="(row.status === 'ARRIVAL' || row.status === 'CONFIRMED') && canCheckIn" link type="primary" @click="checkIn(row)">
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { checkInHotelBooking, checkOutHotelBooking, listHotelFrontDeskTasks } from '@/api/hotel'
import { hotelBookingStatusText } from '@/constants/terms'
import { hasPermission } from '@/utils/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { useContextStore } from '@/stores/context'

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

const metrics = computed(() => [
  { label: '待入住', value: counts.value.ARRIVAL, hint: '前台今日到店' },
  { label: '在住', value: counts.value.IN_HOUSE, hint: '当前在店' },
  { label: '待退房', value: counts.value.DUE_OUT, hint: '今日离店' },
  { label: '任务总数', value: tasks.value.length, hint: '当前门店' },
])

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
    notifyAdminRequestError(error, '加载酒店前台任务失败')
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
.hotel-page { padding-bottom: 32px; }
.hotel-notice { margin-bottom: 12px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.muted { color: var(--el-text-color-placeholder); }
</style>
