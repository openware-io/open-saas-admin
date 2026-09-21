import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getSession } from '@/api/admin'
import { getContexts, selectContext } from '@/api/context'
import { currentCurrencyCode, resetCurrencyRuntime } from '@/utils/currency-runtime'
import { LOCK_TIMEOUT_MESSAGE, LOCK_WATCHDOG_MS } from '@/utils/sessionWatchdog'
import { useContextStore } from './context'

vi.mock('@/api/admin', () => ({ getSession: vi.fn() }))
vi.mock('@/api/context', () => ({ getContexts: vi.fn(), selectContext: vi.fn() }))

// node 测试环境没有 localStorage，而 stores/context.js 在会话失效时会调用 auth store 的
// clearLocalState()。这里给一个最小实现，避免把「浏览器环境」混进被测逻辑。
vi.stubGlobal('localStorage', {
  store: new Map(),
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null },
  setItem(key, value) { this.store.set(key, String(value)) },
  removeItem(key) { this.store.delete(key) },
  clear() { this.store.clear() },
})

// 「换了上下文就整页 reload」「会话失效回登录页」需要 window：给一个最小实现，
// 让自愈路径的副作用可以被断言（reload / hash），而不是被静默跳过。
vi.stubGlobal('window', {
  location: { reload: vi.fn(), hash: '' },
})

const candidates = [
  { contextId: '1::', tenantId: 1, scopeType: 'TENANT' },
  { contextId: '100::', tenantId: 100, scopeType: 'TENANT' },
  { contextId: '200:200:200', tenantId: 200, organizationId: 200, storeId: 200, scopeType: 'STORE' },
]

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  resetCurrencyRuntime()
  getContexts.mockResolvedValue({ items: candidates })
  getSession.mockResolvedValue({ authenticated: true, selectedContextId: '100::' })
  selectContext.mockImplementation(async (id) => candidates.find((item) => item.contextId === id))
})

describe('server-owned selected context', () => {
  it('restores tenant-only selection on refresh instead of choosing another tenant store', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    await store.ensureContext('TENANT')
    expect(store.tenantId).toBe(100)
    expect(selectContext.mock.calls).toEqual([['100::'], ['100::']])
  })

  it('follows the server selection changed by another tab', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    getSession.mockResolvedValue({ authenticated: true, selectedContextId: '1::' })
    await store.ensureContext('TENANT')
    expect(store.tenantId).toBe(1)
  })

  it('never reselects a revoked candidate', async () => {
    getContexts.mockResolvedValue({ items: [candidates[0]] })
    const store = useContextStore()
    await store.ensureContext('TENANT')
    expect(selectContext).not.toHaveBeenCalled()
    expect(store.current).toBeNull()
  })

  it('falls back to another candidate when the remembered context has no permission', async () => {
    selectContext.mockImplementation(async (id) => {
      if (id === '100::') throw new Error('此运营上下文已无有效权限')
      return candidates.find((item) => item.contextId === id)
    })
    const store = useContextStore()
    await store.ensureContext('TENANT')
    expect(store.current?.contextId).toBe('200:200:200')
    expect(selectContext.mock.calls.map((call) => call[0])).toEqual(['100::', '200:200:200'])
  })

  it('clears account state on session expiry', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    getSession.mockResolvedValue({ authenticated: false })
    await expect(store.ensureContext('TENANT')).rejects.toThrow('登录已过期')
    expect(store.current).toBeNull()
    expect(store.items).toEqual([])
  })

  it('does not use stale candidates when IAM is unavailable', async () => {
    getContexts.mockRejectedValue(new Error('IAM unavailable'))
    await expect(useContextStore().ensureContext('TENANT')).rejects.toThrow('IAM unavailable')
    expect(selectContext).not.toHaveBeenCalled()
  })
})

describe('context select 传播币种（§3）', () => {
  it('响应带 currencyCode 时写入全局唯一来源', async () => {
    selectContext.mockResolvedValue({ ...candidates[1], currencyCode: 'CNY' })
    const store = useContextStore()
    await store.ensureContext('TENANT')
    expect(currentCurrencyCode()).toBe('CNY')
  })

  it('响应缺 currencyCode 时回落默认 USD，不沿用上一个租户的币种', async () => {
    selectContext.mockResolvedValue({ ...candidates[1], currencyCode: 'CNY' })
    const store = useContextStore()
    await store.ensureContext('TENANT')
    expect(currentCurrencyCode()).toBe('CNY')
    selectContext.mockResolvedValue({ ...candidates[1] })
    await store.select('100::')
    expect(currentCurrencyCode()).toBe('USD')
  })

  it('非法币种值回退当前币种且不抛错（不整页报错）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      selectContext.mockResolvedValue({ ...candidates[1], currencyCode: 'JPY' })
      const store = useContextStore()
      await store.ensureContext('TENANT')
      expect(currentCurrencyCode()).toBe('USD')
    } finally {
      warn.mockRestore()
    }
  })
})

/**
 * 2026-09 交互修复：鉴权不再挂在每次导航的链路上。
 *
 * 原症状：点任意菜单先闪一次「请选择有权限的账户及门店后继续」空态，再加载页面
 * （守卫每次导航都 await 完整解析，而解析第一句就把 current 置空，router-view 被卸载）。
 */
describe('导航不再阻塞在鉴权上', () => {
  it('解析过一次后 settled=true，守卫无需再等网络', async () => {
    const store = useContextStore()
    expect(store.settled).toBe(false)
    await store.ensureContext('TENANT')
    expect(store.settled).toBe(true)
    expect(store.current?.contextId).toBe('100::')
  })

  it('明确无可用上下文时也算 settled（不能每次导航都卡一遍）', async () => {
    getContexts.mockResolvedValue({ items: [] })
    getSession.mockResolvedValue({ authenticated: true, selectedContextId: null })
    const store = useContextStore()
    await store.ensureContext('TENANT')
    expect(store.current).toBeNull()
    expect(store.settled).toBe(true)
  })

  it('重新解析期间不清空已有上下文（不再闪空态）', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    expect(store.current?.contextId).toBe('100::')

    let release
    getSession.mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const pending = store.ensureContext('TENANT')
    expect(store.current?.contextId).toBe('100::')

    release({ authenticated: true, selectedContextId: '100::' })
    await pending
    expect(store.current?.contextId).toBe('100::')
  })
})

describe('后台校准（缓存后的一致性/实时性）', () => {
  it('服务端上下文与内存一致且快照新鲜时，只读一次会话、不重选', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    getSession.mockClear()
    selectContext.mockClear()

    expect(await store.revalidate('TENANT')).toBe('fresh')
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(selectContext).not.toHaveBeenCalled()
  })

  it('30s 内重复触发只读一次会话（导航 + 窗口聚焦不会叠加请求）', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    getSession.mockClear()

    await store.revalidate('TENANT')
    await store.revalidate('TENANT')
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('发现别的标签页切了门店时跟随服务端（context-changed）', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    expect(store.current?.contextId).toBe('100::')

    getSession.mockResolvedValue({ authenticated: true, selectedContextId: '200:200:200' })
    expect(await store.revalidate('TENANT', { force: true })).toBe('context-changed')
    expect(store.current?.contextId).toBe('200:200:200')
  })

  it('权限快照超过 5 分钟未换时重新 select 一次拿新快照', async () => {
    vi.useFakeTimers()
    try {
      const store = useContextStore()
      await store.ensureContext('TENANT')
      expect(selectContext).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(6 * 60 * 1000)
      expect(await store.revalidate('TENANT')).toBe('permissions-refreshed')
      expect(selectContext).toHaveBeenCalledTimes(2)
      // 上下文没变，页面不该被重载
      expect(store.current?.contextId).toBe('100::')
    } finally {
      vi.useRealTimers()
    }
  })

  it('校准期间运营自己切了上下文时作废本次校准，不覆盖用户选择', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')

    let release
    getSession.mockImplementation(() => new Promise((resolve) => {
      release = resolve
    }))
    const pending = store.revalidate('TENANT', { force: true })
    // 校准已读到旧会话（100::），此刻运营切到 200:200:200
    await store.select('200:200:200')
    release({ authenticated: true, selectedContextId: '100::' })

    expect(await pending).toBe('fresh')
    expect(store.current?.contextId).toBe('200:200:200')
  })

  it('会话失效时清空上下文并返回 session-expired', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    getSession.mockResolvedValue({ authenticated: false })

    expect(await store.revalidate('TENANT', { force: true })).toBe('session-expired')
    expect(store.current).toBeNull()
    expect(store.items).toEqual([])
    expect(store.settled).toBe(false)
  })

  it('会话读取失败时保留已有上下文（不把运营挡在空态上）', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    getSession.mockRejectedValue(new Error('network down'))

    expect(await store.revalidate('TENANT', { force: true })).toBe('unavailable')
    expect(store.current?.contextId).toBe('100::')
  })

  /**
   * 平台账号的上下文长这样（后端 IamSnapshotMapper.selectAllTenantContexts：
   * `SELECT t.id AS tenant_id, 'PLATFORM' AS scope_type, NULL AS organization_id, NULL AS store_id`）：
   * contextId = `<tenantId>::`，scopeType = PLATFORM，org/store 为空。
   *
   * 这条用例锁死「前端反推的比对键 == 服务端签发的 selectedContextId」这个契约：
   * 一旦二者不一致，revalidate 会把「其实是同一个上下文」判成 context-changed，
   * 而 revalidateInBackground 收到 context-changed 会整页 reload —— 每次点菜单刷新一次页面。
   */
  it('平台账号的租户上下文（scopeType=PLATFORM、无组织/门店）不会被误判成上下文变化', async () => {
    const platformContext = { contextId: '7::', tenantId: 7, scopeType: 'PLATFORM' }
    getContexts.mockResolvedValue({ items: [platformContext] })
    getSession.mockResolvedValue({ authenticated: true, selectedContextId: '7::' })
    selectContext.mockImplementation(async (id) => (id === '7::' ? platformContext : undefined))

    const store = useContextStore()
    await store.ensureContext('PLATFORM')
    expect(store.current?.contextId).toBe('7::')

    // 同一个上下文：必须回到 fresh（守卫不会整页重载），而不是 context-changed。
    expect(await store.revalidate('PLATFORM', { force: true })).toBe('fresh')
    expect(store.current?.contextId).toBe('7::')
  })

  it('clear() 复位 loading，避免在途解析被作废后把重试按钮锁死', async () => {
    const store = useContextStore()
    let release
    getSession.mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const pending = store.ensureContext('TENANT')
    expect(store.loading).toBe(true)

    // 退出登录/换账号时会 clear()：在途请求的 finally 因代数不符被跳过，必须在这里复位。
    store.clear()
    expect(store.loading).toBe(false)

    release({ authenticated: true, selectedContextId: '100::' })
    await pending
    expect(store.loading).toBe(false)
    expect(store.current).toBeNull()
  })
})

/**
 * 线上问题（2026-09）：页面放着不动十几分钟到几小时后回来，点按钮/翻页/查询「什么反馈都没有」。
 *
 * 这里锁死回到前台的自愈闭环：会话校验 + 权限快照失效重拉；
 * 「换了上下文」仍然整页 reload（不混显两套数据），而网络抖动/无上下文绝不 reload。
 */
describe('长期空闲回到前台的自愈（会话看护调用）', () => {
  it('作废权限快照并强制重选一次；上下文没变就不整页 reload', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    selectContext.mockClear()
    window.location.reload.mockClear()

    expect(await store.recoverAfterIdle('TENANT')).toBe('permissions-refreshed')
    expect(selectContext.mock.calls.map((call) => call[0])).toEqual(['100::'])
    expect(window.location.reload).not.toHaveBeenCalled()
  })

  it('服务端上下文与本地不一致时整页 reload（保持既有语义）', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    window.location.reload.mockClear()
    getSession.mockResolvedValue({ authenticated: true, selectedContextId: '200:200:200' })

    expect(await store.recoverAfterIdle('TENANT')).toBe('context-changed')
    expect(store.current?.contextId).toBe('200:200:200')
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('空闲期间会话失效 → 回登录页，不整页 reload', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    window.location.reload.mockClear()
    window.location.hash = ''
    getSession.mockResolvedValue({ authenticated: false })

    expect(await store.recoverAfterIdle('TENANT')).toBe('session-expired')
    expect(window.location.hash).toBe('#/login')
    expect(window.location.reload).not.toHaveBeenCalled()
    expect(store.current).toBeNull()
  })

  it('会话读取网络异常 → unavailable，保留现有上下文且不 reload（不打扰运营）', async () => {
    const store = useContextStore()
    await store.ensureContext('TENANT')
    window.location.reload.mockClear()
    getSession.mockRejectedValue(new Error('network down'))

    expect(await store.recoverAfterIdle('TENANT')).toBe('unavailable')
    expect(window.location.reload).not.toHaveBeenCalled()
    expect(store.current?.contextId).toBe('100::')
  })
})

/**
 * 「点了没反应」的最后一道防线：单飞锁（resolving/revalidating）背后的 Promise 如果永不落地，
 * 之后每一次导航/重试都会静默复用它。超时后必须释放锁，让调用方拿到明确失败并能重试。
 */
describe('单飞锁兜底：Promise 永不落地时不能把界面锁死', () => {
  it('ensureContext 超时释放锁并给出可重试的失败', async () => {
    vi.useFakeTimers()
    try {
      const store = useContextStore()
      getSession.mockImplementation(() => new Promise(() => {}))
      const pending = store.ensureContext('TENANT')
      expect(store.loading).toBe(true)

      const assertion = expect(pending).rejects.toThrow(LOCK_TIMEOUT_MESSAGE)
      await vi.advanceTimersByTimeAsync(LOCK_WATCHDOG_MS + 1)
      await assertion

      expect(store.loading).toBe(false)
      // 锁已释放：能重新发起一次真正的解析，而不是复用永不落地的 Promise
      getSession.mockResolvedValue({ authenticated: true, selectedContextId: '100::' })
      await expect(store.ensureContext('TENANT')).resolves.toBeTruthy()
      expect(store.current?.contextId).toBe('100::')
    } finally {
      vi.useRealTimers()
    }
  })

  it('revalidate 超时释放锁，后续聚焦/导航的校准不会被静默吞掉', async () => {
    vi.useFakeTimers()
    try {
      const store = useContextStore()
      await store.ensureContext('TENANT')
      getSession.mockImplementation(() => new Promise(() => {}))

      const pending = store.revalidate('TENANT', { force: true })
      const assertion = expect(pending).rejects.toThrow(LOCK_TIMEOUT_MESSAGE)
      await vi.advanceTimersByTimeAsync(LOCK_WATCHDOG_MS + 1)
      await assertion

      getSession.mockResolvedValue({ authenticated: true, selectedContextId: '100::' })
      expect(await store.revalidate('TENANT', { force: true })).toBe('fresh')
    } finally {
      vi.useRealTimers()
    }
  })
})
