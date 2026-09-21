import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getSession } from '@/api/admin'
import { resetCurrencyRuntime } from '@/utils/currency-runtime'
import { useAuthStore } from './auth'

vi.mock('@/api/admin', () => ({ getSession: vi.fn(), logout: vi.fn() }))

// node 测试环境没有 localStorage；stores/auth.js 的 setup 会读写它。
vi.stubGlobal('localStorage', {
  store: new Map(),
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null },
  setItem(key, value) { this.store.set(key, String(value)) },
  removeItem(key) { this.store.delete(key) },
  clear() { this.store.clear() },
})

const sessionFixture = {
  authenticated: true,
  scope: 'TENANT',
  user: { accountId: 7, username: 'ops', displayName: '运营' },
}

/**
 * 导航守卫每次导航都会问一次登录态；不能每次都打 /admin/auth/session，
 * 否则「鉴权」又回到每次点击的链路上（本次交互修复要解决的问题之一）。
 */
describe('登录态校验在本 SPA 会话内只问服务端一次', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    resetCurrencyRuntime()
    localStorage.clear()
    getSession.mockResolvedValue(sessionFixture)
  })

  it('重复 initialize 只请求一次会话', async () => {
    const store = useAuthStore()
    expect(await store.initialize()).toBe(true)
    expect(await store.initialize()).toBe(true)
    expect(await store.initialize()).toBe(true)
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(store.authenticated).toBe(true)
  })

  it('force 时强制重新校验', async () => {
    const store = useAuthStore()
    await store.initialize()
    await store.initialize({ force: true })
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it('退出登录（clearLocalState）后重新校验', async () => {
    const store = useAuthStore()
    await store.initialize()
    store.clearLocalState()
    expect(await store.initialize()).toBe(true)
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it('invalidateSession 后重新校验（会话被判失效时使用）', async () => {
    const store = useAuthStore()
    await store.initialize()
    store.invalidateSession()
    await store.initialize()
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it('会话未认证时清空本地展示态', async () => {
    const store = useAuthStore()
    getSession.mockResolvedValue({ authenticated: false })
    expect(await store.initialize()).toBe(false)
    expect(store.authenticated).toBe(false)
    expect(store.user).toBeNull()
  })

  it('并发 initialize 合并为一次请求', async () => {
    const store = useAuthStore()
    const [a, b] = await Promise.all([store.initialize(), store.initialize()])
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(getSession).toHaveBeenCalledTimes(1)
  })
})
