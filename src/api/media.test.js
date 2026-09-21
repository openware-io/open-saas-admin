import { describe, expect, it, vi } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

vi.mock('./request', () => ({ default: { post: vi.fn() } }))

import request from './request'
import { uploadImage } from './media'

/**
 * 公共图片地址契约守卫（2026-09 规范方案，无过渡兼容）。
 *
 * 统一前缀：/api/v1/media-public/{bucket}/{key}
 *  - 走网关 /api 命名空间，任何环境同一份路由，入口不再单独反代 MinIO；
 *  - 后端返回同源相对路径，前端原样使用、绝不拼域名（CSP img-src 'self' data: 依然满足）。
 *
 * 这些约束一旦被回退（重新写死旧前缀、重新加 media 专用反代、放宽 CSP），
 * 就让测试红掉，而不是等上线后在各环境入口 rewrite 上排查。
 */

const srcRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const NEW_PREFIX = '/api/v1/media-public/'

async function collectFiles(dir, extensions) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(full, extensions))
    else if (extensions.some((ext) => entry.name.endsWith(ext)) && !entry.name.endsWith('.test.js')) files.push(full)
  }
  return files
}

/** 去掉注释后再断言：允许注释里说明「历史上是 /media-public/，现已改为网关前缀」。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/** 去掉合法新前缀后仍出现 /media-public/，即视为回退到旧前缀。 */
function legacyPrefixOffenders(source) {
  return stripComments(source).split(NEW_PREFIX).join('').includes('/media-public/')
}

describe('图片上传接口（src/api/media.js）', () => {
  it('上传走网关 /api/v1/admin/media/images，且返回的 url 是同源 /api/v1/media-public/ 相对路径', async () => {
    const url = `${NEW_PREFIX}gv-media-public/saas/1001/202609/a.png`
    request.post.mockResolvedValueOnce({ url, objectKey: 'saas/1001/202609/a.png', contentType: 'image/png', size: 12 })

    const response = await uploadImage(new Blob(['x'], { type: 'image/png' }))

    const [endpoint, body, config] = request.post.mock.calls[0]
    expect(endpoint).toBe('/api/v1/admin/media/images')
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('file')).toBeInstanceOf(Blob)
    // 单张 10MB，放宽超时避免慢链路被默认 15s 打断
    expect(config.timeout).toBe(60000)
    // 后端返回值原样透传：不补前缀、不拼域名
    expect(response.url).toBe(url)
    expect(response.url.startsWith(NEW_PREFIX)).toBe(true)
  })
})

describe('旧前缀防回退（源码扫描）', () => {
  it('src/** 里只允许出现 /api/v1/media-public/，不再有旧的 /media-public/ 生成或拼接点', async () => {
    const offenders = []
    for (const file of await collectFiles(srcRoot, ['.vue', '.js'])) {
      const relative = path.relative(srcRoot, file).split(path.sep).join('/')
      if (legacyPrefixOffenders(await readFile(file, 'utf8'))) offenders.push(relative)
    }
    expect(offenders).toEqual([])
  })

  it('上传组件原样使用后端返回的 url（file.response.url || file.url），不自行拼接域名', async () => {
    const source = stripComments(await readFile(path.join(srcRoot, 'components/ItemImageUploader.vue'), 'utf8'))
    expect(source).toContain('file.response?.url || file.url')
    expect(source).not.toMatch(/location\.origin/)
    expect(source).not.toMatch(/['"`]https?:\/\//)
  })
})

describe('入口反代与 CSP（nginx.conf）', () => {
  it('不再保留 media 专用反代：图片随 /api 走网关', async () => {
    const nginx = await readFile(path.join(repoRoot, 'nginx.conf'), 'utf8')
    // 旧前缀 location 整段删除
    expect(nginx).not.toMatch(/location\s+\/media-public\//)
    // 不再直连集群内 MinIO
    expect(nginx).not.toContain('proxy_pass http://minio:9000')
    expect(nginx).not.toContain('minio:9000')
    // /api 命名空间（含 /api/v1/media-public/**）仍由网关承接
    expect(nginx).toMatch(/location \/api\/ \{[\s\S]*?proxy_pass http:\/\/gateway:3002;/)
  })

  it('CSP img-src 保持 self + data:，不因新前缀放宽', async () => {
    const nginx = await readFile(path.join(repoRoot, 'nginx.conf'), 'utf8')
    const cspLines = nginx.split('\n').filter((line) => line.includes('Content-Security-Policy'))
    expect(cspLines.length).toBeGreaterThan(0)
    for (const line of cspLines) {
      expect(line).toContain("img-src 'self' data:")
      expect(line).not.toMatch(/img-src[^;]*blob:/)
      expect(line).not.toMatch(/img-src[^;]*\*/)
    }
  })
})
