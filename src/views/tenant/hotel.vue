<template>
  <div class="admin-page hotel-page">
    <div class="page-header">
      <div>
        <h2>酒店前台</h2>
        <p class="subtle">预订、入住、退房和账务已接后端；酒店资料/房型/房价配置暂未提供页面。</p>
      </div>
      <div class="header-actions">
        <el-button v-if="canCreate" type="primary" @click="openBooking">新建预订</el-button>
        <el-button :loading="loading" @click="loadTasks">刷新</el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      class="hotel-notice"
      title="酒店主数据页面尚未接入"
      description="房型、房价、库存目前通过接口维护；本页只做前台预订和入住退房。"
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
        <el-table-column prop="bookingNo" label="预订号" width="170" />
        <el-table-column prop="guestName" label="住客" width="120" />
        <el-table-column prop="roomType" label="房型" min-width="140" />
        <el-table-column prop="roomNo" label="房号" width="90" align="center">
          <template #default="{ row }">{{ row.roomNo || '待分配' }}</template>
        </el-table-column>
        <el-table-column label="入住 / 离店" min-width="180">
          <template #default="{ row }">{{ row.checkInDate }} → {{ row.checkOutDate }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ hotelBookingStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center">
          <template #default="{ row }">
            <el-button
              v-if="(row.status === 'ARRIVAL' || row.status === 'CONFIRMED') && canCheckIn"
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

    <el-dialog v-model="bookingVisible" title="新建酒店预订" width="560px">
      <el-form label-width="100px">
        <el-form-item label="房型">
          <el-select v-model="form.roomTypeId" style="width:100%" placeholder="选择房型" @change="onRoomTypeChange">
            <el-option v-for="item in roomTypes" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="房价计划">
          <el-select v-model="form.ratePlanId" style="width:100%" placeholder="选择房价计划">
            <el-option v-for="item in ratePlans" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="入住 / 离店">
          <el-date-picker
            v-model="form.dates"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="入住"
            end-placeholder="离店"
            style="width:100%"
          />
        </el-form-item>
        <el-form-item label="客房数">
          <el-input-number v-model="form.rooms" :min="1" :max="10" />
        </el-form-item>
        <el-form-item label="住客姓名">
          <el-input v-model="form.guestName" maxlength="128" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.guestPhone" maxlength="32" />
        </el-form-item>
      </el-form>

      <el-alert v-if="quote" :closable="false" type="success" class="quote-box">
        <template #title>
          可售：{{ quote.available ? '是' : '否' }} · 总价：{{ formatMoney(quote.totalMinor, quote.currency) }}
        </template>
      </el-alert>

      <template #footer>
        <el-button @click="bookingVisible = false">取消</el-button>
        <el-button :loading="quoting" @click="calculateQuote">试算</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!quote?.available" @click="submitBooking">
          创建预订
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  checkInHotelBooking,
  checkOutHotelBooking,
  createHotelBooking,
  listHotelFrontDeskTasks,
  listHotelRatePlans,
  listHotelRoomTypes,
  listHotels,
  quoteHotelStay,
} from '@/api/hotel'
import { hotelBookingStatusText } from '@/constants/terms'
import { formatMoney } from '@/utils/format'
import { hasPermission } from '@/utils/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { useContextStore } from '@/stores/context'

const contextStore = useContextStore()
const tasks = ref([])
const loading = ref(false)
const bookingVisible = ref(false)
const roomTypes = ref([])
const ratePlans = ref([])
const quote = ref(null)
const quoting = ref(false)
const submitting = ref(false)
const form = reactive({
  roomTypeId: null,
  ratePlanId: null,
  dates: [],
  rooms: 1,
  guestName: '',
  guestPhone: '',
})
const context = computed(() => contextStore.current)
const canCheckIn = computed(() => hasPermission(context.value?.permissions, 'hotel.checkin'))
const canCheckOut = computed(() => hasPermission(context.value?.permissions, 'hotel.checkout'))
const canViewHotel = computed(() => hasPermission(context.value?.permissions, 'hotel.booking.view'))
const canCreate = computed(() => hasPermission(context.value?.permissions, 'hotel.booking.create'))

const counts = computed(() => {
  const result = { CONFIRMED: 0, ARRIVAL: 0, IN_HOUSE: 0, DUE_OUT: 0 }
  for (const task of tasks.value) result[task.status] = (result[task.status] || 0) + 1
  return result
})

const metrics = computed(() => [
  { label: '待入住', value: (counts.value.CONFIRMED || 0) + counts.value.ARRIVAL, hint: '已确认/今日到店' },
  { label: '在住', value: counts.value.IN_HOUSE, hint: '当前在店' },
  { label: '待退房', value: counts.value.DUE_OUT, hint: '今日离店' },
  { label: '任务总数', value: tasks.value.length, hint: '当前门店' },
])

function statusType(status) {
  return { CONFIRMED: 'primary', ARRIVAL: 'warning', IN_HOUSE: 'success', DUE_OUT: 'warning' }[status] || 'info'
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

async function loadOptions() {
  if (!context.value?.storeId) return
  try {
    const hotels = (await listHotels()) || []
    const hotelId = hotels[0]?.id
    if (!hotelId) {
      roomTypes.value = []
      ratePlans.value = []
      return
    }
    roomTypes.value = (await listHotelRoomTypes(hotelId)) || []
    ratePlans.value = (await listHotelRatePlans(hotelId)) || []
  } catch (error) {
    notifyAdminRequestError(error, '加载酒店房型/房价失败')
  }
}

function openBooking() {
  const today = new Date()
  const tomorrow = new Date(Date.now() + 86400000)
  form.dates = [today.toISOString().slice(0, 10), tomorrow.toISOString().slice(0, 10)]
  form.roomTypeId = null
  form.ratePlanId = null
  form.rooms = 1
  form.guestName = ''
  form.guestPhone = ''
  quote.value = null
  bookingVisible.value = true
  loadOptions()
}

function onRoomTypeChange() {
  quote.value = null
}

function stayBody() {
  return {
    roomTypeId: form.roomTypeId,
    ratePlanId: form.ratePlanId,
    checkInDate: form.dates?.[0],
    checkOutDate: form.dates?.[1],
    rooms: form.rooms,
  }
}

async function calculateQuote() {
  if (!form.roomTypeId || !form.ratePlanId || !form.dates?.length) {
    ElMessage.warning('请选择房型、房价计划和入住日期')
    return
  }
  quoting.value = true
  try {
    quote.value = await quoteHotelStay(stayBody())
  } catch (error) {
    quote.value = null
    notifyAdminRequestError(error, '试算失败')
  } finally {
    quoting.value = false
  }
}

async function submitBooking() {
  if (!form.guestName || !form.guestPhone) {
    ElMessage.warning('请填写住客姓名和手机号')
    return
  }
  submitting.value = true
  try {
    await createHotelBooking({ ...stayBody(), guestName: form.guestName, guestPhone: form.guestPhone })
    ElMessage.success('预订已创建，等待确认/支付')
    bookingVisible.value = false
    await loadTasks()
  } catch (error) {
    notifyAdminRequestError(error, '创建预订失败')
  } finally {
    submitting.value = false
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

onMounted(async () => {
  await loadTasks()
  await loadOptions()
})
</script>

<style scoped>
.hotel-page { padding-bottom: 32px; }
.hotel-notice { margin-bottom: 12px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.header-actions { display: flex; gap: 8px; }
.quote-box { margin: 12px 0; }
.muted { color: var(--el-text-color-placeholder); }
</style>
