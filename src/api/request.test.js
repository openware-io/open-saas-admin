import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ElMessageMock } = vi.hoisted(() => ({
  ElMessageMock: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

vi.mock('element-plus', () => ({ ElMessage: ElMessageMock }))

import axios from 'axios'
import request, {
  CSRF_MAX_AGE_MS,
  HARD_RECOVERY_GUARD_KEY,
  HARD_RECOVERY_MESSAGE,
  HARD_RECOVERY_WINDOW_MS,
  canHardRecover,
  hardRecover,
  invalidateCsrfToken,
  refreshCsrfToken,
  resetAuthRedirectGuard,
  resetHardRecoveryGuard,
  shouldHardRecover,
} from './request'

/** node 测试环境里没有浏览器存储：给一个最小实现，顺便方便断言「有没有被清掉」。 */
function memoryStorage() {
  const store = new Map()
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    size: () => store.size,
  }
}

const sessionStore = memoryStorage()
const localStore = memoryStorage()
const reload = vi.fn()

vi.stubGlobal('window', {
  location: { origin: 'http://localhost:5174', hash: '', reload },
  sessionStorage: sessionStore,
  localStorage: localStore,
  dispatchEvent: vi.fn(),
  addEventListener: vi.fn(),
  // 让硬恢复里「先提示、再刷新」的延迟在测试中同步发生
  setTimeout: (fn) => { fn(); return 0 },
})
vi.stubGlobal('sessionStorage', sessionStore)
vi.stubGlobal('localStorage', localStore)
vi.stubGlobal('document', { visibilityState: 'visible' })
// 硬恢复会往控制台写一条诊断日志：测试里静音，保持输出干净。
vi.spyOn(console, 'warn').mockImplementation(() => {})

/** 会话/CSRF 这类裸 axios 调用（不带拦截器）走全局限定 adapter。 */
function stubGlobalAdapter(handler) {
  const calls = []
  axios.defaults.adapter = async (config) => {
    calls.push(config)
    const result = handler(config, calls)
    if (result instanceof Error) throw result
    return { data: result, status: 200, statusText: 'OK', headers: {}, config }
  }
  return calls
}

/** 业务请求走 request 实例自己的 adapter。 */
function stubApiAdapter(handler) {
  const calls = []
  request.defaults.adapter = async (config) => {
    calls.push(config)
    const result = handler(config, calls)
    if (result instanceof Error) throw result
    return { data: result, status: 200, statusText: 'OK', headers: {}, config }
  }
  return calls
}

function axiosError(config, status, data) {
  const error = new Error(`Request failed with status code ${status}`)
  error.isAxiosError = true
  error.config = config
  error.response = { status, data, headers: {}, config }
  return error
}

function networkError(config, code = 'ECONNABORTED') {
  const error = new Error(code === 'ECONNABORTED' ? 'timeout of 15000ms exceeded' : 'Network Error')
  error.isAxiosError = true
  error.code = code
  error.config = config
  return error
}

function toastMessages() {
  return ElMessageMock.error.mock.calls.map(([arg]) => (typeof arg === 'string' ? arg : arg?.message || ''))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStore.clear()
  localStore.clear()
  window.location.hash = ''
  invalidateCsrfToken()
  resetAuthRedirectGuard()
  resetHardRecoveryGuard(sessionStore)
  // 默认：全局 adapter 满足 CSRF 预取与会话读取
  stubGlobalAdapter((config) => {
    if (String(config.url).includes('/auth/csrf')) return { csrfToken: 'csrf-default' }
    return { authenticated: true, selectedContextId: '1::' }
  })
})

describe('网络类失败的反馈（不能没有反馈，也不能把英文原文抛给运营）', () => {
  it('GET 超时自动重试一次，仍失败时给出可操作的中文提示', async () => {
    const apiCalls = stubApiAdapter((config) => networkError(config, 'ECONNABORTED'))

    await expect(request.get('/api/v1/admin/platform/tenants')).rejects.toBeTruthy()

    expect(apiCalls).toHaveLength(2)
    expect(toastMessages()).toEqual(['请求超时，请检查网络后重试。'])
  })

  it('写操作（POST）网络失败只提示、绝不自动重试（避免重复下单/重复收款）', async () => {
    const apiCalls = stubApiAdapter((config) => networkError(config, 'ECONNABORTED'))

    await expect(request.post('/api/v1/business/orders', {})).rejects.toBeTruthy()

    expect(apiCalls).toHaveLength(1)
    expect(toastMessages()).toEqual(['请求超时，请检查网络后重试。'])
  })

  it('连接类网络错误也有中文提示', async () => {
    stubApiAdapter((config) => networkError(config, 'ERR_NETWORK'))

    await expect(request.get('/api/v1/admin/platform/tenants')).rejects.toBeTruthy()

    expect(toastMessages()).toEqual(['网络连接异常，请检查网络后重试。'])
  })
})

describe('CSRF：主动换新 + 重试一次 + 兜底硬恢复', () => {
  it('403 CSRF_TOKEN_INVALID 换新 token 重试一次，成功则不再提示', async () => {
    let csrfFetches = 0
    stubGlobalAdapter((config) => {
      if (String(config.url).includes('/auth/csrf')) {
        csrfFetches += 1
        return { csrfToken: `csrf-${csrfFetches}` }
      }
      return {}
    })
    const apiCalls = stubApiAdapter((config, calls) => {
      if (calls.length === 1) return axiosError(config, 403, { code: 'CSRF_TOKEN_INVALID' })
      return { ok: true }
    })

    await expect(request.post('/api/v1/admin/tenant/currency', { currencyCode: 'CNY' })).resolves.toEqual({ ok: true })
    expect(apiCalls).toHaveLength(2)
    expect(csrfFetches).toBe(2)
    expect(toastMessages()).toEqual([])
    expect(reload).not.toHaveBeenCalled()
  })

  it('换新 token 后仍失败：清态 + 中文提示 + 自动刷新一次（60 秒内只刷一次）', async () => {
    let csrfFetches = 0
    stubGlobalAdapter((config) => {
      if (String(config.url).includes('/auth/csrf')) {
        csrfFetches += 1
        return { csrfToken: `csrf-${csrfFetches}` }
      }
      return {}
    })
    const apiCalls = stubApiAdapter((config) => axiosError(config, 403, { code: 'CSRF_TOKEN_INVALID' }))

    await expect(request.post('/api/v1/business/orders/1/settle', {})).rejects.toBeTruthy()
    expect(apiCalls).toHaveLength(2)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(toastMessages()).toContain(HARD_RECOVERY_MESSAGE)
    expect(sessionStore.getItem(HARD_RECOVERY_GUARD_KEY)).toBeTruthy()

    // 60 秒窗口内的第二次故障不再自动刷新（防刷新循环），但仍然给出中文提示
    ElMessageMock.error.mockClear()
    await expect(request.post('/api/v1/business/orders/1/settle', {})).rejects.toBeTruthy()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(toastMessages().join('|')).toContain('请先在右上角重新选择门店上下文')
  })

  it('CSRF 缓存超过保鲜期后，写操作主动换新 token', async () => {
    vi.useFakeTimers()
    try {
      let csrfFetches = 0
      stubGlobalAdapter((config) => {
        if (String(config.url).includes('/auth/csrf')) {
          csrfFetches += 1
          return { csrfToken: `csrf-${csrfFetches}` }
        }
        return {}
      })
      stubApiAdapter(() => ({ ok: true }))
      invalidateCsrfToken()

      await request.post('/api/v1/business/orders', {})
      await request.post('/api/v1/business/orders', {})
      expect(csrfFetches).toBe(1)

      vi.setSystemTime(Date.now() + CSRF_MAX_AGE_MS + 1)
      await request.post('/api/v1/business/orders', {})
      expect(csrfFetches).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('并发刷新 CSRF 只打一次接口（单飞）', async () => {
    let csrfFetches = 0
    stubGlobalAdapter((config) => {
      if (String(config.url).includes('/auth/csrf')) csrfFetches += 1
      return { csrfToken: `csrf-${csrfFetches}` }
    })
    invalidateCsrfToken()

    const [first, second] = await Promise.all([refreshCsrfToken(), refreshCsrfToken()])
    expect(csrfFetches).toBe(1)
    expect(first).toBe(second)
  })
})

describe('上下文/权限失败：既有语义不回归', () => {
  it('PERMISSION_DENIED 仍然重选上下文并重试一次；重试成功不提示', async () => {
    stubGlobalAdapter((config) => {
      if (String(config.url).includes('/auth/session')) return { authenticated: true, selectedContextId: '1::' }
      if (String(config.url).includes('/auth/csrf')) return { csrfToken: 'csrf-ctx' }
      return { contextId: '1::' }
    })
    const apiCalls = stubApiAdapter((config, calls) => {
      if (calls.length === 1) return axiosError(config, 403, { code: 'PERMISSION_DENIED' })
      return { ok: true }
    })

    await expect(request.post('/api/v1/admin/iam/roles/3/permissions/toggle', {})).resolves.toEqual({ ok: true })
    expect(apiCalls).toHaveLength(2)
    expect(toastMessages()).toEqual([])
  })

  it('重试后仍 PERMISSION_DENIED：给中文提示，但绝不自动刷新页面（授权结论不是坏状态）', async () => {
    stubGlobalAdapter((config) => {
      if (String(config.url).includes('/auth/session')) return { authenticated: true, selectedContextId: '1::' }
      if (String(config.url).includes('/auth/csrf')) return { csrfToken: 'csrf-ctx' }
      return { contextId: '1::' }
    })
    const apiCalls = stubApiAdapter((config) => axiosError(config, 403, { code: 'PERMISSION_DENIED' }))

    await expect(request.post('/api/v1/admin/iam/roles/3/permissions/toggle', {})).rejects.toBeTruthy()

    expect(apiCalls).toHaveLength(2)
    expect(reload).not.toHaveBeenCalled()
    expect(toastMessages().join('|')).toContain('当前账号没有执行此操作的权限。')
  })

  it('上下文刷新成功但重试后仍 SAAS_CONTEXT_REQUIRED：硬恢复一次，而不是当作会话失效登出', async () => {
    stubGlobalAdapter((config) => {
      if (String(config.url).includes('/auth/session')) return { authenticated: true, selectedContextId: '1::' }
      if (String(config.url).includes('/auth/csrf')) return { csrfToken: 'csrf-ctx' }
      return { contextId: '1::' }
    })
    const apiCalls = stubApiAdapter((config) => axiosError(config, 401, { code: 'SAAS_CONTEXT_REQUIRED' }))

    await expect(request.post('/api/v1/business/orders', {})).rejects.toBeTruthy()

    expect(apiCalls).toHaveLength(2)
    expect(reload).toHaveBeenCalledTimes(1)
    // 关键：绝不因为 SAAS_CONTEXT_REQUIRED 就清登录态 + 跳登录页（2026-09-10 修复的语义）
    expect(window.location.hash).not.toBe('#/login')
    expect(toastMessages()).not.toContain('登录已过期，请重新登录')
  })

  it('连上下文都刷新不了（会话已死/网络断了）时也走硬恢复，不留一个点了没反应的页面', async () => {
    stubGlobalAdapter((config) => {
      if (String(config.url).includes('/auth/csrf')) return { csrfToken: 'csrf-ctx' }
      throw new Error('session refresh unavailable')
    })
    const apiCalls = stubApiAdapter((config) => axiosError(config, 401, { code: 'SAAS_CONTEXT_REQUIRED' }))

    await expect(request.post('/api/v1/business/orders', {})).rejects.toBeTruthy()

    expect(apiCalls).toHaveLength(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

/**
 * 线上根因回归（2026-09）：签名运营上下文 token 只有 30 分钟有效期，会话默认 2 小时。
 * 领域服务的 TenantContextFilter 对过期上下文直接 sendError(401)（**没有 code**）。
 * 旧实现把这种 401 一律当成「登录过期」→ 清态 + 跳登录，运营看到的是「页面放一会儿就全站点不动」，
 * 刷新后（重新 select 换新 token）又一切正常。现在必须走「重选上下文 + 重试一次」的自愈路径。
 */
describe('无 code 的 401（下游判定签名上下文过期）必须自愈，不能当成登录过期', () => {
  it('重选上下文后重试成功：不登出、不刷新、不打扰运营', async () => {
    stubGlobalAdapter((config) => {
      if (String(config.url).includes('/auth/session')) return { authenticated: true, selectedContextId: '1::' }
      if (String(config.url).includes('/auth/csrf')) return { csrfToken: 'csrf-fresh' }
      return { contextId: '1::' }
    })
    const apiCalls = stubApiAdapter((config, calls) => {
      // 第一次：模拟 TenantContextFilter 的 sendError(401, "Invalid tenant context")——没有 code
      if (calls.length === 1) return axiosError(config, 401, { status: 401, error: 'Unauthorized', message: 'Invalid tenant context' })
      return { ok: true }
    })
    localStore.setItem('saas_admin_user', '{"username":"ops"}')

    await expect(request.get('/api/v1/admin/orders')).resolves.toEqual({ ok: true })

    expect(apiCalls).toHaveLength(2)
    expect(reload).not.toHaveBeenCalled()
    expect(window.location.hash).not.toBe('#/login')
    expect(localStore.getItem('saas_admin_user')).toBe('{"username":"ops"}')
    expect(toastMessages()).toEqual([])
  })

  it('自愈后仍失败：一次性硬恢复（自动刷新），而不是把运营踢回登录页', async () => {
    stubGlobalAdapter((config) => {
      if (String(config.url).includes('/auth/session')) return { authenticated: true, selectedContextId: '1::' }
      if (String(config.url).includes('/auth/csrf')) return { csrfToken: 'csrf-fresh' }
      return { contextId: '1::' }
    })
    const apiCalls = stubApiAdapter((config) => axiosError(config, 401, { message: 'Invalid tenant context' }))

    await expect(request.get('/api/v1/admin/orders')).rejects.toBeTruthy()

    expect(apiCalls).toHaveLength(2)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(window.location.hash).not.toBe('#/login')
  })

  it('会话确实失效（SAAS_SESSION_REQUIRED）仍然清态 + 跳登录（既有语义不回归）', async () => {
    stubApiAdapter((config) => axiosError(config, 401, { code: 'SAAS_SESSION_REQUIRED' }))
    localStore.setItem('saas_admin_user', '{"username":"ops"}')
    localStore.setItem('saas_admin_scope', 'TENANT')

    await expect(request.get('/api/v1/admin/orders')).rejects.toBeTruthy()

    expect(window.location.hash).toBe('#/login')
    expect(localStore.getItem('saas_admin_user')).toBeNull()
    expect(localStore.getItem('saas_admin_scope')).toBeNull()
    expect(toastMessages()).toContain('登录已过期，请重新登录')
    expect(reload).not.toHaveBeenCalled()
  })

  it('登录接口自己失败（中文服务端 message）时不清登录态、不跳登录页', async () => {
    stubApiAdapter((config) => axiosError(config, 401, { code: 'ADMIN_LOGIN_INVALID', message: '用户名或密码错误' }))
    localStore.setItem('saas_admin_user', '{"username":"ops"}')

    await expect(request.post('/api/v1/admin/auth/login', { username: 'ops', password: 'x' })).rejects.toBeTruthy()

    expect(toastMessages()).toContain('用户名或密码错误')
    expect(window.location.hash).not.toBe('#/login')
    expect(localStore.getItem('saas_admin_user')).toBe('{"username":"ops"}')
  })
})

describe('硬恢复的窗口与清理', () => {
  it('shouldHardRecover 只认「自愈重试过仍失败」的鉴权坏状态', () => {
    expect(shouldHardRecover({
      response: { status: 403, data: { code: 'CSRF_TOKEN_INVALID' } },
      config: {},
    })).toBe(false)
    expect(shouldHardRecover({
      response: { status: 403, data: { code: 'CSRF_TOKEN_INVALID' } },
      config: { _csrfRetried: true },
    })).toBe(true)
    expect(shouldHardRecover({
      response: { status: 401, data: { code: 'SAAS_CONTEXT_REQUIRED' } },
      config: { _contextRefreshed: true },
    })).toBe(true)
    // 无 code 的 401（下游签名上下文过期）自愈失败后同样交给一次性硬恢复
    expect(shouldHardRecover({
      response: { status: 401, data: { message: 'Invalid tenant context' } },
      config: { _contextRefreshed: true },
    })).toBe(true)
    // 授权结论（账号确实没权限）不是坏状态：绝不自动刷新
    expect(shouldHardRecover({
      response: { status: 403, data: { code: 'PERMISSION_DENIED' } },
      config: { _contextRefreshed: true },
    })).toBe(false)
    // 会话确实死了有明确的跳登录路径，不靠刷新兜底
    expect(shouldHardRecover({
      response: { status: 401, data: { code: 'SAAS_SESSION_REQUIRED' } },
      config: { _contextRefreshed: true },
    })).toBe(false)
    expect(shouldHardRecover({
      response: { status: 401, data: { code: 'ADMIN_SESSION_INVALID' } },
      config: { _contextRefreshed: true },
    })).toBe(false)
    expect(shouldHardRecover({
      response: { status: 500, data: { code: 'CSRF_TOKEN_INVALID' } },
      config: { _csrfRetried: true },
    })).toBe(false)
  })

  it('60 秒窗口内只自动刷新一次，窗口之后允许再次恢复', () => {
    const guard = memoryStorage()
    const store = memoryStorage()
    const notify = vi.fn()
    const doReload = vi.fn()
    const start = 1_700_000_000_000

    expect(hardRecover({ sessionGuard: guard, localStore: store, timestamp: start, notify, reload: doReload })).toBe(true)
    expect(doReload).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(HARD_RECOVERY_MESSAGE)

    expect(canHardRecover(guard, start + HARD_RECOVERY_WINDOW_MS - 1)).toBe(false)
    expect(hardRecover({
      sessionGuard: guard, localStore: store, timestamp: start + HARD_RECOVERY_WINDOW_MS - 1, notify, reload: doReload,
    })).toBe(false)
    expect(doReload).toHaveBeenCalledTimes(1)

    expect(canHardRecover(guard, start + HARD_RECOVERY_WINDOW_MS)).toBe(true)
    expect(hardRecover({
      sessionGuard: guard, localStore: store, timestamp: start + HARD_RECOVERY_WINDOW_MS, notify, reload: doReload,
    })).toBe(true)
    expect(doReload).toHaveBeenCalledTimes(2)
  })

  it('清掉登录展示态：刷新后的守卫会重新问一次服务端会话', () => {
    const store = memoryStorage()
    store.setItem('saas_admin_user', '{"username":"ops"}')
    store.setItem('saas_admin_scope', 'TENANT')

    hardRecover({
      sessionGuard: memoryStorage(), localStore: store, timestamp: 1, notify: vi.fn(), reload: vi.fn(),
    })

    expect(store.getItem('saas_admin_user')).toBeNull()
    expect(store.getItem('saas_admin_scope')).toBeNull()
  })

  it('没有可用 sessionStorage（隐私模式）时依然允许恢复', () => {
    expect(canHardRecover(null, 1_700_000_000_000)).toBe(true)
  })
})
