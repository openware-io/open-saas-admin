<template>
  <div class="admin-page hotel-master-page">
    <div class="page-header">
      <div>
        <h2>酒店资料与库存</h2>
        <p class="subtle">维护酒店、房型、客房、房价计划和按日期的房价/库存。</p>
      </div>
      <div class="header-actions">
        <el-button @click="router.push('/admin/tenant/hotel')">返回酒店前台</el-button>
        <el-button type="primary" :loading="savingHotel" @click="saveHotel">保存酒店资料</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="master-tabs">
      <el-tab-pane label="酒店资料" name="hotel">
        <el-form :model="hotelForm" label-width="110px" class="master-form">
          <el-form-item label="酒店">
            <el-select v-model="hotelId" style="width:100%" @change="loadAll">
              <el-option v-for="hotel in hotels" :key="hotel.id" :label="hotel.name" :value="hotel.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="名称"><el-input v-model="hotelForm.name" maxlength="128" /></el-form-item>
          <el-form-item label="地址"><el-input v-model="hotelForm.address" maxlength="255" /></el-form-item>
          <el-form-item label="封面图 URL">
            <el-input v-model="hotelForm.coverImageUrl" maxlength="512" placeholder="/c/assets/hotel-cover.svg" />
          </el-form-item>
          <el-form-item label="封面预览">
            <img v-if="hotelForm.coverImageUrl" class="cover-preview" :src="hotelForm.coverImageUrl" alt="酒店封面" />
            <span v-else class="subtle">未配置封面</span>
          </el-form-item>
          <el-form-item label="时区"><el-input v-model="hotelForm.timezone" maxlength="64" /></el-form-item>
          <el-form-item label="入住 / 退房">
            <el-input v-model="hotelForm.checkInTime" placeholder="14:00" style="width:120px" />
            <el-input v-model="hotelForm.checkOutTime" placeholder="12:00" style="width:120px;margin-left:8px" />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="房型与客房" name="rooms">
        <div class="section-head">
          <h3>房型</h3>
          <el-button type="primary" size="small" @click="openRoomType()">新增房型</el-button>
        </div>
        <el-table :data="roomTypes" stripe>
          <el-table-column prop="code" label="编码" width="130" />
          <el-table-column prop="name" label="名称" min-width="160" />
          <el-table-column prop="capacity" label="可住人数" width="100" />
          <el-table-column prop="bedType" label="床型" width="130" />
          <el-table-column prop="areaSqm" label="面积" width="90" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }"><el-button link type="primary" @click="openRoomType(row)">编辑</el-button></template>
          </el-table-column>
        </el-table>

        <div class="section-head">
          <h3>客房</h3>
          <div class="inline-actions">
            <el-select v-model="selectedRoomTypeId" placeholder="选择房型" style="width:190px" @change="loadRooms">
              <el-option v-for="type in roomTypes" :key="type.id" :label="type.name" :value="type.id" />
            </el-select>
            <el-button type="primary" size="small" :disabled="!selectedRoomTypeId" @click="openRoom()">新增客房</el-button>
          </div>
        </div>
        <el-table :data="rooms" stripe>
          <el-table-column prop="roomNo" label="房号" width="130" />
          <el-table-column prop="floor" label="楼层" width="100" />
          <el-table-column label="房态" width="120">
            <template #default="{ row }">{{ hotelRoomStatusText(row.status) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="170">
            <template #default="{ row }">
              <el-button link type="primary" @click="openRoom(row)">编辑</el-button>
              <el-button v-if="row.status === 'ACTIVE'" link type="warning" @click="toggleRoomStatus(row)">维修</el-button>
              <el-button v-else-if="row.status === 'MAINTENANCE'" link type="success" @click="toggleRoomStatus(row)">恢复</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="房价计划" name="rates">
        <div class="section-head">
          <h3>房价计划</h3>
          <el-button type="primary" size="small" @click="openRatePlan()">新增房价计划</el-button>
        </div>
        <el-table :data="ratePlans" stripe>
          <el-table-column prop="code" label="编码" width="130" />
          <el-table-column prop="name" label="名称" min-width="170" />
          <el-table-column label="基础价" width="130">
            <template #default="{ row }">{{ formatMoney(row.basePriceMinor, row.currency) }}</template>
          </el-table-column>
          <el-table-column label="币种" width="90">
            <template #default="{ row }">{{ currencyLabel(row.currency) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }"><el-button link type="primary" @click="openRatePlan(row)">编辑</el-button></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="每日房价" name="daily-rates">
        <div class="filter-row">
          <el-select v-model="rateRoomTypeId" placeholder="房型" style="width:180px">
            <el-option v-for="type in roomTypes" :key="type.id" :label="type.name" :value="type.id" />
          </el-select>
          <el-select v-model="ratePlanId" placeholder="房价计划" style="width:180px">
            <el-option v-for="plan in ratePlans" :key="plan.id" :label="plan.name" :value="plan.id" />
          </el-select>
          <el-date-picker v-model="rateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期"
            end-placeholder="结束日期" style="width:260px" />
          <el-button type="primary" @click="loadDailyRates">查询</el-button>
        </div>
        <el-table :data="dailyRateRows" stripe>
          <el-table-column prop="stayDate" label="日期" width="140" />
          <el-table-column label="价格（分）" width="180">
            <template #default="{ row }"><el-input-number v-model="row.priceMinor" :min="0" :step="100" /></template>
          </el-table-column>
          <el-table-column prop="currency" label="币种" width="100" />
          <el-table-column label="操作" width="100">
            <template #default="{ row }"><el-button link type="primary" @click="saveDailyRate(row)">保存</el-button></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="库存日历" name="inventory">
        <div class="filter-row">
          <el-select v-model="inventoryRoomTypeId" placeholder="房型" style="width:180px">
            <el-option v-for="type in roomTypes" :key="type.id" :label="type.name" :value="type.id" />
          </el-select>
          <el-date-picker v-model="inventoryRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期"
            end-placeholder="结束日期" style="width:260px" />
          <el-button type="primary" @click="loadInventory">查询</el-button>
        </div>
        <el-table :data="inventoryRows" stripe>
          <el-table-column prop="stayDate" label="日期" width="140" />
          <el-table-column label="总库存" width="180">
            <template #default="{ row }"><el-input-number v-model="row.total" :min="row.sold + row.held" :step="1" /></template>
          </el-table-column>
          <el-table-column prop="sold" label="已售" width="90" />
          <el-table-column prop="held" label="占用" width="90" />
          <el-table-column label="可售" width="90">
            <template #default="{ row }">{{ Math.max(0, row.total - row.sold - row.held) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }"><el-button link type="primary" @click="saveInventory(row)">保存</el-button></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="roomTypeVisible" :title="roomTypeForm.id ? '编辑房型' : '新增房型'" width="500px">
      <el-form :model="roomTypeForm" label-width="90px">
        <el-form-item label="编码"><el-input v-model="roomTypeForm.code" maxlength="32" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="roomTypeForm.name" maxlength="64" /></el-form-item>
        <el-form-item label="可住人数"><el-input-number v-model="roomTypeForm.capacity" :min="1" :max="20" /></el-form-item>
        <el-form-item label="床型"><el-input v-model="roomTypeForm.bedType" maxlength="32" /></el-form-item>
        <el-form-item label="面积"><el-input-number v-model="roomTypeForm.areaSqm" :min="0" :precision="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roomTypeVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingMaster" @click="saveRoomType">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="roomVisible" :title="roomForm.id ? '编辑客房' : '新增客房'" width="460px">
      <el-form :model="roomForm" label-width="90px">
        <el-form-item label="房型">
          <el-select v-model="roomForm.roomTypeId" style="width:100%" :disabled="!!roomForm.id">
            <el-option v-for="type in roomTypes" :key="type.id" :label="type.name" :value="type.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="房号"><el-input v-model="roomForm.roomNo" maxlength="32" /></el-form-item>
        <el-form-item label="楼层"><el-input v-model="roomForm.floor" maxlength="16" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roomVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingMaster" @click="saveRoom">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ratePlanVisible" :title="ratePlanForm.id ? '编辑房价计划' : '新增房价计划'" width="500px">
      <el-form :model="ratePlanForm" label-width="100px">
        <el-form-item label="编码"><el-input v-model="ratePlanForm.code" maxlength="32" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="ratePlanForm.name" maxlength="64" /></el-form-item>
        <el-form-item label="基础价（分）"><el-input-number v-model="ratePlanForm.basePriceMinor" :min="0" :step="100" /></el-form-item>
        <el-form-item label="币种">
          <el-select v-model="ratePlanForm.currency" style="width:100%">
            <el-option v-for="option in currencyChoices" :key="option.code" :label="option.label" :value="option.code" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ratePlanVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingMaster" @click="saveRatePlan">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  createHotelRatePlan,
  createHotelRoom,
  createHotelRoomType,
  listHotelDailyRates,
  listHotelInventory,
  listHotelRatePlans,
  listHotelRoomTypes,
  listHotelRooms,
  listHotels,
  setHotelDailyRate,
  setHotelInventory,
  setHotelRoomStatus,
  updateHotelRatePlan,
  updateHotelRoom,
  updateHotelRoomType,
} from '@/api/hotel'
import { updateHotel } from '@/api/hotel-master'
import { formatMoney } from '@/utils/format'
import { currencyLabel, currencyOptions } from '@/constants/currency'
import { hotelRoomStatusText } from '@/constants/terms'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'

const router = useRouter()
const hotels = ref([])
const hotelId = ref(null)
const activeTab = ref('hotel')
const savingHotel = ref(false)
const savingMaster = ref(false)
const roomTypes = ref([])
const rooms = ref([])
const ratePlans = ref([])
const selectedRoomTypeId = ref(null)
const dailyRateRows = ref([])
const inventoryRows = ref([])
const rateRoomTypeId = ref(null)
const ratePlanId = ref(null)
const rateRange = ref([])
const inventoryRoomTypeId = ref(null)
const inventoryRange = ref([])

const hotelForm = reactive({
  name: '', address: '', coverImageUrl: '', timezone: 'Asia/Shanghai',
  checkInTime: '14:00', checkOutTime: '12:00',
})
const roomTypeVisible = ref(false)
const roomTypeForm = reactive({ id: null, hotelId: null, code: '', name: '', capacity: 2, bedType: '', areaSqm: 0 })
const roomVisible = ref(false)
const roomForm = reactive({ id: null, roomTypeId: null, roomNo: '', floor: '' })
const ratePlanVisible = ref(false)
const currencyChoices = currencyOptions()
const ratePlanForm = reactive({ id: null, hotelId: null, code: '', name: '', basePriceMinor: 0, currency: currencyChoices[0].code })

const hotel = computed(() => hotels.value.find((item) => item.id === hotelId.value))
const selectedRatePlan = computed(() => ratePlans.value.find((item) => item.id === ratePlanId.value))

function localDate(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function datesBetween(from, to) {
  if (!from || !to) return []
  const result = []
  const cursor = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (cursor <= end) {
    result.push(localDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}
function defaultRange() {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + 13)
  return [localDate(start), localDate(end)]
}

async function loadAll() {
  const item = hotel.value
  if (!item) return
  Object.assign(hotelForm, {
    name: item.name || '', address: item.address || '', coverImageUrl: item.coverImageUrl || '',
    timezone: item.timezone || 'Asia/Shanghai', checkInTime: item.checkInTime || '14:00', checkOutTime: item.checkOutTime || '12:00',
  })
  ;[roomTypes.value, ratePlans.value] = await Promise.all([listHotelRoomTypes(hotelId.value), listHotelRatePlans(hotelId.value)])
  if (!selectedRoomTypeId.value && roomTypes.value.length) selectedRoomTypeId.value = roomTypes.value[0].id
  rateRoomTypeId.value ||= roomTypes.value[0]?.id || null
  inventoryRoomTypeId.value ||= roomTypes.value[0]?.id || null
  ratePlanId.value ||= ratePlans.value[0]?.id || null
  rateRange.value ||= defaultRange()
  inventoryRange.value ||= defaultRange()
  await loadRooms()
  if (activeTab.value === 'daily-rates') await loadDailyRates()
  if (activeTab.value === 'inventory') await loadInventory()
}

async function saveHotel() {
  if (!hotelId.value) return
  savingHotel.value = true
  try {
    await updateHotel(hotelId.value, { ...hotelForm })
    ElMessage.success('酒店资料已保存')
    await loadAll()
  } catch (error) {
    notifyAdminRequestError(error, '保存酒店资料失败')
  } finally {
    savingHotel.value = false
  }
}

async function loadRooms() {
  rooms.value = selectedRoomTypeId.value ? (await listHotelRooms(selectedRoomTypeId.value)) || [] : []
}
function openRoomType(row) {
  Object.assign(roomTypeForm, row ? { ...row } : { id: null, hotelId: hotelId.value, code: '', name: '', capacity: 2, bedType: '', areaSqm: 0 })
  roomTypeVisible.value = true
}
async function saveRoomType() {
  savingMaster.value = true
  try {
    const payload = { hotelId: hotelId.value, code: roomTypeForm.code, name: roomTypeForm.name, capacity: roomTypeForm.capacity, bedType: roomTypeForm.bedType, areaSqm: roomTypeForm.areaSqm }
    if (roomTypeForm.id) await updateHotelRoomType(roomTypeForm.id, payload)
    else await createHotelRoomType(payload)
    roomTypeVisible.value = false
    ElMessage.success('房型已保存')
    await loadAll()
  } catch (error) { notifyAdminRequestError(error, '保存房型失败') } finally { savingMaster.value = false }
}
function openRoom(row) {
  Object.assign(roomForm, row ? { ...row } : { id: null, roomTypeId: selectedRoomTypeId.value, roomNo: '', floor: '' })
  roomVisible.value = true
}
async function saveRoom() {
  savingMaster.value = true
  try {
    const payload = { roomTypeId: roomForm.roomTypeId || selectedRoomTypeId.value, roomNo: roomForm.roomNo, floor: roomForm.floor }
    if (roomForm.id) await updateHotelRoom(roomForm.id, payload)
    else await createHotelRoom(payload)
    roomVisible.value = false
    ElMessage.success('客房已保存')
    await loadRooms()
  } catch (error) { notifyAdminRequestError(error, '保存客房失败') } finally { savingMaster.value = false }
}
function openRatePlan(row) {
  Object.assign(ratePlanForm, row ? { ...row } : { id: null, hotelId: hotelId.value, code: '', name: '', basePriceMinor: 0, currency: currencyChoices[0].code })
  ratePlanVisible.value = true
}
async function toggleRoomStatus(row) {
  const next = row.status === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE'
  try {
    await setHotelRoomStatus(row.id, next)
    ElMessage.success(next === 'MAINTENANCE' ? '客房已置为维修中' : '客房已恢复可用')
    await loadRooms()
  } catch (error) { notifyAdminRequestError(error, '更新客房状态失败') }
}

async function saveRatePlan() {
  savingMaster.value = true
  try {
    const payload = { hotelId: hotelId.value, code: ratePlanForm.code, name: ratePlanForm.name, basePriceMinor: ratePlanForm.basePriceMinor, currency: ratePlanForm.currency }
    if (ratePlanForm.id) await updateHotelRatePlan(ratePlanForm.id, payload)
    else await createHotelRatePlan(payload)
    ratePlanVisible.value = false
    ElMessage.success('房价计划已保存')
    await loadAll()
  } catch (error) { notifyAdminRequestError(error, '保存房价计划失败') } finally { savingMaster.value = false }
}
async function loadDailyRates() {
  if (!rateRoomTypeId.value || !ratePlanId.value || !rateRange.value?.length) return
  try {
    const records = (await listHotelDailyRates({
      roomTypeId: rateRoomTypeId.value, ratePlanId: ratePlanId.value, from: rateRange.value[0], to: rateRange.value[1],
    })) || []
    dailyRateRows.value = datesBetween(rateRange.value[0], rateRange.value[1]).map((stayDate) => {
      const record = records.find((item) => item.stayDate === stayDate)
      return { stayDate, priceMinor: record?.priceMinor ?? selectedRatePlan.value?.basePriceMinor ?? 0, currency: record?.currency || selectedRatePlan.value?.currency || currencyChoices[0].code }
    })
  } catch (error) { notifyAdminRequestError(error, '加载每日房价失败') }
}
async function saveDailyRate(row) {
  try {
    await setHotelDailyRate({ roomTypeId: rateRoomTypeId.value, ratePlanId: ratePlanId.value, stayDate: row.stayDate, priceMinor: row.priceMinor, currency: row.currency })
    ElMessage.success(`${row.stayDate} 房价已保存`)
  } catch (error) { notifyAdminRequestError(error, '保存每日房价失败') }
}
async function loadInventory() {
  if (!inventoryRoomTypeId.value || !inventoryRange.value?.length) return
  try {
    const records = (await listHotelInventory({
      roomTypeId: inventoryRoomTypeId.value, from: inventoryRange.value[0], to: inventoryRange.value[1],
    })) || []
    inventoryRows.value = datesBetween(inventoryRange.value[0], inventoryRange.value[1]).map((stayDate) => {
      const record = records.find((item) => item.stayDate === stayDate)
      return { stayDate, total: record?.total ?? 0, sold: record?.sold ?? 0, held: record?.held ?? 0 }
    })
  } catch (error) { notifyAdminRequestError(error, '加载库存失败') }
}
async function saveInventory(row) {
  try {
    await setHotelInventory({ roomTypeId: inventoryRoomTypeId.value, stayDate: row.stayDate, total: row.total })
    ElMessage.success(`${row.stayDate} 库存已保存`)
    await loadInventory()
  } catch (error) { notifyAdminRequestError(error, '保存库存失败') }
}

onMounted(async () => {
  try {
    hotels.value = (await listHotels()) || []
    if (hotels.value.length) {
      hotelId.value = hotels.value[0].id
      await loadAll()
    }
  } catch (error) { notifyAdminRequestError(error, '加载酒店资料失败') }
})
</script>

<style scoped>
.hotel-master-page { padding-bottom: 32px; }
.master-tabs { margin-top: 4px; }
.master-form { max-width: 760px; }
.cover-preview { width: 240px; max-height: 150px; object-fit: cover; border-radius: 10px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin: 22px 0 10px; }
.section-head h3 { margin: 0; }
.inline-actions, .filter-row { display: flex; align-items: center; gap: 8px; }
.filter-row { margin: 2px 0 14px; flex-wrap: wrap; }
</style>
