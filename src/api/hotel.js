import request from './request'

/** 酒店前台任务：与 B 端 / Web 共用同一套动作权限。 */
export function listHotelFrontDeskTasks() {
  return request.get('/api/v1/admin/hotel/frontdesk/tasks')
}

export function checkInHotelBooking(id, roomId) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/checkin`, null, {
    params: roomId ? { roomId } : undefined,
  })
}

export function moveHotelRoom(id, roomId) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/move-room`, { roomId })
}

export function cancelHotelBooking(id, reason) {
  return request.post(`/api/v1/admin/hotel/bookings/${id}/cancel`, { reason })
}

export function noShowHotelBooking(id) {
  return request.post(`/api/v1/admin/hotel/bookings/${id}/no-show`)
}

export function checkOutHotelBooking(id) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/checkout`)
}

export function extendHotelBooking(id, newCheckOutDate) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/extend`, { newCheckOutDate })
}

export function listHotels() {
  return request.get('/api/v1/admin/hotel/hotels')
}

export function listHotelRoomTypes(hotelId) {
  return request.get('/api/v1/admin/hotel/room-types', { params: { hotelId } })
}

export function createHotelRoomType(data) {
  return request.post('/api/v1/admin/hotel/room-types', data)
}

export function updateHotelRoomType(id, data) {
  return request.put(`/api/v1/admin/hotel/room-types/${id}`, data)
}

export function listHotelRooms(roomTypeId) {
  return request.get('/api/v1/admin/hotel/rooms', { params: { roomTypeId } })
}

export function createHotelRoom(data) {
  return request.post('/api/v1/admin/hotel/rooms', data)
}

export function updateHotelRoom(id, data) {
  return request.put(`/api/v1/admin/hotel/rooms/${id}`, data)
}

export function setHotelRoomStatus(id, status) {
  return request.put(`/api/v1/admin/hotel/rooms/${id}/status`, { status })
}

export function listHotelRatePlans(hotelId) {
  return request.get('/api/v1/admin/hotel/rate-plans', { params: { hotelId } })
}

export function createHotelRatePlan(data) {
  return request.post('/api/v1/admin/hotel/rate-plans', data)
}

export function updateHotelRatePlan(id, data) {
  return request.put(`/api/v1/admin/hotel/rate-plans/${id}`, data)
}

export function listHotelDailyRates(params) {
  return request.get('/api/v1/admin/hotel/daily-rates', { params })
}

export function setHotelDailyRate(data) {
  return request.put('/api/v1/admin/hotel/daily-rates', data)
}

export function listHotelInventory(params) {
  return request.get('/api/v1/admin/hotel/inventory', { params })
}

export function setHotelInventory(data) {
  return request.put('/api/v1/admin/hotel/inventory', data)
}

export function quoteHotelStay(data) {
  return request.post('/api/v1/admin/hotel/quotes', data)
}

export function createHotelBooking(data) {
  return request.post('/api/v1/admin/hotel/bookings', data)
}

export function confirmHotelBooking(id) {
  return request.post(`/api/v1/admin/hotel/bookings/${id}/confirm`)
}

export function collectHotelOrder(orderId, data, idempotencyKey) {
  return request.post(`/api/v1/business/orders/${orderId}/collect`, data, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export function getHotelFolio(id) {
  return request.get(`/api/v1/admin/hotel/frontdesk/bookings/${id}/folio`)
}

export function collectHotelDeposit(id, data) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/deposit`, data)
}

export function refundHotelDeposit(id, data) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/refund`, data)
}

export function requestHotelOnlineRefund(id, data) {
  return request.post(`/api/v1/admin/hotel/frontdesk/bookings/${id}/refund-requests`, data)
}

export function syncHotelRefunds() {
  return request.post('/api/v1/admin/hotel/frontdesk/refunds/sync')
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
