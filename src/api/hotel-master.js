import request from './request'

/** 酒店主数据：资料更新（含封面图 URL）。 */
export function updateHotel(id, data) {
  return request.put('/api/v1/admin/hotel/hotels/' + id, data)
}
