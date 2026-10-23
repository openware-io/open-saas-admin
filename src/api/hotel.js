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

export function listHotels() {
  return request.get('/api/v1/admin/hotel/hotels')
}

export function listHotelRoomTypes(hotelId) {
  return request.get('/api/v1/admin/hotel/room-types', { params: { hotelId } })
}

export function listHotelRatePlans(hotelId) {
  return request.get('/api/v1/admin/hotel/rate-plans', { params: { hotelId } })
}

export function quoteHotelStay(data) {
  return request.post('/api/v1/admin/hotel/quotes', data)
}

export function createHotelBooking(data) {
  return request.post('/api/v1/admin/hotel/bookings', data)
}

export function getHotelFolio(id) {
  return request.get(`/api/v1/admin/hotel/frontdesk/bookings/${id}/folio`)
}

export function collectHotelDeposit(id, data) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/deposit`, data)
}

export function listHousekeepingTasks() {
  return request.get('/api/v1/admin/hotel/housekeeping/tasks')
}

export function startHousekeepingTask(id) {
  return request.post(`/api/v1/admin/hotel/housekeeping/tasks/${id}/start`)
}

export function completeHousekeepingTask(id) {
  return request.post(`/api/v1/admin/hotel/housekeeping/tasks/${id}/complete`)
}

export function listNightAudits() {
  return request.get('/api/v1/admin/hotel/night-audit')
}

export function runNightAudit(businessDate) {
  return request.post('/api/v1/admin/hotel/night-audit/run', { businessDate })
}
