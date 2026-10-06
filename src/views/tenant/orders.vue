<template>
  <div class="room-board-page">
    <OperationsBoard
      v-model:search="keyword"
      v-model:active-tab="selectedArea"
      v-model:active-filter="boardStatus"
      v-model:view-mode="viewMode"
      title="包厢收银台"
      :subtitle="`房态实时看板 · ${lastUpdatedText}`"
      :loading="loading"
      search-placeholder="搜索包厢 / 编号 / 订单号"
      :stats="roomStats"
      :active-stat="boardStatus"
      :tabs="roomAreaTabs"
      :filters="BOARD_FILTERS"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button @click="openVoidApprovals">
          作废审批
        </el-button>
        <el-button type="primary" @click="openCreate()">
          <el-icon><Plus /></el-icon>快速开台
        </el-button>
      </template>

      <!-- 房型筛选：房型名可能很长（如「豪华 VIP 大包房」），这里固定最大宽度 + 省略号 + tooltip 显示全名；
           工具栏本身允许换行（OperationsBoard），长名不会把搜索框/状态筛选挤出容器。 -->
      <template #toolbar-left-extra>
        <!-- 下单时间（createdAt）：from/to 是闭区间，结束端由后端收口到当天 23:59:59；
             本看板没有「查询」按钮，选完即按区间重新拉取。 -->
        <DateRangeFilter v-model="range" @change="load" @clear="load" />
        <el-tooltip v-if="roomTypeOptions.length" :content="selectedRoomTypeLabel" placement="top">
          <el-select
            v-model="selectedRoomType"
            class="board-room-type-select"
            size="small"
            placeholder="全部房型"
          >
            <el-option
              v-for="option in roomTypeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-tooltip>
      </template>

      <!-- 预约「开台生成订单」跳转过来的定位态：说清楚「在看哪个订单」或「为什么看不到」，
           而不是把订单号塞进搜索框让运营猜。 -->
      <el-alert
        v-if="focusedOrderId"
        class="focused-order-alert"
        :type="focusedOrderRow ? 'success' : 'warning'"
        :closable="false"
        show-icon
      >
        <template #title>
          <span v-if="focusedOrderRow">
            已定位预约开台生成的订单
            <b>{{ focusedOrderRow.orderNo || ('#' + focusedOrderId) }}</b>
            <template v-if="focusedOrderRow.roomName">（包厢 {{ focusedOrderRow.roomName }}）</template>
            ，看板只显示该订单所在包厢。
          </span>
          <span v-else>
            未在当前门店「{{ currentStoreName }}」找到订单 #{{ focusedOrderId }}<template
              v-if="focusedOrderStore">，它属于门店「{{ focusedOrderStore.storeName }}」</template>。
          </span>
        </template>
        <div class="focused-order-actions">
          <el-button v-if="!focusedOrderRow && focusedOrderStore" link type="primary" @click="switchToFocusedStore">
            切换到该门店并定位
          </el-button>
          <el-button link @click="clearFocusedOrder">清除定位</el-button>
        </div>
      </el-alert>

      <div v-if="filteredRooms.length" class="room-grid" :class="{ 'list-mode': viewMode === 'list' }">
        <article
          v-for="room in filteredRooms"
          :key="room.id"
          class="room-card"
          :class="room.boardStatus"
          @click="openRoomDetail(room)"
        >
          <div class="room-card-head">
            <div class="room-thumb" :class="{ 'room-thumb--empty': !roomThumb(room) }">
              <img
                v-if="roomThumb(room)"
                class="room-thumb__img"
                :src="roomThumb(room)"
                :alt="room.name + ' 包厢主图'"
                loading="lazy"
                decoding="async"
                @error="markImageFailed('room-' + room.id)"
              />
              <el-icon v-else><Picture /></el-icon>
            </div>
            <div class="room-title">
              <strong>{{ room.name }}</strong>
              <span>{{ roomSubtitle(room) }}</span>
            </div>
            <span class="room-status">{{ room.statusLabel }}</span>
          </div>

          <template v-if="room.boardStatus === 'idle'">
            <div class="idle-content">
              <div class="idle-mark"><el-icon><Check /></el-icon></div>
              <div><strong>可立即开台</strong><p>{{ room.basePriceText }}<template v-if="room.nextReservationText"> · {{ room.nextReservationText }}</template></p></div>
            </div>
            <div class="room-actions">
              <el-button size="small" @click.stop="goReservations(room)">预约</el-button>
              <el-button size="small" type="primary" @click.stop="openCreate(room.id)">立即开台</el-button>
            </div>
          </template>

          <template v-else-if="room.boardStatus === 'reserved'">
            <div class="reservation-content">
              <div><span>预抵时间</span><b>{{ room.reservationTime }}</b></div>
              <div><span>预订人</span><b>{{ room.reservationContact }}</b></div>
              <div><span>预订人数</span><b>{{ room.guests || '—' }} 人</b></div>
              <!-- 已锁房（resource_id 有值）但客人未到店：明确「包厢已留」，与「客户已到店」区分 -->
              <div v-if="room.reservation && room.reservation.resourceId"><span>已留房</span><b>{{ room.reservation.resourceName || '包厢 #' + room.reservation.resourceId }}</b></div>
              <div v-if="room.reservation && room.reservation.arrivedAt"><span>到店时间</span><b>{{ formatTime(room.reservation.arrivedAt) }}</b></div>
            </div>
            <div class="room-actions">
              <el-button size="small" @click.stop="openRoomDetail(room)">预约详情</el-button>
              <el-button
                v-if="canNoShow(room.reservation)"
                size="small"
                plain
                :loading="reservationSubmittingId === room.reservation?.id"
                @click.stop="markReservationNoShow(room)"
              >未到店</el-button>
              <el-button
                size="small"
                type="primary"
                :loading="reservationSubmittingId === room.reservation?.id"
                @click.stop="advanceReservation(room)"
              >{{ reservationActionText(room.reservation) }}</el-button>
            </div>
          </template>

          <template v-else-if="room.boardStatus === 'cleaning'">
            <div class="cleaning-content">
              <el-icon><Service /></el-icon>
              <strong>{{ ROOM_STATE_LABEL.cleaning }}</strong>
              <span>清洁中的包厢不可开台、不可预约</span>
            </div>
            <div class="room-actions">
              <el-button size="small" type="success" :loading="isSubmitting(room)" @click.stop="markRoomCleaned(room)">清洁完成</el-button>
            </div>
          </template>

          <template v-else>
            <div v-if="room.order" class="active-room-content">
              <div class="amount-block"><span>{{ room.boardStatus === 'checkout' ? '应收金额' : '当前消费' }}</span><strong>{{ formatMoney(room.amount) }}</strong></div>
              <div class="elapsed-block"><span>开台时长</span><strong>{{ room.elapsed }}</strong></div>
            </div>
            <div v-else class="missing-order">包厢已占用，订单信息暂未同步</div>
            <div class="room-meta">
              <div v-if="room.area"><span>区域</span><b>{{ room.area }}</b></div>
              <div v-if="room.roomType"><span>房型</span><b>{{ room.roomType }}</b></div>
              <div v-if="room.guests != null"><span>人数</span><b>{{ room.capacity ? room.guests + '/' + room.capacity : room.guests }} 人</b></div>
              <div><span>开台</span><b>{{ room.startedAt }}</b></div>
              <div v-if="room.waiter"><span>服务</span><b>{{ room.waiter }}</b></div>
              <div><span>订单</span><b>{{ room.orderShort }}</b></div>
            </div>
            <div v-if="room.order" class="room-actions">
              <!-- 客户自助加项待确认：卡片上直接标出来并给入口，避免「客人加了、服务员不知道」 -->
              <el-button
                v-if="pendingApprovalStore.countOfOrder(room.order.id) > 0"
                size="small"
                type="warning"
                plain
                @click.stop="pendingApprovalStore.openDrawer()"
              >待确认加项 ×{{ pendingApprovalStore.countOfOrder(room.order.id) }}</el-button>
              <el-button v-if="room.order.status === 'SERVING'" size="small" @click.stop="openItems(room.order)">＋ 加项</el-button>
              <el-button size="small" @click.stop="showBill(room.order)">账单</el-button>
              <el-button v-if="room.order.status === 'DRAFT'" size="small" type="success" @click.stop="confirm(room.order)">确认</el-button>
              <el-button v-if="room.order.status === 'SERVING'" size="small" type="danger" plain @click.stop="closeOrderSession(room.order)">结台</el-button>
              <el-button v-if="room.order.status === 'WAITING_SETTLEMENT'" size="small" type="warning" @click.stop="settle(room.order)">结算</el-button>
              <el-button v-if="room.order.status === 'WAITING_PAYMENT'" size="small" type="success" @click.stop="openCollect(room.order)">收银</el-button>
              <!-- 结台后包厢进入清洁中，但客人可能还在买单：待结账卡片同时给出「清洁完成」，避免清洁状态吞掉收款入口 -->
              <el-button v-if="room.cleaning" size="small" type="success" plain :loading="isSubmitting(room)" @click.stop="markRoomCleaned(room)">清洁完成</el-button>
              <el-dropdown trigger="click" @command="(command) => handleRoomCommand(command, room.order)">
                <el-button size="small" @click.stop>···</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="detail">订单详情</el-dropdown-item>
                    <!-- 取消入口：可取消时正常显示；**已完成时显示但禁用并写明原因**——此前直接隐藏，
                         运营点开 ··· 只看到「订单详情」，会以为「取消订单没反应」。
                         已作废/已取消的订单本身已终止，不再出现（另有「库存处理」入口）。 -->
                    <el-dropdown-item
                      v-if="canCancelOrder && showCancelItem(room.order.status)"
                      command="cancel"
                      :disabled="!canVoid(room.order.status)"
                      divided
                    >{{ cancelMenuText(room.order.status) }}</el-dropdown-item>
                    <el-dropdown-item
                      v-if="canCancelOrder && canVoid(room.order.status)"
                      command="void-request"
                    >申请作废</el-dropdown-item>
                    <el-dropdown-item v-if="room.order.status === 'VOIDED'" command="recovery" divided>库存处理</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </article>
      </div>
      <el-empty v-else :description="roomEmptyText" :image-size="96" />
    </OperationsBoard>

    <el-drawer v-model="detailVisible" size="440px" class="room-detail-drawer">
      <template #header>
        <div v-if="detailRoom" class="drawer-title">
          <div>
            <h3>{{ detailRoom.name }}</h3>
            <p>{{ roomSubtitle(detailRoom) }}</p>
          </div>
          <span class="room-status" :class="detailRoom.boardStatus">{{ detailRoom.statusLabel }}</span>
        </div>
      </template>
      <div v-if="detailRoom" v-loading="detailLoading" class="room-detail">
        <div class="detail-total" :class="detailRoom.boardStatus">
          <div><span>{{ detailRoom.order ? '当前账单金额' : '当前状态' }}</span><strong>{{ detailRoom.order ? billMoney(detailRoom.amount, detailBill) : detailRoom.statusLabel }}</strong></div>
          <b>{{ detailRoom.elapsed }}</b>
        </div>
        <h4>包厢与订单信息</h4>
        <div class="detail-grid">
          <div><span>包厢编号</span><b>{{ detailRoom.code }}</b></div>
          <div v-if="detailRoom.capacity"><span>容纳人数</span><b>{{ detailRoom.capacity }} 人</b></div>
          <div v-else>
            <span>容纳人数</span>
            <b class="pending-field" :title="detailRoom.resource ? NOT_FILLED_TIP : NOT_INTEGRATED_TIP">{{ detailRoom.resource ? NOT_FILLED : NOT_INTEGRATED }}</b>
          </div>
          <div><span>订单号</span><b>{{ detailRoom.order?.orderNo || '暂未开台' }}</b></div>
          <div><span>开台时间</span><b>{{ detailRoom.startedAt }}</b></div>
          <div v-if="detailRoom.area"><span>所属区域</span><b>{{ detailRoom.area }}</b></div>
          <div v-else><span>所属区域</span><b class="pending-field" :title="NOT_INTEGRATED_TIP">{{ NOT_INTEGRATED }}</b></div>
          <div v-if="detailRoom.roomType"><span>房型</span><b>{{ detailRoom.roomType }}</b></div>
          <div v-else><span>房型</span><b class="pending-field" :title="NOT_INTEGRATED_TIP">{{ NOT_INTEGRATED }}</b></div>
          <div v-if="detailRoom.waiter"><span>服务人员</span><b>{{ detailRoom.waiter }}</b></div>
          <div v-else><span>服务人员</span><b class="pending-field" :title="NOT_INTEGRATED_TIP">{{ NOT_INTEGRATED }}</b></div>
          <div v-if="detailRoom.guests != null"><span>当前人数</span><b>{{ detailRoom.guests }} 人</b></div>
          <div v-else><span>当前人数</span><b class="pending-field" :title="NOT_INTEGRATED_TIP">{{ NOT_INTEGRATED }}</b></div>
          <div>
            <span>基础房费</span>
            <b :title="detailBasePriceText">{{ detailBasePriceText }}</b>
          </div>
          <div><span>预约信息</span><b>{{ detailRoom.reservationContact || '无' }}</b></div>
        </div>
        <template v-if="detailRoom.order">
          <h4>消费明细</h4>
          <div v-if="detailBill" class="drawer-bill">
            <div class="bill-row"><span>币种</span><b>{{ currencyText(detailBill.currencyCode) }}</b></div>
            <div v-if="detailBill.roomFee" class="bill-row"><span>{{ detailBill.roomFee.name || '包厢费' }}</span><b>{{ billMoney(detailBill.roomFee.amount, detailBill) }}</b></div>
            <div v-for="(it, i) in (detailBill.items || [])" :key="'detail-item-' + i" class="bill-row"><span>{{ it.name || '加项' }}</span><b>{{ billMoney(it.amount, detailBill) }}</b></div>
            <div v-for="(server, i) in (detailBill.servers || [])" :key="'detail-server-' + i" class="bill-row"><span>{{ server.serverName || server.server_name || '服务人员' }}</span><b>{{ billMoney(server.amount, detailBill) }}</b></div>
            <div v-if="!(detailBill.roomFee || detailBill.items?.length || detailBill.servers?.length)" class="detail-placeholder">暂无消费明细</div>
          </div>
          <div v-else-if="!detailLoading" class="detail-placeholder">账单暂未生成</div>
        </template>
      </div>
      <template #footer>
        <div v-if="detailRoom?.order" class="drawer-footer">
          <el-button @click="showBill(detailRoom.order)">完整账单</el-button>
          <el-button v-if="detailRoom.order.status === 'SERVING'" type="primary" @click="openItems(detailRoom.order)">点单/加项</el-button>
          <el-button v-if="detailRoom.order.status === 'WAITING_SETTLEMENT'" type="warning" @click="settle(detailRoom.order)">结算</el-button>
          <el-button v-if="detailRoom.order.status === 'WAITING_PAYMENT'" type="success" @click="openCollect(detailRoom.order)">收银</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 开台/下单 -->
    <el-dialog v-model="createVisible" title="开台/下单" width="480px">
      <el-form label-width="80px">
        <el-form-item label="门店">
          <el-input :model-value="'#' + currentStoreId" disabled />
        </el-form-item>
        <el-form-item label="包厢">
          <el-select v-model="createForm.resourceId" placeholder="选择包厢" style="width: 100%" :loading="resourcesLoading">
            <el-option
              v-for="r in resources"
              :key="r.id"
              :label="(r.name || r.resourceCode) + (r.available === false ? '（占用）' : '')"
              :value="r.id"
              :disabled="r.available === false"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="人数">
          <el-input-number
            v-model="createForm.partySize"
            :min="1"
            :max="selectedRoomCapacity || 999"
            style="width: 100%"
            placeholder="到店人数（选填）"
          />
        </el-form-item>
      </el-form>
      <p class="create-hint">
        <template v-if="selectedRoomCapacity">该包厢容纳上限 {{ selectedRoomCapacity }} 人；</template>
        人数留空表示不登记，登记后会话详情、订单列表与房态看板都会展示。
      </p>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="doCreate">确认开台</el-button>
      </template>
    </el-dialog>

    <!-- 取消订单：应用内弹窗（原因必填），不用 ElMessageBox.prompt（真机上不响应且残留节点） -->
    <CancelReasonDialog
      v-model="cancelDialogVisible"
      title="取消订单"
      :loading="cancelSubmitting"
      :message="cancelDialogMessage"
      @confirm="submitCancelOrder"
    />

    <el-dialog v-model="voidRequestVisible" title="申请作废订单" width="520px">
      <el-form label-width="90px">
        <el-form-item label="订单号"><el-input :model-value="voidRequestOrder?.orderNo || voidRequestOrder?.id" disabled /></el-form-item>
        <el-form-item label="作废原因" required>
          <el-input v-model="voidRequestReason" type="textarea" :rows="4" maxlength="512" show-word-limit placeholder="请填写作废原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="voidRequestVisible = false">取消</el-button>
        <el-button type="primary" :loading="voidRequestSubmitting" @click="submitVoidRequest">提交审批</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="voidApprovalsVisible" title="订单作废审批" width="900px">
      <div class="filter-bar">
        <el-select v-model="voidApprovalStatus" style="width: 160px" @change="loadVoidApprovals">
          <el-option label="全部状态" value="" />
          <el-option label="待审批" value="PENDING" />
          <el-option label="已执行" value="EXECUTED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
        <el-button :loading="voidApprovalsLoading" @click="loadVoidApprovals">刷新</el-button>
      </div>
      <el-table :data="voidApprovals" border stripe v-loading="voidApprovalsLoading">
        <el-table-column prop="orderId" label="订单ID" width="100" />
        <el-table-column prop="reason" label="申请原因" min-width="220" show-overflow-tooltip />
        <el-table-column label="状态" width="110"><template #default="{ row }">{{ voidApprovalStatusText(row.status) }}</template></el-table-column>
        <el-table-column prop="applicantId" label="申请人" width="100" />
        <el-table-column label="申请时间" width="170"><template #default="{ row }">{{ timeText(row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'PENDING'">
              <el-button link type="success" :loading="voidApprovalSubmittingId === row.id" @click="reviewVoidApproval(row, true)">批准</el-button>
              <el-button link type="danger" :loading="voidApprovalSubmittingId === row.id" @click="reviewVoidApproval(row, false)">驳回</el-button>
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!voidApprovalsLoading && !voidApprovals.length" description="暂无作废审批记录" />
    </el-dialog>

    <el-dialog v-model="recoveryVisible" title="作废订单库存处理" width="680px">
      <el-table :data="recoveryItems" border stripe>
        <el-table-column prop="nameSnapshot" label="商品" min-width="180" />
        <el-table-column prop="quantity" label="数量" width="90" />
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button type="success" size="small" @click="decideRecovery(row, true)">确认回补</el-button>
            <el-button type="warning" size="small" @click="decideRecovery(row, false)">确认不回补</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!recoveryItems.length" description="没有待处理库存明细" />
    </el-dialog>

    <!-- 账单详情：按「这笔钱是什么」组织（单据头 → 计费说明 → 加项/服务人员 → 优惠 → 合计/已收/应收），
         不是把后端字段名逐个摊开。 -->
    <el-dialog v-model="billVisible" title="账单详情" width="640px">
      <div v-if="bill" class="bill">
        <div class="bill-head">
          <div class="bill-head__line">
            <b>{{ billOrder?.orderNo || ('订单 #' + (billOrder?.id || '')) }}</b>
            <el-tag v-if="billStatusText" size="small" :type="billStatusTagType">{{ billStatusText }}</el-tag>
          </div>
          <div class="bill-head__meta">
            <span v-if="billOrder?.roomName">包厢：{{ billOrder.roomName }}</span>
            <span v-if="billOrder?.roomCode">编号：{{ billOrder.roomCode }}</span>
            <span>币种：{{ currencyText(bill.currencyCode) }}</span>
          </div>
        </div>

        <div v-if="bill.roomFee" class="bill-section">
          <div class="bill-section__label">包厢费（计时）</div>
          <div class="bill-row">
            <span>{{ bill.roomFee.name || '包厢费' }}</span>
            <b>{{ billMoney(bill.roomFee.amount, bill) }}</b>
          </div>
          <!-- 计费口径解释：所有数字都来自服务端账单字段，页面只拼文案、不做任何算术 -->
          <div class="bill-explain">
            <span v-if="bill.roomFee.planName">计费方案 {{ bill.roomFee.planName }}</span>
            <template v-if="bill.roomFee.durationKnown">
              <span>
                计费 {{ durationTextFromSeconds(bill.roomFee.durationSeconds) }}
                <template v-if="bill.roomFee.pausedSeconds > 0">（已扣暂停 {{ durationTextFromSeconds(bill.roomFee.pausedSeconds) }}）</template>
              </span>
            </template>
            <span v-else>时长未记录：{{ roomFeeSourceText(bill.roomFee) }}</span>
            <span>
              {{ billMoney(bill.roomFee.unitPrice, bill) }} × {{ bill.roomFee.quantity }} 个计费单位
              <template v-if="bill.roomFee.incrementMinutes > 0">（每 {{ bill.roomFee.incrementMinutes }} 分钟一档，不足一档让利不计）</template>
            </span>
            <span v-if="bill.roomFee.overSeconds > 0">
              其中超时 {{ durationTextFromSeconds(bill.roomFee.overSeconds) }}（标准 {{ durationTextFromSeconds(bill.roomFee.standardSeconds) }}，超时按 {{ bill.roomFee.overtimeRate }} 倍计）
            </span>
            <span v-if="bill.roomFee.roomFeeIncludesServer">已含 1 名标准服务人员</span>
            <span v-if="bill.roomFee.snapshotAt">金额固化于 {{ formatTime(bill.roomFee.snapshotAt) }}</span>
            <span v-if="bill.roomFee.periodStart">开台 {{ formatTime(bill.roomFee.periodStart) }}</span>
            <span v-if="bill.roomFee.periodEnd">结台 {{ formatTime(bill.roomFee.periodEnd) }}</span>
          </div>
          <el-alert
            v-if="billOpen"
            class="bill-note"
            type="info"
            :closable="false"
            show-icon
            title="该订单还在开台中：以上金额是实时值，会随计费时长增长；结台后按结台时间精确重算并固化。挂单（暂停）期间不计费。"
          />
        </div>

        <div v-if="(bill.items || []).length" class="bill-section">
          <div class="bill-section__label">加项（酒水/小食等）</div>
          <div v-for="(it, i) in (bill.items || [])" :key="'item' + i" class="bill-row">
            <span>
              {{ it.name || '加项' }}
              <em v-if="it.quantity != null">× {{ it.quantity }}</em>
              <em v-if="it.unitPrice != null">@ {{ billMoney(it.unitPrice, bill) }}</em>
            </span>
            <b>{{ billMoney(it.amount, bill) }}</b>
          </div>
        </div>

        <div v-if="(bill.servers || []).length" class="bill-section">
          <div class="bill-section__label">服务人员</div>
          <div v-for="(s, i) in (bill.servers || [])" :key="'srv' + i" class="bill-row">
            <span>
              {{ s.serverName || s.server_name || '服务人员' }}
              <em v-if="s.durationSeconds">{{ durationTextFromSeconds(s.durationSeconds) }}</em>
              <em v-if="s.unitPrice != null">@ {{ billMoney(s.unitPrice, bill) }}</em>
              <em v-if="s.quantity != null">× {{ s.quantity }} 个计费单位</em>
            </span>
            <b>{{ Number(s.amount || 0) === 0 ? '已含在包厢费内' : billMoney(s.amount, bill) }}</b>
          </div>
        </div>

        <div v-if="(bill.promotions || []).length" class="bill-section">
          <div class="bill-section__label">优惠（已从合计中扣除）</div>
          <div v-for="(p, i) in (bill.promotions || [])" :key="'promo' + i" class="bill-row promo">
            <span>{{ promotionTypeText(p.type) }}</span><b>-{{ billMoney(p.amount, bill) }}</b>
          </div>
        </div>

        <el-divider />
        <!-- 合计的构成：原价合计（包厢费 + 加项 + 服务人员费）− 优惠 + 税 = 合计，数字全部来自服务端 -->
        <div v-if="bill.subtotalAmount != null" class="bill-explain">
          <span>原价合计 {{ billMoney(bill.subtotalAmount, bill) }}</span>
          <span v-if="bill.discountAmount > 0">优惠 -{{ billMoney(bill.discountAmount, bill) }}</span>
          <span v-if="bill.taxAmount > 0">税 +{{ billMoney(bill.taxAmount, bill) }}</span>
        </div>
        <div class="bill-row total">
          <span>合计（优惠后）</span><b>{{ billMoney(bill.totalAmount, bill) }}</b>
        </div>
        <div class="bill-row">
          <span>已收</span>
          <b>
            现金 {{ billMoney(bill.collected?.cash, bill) }}
            · {{ walletBrand }} {{ collectedWalletText(bill.collected) }}
            · 积分 {{ formatPoints(bill.collected?.points) }}
          </b>
        </div>
        <div v-if="bill.payableAmount != null" class="bill-row total">
          <span>应收（合计 − 已收）</span><b>{{ billMoney(bill.payableAmount, bill) }}</b>
        </div>
        <div v-if="Number(bill.changeAmount || 0) > 0" class="bill-row">
          <span>找零</span><b>{{ billMoney(bill.changeAmount, bill) }}</b>
        </div>
      </div>
      <div v-else class="bill-empty">账单加载中或暂不可用</div>
      <template #footer>
        <el-button @click="billVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 点单/加项 -->
    <el-dialog v-model="itemsVisible" :title="'点单/加项 · ' + (itemsOrder?.orderNo || '#' + (itemsOrder?.id || ''))" width="760px" @closed="resetCatalogSelection">
      <div v-if="itemsOrder" class="bill">
        <div v-if="!items.length" class="bill-row"><span>暂无加项</span></div>
        <div v-for="it in items" :key="it.id" class="bill-row">
          <span>{{ it.nameSnapshot }} × {{ it.quantity }}</span>
          <span style="margin-left:auto;display:inline-flex;gap:8px;align-items:center">
            <el-tag :type="orderItemStatusType(it.status)" size="small">{{ orderItemStatusText(it.status) }}</el-tag>
            <b>{{ formatMoney(it.totalAmount) }}</b>
            <el-button v-if="it.status === 'PENDING_APPROVAL'" link type="success" size="small" @click="confirmItemRow(it)">确认</el-button>
            <el-button v-if="it.status === 'PENDING_APPROVAL'" link type="danger" size="small" @click="rejectItemRow(it)">拒绝</el-button>
          </span>
        </div>
        <el-divider />
        <div class="catalog-bar">
          <div class="catalog-head">
            <span class="catalog-label">从点单目录加项</span>
            <el-radio-group v-model="catalogCategory" size="small" @change="applyCatalogCategory">
              <el-radio-button label="">全部</el-radio-button>
              <el-radio-button v-for="c in catalogCategories" :key="c" :label="c">{{ c }}</el-radio-button>
            </el-radio-group>
            <el-button link type="primary" size="small" @click="openCatalogManage"><el-icon><Setting /></el-icon>目录管理</el-button>
          </div>
          <div v-if="catalogLoading" class="muted">点单目录加载中…</div>
          <div v-else class="catalog-grid">
            <div v-for="c in catalog" :key="c.id" class="catalog-cell" :class="{ 'catalog-cell-disabled': c.available === false }">
              <div class="catalog-thumb" :class="{ 'catalog-thumb--empty': !catalogThumb(c) }">
                <img
                  v-if="catalogThumb(c)"
                  class="catalog-thumb__img"
                  :src="catalogThumb(c)"
                  :alt="c.name + ' 商品图'"
                  loading="lazy"
                  decoding="async"
                  @error="markImageFailed('catalog-' + c.id)"
                />
                <el-icon v-else><Picture /></el-icon>
              </div>
              <div class="catalog-cell__body">
                <div class="catalog-name">{{ c.name }}<el-tag v-if="c.itemType && c.itemType !== 'PRODUCT'" type="warning" size="small" style="margin-left:6px">{{ catalogItemTypeText(c.itemType) }}</el-tag><el-tag v-if="c.available === false" type="info" size="small" style="margin-left:6px">{{ c.unavailableReason || '不可点' }}</el-tag></div>
                <div class="catalog-meta">{{ c.unit ? c.unit + ' · ' : '' }}<b>{{ formatMoney(c.unitPrice) }}</b><span v-if="c.availableQuantity != null" class="catalog-stock"> · 库存 {{ c.availableQuantity }}</span></div>
                <div class="catalog-cat">{{ c.category }}</div>
              </div>
              <div class="catalog-stepper">
                <el-button
                  circle
                  size="small"
                  :icon="Minus"
                  :disabled="catalogSubmitting || catalogSelectionQuantity(c.id) <= 0"
                  aria-label="减少数量"
                  @click="decreaseCatalogSelection(c)"
                />
                <el-input-number
                  class="catalog-stepper__input"
                  :model-value="catalogSelectionQuantity(c.id)"
                  :min="0"
                  :max="catalogSelectionMax(c)"
                  :precision="0"
                  :step="1"
                  :controls="false"
                  size="small"
                  :disabled="catalogSubmitting || c.available === false"
                  :aria-label="'输入' + c.name + '数量'"
                  @change="(value) => updateCatalogSelection(c, value)"
                />
                <el-button
                  circle
                  size="small"
                  type="primary"
                  :icon="Plus"
                  :disabled="catalogSubmitting || c.available === false"
                  aria-label="增加数量"
                  @click="increaseCatalogSelection(c)"
                />
              </div>
            </div>
            <div v-if="!catalog.length" class="muted">该分类暂无可点目录项，可在「目录管理」中添加</div>
          </div>
          <!-- 服务加项与「服务人员点单」的关系：同一份 item_type=SERVICE 目录项，两条计费路径，不造第二套。 -->
          <p v-if="catalogHasService" class="catalog-service-hint">
            服务类目录项按其单价计费且不占库存；KTV 服务人员按时长计费（服务端按服务人员会话结算）。两者共用同一份服务目录项，
            这里选中的服务按目录单价计入加项，不会与按时长的服务人员费重复计费。
          </p>
        </div>
        <el-divider />
        <div class="items-footer-bar">
          <div class="catalog-selection-summary">
            <div class="catalog-selection-summary__head">
              <strong>本次已选商品</strong>
              <span v-if="selectedCatalogQuantity">共 {{ selectedCatalogQuantity }} 件</span>
            </div>
            <div v-if="selectedCatalogItems.length" class="catalog-selection-list">
              <div v-for="item in selectedCatalogItems" :key="item.catalogItem.id" class="catalog-selection-row">
                <span class="catalog-selection-row__name">{{ item.catalogItem.name }}</span>
                <span>× {{ item.quantity }}{{ item.catalogItem.unit || '件' }}</span>
                <b>{{ formatMoney(item.totalAmount) }}</b>
              </div>
            </div>
            <span v-else class="muted">暂未选择商品，请从上方点单目录添加</span>
            <div class="catalog-selection-total">
              <span>合计数量：{{ selectedCatalogQuantity }} 件</span>
              <strong>总价：{{ formatMoney(selectedCatalogTotal) }}</strong>
            </div>
            <span class="muted">服务端将按目录项快照名称与单价计费，请确认商品、数量和总价后提交。</span>
          </div>
          <el-button
            v-if="itemsOrder?.status === 'SERVING'"
            type="primary"
            :loading="catalogSubmitting"
            :disabled="!selectedCatalogQuantity"
            @click="confirmCatalogSelection"
          >确认加项</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="itemsVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 点单目录管理 -->
    <el-dialog v-model="catalogManageVisible" title="点单目录管理" width="760px" @closed="resetCatalogForm">
      <div class="catalog-manage-toolbar">
        <el-input v-model="catalogManageKeyword" placeholder="搜索名称 / 分类 / 类型" clearable style="width: 260px" />
        <span class="muted">共 {{ catalogManageRows.length }} 个商品</span>
      </div>
      <el-table :data="catalogManageRows" v-loading="catalogLoading" size="small" max-height="360" border>
        <el-table-column prop="category" label="分类" width="90" />
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column label="类型" width="80" align="center">
          <template #default="{ row }">{{ catalogItemTypeText(row.itemType) }}</template>
        </el-table-column>
        <el-table-column label="单价" width="90" align="right">
          <template #default="{ row }">{{ formatMoney(row.unitPrice) }}</template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="60" align="center" />
        <el-table-column label="操作" width="130" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="editCatalogRow(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="deleteCatalogRow(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty><el-empty description="没有符合条件的目录商品" :image-size="60" /></template>
      </el-table>
      <el-divider content-position="left">{{ catalogEditingId ? '编辑商品' : '新增商品' }}</el-divider>
      <el-form :model="catalogForm" label-width="76px" class="catalog-manage-form">
        <el-form-item label="分类" required>
          <el-input v-model="catalogForm.category" placeholder="酒水 / 小吃 / 加钟 / 服务 / 套餐" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="catalogForm.name" placeholder="商品名称" />
        </el-form-item>
        <el-form-item label="单价" required>
          <el-input-number v-model="catalogForm.priceYuan" :min="0.01" :precision="2" :step="0.5" style="width: 100%" />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="catalogForm.unit" placeholder="瓶 / 份 / 小时 / 套" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="catalogForm.itemType" style="width: 100%">
            <el-option label="服务" value="SERVICE" />
            <el-option label="套餐" value="PACKAGE" />
            <el-option label="加项" value="ADD_ON" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="catalogEditingId" @click="resetCatalogForm">取消编辑</el-button>
        <el-button type="primary" :loading="catalogSaving" @click="saveCatalogItem">{{ catalogEditingId ? '保存修改' : '新增商品' }}</el-button>
      </template>
    </el-dialog>

    <!-- 收银：组合支付（抵扣顺序 积分 → 储值 → 现金补差额，每笔 ≤ 剩余应收，合计 = 应收） -->
    <el-dialog v-model="collectVisible" :title="'收银 · ' + (collectOrder?.orderNo || '#' + (collectOrder?.id || ''))" width="560px">
      <el-form label-width="110px">
        <el-form-item label="应收金额">
          <span class="collect-amount">{{ formatMoney(payableMinor) }}</span>
          <span class="collect-muted">订单合计 {{ formatMoney(collectOrder?.totalAmount) }} − 已收 {{ formatMoney(collectOrder?.paidAmount) }}</span>
        </el-form-item>
        <el-form-item v-if="memberSelectable" label="客户">
          <div class="member-picker">
            <el-input v-model="memberKeyword" placeholder="手机号 / 客户号" style="width: 170px" @keyup.enter="searchMembers" />
            <el-button :loading="searchingMembers" @click="searchMembers">查询</el-button>
            <el-select v-if="memberResults.length" v-model="selectedMemberId" placeholder="选择客户" style="width: 190px" @change="onMemberChange">
              <el-option v-for="m in memberResults" :key="m.id" :label="m.name || m.phone || m.memberNo" :value="m.id" />
            </el-select>
            <span v-if="selectedMemberId" class="collect-muted">{{ formatTokens(memberWalletTokens) }} · {{ formatPoints(memberPoints) }}</span>
          </div>
        </el-form-item>
        <el-divider content-position="left">支付拆分（抵扣顺序：积分 → {{ walletBrand }} → 现金）</el-divider>
        <el-form-item v-for="m in collectMethods" :key="m.method" :label="methodLabel(m.method, walletBrand)">
          <el-input-number
            v-model="payByLeg[m.method]"
            :min="0"
            :precision="legInputPrecision(m.method)"
            :step="legInputStep(m.method)"
            style="width:100%"
            @change="() => clampLeg(m.method)"
          />
          <span v-if="isQuantityLeg(m.method)" class="collect-muted">按数量填写（{{ methodLabel(m.method, walletBrand) }}个数，不带币种）</span>
        </el-form-item>
        <el-form-item label="已填合计">
          <span :class="filledMinor === payableMinor && payableMinor > 0 ? 'collect-amount' : 'collect-mismatch'">{{ formatMoney(filledMinor) }}</span>
          <span v-if="filledMinor !== payableMinor" class="collect-mismatch">（须等于应收 {{ formatMoney(payableMinor) }}）</span>
          <el-button link type="primary" @click="autoFill">自动抵扣</el-button>
          <el-button link @click="clearLegs">清零</el-button>
          <span class="collect-muted">合计是金额口径：储值币 / 积分数量按租户比例折算为金额后再校验</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="collectVisible = false">取消</el-button>
        <el-button type="primary" :loading="collecting" :disabled="!collectMethods.length" @click="doCollect">确认收款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Check, Grid, Minus, Money, Picture, Plus, Refresh, Service, Setting, Tickets, Timer } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import OperationsBoard from '@/components/OperationsBoard.vue'
import DateRangeFilter from '@/components/DateRangeFilter.vue'
import CancelReasonDialog from '@/components/CancelReasonDialog.vue'
import { listOrders, createOrder, confirmOrder, settleOrder, cancelOrder, openSession, getBill, getKtvPricing, listResources as listBusinessResources, addItem, listOrderItems, confirmItem, rejectItem, closeSession, getOrderSession, listCatalog, createCatalogItem, updateCatalogItem, disableCatalogItem, listInventoryRecovery, decideInventoryRecovery, requestVoidApproval, listVoidApprovals, approveVoidApproval, rejectVoidApproval } from '@/api/order'
import { collect, listPaymentMethods } from '@/api/payment'
import { listMembers, getMemberWallet, getMemberPoints } from '@/api/member'
import { getWalletTokenConfig } from '@/api/admin'
import { parseImageUrls } from '@/api/media'
import { currencyText, formatMoney, formatPoints, formatTime, formatTimeWithSeconds, formatTokens, formatYuanCompact, fenToYuan, promotionTypeText, resolveTokenCount, resolveTokenRatio, yuanToFen } from '@/utils/format'
import { resolveRoomPrice, roomBasePriceText, roomPriceFromPricing } from '@/utils/roomPricing'
import { durationTextFromSeconds, roomFeeSourceText } from '@/utils/billExplain'
import { dateRangeParams, dateRangeWarning, emptyDateRange } from '@/utils/dateRange'
import { notifyAdminRequestError, notifyCancelRequestError, resolveAdminErrorMessage, ORDER_HAS_PAYMENT_REFUND_FIRST_TEXT } from '@/utils/adminErrorMessage'
import { submitCancelWithReason, CANCEL_REASON_MAX_LENGTH } from '@/utils/cancelAction'
import { hasPermissionOrMissing } from '@/utils/context'
import { collectedLegText, isQuantityLeg, legInputPrecision, legInputStep, legInputToMinor, legMinorToInput, methodLabel, orderAllowedMethods } from '@/constants/payment-methods'
import { RESOURCE_STATE_TEXT, WALLET_BRAND_NAME_DEFAULT, catalogItemTypeText, orderItemStatusText, orderItemStatusType, orderStatusText, reservationBoardActionText, reservationBoardStateText, resolveWalletBrandName } from '@/constants/terms'
import { arrivalReservation, confirmReservation, getReservations, noShowReservation, openTableReservation } from '@/api/reservation'
import { canMarkNoShow, isReservationRoomAssigned } from '@/utils/reservationRoom'
import { listResources as listAdminResources, setRoomCleaningStatus } from '@/api/resource'
import { useContextStore } from '@/stores/context'
import { isAlreadyProcessed, usePendingApprovalStore } from '@/stores/pendingApproval'
import { useCurrencyStore } from '@/stores/currency'

const contextStore = useContextStore()
const pendingApprovalStore = usePendingApprovalStore()
/**
 * 待确认加项被**确认/拒绝**后，服务端该订单的明细与金额已经变了：抽屉自己会刷新，但收银台卡片的
 * 金额、房态与订单列表是本页缓存的 → 必须重拉，否则卡片停在旧值（与结账抽屉、C 端账单对不上）。
 * store 里的 `orderDataRevision` 就是「订单数据被改动过」的信号，这里只负责重拉自己。
 */
watch(() => pendingApprovalStore.orderDataRevision, () => { load() })
// 全局币种（唯一来源）：写请求体的 currencyCode 与无快照金额的展示都取它。
const currencyStore = useCurrencyStore()

/**
 * 账单/单据金额展示：记录带 currencyCode 快照时以记录为准（§3.5「快照优先」，
 * 已结算单据改设置不改显示），缺快照才回落到全局当前币种。
 */
function billMoney(minor, record) {
  return formatMoney(minor, record?.currencyCode)
}

/**
 * 账单已收里的储值分项：`collected.wallet` 是最小货币单位金额（服务端口径），
 * 界面只显示代币**数量**（纯数字，不带品牌名后缀；名字由「已收（现金/品牌名/积分）」标签承担），
 * 服务端 `walletTokenAmount` 优先，缺字段按租户比例降级换算。
 */
function collectedWalletText(collected) {
  return formatTokens(resolveTokenCount(collected?.walletTokenAmount, collected?.wallet, walletRatio.value))
}
const route = useRoute()
const router = useRouter()

/**
 * 订单状态文案唯一出处是 constants/terms 的 ORDER_STATUS_TEXT（orderStatusText），
 * 页面不再内联「进行中/待结算/…」映射，避免与后端新增状态脱节。
 */
/**
 * 看板列状态（前端组合态）→ 后端资源状态枚举。
 * 状态文案唯一出处是 constants/terms 的 RESOURCE_STATE_TEXT，页面不再内联「空闲/使用中/清洁中」。
 */
const BOARD_RESOURCE_STATE = { idle: 'IDLE', serving: 'IN_USE', reserved: 'RESERVED', cleaning: 'CLEANING' }
/** 待结账是订单派生态（WAITING_SETTLEMENT/WAITING_PAYMENT），资源状态词表无对应枚举，单独登记一处。 */
const CHECKOUT_TEXT = '待结账'
function boardStateText(state) {
  if (state === 'checkout') return CHECKOUT_TEXT
  return RESOURCE_STATE_TEXT[BOARD_RESOURCE_STATE[state]] || '未知'
}

/** 统计磁贴与筛选条共用同一份状态文案（键与 roomSummary / boardStatus 对齐）。 */
const ROOM_STATE_LABEL = {
  all: '全部',
  idle: boardStateText('idle'),
  serving: boardStateText('serving'),
  checkout: boardStateText('checkout'),
  reserved: boardStateText('reserved'),
  cleaning: boardStateText('cleaning'),
}
const BOARD_FILTERS = Object.entries(ROOM_STATE_LABEL).map(([value, label]) => ({ value, label }))
const ACTIVE_ORDER_STATUSES = new Set(['DRAFT', 'SERVING', 'WAITING_SETTLEMENT', 'WAITING_PAYMENT'])
const ACTIVE_RESERVATION_STATUSES = new Set(['PENDING', 'CONFIRMED', 'ARRIVED'])
const AREA_ALL = '全部区域'
/** 后端订单/会话接口暂未提供的字段：明确标注「未接入」，不再用推测值填充。 */
const NOT_INTEGRATED = '未接入'
const NOT_INTEGRATED_TIP = '后端订单/会话接口暂未提供该字段，接入后自动展示'
/** 后端有该字段、但当前包厢资源未维护值（如未填写容纳人数）。 */
const NOT_FILLED = '未填写'
const NOT_FILLED_TIP = '包厢资源未维护该字段，可在「包厢管理」中补录'
/**
 * 取消订单的权限门禁：与后端 `POST /business/orders/{id}/cancel` 要求的权限码同码
 * （OrderController 的 PermissionGuard 与 iam 权限种子均为 order.void）。
 * 快照缺失时不隐藏入口，越权仍由后端 403 强制。
 */
const ORDER_CANCEL_PERMISSION = 'order.void'

const rows = ref([])
/** 未按门店过滤的订单全集：预约「开台生成订单」跳转时用来定位订单属于哪个门店/包厢。 */
const allOrders = ref([])
const reservations = ref([])
const sessionsByOrder = ref({})
const loading = ref(false)
const keyword = ref('')
/** 时间区间（下单时间 createdAt）：本看板查询条件不是 reactive 对象，区间单独一个 ref。 */
const range = ref(emptyDateRange())
const boardStatus = ref('all')
const selectedArea = ref(AREA_ALL)
const viewMode = ref('grid')
const now = ref(Date.now())
const lastUpdatedAt = ref(null)
/** 图片加载失败的元素（key 形如 room-1 / catalog-9），失败后退回占位，不出现破图。 */
const failedImages = ref({})
let clockTimer = null

/** 单卡片操作中的资源 id 集合：模板用 isSubmitting(room) 禁用/loading，避免重复提交。 */
const submittingIds = ref(new Set())
function isSubmitting(row) {
  return submittingIds.value.has(row?.id)
}
function setSubmitting(id, submitting) {
  const ids = new Set(submittingIds.value)
  if (submitting) ids.add(id)
  else ids.delete(id)
  submittingIds.value = ids
}

const createVisible = ref(false)
const creating = ref(false)
const resources = ref([])
const resourcesLoading = ref(false)
const createForm = ref({ resourceId: null, partySize: null })
/** 门店级计价方案（包厢房费），来自 /business/ktv/pricing，与开台/结台计费同源。 */
const ktvPricing = ref(null)
/**
 * 带 resourceId 的计价结果（生效单价 + roomTypePriceApplied），按包厢缓存：
 * 只在打开某个带房型的包厢详情时请求一次，房态看板刷新不会重复取价。
 */
const roomPricingByResource = ref({})

const billVisible = ref(false)
const bill = ref(null)
/** 账单对应的订单行（单据头展示订单号/包厢/状态；直接按订单号打开时也要有）。 */
const billOrder = ref(null)
/**
 * 「预约开台 → 跳转订单/KTV」的定位态。
 *
 * <p>旧实现把订单号塞进搜索框（`keyword = orderId`）并依赖「在房态行里找到它」：
 * 看板上的状态/区域/房型筛选、以及**门店上下文**只要有一个不匹配，看板就是空的，
 * 运营看到的只是搜索框里一个看不懂的数字。现在改为独立的「定位订单」态：
 * 只显示该订单所在包厢、顶部说明定位到了什么（或为什么看不到），账单**直接按订单号拉取**。
 */
const focusedOrderId = ref('')
const focusedOrderRow = ref(null)
const focusedOrderStore = ref(null)

const itemsVisible = ref(false)
const itemsOrder = ref(null)
const items = ref([])

const catalog = ref([])
const catalogAll = ref([])
const catalogCategories = ref([])
const catalogCategory = ref('')
const catalogLoading = ref(false)
const catalogSubmitting = ref(false)
const catalogSelection = ref({})
const selectedCatalogItems = computed(() => catalogAll.value
  .map((catalogItem) => {
    const quantity = catalogSelectionQuantity(catalogItem.id)
    return {
      catalogItem,
      quantity,
      totalAmount: Number(catalogItem.unitPrice || 0) * quantity,
    }
  })
  .filter(({ quantity }) => quantity > 0))
const selectedCatalogQuantity = computed(() => selectedCatalogItems.value
  .reduce((total, item) => total + item.quantity, 0))
const selectedCatalogTotal = computed(() => selectedCatalogItems.value
  .reduce((total, item) => total + item.totalAmount, 0))
const catalogManageVisible = ref(false)
const catalogManageKeyword = ref('')
const catalogEditingId = ref(null)
const catalogSaving = ref(false)
const emptyCatalogForm = () => ({ category: '', name: '', priceYuan: 0, unit: '', itemType: 'SERVICE' })
const catalogForm = ref(emptyCatalogForm())
const catalogManageRows = computed(() => {
  const search = catalogManageKeyword.value.trim().toLowerCase()
  if (!search) return catalogAll.value
  return catalogAll.value.filter((item) => [
    item.name,
    item.category,
    item.unit,
    catalogItemTypeText(item.itemType),
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search)))
})
const recoveryVisible = ref(false)
const recoveryOrder = ref(null)
const recoveryItems = ref([])
const voidRequestVisible = ref(false)
const voidRequestOrder = ref(null)
const voidRequestReason = ref('')
const voidRequestSubmitting = ref(false)
const voidApprovalsVisible = ref(false)
const voidApprovalsLoading = ref(false)
const voidApprovals = ref([])
const voidApprovalStatus = ref('PENDING')
const voidApprovalSubmittingId = ref(null)

const collectVisible = ref(false)
const collecting = ref(false)
const collectOrder = ref(null)
/** 逐笔分腿输入：现金 / 线上是金额（主单位），储值币 / 积分是数量（个数）。 */
const payByLeg = ref({})
const collectMethods = ref([])
const memberKeyword = ref('')
const searchingMembers = ref(false)
const memberResults = ref([])
const selectedMemberId = ref(null)
/** 会员储值余额（最小货币单位，参与合计校验）与其代币数量（只用于展示）。 */
const memberWalletMinor = ref(0)
const memberWalletTokens = ref(0)
const memberPoints = ref(0)
/** 储值展示名默认值与后端 tnt_tenant_config.wallet_brand_name 默认值同源（constants/terms）。 */
const walletBrand = ref(WALLET_BRAND_NAME_DEFAULT)
/** 兑换比例（1 个主单位 = N 个代币）：只用于把金额折成数量展示 / 把数量折回金额，不参与入账金额。 */
const walletRatio = ref(resolveTokenRatio(null))

const detailVisible = ref(false)
const detailRoom = ref(null)
const detailBill = ref(null)
const detailLoading = ref(false)
const reservationSubmittingId = ref(null)

const currentStoreId = computed(() => contextStore.storeId)
/** 当前门店名（上下文里就有，用于「订单不属于当前门店」时的说明文案）。 */
const currentStoreName = computed(() => contextStore.current?.storeName
  || (contextStore.items.find((item) => String(item.storeId) === String(currentStoreId.value)) || {}).storeName
  || (currentStoreId.value ? '门店 #' + currentStoreId.value : '未选择门店'))

/** 取消订单入口的权限门禁（容错：权限快照缺失时不隐藏入口，越权仍由后端 403 兜底）。 */
const canCancelOrder = computed(() => hasPermissionOrMissing(contextStore.current?.permissions, ORDER_CANCEL_PERMISSION))

const activeOrderByResource = computed(() => {
  const result = new Map()
  rows.value
    .filter((order) => ACTIVE_ORDER_STATUSES.has(order.status) && (!order.businessType || order.businessType === 'KTV'))
    .sort((a, b) => dateValue(a.createdAt) - dateValue(b.createdAt))
    .forEach((order) => {
      const session = sessionsByOrder.value[order.id] || {}
      const resourceId = firstValue(order.resourceId, order.roomId, session.roomResourceId, session.resourceId, session.roomId)
      if (resourceId != null) result.set(String(resourceId), order)
    })
  return result
})

const reservationByResource = computed(() => {
  const result = new Map()
  reservations.value
    .filter((reservation) => ACTIVE_RESERVATION_STATUSES.has(reservation.status) && reservation.resourceId != null)
    .sort((a, b) => dateValue(a.startAt) - dateValue(b.startAt))
    .forEach((reservation) => {
      const key = String(reservation.resourceId)
      if (!result.has(key)) result.set(key, reservation)
    })
  return result
})

const roomCards = computed(() => {
  const cards = resources.value
    .filter((resource) => resource.status !== 'DISABLED')
    .map((resource) => normalizeRoom(resource))

  const linkedOrderIds = new Set(cards.map((room) => room.order?.id).filter((id) => id != null))
  rows.value
    .filter((order) => ACTIVE_ORDER_STATUSES.has(order.status) && (!order.businessType || order.businessType === 'KTV') && !linkedOrderIds.has(order.id))
    .forEach((order) => cards.push(normalizeOrphanOrder(order)))

  return cards.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
})

/**
 * 区域筛选：后端资源表目前没有区域/楼层列，只有真正拿到区域时才展示筛选条，
 * 不再用「默认区域」占位（F10）。
 */
const roomAreas = computed(() => {
  const areas = [...new Set(roomCards.value.map((room) => room.area).filter(Boolean))]
  return areas.length ? [AREA_ALL, ...areas] : []
})

/** 房型筛选（「订单/KTV」页）：房型来自后端字典解析后的 roomTypeName，缺房型数据时不展示这一项。 */
const ROOM_TYPE_ALL = ''
/** 未设置房型的包厢：不能因为「没有房型」就被筛选器藏起来，单独给一个筛选项。 */
const ROOM_TYPE_NONE = '__none__'
const selectedRoomType = ref(ROOM_TYPE_ALL)
/** 选中项文案（含「未设置房型」哨兵值）：tooltip 展示全名用，长名被省略时鼠标悬停可见。 */
const selectedRoomTypeLabel = computed(() => {
  const hit = roomTypeOptions.value.find((option) => option.value === selectedRoomType.value)
  return hit ? hit.label : '全部房型'
})
const roomTypeOptions = computed(() => {
  const types = [...new Set(roomCards.value.map((room) => room.roomType).filter(Boolean))].sort()
  if (!types.length) return []
  const options = [{ value: ROOM_TYPE_ALL, label: '全部房型' },
    ...types.map((type) => ({ value: type, label: type }))]
  if (roomCards.value.some((room) => !room.roomType)) {
    options.push({ value: ROOM_TYPE_NONE, label: '未设置房型' })
  }
  return options
})

const filteredRooms = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  return roomCards.value.filter((room) => {
    // 预约开台跳转过来的定位态：只显示目标订单所在包厢（其余筛选一律不做，保证「一定看得到」）。
    if (focusedOrderId.value) return String(room.order?.id) === focusedOrderId.value
    if (boardStatus.value !== 'all' && room.boardStatus !== boardStatus.value) return false
    if (selectedArea.value !== AREA_ALL && room.area !== selectedArea.value) return false
    if (selectedRoomType.value === ROOM_TYPE_NONE) {
      if (room.roomType) return false
    } else if (selectedRoomType.value !== ROOM_TYPE_ALL && room.roomType !== selectedRoomType.value) {
      return false
    }
    if (!search) return true
    return [room.name, room.code, room.order?.orderNo, room.order?.id]
      .filter((value) => value != null)
      .some((value) => String(value).toLowerCase().includes(search))
  })
})

const roomSummary = computed(() => {
  const summary = { total: roomCards.value.length, idle: 0, serving: 0, checkout: 0, reserved: 0, cleaning: 0, currentAmount: 0 }
  roomCards.value.forEach((room) => {
    if (summary[room.boardStatus] != null) summary[room.boardStatus] += 1
    if (room.order && ACTIVE_ORDER_STATUSES.has(room.order.status)) summary.currentAmount += numberValue(room.amount)
  })
  return summary
})

const roomAreaTabs = computed(() => roomAreas.value.map((area) => ({ value: area, label: area })))

const roomStats = computed(() => [
  { key: 'all', label: '全部包厢', value: roomSummary.value.total, suffix: '间', icon: Grid, tone: 'total', filterValue: 'all' },
  { key: 'idle', label: ROOM_STATE_LABEL.idle, value: roomSummary.value.idle, suffix: '间', icon: Check, tone: 'idle', filterValue: 'idle' },
  { key: 'serving', label: ROOM_STATE_LABEL.serving, value: roomSummary.value.serving, suffix: '间', icon: Timer, tone: 'serving', filterValue: 'serving' },
  { key: 'checkout', label: ROOM_STATE_LABEL.checkout, value: roomSummary.value.checkout, suffix: '间', icon: Money, tone: 'checkout', filterValue: 'checkout' },
  { key: 'reserved', label: ROOM_STATE_LABEL.reserved, value: roomSummary.value.reserved, suffix: '间', icon: Calendar, tone: 'reserved', filterValue: 'reserved' },
  { key: 'cleaning', label: ROOM_STATE_LABEL.cleaning, value: roomSummary.value.cleaning, suffix: '间', icon: Service, tone: 'cleaning', filterValue: 'cleaning' },
  { key: 'amount', label: '在场订单金额', value: formatYuanCompact(roomSummary.value.currentAmount), icon: Tickets, tone: 'amount', clickable: false },
])

const lastUpdatedText = computed(() => {
  if (!lastUpdatedAt.value) return '等待首次同步'
  // 本地时钟带秒展示，格式化唯一出处是 utils/format（页面不再调 toLocaleTimeString）。
  return `最后同步 ${formatTimeWithSeconds(lastUpdatedAt.value)}`
})

const roomEmptyText = computed(() => {
  if (!currentStoreId.value) return '请先选择门店上下文'
  if (!resources.value.length && !rows.value.length) return '该门店暂无包厢，请先在「包厢管理」中创建'
  return '没有符合当前筛选条件的包厢'
})

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '')
}

/**
 * 后端字段预接：同一语义的 camelCase / snake_case 都收。
 * MyBatis-Plus PO 直出多为 camelCase，资源/会话聚合视图可能给 snake_case（如 area_name、party_size、
 * server_id/server_name、room_type_name）；有值才返回，缺失时由调用方维持「未接入 / 隐藏」表现。
 */
function pickField(source, ...keys) {
  if (!source) return undefined
  return firstValue(...keys.map((key) => source[key]))
}

/** 服务人员展示值：优先姓名；后端只补了 server_id 时退化为 `#id`，补上 server_name 后自动显示姓名。 */
function serverText(session, order) {
  const name = firstValue(
    pickField(session, 'serverName', 'server_name'),
    pickField(session, 'waiterName', 'waiter_name'),
    pickField(order, 'serverName', 'server_name'),
    pickField(order, 'waiterName', 'waiter_name'),
    '',
  )
  if (name) return name
  const serverId = firstValue(pickField(session, 'serverId', 'server_id'), pickField(order, 'serverId', 'server_id'))
  return serverId != null ? '#' + serverId : ''
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function dateValue(value) {
  const timestamp = value ? new Date(value).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

function asList(data) {
  return Array.isArray(data) ? data : (data && data.items) || []
}

/**
 * 缩略图取值：主图必须属于图片列表，否则退回第一张（与后端规则一致）；
 * 无图或已加载失败一律返回空串，由模板退占位，不出现破图。
 */
function pickThumb(entity, failureKey) {
  if (!entity || failedImages.value[failureKey]) return ''
  const urls = parseImageUrls(entity.imageUrls)
  if (!urls.length) return ''
  const main = typeof entity.mainImageUrl === 'string' ? entity.mainImageUrl.trim() : ''
  return main && urls.includes(main) ? main : urls[0]
}

function roomThumb(room) {
  return pickThumb(room?.resource, 'room-' + (room?.id ?? ''))
}

function catalogThumb(item) {
  return pickThumb(item, 'catalog-' + (item?.id ?? ''))
}

function markImageFailed(key) {
  if (!failedImages.value[key]) failedImages.value = { ...failedImages.value, [key]: true }
}

function mergeResourceAvailability(adminData, businessData) {
  // 业务资源视图带运行状态（占用/清洁）与管理端未覆盖的图片/描述，管理端资源只有启停状态，两者合并出「可开台」判断。
  const stateById = new Map(asList(businessData).map((resource) => [String(resource.id), resource]))
  return asList(adminData).map((resource) => {
    const state = stateById.get(String(resource.id))
    return {
      ...resource,
      available: resource.status === 'DISABLED'
        ? false
        : (state ? state.available : resource.available),
      roomState: state?.state,
      cleaningStatus: state?.cleaningStatus,
      unavailableReason: state?.unavailableReason,
      // 图片/描述以管理端记录为准，管理端缺失时用业务视图补齐（同一张表，历史数据可能只在一侧）。
      imageUrls: parseImageUrls(resource.imageUrls).length ? resource.imageUrls : state?.imageUrls,
      mainImageUrl: resource.mainImageUrl || state?.mainImageUrl,
      description: resource.description || state?.description,
    }
  })
}

/**
 * 看板列状态（前端组合态）。
 *
 * <p>顺序很重要：**待结账优先于清洁中**。结台后包厢自动进入「清洁中」，但订单还在 WAITING_SETTLEMENT /
 * WAITING_PAYMENT（客人正在前台买单）。若先判清洁中，订单会被折叠成「清洁中」卡片，结算/收银入口
 * 从看板上消失（此前就是这样）。现在清洁中 + 未收款 → 显示「待结账」，并在卡片上同时给出「清洁完成」。
 */
function resourceBoardStatus(resource, order, reservation) {
  const rawStatus = String(firstValue(resource.roomState, resource.cleaningStatus, resource.occupancyStatus, resource.roomStatus, resource.businessStatus, resource.status, '')).toUpperCase()
  if (order?.status === 'WAITING_SETTLEMENT' || order?.status === 'WAITING_PAYMENT') return 'checkout'
  if (['CLEANING', 'MAINTENANCE', 'OUT_OF_SERVICE'].includes(rawStatus)) return 'cleaning'
  if (order) return 'serving'
  if (reservation) return 'reserved'
  if (resource.available === false) return 'serving'
  return 'idle'
}

function boardStatusLabel(boardState, order, reservation) {
  if (order) return orderStatusText(order.status)
  if (boardState === 'reserved') return reservationBoardStateText(reservation?.status)
  // 空闲 / 使用中 / 清洁中一律取 constants/terms 的资源状态词表。
  return boardStateText(boardState)
}

/**
 * 开台时长文案（HH:MM）。**只认当前会话**：startAt 缺失时返回「—」——
 * 下单时间/预约时间不是开台时间，用它兜底会把上一次消费或预约等待算进本次消费（多次开台看起来像被累计）。
 * endAt 非空（会话已结台）时定格在结台时刻，不再继续走秒；pausedSeconds 从时长里扣掉（暂停不计费）。
 */
function elapsedText(startAt, endAt, pausedSeconds) {
  const started = dateValue(startAt)
  if (!started) return '—'
  const finished = dateValue(endAt)
  const endsAt = finished || now.value
  const paused = Number(pausedSeconds || 0)
  const seconds = Math.max(0, (endsAt - started) / 1000 - (Number.isFinite(paused) ? paused : 0))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * 统一时间展示走 utils/format 的 formatTime（YYYY-MM-DD HH:mm），
 * 不再区分「只显示时分」的本地实现，避免同一字段在不同位置格式不一致。
 */
function timeText(value) {
  return formatTime(value)
}

/**
 * 卡片 / 抽屉标题副行：编号 · 容纳 N 人 · 房型 · 区域。
 * 区域与房型都是「有值才显示」，缺失时不留空占位（后端已补齐 area_name 与房型字典）。
 */
function roomSubtitle(room) {
  const parts = [room?.code]
  if (room?.capacity) parts.push(`容纳 ${room.capacity} 人`)
  if (room?.roomType) parts.push(room.roomType)
  if (room?.area) parts.push(room.area)
  return parts.filter(Boolean).join(' · ')
}

/**
 * 基础房费：先取「生效房型价」——已缓存的服务端按包厢计价（带 roomTypePriceApplied/生效单价）
 * 优先，否则用门店级方案（含 unitPriceByRoomType）+ 资源上的房型编码/房型单价按同一取值顺序推导
 * （房型字典单价 > 方案按房型单价 > 门店级单价），因此看板不需要按包厢逐个再请求计价接口。
 */
function roomPricingOf(resource) {
  const resourceId = resource?.id
  const cached = resourceId != null ? roomPricingByResource.value[String(resourceId)] : null
  const fromServer = roomPriceFromPricing(cached)
  if (fromServer) return fromServer
  return resolveRoomPrice({
    plan: ktvPricing.value,
    roomTypeCode: firstValue(pickField(resource, 'roomTypeCode', 'room_type_code'), ''),
    roomTypeName: firstValue(pickField(resource, 'roomTypeName', 'room_type_name'), ''),
    roomTypeUnitPrice: firstValue(pickField(resource, 'roomTypeUnitPrice', 'room_type_unit_price')),
    // 房型服务单价：资源视图补上后与房型单价一起算「房型 + 服务 = 合计」；缺失时回退门店级/方案服务单价。
    roomTypeServerUnitPrice: firstValue(pickField(resource, 'roomTypeServerUnitPrice', 'room_type_server_unit_price')),
  })
}

/** 详情抽屉里的基础房费：与卡片同口径，打开详情补齐服务端计价后会自动更新。 */
const detailBasePriceText = computed(() => (
  detailRoom.value ? roomBasePriceText(roomPricingOf(detailRoom.value.resource)) : ''
))

/** 开台中（OPEN/PAUSED）订单金额 = 已生效加项 + 服务端实时房费估算；结台后估算为空、房费已落明细，不相加即不重复计费。 */
function orderAmount(order) {
  // 金额一律取**服务端口径**：
  // - liveTotalAmount 是后端给的权威展示值（开台中＝明细 − 房费明细 + 实时房费，结台后＝最终值）；
  // - 旧后端没有该字段时退回 totalAmount（其中已含上一次刷新写进的 ROOM_FEE 明细）。
  // **绝不再加 roomEstimatedFee**：totalAmount 已含房费明细，再加一次会把包厢费算两遍
  // （ACK 实测：账单 6150，卡片 6150+4000=10150，C 端与后台因此不一致）。
  return numberValue(firstValue(order?.liveTotalAmount, order?.totalAmount, order?.payableAmount, order?.amount, 0))
}

function normalizeRoom(resource) {
  const resourceId = String(resource.id)
  const order = activeOrderByResource.value.get(resourceId) || null
  const reservation = reservationByResource.value.get(resourceId) || null
  const session = order ? (sessionsByOrder.value[order.id] || {}) : {}
  const boardState = resourceBoardStatus(resource, order, reservation)
  // 包厢维度：本次开台＝当前会话。**不拿 order.createdAt/startedAt 兜底**——那是下单/预约时刻，
  // 用它算「开台时长」会把上一次消费或预约等待一起算进来（门店看到的就是「多次开台累计」）。
  const sessionStartedAt = firstValue(session.openedAt, pickField(session, 'billingStartAt', 'billing_start_at'), session.startedAt, session.startAt)
  const sessionEndedAt = firstValue(session.closedAt, session.closed_at, session.endedAt)
  const sessionPausedSeconds = pickField(session, 'pausedSeconds', 'paused_seconds')
  const orderNo = order?.orderNo || (order?.id != null ? `#${order.id}` : '—')
  const capacity = numberValue(resource.capacity)
  const guests = firstValue(
    pickField(session, 'partySize', 'party_size'),
    session.guestCount,
    pickField(order, 'partySize', 'party_size'),
    order?.guestCount,
    reservation?.partySize,
  )
  return {
    id: resource.id,
    code: resource.resourceCode || `#${resource.id}`,
    name: resource.name || resource.resourceCode || `包厢 #${resource.id}`,
    // 区域取 res_resource.area_name（camel/snake 兼容）：有值才展示，拿不到留空（筛选条整体隐藏），不填「默认区域」。
    area: firstValue(pickField(resource, 'areaName', 'area_name'), resource.zoneName, resource.floorName, resource.area, ''),
    // 房型取后端字典解析后的 room_type_name / roomTypeName：有值才展示，缺失走「未接入」。
    roomType: firstValue(pickField(resource, 'roomTypeName', 'room_type_name'), ''),
    // 房型编码/房型单价：用于推导「生效房费单价」（与后端按房型定价同源），不直接展示。
    roomTypeCode: firstValue(pickField(resource, 'roomTypeCode', 'room_type_code'), ''),
    roomTypeUnitPrice: firstValue(pickField(resource, 'roomTypeUnitPrice', 'room_type_unit_price')),
    capacity,
    resource,
    order,
    reservation,
    session,
    boardStatus: boardState,
    statusLabel: boardStatusLabel(boardState, order, reservation),
    // 清洁中：结台后自动置位、门店确认「清洁完成」后回到空闲。待结账卡片也要能看到并操作它。
    cleaning: String(firstValue(resource.roomState, resource.cleaningStatus, '')).toUpperCase() === 'CLEANING',
    amount: orderAmount(order),
    // 人数取 ord_ktv_session.party_size，服务人员取 server_name/server_id：有值才展示，缺失维持隐藏/「未接入」。
    guests: guests === undefined || guests === null || guests === '' ? null : numberValue(guests),
    startedAt: timeText(sessionStartedAt),
    elapsed: elapsedText(sessionStartedAt, sessionEndedAt, sessionPausedSeconds),
    waiter: serverText(session, order),
    orderShort: orderNo.length > 12 ? orderNo.slice(-8) : orderNo,
    reservationTime: formatTime(reservation?.startAt),
    reservationContact: firstValue(reservation?.contact, reservation?.contactName, '未填写'),
    basePriceText: roomBasePriceText(roomPricingOf(resource)),
    nextReservationText: reservation?.startAt ? `下场预约 ${timeText(reservation.startAt)}` : '',
  }
}

function normalizeOrphanOrder(order) {
  const session = sessionsByOrder.value[order.id] || {}
  // 同 normalizeRoom：订单维度/包厢维度的计时都只认当前会话，绝不回退到下单时间。
  const sessionStartedAt = firstValue(session.openedAt, pickField(session, 'billingStartAt', 'billing_start_at'), session.startedAt, session.startAt)
  const sessionEndedAt = firstValue(session.closedAt, session.closed_at, session.endedAt)
  const sessionPausedSeconds = pickField(session, 'pausedSeconds', 'paused_seconds')
  const boardState = ['WAITING_SETTLEMENT', 'WAITING_PAYMENT'].includes(order.status) ? 'checkout' : 'serving'
  const orderNo = order.orderNo || `#${order.id}`
  const guests = firstValue(pickField(session, 'partySize', 'party_size'), session.guestCount, pickField(order, 'partySize', 'party_size'), order.guestCount)
  const capacity = firstValue(session.capacity, order.capacity)
  return {
    id: `order-${order.id}`,
    code: '未关联',
    name: firstValue(order.resourceName, session.resourceName, `未关联包厢 · ${orderNo}`),
    // 订单未关联包厢资源：区域/房型/容纳人数都拿不到，一律留空，不用「未分区」「房型未配置」占位。
    area: '',
    roomType: '',
    capacity: capacity === undefined || capacity === null || capacity === '' ? null : numberValue(capacity),
    resource: null,
    order,
    reservation: null,
    session,
    boardStatus: boardState,
    statusLabel: orderStatusText(order.status),
    amount: orderAmount(order),
    guests: guests === undefined || guests === null || guests === '' ? null : numberValue(guests),
    startedAt: timeText(sessionStartedAt),
    elapsed: elapsedText(sessionStartedAt, sessionEndedAt, sessionPausedSeconds),
    waiter: serverText(session, order),
    orderShort: orderNo.length > 12 ? orderNo.slice(-8) : orderNo,
    reservationTime: '—',
    reservationContact: '',
    basePriceText: '基础房费待配置',
    nextReservationText: '',
  }
}

function canVoid(s) {
  return !['VOIDED', 'COMPLETED', 'CANCELLED'].includes(s)
}

/** 取消入口是否出现在「···」菜单里：已作废/已取消不再出现，其余状态都要出现（不可取消时禁用并写明原因）。 */
function showCancelItem(status) {
  return status !== 'VOIDED' && status !== 'CANCELLED'
}

/** 取消入口文案：不可取消时把原因写在菜单项上，运营不用点也知道下一步该做什么。 */
function cancelMenuText(status) {
  return canVoid(status) ? '取消订单' : '取消订单（已完成，须先退款）'
}

/** 清洁完成：包厢置回空闲，恢复可开台/可预约。 */
async function markRoomCleaned(room) {
  setSubmitting(room.id, true)
  try {
    await setRoomCleaningStatus(room.id, false)
    ElMessage.success('「' + (room.name || room.resourceCode || room.id) + '」已恢复可用')
    await load()
  } catch (e) {
    notifyAdminRequestError(e, '操作失败')
  } finally {
    setSubmitting(room.id, false)
  }
}

async function load() {
  // 本看板没有「查询」按钮，守卫放在加载入口：区间倒挂时只提示、不发请求。
  const warning = dateRangeWarning(range.value)
  if (warning) { ElMessage.warning(warning); return }
  if (!currentStoreId.value) {
    rows.value = []
    resources.value = []
    reservations.value = []
    sessionsByOrder.value = {}
    return
  }
  loading.value = true
  try {
    const [orderData, adminResourceData, businessResourceData, reservationData, pricingData] = await Promise.all([
      listOrders({ ...dateRangeParams(range.value) }),
      listAdminResources({ resourceType: 'KTV_ROOM', storeId: currentStoreId.value }),
      listBusinessResources({ resourceType: 'KTV_ROOM' }).catch(() => []),
      getReservations().catch(() => []),
      getKtvPricing(currentStoreId.value).catch(() => null),
    ])
    const storeId = String(currentStoreId.value)
    allOrders.value = asList(orderData)
    rows.value = allOrders.value.filter((order) => order.storeId == null || String(order.storeId) === storeId)
    resources.value = mergeResourceAvailability(adminResourceData, businessResourceData)
    reservations.value = asList(reservationData).filter((reservation) => reservation.storeId == null || String(reservation.storeId) === storeId)
    ktvPricing.value = pricingData

    const activeOrders = rows.value.filter((order) => ACTIVE_ORDER_STATUSES.has(order.status) && (!order.businessType || order.businessType === 'KTV'))
    const sessionEntries = await Promise.all(activeOrders.map(async (order) => {
      try {
        return [order.id, await getOrderSession(order.id)]
      } catch (e) {
        return [order.id, null]
      }
    }))
    sessionsByOrder.value = Object.fromEntries(sessionEntries.filter(([, session]) => session))
    lastUpdatedAt.value = Date.now()

    if (!roomAreas.value.includes(selectedArea.value)) selectedArea.value = AREA_ALL
    if (detailVisible.value && detailRoom.value) {
      detailRoom.value = roomCards.value.find((room) => String(room.id) === String(detailRoom.value.id)) || detailRoom.value
    }
  } catch (e) {
    notifyAdminRequestError(e, '加载包厢房态失败')
  } finally {
    loading.value = false
  }
}

async function openRoomDetail(room) {
  detailRoom.value = room
  detailBill.value = null
  detailVisible.value = true
  // 带房型的包厢：补齐一次服务端「生效单价 + roomTypePriceApplied」（按包厢缓存，重复打开不再请求）。
  loadRoomPricing(room)
  if (!room.order) return
  detailLoading.value = true
  try {
    detailBill.value = await getBill(room.order.id)
    // 账单金额不含开台中的实时房费估算（房费结台才落明细），此处保持与房态卡片同一口径相加。
    if (detailBill.value?.totalAmount != null) detailRoom.value.amount = orderAmount({ ...room.order, totalAmount: detailBill.value.totalAmount })
  } catch (e) {
    // 开台初期账单可能尚未生成，房态详情仍可正常展示。
  } finally {
    detailLoading.value = false
  }
}

/**
 * 按包厢取计价（带 resourceId）：只为「已挂房型」的包厢请求一次并缓存，
 * 取价失败保持本地推导口径（房型字典价 > 方案按房型价 > 门店价），不阻塞详情展示。
 */
async function loadRoomPricing(room) {
  const resourceId = room?.resource?.id
  if (resourceId == null || !room?.roomTypeCode) return
  const key = String(resourceId)
  if (roomPricingByResource.value[key]) return
  try {
    const pricing = await getKtvPricing(currentStoreId.value, resourceId)
    if (pricing && pricing.roomUnitPrice != null) {
      // roomCards 与详情文案都读本缓存，替换后自动重算，无需手动刷新卡片。
      roomPricingByResource.value = { ...roomPricingByResource.value, [key]: pricing }
    }
  } catch (e) {
    // 计价接口临时不可用时保留本地推导结果，不弹错打断看板操作。
  }
}

function goReservations() {
  router.push({ name: 'Reservations' })
}

/**
 * 看板预约卡片主按钮文案：已确认且已分配包厢时是「到店开台」
 * （后端 open-table 接受 CONFIRMED 并隐含登记到店时间，运营不必点两次）。
 */
function reservationActionText(reservation) {
  return reservationBoardActionText(reservation?.status, isReservationRoomAssigned(reservation))
}

/** 过点仍未到店的预约：看板卡片给「未到店」入口（与「客户到店」并列，不抢主按钮）。 */
function canNoShow(reservation) {
  return canMarkNoShow(reservation)
}

async function advanceReservation(room) {
  const reservation = room.reservation
  if (!reservation) return
  reservationSubmittingId.value = reservation.id
  try {
    if (reservation.status === 'PENDING') {
      await ElMessageBox.confirm('确认该预约？', '确认预约')
      await confirmReservation(reservation.id, reservation.version)
      ElMessage.success('已确认预约')
    } else if (reservation.status === 'CONFIRMED' && isReservationRoomAssigned(reservation)) {
      // 已确认 + 已锁房：客人到了直接开台（后端一并登记到店时间）。
      await ElMessageBox.confirm('确认客人已到店并开台？开台后将登记到店时间、生成订单并开始计时。', '到店开台')
      await openTableReservation(reservation.id)
      ElMessage.success('已开台')
    } else if (reservation.status === 'CONFIRMED') {
      await ElMessageBox.confirm('确认客户已到店？', '客户到店')
      await arrivalReservation(reservation.id)
      ElMessage.success('已标记客户到店')
    } else if (reservation.status === 'ARRIVED') {
      await ElMessageBox.confirm('确认开台？开台后将生成订单并开始计时。', '预约开台')
      await openTableReservation(reservation.id)
      ElMessage.success('已开台')
    }
    detailVisible.value = false
    await load()
  } catch (e) {
    if (!['cancel', 'close'].includes(e)) notifyAdminRequestError(e, '处理预约失败')
  } finally {
    reservationSubmittingId.value = null
  }
}

/** 看板「未到店」：过点仍未到店 → NO_SHOW，释放该预约占的包厢预约位。 */
async function markReservationNoShow(room) {
  const reservation = room.reservation
  if (!reservation) return
  reservationSubmittingId.value = reservation.id
  try {
    await ElMessageBox.confirm('确认客户未到店？该预约将标记为「未到店」，不再占用包厢的预约位。', '标记未到店', {
      confirmButtonText: '标记未到店',
      cancelButtonText: '返回',
      type: 'warning',
    })
    await noShowReservation(reservation.id)
    ElMessage.success('已标记未到店')
    detailVisible.value = false
    await load()
  } catch (e) {
    if (!['cancel', 'close'].includes(e)) notifyAdminRequestError(e, '标记未到店失败')
  } finally {
    reservationSubmittingId.value = null
  }
}

function handleRoomCommand(command, order) {
  if (command === 'detail') showBill(order)
  if (command === 'cancel') cancelOrderRow(order)
  if (command === 'void-request') openVoidRequest(order)
  if (command === 'recovery') openRecovery(order)
}

function openVoidRequest(order) {
  voidRequestOrder.value = order
  voidRequestReason.value = ''
  voidRequestVisible.value = true
}

async function submitVoidRequest() {
  const reason = voidRequestReason.value.trim()
  if (!reason) { ElMessage.warning('请填写作废原因'); return }
  voidRequestSubmitting.value = true
  try {
    await requestVoidApproval(voidRequestOrder.value.id, {
      reason,
      idempotencyKey: `admin-void-${voidRequestOrder.value.id}-${Date.now()}`,
    })
    ElMessage.success('作废申请已提交，等待其他有权限人员审批')
    voidRequestVisible.value = false
    await openVoidApprovals()
  } catch (error) {
    notifyAdminRequestError(error, '提交作废申请失败')
  } finally {
    voidRequestSubmitting.value = false
  }
}

async function openVoidApprovals() {
  voidApprovalsVisible.value = true
  await loadVoidApprovals()
}

async function loadVoidApprovals() {
  voidApprovalsLoading.value = true
  try {
    voidApprovals.value = await listVoidApprovals(voidApprovalStatus.value ? { status: voidApprovalStatus.value } : {}) || []
  } catch (error) {
    voidApprovals.value = []
    notifyAdminRequestError(error, '加载作废审批失败')
  } finally {
    voidApprovalsLoading.value = false
  }
}

function voidApprovalStatusText(status) {
  return { PENDING: '待审批', APPROVED: '执行中', EXECUTED: '已执行', REJECTED: '已驳回' }[status] || status || '未知'
}

async function reviewVoidApproval(row, approved) {
  voidApprovalSubmittingId.value = row.id
  try {
    if (approved) await approveVoidApproval(row.id, '批准作废')
    else await rejectVoidApproval(row.id, '驳回作废')
    ElMessage.success(approved ? '已批准并执行作废' : '已驳回作废申请')
    await Promise.all([loadVoidApprovals(), load()])
  } catch (error) {
    notifyAdminRequestError(error, approved ? '批准作废失败' : '驳回作废失败')
  } finally {
    voidApprovalSubmittingId.value = null
  }
}

async function openCreate(resourceId = null) {
  if (!currentStoreId.value) {
    ElMessage.warning('请先选择门店上下文')
    return
  }
  createForm.value = { resourceId, partySize: null }
  createVisible.value = true
  if (resources.value.length) return
  resourcesLoading.value = true
  try {
    const [adminData, businessData] = await Promise.all([
      listAdminResources({ resourceType: 'KTV_ROOM', storeId: currentStoreId.value }),
      listBusinessResources({ resourceType: 'KTV_ROOM' }).catch(() => []),
    ])
    resources.value = mergeResourceAvailability(adminData, businessData)
  } catch (e) {
    resources.value = []
    notifyAdminRequestError(e, '加载包厢失败')
  } finally {
    resourcesLoading.value = false
  }
}

async function doCreate() {
  if (!contextStore.tenantId || !contextStore.organizationId || !currentStoreId.value) {
    ElMessage.warning('请先选择有效的租户/组织/门店上下文')
    return
  }
  if (!createForm.value.resourceId) {
    ElMessage.warning('请选择包厢')
    return
  }
  // 人数前端先校验一次（>0 且不超过包厢容量），与服务端同一个口径，避免把明显非法值发出去。
  const partySize = normalizedPartySize()
  if (partySize === undefined) return
  creating.value = true
  try {
    const order = await createOrder({
      businessType: 'KTV',
      // 写路径币种取全局唯一来源（后端会用「收款币种 = 订单币种」校验，页面不得写死）
      currencyCode: currencyStore.code,
      resourceId: createForm.value.resourceId,
    })
    // 快速开台：同步打开 KTV 会话（RESERVED → OPEN，订单 DRAFT → SERVING）
    if (order && order.sessionId) {
      try {
        await openSession(order.sessionId, 0, partySize)
      } catch (e) {
        ElMessage.warning('订单已创建，但开台失败：' + resolveAdminErrorMessage(e))
      }
    }
    ElMessage.success('已开台')
    createVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '开台失败')
  } finally {
    creating.value = false
  }
}

/** 所选包厢的容纳人数（资源未维护容量时为 null，此时只校验 > 0）。 */
const selectedRoomCapacity = computed(() => {
  const room = resources.value.find((r) => String(r.id) === String(createForm.value.resourceId))
  const capacity = Number(room?.capacity)
  return Number.isFinite(capacity) && capacity > 0 ? capacity : null
})

/**
 * 校验并归一开台人数：null/空 = 不登记（返回 null）；非整数或 <= 0 提示后返回 undefined（中止提交）；
 * 超过包厢容量提示后返回 undefined。服务端仍会再校验一次（PARTY_SIZE_INVALID）。
 */
function normalizedPartySize() {
  const raw = createForm.value.partySize
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    ElMessage.warning('人数需为大于 0 的整数')
    return undefined
  }
  const capacity = selectedRoomCapacity.value
  if (capacity != null && value > capacity) {
    ElMessage.warning(`人数 ${value} 超过该包厢容纳上限 ${capacity} 人，请调整后重试`)
    return undefined
  }
  return value
}

/**
 * 账单「怎么算出来的」文案（时长 / 金额来源）统一走 utils/billExplain（本文件不再自己实现一套）：
 * 与订单管理账单区同一份口径，避免同一张单两处说法不一；数字全部来自服务端账单字段。
 */

/**
 * 开台中（结算前）：账单金额是**实时值**，结台后按 closed_at 固化，必须在界面上说明。
 * 判定取自服务端 {@code roomFee.live}（旧后端没有该字段时才退回按订单/时段推断）。
 */
const billOpen = computed(() => {
  const live = bill.value?.roomFee?.live
  if (typeof live === 'boolean') return live
  const status = bill.value?.status
  if (status === 'SERVING' || status === 'DRAFT') return true
  return !bill.value?.roomFee?.periodEnd && status !== 'COMPLETED' && status !== 'VOIDED'
})
const billStatusText = computed(() => (bill.value?.status ? orderStatusText(bill.value.status) : ''))
const billStatusTagType = computed(() => {
  switch (bill.value?.status) {
    case 'SERVING': return 'warning'
    case 'COMPLETED': return 'success'
    case 'VOIDED':
    case 'CANCELLED': return 'info'
    default: return 'primary'
  }
})

async function showBill(row) {
  billVisible.value = true
  bill.value = null
  billOrder.value = row || null
  try {
    bill.value = await getBill(row.id)
  } catch (e) {
    notifyAdminRequestError(e, '加载账单失败')
  }
}

async function openItems(row) {
  itemsOrder.value = row
  items.value = []
  resetCatalogSelection()
  itemsVisible.value = true
  await loadItems(row.id)
  await loadCatalog()
}

/**
 * 点单目录一次拉全量：分类切换在本地过滤，避免每次切分类/打开弹窗都多发一次请求
 * （看板刷新链路也不因此增加请求）。
 */
async function loadCatalog() {
  catalogLoading.value = true
  try {
    const data = await listCatalog({ storeId: currentStoreId.value })
    catalogAll.value = Array.isArray(data) ? data : (data && data.items) || []
    catalogCategories.value = [...new Set(catalogAll.value.map((c) => c.category).filter(Boolean))]
    applyCatalogCategory()
  } catch (e) {
    catalogAll.value = []
    catalog.value = []
  } finally {
    catalogLoading.value = false
  }
}

function applyCatalogCategory() {
  catalog.value = catalogCategory.value
    ? catalogAll.value.filter((c) => c.category === catalogCategory.value)
    : catalogAll.value
}

/** 目录里是否有服务类目录项（item_type=SERVICE）：用于显示「服务加项 vs 服务人员点单」的口径说明。 */
const catalogHasService = computed(() => catalogAll.value.some((item) => item.itemType === 'SERVICE'))

function catalogSelectionQuantity(catalogItemId) {
  return Number(catalogSelection.value[catalogItemId] || 0)
}

function resetCatalogSelection() {
  catalogSelection.value = {}
}

function catalogSelectionMax(catalogItem) {
  const availableQuantity = Number(catalogItem.availableQuantity)
  return catalogItem.availableQuantity == null || !Number.isFinite(availableQuantity)
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Math.floor(availableQuantity))
}

function updateCatalogSelection(catalogItem, value) {
  if (catalogItem.available === false) return
  const parsed = Number(value)
  const requested = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
  const quantity = Math.min(requested, catalogSelectionMax(catalogItem))
  const next = { ...catalogSelection.value }
  if (quantity > 0) next[catalogItem.id] = quantity
  else delete next[catalogItem.id]
  catalogSelection.value = next
}

function increaseCatalogSelection(catalogItem) {
  if (catalogItem.available === false) {
    ElMessage.warning('「' + catalogItem.name + '」' + (catalogItem.unavailableReason || '当前不可点'))
    return
  }
  // 加号上限 = 服务端可用库存（availableQuantity 为 null 表示该商品不控制库存）：先拦在选择阶段，
  // 免得到「确认」时才被 INVENTORY_INSUFFICIENT 驳回。真正的扣减仍由服务端原子扣减兜底。
  const limit = catalogItem.availableQuantity
  const current = catalogSelectionQuantity(catalogItem.id)
  if (limit !== null && limit !== undefined && current >= Number(limit)) {
    ElMessage.warning('「' + catalogItem.name + '」可用库存仅 ' + Number(limit) + '，请先补货或减少数量')
    return
  }
  updateCatalogSelection(catalogItem, current + 1)
}

function decreaseCatalogSelection(catalogItem) {
  const next = { ...catalogSelection.value }
  const quantity = catalogSelectionQuantity(catalogItem.id)
  if (quantity <= 1) delete next[catalogItem.id]
  else next[catalogItem.id] = quantity - 1
  catalogSelection.value = next
}

async function confirmCatalogSelection() {
  if (catalogSubmitting.value) return
  const selectedItems = selectedCatalogItems.value
  if (!selectedItems.length) {
    itemsVisible.value = false
    return
  }

  catalogSubmitting.value = true
  let addedQuantity = 0
  try {
    for (const { catalogItem, quantity } of selectedItems) {
      await addItem(itemsOrder.value.id, {
        catalogItemId: catalogItem.id,
        quantity,
        source: 'MERCHANT',
      })
      addedQuantity += quantity
      const next = { ...catalogSelection.value }
      delete next[catalogItem.id]
      catalogSelection.value = next
    }
    await Promise.all([loadItems(itemsOrder.value.id), load()])
    ElMessage.success(`已加 ${addedQuantity} 件商品`)
    itemsVisible.value = false
  } catch (e) {
    await loadItems(itemsOrder.value.id)
    notifyAdminRequestError(e, '加项失败，未提交的商品已保留，请重试')
  } finally {
    catalogSubmitting.value = false
  }
}

function openCatalogManage() {
  catalogManageVisible.value = true
  catalogManageKeyword.value = ''
  resetCatalogForm()
  loadCatalog()
}

function resetCatalogForm() {
  catalogEditingId.value = null
  catalogForm.value = emptyCatalogForm()
}

function editCatalogRow(row) {
  catalogEditingId.value = row.id
  catalogForm.value = {
    category: row.category || '其他',
    name: row.name || '',
    priceYuan: fenToYuan(row.unitPrice),
    unit: row.unit || '份',
    itemType: row.itemType || 'PRODUCT',
  }
}

async function saveCatalogItem() {
  if (catalogSaving.value) return
  const name = (catalogForm.value.name || '').trim()
  const category = (catalogForm.value.category || '').trim()
  const priceCents = yuanToFen(catalogForm.value.priceYuan)
  if (!category) { ElMessage.warning('请输入商品分类'); return }
  if (!name) { ElMessage.warning('请输入目录项名称'); return }
  if (priceCents <= 0) { ElMessage.warning('单价需大于 0'); return }
  catalogSaving.value = true
  try {
    const payload = {
      storeId: currentStoreId.value,
      category,
      itemType: catalogForm.value.itemType || 'PRODUCT',
      name,
      unit: catalogForm.value.unit || '份',
      unitPrice: priceCents,
      sortOrder: 0,
    }
    if (catalogEditingId.value) {
      await updateCatalogItem(catalogEditingId.value, payload)
      ElMessage.success('商品修改成功')
    } else {
      await createCatalogItem(payload)
      ElMessage.success('商品新增成功')
    }
    resetCatalogForm()
    await loadCatalog()
  } catch (e) {
    notifyAdminRequestError(e, catalogEditingId.value ? '修改商品失败' : '新增商品失败')
  } finally {
    catalogSaving.value = false
  }
}

async function deleteCatalogRow(row) {
  try {
    await ElMessageBox.confirm(
      '删除商品「' + row.name + '」？删除后不会再出现在点单目录，历史订单仍保留商品快照。',
      '删除商品',
      { type: 'warning', confirmButtonText: '确认删除' },
    )
  } catch (e) {
    return
  }
  try {
    await disableCatalogItem(row.id)
    if (catalogEditingId.value === row.id) resetCatalogForm()
    ElMessage.success('商品已删除')
    await loadCatalog()
  } catch (e) {
    notifyAdminRequestError(e, '删除商品失败')
  }
}

async function loadItems(orderId) {
  try {
    const data = await listOrderItems(orderId)
    items.value = Array.isArray(data) ? data : (data && data.items) || []
  } catch (e) {
    items.value = []
  }
}

/**
 * 点单/加项弹窗里的单条确认/拒绝：与集中处理抽屉同一口径 —— **只有服务端成功才提示成功**。
 * 失败原因由 `request` 响应拦截器给出可读中文；并发下已被同事处理（409）走轻提示「已为你刷新」，
 * 不改写成红色失败。处理完顺手刷新聚合视图，让角标/卡片标记与收银台同屏一致（不必等 15s 轮询）。
 */
async function decideItemRow(it, action) {
  const rejecting = action === 'reject'
  try {
    await ElMessageBox.confirm(rejecting ? '拒绝该客户自助加项？' : '确认该客户自助加项生效？',
      rejecting ? '拒绝加项' : '确认加项')
  } catch {
    return // 取消：ElMessageBox 以 reject 表示取消，不是操作失败
  }
  try {
    if (rejecting) await rejectItem(itemsOrder.value.id, it.id)
    else await confirmItem(itemsOrder.value.id, it.id)
    ElMessage.success(rejecting ? '已拒绝加项' : '已确认加项')
  } catch (e) {
    if (isAlreadyProcessed(e)) ElMessage.warning('该加项已被处理，已为你刷新最新数据')
  }
  await loadItems(itemsOrder.value.id)
  pendingApprovalStore.refresh()
}

async function confirmItemRow(it) {
  await decideItemRow(it, 'confirm')
}

async function rejectItemRow(it) {
  await decideItemRow(it, 'reject')
}

async function closeOrderSession(order, closeItemsDialog = false) {
  if (!order) return
  // 结台前先提示「还有客户加项待确认」：这些加项不计入应收，结台后要么补确认要么按当前金额结算，
  // 以前是静默停在「待结算」，前台不知道原因。这里把原因和入口一起给出来。
  const pendingCount = pendingApprovalStore.countOfOrder(order.id)
  const closeMessage = pendingCount > 0
    ? `该订单还有 ${pendingCount} 条客户加项待确认（不计入应收）。结台后订单会停在「待结算」，需先确认或拒绝这些加项再结算。确认结台？`
    : '确认结台？结台后按计时计算包厢费、不可再加项，并直接进入待支付。'
  await ElMessageBox.confirm(closeMessage, '结台', {
    confirmButtonText: '确认结台',
    cancelButtonText: '返回',
    type: pendingCount > 0 ? 'warning' : 'warning',
  })
  try {
    const session = sessionsByOrder.value[order.id] || await getOrderSession(order.id)
    await closeSession(session.id)
    if (closeItemsDialog) itemsVisible.value = false
    detailVisible.value = false
    await load()
    // 结台即结算（服务端同一事务完成，2026-09-19）：没有待确认的客户自助加项时订单已进入待支付，
    // 收银按钮随即可点；仍有待确认加项时保持「待结算」——那些加项不计入应付，先确认/拒绝再点「结算」。
    const refreshed = rows.value.find((item) => String(item.id) === String(order.id))
    if (refreshed?.status === 'WAITING_SETTLEMENT') {
      ElMessage.warning('已结台；该订单还有待确认的客户自助加项，确认或拒绝后再点「结算」')
    } else {
      ElMessage.success('已结台并进入待支付')
    }
  } catch (e) {
    notifyAdminRequestError(e, '结台失败')
  }
}

// —— 收银：组合支付（KTV_BUSINESS_01 §7.2）——
// 抵扣顺序固定「积分 → 储值 → 现金补差额」，每笔 ≤ 剩余应收；支付方式取后台授权口径，
// 储值展示名取租户配置 wallet_brand_name，与 A380 商户端 H5 收银台保持同一套口径。
const collectOrderTotalMinor = computed(() => Math.round(Number(collectOrder.value?.totalAmount || 0)))
const collectOrderPaidMinor = computed(() => Math.round(Number(collectOrder.value?.paidAmount || 0)))
/** 应收优先用服务端账单的 payableAmount，缺省时退回「合计 − 已收」。 */
const payableMinor = computed(() => {
  const fromBill = collectOrder.value?.payableAmount
  if (fromBill != null) return Math.max(0, Math.round(Number(fromBill)))
  return Math.max(0, collectOrderTotalMinor.value - collectOrderPaidMinor.value)
})
const memberSelectable = computed(() => collectMethods.value.some((m) => m.method === 'POINT' || m.method === 'WALLET'))
/** 已填合计：分腿数量先按各自口径折成最小货币单位再相加（服务端要求合计 = 应收），界面合计恒为金额。 */
const filledMinor = computed(() => collectMethods.value.reduce(
  (sum, m) => sum + legInputToMinor(m.method, payByLeg.value[m.method], walletRatio.value), 0,
))

/** 储值展示名 / 兑换比例：只认租户配置，缺配置回落 constants/terms 的默认值（页面不再写死品牌名）。 */
async function loadWalletConfig() {
  try {
    const cfg = await getWalletTokenConfig(contextStore.tenantId)
    walletBrand.value = resolveWalletBrandName(cfg)
    walletRatio.value = resolveTokenRatio(cfg?.ratio)
  } catch { /* 读取失败用 constants/terms 的默认展示名与默认比例 */ }
}

async function loadCollectMethods() {
  try {
    const list = await listPaymentMethods('admin')
    const arr = Array.isArray(list) ? list : (list && list.items) || []
    collectMethods.value = orderAllowedMethods(arr)
  } catch {
    collectMethods.value = []
  }
}

function openCollect(row) {
  collectOrder.value = row
  memberKeyword.value = ''
  memberResults.value = []
  selectedMemberId.value = null
  memberWalletMinor.value = 0
  memberWalletTokens.value = 0
  memberPoints.value = 0
  payByLeg.value = {}
  collectVisible.value = true
  const ready = collectMethods.value.length ? Promise.resolve() : loadCollectMethods()
  // 应收一律以服务端账单为准（payableAmount，缺省时用 totalAmount − paidAmount）
  getBill(row.id)
    .then((bill) => {
      if (bill) {
        collectOrder.value = {
          ...row,
          totalAmount: bill.totalAmount,
          paidAmount: bill.paidAmount,
          payableAmount: bill.payableAmount,
        }
      }
    })
    .catch(() => { /* 读取失败退回列表快照，收款时服务端仍会校验 */ })
    .finally(() => ready.then(() => { clearLegs(); autoFill() }))
}

async function searchMembers() {
  const kw = (memberKeyword.value || '').trim()
  if (!kw) { ElMessage.warning('请输入手机号或客户号'); return }
  searchingMembers.value = true
  try {
    const data = await listMembers({ page: 1, pageSize: 10, keyword: kw })
    const list = Array.isArray(data) ? data : (data && (data.records || data.items || data.list)) || []
    memberResults.value = list
    if (!list.length) ElMessage.info('未找到客户')
    if (list.length === 1) await onMemberChange(list[0].id)
  } catch (e) {
    memberResults.value = []
    notifyAdminRequestError(e, '查询客户失败')
  } finally {
    searchingMembers.value = false
  }
}

async function onMemberChange(memberId) {
  selectedMemberId.value = memberId
  memberWalletMinor.value = 0
  memberWalletTokens.value = 0
  memberPoints.value = 0
  if (!memberId) return
  try {
    const wallet = await getMemberWallet(memberId)
    memberWalletMinor.value = Number(wallet?.availableAmount || 0)
    // 代币数量：服务端 tokenAmount 优先，缺字段按「余额 ÷ 100 × 租户比例」降级换算（只用于展示）。
    memberWalletTokens.value = resolveTokenCount(wallet?.tokenAmount, memberWalletMinor.value, walletRatio.value)
  } catch { /* 余额读取失败不阻塞，收款时以服务端校验为准 */ }
  try {
    const points = await getMemberPoints(memberId)
    memberPoints.value = Number(points?.account?.availablePoints ?? points?.availablePoints ?? 0)
  } catch { /* 同上 */ }
  autoFill()
}

/**
 * 按抵扣顺序用可用积分 / 储值填满应收，余额由现金兜底。
 * 储值币 / 积分分腿按**数量**回填（储值币数量由金额按租户比例折算，积分是 1:1 的个数）。
 */
function autoFill() {
  let left = payableMinor.value
  const next = {}
  for (const m of collectMethods.value) {
    let amount = 0
    if (m.method === 'POINT') amount = Math.min(left, selectedMemberId.value ? memberPoints.value : 0)
    else if (m.method === 'WALLET') amount = Math.min(left, selectedMemberId.value ? memberWalletMinor.value : 0)
    else if (m.method === 'CASH') amount = left
    next[m.method] = legMinorToInput(m.method, amount, walletRatio.value)
    left -= amount
  }
  payByLeg.value = next
}

function clearLegs() {
  const next = {}
  for (const m of collectMethods.value) next[m.method] = 0
  payByLeg.value = next
}

/** 单笔不得超过「应收 − 其他方式已填」。 */
function clampLeg(method) {
  const others = collectMethods.value
    .filter((m) => m.method !== method)
    .reduce((sum, m) => sum + legInputToMinor(m.method, payByLeg.value[m.method], walletRatio.value), 0)
  const max = Math.max(0, payableMinor.value - others)
  const filled = legInputToMinor(method, payByLeg.value[method], walletRatio.value)
  const value = Math.min(Math.max(0, filled), max)
  payByLeg.value = { ...payByLeg.value, [method]: legMinorToInput(method, value, walletRatio.value) }
}

async function doCollect() {
  const payable = payableMinor.value
  if (payable <= 0) { ElMessage.warning('该订单没有应收金额'); return }
  // 提交给服务端的 amount 恒为最小货币单位整数（POINT 腿服务端按同一个数核销积分）。
  const payments = collectMethods.value
    .map((m) => ({ method: m.method, amount: legInputToMinor(m.method, payByLeg.value[m.method], walletRatio.value) }))
    .filter((p) => p.amount > 0)
  if (!payments.length) { ElMessage.warning('请至少填写一种支付方式的金额'); return }
  const total = payments.reduce((s, p) => s + p.amount, 0)
  if (total !== payable) { ElMessage.warning('拆分金额合计须等于应收金额'); return }
  const usesMember = payments.some((p) => p.method === 'POINT' || p.method === 'WALLET')
  if (usesMember && !selectedMemberId.value) { ElMessage.warning('积分 / 储值抵扣需要先选择客户'); return }
  collecting.value = true
  try {
    const result = await collect(collectOrder.value.id, {
      customerId: selectedMemberId.value,
      // 收款币种必须与订单币种一致：优先订单快照，缺快照回落全局当前币种
      currencyCode: collectOrder.value?.currencyCode || currencyStore.code,
      payable,
      payments,
    })
    // 已收分腿：现金 / 线上带币种，储值币 / 积分只显示数量。
    const collected = (result?.collectedByMethod || [])
      .map((c) => collectedLegText(c, walletBrand.value, walletRatio.value, result?.currencyCode || collectOrder.value?.currencyCode))
      .join('，')
    ElMessage.success('收款成功' + (collected ? '：' + collected : ''))
    collectVisible.value = false
    load()
  } catch (e) {
    notifyAdminRequestError(e, '收款失败')
  } finally {
    collecting.value = false
  }
}

async function confirm(row) {
  await ElMessageBox.confirm('确认该订单进入待结算？', '提示')
  await confirmOrder(row.id)
  ElMessage.success('已确认')
  load()
}

async function settle(row) {
  await ElMessageBox.confirm('确认结算该订单（金额由服务端按明细汇总）？', '提示')
  await settleOrder(row.id, row.version ?? 0)
  ElMessage.success('已结算，进入待支付')
  load()
}

/** 订单已收金额（最小货币单位）：收款弹窗与取消预检都读同一字段。 */
function paidAmountOf(order) {
  return numberValue(firstValue(order?.paidAmount, order?.collectedAmount, 0))
}

/**
 * 取消订单（运营代客取消，POST /business/orders/{id}/cancel）。
 *
 * 显式处理「已收款不可取消」：提交前先用已收金额预检并给出与后端 409
 * ORDER_HAS_PAYMENT_REFUND_FIRST 同一句中文提示（用的是 adminErrorMessage 里的同一常量），
 * 不发起注定失败的请求；若发生并发收款，提交后的错误码映射仍会给出同一句提示。
 * 原因是必填项：空白/超长只提示、不提交。
 */
/** 取消订单弹窗状态（应用内 el-dialog，替代 ElMessageBox.prompt）。 */
const cancelDialogVisible = ref(false)
const cancelTarget = ref(null)
const cancelSubmitting = ref(false)
const cancelDialogMessage = '取消后会释放该订单占用的包厢，操作会记入操作日志。请填写取消原因（必填，最多 '
  + CANCEL_REASON_MAX_LENGTH + ' 个字符）：'

async function cancelOrderRow(row) {
  if (!row?.id) {
    // 没有订单 ID 时不要发一个注定 400 的请求，也不能静默返回（此前会一路走到 axios 才报错）。
    ElMessage.error('订单信息不完整，请刷新后重试')
    return
  }
  if (paidAmountOf(row) > 0) {
    ElMessage.warning(ORDER_HAS_PAYMENT_REFUND_FIRST_TEXT)
    return
  }
  cancelTarget.value = row
  cancelDialogVisible.value = true
}

/**
 * 提交取消订单（来自 CancelReasonDialog 的 confirm，reason 已去空白且非空）。
 *
 * 不用 ElMessageBox.prompt：真机上该弹窗点「确认取消」既不关闭也不报错、更不发请求，
 * 每次还往 body 里留一个不可交互的残留节点，运营点到的其实是上一轮的死弹窗（表现为「没反应」）。
 * 这里只做「请求 + 中文提示 + 刷新看板」，失败一律 toast，绝不静默。
 */
async function submitCancelOrder(reason) {
  const row = cancelTarget.value
  if (!row?.id) return
  cancelSubmitting.value = true
  setSubmitting(row.id, true)
  try {
    const result = await submitCancelWithReason(reason, (normalized) => cancelOrder(row.id, normalized))
    if (!result.ok) {
      ElMessage.warning(result.message)
      return
    }
    cancelDialogVisible.value = false
    cancelTarget.value = null
    ElMessage.success('已取消订单，包厢占用已释放')
    await load()
  } catch (e) {
    // 请求失败一律给出中文提示（错误码 → 中文 message → 状态码），绝不静默结束。
    notifyCancelRequestError(e, '取消订单失败')
  } finally {
    cancelSubmitting.value = false
    setSubmitting(row.id, false)
  }
}

async function openRecovery(row) {
  recoveryOrder.value = row
  recoveryVisible.value = true
  try {
    recoveryItems.value = await listInventoryRecovery(row.id) || []
  } catch (error) {
    recoveryItems.value = []
    notifyAdminRequestError(error, '加载库存处理项失败')
  }
}

async function decideRecovery(item, recover) {
  const message = recover ? '确认将该商品库存回补？' : '确认该商品已消耗，不回补库存？'
  await ElMessageBox.confirm(message, '库存处理')
  try {
    await decideInventoryRecovery(recoveryOrder.value.id, item.id, {
      recover,
      reason: recover ? '作废订单运营确认回补' : '作废订单运营确认已消耗',
    })
    ElMessage.success('处理完成')
    await openRecovery(recoveryOrder.value)
  } catch (error) {
    notifyAdminRequestError(error, '库存处理失败')
  }
}

/**
 * 预约「开台生成订单」跳转过来时**定位订单**（`?orderId=`）。
 *
 * <p>旧实现：把订单号写进搜索框，然后指望在房态行里找到它 —— 只要看板带着状态/区域/房型筛选，
 * 或者订单属于**另一个门店**，看板就是空的，界面上只剩搜索框里一个看不懂的数字。
 *
 * <p>现在：
 * <ol>
 *   <li>清掉会挡住目标包厢的看板筛选（状态/区域/房型/搜索），只保留「定位订单」这一件事；</li>
 *   <li>账单**直接按订单号拉取**并打开（不再依赖它在当前门店的看板里存在）；</li>
 *   <li>看板只显示该订单所在包厢；找不到（多为跨门店）时，顶部明确说明并给一键切换门店。</li>
 * </ol>
 */
async function applyReservationOrder(orderId) {
  if (!orderId) return
  const target = String(orderId)
  focusedOrderId.value = target
  focusedOrderRow.value = null
  focusedOrderStore.value = null
  // 复位会挡住目标包厢的筛选（跳转语义是「看这一个订单」，不是「看当前筛选结果」）。
  boardStatus.value = 'all'
  selectedArea.value = AREA_ALL
  selectedRoomType.value = ROOM_TYPE_ALL
  keyword.value = ''
  await load()
  const order = allOrders.value.find((row) => String(row.id) === target)
  focusedOrderRow.value = order || null
  if (order) {
    // 订单属于别的门店：当前门店的房态看板里不会有它，先告诉运营「切到哪个门店」。
    if (order.storeId != null && String(order.storeId) !== String(currentStoreId.value)) {
      focusedOrderStore.value = contextStore.items.find(
        (item) => item.storeId != null && String(item.storeId) === String(order.storeId)) || null
    }
  }
  // 账单与看板解耦：只要能取到订单号就能出账单（跨门店、筛选复位失败都不影响）。
  await showBillById(target)
}

/** 按订单号直接拉账单（与看板行无关），并尽量补上单据头需要的订单信息。 */
async function showBillById(orderId) {
  billVisible.value = true
  bill.value = null
  billOrder.value = focusedOrderRow.value
  try {
    bill.value = await getBill(orderId)
  } catch (e) {
    notifyAdminRequestError(e, '加载账单失败')
  }
}

/** 切换到最后一次定位订单所属的门店并保持定位（重新加载后由 ?orderId= 继续定位）。 */
async function switchToFocusedStore() {
  const target = focusedOrderStore.value
  if (!target || !target.contextId) {
    ElMessage.warning('找不到该订单所属门店的上下文，请手动切换门店后重试')
    return
  }
  try {
    await contextStore.select(target.contextId)
    contextStore.reloadForContextChange()
  } catch (e) {
    notifyAdminRequestError(e, '切换门店失败')
  }
}

/** 清除「定位订单」态：回到普通看板（同时把地址栏里的 orderId 清掉，避免刷新又跳回来）。 */
function clearFocusedOrder() {
  focusedOrderId.value = ''
  focusedOrderRow.value = null
  focusedOrderStore.value = null
  if (route.query.orderId) {
    router.replace({ name: 'Orders' })
  } else {
    load()
  }
}

watch(() => route.query.orderId, applyReservationOrder)
watch(currentStoreId, (storeId, previousStoreId) => {
  if (storeId && storeId !== previousStoreId) {
    keyword.value = ''
    boardStatus.value = 'all'
    selectedArea.value = AREA_ALL
    load()
  }
})
onMounted(() => {
  clockTimer = window.setInterval(() => { now.value = Date.now() }, 60000)
  loadWalletConfig()
  loadCollectMethods()
  if (route.query.orderId) applyReservationOrder(route.query.orderId)
  else load()
})
onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer)
})
</script>

<style scoped>
.room-board-page {
  --room-red: #e2545f;
  --room-green: #21a876;
  --room-orange: #e98a2d;
  --room-blue: #3478f6;
  --room-purple: #7658c9;
}
.room-grid {
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(4, minmax(245px, 1fr));
  gap: 18px;
  background: #fafbfc;
}
.room-card {
  min-width: 0;
  min-height: 218px;
  padding: 15px;
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
.room-card::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: #cbd1db; }
.room-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(31, 44, 74, .1); }
.room-card.idle::before { background: var(--room-green); }
.room-card.serving::before { background: var(--room-red); }
.room-card.checkout::before { background: var(--room-orange); }
.room-card.reserved::before { background: var(--room-blue); }
.room-card.cleaning::before { background: var(--room-purple); }
.room-card.serving { border-color: #f0d7da; background: linear-gradient(145deg, #fff 0%, #fff 70%, #fff7f7 100%); }
.room-card.checkout { border-color: #f1dec6; background: linear-gradient(145deg, #fff 0%, #fff 70%, #fff9f1 100%); }
.room-card.reserved { border-color: #d6e2f7; background: linear-gradient(145deg, #fff 0%, #fff 70%, #f4f8ff 100%); }
.room-card.cleaning { border-color: #e1d9f4; background: linear-gradient(145deg, #fff 0%, #fff 70%, #f8f5ff 100%); }
.room-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 13px; }
/* 包厢主图缩略图：懒加载 + 失败退占位，不撑破卡片布局 */
.room-thumb {
  width: 46px;
  height: 46px;
  flex: none;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  display: grid;
  place-items: center;
  color: var(--el-text-color-placeholder);
  font-size: 18px;
}
.room-thumb__img { width: 100%; height: 100%; object-fit: cover; display: block; }
.room-title { min-width: 0; flex: 1; }
.room-title strong { display: block; font-size: 16px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.room-title span { display: block; margin-top: 4px; color: var(--el-text-color-secondary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.room-status { flex: none; padding: 4px 8px; border-radius: 13px; font-size: 11px; font-weight: 600; color: #68707e; background: #f0f2f5; }
.idle .room-status,
.room-status.idle { color: #16895f; background: #eaf8f2; }
.serving .room-status,
.room-status.serving { color: #ce3e4a; background: #ffeaec; }
.checkout .room-status,
.room-status.checkout { color: #c76b10; background: #fff0dc; }
.reserved .room-status,
.room-status.reserved { color: #2866c9; background: #e9f1ff; }
.cleaning .room-status,
.room-status.cleaning { color: #6848bb; background: #eee8ff; }
.active-room-content { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; margin-bottom: 12px; }
.amount-block span,
.elapsed-block span { display: block; margin-bottom: 3px; color: var(--el-text-color-placeholder); font-size: 11px; }
.amount-block strong { color: #d84653; font-size: 22px; }
.checkout .amount-block strong { color: #d97819; }
.elapsed-block { text-align: right; }
.elapsed-block strong { font-size: 17px; font-variant-numeric: tabular-nums; }
.room-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding: 10px 0;
  border-top: 1px dashed var(--el-border-color);
}
.room-meta div { min-width: 0; display: flex; gap: 5px; font-size: 11px; }
.room-meta span { color: var(--el-text-color-placeholder); }
.room-meta b { min-width: 0; color: var(--el-text-color-regular); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.room-actions { display: flex; gap: 6px; margin-top: auto; }
.create-hint { margin: 0; padding: 0 4px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
.room-actions > .el-button { flex: 1; margin-left: 0; min-width: 0; }
.room-actions > .el-dropdown { flex: 0 0 auto; }
.idle-content { flex: 1; display: flex; align-items: center; gap: 12px; padding: 4px 2px 15px; }
.idle-mark { width: 38px; height: 38px; flex: none; display: grid; place-items: center; border-radius: 50%; color: var(--room-green); background: #eaf8f2; font-size: 20px; }
.idle-content strong { color: #16895f; font-size: 18px; }
.idle-content p { margin: 6px 0 0; color: var(--el-text-color-secondary); font-size: 11px; }
.reservation-content { flex: 1; display: grid; gap: 9px; padding: 8px 1px 13px; border-top: 1px dashed var(--el-border-color); }
.reservation-content div { display: grid; grid-template-columns: 66px 1fr; gap: 8px; font-size: 12px; }
.reservation-content span { color: var(--el-text-color-secondary); }
.reservation-content b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reservation-content div:first-child b { color: var(--room-blue); font-size: 14px; }
.cleaning-content { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #6848bb; }
.cleaning-content .el-icon { font-size: 27px; margin-bottom: 7px; }
.cleaning-content strong { font-size: 15px; }
.cleaning-content span { margin-top: 5px; color: #9a91b2; font-size: 11px; }
.missing-order { flex: 1; display: grid; place-items: center; color: var(--el-text-color-secondary); font-size: 12px; text-align: center; }

.room-grid.list-mode { grid-template-columns: 1fr; }
.room-grid.list-mode .room-card { min-height: auto; display: grid; grid-template-columns: minmax(180px, .8fr) minmax(170px, .7fr) minmax(260px, 1fr) minmax(230px, .9fr); align-items: center; gap: 18px; }
.room-grid.list-mode .room-card-head,
.room-grid.list-mode .active-room-content { margin: 0; }
.room-grid.list-mode .room-meta { padding: 0; border: 0; }
.room-grid.list-mode .room-actions { margin: 0; }
.room-grid.list-mode .idle-content,
.room-grid.list-mode .reservation-content,
.room-grid.list-mode .cleaning-content { display: flex; padding: 0; border: 0; text-align: left; }

.drawer-title { width: 100%; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-right: 8px; }
.drawer-title h3 { margin: 0; color: var(--el-text-color-primary); font-size: 20px; }
.drawer-title p { margin: 5px 0 0; color: var(--el-text-color-secondary); font-size: 12px; }
.room-detail h4 { margin: 20px 0 10px; font-size: 13px; color: var(--el-text-color-regular); }
.detail-total { padding: 18px; border-radius: 12px; color: #fff; background: linear-gradient(135deg, #425a83, #263652); display: flex; align-items: flex-end; justify-content: space-between; }
.detail-total.serving { background: linear-gradient(135deg, #eb6b75, #cb3d49); }
.detail-total.checkout { background: linear-gradient(135deg, #f0a14f, #cf741a); }
.detail-total.reserved { background: linear-gradient(135deg, #5a94f8, #316bcf); }
.detail-total.idle { background: linear-gradient(135deg, #3fbe91, #18855f); }
.detail-total span { display: block; opacity: .8; font-size: 11px; }
.detail-total strong { display: block; margin-top: 5px; font-size: 25px; }
.detail-total > b { font-size: 16px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--el-border-color-lighter); border-radius: 9px; overflow: hidden; }
.detail-grid > div { min-width: 0; padding: 11px 12px; border-right: 1px solid var(--el-border-color-lighter); border-bottom: 1px solid var(--el-border-color-lighter); }
.detail-grid > div:nth-child(2n) { border-right: 0; }
/* 末行不留分隔线：字段数可为奇数（末行只有一个格子），按奇偶分别处理，末尾行不再出现半截边框。 */
.detail-grid > div:last-child { border-bottom: 0; }
.detail-grid > div:nth-last-child(2):nth-child(odd) { border-bottom: 0; }
.detail-grid span { display: block; margin-bottom: 4px; color: var(--el-text-color-placeholder); font-size: 10px; }
.detail-grid b { display: block; overflow: hidden; color: var(--el-text-color-regular); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
/* 后端未提供的字段：显式标注「未接入」，不再用推测值 */
.pending-field { color: var(--el-text-color-placeholder); font-weight: 400; }
.drawer-bill { padding: 2px 0; }
.detail-placeholder { padding: 20px; border: 1px dashed var(--el-border-color); border-radius: 8px; color: var(--el-text-color-secondary); text-align: center; font-size: 12px; }
.drawer-footer { display: flex; justify-content: flex-end; gap: 8px; }

.bill-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}
.bill-row span {
  color: var(--el-text-color-secondary);
}
.bill-row.total b {
  font-size: 18px;
  color: var(--el-color-danger);
}
.bill-row.promo b {
  color: var(--el-color-success);
}
/* —— 账单详情：单据头 / 计费说明 / 分组 —— */
.bill-head {
  padding-bottom: 10px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.bill-head__line { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.bill-head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.bill-section { margin-top: 6px; }
.bill-section__label {
  margin: 8px 0 2px;
  color: var(--el-text-color-regular);
  font-weight: 600;
  font-size: 12px;
}
.bill-explain {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  padding: 2px 0 6px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.bill-row em { margin-left: 6px; font-style: normal; color: var(--el-text-color-placeholder); }
.bill-note { margin-top: 6px; }
.bill-empty { padding: 18px; color: var(--el-text-color-secondary); text-align: center; font-size: 13px; }
/* —— 预约开台跳转的「定位订单」提示条 —— */
.focused-order-alert { margin-bottom: 10px; }
.focused-order-alert .focused-order-actions { display: flex; gap: 8px; margin-top: 4px; }
.catalog-bar { padding: 4px 0; }
.catalog-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.catalog-label { font-size: 13px; color: var(--el-text-color-secondary); }
.catalog-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-height: 220px; overflow-y: auto; }
.catalog-cell {
  border: 1px solid var(--el-border-color); border-radius: 6px; padding: 8px 10px; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  transition: all .15s;
}
.catalog-cell:hover { border-color: var(--el-color-primary); background: var(--el-fill-color-light); }
.catalog-cell__body { min-width: 0; flex: 1; }
.catalog-stepper { min-width: 116px; align-self: center; display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.catalog-stepper__input { width: 52px; }
.catalog-stepper__input :deep(.el-input__inner) { padding: 0 4px; text-align: center; font-weight: 700; }
.catalog-stock { color: var(--el-text-color-secondary); font-size: 12px; }
/* 目录项缩略图：懒加载 + 失败退占位（后端目录项图来自 imageUrls/mainImageUrl） */
.catalog-thumb {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  display: grid;
  place-items: center;
  color: var(--el-text-color-placeholder);
  font-size: 16px;
}
.catalog-thumb__img { width: 100%; height: 100%; object-fit: cover; display: block; }
.catalog-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.catalog-meta { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.catalog-meta b { color: var(--el-color-danger); }
.catalog-cat { font-size: 11px; color: var(--el-text-color-placeholder); margin-top: 2px; }
.catalog-manage-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.catalog-manage-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.catalog-manage-form :deep(.el-form-item) { margin-bottom: 14px; }
.items-footer-bar { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.catalog-selection-summary { min-width: 0; flex: 1; }
.catalog-selection-summary__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.catalog-selection-summary__head strong { font-size: 14px; color: var(--el-text-color-primary); }
.catalog-selection-summary__head span { color: var(--el-text-color-secondary); font-size: 12px; }
.catalog-selection-list { max-height: 132px; overflow-y: auto; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-fill-color-lighter); }
.catalog-selection-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 92px; align-items: center; gap: 12px; padding: 7px 10px; border-bottom: 1px solid var(--el-border-color-lighter); font-size: 13px; }
.catalog-selection-row:last-child { border-bottom: 0; }
.catalog-selection-row__name { overflow: hidden; color: var(--el-text-color-primary); text-overflow: ellipsis; white-space: nowrap; }
.catalog-selection-row b { color: var(--el-text-color-primary); text-align: right; }
.catalog-selection-total { display: flex; align-items: center; justify-content: flex-end; gap: 20px; margin-top: 8px; }
.catalog-selection-total span { color: var(--el-text-color-secondary); font-size: 13px; }
.catalog-selection-total strong { color: var(--el-color-danger); font-size: 18px; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; padding: 6px 0; }

@media (max-width: 1500px) {
  .room-grid { grid-template-columns: repeat(3, minmax(235px, 1fr)); }
}
@media (max-width: 1180px) {
  .room-grid { grid-template-columns: repeat(2, minmax(230px, 1fr)); }
  .room-grid.list-mode .room-card { grid-template-columns: 170px 150px 1fr; }
  .room-grid.list-mode .room-actions { grid-column: 1 / -1; }
}
@media (max-width: 720px) {
  .room-grid { grid-template-columns: 1fr; padding: 10px; }
  .room-grid.list-mode .room-card { display: flex; }
  .catalog-grid { grid-template-columns: 1fr; }
  .items-footer-bar { align-items: stretch; flex-direction: column; }
  .items-footer-bar > .el-button { align-self: flex-end; }
  .catalog-manage-toolbar { align-items: stretch; flex-direction: column; }
  .catalog-manage-form { grid-template-columns: 1fr; }
}
/* 收银台：组合支付金额与拆分校验提示（与 A380 商户端 H5 一致的口径） */
.collect-amount { font-size: 20px; font-weight: 700; color: #f56c6c; }
.collect-muted { margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px; }
.collect-mismatch { margin-left: 8px; color: var(--el-color-warning); font-size: 13px; }
.member-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
/* 售罄/未上架目录项：置灰但仍展示，运营能看到原因而不是以为商品不存在 */
.catalog-cell-disabled { opacity: .55; cursor: not-allowed; }
.catalog-service-hint { margin: 8px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
/* 房型筛选：房型名可能很长，固定宽度并让选中项省略（全名由外层 tooltip 给出）；
   最小宽度 0 是关键——默认 min-width:auto 会让长文本把工具栏顶宽、把其它筛选挤出容器。 */
.board-room-type-select { width: 150px; max-width: 46vw; flex: 0 0 auto; }
.board-room-type-select :deep(.el-select__wrapper) { min-height: 28px; }
.board-room-type-select :deep(.el-select__selection) { min-width: 0; }
.board-room-type-select :deep(.el-select__selected-item) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
