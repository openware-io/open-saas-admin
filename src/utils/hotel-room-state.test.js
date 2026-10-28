import { describe, expect, it } from 'vitest'
import {
  ROOM_BOARD_STATE_KEYS,
  canCheckInRoom,
  housekeepingText,
  occupancyText,
  outOfOrderText,
  roomBoardLabel,
  roomBoardSummary,
  roomBoardTone,
} from './hotel-room-state'

function room(overrides = {}) {
  return {
    occupancyStatus: 'VACANT',
    housekeepingStatus: 'CLEAN',
    outOfOrderStatus: 'NONE',
    holdReason: null,
    ...overrides,
  }
}

describe('酒店房态卡三组字段派生', () => {
  it('展示态固定为 空闲/已入住/待清扫/已预留/维修中', () => {
    expect(ROOM_BOARD_STATE_KEYS).toEqual(['active', 'occupied', 'dirty', 'reserved', 'maintenance'])
    expect(roomBoardLabel(room())).toBe('空闲')
    expect(roomBoardLabel(room({ housekeepingStatus: 'INSPECTED' }))).toBe('空闲')
    expect(roomBoardLabel(room({ occupancyStatus: 'OCCUPIED' }))).toBe('已入住')
    expect(roomBoardLabel(room({ housekeepingStatus: 'DIRTY' }))).toBe('待清扫')
    expect(roomBoardLabel(room({ housekeepingStatus: 'CLEANING' }))).toBe('待清扫')
    expect(roomBoardLabel(room({ holdReason: 'RESERVED' }))).toBe('已预留')
    expect(roomBoardLabel(room({ holdReason: 'GROUP_BLOCK' }))).toBe('已预留')
    expect(roomBoardLabel(room({ holdReason: 'HOUSE_USE' }))).toBe('已预留')
    expect(roomBoardLabel(room({ holdReason: 'LOCKED' }))).toBe('已预留')
    expect(roomBoardLabel(room({ outOfOrderStatus: 'OUT_OF_ORDER' }))).toBe('维修中')
    expect(roomBoardLabel(room({ outOfOrderStatus: 'OUT_OF_SERVICE' }))).toBe('维修中')
  })

  it('维修优先于预留与占用，维修房不会被派生为空闲', () => {
    expect(roomBoardTone(room({ outOfOrderStatus: 'OUT_OF_ORDER', holdReason: 'RESERVED' }))).toBe('maintenance')
    expect(roomBoardTone(room({ occupancyStatus: 'OCCUPIED' }))).toBe('occupied')
    expect(roomBoardTone(room({ holdReason: 'HOUSE_USE' }))).toBe('reserved')
  })

  it('脏房、维修房、预留房、在住房都不允许入住', () => {
    expect(canCheckInRoom(room())).toBe(true)
    expect(canCheckInRoom(room({ housekeepingStatus: 'INSPECTED' }))).toBe(true)
    expect(canCheckInRoom(room({ housekeepingStatus: 'DIRTY' }))).toBe(false)
    expect(canCheckInRoom(room({ housekeepingStatus: 'CLEANING' }))).toBe(false)
    expect(canCheckInRoom(room({ outOfOrderStatus: 'OUT_OF_ORDER' }))).toBe(false)
    expect(canCheckInRoom(room({ outOfOrderStatus: 'OUT_OF_SERVICE' }))).toBe(false)
    expect(canCheckInRoom(room({ holdReason: 'RESERVED' }))).toBe(false)
    expect(canCheckInRoom(room({ occupancyStatus: 'OCCUPIED' }))).toBe(false)
    expect(canCheckInRoom(null)).toBe(false)
  })

  it('房态摘要按派生结果计数', () => {
    const counts = roomBoardSummary([
      room(),
      room(),
      room({ occupancyStatus: 'OCCUPIED' }),
      room({ housekeepingStatus: 'DIRTY' }),
      room({ holdReason: 'RESERVED' }),
      room({ outOfOrderStatus: 'OUT_OF_SERVICE' }),
    ])
    expect(counts).toEqual({ active: 2, occupied: 1, dirty: 1, reserved: 1, maintenance: 1 })
  })

  it('三类状态各有独立文案，不依赖单一 status', () => {
    expect(occupancyText(room())).toBe('空闲')
    expect(occupancyText(room({ occupancyStatus: 'OCCUPIED' }))).toBe('已入住')
    expect(housekeepingText(room({ housekeepingStatus: 'CLEANING' }))).toBe('清扫中')
    expect(housekeepingText(room({ housekeepingStatus: 'INSPECTED' }))).toBe('已检查')
    expect(outOfOrderText(room({ outOfOrderStatus: 'OUT_OF_ORDER' }))).toBe('维修中')
    expect(outOfOrderText(room())).toBe('')
  })
})
