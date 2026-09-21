<template>
  <div class="reservation-board-page">
    <OperationsBoard
      v-model:search="keyword"
      v-model:active-tab="timeFilter"
      v-model:active-filter="statusFilter"
      v-model:view-mode="viewMode"
      title="预约管理"
      :subtitle="`预约履约实时看板 · ${lastUpdatedText}`"
      :loading="loading"
      search-placeholder="搜索预约号 / 房型 / 包厢 / 联系人 / 订单号"
      :stats="reservationStats"
      :active-stat="statusFilter"
      :tabs="RESERVATION_TIME_TABS"
      :filters="RESERVATION_FILTERS"
      @stat-click="handleStatClick"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </template>
      <template #toolbar-left-extra>
        <!-- 预约时段（startAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59；
             本看板没有「查询」按钮，选完即按区间重新拉取。 -->
        <DateRangeFilter v-model="range" @change="load" @clear="load" />
        <span v-if="priceText" class="price-hint">房型价格：{{ priceText }}</span>
        <!-- 营业时间与创建校验同源：预约到店时间必须在此时段内（18:00 可约、05:00 已打烊）。 -->
        <el-tooltip v-if="businessHours" content="预约到店时间必须落在营业时段内，越界的预约会在卡片上标注" placement="top">
          <span class="hours-hint">营业时间：{{ businessHours.displayText }}</span>
        </el-tooltip>
      </template>

      <div v-if="filteredRows.length" class="reservation-grid" :class="{ 'list-mode': viewMode === 'list' }">
        <article
          v-for="reservation in filteredRows"
          :key="reservation.id || reservation.reservationNo"
          class="reservation-card"
          :class="reservationStatusClass(reservation.status)"
          @click="openReservationDetail(reservation)"
        >
          <div class="reservation-card-head">
            <span class="reservation-icon"><el-icon><Calendar /></el-icon></span>
            <div class="reservation-title">
              <strong>{{ reservationRoomTypeText(reservation) }}</strong>
              <span :title="reservation.reservationNo">{{ reservation.reservationNo || '暂无预约号' }}</span>
            </div>
            <span class="reservation-status">{{ reservationStatusText(reservation.status) }}</span>
          </div>

          <div class="arrival-time">
            <span>预计到店时间</span>
            <strong>{{ formatTime(reservation.startAt) }}</strong>
            <!-- 越界标记：预约到店时间不在当前营业时段内（多为规则上线前的历史预约，或之后改过营业时间）。
                 服务端只在**创建**时校验，因此存量数据必须能被看出来，而不是默默藏着。 -->
            <el-tooltip
              v-if="isOutOfBusinessHours(reservation)"
              content="该预约的到店时间不在当前营业时段内（历史预约或营业时间已调整），请与客人确认改期"
              placement="top"
            >
              <el-tag size="small" type="warning" effect="plain">非营业时段</el-tag>
            </el-tooltip>
          </div>

          <div class="reservation-meta">
            <div><span>创建时间</span><b>{{ formatTime(reservation.createdAt) }}</b></div>
            <!-- 到店时间 = 真实到店时间（arrived_at）：只有「到店登记」或「到店开台」才写值 -->
            <div><span>到店时间</span><b>{{ reservation.arrivedAt ? formatTime(reservation.arrivedAt) : '—' }}</b></div>
            <div><span>联系人</span><b>{{ reservation.contact || '—' }}</b></div>
            <div><span>到店人数</span><b>{{ reservation.partySize != null ? reservation.partySize + ' 人' : '—' }}</b></div>
            <div><span>具体包厢</span><b>{{ reservationRoomText(reservation, resourceNames[reservation.resourceId]) }}</b></div>
            <div><span>房型价格</span><b>{{ priceShort || '以结算账单为准' }}</b></div>
            <div><span>关联订单</span><b>{{ reservation.orderId ? '#' + reservation.orderId : '暂未生成' }}</b></div>
          </div>

          <div class="reservation-actions">
            <el-button v-if="reservation.status === 'PENDING'" size="small" type="primary" :loading="isSubmitting(reservation)" :disabled="isSubmitting(reservation)" @click.stop="confirm(reservation)">确认预约</el-button>
            <el-button v-if="reservation.status === 'CONFIRMED'" size="small" type="success" :loading="isSubmitting(reservation)" :disabled="isSubmitting(reservation)" @click.stop="arrival(reservation)">确认到店</el-button>
            <el-tooltip
              v-if="canAssignReservation && canAssignRoom(reservation)"
              :disabled="!isHistoricalReservation(reservation)"
              content="历史预约未记录房型，无法分配包厢；可直接按原包厢开台"
              placement="top"
            >
              <span class="action-tip">
                <el-button size="small" type="warning" plain :loading="isSubmitting(reservation)" :disabled="isSubmitting(reservation) || isHistoricalReservation(reservation)" @click.stop="openAssignDialog(reservation)">分配包厢</el-button>
              </span>
            </el-tooltip>
            <!--
              开台：已到店，或已确认且已分配包厢（后端 open-table 对 CONFIRMED 会隐含登记到店时间）。
              未分配包厢时禁用并提示（后端 409 RESERVATION_ROOM_NOT_ASSIGNED 兜底）。
            -->
            <el-tooltip v-if="canOpenTableAction(reservation)" :disabled="canOpenTable(reservation)" content="请先分配包厢" placement="top">
              <span class="action-tip">
                <el-button size="small" type="primary" :loading="isSubmitting(reservation)" :disabled="isSubmitting(reservation) || !canOpenTable(reservation)" @click.stop="openTable(reservation)">开台生成订单</el-button>
              </span>
            </el-tooltip>
            <!-- 未到店：已过预约开始时间仍未到店，标记 NO_SHOW 释放包厢预约位（此前该状态没有任何入口） -->
            <el-button v-if="canMarkNoShow(reservation)" size="small" plain :loading="isSubmitting(reservation)" :disabled="isSubmitting(reservation)" @click.stop="markNoShow(reservation)">未到店</el-button>
            <el-button v-if="canCancelReservation && (reservation.status === 'PENDING' || reservation.status === 'CONFIRMED')" size="small" type="danger" plain :disabled="isSubmitting(reservation)" @click.stop="cancel(reservation)">取消</el-button>
            <el-button v-if="reservation.orderId" size="small" @click.stop="viewOrder(reservation.orderId)">查看订单</el-button>
            <el-button size="small" @click.stop="openReservationDetail(reservation)">详情</el-button>
          </div>
        </article>
      </div>
      <el-empty v-else :description="reservationEmptyText" :image-size="96" />
    </OperationsBoard>

    <el-drawer v-model="detailVisible" size="420px" class="reservation-detail-drawer">
      <template #header>
        <div v-if="detailReservation" class="drawer-title">
          <div>
            <h3>{{ reservationRoomTypeText(detailReservation) }}</h3>
            <p>{{ detailReservation.reservationNo || '暂无预约号' }}</p>
          </div>
          <span class="reservation-status" :class="reservationStatusClass(detailReservation.status)">{{ reservationStatusText(detailReservation.status) }}</span>
        </div>
      </template>
      <div v-if="detailReservation" class="reservation-detail">
        <div class="detail-arrival" :class="reservationStatusClass(detailReservation.status)">
          <span>预计到店时间</span>
          <strong>{{ formatTime(detailReservation.startAt) }}</strong>
          <small>{{ detailReservation.partySize != null ? detailReservation.partySize + ' 人到店' : '人数待确认' }}</small>
        </div>
        <div class="detail-grid">
          <div><span>联系人</span><b>{{ detailReservation.contact || '—' }}</b></div>
          <div><span>预约状态</span><b>{{ reservationStatusText(detailReservation.status) }}</b></div>
          <div><span>创建时间</span><b>{{ formatTime(detailReservation.createdAt) }}</b></div>
          <div><span>到店时间</span><b>{{ detailReservation.arrivedAt ? formatTime(detailReservation.arrivedAt) : '—' }}</b></div>
          <div><span>预约房型</span><b>{{ reservationRoomTypeText(detailReservation) }}</b></div>
          <div><span>具体包厢</span><b>{{ reservationRoomText(detailReservation, resourceNames[detailReservation.resourceId]) }}</b></div>
          <div><span>房型价格</span><b>{{ priceShort || '以结算账单为准' }}</b></div>
          <div class="detail-wide"><span>预约号</span><b>{{ detailReservation.reservationNo || '—' }}</b></div>
          <div class="detail-wide"><span>关联订单</span><b>{{ detailReservation.orderId ? '#' + detailReservation.orderId : '暂未生成' }}</b></div>
        </div>
      </div>
      <template #footer>
        <div v-if="detailReservation" class="drawer-actions">
          <el-button v-if="detailReservation.status === 'PENDING'" type="primary" :loading="isSubmitting(detailReservation)" @click="confirm(detailReservation)">确认预约</el-button>
          <el-button v-if="detailReservation.status === 'CONFIRMED'" type="success" :loading="isSubmitting(detailReservation)" @click="arrival(detailReservation)">确认到店</el-button>
          <el-tooltip
            v-if="canAssignReservation && canAssignRoom(detailReservation)"
            :disabled="!isHistoricalReservation(detailReservation)"
            content="历史预约未记录房型，无法分配包厢；可直接按原包厢开台"
            placement="top"
          >
            <span class="action-tip">
              <el-button type="warning" plain :loading="isSubmitting(detailReservation)" :disabled="isSubmitting(detailReservation) || isHistoricalReservation(detailReservation)" @click="openAssignDialog(detailReservation)">分配包厢</el-button>
            </span>
          </el-tooltip>
          <el-tooltip v-if="canOpenTableAction(detailReservation)" :disabled="canOpenTable(detailReservation)" content="请先分配包厢" placement="top">
            <span class="action-tip">
              <el-button type="primary" :loading="isSubmitting(detailReservation)" :disabled="isSubmitting(detailReservation) || !canOpenTable(detailReservation)" @click="openTable(detailReservation)">开台生成订单</el-button>
            </span>
          </el-tooltip>
          <el-button v-if="canMarkNoShow(detailReservation)" plain :loading="isSubmitting(detailReservation)" :disabled="isSubmitting(detailReservation)" @click="markNoShow(detailReservation)">未到店</el-button>
          <el-button v-if="canCancelReservation && (detailReservation.status === 'PENDING' || detailReservation.status === 'CONFIRMED')" type="danger" plain :disabled="isSubmitting(detailReservation)" @click="cancel(detailReservation)">取消预约</el-button>
          <el-button v-if="detailReservation.orderId" @click="viewOrder(detailReservation.orderId)">查看订单</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 到店分配包厢：只列出该预约房型下「启用 + 非清洁中 + 无占用（使用中/已预订）」的包厢。 -->
    <el-dialog v-model="assignDialogVisible" title="到店分配包厢" width="480px" :close-on-click-modal="false" @closed="resetAssignForm">
      <div v-if="assignTarget" class="assign-summary">
        <p><span>预约号</span>{{ assignTarget.reservationNo }}</p>
        <p><span>预约房型</span>{{ reservationRoomTypeText(assignTarget) }}</p>
        <p><span>预约时段</span>{{ formatTime(assignTarget.startAt) }} – {{ formatTime(assignTarget.endAt) }}</p>
      </div>
      <el-select
        v-model="assignResourceId"
        placeholder="选择该房型下本时段可分配的包厢"
        style="width: 100%"
        filterable
        :loading="assignRoomsLoading"
      >
        <el-option v-for="room in assignableRooms" :key="room.resourceId" :label="roomDisplayName(room)" :value="room.resourceId" />
      </el-select>
      <p class="assign-hint">
        只列出该时段真正能分配的包厢：使用中、清洁中、停用维护中的包厢，以及
        <b>本时段已被其它预约占用</b>的包厢都不会出现在这里（预约不写资源占用，所以光看房态看不出时段冲突）；
        提交时后端会按房态与时段再校验一次。
      </p>
      <p v-if="!assignRoomsLoading && excludedRoomSummary" class="assign-excluded">已排除不可分配的包厢：{{ excludedRoomSummary }}</p>
      <p v-if="!assignRoomsLoading && !assignableRooms.length" class="assign-empty">
        该房型在本时段暂无可分配包厢，请改选其它时段 / 房型，或等待清洁完成、释放占用后重试。
      </p>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="assignSubmitting" :disabled="assignResourceId === null" @click="submitAssign">确认分配</el-button>
      </template>
    </el-dialog>
    <!-- 取消预约：应用内弹窗（原因必填），不用 ElMessageBox.prompt（真机上不响应且残留节点） -->
    <CancelReasonDialog
      v-model="cancelDialogVisible"
      title="取消预约"
      :loading="cancelSubmitting"
      :message="cancelDialogMessage"
      @confirm="submitCancelReservation"
    />

  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, CircleCheck, CircleClose, Clock, Grid, Refresh, Tickets, Timer } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import OperationsBoard from '@/components/OperationsBoard.vue'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import CancelReasonDialog from '@/components/CancelReasonDialog.vue'
import { getReservations, confirmReservation, arrivalReservation, cancelReservation, openTableReservation, assignRoomReservation, noShowReservation, getAssignableRooms } from '@/api/reservation'
import { listResources } from '@/api/resource'
import { getKtvPricing } from '@/api/order'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { formatMoney, formatTime, formatTimeWithSeconds } from '@/utils/format'
import { billingUnitShortText, reservationStatusText } from '@/constants/terms'
import { notifyAdminRequestError, notifyCancelRequestError } from '@/utils/adminErrorMessage'
import { submitCancelWithReason, CANCEL_REASON_MAX_LENGTH } from '@/utils/cancelAction'
import { hasPermissionOrMissing } from '@/utils/context'
import {
  assignableRoomOptions,
  canAssignRoom,
  canMarkNoShow,
  canOpenTable,
  canOpenTableAction,
  isHistoricalReservation,
  reservationRoomText,
  reservationRoomTypeText,
  roomDisplayName,
  submitAssignRoom,
  summarizeUnavailableRooms,
} from '@/utils/reservationRoom'
import { getBusinessHours } from '@/api/admin'
import { isWithinBusinessHours, parseBusinessHours, timeOfStoreDateTime } from '@/utils/businessHours'
import { useContextStore } from '@/stores/context'

const router = useRouter()
const contextStore = useContextStore()

/**
 * 取消预约的权限门禁：与后端 `POST /admin/reservations/{id}/cancel` 要求的权限码同码
 * （见 platform-admin-service 的 AuditActionResolver 与 iam 权限种子 reservation.cancel）。
 * 快照缺失时不隐藏按钮，越权仍由后端 403 兜底。
 */
const RESERVATION_CANCEL_PERMISSION = 'reservation.cancel'
const canCancelReservation = computed(() => hasPermissionOrMissing(contextStore.current?.permissions, RESERVATION_CANCEL_PERMISSION))

/**
 * 分配包厢的权限门禁：与后端同码。order 域 `assign-room` 复用 `reservation.arrival`
 * （「到店登记」同权限域，见 ReservationController 注释），因此与本页既有预约操作同一套权限，
 * 不新增孤立权限码；快照缺失时不隐藏按钮，越权仍由后端 403 兜底。
 */
const RESERVATION_ARRIVAL_PERMISSION = 'reservation.arrival'
const canAssignReservation = computed(() => hasPermissionOrMissing(contextStore.current?.permissions, RESERVATION_ARRIVAL_PERMISSION))

const rows = ref([])
const loading = ref(false)
const keyword = ref('')
/** 时间区间（预约时段 startAt）：本看板查询条件不是 reactive 对象，区间单独一个 ref。 */
const range = ref(emptyDateRange())
const statusFilter = ref('all')
const timeFilter = ref('all')
const viewMode = ref('grid')
const lastUpdatedAt = ref(null)
const detailVisible = ref(false)
const detailReservation = ref(null)
const submittingIds = ref(new Set())
const resources = ref([])

const RESERVATION_TIME_TABS = [
  { value: 'all', label: '全部预约' },
  { value: 'today', label: '今日到店' },
  { value: 'upcoming', label: '未来预约' },
]

const RESERVATION_FILTERS = [
  { value: 'all', label: '全部', dot: false },
  { value: 'PENDING', label: '待确认', tone: 'pending' },
  { value: 'CONFIRMED', label: '已确认', tone: 'reserved' },
  { value: 'ARRIVED', label: '已到店', tone: 'succeeded' },
  { value: 'CONVERTED', label: '已开台', tone: 'amount' },
  { value: 'NO_SHOW', label: '未到店', tone: 'cancelled' },
  { value: 'CANCELLED', label: '已取消', tone: 'cancelled' },
]
/** 包厢价格：与后台「计价方案」同源（/business/ktv/pricing）。 */
const ktvPricing = ref(null)

/** 分配包厢弹窗状态。 */
const assignDialogVisible = ref(false)
const assignTarget = ref(null)
const assignResourceId = ref(null)
const assignRooms = ref([])
const assignRoomsLoading = ref(false)
const assignSubmitting = ref(false)
/**
 * 服务端返回的**全部候选**（含不可分配的与原因）。候选由
 * `GET /admin/reservations/{id}/assignable-rooms` 一次算完：房态运行态 + 本预约时段的预约冲突。
 */
const assignCandidates = ref([])

/**
 * 价格文案统一由**前端**按当前币种重算（§5.8：不再渲染后端 displayText）。
 * 后端 displayText 是服务端按自己的币种拼好的字符串，直接渲染会在同一页出现两种符号；
 * 这里只取数值字段走 formatMoney，页面因此只有「符号 + 金额」一种来源，且随币种响应式更新。
 */
function roomPriceLine(pricing) {
  if (!pricing) return ''
  const unit = billingUnitShortText(pricing.billingUnit)
  const room = formatMoney(pricing.roomUnitPrice ?? 0, pricing.currencyCode) + '/' + unit
  const server = Number(pricing.serverUnitPrice || 0)
  return server > 0
    ? `房型 ${room} + 服务 ${formatMoney(server, pricing.currencyCode)}/${unit}`
    : room
}

const priceText = computed(() => roomPriceLine(ktvPricing.value))
const priceShort = computed(() => roomPriceLine(ktvPricing.value))

const resourceNames = computed(() => Object.fromEntries(resources.value.map((resource) => [resource.id, resource.name || resource.resourceCode])))

/** 被排除的不可分配候选（使用中/清洁中/停用/本时段已被其它预约占用）按原因汇总。 */
const excludedRoomSummary = computed(() => summarizeUnavailableRooms(assignCandidates.value)
  .map(({ reason, count }) => `${reason} ${count} 间`)
  .join('、'))

const filteredRows = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  const { todayStart, tomorrowStart } = currentDayRange()
  return rows.value.filter((reservation) => {
    if (statusFilter.value !== 'all' && reservation.status !== statusFilter.value) return false
    const startAt = new Date(reservation.startAt).getTime()
    if (timeFilter.value === 'today' && !(startAt >= todayStart && startAt < tomorrowStart)) return false
    if (timeFilter.value === 'upcoming' && !(startAt >= tomorrowStart)) return false
    if (!search) return true
    return [
      reservation.reservationNo,
      reservationRoomTypeText(reservation),
      reservationRoomText(reservation, resourceNames.value[reservation.resourceId]),
      reservation.contact,
      reservation.orderId,
      reservation.status,
      reservationStatusText(reservation.status),
    ].filter((value) => value != null).some((value) => String(value).toLowerCase().includes(search))
  })
})

const reservationSummary = computed(() => {
  const summary = { total: rows.value.length, today: 0, pending: 0, confirmed: 0, arrived: 0, converted: 0, cancelled: 0 }
  const { todayStart, tomorrowStart } = currentDayRange()
  rows.value.forEach((reservation) => {
    const startAt = new Date(reservation.startAt).getTime()
    if (startAt >= todayStart && startAt < tomorrowStart) summary.today += 1
    if (reservation.status === 'PENDING') summary.pending += 1
    else if (reservation.status === 'CONFIRMED') summary.confirmed += 1
    else if (reservation.status === 'ARRIVED') summary.arrived += 1
    else if (reservation.status === 'CONVERTED') summary.converted += 1
    else if (reservation.status === 'CANCELLED') summary.cancelled += 1
  })
  return summary
})

const reservationStats = computed(() => [
  { key: 'all', label: '全部预约', value: reservationSummary.value.total, suffix: '单', icon: Grid, tone: 'total', filterValue: 'all' },
  { key: 'today', label: '今日到店', value: reservationSummary.value.today, suffix: '单', icon: Calendar, tone: 'reserved', timeFilter: 'today' },
  { key: 'pending', label: '待确认', value: reservationSummary.value.pending, suffix: '单', icon: Clock, tone: 'pending', filterValue: 'PENDING' },
  { key: 'confirmed', label: '已确认', value: reservationSummary.value.confirmed, suffix: '单', icon: CircleCheck, tone: 'reserved', filterValue: 'CONFIRMED' },
  { key: 'arrived', label: '已到店', value: reservationSummary.value.arrived, suffix: '单', icon: Timer, tone: 'succeeded', filterValue: 'ARRIVED' },
  { key: 'converted', label: '已开台', value: reservationSummary.value.converted, suffix: '单', icon: Tickets, tone: 'amount', filterValue: 'CONVERTED' },
  { key: 'cancelled', label: '已取消', value: reservationSummary.value.cancelled, suffix: '单', icon: CircleClose, tone: 'cancelled', filterValue: 'CANCELLED' },
])

const lastUpdatedText = computed(() => lastUpdatedAt.value ? `最后同步 ${formatTimeWithSeconds(lastUpdatedAt.value)}` : '等待首次同步')
const reservationEmptyText = computed(() => rows.value.length ? '没有符合当前筛选条件的预约单' : '暂无预约单')

// 预约状态词表来自 constants/terms（未知状态保留服务端原值，不臆造）。
/** 可选包厢 = 服务端候选里 assignable=true 的那些（前端不做可用性二次判断）。 */
const assignableRooms = computed(() => assignableRoomOptions(assignCandidates.value))

/**
 * 生效营业时间：与「预约到店时间必须在营业时段内」的服务端校验**同源**
 * （`GET /admin/tenant/business-hours`，门店级覆盖租户默认，缺省 18:00–次日 05:00）。
 * 读不到就用缺省值展示：不因为一次读失败让页面失去营业时间提示。
 */
const businessHours = ref(parseBusinessHours(null))

/** 该预约的到店时间是否落在营业时段之外（历史预约/营业时间调整后的存量数据）。 */
function isOutOfBusinessHours(row) {
  const time = timeOfStoreDateTime(row && row.startAt)
  if (!time) return false
  return !isWithinBusinessHours(time, businessHours.value)
}

async function loadBusinessHours() {
  try {
    businessHours.value = parseBusinessHours(await getBusinessHours(contextStore.storeId))
  } catch (e) {
    businessHours.value = parseBusinessHours(null)
  }
}

/** 后端列表接口既可能直接返回数组，也可能包一层 items（各服务历史口径不一）。 */
function asList(data) {
  return Array.isArray(data) ? data : (data && data.items) || []
}

function currentDayRange() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return { todayStart: today.getTime(), tomorrowStart: tomorrow.getTime() }
}

function reservationStatusClass(status) {
  if (status === 'PENDING') return 'pending'
  if (status === 'CONFIRMED') return 'confirmed'
  if (status === 'ARRIVED') return 'arrived'
  if (status === 'CONVERTED') return 'converted'
  if (status === 'NO_SHOW') return 'cancelled'
  if (status === 'CANCELLED') return 'cancelled'
  return 'unknown'
}

function handleStatClick(stat) {
  if (stat.timeFilter) {
    statusFilter.value = 'all'
    timeFilter.value = stat.timeFilter
  } else if (stat.filterValue != null) {
    timeFilter.value = 'all'
  }
}

function openReservationDetail(reservation) {
  detailReservation.value = reservation
  detailVisible.value = true
}

function isSubmitting(row) {
  return submittingIds.value.has(row.id)
}

function setSubmitting(id, submitting) {
  const ids = new Set(submittingIds.value)
  if (submitting) ids.add(id)
  else ids.delete(id)
  submittingIds.value = ids
}

function isDialogDismissed(error) {
  return error === 'cancel' || error === 'close' || error === 'confirm'
}

async function load() {
  // 本看板没有「查询」按钮，守卫放在加载入口：区间倒挂时只提示、不发请求。
  const warning = dateRangeWarning(range.value)
  if (warning) { ElMessage.warning(warning); return }
  loading.value = true
  try {
    const [data, resourceResult] = await Promise.all([
      getReservations({ ...dateRangeParams(range.value) }),
      listResources({ resourceType: 'KTV_ROOM' }).catch(() => null),
      getKtvPricing().then((pricing) => { ktvPricing.value = pricing }).catch(() => { ktvPricing.value = null }),
    ])
    rows.value = asList(data)
    resources.value = asList(resourceResult)
    lastUpdatedAt.value = new Date()
    if (detailReservation.value) {
      detailReservation.value = rows.value.find((reservation) => reservation.id === detailReservation.value.id) || null
      if (!detailReservation.value) detailVisible.value = false
    }
  } catch (e) {
    rows.value = []
    resources.value = []
    notifyAdminRequestError(e, '加载预约列表失败')
  } finally {
    loading.value = false
  }
}

async function confirm(row) {
  try {
    await ElMessageBox.confirm('确认该预约？', '提示')
    setSubmitting(row.id, true)
    await confirmReservation(row.id, row.version)
    ElMessage.success('已确认预约')
    await load()
  } catch (e) {
    if (!isDialogDismissed(e)) { notifyAdminRequestError(e, '确认预约失败'); await load() }
  } finally {
    setSubmitting(row.id, false)
  }
}
async function arrival(row) {
  try {
    await ElMessageBox.confirm('确认客户已到店？', '提示')
    setSubmitting(row.id, true)
    await arrivalReservation(row.id)
    ElMessage.success('已标记到店')
    await load()
  } catch (e) {
    if (!isDialogDismissed(e)) { notifyAdminRequestError(e, '标记到店失败'); await load() }
  } finally {
    setSubmitting(row.id, false)
  }
}
/**
 * 取消预约：原因**必填**（后端 reason 必填，空白 → 400 CANCEL_REASON_REQUIRED）。
 * 弹窗内先拦住空白/超长；提交前再用 submitCancelWithReason 兜一次，
 * 校验不过只提示、绝不发出取消请求。
 *
 * 不用 ElMessageBox.prompt：真机上该弹窗点「确认取消」既不关闭也不报错、更不发请求，
 * 每次还往 body 里留一个不可交互的残留节点（运营点到的是上一轮的死弹窗，表现为「没反应」）。
 */
const cancelDialogVisible = ref(false)
const cancelTarget = ref(null)
const cancelSubmitting = ref(false)
const cancelDialogMessage = '请填写取消原因（必填，最多 ' + CANCEL_REASON_MAX_LENGTH + ' 个字符）：'

function cancel(row) {
  if (!row?.id) {
    // 与订单页同一口径：没有 ID 就不发注定 400 的请求，也不能静默返回。
    ElMessage.error('预约信息不完整，请刷新后重试')
    return
  }
  cancelTarget.value = row
  cancelDialogVisible.value = true
}

/** 提交取消预约（CancelReasonDialog 的 confirm，reason 已去空白且非空）。 */
async function submitCancelReservation(reason) {
  const row = cancelTarget.value
  if (!row?.id) return
  cancelSubmitting.value = true
  setSubmitting(row.id, true)
  try {
    const result = await submitCancelWithReason(reason, (normalized) => cancelReservation(row.id, normalized))
    if (!result.ok) {
      ElMessage.warning(result.message)
      return
    }
    cancelDialogVisible.value = false
    cancelTarget.value = null
    ElMessage.success('已取消预约')
    await load()
  } catch (e) {
    notifyCancelRequestError(e, '取消预约失败')
    await load()
  } finally {
    cancelSubmitting.value = false
    setSubmitting(row.id, false)
  }
}

/**
 * 打开「分配包厢」弹窗：候选**现取**，且由服务端算好可分配性与原因。
 *
 * <p>此前前端自己把「管理端资源列表」与「业务资源运行态」合并后过滤：只要 `/business/resources`
 * 读失败就被 `.catch(() => [])` 吞掉，合并结果失去运行态 → **使用中/已被预约的包厢也会列出来**，
 * 运营选中后只能被后端 409 拒绝；而且预约本身就**不写资源占用**，光看房态永远看不到
 * 「这个时段已被别的预约锁了」。现在候选、原因、当前分配都由 order 域一次算完
 * （`GET /admin/reservations/{id}/assignable-rooms`），页面只负责渲染。
 */
async function openAssignDialog(row) {
  assignTarget.value = row
  assignResourceId.value = null
  assignRooms.value = []
  assignCandidates.value = []
  assignDialogVisible.value = true
  assignRoomsLoading.value = true
  try {
    const candidates = await getAssignableRooms(row.id)
    assignCandidates.value = asList(candidates)
    assignRooms.value = assignCandidates.value
  } catch (e) {
    assignCandidates.value = []
    assignRooms.value = []
    notifyAdminRequestError(e, '加载可分配包厢失败')
  } finally {
    assignRoomsLoading.value = false
  }
}

function resetAssignForm() {
  assignTarget.value = null
  assignResourceId.value = null
  assignRooms.value = []
  assignCandidates.value = []
}

/**
 * 提交分配：先 override=false；只有后端明确 409 RESERVATION_ROOM_ASSIGNED（换包厢）时，
 * 才二次确认并带 override=true 重试（编排见 utils/reservationRoom 的 submitAssignRoom）。
 * 其余错误码（房型/门店不符、包厢不可用、房态服务不可用…）一律走中文映射提示。
 */
async function submitAssign() {
  const row = assignTarget.value
  if (!row || assignResourceId.value === null) return
  assignSubmitting.value = true
  setSubmitting(row.id, true)
  try {
    const result = await submitAssignRoom(assignResourceId.value, {
      submit: (resourceId, override) => assignRoomReservation(row.id, resourceId, override),
      confirmOverride: () => ElMessageBox.confirm(
        '该预约已分配包厢。确认改派到所选包厢？改派会覆盖原包厢并记录操作日志。',
        '换包厢确认',
        { confirmButtonText: '覆盖分配', cancelButtonText: '返回', type: 'warning' },
      ),
    })
    ElMessage.success(result.overridden ? '已改派包厢' : '已分配包厢')
    assignDialogVisible.value = false
    await load()
  } catch (e) {
    if (!isDialogDismissed(e)) { notifyAdminRequestError(e, '分配包厢失败'); await load() }
  } finally {
    assignSubmitting.value = false
    setSubmitting(row.id, false)
  }
}

async function openTable(row) {
  try {
    // CONFIRMED 开台 = 客人到了直接开台：后端会同时登记真实到店时间（arrived_at），提示语要说清楚。
    const message = row.status === 'CONFIRMED'
      ? '确认客人已到店并开台？开台后将登记到店时间、生成订单并开始计时。'
      : '确认开台？开台后将生成订单并开始计时，可在「订单/KTV」继续点单/结台/收银。'
    await ElMessageBox.confirm(message, '预约履约开台')
    setSubmitting(row.id, true)
    const order = await openTableReservation(row.id)
    ElMessage.success('已开台，正在跳转到关联订单')
    viewOrder(order.id)
  } catch (e) {
    if (!isDialogDismissed(e)) { notifyAdminRequestError(e, '开台失败'); await load() }
  } finally {
    setSubmitting(row.id, false)
  }
}

/**
 * 标记未到店：客户过了预约时间仍未到店 → NO_SHOW（不再占着这个包厢的预约位）。
 * 预约本身不占资源占用，这里只改预约状态；包厢当前是否可用仍以房态为准。
 */
async function markNoShow(row) {
  try {
    await ElMessageBox.confirm(
      '确认客户未到店？该预约将标记为「未到店」，不再占用包厢的预约位。',
      '标记未到店',
      { confirmButtonText: '标记未到店', cancelButtonText: '返回', type: 'warning' },
    )
    setSubmitting(row.id, true)
    await noShowReservation(row.id)
    ElMessage.success('已标记未到店')
    detailVisible.value = false
    await load()
  } catch (e) {
    if (!isDialogDismissed(e)) { notifyAdminRequestError(e, '标记未到店失败'); await load() }
  } finally {
    setSubmitting(row.id, false)
  }
}

function viewOrder(orderId) {
  router.push({ name: 'Orders', query: { orderId: String(orderId) } })
}

onMounted(() => {
  load()
  loadBusinessHours()
})
</script>

<style scoped>
.reservation-board-page {
  --reservation-green: #21a876;
  --reservation-red: #e2545f;
  --reservation-orange: #e98a2d;
  --reservation-blue: #3478f6;
  --reservation-purple: #7658c9;
}
.reservation-grid {
  padding: 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(245px, 1fr));
  gap: 20px;
  background: #fafbfc;
}
.reservation-card {
  min-width: 0;
  min-height: 264px;
  padding: 16px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 11px;
  background: var(--el-bg-color);
  box-shadow: 0 2px 8px rgba(34, 42, 62, .035);
  cursor: pointer;
  transition: transform .18s, box-shadow .18s, border-color .18s;
}
.reservation-card::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: #aeb7c5; }
.reservation-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(31, 44, 74, .1); }
.reservation-card.pending::before { background: var(--reservation-orange); }
.reservation-card.confirmed::before { background: var(--reservation-blue); }
.reservation-card.arrived::before { background: var(--reservation-green); }
.reservation-card.converted::before { background: var(--reservation-purple); }
.reservation-card.cancelled::before { background: #9aa2af; }
.reservation-card.pending { border-color: #f1dec6; background: linear-gradient(145deg, #fff 0%, #fff 72%, #fff9f1 100%); }
.reservation-card.confirmed { border-color: #d6e2f7; background: linear-gradient(145deg, #fff 0%, #fff 72%, #f4f8ff 100%); }
.reservation-card.arrived { border-color: #d8ece5; background: linear-gradient(145deg, #fff 0%, #fff 72%, #f4fbf8 100%); }
.reservation-card.converted { border-color: #e1d9f4; background: linear-gradient(145deg, #fff 0%, #fff 72%, #f8f5ff 100%); }
.reservation-card.cancelled { opacity: .82; }

.reservation-card-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 17px; }
.reservation-icon { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 9px; color: var(--reservation-blue); background: #edf3ff; font-size: 19px; }
.reservation-title { min-width: 0; flex: 1; }
.reservation-title strong { display: block; overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.reservation-title span { display: block; margin-top: 5px; overflow: hidden; color: var(--el-text-color-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.reservation-status { flex: none; padding: 4px 8px; border-radius: 13px; color: #68707e; background: #f0f2f5; font-size: 11px; font-weight: 600; }
.pending .reservation-status,
.reservation-status.pending { color: #c76b10; background: #fff0dc; }
.confirmed .reservation-status,
.reservation-status.confirmed { color: #2866c9; background: #e9f1ff; }
.arrived .reservation-status,
.reservation-status.arrived { color: #16895f; background: #eaf8f2; }
.converted .reservation-status,
.reservation-status.converted { color: #6848bb; background: #eee8ff; }
.cancelled .reservation-status,
.reservation-status.cancelled { color: #68707e; background: #eceff3; }

.arrival-time { margin-bottom: 13px; }
.arrival-time span { display: block; margin-bottom: 4px; color: var(--el-text-color-placeholder); font-size: 11px; }
.arrival-time strong { color: #2f5f9f; font-size: 20px; line-height: 1.25; font-variant-numeric: tabular-nums; }
/* 越界标记跟在时间后面（不换行、不挤压时间数字） */
.arrival-time .el-tag { margin-left: 8px; vertical-align: middle; }
/* 营业时间提示（工具栏） */
.hours-hint { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.pending .arrival-time strong { color: #d97819; }
.arrived .arrival-time strong { color: #16895f; }
.converted .arrival-time strong { color: #6848bb; }
.reservation-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; padding: 11px 0; border-top: 1px dashed var(--el-border-color); }
.reservation-meta div { min-width: 0; display: flex; gap: 5px; font-size: 11px; }
.reservation-meta span { flex: none; color: var(--el-text-color-placeholder); }
.reservation-meta b { min-width: 0; overflow: hidden; color: var(--el-text-color-regular); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.reservation-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; padding-top: 8px; }
.reservation-actions > .el-button { flex: 1; min-width: 74px; margin-left: 0; }

.reservation-grid.list-mode { grid-template-columns: 1fr; }
.reservation-grid.list-mode .reservation-card { min-height: auto; display: grid; grid-template-columns: minmax(230px, .9fr) minmax(190px, .7fr) minmax(280px, 1.1fr) minmax(250px, 1fr); align-items: center; gap: 22px; }
.reservation-grid.list-mode .reservation-card-head,
.reservation-grid.list-mode .arrival-time { margin: 0; }
.reservation-grid.list-mode .reservation-meta { padding: 0; border: 0; }
.reservation-grid.list-mode .reservation-actions { margin: 0; padding: 0; }

.drawer-title { width: 100%; padding-right: 8px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.drawer-title h3 { margin: 0; color: var(--el-text-color-primary); font-size: 20px; }
.drawer-title p { max-width: 275px; margin: 5px 0 0; overflow: hidden; color: var(--el-text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.detail-arrival { margin-bottom: 18px; padding: 20px; border-radius: 12px; color: #fff; background: linear-gradient(135deg, #64748b, #334155); }
.detail-arrival.pending { background: linear-gradient(135deg, #f0a14f, #cf741a); }
.detail-arrival.confirmed { background: linear-gradient(135deg, #5a94f8, #316bcf); }
.detail-arrival.arrived { background: linear-gradient(135deg, #3fbe91, #18855f); }
.detail-arrival.converted { background: linear-gradient(135deg, #8f75d7, #6547b6); }
.detail-arrival span { display: block; opacity: .82; font-size: 11px; }
.detail-arrival strong { display: block; margin-top: 6px; font-size: 24px; }
.detail-arrival small { display: block; margin-top: 7px; opacity: .82; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--el-border-color-lighter); border-radius: 9px; overflow: hidden; }
.detail-grid > div { min-width: 0; padding: 12px; border-right: 1px solid var(--el-border-color-lighter); border-bottom: 1px solid var(--el-border-color-lighter); }
.detail-grid > div:nth-child(2n) { border-right: 0; }
.detail-grid > .detail-wide { grid-column: 1 / -1; border-right: 0; }
.detail-grid > div:last-child { border-bottom: 0; }
.detail-grid span { display: block; margin-bottom: 4px; color: var(--el-text-color-placeholder); font-size: 10px; }
.detail-grid b { display: block; overflow-wrap: anywhere; color: var(--el-text-color-regular); font-size: 12px; }
.drawer-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.drawer-actions > .el-button { margin-left: 0; }

/* 包厢价格提示：与后台「计价方案」同源 */
.price-hint { color: var(--el-text-color-secondary); font-size: 12px; white-space: nowrap; }
.action-tip { display: inline-flex; }
.reservation-actions > .action-tip { flex: 1; min-width: 74px; }
.reservation-actions > .action-tip :deep(.el-button) { width: 100%; margin-left: 0; }
.assign-summary { margin-bottom: 12px; color: var(--el-text-color-regular); font-size: 13px; }
.assign-summary p { margin: 0 0 4px; }
.assign-summary span { display: inline-block; width: 72px; color: var(--el-text-color-secondary); }
.assign-hint { margin: 8px 0 0; color: var(--el-text-color-secondary); font-size: 12px; }
.assign-excluded { margin: 6px 0 0; color: var(--el-text-color-secondary); font-size: 12px; }
.assign-empty { margin: 8px 0 0; color: var(--el-color-warning); font-size: 12px; }

@media (max-width: 1500px) {
  .reservation-grid { grid-template-columns: repeat(3, minmax(235px, 1fr)); }
}
@media (max-width: 1180px) {
  .reservation-grid { grid-template-columns: repeat(2, minmax(230px, 1fr)); }
  .reservation-grid.list-mode .reservation-card { grid-template-columns: minmax(210px, 1fr) minmax(170px, .8fr) 1fr; }
  .reservation-grid.list-mode .reservation-actions { grid-column: 1 / -1; }
}
@media (max-width: 720px) {
  .reservation-grid { grid-template-columns: 1fr; padding: 12px; gap: 16px; }
  .reservation-grid.list-mode .reservation-card { display: flex; }
  .price-hint { width: 100%; }
}
</style>
