<template>
  <div class="admin-page hotel-page">
    <div class="page-header">
      <div>
        <h2>酒店管理</h2>
        <span class="page-desc">酒店资料 / 房型房价 / 库存日历 / 预订与入住 · 原型数据</span>
      </div>
      <el-tag type="warning" effect="plain">PROTOTYPE · 2.4.0-hotel</el-tag>
    </div>

    <el-alert type="info" :closable="false" class="hotel-notice">
      <template #title>
        当前为前端原型：数据为本地 mock，不会调用酒店后端；接口接入后替换为真实数据。
      </template>
    </el-alert>

    <el-tabs v-model="activeTab" class="hotel-tabs">
      <el-tab-pane label="经营概览" name="overview">
        <div class="metric-grid">
          <div v-for="metric in metrics" :key="metric.label" class="metric-card">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small>{{ metric.hint }}</small>
          </div>
        </div>

        <div class="admin-card">
          <div class="section-head">
            <h3>今日到店 / 离店</h3>
            <el-button link type="primary" @click="refreshPrototype">刷新原型数据</el-button>
          </div>
          <el-table :data="todayBookings" border stripe>
            <el-table-column prop="bookingNo" label="预订号" width="150" />
            <el-table-column prop="guest" label="住客" width="130" />
            <el-table-column prop="roomType" label="房型" min-width="140" />
            <el-table-column prop="dates" label="入住 / 离店" min-width="180" />
            <el-table-column prop="rooms" label="客房数" width="90" align="center" />
            <el-table-column label="状态" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" align="center">
              <template #default="{ row }">
                <el-button v-if="row.status === 'ARRIVAL'" link type="primary" @click="checkIn(row)">办理入住</el-button>
                <el-button v-else-if="row.status === 'IN_HOUSE'" link type="primary" @click="checkOut(row)">办理退房</el-button>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="酒店资料" name="profile">
        <div class="admin-card">
          <div class="section-head">
            <h3>接入模式与销售入口</h3>
            <el-button type="primary" @click="savePrototype('酒店资料')">保存原型配置</el-button>
          </div>
          <el-form label-width="150px" class="hotel-form">
            <el-form-item label="接入模式">
              <el-radio-group v-model="hotel.accessMode">
                <el-radio-button value="GROUP">集团内酒店</el-radio-button>
                <el-radio-button value="SINGLE_STORE">单店酒店</el-radio-button>
              </el-radio-group>
              <span class="form-hint">集团从 OpenChat 服务中心进入；单店从休闲娱乐进入。</span>
            </el-form-item>
            <el-form-item label="销售入口">
              <el-checkbox-group v-model="hotel.entryPoints">
                <el-checkbox value="SERVICE_CENTER">OpenChat 服务中心</el-checkbox>
                <el-checkbox value="LEISURE">休闲娱乐</el-checkbox>
                <el-checkbox value="GROUP_INTERNAL">集团内部</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            <el-form-item label="酒店名称"><el-input v-model="hotel.name" /></el-form-item>
            <el-form-item label="所属集团 / 门店">
              <el-input v-model="hotel.groupName" disabled />
              <span class="form-hint">集团内酒店由集团统一建档，门店可覆盖支付与库存策略。</span>
            </el-form-item>
            <el-form-item label="地址"><el-input v-model="hotel.address" /></el-form-item>
            <el-form-item label="入住 / 离店时间">
              <el-time-picker v-model="hotel.checkInTime" placeholder="入住" format="HH:mm" />
              <span class="time-sep">—</span>
              <el-time-picker v-model="hotel.checkOutTime" placeholder="离店" format="HH:mm" />
            </el-form-item>
          </el-form>
        </div>

        <div class="admin-card">
          <div class="section-head">
            <h3>支付策略（店铺配置）</h3>
            <el-tag type="success" effect="plain">按门店生效</el-tag>
          </div>
          <el-form label-width="150px" class="hotel-form">
            <el-form-item label="支付方式">
              <el-radio-group v-model="hotel.paymentMode">
                <el-radio value="PREPAY">全额预付</el-radio>
                <el-radio value="PAY_AT_HOTEL">到店支付</el-radio>
                <el-radio value="DEPOSIT">定金 + 尾款</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="hotel.paymentMode === 'DEPOSIT'" label="定金比例">
              <el-input-number v-model="hotel.depositRatio" :min="5" :max="100" :step="5" />
              <span class="form-hint">% · 剩余尾款到店或离店结清</span>
            </el-form-item>
            <el-form-item label="币种">
              <el-select v-model="hotel.currency" style="width: 160px">
                <el-option v-for="c in currencies" :key="c.code" :label="`${c.code} · ${c.label}`" :value="c.code" />
              </el-select>
              <span class="form-hint">默认币种由租户/门店设置；切换币种不做汇率换算。</span>
            </el-form-item>
            <el-form-item label="取消政策">
              <el-select v-model="hotel.cancelPolicy" style="width: 260px">
                <el-option label="入住前 24 小时免费取消" value="24H" />
                <el-option label="入住前 48 小时免费取消" value="48H" />
                <el-option label="不可取消" value="NON_REFUNDABLE" />
              </el-select>
            </el-form-item>
            <el-form-item label="积分抵扣">
              <el-switch v-model="hotel.pointsRedeemEnabled" />
              <span class="form-hint">复用现有积分账本与支付 POINT 分腿</span>
            </el-form-item>
            <el-form-item v-if="hotel.pointsRedeemEnabled" label="积分最大抵扣">
              <el-input-number v-model="hotel.pointsMaxRatioBps" :min="0" :max="10000" :step="500" />
              <span class="form-hint">万分比 · 3000 = 最多抵扣订单金额 30%</span>
            </el-form-item>
            <el-form-item label="发票">
              <el-switch v-model="hotel.invoiceEnabled" />
              <span class="form-hint">原型占位；实际字段待财务确认。</span>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="房型与房价" name="rooms">
        <div class="admin-card">
          <div class="section-head">
            <h3>房型与房价计划</h3>
            <el-button type="primary" @click="savePrototype('新增房型')">新增房型</el-button>
          </div>
          <el-table :data="roomTypes" border stripe>
            <el-table-column prop="code" label="房型编码" width="110" />
            <el-table-column prop="name" label="房型" min-width="150" />
            <el-table-column prop="bed" label="床型" width="120" />
            <el-table-column prop="area" label="面积" width="90" />
            <el-table-column prop="maxGuests" label="可住" width="80" align="center" />
            <el-table-column prop="ratePlan" label="房价计划" min-width="140" />
            <el-table-column label="门市价" width="120" align="right">
              <template #default="{ row }">{{ formatMoneyValue(row.price) }}</template>
            </el-table-column>
            <el-table-column prop="inventory" label="今日库存" width="100" align="center" />
            <el-table-column label="操作" width="150" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="savePrototype(`编辑 ${row.name}`)">编辑</el-button>
                <el-button link type="primary" @click="savePrototype(`房价日历 ${row.name}`)">房价日历</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="库存日历" name="calendar">
        <div class="admin-card">
          <div class="section-head">
            <h3>未来 7 天库存</h3>
            <div class="head-actions">
              <el-radio-group v-model="calendarMode" size="small">
                <el-radio-button value="ROOM_TYPE">按房型</el-radio-button>
                <el-radio-button value="ROOM">按客房</el-radio-button>
              </el-radio-group>
              <el-button @click="savePrototype('批量改库存')">批量改库存</el-button>
            </div>
          </div>
          <el-table :data="calendarRows" border stripe class="calendar-table">
            <el-table-column prop="roomType" label="房型" min-width="150" fixed />
            <el-table-column v-for="day in calendarDays" :key="day.key" :label="day.label" min-width="120" align="center">
              <template #default="{ row }">
                <div class="calendar-cell">
                  <strong>余 {{ row[day.key].available }}</strong>
                  <small>总 {{ row[day.key].total }} · 售 {{ row[day.key].sold }}</small>
                  <el-switch v-model="row[day.key].stopSell" size="small" active-text="关房" />
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="预订订单" name="bookings">
        <div class="admin-card">
          <div class="section-head">
            <h3>酒店预订</h3>
            <div class="head-actions">
              <el-radio-group v-model="bookingFilter" size="small">
                <el-radio-button value="ALL">全部</el-radio-button>
                <el-radio-button value="PENDING_PAYMENT">待支付</el-radio-button>
                <el-radio-button value="CONFIRMED">已确认</el-radio-button>
                <el-radio-button value="ARRIVAL">待入住</el-radio-button>
                <el-radio-button value="IN_HOUSE">在住</el-radio-button>
              </el-radio-group>
              <el-button @click="savePrototype('导出订单')">导出</el-button>
            </div>
          </div>
          <el-table :data="filteredBookings" border stripe>
            <el-table-column prop="bookingNo" label="预订号" width="150" />
            <el-table-column prop="guest" label="住客" width="130" />
            <el-table-column prop="phone" label="手机" width="140" />
            <el-table-column prop="roomType" label="房型" min-width="140" />
            <el-table-column prop="dates" label="入住 / 离店" min-width="190" />
            <el-table-column prop="rooms" label="客房数" width="90" align="center" />
            <el-table-column label="金额" width="120" align="right">
              <template #default="{ row }">{{ formatMoneyValue(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="支付" width="120" align="center">
              <template #default="{ row }">{{ paymentText(row.paymentMode) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" align="center">
              <template #default="{ row }">
                <el-button v-if="row.status === 'ARRIVAL'" link type="primary" @click="checkIn(row)">入住</el-button>
                <el-button v-else-if="row.status === 'IN_HOUSE'" link type="primary" @click="checkOut(row)">退房</el-button>
                <el-button v-else link type="primary" @click="savePrototype(`查看 ${row.bookingNo}`)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="入住 / 退房" name="frontdesk">
        <div class="admin-card">
          <div class="section-head">
            <h3>前台工作台</h3>
            <el-tag effect="plain">今日 {{ todayBookings.length }} 条</el-tag>
          </div>
          <el-table :data="todayBookings" border stripe>
            <el-table-column prop="bookingNo" label="预订号" width="150" />
            <el-table-column prop="guest" label="住客" width="130" />
            <el-table-column prop="roomType" label="房型" min-width="140" />
            <el-table-column prop="roomNo" label="房号" width="100" align="center">
              <template #default="{ row }">{{ row.roomNo || '待分配' }}</template>
            </el-table-column>
            <el-table-column prop="dates" label="入住 / 离店" min-width="190" />
            <el-table-column label="状态" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180" align="center">
              <template #default="{ row }">
                <el-button v-if="row.status === 'ARRIVAL'" type="primary" size="small" @click="checkIn(row)">办理入住</el-button>
                <el-button v-else-if="row.status === 'IN_HOUSE'" type="success" size="small" @click="checkOut(row)">办理退房</el-button>
                <el-button v-else size="small" @click="savePrototype(`查看 ${row.bookingNo}`)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { formatMoneyValue } from '@/utils/format'
import { hotelBookingStatusText, hotelPaymentModeText } from '@/constants/terms'
import { DEFAULT_CURRENCY, currencyOptions } from '@/constants/currency'

const activeTab = ref('overview')
const calendarMode = ref('ROOM_TYPE')
const bookingFilter = ref('ALL')
const currencies = currencyOptions()

const hotel = reactive({
  accessMode: 'GROUP',
  entryPoints: ['SERVICE_CENTER', 'GROUP_INTERNAL'],
  name: 'A380 云栖酒店',
  groupName: 'A380 集团',
  address: '深圳市南山区科技南一路 A380 服务中心',
  checkInTime: new Date(2026, 0, 1, 14, 0),
  checkOutTime: new Date(2026, 0, 1, 12, 0),
  paymentMode: 'DEPOSIT',
  currency: DEFAULT_CURRENCY,
  depositRatio: 30,
  cancelPolicy: '24H',
  invoiceEnabled: true,
  pointsRedeemEnabled: true,
  pointsMaxRatioBps: 3000,
})

const metrics = [
  { label: '今日在住', value: '36', hint: '客房 36 / 可售 48' },
  { label: '今日到店', value: '12', hint: '待入住 5 · 已入住 7' },
  { label: '今日离店', value: '9', hint: '待退房 3' },
  { label: '出租率', value: '75%', hint: '近 7 天平均 71%' },
]

const roomTypes = ref([
  { code: 'DLX-K', name: '豪华大床房', bed: '1.8m 大床', area: '35㎡', maxGuests: 2, ratePlan: '含双早 · 24h 取消', price: 368, inventory: 18 },
  { code: 'TWN', name: '景观双床房', bed: '2×1.2m 单床', area: '38㎡', maxGuests: 2, ratePlan: '含双早 · 24h 取消', price: 428, inventory: 12 },
  { code: 'EXE', name: '行政套房', bed: '1.8m 大床', area: '65㎡', maxGuests: 3, ratePlan: '行政礼遇 · 48h 取消', price: 688, inventory: 6 },
])

const calendarDays = [
  { key: 'd1', label: '10-22 周四' },
  { key: 'd2', label: '10-23 周五' },
  { key: 'd3', label: '10-24 周六' },
  { key: 'd4', label: '10-25 周日' },
  { key: 'd5', label: '10-26 周一' },
  { key: 'd6', label: '10-27 周二' },
  { key: 'd7', label: '10-28 周三' },
]

const calendarRows = ref([
  { roomType: '豪华大床房', d1: { total: 20, sold: 14, available: 6, stopSell: false }, d2: { total: 20, sold: 18, available: 2, stopSell: false }, d3: { total: 20, sold: 19, available: 1, stopSell: false }, d4: { total: 20, sold: 12, available: 8, stopSell: false }, d5: { total: 20, sold: 8, available: 12, stopSell: false }, d6: { total: 20, sold: 6, available: 14, stopSell: false }, d7: { total: 20, sold: 4, available: 16, stopSell: false } },
  { roomType: '景观双床房', d1: { total: 14, sold: 10, available: 4, stopSell: false }, d2: { total: 14, sold: 12, available: 2, stopSell: false }, d3: { total: 14, sold: 14, available: 0, stopSell: true }, d4: { total: 14, sold: 9, available: 5, stopSell: false }, d5: { total: 14, sold: 5, available: 9, stopSell: false }, d6: { total: 14, sold: 3, available: 11, stopSell: false }, d7: { total: 14, sold: 2, available: 12, stopSell: false } },
  { roomType: '行政套房', d1: { total: 8, sold: 4, available: 4, stopSell: false }, d2: { total: 8, sold: 6, available: 2, stopSell: false }, d3: { total: 8, sold: 7, available: 1, stopSell: false }, d4: { total: 8, sold: 5, available: 3, stopSell: false }, d5: { total: 8, sold: 3, available: 5, stopSell: false }, d6: { total: 8, sold: 2, available: 6, stopSell: false }, d7: { total: 8, sold: 1, available: 7, stopSell: false } },
])

const bookings = ref([
  { bookingNo: 'H202610220001', guest: '王先生', phone: '138****6688', roomType: '豪华大床房', dates: '10-22 → 10-24', rooms: 1, amount: 736, paymentMode: 'DEPOSIT', status: 'ARRIVAL', roomNo: '1208' },
  { bookingNo: 'H202610220002', guest: '李女士', phone: '139****2233', roomType: '景观双床房', dates: '10-22 → 10-23', rooms: 2, amount: 856, paymentMode: 'PREPAY', status: 'IN_HOUSE', roomNo: '1506 / 1507' },
  { bookingNo: 'H202610220003', guest: '陈先生', phone: '137****9911', roomType: '行政套房', dates: '10-23 → 10-25', rooms: 1, amount: 1376, paymentMode: 'PAY_AT_HOTEL', status: 'CONFIRMED', roomNo: '' },
  { bookingNo: 'H202610220004', guest: '周女士', phone: '136****5522', roomType: '豪华大床房', dates: '10-25 → 10-26', rooms: 1, amount: 368, paymentMode: 'DEPOSIT', status: 'PENDING_PAYMENT', roomNo: '' },
])

const todayBookings = computed(() => bookings.value.filter((row) => ['ARRIVAL', 'IN_HOUSE'].includes(row.status)))
const filteredBookings = computed(() => bookingFilter.value === 'ALL'
  ? bookings.value
  : bookings.value.filter((row) => row.status === bookingFilter.value))

const statusText = hotelBookingStatusText
const paymentText = hotelPaymentModeText

function statusType(status) {
  return { PENDING_PAYMENT: 'warning', CONFIRMED: 'primary', ARRIVAL: 'warning', IN_HOUSE: 'success', CHECKED_OUT: 'info', CANCELLED: 'info', NO_SHOW: 'danger' }[status] || 'info'
}

function checkIn(row) {
  row.status = 'IN_HOUSE'
  row.roomNo = row.roomNo || `A${1200 + Math.floor(Math.random() * 80)}`
  ElMessage.success(`${row.guest} 已办理入住，房号 ${row.roomNo}`)
}

function checkOut(row) {
  row.status = 'CHECKED_OUT'
  ElMessage.success(`${row.guest} 已退房，客房进入清扫`)
}

function savePrototype(action) {
  ElMessage.success(`${action}：原型操作已记录（未写后端）`)
}

function refreshPrototype() {
  ElMessage.success('原型数据已刷新')
}
</script>

<style scoped>
.hotel-page { padding-bottom: 32px; }
.hotel-notice { margin-bottom: 12px; }
.hotel-tabs :deep(.el-tabs__header) { margin-bottom: 16px; }
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.metric-card { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 6px; }
.metric-card span { color: #909399; font-size: 13px; }
.metric-card strong { font-size: 26px; color: #303133; }
.metric-card small { color: #909399; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.section-head h3 { margin: 0; font-size: 15px; }
.head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hotel-form { max-width: 760px; }
.form-hint { margin-left: 10px; color: #909399; font-size: 12px; }
.time-sep { margin: 0 8px; color: #909399; }
.calendar-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.calendar-cell strong { color: #303133; }
.calendar-cell small { color: #909399; font-size: 11px; }
.calendar-table :deep(.el-table__cell) { padding: 8px 0; }
.muted { color: #c0c4cc; }
@media (max-width: 1000px) {
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
