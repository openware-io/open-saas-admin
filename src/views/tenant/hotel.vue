<template>
  <div class="admin-page hotel-page">
    <div class="page-header hotel-hero">
      <div class="hero-copy">
        <span class="hero-eyebrow">FRONT DESK · {{ todayLabel }}</span>
        <h2>酒店前台</h2>
        <p class="subtle">{{ hotelName }} · 今日房态、到店与离店任务</p>
        <div class="hero-meta">
          <span><i class="hero-dot"></i>{{ context?.businessType ? businessTypeText(context.businessType) : '当前门店' }}</span>
          <span>{{ context?.timezone || 'Asia/Shanghai' }}</span>
        </div>
      </div>
      <div class="header-actions">
        <el-button v-if="canCreate" type="primary" @click="openBooking">新建预订</el-button>
        <el-dropdown trigger="click" @command="runQuick">
          <el-button>
            更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="master">酒店资料</el-dropdown-item>
              <el-dropdown-item v-if="canManageRooms" command="audit" :disabled="auditLoading">夜审</el-dropdown-item>
              <el-dropdown-item v-if="canCollect" command="refund" :disabled="refundSyncing">同步退款</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button :loading="loading" @click="reload">刷新</el-button>
      </div>
      <div class="hero-stats">
        <button
          v-for="metric in metrics"
          :key="metric.key"
          type="button"
          class="hero-stat"
          :class="`tone-${metric.tone}`"
          @click="focusMetric(metric.key)"
        >
          <span class="hero-stat-icon-wrap">
            <span class="hero-stat-icon"><el-icon><component :is="metric.icon" /></el-icon></span>
            <i v-if="metric.key === 'tasks' && metric.value" class="pending-red-dot" aria-label="有待处理任务"></i>
          </span>
          <span class="hero-stat-copy">
            <strong>{{ metric.value }}</strong>
            <span>{{ metric.label }}</span>
            <small>{{ metric.hint }}</small>
          </span>
        </button>
      </div>
    </div>

    <div class="admin-card frontdesk-queue">
      <div class="section-head task-heading">
        <div>
          <h3>前台任务</h3>
          <p class="section-subtitle">优先处理到店、在住和待退房客人</p>
        </div>
        <el-tag effect="plain">{{ taskSearchRows.length }} 条</el-tag>
      </div>
      <div class="task-toolbar">
        <div class="task-filters">
          <button
            v-for="option in taskFilterOptions"
            :key="option.value"
            class="task-filter"
            :class="{ active: taskFilter === option.value }"
            @click="taskFilter = option.value"
          >
            <span>{{ option.label }}</span><b>{{ option.count }}</b>
          </button>
        </div>
        <el-input
          v-model="taskKeyword"
          clearable
          placeholder="预订号 / 住客 / 房号"
          size="small"
          style="width: 220px"
        />
      </div>
      <el-table v-loading="loading" :data="pagedTaskRows" border stripe>
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
        <el-table-column label="操作" width="340" align="center">
          <template #default="{ row }">
            <el-button
              v-if="(row.status === 'ARRIVAL' || row.status === 'CONFIRMED') && canCheckIn"
              link
              type="primary"
              @click="openCheckIn(row)"
            >
              办理入住
            </el-button>
              <el-button
                v-else-if="(row.status === 'IN_HOUSE' || row.status === 'DUE_OUT') && row.hasStay !== false && canCheckOut"
                link
                type="primary"
                @click="handleCheckoutAction(row)"
              >
                {{ hasOutstandingBalance(row) ? '先结账后退房' : '办理退房' }}
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
              v-if="row.status === 'PENDING_DEPOSIT' && row.orderId && canCollect"
              link
              type="success"
              :loading="depositPaying"
              @click="payDeposit(row)"
            >
              收定金确认
            </el-button>
            <el-button
              v-if="row.status === 'IN_HOUSE' || row.status === 'DUE_OUT'"
              link
              @click="openExtend(row)"
            >
              续住
            </el-button>
            <el-button
              v-if="row.status === 'IN_HOUSE' || row.status === 'DUE_OUT'"
              link
              @click="openFolio(row)"
            >
              账单
            </el-button>
            <el-button
              v-if="row.status === 'IN_HOUSE' && row.hasStay !== false && canCheckIn"
              link
              @click="openMove(row)"
            >
              换房
            </el-button>
            <el-button
              v-if="(row.status === 'CONFIRMED' || row.status === 'ARRIVAL') && canCreate"
              link
              type="danger"
              @click="cancelBooking(row)"
            >
              取消
            </el-button>
            <el-button
              v-if="(row.status === 'CONFIRMED' || row.status === 'ARRIVAL') && canCreate"
              link
              type="warning"
              @click="markNoShow(row)"
            >
              未到店
            </el-button>
            <span v-if="!canCheckIn && !canCheckOut" class="muted">-</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="task-pager">
        <el-pagination
          v-model:current-page="taskPage"
          v-model:page-size="taskPageSize"
          layout="total, prev, pager, next, sizes"
          :total="taskSearchRows.length"
          :page-sizes="[10, 20, 50]"
        />
      </div>
    </div>

    <div class="admin-card room-board-card">
      <div class="section-head room-board-head">
        <div>
          <h3>房态图</h3>
          <p class="room-board-subtitle">按楼层查看实时房态，颜色区分空闲、在住、脏房与维修</p>
        </div>
        <div class="room-board-summary">
          <button
            v-for="item in roomSummary"
            :key="item.key"
            type="button"
            class="room-summary-item"
            :class="[`is-${item.key}`, { 'is-selected': roomFilter.status === item.key }]"
            :aria-pressed="roomFilter.status === item.key"
            @click="filterByRoomSummary(item.key)"
          >
            <b>{{ item.count }}</b><small>{{ item.label }}</small>
          </button>
        </div>
      </div>

      <div class="room-floor-tabs">
        <button
          v-for="floor in roomBoard"
          :key="floor.key"
          type="button"
          class="room-floor-tab"
          :class="{ active: activeRoomFloor === floor.key }"
          @click="roomFilter.floor = floor.key"
        >
          {{ floor.label }}<b>{{ floor.rooms.length }}</b>
        </button>
        <span class="room-floor-tip">每次只看一层，避免楼层过多把页面拉长</span>
      </div>

      <div class="room-board-filters">
        <el-select v-model="roomFilter.roomType" clearable placeholder="房型" size="small" style="width: 150px">
          <el-option v-for="item in roomTypeOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="roomFilter.status" clearable placeholder="房态" size="small" style="width: 120px">
          <el-option label="空闲" value="active" />
          <el-option label="在住" value="occupied" />
          <el-option label="脏房" value="dirty" />
          <el-option label="维修" value="maintenance" />
        </el-select>
        <el-date-picker
          v-model="roomFilter.date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="业务日期（可选）"
          size="small"
          style="width: 150px"
        />
        <el-input
          v-model="roomFilter.keyword"
          clearable
          placeholder="房号 / 住客"
          size="small"
          style="width: 150px"
        />
        <el-button size="small" @click="resetRoomFilter">重置</el-button>
        <span class="room-filter-hint">日期筛选只显示当天有在住/到离店业务的客房</span>
      </div>

      <div v-loading="roomStatesLoading" class="room-board">
        <div v-if="!filteredRoomBoard.length && !roomStatesLoading" class="room-board-empty">
          {{ roomStates.length ? '没有符合筛选条件的客房' : '当前门店还没有客房，请先在酒店资料中添加房型与客房。' }}
        </div>
        <section v-for="floor in visibleRoomBoard" :key="floor.key" class="room-floor">
          <header class="room-floor-head">
            <h4>{{ floor.label }}</h4>
            <span>{{ floor.rooms.length }} 间</span>
          </header>
          <div class="room-grid">
            <article
              v-for="room in floor.rooms"
              :key="room.id"
              class="room-tile"
              :class="`room-tile-${room.tone}`"
              tabindex="0"
              role="button"
              @click="openRoom(room)"
              @keydown.enter="openRoom(room)"
            >
              <div class="room-tile-top">
                <div class="room-ident">
                  <strong>{{ room.roomNo }}</strong>
                  <span class="room-type">{{ room.roomTypeName }}<template v-if="room.floor"> · {{ room.floor }} 楼</template></span>
                </div>
                <span class="room-status-pill" :class="`is-${room.tone}`">{{ room.statusLabel }}</span>
              </div>

              <div class="room-tile-body">
                <template v-if="room.guestName">
                  <div class="room-card-note">
                    <span v-if="room.cardBadge">{{ room.cardBadge }}</span>
                    <span v-if="room.bookingStatusLabel">{{ room.bookingStatusLabel }}</span>
                  </div>
                  <div class="room-guest-line">
                    <span class="room-guest-avatar">{{ room.guestInitial }}</span>
                    <span class="room-guest-copy">
                      <strong>{{ room.guestName }}</strong>
                      <small v-if="room.phoneHint">{{ room.phoneHint }}</small>
                    </span>
                  </div>
                  <div v-if="room.stayWindow" class="room-stay-line">
                    <el-icon><Calendar /></el-icon>
                    <span>{{ room.stayWindow }}</span>
                  </div>
                  <div v-if="room.financeHints.length" class="room-finance-hints">
                    <span v-for="hint in room.financeHints" :key="hint" class="room-finance-hint">{{ hint }}</span>
                  </div>
                  <span v-if="room.serviceHint" class="room-service-hint">{{ room.serviceHint }}</span>
                </template>
                <div v-else class="room-vacant">
                  <el-icon class="room-vacant-icon"><House /></el-icon>
                  <span>{{ room.emptyHint }}</span>
                  <small v-if="room.serviceHint">{{ room.serviceHint }}</small>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
      <div class="room-legend">
        <span><i class="legend-dot is-active"></i>空闲</span>
        <span><i class="legend-dot is-occupied"></i>在住</span>
        <span><i class="legend-dot is-dirty"></i>脏房</span>
        <span><i class="legend-dot is-maintenance"></i>维修</span>
      </div>
    </div>


    <div class="admin-card">
      <div class="section-head">
        <h3>全部预订</h3>
        <div class="inline-actions">
          <el-select v-model="bookingStatusFilter" clearable placeholder="全部状态" style="width:150px" @change="loadBookings">
            <el-option v-for="item in bookingStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-tag effect="plain">{{ bookings.length }} 条</el-tag>
        </div>
      </div>
      <el-table v-loading="bookingsLoading" :data="pagedBookings" border stripe>
        <el-table-column prop="bookingNo" label="预订号" width="170" />
        <el-table-column prop="guestName" label="住客" width="120" />
        <el-table-column prop="roomType" label="房型" min-width="140" />
        <el-table-column prop="roomNo" label="房号" width="90" />
        <el-table-column label="入住 / 离店" min-width="180">
          <template #default="{ row }">{{ row.checkInDate }} → {{ row.checkOutDate }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ hotelBookingStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.amountMinor, row.currency) }}</template>
        </el-table-column>
      </el-table>
      <div class="task-pager">
        <el-pagination
          v-model:current-page="bookingPage"
          v-model:page-size="bookingPageSize"
          layout="total, prev, pager, next, sizes"
          :total="bookings.length"
          :page-sizes="[10, 20, 50]"
        />
      </div>
    </div>

    <div class="admin-card">
      <div class="section-head">
        <h3>客房清扫</h3>
        <el-tag effect="plain">{{ housekeeping.length }} 条</el-tag>
      </div>
      <el-table v-loading="housekeepingLoading" :data="pagedHousekeeping" border stripe>
        <el-table-column prop="roomNo" label="房号" width="100" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ housekeepingTypeText(row.taskType) }}</template>
        </el-table-column>
        <el-table-column label="来源" width="110">
          <template #default="{ row }">{{ housekeepingSourceText(row.source) }}</template>
        </el-table-column>
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
      <div class="task-pager">
        <el-pagination
          v-model:current-page="housekeepingPage"
          v-model:page-size="housekeepingPageSize"
          layout="total, prev, pager, next, sizes"
          :total="housekeeping.length"
          :page-sizes="[10, 20, 50]"
        />
      </div>
    </div>

    <el-drawer v-model="roomDrawerVisible" :title="roomDrawerTitle" size="480px" destroy-on-close>
      <div v-if="selectedRoom" class="room-detail">
        <div class="room-detail-hero" :class="`room-detail-${selectedRoom.tone}`">
          <span class="room-detail-eyebrow">
            {{ selectedRoom.roomTypeName }}<template v-if="selectedRoom.floor"> · {{ selectedRoom.floor }} 楼</template>
          </span>
          <div class="room-detail-title-row">
            <strong>{{ selectedRoom.roomNo }}</strong>
            <span class="room-status-pill" :class="`is-${selectedRoom.tone}`">{{ selectedRoom.statusLabel }}</span>
            <span v-if="selectedRoom.cardBadge" class="room-detail-badge">{{ selectedRoom.cardBadge }}</span>
          </div>
        </div>

        <section v-if="selectedRoomTask" class="room-detail-section">
          <div class="room-detail-section-head">
            <h4>住宿信息</h4>
            <span>{{ selectedRoomTask.bookingNo }}</span>
          </div>
          <div class="room-facts">
            <div><span>房型</span><strong>{{ selectedRoom.roomTypeName }}</strong></div>
            <div><span>楼层</span><strong>{{ selectedRoom.floor || '未分楼层' }}</strong></div>
            <div><span>入住</span><strong>{{ selectedRoomTask.checkInDate || '—' }}</strong></div>
            <div><span>离店</span><strong>{{ selectedRoomTask.checkOutDate || '—' }}</strong></div>
            <div><span>住宿</span><strong>{{ selectedRoomTask.nights || '—' }} 晚 · {{ selectedRoomTask.rooms || 1 }} 间</strong></div>
            <div><span>来源</span><strong>{{ selectedRoomTask.source ? hotelBookingSourceText(selectedRoomTask.source) : '—' }}</strong></div>
            <div class="room-facts-wide"><span>实际入住</span><strong>{{ formatRoomDateTime(selectedRoomTask.checkInAt) }}</strong></div>
          </div>
          <div v-if="selectedRoom.serviceHint" class="room-detail-service">
            <el-icon><Bell /></el-icon>
            <span>{{ selectedRoom.serviceHint }}</span>
          </div>
        </section>

        <section v-if="selectedRoomTask" class="room-detail-section">
          <div class="room-detail-section-head">
            <h4>住客信息</h4>
          </div>
          <div class="room-guest-card">
            <span class="room-guest-avatar room-guest-avatar-lg">{{ selectedRoom.guestInitial }}</span>
            <div class="room-guest-card-copy">
              <strong>{{ selectedRoomTask.guestName }}</strong>
              <span>{{ maskPhone(selectedRoomTask.guestPhone) || '未留手机号' }}</span>
            </div>
          </div>
        </section>

        <section v-if="selectedRoomTask" class="room-detail-section">
          <div class="room-detail-section-head">
            <h4>账务</h4>
          </div>
          <div v-if="selectedRoomFinanceHints.length" class="room-finance-summary">
            <span v-for="hint in selectedRoomFinanceHints" :key="hint">{{ hint }}</span>
          </div>
          <el-alert
            v-if="selectedRoomHasBalance"
            class="room-balance-warning"
            type="warning"
            :closable="false"
            show-icon
            title="账单未结清，退房前请先完成收款或押金抵扣"
          />
        </section>

        <section v-else class="room-detail-section">
          <div class="room-empty-note">
            <strong>{{ roomEmptyCopy.title }}</strong>
            <span>{{ roomEmptyCopy.hint }}</span>
          </div>
        </section>

        <div class="room-detail-actions">
          <template v-if="selectedRoomTask">
            <el-button
              v-if="selectedRoomHousekeeping && selectedRoomHousekeeping.status === 'PENDING' && canManageRooms"
              class="room-action-wide"
              type="warning"
              @click="startRoomCleaning"
            >开始住客清扫</el-button>
            <el-button
              v-if="selectedRoomHousekeeping && selectedRoomHousekeeping.status === 'IN_PROGRESS' && canManageRooms"
              class="room-action-wide"
              type="success"
              @click="finishRoomCleaning"
            >完成住客清扫</el-button>
            <el-button
              v-if="canCheckOut && selectedRoomTask.hasStay !== false"
              class="room-action-wide"
              type="primary"
              @click="roomCheckout"
            >{{ selectedRoomHasBalance ? '先结账后退房' : '办理退房' }}</el-button>
            <el-button v-if="canCheckIn" @click="roomExtend">续住</el-button>
            <el-button @click="roomFolio">查看账单</el-button>
            <el-button v-if="canCheckIn && selectedRoomTask.hasStay !== false" @click="roomMove">换房</el-button>
          </template>
          <template v-else>
            <el-button v-if="selectedRoom.status === 'ACTIVE' && canCreate" class="room-action-wide" type="primary" @click="createFromRoom">新建预订</el-button>
            <el-button
              v-if="selectedRoomHousekeeping && selectedRoomHousekeeping.status === 'PENDING' && canManageRooms"
              class="room-action-wide"
              type="primary"
              @click="startRoomCleaning"
            >开始清扫</el-button>
            <el-button
              v-if="selectedRoomHousekeeping && selectedRoomHousekeeping.status === 'IN_PROGRESS' && canManageRooms"
              class="room-action-wide"
              type="success"
              @click="finishRoomCleaning"
            >完成清扫</el-button>
            <el-button
              v-if="selectedRoom.status === 'MAINTENANCE' && canManageRooms"
              @click="setRoomMaintenance(false)"
            >恢复空闲</el-button>
            <el-button
              v-if="selectedRoom.status !== 'MAINTENANCE' && selectedRoom.status !== 'OCCUPIED' && canManageRooms"
              @click="setRoomMaintenance(true)"
            >设为维修</el-button>
          </template>
        </div>
      </div>
    </el-drawer>

    <el-dialog v-model="extendVisible" title="续住" width="420px">
      <el-form label-width="100px">
        <el-form-item label="新离店日期">
          <el-date-picker v-model="extendDate" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="extendVisible = false">取消</el-button>
        <el-button type="primary" :loading="extending" @click="submitExtend">确认续住</el-button>
      </template>
    </el-dialog>

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
        <el-form-item label="关联客户">
          <el-select v-model="form.bookedByAccountId" filterable remote clearable style="width:100%"
            :remote-method="searchCustomers" :loading="customerLoading"
            placeholder="可选：输入手机号/姓名搜索客户，关联后客户在“我的预约”可见">
            <el-option v-for="item in customerOptions" :key="item.accountId"
              :label="(item.name || item.phone || '客户') + ' · ' + (item.phone || '')"
              :value="item.accountId" />
          </el-select>
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

  <el-dialog v-model="checkInVisible" title="办理入住" width="460px">
    <el-form label-width="90px">
      <el-form-item label="住客">{{ checkInBooking?.guestName }}</el-form-item>
      <el-form-item label="房型">{{ checkInBooking?.roomType }}</el-form-item>
      <el-form-item label="分配房号">
        <el-select v-model="checkInRoomId" placeholder="选择空闲客房" style="width:100%">
          <el-option v-for="room in checkInRooms" :key="room.id" :label="`${room.roomNo}（${room.floor || '未填楼层'}）`" :value="room.id" />
        </el-select>
      </el-form-item>
      <div v-if="!checkInRooms.length" class="muted">该房型当前没有空闲客房，请先维护客房或处理清扫。</div>
    </el-form>
    <template #footer>
      <el-button @click="checkInVisible = false">取消</el-button>
      <el-button type="primary" :loading="checkInLoading" :disabled="!checkInRoomId" @click="submitCheckIn">确认入住</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="moveVisible" title="换房" width="460px">
    <el-form label-width="90px">
      <el-form-item label="住客">{{ moveBooking?.guestName }}</el-form-item>
      <el-form-item label="原房号">{{ moveBooking?.roomNo || '未分配' }}</el-form-item>
      <el-form-item label="新房号">
        <el-select v-model="moveRoomId" placeholder="选择空闲客房" style="width:100%">
          <el-option v-for="room in moveRooms" :key="room.id" :label="`${room.roomNo}（${room.floor || '未填楼层'}）`" :value="room.id" />
        </el-select>
      </el-form-item>
      <div v-if="!moveRooms.length" class="muted">该房型当前没有空闲客房。</div>
    </el-form>
    <template #footer>
      <el-button @click="moveVisible = false">取消</el-button>
      <el-button type="primary" :loading="moveLoading" :disabled="!moveRoomId" @click="submitMove">确认换房</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, Bell, Calendar, Document, House, Moon, Plus, Refresh, Tickets } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  cancelHotelBooking,
  checkInHotelBooking,
  checkOutHotelBooking,
  collectHotelOrder,
  confirmHotelDeposit,
  collectHotelDeposit,
  completeHousekeepingTask,
  confirmHotelBooking,
  createHotelBooking,
  extendHotelBooking,
  getHotelFolio,
  getHotelPolicy,
  listHotelBookings,
  listHotelFrontDeskTasks,
  listHotelRatePlans,
  listHotelRoomTypes,
  listHotelRooms,
  listHotels,
  moveHotelRoom,
  noShowHotelBooking,
  listHousekeepingTasks,
  quoteHotelStay,
  refundHotelDeposit,
  requestHotelOnlineRefund,
  runNightAudit,
  setHotelRoomStatus,
  startHousekeepingTask,
  syncHotelRefunds,
} from '@/api/hotel'
import { listMembers } from '@/api/member'
import {
  businessTypeText,
  hotelBookingSourceText,
  hotelBookingStatusText,
  hotelFolioStatusText,
  hotelRoomStatusText,
  housekeepingSourceText,
  housekeepingStatusText,
  housekeepingTypeText,
} from '@/constants/terms'
import { formatMoney } from '@/utils/format'
import { hasPermission } from '@/utils/context'
import { notifyAdminRequestError } from '@/utils/adminErrorMessage'
import { useContextStore } from '@/stores/context'

const router = useRouter()
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
const bookings = ref([])
const bookingsLoading = ref(false)
const bookingStatusFilter = ref('')
const bookingStatusOptions = [
  { value: 'PENDING_PAYMENT', label: '待支付' },
  { value: 'PENDING_DEPOSIT', label: '待付定金' },
  { value: 'CONFIRMED', label: '已确认' },
  { value: 'ARRIVAL', label: '待入住' },
  { value: 'IN_HOUSE', label: '在住' },
  { value: 'DUE_OUT', label: '待退房' },
  { value: 'CHECKED_OUT', label: '已退房' },
  { value: 'CANCELLED', label: '已取消' },
  { value: 'NO_SHOW', label: '未到店' },
]
const roomStates = ref([])
const roomStatesLoading = ref(false)
const roomDrawerVisible = ref(false)
const selectedRoom = ref(null)
const selectedRoomTask = computed(() => tasks.value.find((task) => task.roomNo === selectedRoom.value?.roomNo
  && ['IN_HOUSE', 'DUE_OUT'].includes(task.status)) || null)
const selectedRoomFinanceHints = computed(() => selectedRoomTask.value ? financeHints(selectedRoomTask.value) : [])
function hasOutstandingBalance(task) {
  return !!task && task.folioChargeMinor != null && task.folioPaidMinor != null
    && Number(task.folioChargeMinor) > Number(task.folioPaidMinor)
}

const selectedRoomHasBalance = computed(() => hasOutstandingBalance(selectedRoomTask.value))
const selectedRoomHousekeeping = computed(() => {
  if (!selectedRoom.value) return null
  const candidates = housekeeping.value.filter((task) => task.roomNo === selectedRoom.value.roomNo && task.status !== 'DONE')
  const expectedType = selectedRoomTask.value ? 'STAYOVER' : 'DEPARTURE'
  return candidates.find((task) => (task.taskType || 'DEPARTURE') === expectedType) || null
})
const roomEmptyCopy = computed(() => {
  const status = selectedRoom.value?.status
  if (status === 'ACTIVE') return { title: '客房空闲', hint: '可以直接为到店客人创建预订或办理入住。' }
  if (status === 'DIRTY') return { title: '等待清扫', hint: '完成客房清扫后即可恢复预订。' }
  if (status === 'MAINTENANCE') return { title: '客房维修中', hint: '处理完成后恢复。' }
  return { title: '客房状态', hint: '请按房态完成对应操作。' }
})
const roomDrawerTitle = computed(() => selectedRoom.value?.roomNo || '客房详情')

function formatRoomDateTime(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 16)
}
const checkInVisible = ref(false)
const checkInBooking = ref(null)
const checkInRooms = ref([])
const checkInRoomId = ref(null)
const checkInLoading = ref(false)
const moveVisible = ref(false)
const moveBooking = ref(null)
const moveRooms = ref([])
const moveRoomId = ref(null)
const moveLoading = ref(false)
const folioVisible = ref(false)
const folioBooking = ref(null)
const folio = ref(null)
const depositAmount = ref(1)
const depositNote = ref('')
const depositLoading = ref(false)
const refunding = ref(false)
const refundMethod = ref('CASH')
const refundSyncing = ref(false)
const extendVisible = ref(false)
const extendBooking = ref(null)
const extendDate = ref('')
const extending = ref(false)
const auditLoading = ref(false)
const customerOptions = ref([])
const customerLoading = ref(false)
const hotelPolicy = ref(null)
const depositPaying = ref(false)

const form = reactive({
  roomTypeId: null,
  ratePlanId: null,
  dates: [],
  rooms: 1,
  guestName: '',
  guestPhone: '',
  bookedByAccountId: '',
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

const roomTone = { ACTIVE: 'active', OCCUPIED: 'occupied', DIRTY: 'dirty', MAINTENANCE: 'maintenance' }

function shortDate(value) {
  const text = String(value || '').slice(0, 10)
  const parts = text.split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : text
}

function stayWindowText(task) {
  const start = shortDate(task.checkInDate)
  const end = shortDate(task.checkOutDate)
  if (!start && !end) return ''
  const nights = task.nights ? ` · ${task.nights}晚` : ''
  return `${start} → ${end}${nights}`
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length >= 4 ? `尾号 ${digits.slice(-4)}` : ''
}

function activeCardBadge(task) {
  if (task.status === 'DUE_OUT') return '今日离店'
  if (task.status === 'IN_HOUSE') return task.nights ? `${task.nights}晚` : '在住'
  return ''
}

function financeHints(task) {
  const hints = []
  if (task.folioChargeMinor != null && task.folioPaidMinor != null) {
    const balance = Number(task.folioChargeMinor) - Number(task.folioPaidMinor)
    hints.push(balance > 0
      ? `待结 ${formatMoney(balance, task.currency)}`
      : '账已结清')
  } else if (task.amountMinor != null) {
    hints.push(`房费 ${formatMoney(task.amountMinor, task.currency)}`)
  }
  if (task.depositAmountMinor) hints.push(`押金 ${formatMoney(task.depositAmountMinor, task.currency)}`)
  if (task.rooms && task.rooms > 1) hints.push(`${task.rooms}间`)
  if (task.source) hints.push(hotelBookingSourceText(task.source))
  return hints
}

function emptyRoomHint(room, upcoming) {
  if (upcoming) return `下一预订 ${shortDate(upcoming.checkInDate)} · ${upcoming.guestName}`
  if (room.status === 'DIRTY') return '清扫完成可恢复预订'
  if (room.status === 'MAINTENANCE') return '维修完成后恢复'
  return '今日可预订'
}

const roomSummary = computed(() => {
  const count = { ACTIVE: 0, OCCUPIED: 0, DIRTY: 0, MAINTENANCE: 0 }
  const activeRooms = new Set(tasks.value
    .filter((task) => task.roomNo && ['IN_HOUSE', 'DUE_OUT'].includes(task.status))
    .map((task) => task.roomNo))
  for (const room of roomStates.value) {
    const status = activeRooms.has(room.roomNo) ? 'OCCUPIED' : room.status
    if (count[status] !== undefined) count[status] += 1
  }
  return [
    { key: 'active', label: '空闲', count: count.ACTIVE },
    { key: 'occupied', label: '在住', count: count.OCCUPIED },
    { key: 'dirty', label: '脏房', count: count.DIRTY },
    { key: 'maintenance', label: '维修', count: count.MAINTENANCE },
  ]
})

const roomBoard = computed(() => {
  const activeByRoom = new Map()
  const upcomingByRoom = new Map()
  const stayoverByRoom = new Map()
  for (const task of tasks.value) {
    if (!task.roomNo) continue
    if (['IN_HOUSE', 'DUE_OUT'].includes(task.status)) {
      activeByRoom.set(task.roomNo, task)
    } else if (['CONFIRMED', 'ARRIVAL', 'PENDING_DEPOSIT'].includes(task.status)) {
      const current = upcomingByRoom.get(task.roomNo)
      if (!current || String(task.checkInDate || '') < String(current.checkInDate || '')) {
        upcomingByRoom.set(task.roomNo, task)
      }
    }
  }
  for (const task of housekeeping.value) {
    if (!task.roomNo || task.status === 'DONE' || task.taskType !== 'STAYOVER') continue
    stayoverByRoom.set(task.roomNo, task)
  }
  const floors = new Map()
  for (const room of roomStates.value) {
    const floorKey = room.floor || '未分楼层'
    if (!floors.has(floorKey)) floors.set(floorKey, [])
    const task = activeByRoom.get(room.roomNo)
    const upcoming = upcomingByRoom.get(room.roomNo)
    const stayover = stayoverByRoom.get(room.roomNo)
    floors.get(floorKey).push({
      ...room,
      // 在住/待离店优先于物理房态：即使历史数据把客房标成 DIRTY，也不能把住客显示成“待清扫”。
      tone: task ? 'occupied' : (roomTone[room.status] || 'maintenance'),
      statusLabel: task
        ? '在住'
        : hotelRoomStatusText(room.status),
      guestName: task?.guestName || '',
      guestInitial: task?.guestName ? String(task.guestName).slice(0, 1) : '',
      bookingStatusLabel: '',
      stayWindow: task ? stayWindowText(task) : '',
      checkInDate: task?.checkInDate || upcoming?.checkInDate || '',
      checkOutDate: task?.checkOutDate || upcoming?.checkOutDate || '',
      phoneHint: task ? maskPhone(task.guestPhone) : '',
      cardBadge: task ? activeCardBadge(task) : '',
      financeHints: task ? financeHints(task) : [],
      serviceHint: task && stayover
        ? `${housekeepingTypeText(stayover.taskType)} · ${housekeepingStatusText(stayover.status)}`
        : '',
      emptyHint: task ? '' : emptyRoomHint(room, upcoming),
    })
  }
  return [...floors.entries()]
    .map(([floor, rooms]) => ({
      key: floor,
      label: floor === '未分楼层' ? floor : `${floor} 楼`,
      rooms: rooms.sort((a, b) => String(a.roomNo).localeCompare(String(b.roomNo), 'zh-CN', { numeric: true })),
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key), 'zh-CN', { numeric: true }))
})

const roomFilter = reactive({ floor: '', roomType: '', status: '', date: '', keyword: '' })
const activeRoomFloor = computed(() => roomFilter.floor || roomBoard.value[0]?.key || '')
const visibleRoomBoard = computed(() => filteredRoomBoard.value.filter((floor) => floor.key === activeRoomFloor.value))
const roomTypeOptions = computed(() => [...new Set(roomStates.value.map((room) => room.roomTypeName).filter(Boolean))]
  .sort((a, b) => String(a).localeCompare(String(b), 'zh-CN')))
const filteredRoomBoard = computed(() => {
  const keyword = roomFilter.keyword.trim().toLowerCase()
  const date = roomFilter.date
  return roomBoard.value
    .map((floor) => ({
      ...floor,
      rooms: floor.rooms.filter((room) => {
        if (roomFilter.floor && room.floor !== roomFilter.floor) return false
        if (roomFilter.roomType && room.roomTypeName !== roomFilter.roomType) return false
        if (roomFilter.status && room.tone !== roomFilter.status) return false
        if (keyword) {
          const haystack = `${room.roomNo || ''} ${room.guestName || ''}`.toLowerCase()
          if (!haystack.includes(keyword)) return false
        }
        if (date) {
          if (!room.checkInDate || !room.checkOutDate) return false
          if (date < room.checkInDate || date > room.checkOutDate) return false
        }
        return true
      }),
    }))
    .filter((floor) => floor.rooms.length)
})

function resetRoomFilter() {
  Object.assign(roomFilter, { floor: '', roomType: '', status: '', date: '', keyword: '' })
}

function filterByRoomSummary(status) {
  roomFilter.status = roomFilter.status === status ? '' : status
}

const metrics = computed(() => [
  { key: 'arrival', label: '待入住', value: (counts.value.CONFIRMED || 0) + (counts.value.ARRIVAL || 0), hint: '已确认 / 今日到店', icon: Calendar, tone: 'amber' },
  { key: 'in_house', label: '在住', value: counts.value.IN_HOUSE || 0, hint: '当前在店', icon: House, tone: 'blue' },
  { key: 'due_out', label: '待退房', value: counts.value.DUE_OUT || 0, hint: '今日离店', icon: Tickets, tone: 'violet' },
  { key: 'tasks', label: '待处理', value: tasks.value.length, hint: '前台任务', icon: Bell, tone: 'green' },
])

function focusMetric(key) {
  taskFilter.value = { arrival: 'ARRIVAL', in_house: 'IN_HOUSE', due_out: 'DUE_OUT', tasks: 'ALL' }[key] || 'ALL'
  document.querySelector('.frontdesk-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const quickActions = computed(() => [
  canCreate.value && { key: 'booking', label: '新建预订', hint: '为到店客人快速开单', icon: Plus, tone: 'amber' },
  { key: 'master', label: '酒店资料', hint: '房型、房价与库存', icon: Document, tone: 'blue' },
  canManageRooms.value && { key: 'audit', label: '夜审', hint: '结算今日营业数据', icon: Moon, tone: 'violet' },
  canCollect.value && { key: 'refund', label: '同步退款', hint: '同步线上退款状态', icon: Refresh, tone: 'green' },
].filter(Boolean))

function runQuick(key) {
  if (key === 'booking') openBooking()
  else if (key === 'master') router.push('/admin/tenant/hotel-master')
  else if (key === 'audit') runAudit()
  else if (key === 'refund') syncRefunds()
}

const taskFilter = ref('ALL')
const taskFilterOptions = computed(() => [
  { value: 'ALL', label: '全部', count: tasks.value.length },
  { value: 'ARRIVAL', label: '待入住', count: (counts.value.CONFIRMED || 0) + (counts.value.ARRIVAL || 0) },
  { value: 'IN_HOUSE', label: '在住', count: counts.value.IN_HOUSE || 0 },
  { value: 'DUE_OUT', label: '待退房', count: counts.value.DUE_OUT || 0 },
])

const filteredTasks = computed(() => {
  if (taskFilter.value === 'ALL') return tasks.value
  if (taskFilter.value === 'ARRIVAL') return tasks.value.filter((task) => ['CONFIRMED', 'ARRIVAL'].includes(task.status))
  return tasks.value.filter((task) => task.status === taskFilter.value)
})
const taskKeyword = ref('')
const taskPage = ref(1)
const taskPageSize = ref(10)
const bookingPage = ref(1)
const bookingPageSize = ref(10)
const housekeepingPage = ref(1)
const housekeepingPageSize = ref(10)
const taskSearchRows = computed(() => {
  const keyword = taskKeyword.value.trim().toLowerCase()
  if (!keyword) return filteredTasks.value
  return filteredTasks.value.filter((task) => `${task.bookingNo || ''} ${task.guestName || ''} ${task.roomNo || ''} ${task.guestPhone || ''}`
    .toLowerCase().includes(keyword))
})
const pagedTaskRows = computed(() => {
  const start = (taskPage.value - 1) * taskPageSize.value
  return taskSearchRows.value.slice(start, start + taskPageSize.value)
})
const pagedBookings = computed(() => {
  const start = (bookingPage.value - 1) * bookingPageSize.value
  return bookings.value.slice(start, start + bookingPageSize.value)
})
const pagedHousekeeping = computed(() => {
  const start = (housekeepingPage.value - 1) * housekeepingPageSize.value
  return housekeeping.value.slice(start, start + housekeepingPageSize.value)
})
watch([taskFilter, taskKeyword], () => { taskPage.value = 1 })

const hotelName = computed(() => context.value?.storeName || '当前酒店')
const todayLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

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
    hotelPolicy.value = await getHotelPolicy(hotelId)
  } catch (error) {
    notifyAdminRequestError(error, '加载酒店房型/房价失败')
  }
}

async function searchCustomers(keyword) {
  if (!keyword || keyword.trim().length < 2) {
    customerOptions.value = []
    return
  }
  customerLoading.value = true
  try {
    const page = await listMembers({ page: 1, pageSize: 20, keyword: keyword.trim() })
    customerOptions.value = (page?.records || []).filter((item) => item.accountId)
  } catch (error) {
    customerOptions.value = []
  } finally {
    customerLoading.value = false
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
  form.bookedByAccountId = ''
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
  if (form.guestName.includes('?') || form.guestName.includes('\uFFFD')) {
    ElMessage.warning('住客姓名包含无效问号或替换字符，请重新输入')
    return
  }
  submitting.value = true
  try {
    await createHotelBooking({
      ...stayBody(),
      guestName: form.guestName,
      guestPhone: form.guestPhone,
      bookedByAccountId: form.bookedByAccountId ? Number(form.bookedByAccountId) : null,
    })
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
  housekeepingPage.value = 1
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
  await Promise.all([loadTasks(), loadBookings(), loadHousekeeping(), loadRoomStates()])
}

function openExtend(row) {
  extendBooking.value = row
  const base = row.checkOutDate ? new Date(`${row.checkOutDate}T00:00:00`) : new Date()
  extendDate.value = new Date(base.getTime() + 86400000).toISOString().slice(0, 10)
  extendVisible.value = true
}

async function submitExtend() {
  if (!extendBooking.value || !extendDate.value) return
  extending.value = true
  try {
    await extendHotelBooking(extendBooking.value.id, extendDate.value)
    ElMessage.success('续住已办理')
    extendVisible.value = false
    await reload()
  } catch (error) {
    notifyAdminRequestError(error, '续住失败')
  } finally {
    extending.value = false
  }
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

function openRoom(room) {
  selectedRoom.value = room
  roomDrawerVisible.value = true
}

function closeRoomDrawer() {
  roomDrawerVisible.value = false
  selectedRoom.value = null
}

function handleCheckoutAction(row) {
  if (hasOutstandingBalance(row)) {
    openFolio(row)
    ElMessage.warning('账单未结清，请先在账单中完成收款或押金抵扣')
    return
  }
  checkOut(row)
}

async function roomCheckout() {
  const task = selectedRoomTask.value
  if (!task) return
  if (selectedRoomHasBalance.value) {
    openFolio(task)
    ElMessage.warning('账单未结清，请先在账单中完成收款或押金抵扣')
    return
  }
  if (await checkOut(task)) closeRoomDrawer()
}

function roomExtend() {
  if (!selectedRoomTask.value) return
  openExtend(selectedRoomTask.value)
  closeRoomDrawer()
}

function roomFolio() {
  if (!selectedRoomTask.value) return
  openFolio(selectedRoomTask.value)
  closeRoomDrawer()
}

function roomMove() {
  if (!selectedRoomTask.value) return
  openMove(selectedRoomTask.value)
  closeRoomDrawer()
}

function createFromRoom() {
  closeRoomDrawer()
  openBooking()
}

async function startRoomCleaning() {
  const task = selectedRoomHousekeeping.value
  if (!task) return
  await startCleaning(task)
  await loadRoomStates()
  closeRoomDrawer()
}

async function finishRoomCleaning() {
  const task = selectedRoomHousekeeping.value
  if (!task) return
  await finishCleaning(task)
  await loadRoomStates()
  closeRoomDrawer()
}

async function setRoomMaintenance(maintenance) {
  if (!selectedRoom.value) return
  try {
    await setHotelRoomStatus(selectedRoom.value.id, maintenance ? 'MAINTENANCE' : 'ACTIVE')
    ElMessage.success(maintenance ? '客房已设为维修' : '客房已恢复空闲')
    await loadRoomStates()
    closeRoomDrawer()
  } catch (error) {
    notifyAdminRequestError(error, maintenance ? '设置维修失败' : '恢复客房失败')
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

async function payDeposit(row) {
  const amount = row.depositAmountMinor || 0
  if (!row.depositOrderId || amount <= 0) {
    ElMessage.warning('该预订没有定金收款单，请重新创建预订或改用全额收款')
    return
  }
  try {
    await ElMessageBox.confirm(`确认收取定金 ${formatMoney(amount, row.currency)} 并确认预订？`, '收定金', { type: 'warning' })
  } catch { return }
  depositPaying.value = true
  try {
    await collectHotelOrder(row.depositOrderId, {
      currencyCode: row.currency,
      payable: amount,
      payments: [{ method: 'CASH', amount }],
    }, `hotel-deposit-${row.id}-${Date.now()}`)
    await confirmHotelDeposit(row.id)
    ElMessage.success('定金已收取，预订已确认')
    await reload()
  } catch (error) {
    notifyAdminRequestError(error, '收取定金失败')
  } finally {
    depositPaying.value = false
  }
}

async function openCheckIn(row) {
  checkInBooking.value = row
  checkInRoomId.value = null
  checkInRooms.value = []
  try {
    const rooms = await listHotelRooms(row.roomTypeId)
    checkInRooms.value = (rooms || []).filter((room) => room.status === 'ACTIVE')
    checkInVisible.value = true
  } catch (error) {
    notifyAdminRequestError(error, '加载可用客房失败')
  }
}

async function submitCheckIn() {
  if (!checkInBooking.value || !checkInRoomId.value) return
  checkInLoading.value = true
  try {
    await checkInHotelBooking(checkInBooking.value.id, checkInRoomId.value)
    ElMessage.success(`${checkInBooking.value.guestName} 已办理入住`)
    checkInVisible.value = false
    await reload()
  } catch (error) {
    notifyAdminRequestError(error, '办理入住失败')
  } finally {
    checkInLoading.value = false
  }
}

async function openMove(row) {
  moveBooking.value = row
  moveRoomId.value = null
  moveRooms.value = []
  try {
    const rooms = await listHotelRooms(row.roomTypeId)
    moveRooms.value = (rooms || []).filter((room) => room.status === 'ACTIVE')
    moveVisible.value = true
  } catch (error) {
    notifyAdminRequestError(error, '加载可换客房失败')
  }
}

async function submitMove() {
  if (!moveBooking.value || !moveRoomId.value) return
  moveLoading.value = true
  try {
    await moveHotelRoom(moveBooking.value.id, moveRoomId.value)
    ElMessage.success('换房已完成')
    moveVisible.value = false
    await reload()
  } catch (error) {
    notifyAdminRequestError(error, '换房失败')
  } finally {
    moveLoading.value = false
  }
}

async function cancelBooking(row) {
  try {
    await ElMessageBox.confirm(`确认取消 ${row.guestName} 的预订 ${row.bookingNo}？`, '取消预订', { type: 'warning' })
  } catch { return }
  try {
    await cancelHotelBooking(row.id)
    ElMessage.success('预订已取消')
    await reload()
  } catch (error) {
    notifyAdminRequestError(error, '取消预订失败')
  }
}

async function markNoShow(row) {
  try {
    await ElMessageBox.confirm(`确认将 ${row.guestName} 标记为未到店？`, '未到店', { type: 'warning' })
  } catch { return }
  try {
    await noShowHotelBooking(row.id)
    ElMessage.success('已标记未到店')
    await reload()
  } catch (error) {
    notifyAdminRequestError(error, '标记未到店失败')
  }
}

async function loadBookings() {
  bookingPage.value = 1
  if (!context.value?.storeId || !canViewHotel.value) {
    bookings.value = []
    return
  }
  bookingsLoading.value = true
  try {
    bookings.value = (await listHotelBookings({ status: bookingStatusFilter.value || undefined })) || []
  } catch (error) {
    notifyAdminRequestError(error, '加载预订列表失败')
  } finally {
    bookingsLoading.value = false
  }
}

async function loadRoomStates() {
  if (!context.value?.storeId || !canViewHotel.value) {
    roomStates.value = []
    return
  }
  roomStatesLoading.value = true
  try {
    const rooms = (await listHotelRooms()) || []
    if (!roomTypes.value.length && rooms[0]?.hotelId) {
      roomTypes.value = (await listHotelRoomTypes(rooms[0].hotelId)) || []
    }
    const typeNames = new Map(roomTypes.value.map((type) => [String(type.id), type.name]))
    const taskTypeByRoom = new Map(tasks.value.filter((task) => task.roomNo && task.roomType).map((task) => [task.roomNo, task.roomType]))
    roomStates.value = rooms.map((room) => ({
      ...room,
      roomTypeName: typeNames.get(String(room.roomTypeId)) || taskTypeByRoom.get(room.roomNo) || `房型 ${room.roomTypeId}`,
    }))
  } catch (error) {
    notifyAdminRequestError(error, '加载房态失败')
  } finally {
    roomStatesLoading.value = false
  }
}

async function checkOut(row) {
  try {
    await checkOutHotelBooking(row.id)
    ElMessage.success(`${row.guestName} 已退房`)
    await reload()
    return true
  } catch (error) {
    notifyAdminRequestError(error, '办理退房失败')
    return false
  }
}

onMounted(async () => {
  await loadOptions()
  await reload()
})
</script>

<style scoped>
.hotel-page { display: flex; flex-direction: column; padding-bottom: 32px; }
.hotel-hero {
  flex-wrap: wrap;
  align-items: flex-start;
  padding: 22px 24px;
  border: 1px solid #e5ecf7;
  border-radius: 18px;
  background:
    radial-gradient(circle at 92% 12%, rgba(64, 158, 255, .12), transparent 28%),
    linear-gradient(120deg, #f8fbff 0%, #fff 58%, #f4f8ff 100%);
  box-shadow: 0 8px 24px rgba(31, 56, 96, .05);
}
.hero-copy h2 { margin: 6px 0 4px; font-size: 26px; letter-spacing: -.4px; }
.hero-eyebrow { color: #4b7bec; font-size: 10px; font-weight: 800; letter-spacing: 1.7px; }
.hero-meta { display: flex; gap: 16px; align-items: center; margin-top: 10px; color: #7d8ca3; font-size: 12px; }
.hero-meta span { display: inline-flex; align-items: center; gap: 6px; }
.hero-dot { width: 7px; height: 7px; border-radius: 50%; background: #35b87a; box-shadow: 0 0 0 4px rgba(53, 184, 122, .12); }
.hero-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); flex: 1 0 100%; gap: 8px; margin-top: 16px; }
.hero-stat { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 9px 11px; border: 1px solid rgba(219, 229, 242, .9); border-radius: 11px; background: rgba(255,255,255,.72); color: #34445c; text-align: left; cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.hero-stat:hover { border-color: #a9c9f3; box-shadow: 0 5px 14px rgba(42, 94, 170, .1); transform: translateY(-1px); }
.hero-stat-icon-wrap { position: relative; display: inline-flex; flex: 0 0 28px; }
.hero-stat-icon { display: grid; width: 28px; height: 28px; flex: 0 0 28px; place-items: center; border-radius: 8px; font-size: 15px; }
.pending-red-dot { position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; border: 2px solid #fff; border-radius: 50%; background: #f53f3f; box-shadow: 0 0 0 1px rgba(245, 63, 63, .12); }
.hero-stat-copy { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
.hero-stat-copy strong { font-size: 20px; letter-spacing: -.3px; }
.hero-stat-copy span { color: #697a90; font-size: 11px; }
.hero-stat-copy small { color: #9aa7b8; font-size: 10px; }
.hero-stat.tone-amber .hero-stat-icon { color: #b87512; background: #fff4e2; }
.hero-stat.tone-blue .hero-stat-icon { color: #2f6fce; background: #eaf2ff; }
.hero-stat.tone-violet .hero-stat-icon { color: #7650a7; background: #f3edff; }
.hero-stat.tone-green .hero-stat-icon { color: #21875b; background: #e9f8f0; }
.hotel-metric { display: flex; align-items: center; gap: 13px; min-height: 92px; padding: 15px 17px; border: 1px solid #edf1f7; border-radius: 14px; background: #fff; box-shadow: 0 4px 14px rgba(33, 48, 74, .04); }
.metric-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border-radius: 11px; font-size: 19px; }
.metric-copy { display: flex; flex-direction: column; min-width: 0; }
.metric-copy span { color: #6f7e93; font-size: 12px; }
.metric-copy strong { margin: 2px 0; color: #1f2d43; font-size: 27px; line-height: 1.05; letter-spacing: -.5px; }
.metric-copy small { color: #9aa7b8; font-size: 11px; }
.hotel-metric.tone-amber .metric-icon { color: #b87512; background: #fff4e2; }
.hotel-metric.tone-blue .metric-icon { color: #2f6fce; background: #eaf2ff; }
.hotel-metric.tone-violet .metric-icon { color: #7650a7; background: #f3edff; }
.hotel-metric.tone-green .metric-icon { color: #21875b; background: #e9f8f0; }
.section-subtitle { margin: 3px 0 0; color: var(--el-text-color-secondary); font-size: 12px; }
.hotel-quick { margin-top: 16px; }
.hotel-quick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.hotel-quick-action { display: flex; align-items: center; gap: 11px; min-height: 62px; padding: 11px 13px; text-align: left; border: 1px solid #e9eef6; border-radius: 12px; background: #fff; cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.hotel-quick-action:hover { border-color: #b9d4fb; box-shadow: 0 7px 18px rgba(49, 99, 180, .1); transform: translateY(-1px); }
.quick-icon { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border-radius: 10px; font-size: 17px; }
.quick-icon.is-amber { color: #b87512; background: #fff4e2; }
.quick-icon.is-blue { color: #2f6fce; background: #eaf2ff; }
.quick-icon.is-violet { color: #7650a7; background: #f3edff; }
.quick-icon.is-green { color: #21875b; background: #e9f8f0; }
.quick-copy { display: flex; flex-direction: column; min-width: 0; }
.quick-copy strong { color: #2b3a50; font-size: 13px; }
.quick-copy small { margin-top: 2px; color: #93a0b1; font-size: 11px; }
.quick-arrow { margin-left: auto; color: #b2bccb; font-size: 19px; }
.task-heading { align-items: flex-start; }
.task-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: -2px 0 12px; }
.task-pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.task-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.task-filter { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid transparent; border-radius: 999px; color: #7d8ca3; background: #f5f7fa; font-size: 12px; cursor: pointer; }
.task-filter b { min-width: 16px; color: #9aa7b8; font-size: 11px; text-align: center; }
.task-filter.active { border-color: #cfe1ff; color: #2f6fce; background: #edf4ff; }
.task-filter.active b { color: #2f6fce; }

.hotel-page .metric-grid { order: 1; }
.hotel-page .admin-card.room-board-card { order: 2; }
.hotel-page .admin-card { order: 3; }
.hotel-notice { margin-bottom: 12px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.header-actions { display: flex; gap: 8px; }
.quote-box { margin: 12px 0; }
.inline-actions { display: flex; align-items: center; gap: 8px; }
.folio-head { display: flex; gap: 18px; align-items: center; margin-bottom: 12px; }
.deposit-box { display: flex; gap: 8px; margin-top: 12px; }
.muted { color: var(--el-text-color-placeholder); }
.room-board-card { overflow: hidden; }
.room-board-head { align-items: flex-start; }
.room-board-subtitle { margin: 4px 0 0; color: var(--el-text-color-secondary); font-size: 12px; }
.room-board-summary { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.room-floor-tabs { display: flex; align-items: center; gap: 6px; overflow-x: auto; margin: 12px 0 0; padding-bottom: 2px; }
.room-floor-tab { flex: none; padding: 6px 11px; border: 1px solid transparent; border-radius: 8px; color: #6f7e93; background: #f5f7fa; font: inherit; font-size: 12px; cursor: pointer; }
.room-floor-tab b { margin-left: 5px; color: #9aa7b8; font-size: 10px; font-weight: 600; }
.room-floor-tab.active { border-color: #c9ddf8; color: #2f6fce; background: #edf4ff; }
.room-floor-tab.active b { color: #2f6fce; }
.room-floor-tip { margin-left: auto; color: #9aa7b8; font-size: 10px; white-space: nowrap; }
.room-board-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0 14px; padding: 10px 12px; border-radius: 10px; background: #f7f9fc; }
.room-filter-hint { color: #8a96a8; font-size: 11px; }
.room-summary-item { min-width: 62px; padding: 8px 10px; border: 1px solid transparent; border-radius: 10px; background: #f5f7fa; color: #53647b; font: inherit; text-align: center; cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.room-summary-item:hover { border-color: #d7e3f5; transform: translateY(-1px); }
.room-summary-item.is-selected { border-color: #9dbff0; box-shadow: 0 0 0 2px rgba(79, 126, 207, .13); }
.room-summary-item b { display: block; font-size: 18px; line-height: 1.1; }
.room-summary-item small { color: var(--el-text-color-secondary); font-size: 11px; }
.room-summary-item.is-active b { color: #1f9d61; }
.room-summary-item.is-occupied b { color: #3478d4; }
.room-summary-item.is-dirty b { color: #d68a19; }
.room-summary-item.is-maintenance b { color: #8b6bb1; }
.room-board { min-height: 80px; padding-top: 6px; }
.room-board-empty { padding: 28px 0; color: var(--el-text-color-secondary); text-align: center; }
.room-floor + .room-floor { margin-top: 18px; }
.room-floor-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; }
.room-floor-head h4 { margin: 0; font-size: 14px; color: #303f59; }
.room-floor-head span { color: var(--el-text-color-secondary); font-size: 12px; }
.room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(172px, 1fr)); gap: 12px; }
.room-tile { position: relative; display: flex; flex-direction: column; min-height: 178px; padding: 14px 15px; border: 1px solid #e7ecf4; border-left: 4px solid #b9c2d0; border-radius: 14px; background: #fff; box-shadow: 0 3px 10px rgba(33, 48, 74, .035); cursor: pointer; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
.room-tile:hover, .room-tile:focus-visible { z-index: 1; border-color: #a9c9f3; box-shadow: 0 10px 24px rgba(42, 94, 170, .13); transform: translateY(-2px); outline: none; }
.room-tile-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.room-ident { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.room-ident strong { color: #1f2d43; font-size: 22px; line-height: 1.05; letter-spacing: .2px; }
.room-type { overflow: hidden; color: #8b98aa; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.room-status-pill { flex: none; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; line-height: 1.5; white-space: nowrap; }
.room-status-pill.is-active { color: #1d8a5b; background: #eaf8f1; }
.room-status-pill.is-occupied { color: #2f6fce; background: #eaf2ff; }
.room-status-pill.is-dirty { color: #b47716; background: #fff5e2; }
.room-status-pill.is-maintenance { color: #7650a7; background: #f3edff; }
.room-tile-body { display: flex; flex: 1; flex-direction: column; gap: 8px; min-width: 0; margin-top: 10px; }
.room-card-note { display: flex; align-items: center; gap: 5px; min-height: 16px; }
.room-card-note span { padding: 1px 6px; border-radius: 4px; color: #6c7c93; background: #f3f6fa; font-size: 10px; line-height: 1.5; }
.room-card-note span:first-child { color: #b47716; background: #fff6e5; }
.room-guest-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.room-guest-avatar { display: grid; width: 27px; height: 27px; flex: 0 0 27px; place-items: center; border-radius: 50%; color: #3e6fc4; background: #e9f1ff; font-size: 12px; font-weight: 700; }
.room-guest-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.room-guest-copy strong { overflow: hidden; color: #2e3d53; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.room-guest-copy small { color: #9aa5b5; font-size: 10px; }
.room-stay-line { display: flex; align-items: center; gap: 4px; overflow: hidden; color: #7b8a9e; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.room-stay-line .el-icon { flex: none; font-size: 12px; }
.room-vacant { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 78px; color: #a0abba; text-align: center; }
.room-vacant-icon { color: #c2ccda; font-size: 22px; }
.room-vacant span { font-size: 12px; }
.room-vacant small { font-size: 10px; }
.room-finance-hints { display: flex; flex-wrap: wrap; gap: 4px; margin-top: auto; min-height: 15px; }
.room-finance-hint { padding: 1px 5px; border-radius: 4px; color: #5f6f86; background: #f5f7fa; font-size: 10px; line-height: 1.5; white-space: nowrap; }
.room-service-hint { color: #b07a1c; font-size: 10px; }
.room-tile-active { border-left-color: #35b87a; background: linear-gradient(135deg, #fff 65%, #f1fbf6); }
.room-tile-active .room-status-dot { background: #35b87a; box-shadow: 0 0 0 4px rgba(53, 184, 122, .14); }
.room-tile-occupied { border-left-color: #4b8bea; background: linear-gradient(135deg, #fff 65%, #f2f7ff); }
.room-tile-occupied .room-status-dot { background: #4b8bea; box-shadow: 0 0 0 4px rgba(75, 139, 234, .14); }
.room-tile-dirty { border-left-color: #e6a23c; background: linear-gradient(135deg, #fff 65%, #fff9ee); }
.room-tile-dirty .room-status-dot { background: #e6a23c; box-shadow: 0 0 0 4px rgba(230, 162, 60, .14); }
.room-tile-maintenance { border-left-color: #a984c9; background: linear-gradient(135deg, #fff 65%, #faf5ff); }
.room-tile-maintenance .room-status-dot { background: #a984c9; box-shadow: 0 0 0 4px rgba(169, 132, 201, .14); }
.room-detail { display: flex; flex-direction: column; min-height: calc(100vh - 96px); padding: 2px 2px 8px; }
.room-detail-hero { display: flex; flex-direction: column; gap: 8px; padding: 16px 18px; border-radius: 14px; border-left: 5px solid #b9c2d0; background: #f7f9fc; }
.room-detail-hero strong { color: #1f2d43; font-size: 32px; letter-spacing: -.5px; line-height: 1.05; }
.room-detail-eyebrow { color: #7d8ca3; font-size: 12px; }
.room-detail-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.room-detail-status { color: #53647b; font-size: 13px; font-weight: 700; }
.room-detail-status-line { display: flex; align-items: center; gap: 8px; }
.room-detail-badge { padding: 2px 7px; border-radius: 999px; color: #a66d14; background: #fff4df; font-size: 11px; font-weight: 600; }
.room-detail-service { display: flex; align-items: center; gap: 6px; margin-top: 10px; padding: 8px 10px; border-radius: 8px; color: #9a6a19; background: #fff8ea; font-size: 12px; }
.room-detail-active { border-left-color: #35b87a; background: linear-gradient(135deg, #f5fcf8, #eefaf4); }
.room-detail-occupied { border-left-color: #4b8bea; background: linear-gradient(135deg, #f5f9ff, #edf4ff); }
.room-detail-dirty { border-left-color: #e6a23c; background: linear-gradient(135deg, #fffbf3, #fff7e8); }
.room-detail-maintenance { border-left-color: #a984c9; background: linear-gradient(135deg, #fbf7ff, #f5effc); }
.room-detail-facts { margin-top: 14px; }
.room-detail-section { margin-top: 22px; }
.room-detail-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.room-detail-section-head h4 { margin: 0; font-size: 14px; color: #2b3a50; }
.room-detail-section-head > span { color: #9aa5b5; font-size: 11px; }
.room-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.room-facts > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 9px 10px; border-radius: 9px; background: #f7f9fc; }
.room-facts-wide { grid-column: span 2; }
.room-facts span { color: #8b98aa; font-size: 10px; }
.room-facts strong { overflow: hidden; color: #34445c; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.room-guest-card { display: flex; align-items: center; gap: 10px; margin-top: 0; padding: 12px 13px; border: 1px solid #e6edf7; border-radius: 11px; background: #fff; }
.room-guest-card-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.room-guest-card strong { color: #26364d; font-size: 15px; }
.room-guest-card span { color: #8492a6; font-size: 12px; }
.room-guest-avatar-lg { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 50%; font-size: 14px; }
.room-finance-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 0; }
.room-finance-summary span { padding: 3px 7px; border-radius: 5px; color: #5b6c83; background: #f3f6fa; font-size: 11px; }
.room-detail-actions { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; padding: 16px 0 4px; border-top: 1px solid #eef2f7; background: linear-gradient(180deg, rgba(255,255,255,.9), #fff 28%); }
.room-detail-actions .el-button { margin-left: 0; }
.room-detail-actions .room-action-wide { flex: 1 1 100%; }
.room-balance-warning { margin-top: 10px; }
.room-empty-note { display: flex; flex-direction: column; gap: 5px; padding: 14px; border-radius: 11px; color: #75849a; background: #f7f9fc; }
.room-empty-note strong { color: #34445c; font-size: 14px; }
.room-empty-note span { font-size: 12px; line-height: 1.6; }
.room-legend { display: flex; gap: 16px; align-items: center; margin-top: 16px; padding-top: 12px; border-top: 1px dashed #e7ebf2; color: #7c8799; font-size: 11px; }
.room-legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.legend-dot.is-active { background: #35b87a; }
.legend-dot.is-occupied { background: #4b8bea; }
.legend-dot.is-dirty { background: #e6a23c; }
.legend-dot.is-maintenance { background: #a984c9; }
@media (max-width: 760px) {
  .room-board-head { flex-direction: column; gap: 10px; }
  .room-board-summary { justify-content: flex-start; }
  .hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .room-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>

<style scoped>
.hotel-cover-img { width: 100%; max-height: 190px; display: block; object-fit: cover; border-radius: 14px; margin: 0 0 16px; }
</style>
