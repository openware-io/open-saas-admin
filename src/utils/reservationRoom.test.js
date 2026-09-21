import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  assignableRoomOptions,
  canAssignRoom,
  canMarkNoShow,
  canOpenTable,
  canOpenTableAction,
  isHistoricalReservation,
  isReservationOverdue,
  requestErrorCode,
  reservationRoomText,
  reservationRoomTypeText,
  roomDisplayName,
  submitAssignRoom,
  summarizeUnavailableRooms,
} from './reservationRoom'
import { resolveAdminErrorMessage } from './adminErrorMessage'

/**
 * 「预约是预约房型，到店才分配包厢」（后端 6dffcf55）的后台侧契约：
 *  - 房型列优先 roomTypeName → roomTypeCode → 历史行回退旧包厢名并标注「历史预约」；
 *  - 包厢列只在到店分配后才有值，未分配显示「到店后分配」；
 *  - 分配弹窗只列该预约房型下的可用包厢；未分配包厢时开台按钮禁用（后端 409 兜底）；
 *  - 换包厢 409 RESERVATION_ROOM_ASSIGNED → 二次确认 → override=true 重试；
 *  - 6 个分配相关错误码有明确中文，不透英文码。
 */
const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

const assignedRow = {
  id: 1,
  status: 'ARRIVED',
  roomTypeId: 7,
  roomTypeName: '豪华大包厢',
  roomTypeCode: 'LUX',
  resourceId: 33,
  resourceName: 'A301',
}

describe('房型列文案（roomTypeName → roomTypeCode → 历史预约旧包厢名）', () => {
  it('优先展示房型名，缺名回退房型编码', () => {
    expect(reservationRoomTypeText(assignedRow)).toBe('豪华大包厢')
    expect(reservationRoomTypeText({ roomTypeId: 7, roomTypeCode: 'LUX' })).toBe('LUX')
    expect(reservationRoomTypeText({ roomTypeId: 7, roomTypeName: '  ' })).toBe('未知房型')
  })

  it('历史预约（无 roomTypeId）回退旧包厢名并标注「历史预约」', () => {
    const legacy = { id: 2, resourceId: 12, resourceName: 'B201' }
    expect(isHistoricalReservation(legacy)).toBe(true)
    expect(reservationRoomTypeText(legacy)).toBe('B201（历史预约）')
    expect(reservationRoomTypeText({ resourceId: 12 })).toBe('历史预约（未记录房型）')
    expect(reservationRoomTypeText({})).toBe('历史预约（未记录房型）')
  })
})

describe('包厢列文案（到店后分配）', () => {
  it('已分配显示包厢名，未分配显示「到店后分配」', () => {
    expect(reservationRoomText(assignedRow)).toBe('已分配：A301')
    expect(reservationRoomText({ id: 3, status: 'CONFIRMED', roomTypeId: 7 })).toBe('到店后分配')
    expect(reservationRoomText({ id: 3, roomTypeId: 7, resourceId: null })).toBe('到店后分配')
  })

  it('后端未回填包厢名时用页面已加载的包厢表兜底，再不行显示包厢编号', () => {
    expect(reservationRoomText({ resourceId: 33 }, 'A301')).toBe('已分配：A301')
    expect(reservationRoomText({ resourceId: 33 })).toBe('已分配：包厢 #33')
  })
})

/**
 * 分配候选**由服务端算**（`GET /admin/reservations/{id}/assignable-rooms`）：
 * 房态运行态 + **本预约时段的预约冲突**（预约不写资源占用，只看房态看不出时段冲突）。
 * 前端只渲染 `assignable / reason / currentAssignment`，不再自己拼资源列表 ——
 * 客户端合并 `/business/resources` 时任一读失败都会退化成「全都能选」。
 */
describe('分配候选：服务端给的可分配性与原因', () => {
  const candidates = [
    { resourceId: 1, name: 'A301', roomTypeId: 7, assignable: true, reason: null, currentAssignment: false, roomState: 'IDLE' },
    { resourceId: 2, name: 'A302', roomTypeId: 7, assignable: false, reason: '使用中', roomState: 'OCCUPIED' },
    { resourceId: 3, name: 'A303', roomTypeId: 7, assignable: false, reason: '清洁中', roomState: 'CLEANING' },
    {
      resourceId: 4, name: 'A304', roomTypeId: 7, assignable: false, currentAssignment: false,
      reason: '本时段已被预约 A380123（09-19 20:00–23:00）占用',
      conflictReservationNo: 'A380123', conflictWindow: '09-19 20:00–23:00', roomState: 'IDLE',
    },
  ]

  it('可选包厢只取 assignable=true（前端不做可用性二次判断）', () => {
    expect(assignableRoomOptions(candidates).map((room) => room.resourceId)).toEqual([1])
    expect(assignableRoomOptions(null)).toEqual([])
  })

  it('被排除的候选按原因汇总，含「本时段已被其它预约占用」', () => {
    expect(summarizeUnavailableRooms(candidates)).toEqual([
      { reason: '使用中', count: 1 },
      { reason: '清洁中', count: 1 },
      { reason: '本时段已被预约 A380123（09-19 20:00–23:00）占用', count: 1 },
    ])
  })

  it('当前已分配的包厢在展示名里标注，避免运营误改派', () => {
    expect(roomDisplayName({ resourceId: 1, name: 'A301', currentAssignment: true })).toBe('A301（当前已分配）')
    expect(roomDisplayName({ resourceId: 1, name: 'A301' })).toBe('A301')
    expect(roomDisplayName({ resourceId: 9, resourceCode: 'K09' })).toBe('K09')
    expect(roomDisplayName({ resourceId: 9 })).toBe('包厢 #9')
  })
})

describe('按钮可见性与开台前置', () => {
  it('分配包厢：已取消/已开台不显示，未取消未开台（含已到店）显示', () => {
    for (const status of ['PENDING', 'CONFIRMED', 'ARRIVED']) {
      expect(`${status}:${canAssignRoom({ status })}`).toBe(`${status}:true`)
    }
    for (const status of ['CANCELLED', 'CONVERTED', '']) {
      expect(`${status}:${canAssignRoom({ status })}`).toBe(`${status}:false`)
    }
  })

  it('开台按钮：未分配包厢时禁用（后端 409 RESERVATION_ROOM_NOT_ASSIGNED 兜底）', () => {
    expect(canOpenTable(assignedRow)).toBe(true)
    expect(canOpenTable({ status: 'ARRIVED', roomTypeId: 7 })).toBe(false)
    expect(canOpenTable({ status: 'ARRIVED', roomTypeId: 7, resourceId: null })).toBe(false)
    expect(canOpenTable(undefined)).toBe(false)
  })

  /**
   * 开台按钮可见性：已到店（ARRIVED），或已确认且已分配包厢（CONFIRMED）。
   * 分配包厢不再把状态改成 ARRIVED，因此「已确认 + 已锁房」必须能直接开台（后端隐含登记到店时间）。
   */
  it('开台按钮：ARRIVED 或 CONFIRMED+已分配包厢才显示，PENDING 与未分配不显示', () => {
    expect(canOpenTableAction({ status: 'ARRIVED', resourceId: 33 })).toBe(true)
    expect(canOpenTableAction({ status: 'ARRIVED', resourceId: null })).toBe(true) // 显示但禁用（提示先分配）
    expect(canOpenTableAction({ status: 'CONFIRMED', resourceId: 33 })).toBe(true)
    expect(canOpenTableAction({ status: 'CONFIRMED', resourceId: null })).toBe(false)
    expect(canOpenTableAction({ status: 'PENDING', resourceId: 33 })).toBe(false)
    expect(canOpenTableAction({ status: 'CONVERTED', resourceId: 33 })).toBe(false)
  })
})

describe('超时未到店（NO_SHOW）', () => {
  const now = Date.parse('2026-09-18T20:00:00')

  it('预约时间已过 → 超时；未到 → 未超时；时间缺失按未超时处理', () => {
    expect(isReservationOverdue({ startAt: '2026-09-18T19:30:00' }, now)).toBe(true)
    expect(isReservationOverdue({ startAt: '2026-09-18T21:30:00' }, now)).toBe(false)
    expect(isReservationOverdue({ startAt: null }, now)).toBe(false)
    expect(isReservationOverdue({ startAt: '不是时间' }, now)).toBe(false)
  })

  it('「未到店」只在到店前（PENDING/CONFIRMED）+ 已过预约时间 + 未开台时显示', () => {
    expect(canMarkNoShow({ status: 'CONFIRMED', startAt: '2026-09-18T19:30:00' }, now)).toBe(true)
    expect(canMarkNoShow({ status: 'PENDING', startAt: '2026-09-18T19:30:00' }, now)).toBe(true)
    expect(canMarkNoShow({ status: 'CONFIRMED', startAt: '2026-09-18T21:30:00' }, now)).toBe(false)
    expect(canMarkNoShow({ status: 'ARRIVED', startAt: '2026-09-18T19:30:00' }, now)).toBe(false)
    expect(canMarkNoShow({ status: 'CONVERTED', startAt: '2026-09-18T19:30:00' }, now)).toBe(false)
    expect(canMarkNoShow({ status: 'CONFIRMED', startAt: '2026-09-18T19:30:00', orderId: 88 }, now)).toBe(false)
  })
})

describe('换包厢：409 RESERVATION_ROOM_ASSIGNED → 二次确认 → override=true 重试', () => {
  it('首次分配成功：只提交一次 override=false', async () => {
    const submit = vi.fn().mockResolvedValue({})
    const confirmOverride = vi.fn()
    const result = await submitAssignRoom(33, { submit, confirmOverride })
    expect(result).toEqual({ overridden: false })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0]).toEqual([33, false])
    expect(confirmOverride).not.toHaveBeenCalled()
  })

  it('已分配其它包厢：确认后带 override=true 重试，并标记为改派', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce({ response: { status: 409, data: { code: 'RESERVATION_ROOM_ASSIGNED' } } })
      .mockResolvedValueOnce({})
    const confirmOverride = vi.fn().mockResolvedValue('confirm')
    const result = await submitAssignRoom(33, { submit, confirmOverride })
    expect(result).toEqual({ overridden: true })
    expect(confirmOverride).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls).toEqual([[33, false], [33, true]])
  })

  it('用户取消二次确认：不重试、异常上抛给页面（按弹窗关闭处理，不提示失败）', async () => {
    const submit = vi.fn().mockRejectedValue({ response: { status: 409, data: { code: 'RESERVATION_ROOM_ASSIGNED' } } })
    const confirmOverride = vi.fn().mockRejectedValue('cancel')
    await expect(submitAssignRoom(33, { submit, confirmOverride })).rejects.toBe('cancel')
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('其它错误码不弹确认，原样上抛（房型/门店不符、包厢不可用等）', async () => {
    for (const code of ['ROOM_TYPE_MISMATCH', 'ROOM_STORE_MISMATCH', 'ROOM_UNAVAILABLE', 'RESOURCE_STATE_UNAVAILABLE']) {
      const error = { response: { status: 400, data: { code } } }
      const submit = vi.fn().mockRejectedValue(error)
      const confirmOverride = vi.fn()
      await expect(submitAssignRoom(33, { submit, confirmOverride })).rejects.toBe(error)
      expect(confirmOverride).not.toHaveBeenCalled()
    }
  })

  it('错误码提取容错：无 response / 空 code 一律返回空串', () => {
    expect(requestErrorCode({ response: { data: { code: ' X ' } } })).toBe('X')
    expect(requestErrorCode(new Error('Network Error'))).toBe('')
    expect(requestErrorCode(undefined)).toBe('')
  })
})

describe('分配包厢相关错误码中文化', () => {
  const cases = {
    RESERVATION_STATUS_INVALID: '已取消或已开台',
    RESERVATION_ROOM_TYPE_REQUIRED: '历史预约',
    RESERVATION_ROOM_ASSIGNED: '已分配包厢',
    RESERVATION_ROOM_NOT_ASSIGNED: '请先到店分配包厢',
    ROOM_TYPE_MISMATCH: '房型',
    ROOM_STORE_MISMATCH: '门店',
    ROOM_UNAVAILABLE: '不可分配',
    RESOURCE_STATE_UNAVAILABLE: '暂时不可用',
  }

  it('每个码都有可执行中文提示，且不透英文码原文', () => {
    for (const [code, keyword] of Object.entries(cases)) {
      const status = code === 'RESOURCE_STATE_UNAVAILABLE' ? 503 : 409
      const message = resolveAdminErrorMessage({ response: { status, data: { code } } })
      expect(`${code}:${message.includes(keyword)}`).toBe(`${code}:true`)
      expect(`${code}:${/[A-Za-z]/.test(message)}`).toBe(`${code}:false`)
    }
  })

  it('取消预约的 RESERVATION_STATUS_INVALID 仍走取消专属文案（通用表不覆盖取消流程）', async () => {
    const { resolveCancelErrorMessage } = await import('./adminErrorMessage')
    expect(resolveCancelErrorMessage({ response: { status: 409, data: { code: 'RESERVATION_STATUS_INVALID' } } }))
      .toBe('已到店/已开台的预约不能取消，请改为取消订单。')
  })
})

describe('预约页源码守卫（房型卡片 / 到店后分配 / 分配弹窗 / 开台禁用）', () => {
  it('卡片同时展示预约房型与具体包厢，并分别走统一文案推导', async () => {
    const source = await read('../views/tenant/reservations.vue')
    expect(source).toContain('reservationRoomTypeText(reservation)')
    expect(source).toContain('<span>具体包厢</span>')
    expect(source).toContain('reservationRoomText(reservation')
    // 不再用旧包厢列拼「包厢价格」提示
    expect(source).toContain('房型价格')
  })

  it('分配包厢：候选取自服务端、提交走 assignRoomReservation，并接上 override 二次确认', async () => {
    const source = await read('../views/tenant/reservations.vue')
    expect(source).toContain('getAssignableRooms(row.id)')
    expect(source).toContain('assignableRoomOptions(assignCandidates.value)')
    expect(source).toContain('assignRoomReservation(row.id, resourceId, override)')
    expect(source).toContain('submitAssignRoom(assignResourceId.value')
    expect(source).toContain('覆盖分配')
  })

  /**
   * 回归：候选**不再**由前端合并「管理端资源 + 业务运行态」得出。
   * 旧写法里 `/business/resources` 一旦读失败就被吞掉，运行态丢失后
   * 使用中/已被其它预约占用本时段的包厢会重新出现在下拉里。
   */
  it('候选不再由前端拼装（房态读失败会退化成「全都能选」，且预约不写占用看不出时段冲突）', async () => {
    const source = await read('../views/tenant/reservations.vue')
    expect(source).not.toContain('mergeRoomState(')
    expect(source).not.toContain("listBusinessResources({ resourceType: 'KTV_ROOM' })")
    expect(source).toContain('excludedRoomSummary')
    // 弹窗必须说明「本时段已被其它预约占用」这一类不可分配原因
    expect(source).toContain('本时段已被其它预约占用')
  })

  it('分配按钮沿用本页既有预约操作权限，已取消/已开台不显示', async () => {
    const source = await read('../views/tenant/reservations.vue')
    expect(source).toContain("const RESERVATION_ARRIVAL_PERMISSION = 'reservation.arrival'")
    expect(source).toContain('canAssignReservation && canAssignRoom(reservation)')
  })

  it('未分配包厢时开台按钮禁用并给出「请先分配包厢」提示', async () => {
    const source = await read('../views/tenant/reservations.vue')
    expect(source).toContain('content="请先分配包厢"')
    expect(source).toContain(':disabled="isSubmitting(reservation) || !canOpenTable(reservation)"')
  })

  it('「未到店」入口接上 noShowReservation，并按 canMarkNoShow 显示', async () => {
    const source = await read('../views/tenant/reservations.vue')
    expect(source).toContain('canMarkNoShow(reservation)')
    expect(source).toContain('noShowReservation(row.id)')
    const board = await read('../views/tenant/orders.vue')
    expect(board).toContain('markReservationNoShow')
    expect(board).toContain('noShowReservation(reservation.id)')
  })

  it('术语仍是「包厢/房型」，不出现「房间/包间」', async () => {
    for (const relative of ['../views/tenant/reservations.vue', './reservationRoom.js']) {
      const source = await read(relative)
      expect(`${relative}:${source.includes('房间')}`).toBe(`${relative}:${false}`)
      expect(`${relative}:${source.includes('包间')}`).toBe(`${relative}:${false}`)
    }
  })
})

/**
 * 预约单的时间列必须分开：
 *  - 「创建时间」= 下单时间（created_at）；
 *  - 「预计到店时间」= 客户约的时段（start_at）；
 *  - 「到店时间」= 真实到店时间（arrived_at，只有到店登记/到店开台才写值）。
 * 此前把 start_at 当「到店时间」展示，加上「分配包厢 → ARRIVED」的旧行为，
 * 会让「提前锁房」的预约看起来像「客户已到店」。
 */
describe('预约时间列：创建时间 / 预约时间 / 到店时间三者分开', () => {
  it('卡片有「创建时间」并渲染 reservation.createdAt', async () => {
    const source = await read('../views/tenant/reservations.vue')
    expect(source).toContain('<span>创建时间</span>')
    expect(source).toContain('{{ formatTime(reservation.createdAt) }}')
  })

  it('「到店时间」渲染 arrivedAt（无值显示 —），不再用 startAt 冒充到店时间', async () => {
    const source = await read('../views/tenant/reservations.vue')
    expect(source).toContain('<span>到店时间</span>')
    expect(source).toContain("reservation.arrivedAt ? formatTime(reservation.arrivedAt) : '—'")
    // 计划时段仍由 startAt 承担（卡片顶部「预计到店时间」）
    expect(source).toContain('{{ formatTime(reservation.startAt) }}')
  })

  it('时间格式统一走 formatTime（不在页面自造时间戳格式）', async () => {
    const source = await read('../views/tenant/reservations.vue')
    expect(source).toContain('formatTime')
    expect(source).not.toMatch(/toLocaleString|toISOString/)
  })
})
