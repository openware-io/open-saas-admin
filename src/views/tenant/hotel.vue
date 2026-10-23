<template>
  <div class="admin-page hotel-page">
    <div class="page-header">
      <div>
        <h2>酒店前台</h2>
        <p class="subtle">预订、入住、退房和账务已接后端；酒店资料/房型/房价配置暂未提供页面。</p>
      </div>
      <div class="header-actions">
        <el-button v-if="canCreate" type="primary" @click="openBooking">新建预订</el-button>
        <el-button v-if="canManageRooms" :loading="auditLoading" @click="runAudit">夜审</el-button>
        <el-button v-if="canCollect" :loading="refundSyncing" @click="syncRefunds">同步退款</el-button>
        <el-button :loading="loading" @click="reload">刷新</el-button>
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
        <el-table-column label="操作" width="240" align="center">
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
            <el-button
              v-if="row.status === 'PENDING_PAYMENT' && row.orderId && canCollect"
              link
              type="success"
              @click="payAndConfirm(row)"
            >
              收款确认
            </el-button>
            <el-button
              v-if="row.status === 'IN_HOUSE' || row.status === 'DUE_OUT'"
              link
              @click="openFolio(row)"
            >
              账单
            </el-button>
            <span v-if="!canCheckIn && !canCheckOut" class="muted">-</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="admin-card">
      <div class="section-head">
        <h3>客房清扫</h3>
        <el-tag effect="plain">{{ housekeeping.length }} 条</el-tag>
      </div>
      <el-table v-loading="housekeepingLoading" :data="housekeeping" border stripe>
        <el-table-column prop="roomNo" label="房号" width="100" />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">{{ housekeepingStatusText(row.status) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center">
          <template #default="{ row }">
            <el-button v-if="row.status === 'PENDING' && canManageRooms" link type="primary" @click="startCleaning(row)">
              开始清扫
            </el-button>
            <el-button
              v-if="row.status === 'IN_PROGRESS' && canManageRooms"
              link
              type="success"
              @click="finishCleaning(row)"
            >
              完成清扫
            </el-button>
            <span v-if="row.status === 'DONE'" class="muted">已完成</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="folioVisible" :title="`账单 · ${folioBooking?.guestName || ''}`" width="620px">
      <div v-if="folio" class="folio-head">
        <span>应收：{{ formatMoney(folio.folio.chargeMinor, folio.folio.currency) }}</span>
        <span>已收：{{ formatMoney(folio.folio.paidMinor, folio.folio.currency) }}</span>
        <el-tag :type="folio.folio.status === 'SETTLED' ? 'success' : 'warning'">
          {{ hotelFolioStatusText(folio.folio.status) }}
        </el-tag>
      </div>
      <el-table :data="folio?.items || []" border stripe>
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="description" label="说明" min-width="160" />
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.amountMinor, row.currency) }}</template>
        </el-table-column>
      </el-table>
      <div v-if="folio?.folio?.status === 'OPEN'" class="deposit-box">
        <el-input-number v-model="depositAmount" :min="1" :max="folio.folio.chargeMinor" />
        <el-input v-model="depositNote" placeholder="押金备注" style="width:160px" />
        <el-select v-model="refundMethod" style="width:100px">
          <el-option label="现金" value="CASH" />
          <el-option label="线上" value="ONLINE" />
        </el-select>
        <el-button type="primary" :loading="depositLoading" @click="collectDeposit">收押金</el-button>
        <el-button type="warning" :loading="refunding" @click="refundDeposit">退款</el-button>
      </div>
    </el-dialog>

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
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  checkInHotelBooking,
  checkOutHotelBooking,
  collectHotelOrder,
  collectHotelDeposit,
  completeHousekeepingTask,
  confirmHotelBooking,
  createHotelBooking,
  getHotelFolio,
  listHotelFrontDeskTasks,
  listHotelRatePlans,
  listHotelRoomTypes,
  listHotels,
  listHousekeepingTasks,
  quoteHotelStay,
  refundHotelDeposit,
  requestHotelOnlineRefund,
  runNightAudit,
  startHousekeepingTask,
  syncHotelRefunds,
} from '@/api/hotel'
import {
  hotelBookingStatusText,
  hotelFolioStatusText,
  housekeepingStatusText,
} from '@/constants/terms'
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
const housekeeping = ref([])
const housekeepingLoading = ref(false)
const folioVisible = ref(false)
const folioBooking = ref(null)
const folio = ref(null)
const depositAmount = ref(1)
const depositNote = ref('')
const depositLoading = ref(false)
const refunding = ref(false)
const refundMethod = ref('CASH')
const refundSyncing = ref(false)
const auditLoading = ref(false)
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
const canManageRooms = computed(() => hasPermission(context.value?.permissions, 'hotel.inventory.manage'))
const canCollect = computed(() => hasPermission(context.value?.permissions, 'payment.collect'))

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

async function loadHousekeeping() {
  if (!context.value?.storeId || !canViewHotel.value) {
    housekeeping.value = []
    return
  }
  housekeepingLoading.value = true
  try {
    housekeeping.value = (await listHousekeepingTasks()) || []
  } catch (error) {
    notifyAdminRequestError(error, '加载清扫任务失败')
  } finally {
    housekeepingLoading.value = false
  }
}

async function reload() {
  await Promise.all([loadTasks(), loadHousekeeping()])
}

async function openFolio(row) {
  folioBooking.value = row
  folio.value = null
  depositAmount.value = Math.max(1, row.amountMinor || 1)
  depositNote.value = '押金'
  folioVisible.value = true
  try {
    folio.value = await getHotelFolio(row.id)
  } catch (error) {
    notifyAdminRequestError(error, '加载账单失败')
  }
}

async function collectDeposit() {
  if (!folioBooking.value || !depositAmount.value) return
  depositLoading.value = true
  try {
    await collectHotelDeposit(folioBooking.value.id, {
      amountMinor: depositAmount.value,
      note: depositNote.value,
    })
    ElMessage.success('押金已收款')
    folio.value = await getHotelFolio(folioBooking.value.id)
  } catch (error) {
    notifyAdminRequestError(error, '收押金失败')
  } finally {
    depositLoading.value = false
  }
}

async function refundDeposit() {
  if (!folioBooking.value || !depositAmount.value) return
  refunding.value = true
  try {
    if (refundMethod.value === 'ONLINE') {
      await requestHotelOnlineRefund(folioBooking.value.id, {
        amountMinor: depositAmount.value,
        note: '线上押金退款',
        method: 'ONLINE',
      })
      ElMessage.success('线上退款申请已提交，等待支付审批')
    } else {
      await refundHotelDeposit(folioBooking.value.id, {
        amountMinor: depositAmount.value,
        note: '现金押金退款',
        method: 'CASH',
      })
      ElMessage.success('现金退款已记账')
      folio.value = await getHotelFolio(folioBooking.value.id)
    }
  } catch (error) {
    notifyAdminRequestError(error, '退款失败')
  } finally {
    refunding.value = false
  }
}

async function startCleaning(row) {
  try {
    await startHousekeepingTask(row.id)
    await loadHousekeeping()
  } catch (error) {
    notifyAdminRequestError(error, '开始清扫失败')
  }
}

async function finishCleaning(row) {
  try {
    await completeHousekeepingTask(row.id)
    ElMessage.success(`${row.roomNo} 已清扫完成`)
    await loadHousekeeping()
  } catch (error) {
    notifyAdminRequestError(error, '完成清扫失败')
  }
}

async function syncRefunds() {
  refundSyncing.value = true
  try {
    await syncHotelRefunds()
    ElMessage.success('退款状态已同步')
    if (folioBooking.value) folio.value = await getHotelFolio(folioBooking.value.id)
  } catch (error) {
    notifyAdminRequestError(error, '同步退款失败')
  } finally {
    refundSyncing.value = false
  }
}

async function runAudit() {
  const today = new Date().toISOString().slice(0, 10)
  let value
  try {
    const result = await ElMessageBox.prompt('输入营业日（YYYY-MM-DD）', '夜审', {
      inputValue: today,
      inputPattern: /^\d{4}-\d{2}-\d{2}$/,
      inputErrorMessage: '日期格式应为 YYYY-MM-DD',
    })
    value = result.value
  } catch {
    return
  }
  auditLoading.value = true
  try {
    await runNightAudit(value)
    ElMessage.success('夜审完成')
    await loadTasks()
  } catch (error) {
    notifyAdminRequestError(error, '夜审失败')
  } finally {
    auditLoading.value = false
  }
}

async function payAndConfirm(row) {
  if (!row.orderId || !row.amountMinor) {
    ElMessage.warning('该预订缺少订单应收，不能收款')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认按现金收取 ${formatMoney(row.amountMinor, row.currency)} 并确认预订？`,
      '收款确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await collectHotelOrder(row.orderId, {
      currencyCode: row.currency,
      payable: row.amountMinor,
      payments: [{ method: 'CASH', amount: row.amountMinor }],
    }, `hotel-booking-${row.id}-${Date.now()}`)
    await confirmHotelBooking(row.id)
    ElMessage.success('收款成功，预订已确认')
    await reload()
  } catch (error) {
    notifyAdminRequestError(error, '收款确认失败')
  }
}

async function checkIn(row) {
  try {
    await checkInHotelBooking(row.id)
    ElMessage.success(`${row.guestName} 已办理入住`)
    await reload()
  } catch (error) {
    notifyAdminRequestError(error, '办理入住失败')
  }
}

async function checkOut(row) {
  try {
    await checkOutHotelBooking(row.id)
    ElMessage.success(`${row.guestName} 已退房`)
    await reload()
  } catch (error) {
    notifyAdminRequestError(error, '办理退房失败')
  }
}

onMounted(async () => {
  await reload()
  await loadOptions()
})
</script>

<style scoped>
.hotel-page { padding-bottom: 32px; }
.hotel-notice { margin-bottom: 12px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.header-actions { display: flex; gap: 8px; }
.quote-box { margin: 12px 0; }
.folio-head { display: flex; gap: 18px; align-items: center; margin-bottom: 12px; }
.deposit-box { display: flex; gap: 8px; margin-top: 12px; }
.muted { color: var(--el-text-color-placeholder); }
</style>
