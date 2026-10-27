<template>
  <div class="admin-page hotel-master-page">
    <div class="page-header">
      <div>
        <h2>{{ resourcesMode ? '房型、房价与库存' : '酒店设置' }}</h2>
        <p class="subtle">{{ resourcesMode ? '维护房型、客房、房价计划、每日房价与库存日历。' : '维护酒店基础资料、封面、支付方式与押金规则。' }}</p>
      </div>
      <div class="header-actions">
        <el-button @click="router.push('/admin/tenant/hotel')">返回酒店前台</el-button>
        <el-button v-if="!resourcesMode" type="primary" :loading="savingHotel" @click="saveHotel">保存酒店设置</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="master-tabs">
      <el-tab-pane v-if="!resourcesMode" label="酒店资料" name="hotel">
        <el-form :model="hotelForm" label-width="110px" class="master-form">
          <el-form-item label="酒店">
            <el-select v-model="hotelId" style="width:100%" @change="loadAll">
              <el-option v-for="hotel in hotels" :key="hotel.id" :label="hotel.name" :value="hotel.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="名称"><el-input v-model="hotelForm.name" maxlength="128" /></el-form-item>
          <el-form-item label="地址"><el-input v-model="hotelForm.address" maxlength="255" /></el-form-item>
          <el-form-item label="封面图">
            <ImageUrlEditor
              v-model="hotelForm.coverImageUrl"
              label="酒店封面"
              alt="酒店封面预览"
              default-url="/c/assets/hotel-cover.svg"
              :recommended-width="1600"
              :recommended-height="900"
              :min-width="800"
              :min-height="450"
              :max-size-mb="5"
              aspect="16 / 9"
            />
          </el-form-item>
          <el-form-item label="时区"><el-input v-model="hotelForm.timezone" maxlength="64" /></el-form-item>
          <el-form-item label="入住 / 退房">
            <el-input v-model="hotelForm.checkInTime" placeholder="14:00" style="width:120px" />
            <el-input v-model="hotelForm.checkOutTime" placeholder="12:00" style="width:120px;margin-left:8px" />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane v-if="!resourcesMode" label="支付与押金" name="policy">
        <el-form :model="policyForm" label-width="150px" class="master-form">
          <el-form-item label="接入模式">
            <el-select v-model="policyForm.accessMode" style="width:260px">
              <el-option label="单店" value="SINGLE_STORE" />
              <el-option label="集团" value="GROUP" />
            </el-select>
          </el-form-item>
          <el-form-item label="销售入口">
            <el-input v-model="policyForm.entryPoints" maxlength="255" placeholder="服务中心,休闲娱乐" />
          </el-form-item>
          <el-form-item label="支付模式">
            <el-select v-model="policyForm.paymentMode" style="width:260px">
              <el-option label="全额预付" value="PREPAY" />
              <el-option label="到店付" value="PAY_AT_HOTEL" />
              <el-option label="定金" value="DEPOSIT" />
            </el-select>
            <span class="form-hint">到店付会在下单后直接确认并占用库存；定金模式等待前台收定金确认。</span>
          </el-form-item>
          <el-form-item label="定金比例（bps）">
            <el-input-number v-model="policyForm.depositRatioBps" :min="0" :max="10000" :step="500" />
            <span class="form-hint">3000 = 30%</span>
          </el-form-item>
          <el-form-item label="入住必须收押金">
            <el-switch v-model="policyForm.stayDepositRequired" />
          </el-form-item>
          <el-form-item label="押金模式">
            <el-select v-model="policyForm.stayDepositMode" style="width:260px">
              <el-option label="前台收取" value="COLLECT" />
              <el-option label="银行卡预授权（预留）" value="PRE_AUTH" />
            </el-select>
          </el-form-item>
          <el-form-item label="固定押金（分）">
            <el-input-number v-model="policyForm.stayDepositMinor" :min="0" :step="1000" />
          </el-form-item>
          <el-form-item label="押金比例（bps）">
            <el-input-number v-model="policyForm.stayDepositRatioBps" :min="0" :max="10000" :step="500" />
            <span class="form-hint">固定押金为 0 时按此比例计算</span>
          </el-form-item>
          <el-form-item label="取消政策">
            <el-select v-model="policyForm.cancelPolicy" style="width:260px">
              <el-option label="入住前 24 小时免费取消" value="FREE_UNTIL_24H" />
              <el-option label="不可取消" value="NON_REFUNDABLE" />
            </el-select>
          </el-form-item>
          <el-form-item label="积分抵扣">
            <el-switch v-model="policyForm.pointsRedeemEnabled" />
          </el-form-item>
          <el-form-item label="积分最大抵扣比例（bps）">
            <el-input-number v-model="policyForm.pointsMaxRatioBps" :min="0" :max="10000" :step="500" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="policySaving" @click="savePolicy">保存支付与押金策略</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane v-if="resourcesMode" label="房型与客房" name="rooms">
        <div class="section-head">
          <h3>房型</h3>
          <el-button type="primary" size="small" @click="openRoomType()">新增房型</el-button>
        </div>
        <el-table :data="pagedRoomTypes" stripe>
          <el-table-column prop="code" label="编码" width="130" />
          <el-table-column prop="name" label="名称" min-width="160" />
          <el-table-column prop="capacity" label="可住人数" width="100" />
          <el-table-column prop="bedType" label="床型" width="130" />
          <el-table-column prop="areaSqm" label="面积" width="90" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }"><el-button link type="primary" @click="openRoomType(row)">编辑</el-button></template>
          </el-table-column>
        </el-table>
        <div class="table-pager">
          <el-pagination
            v-model:current-page="roomTypePage"
            v-model:page-size="roomTypePageSize"
            layout="total, prev, pager, next, sizes"
            :total="roomTypes.length"
            :page-sizes="[10, 20, 50]"
          />
        </div>

        <div class="section-head">
          <h3>客房</h3>
          <div class="inline-actions">
            <el-select v-model="selectedRoomTypeId" placeholder="选择房型" style="width:190px" @change="loadRooms">
              <el-option label="全部房型" value="ALL" />
              <el-option v-for="type in roomTypes" :key="type.id" :label="type.name" :value="type.id" />
            </el-select>
            <el-button type="primary" size="small" :disabled="!roomTypes.length" @click="openRoom()">新增客房</el-button>
          </div>
        </div>
        <el-table :data="pagedRooms" stripe>
          <el-table-column prop="roomNo" label="房号" width="100" />
          <el-table-column prop="roomTypeName" label="房型" min-width="140" />
          <el-table-column prop="floor" label="楼层" width="80" />
          <el-table-column label="房态" width="110">
            <template #default="{ row }">{{ hotelRoomStatusText(row.status) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button link type="primary" @click="openRoom(row)">编辑</el-button>
              <el-button v-if="row.status === 'ACTIVE'" link type="warning" @click="toggleRoomStatus(row)">维修</el-button>
              <el-button v-else-if="row.status === 'MAINTENANCE'" link type="success" @click="toggleRoomStatus(row)">恢复</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="table-pager">
          <el-pagination
            v-model:current-page="roomPage"
            v-model:page-size="roomPageSize"
            layout="total, prev, pager, next, sizes"
            :total="rooms.length"
            :page-sizes="[10, 20, 50]"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="resourcesMode" label="房价计划" name="rates">
        <div class="section-head">
          <h3>房价计划</h3>
          <el-button type="primary" size="small" @click="openRatePlan()">新增房价计划</el-button>
        </div>
        <el-table :data="pagedRatePlans" stripe>
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
        <div class="table-pager">
          <el-pagination
            v-model:current-page="ratePlanPage"
            v-model:page-size="ratePlanPageSize"
            layout="total, prev, pager, next, sizes"
            :total="ratePlans.length"
            :page-sizes="[10, 20, 50]"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="resourcesMode" label="每日房价" name="daily-rates">
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
        <el-table :data="pagedDailyRateRows" stripe>
          <el-table-column prop="stayDate" label="日期" width="140" />
          <el-table-column label="价格（分）" width="180">
            <template #default="{ row }"><el-input-number v-model="row.priceMinor" :min="0" :step="100" /></template>
          </el-table-column>
          <el-table-column prop="currency" label="币种" width="100" />
          <el-table-column label="操作" width="100">
            <template #default="{ row }"><el-button link type="primary" @click="saveDailyRate(row)">保存</el-button></template>
          </el-table-column>
        </el-table>
        <div class="table-pager">
          <el-pagination
            v-model:current-page="dailyRatePage"
            v-model:page-size="dailyRatePageSize"
            layout="total, prev, pager, next, sizes"
            :total="dailyRateRows.length"
            :page-sizes="[10, 20, 50]"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="resourcesMode" label="库存日历" name="inventory">
        <div class="filter-row">
          <el-select v-model="inventoryRoomTypeId" placeholder="房型" style="width:180px">
            <el-option v-for="type in roomTypes" :key="type.id" :label="type.name" :value="type.id" />
          </el-select>
          <el-date-picker v-model="inventoryRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期"
            end-placeholder="结束日期" style="width:260px" />
          <el-button type="primary" @click="loadInventory">查询</el-button>
        </div>
        <el-table :data="pagedInventoryRows" stripe>
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
        <div class="table-pager">
          <el-pagination
            v-model:current-page="inventoryPage"
            v-model:page-size="inventoryPageSize"
            layout="total, prev, pager, next, sizes"
            :total="inventoryRows.length"
            :page-sizes="[10, 20, 50]"
          />
        </div>
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import ImageUrlEditor from '@/components/ImageUrlEditor.vue'
import {
  createHotelRatePlan,
  createHotelRoom,
  createHotelRoomType,
  listHotelDailyRates,
  listHotelInventory,
  listHotelRatePlans,
  listHotelRoomTypes,
  getHotelPolicy,
  listHotelRooms,
  listHotels,
  updateHotelPolicy,
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
const route = useRoute()
const resourcesMode = computed(() => route.name === 'HotelResources')
const hotels = ref([])
const hotelId = ref(null)
const activeTab = ref(resourcesMode.value ? 'rooms' : 'hotel')
const savingHotel = ref(false)
const savingMaster = ref(false)
const policyForm = reactive({
  accessMode: 'SINGLE_STORE', entryPoints: '', paymentMode: 'PREPAY', depositRatioBps: 3000, stayDepositRequired: true, stayDepositMode: 'COLLECT',
  stayDepositMinor: 0, stayDepositRatioBps: 0, cancelPolicy: 'FREE_UNTIL_24H',
  pointsRedeemEnabled: false, pointsMaxRatioBps: 0,
})
const policySaving = ref(false)
const roomTypes = ref([])
const rooms = ref([])
const ratePlans = ref([])
const selectedRoomTypeId = ref('ALL')
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
const roomTypePage = ref(1)
const roomTypePageSize = ref(10)
const roomPage = ref(1)
const roomPageSize = ref(10)
const ratePlanPage = ref(1)
const ratePlanPageSize = ref(10)
const dailyRatePage = ref(1)
const dailyRatePageSize = ref(10)
const inventoryPage = ref(1)
const inventoryPageSize = ref(10)

const hotel = computed(() => hotels.value.find((item) => item.id === hotelId.value))
const selectedRatePlan = computed(() => ratePlans.value.find((item) => item.id === ratePlanId.value))
const roomTypeNameById = computed(() => new Map(roomTypes.value.map((type) => [type.id, type.name])))
function typeName(id) { return roomTypeNameById.value.get(id) || '' }
function pageRows(rows, page, pageSize) {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}
const pagedRoomTypes = computed(() => pageRows(roomTypes.value, roomTypePage.value, roomTypePageSize.value))
const pagedRooms = computed(() => pageRows(rooms.value, roomPage.value, roomPageSize.value))
const pagedRatePlans = computed(() => pageRows(ratePlans.value, ratePlanPage.value, ratePlanPageSize.value))
const pagedDailyRateRows = computed(() => pageRows(dailyRateRows.value, dailyRatePage.value, dailyRatePageSize.value))
const pagedInventoryRows = computed(() => pageRows(inventoryRows.value, inventoryPage.value, inventoryPageSize.value))

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
  const policy = await getHotelPolicy(hotelId.value)
  if (policy) Object.assign(policyForm, policy)
  roomTypePage.value = 1
  ratePlanPage.value = 1
  rateRoomTypeId.value ||= roomTypes.value[0]?.id || null
  inventoryRoomTypeId.value ||= roomTypes.value[0]?.id || null
  ratePlanId.value ||= ratePlans.value[0]?.id || null
  rateRange.value ||= defaultRange()
  inventoryRange.value ||= defaultRange()
  await loadRooms()
  if (activeTab.value === 'daily-rates') await loadDailyRates()
  if (activeTab.value === 'inventory') await loadInventory()
}

async function savePolicy() {
  policySaving.value = true
  try {
    await updateHotelPolicy(hotelId.value, { ...policyForm })
    ElMessage.success('支付与押金策略已保存')
  } catch (error) { notifyAdminRequestError(error, '保存支付与押金策略失败') } finally { policySaving.value = false }
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
  roomPage.value = 1
  const types = selectedRoomTypeId.value && selectedRoomTypeId.value !== 'ALL'
    ? roomTypes.value.filter((type) => type.id === selectedRoomTypeId.value)
    : roomTypes.value
  if (!types.length) {
    rooms.value = []
    return
  }
  const lists = await Promise.all(types.map((type) => listHotelRooms(type.id)))
  rooms.value = lists.flatMap((list, index) => (list || []).map((room) => ({
    ...room,
    roomTypeName: typeName(room.roomTypeId) || types[index]?.name || '未分房型',
  }))).sort((a, b) => String(a.floor || '').localeCompare(String(b.floor || ''), 'zh-CN', { numeric: true })
    || String(a.roomNo || '').localeCompare(String(b.roomNo || ''), 'zh-CN', { numeric: true }))
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
  const fallbackTypeId = selectedRoomTypeId.value === 'ALL' ? roomTypes.value[0]?.id : selectedRoomTypeId.value
  Object.assign(roomForm, row ? { ...row } : { id: null, roomTypeId: fallbackTypeId, roomNo: '', floor: '' })
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
  dailyRatePage.value = 1
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
  inventoryPage.value = 1
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

watch(() => route.name, () => {
  activeTab.value = resourcesMode.value ? 'rooms' : 'hotel'
  if (hotelId.value) loadAll()
})

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
.form-hint { margin-left: 10px; color: var(--el-text-color-secondary); font-size: 12px; }
.filter-row { margin: 2px 0 14px; flex-wrap: wrap; }
.table-pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
