import request from './request'

/**
 * 上传商品/物料图片（admin BFF，multipart 字段名 file）。
 * 返回 { url, objectKey, contentType, size }；url 为同源相对路径 /api/v1/media-public/{bucket}/{objectKey}，
 * 由网关统一路由到集群内 MinIO（任何环境同一份路由，入口不再单独反代），前端原样使用、不拼域名，
 * 满足页面 CSP img-src 'self' data:。
 */
export function uploadImage(file) {
  const data = new FormData()
  data.append('file', file)
  // 单张最大 10MB，放宽超时避免局域网慢链路被 15s 默认超时打断
  return request.post('/api/v1/admin/media/images', data, { timeout: 60000 })
}

/** 列表接口可能返回 JSON 数组，也可能返回 JSON 数组字符串，统一解析为字符串数组。 */
export function parseImageUrls(value) {
  if (Array.isArray(value)) return value.filter((url) => typeof url === 'string' && url.trim())
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter((url) => typeof url === 'string' && url.trim()) : []
    } catch {
      return []
    }
  }
  return []
}
