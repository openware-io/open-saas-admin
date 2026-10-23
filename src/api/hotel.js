import request from './request'

/** 酒店前台任务：与 B 端 / Web 共用同一套动作权限。 */
export function listHotelFrontDeskTasks() {
  return request.get('/api/v1/admin/hotel/frontdesk/tasks')
}

export function checkInHotelBooking(id) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/checkin`)
}

export function checkOutHotelBooking(id) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/checkout`)
}
