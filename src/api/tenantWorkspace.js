import request from './request'

export function getStoreWorkspaceMode() {
  return request.get('/api/v1/admin/tenant/workspace-mode')
}

export function updateStoreWorkspaceMode(storeWorkspaceMode) {
  return request.put('/api/v1/admin/tenant/workspace-mode', { storeWorkspaceMode })
}
