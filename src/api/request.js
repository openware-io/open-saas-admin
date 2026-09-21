import axios from 'axios'
import { ElMessage } from 'element-plus'
import { resolveAdminErrorMessage } from '@/utils/adminErrorMessage'
import { applyGatewayCurrency } from '@/utils/currency-runtime'
import { SESSION_EXPIRED_EVENT, emitRuntimeEvent } from '@/utils/runtime-events'
import { ERRORS } from '@/constants/terms'

let isRedirectingToLogin = false
let csrfToken = null
let csrfFetchedAt = 0
let csrfPending = null
const SAFE_METHODS = new Set(['get', 'head', 'options'])

/**
 * CSRF 缓存的本地保鲜上限。
 *
 * docs/backend-security-contract.md 明确 `GET /api/v1/admin/auth/csrf` 下发的是 **short-lived**
 * token，而这里曾经把它缓存到整个页面生命周期（模块级变量 `csrfToken` 一旦有值就永不再取）。
 * 页面放着不动十几分钟后，所有写操作都会带着过期 token 上去；能不能自愈完全取决于服务端
 * 恰好回 `CSRF_TOKEN_INVALID`。现在三层一起兜：①超过该时长主动换新；②会话看护每 4 分钟预取一次
 * （见 utils/sessionWatchdog.js）；③拿到新 token 之前先失效，避免并发写操作复用同一个坏 token。
 */
export const CSRF_MAX_AGE_MS = 5 * 60_000

/** 硬恢复（清态 + 提示 + 自动刷新）的防抖窗口：60 秒内只允许自动刷新一次，避免刷新循环。 */
export const HARD_RECOVERY_WINDOW_MS = 60_000
export const HARD_RECOVERY_GUARD_KEY = 'saas_admin_hard_recovery_at'
/** 硬恢复的提示文案（新增文案只放在本模块，避免与 constants/terms.js 的并行改动冲突）。 */
export const HARD_RECOVERY_MESSAGE = '页面登录凭证已失效，正在自动刷新恢复，请稍后重试。'
const HARD_RECOVERY_RELOAD_DELAY_MS = 600

/**
 * 「鉴权状态已经坏了」的错误码集合。
 *
 * 只有这些码在**重试过一次之后仍然失败**才算坏状态（CSRF 换新 token 后仍失败、上下文重选后仍失败）：
 * 服务端已经明确告诉我们「你手上这份凭证不可用」，而前端已经用掉了自愈重试，此时清态 + 自动刷新
 * 是唯一能让运营继续干活的路径。
 *
 * 刻意不包含 `PERMISSION_DENIED`：那是服务端的授权结论（账号确实没这个权限），刷新页面既不会变好，
 * 还会打断正在填的表单 —— 它继续保持既有行为（重选上下文重试一次 + 中文提示）。
 */
const AUTH_STATE_ERROR_CODES = new Set([
  'CSRF_TOKEN_INVALID',
  'SAAS_CONTEXT_REQUIRED',
  'SAAS_CONTEXT_INVALID',
  'CONTEXT_FORBIDDEN',
])

/**
 * 「会话确实死了」的错误码：只有这三种才清登录态 + 跳登录页。
 *
 * 来源：
 *  - 网关 SaasSessionAuthenticationFilter：`SAAS_SESSION_REQUIRED`（没带 cookie / Redis 会话已过期）；
 *  - 后台服务 SaaAdminAuthenticationFilter：`ADMIN_SESSION_MISSING` / `ADMIN_SESSION_INVALID`。
 */
const SESSION_DEATH_CODES = new Set([
  'SAAS_SESSION_REQUIRED',
  'ADMIN_SESSION_MISSING',
  'ADMIN_SESSION_INVALID',
])

/** 非「会话确实死了」的 401 提示（新增文案只放在本模块，避免与 constants/terms.js 并行改动冲突）。 */
const NON_SESSION_401_HINT = '（页面可能长时间未操作，正在尝试自动恢复；若持续失败请刷新页面或重新登录）'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/',
  timeout: 15000,
  withCredentials: true, // 登录态走 HttpOnly Cookie（Redis 服务端会话）
})

// 声明本前端属于「SaaS 后台」应用族：同一浏览器里若同时存在 KTV 消费端/B 端会话，
// 网关必须用后台会话 cookie 解析（否则进租户后台会被消费端会话接管 → 401 退出登录）。
const SAAS_APP_HEADER = 'X-Saas-App'
const SAAS_APP_VALUE = 'saas-admin'
request.defaults.headers.common[SAAS_APP_HEADER] = SAAS_APP_VALUE
// loadCsrfToken / refreshActiveContext 走裸 axios（不带拦截器），全局默认头一并设置。
axios.defaults.headers.common[SAAS_APP_HEADER] = SAAS_APP_VALUE

const PUBLIC_AUTH_PATHS = new Set(['/api/v1/admin/auth/login', '/api/v1/admin/auth/sso'])

function baseOrigin() {
  return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost'
}

/** 取请求路径（与请求拦截器同一口径），用于区分「登录接口本身」和其它接口。 */
function pathOf(config) {
  try {
    return new URL(config?.url || '', baseOrigin()).pathname
  } catch {
    return ''
  }
}

function isPublicAuthPath(config) {
  return PUBLIC_AUTH_PATHS.has(pathOf(config))
}

function errorCodeOf(err) {
  return typeof err?.response?.data?.code === 'string' ? err.response.data.code.trim() : ''
}

/**
 * 该 401 是否属于「持有的是过期凭证」而不是「没登录」。
 *
 * 领域服务（order / resource / tenant / customer / marketing …）的 `TenantContextFilter` 对过期或非法的
 * `X-Tenant-Context` 直接 `response.sendError(401, "Invalid tenant context")`（无 code、英文 message）：
 * 签名上下文 token 只有 30 分钟有效期（AdminTenantContextTokenSigner），而会话默认 2 小时，
 * 网关只负责把会话里的签名上下文透传，过期只有下游才发现。这类 401 必须走
 * 「用会话里的 selectedContextId 重选上下文换新 token 再重试一次」的自愈路径。
 */
function isContextTokenExpiry(err) {
  if (err?.response?.status !== 401) return false
  if (isPublicAuthPath(err.config)) return false
  return !SESSION_DEATH_CODES.has(errorCodeOf(err))
}

// 租户上下文由服务端会话解析，浏览器不发送可篡改的权限快照。
async function fetchCsrfToken() {
  const response = await axios.get('/api/v1/admin/auth/csrf', {
    baseURL: import.meta.env.VITE_API_BASE_URL || '/',
    withCredentials: true,
    timeout: 15000,
  })
  const token = response.data?.csrfToken
  if (!token) throw new Error(ERRORS.csrfTokenMissing)
  csrfToken = token
  csrfFetchedAt = Date.now()
  return token
}

/**
 * 取 CSRF token。
 *
 * - 缓存未过期直接复用；
 * - 过期/被失效（`invalidateCsrfToken`）时重新取，并且**单飞**：一批并发写操作只打一次 csrf 接口，
 *   避免每个请求各拉一份 token（服务端 short-lived token 轮换时更明显）。
 */
export async function loadCsrfToken({ force = false } = {}) {
  if (!force && csrfToken && Date.now() - csrfFetchedAt < CSRF_MAX_AGE_MS) return csrfToken
  if (csrfPending) return csrfPending
  csrfPending = fetchCsrfToken().finally(() => { csrfPending = null })
  return csrfPending
}

/** 让下一个写操作重新取 token（会话换了、服务端判 CSRF 失效时调用）。 */
export function invalidateCsrfToken() {
  csrfToken = null
  csrfFetchedAt = 0
}

/** 会话看护用：会话有效时主动预取/刷新 CSRF，失败由调用方忽略（不打扰运营）。 */
export function refreshCsrfToken() {
  return loadCsrfToken({ force: true })
}

/** 登录态已恢复（成功响应）时复位「正在跳登录」闩锁。 */
export function resetAuthRedirectGuard() {
  isRedirectingToLogin = false
}

request.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase()
  const path = pathOf(config)
  if (!SAFE_METHODS.has(method) && !PUBLIC_AUTH_PATHS.has(path)) {
    config.headers['X-CSRF-Token'] = await loadCsrfToken()
  }
  return config
})

// 后端异常时可能只返回框架默认错误页（没有可读 message，例如缺 Idempotency-Key 时 Spring 的默认体），
// 网络层失败则连 response 都没有。这两种情况都不能把英文原文（如 Request failed with status code 500）
// 直接抛给运营人员：统一交给 utils/adminErrorMessage 做「错误码 → 中文 message → 状态码」的中文映射（2026-09-16）。

// 运营上下文（含权限快照）在「选择上下文」时被签进临时 token，权限变更不会自动反映到已有会话。
// 因此遇到上下文失效或权限不足时，先用服务端会话里记录的 contextId 重新挑选一次上下文（换取新 token），
// 再重试原请求一次；仍然失败才按错误提示。这样发版权限调整后老会话无需重新登录即可自愈。
async function refreshActiveContext() {
  const bare = { baseURL: import.meta.env.VITE_API_BASE_URL || '/', withCredentials: true, timeout: 15000 }
  const session = await axios.get('/api/v1/admin/auth/session', bare)
  const contextId = session.data?.selectedContextId
  if (!contextId) throw new Error(ERRORS.contextNotRefreshable)
  // 重选上下文会重写服务端会话，这里强制换一枚新 CSRF token（用缓存里的旧 token 正是要修的问题之一）。
  const token = await loadCsrfToken({ force: true })
  await axios.post('/api/v1/admin/context/select', { contextId },
    { ...bare, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token } })
}

  request.interceptors.response.use(
  (res) => {
    // 任何一次成功响应都证明当前登录态可用：复位「正在跳登录」闩锁。
    // 该闩锁是模块级的，曾经一旦置位就再不复位（只有 F5 才会清），于是「会话失效→跳登录→重新登录」
    // 之后第二次会话失效不再跳登录页，用户会停在每个请求都 401 的页面上。
    isRedirectingToLogin = false
    // 网关兜底（§3.4）：网关在响应上注入 X-Currency（取自上下文，缺省 USD）。
    // 老接口响应体没带 currencyCode 时由它补位；常量叶子模块写入，不引入 request ↔ stores 循环依赖。
    const headerCurrency = res?.headers?.['x-currency'] || res?.headers?.['X-Currency']
    if (headerCurrency) applyGatewayCurrency(headerCurrency)
    return res.data
  },
  (err) => {
    const status = err.response?.status
    const code = errorCodeOf(err)
    const config = err.config

    // ① 网络层失败（没有 response：超时 ECONNABORTED / 连接被中间设备静默丢弃 / 系统休眠后连接失效）。
    //    只读请求自动重试一次（幂等且用户感知最好）；写操作**绝不**自动重试，避免重复下单/重复收款，
    //    只给一条可操作的中文提示。
    if (!err.response) {
      const method = (config?.method || 'get').toLowerCase()
      if (config && !config._networkRetried && SAFE_METHODS.has(method)) {
        config._networkRetried = true
        return request(config)
      }
      reportError(err)
      return Promise.reject(err)
    }

    if (status === 403 && config && !config._csrfRetried
      && code === 'CSRF_TOKEN_INVALID') {
      // CSRF 失效：先失效缓存再换一枚新 token 重试一次。
      invalidateCsrfToken()
      config._csrfRetried = true
      return loadCsrfToken({ force: true }).then(
        (token) => {
          config.headers = config.headers || {}
          config.headers['X-CSRF-Token'] = token
          return request(config)
        },
        // 连 CSRF 都取不到（网络/会话问题）：按原错误提示，重试请求自身的失败由它自己的响应拦截处理，
        // 这里不能再用 .catch 兜（会把「重试失败」也算成「取 token 失败」而重复弹提示）。
        (csrfError) => { reportError(err); throw csrfError },
      )
    }
    // 权限不足 / 上下文失效 / 无 code 的 401（下游判签名上下文过期）：刷新上下文 token 后重试一次
    // （只重试一次）；刷新失败按常规提示。
    // CONTEXT_FORBIDDEN（选择上下文时快照为空）也重试一次：平台刚补授权时重选即可拿到新快照。
    const contextRecoverable = code === 'PERMISSION_DENIED'
      || code === 'CONTEXT_FORBIDDEN'
      || code === 'SAAS_CONTEXT_REQUIRED' || code === 'SAAS_CONTEXT_INVALID'
      || isContextTokenExpiry(err)
    if ((status === 403 || status === 401) && contextRecoverable && config && !config._contextRefreshed) {
      config._contextRefreshed = true
      return refreshActiveContext().then(
        () => request(config),
        (refreshError) => { reportError(err); throw refreshError },
      )
    }
    reportError(err)
    return Promise.reject(err)
  }
)

/** sessionStorage / localStorage 的安全取用（隐私模式、无 window 环境都不抛错）。 */
function safeSessionStorage() {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null
  } catch {
    return null
  }
}

function safeLocalStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

function removeLocalAuthState(store) {
  try {
    store?.removeItem('saas_admin_user')
    store?.removeItem('saas_admin_scope')
  } catch { /* 隐私模式下删除失败：刷新本身仍会重置内存态 */ }
}

/**
 * 是否还允许自动硬恢复。
 * 用 sessionStorage 记录上次自动刷新的时间：60 秒内只允许一次，防止「刷新 → 又是坏状态 → 再刷新」的死循环。
 * sessionStorage 在 F5 后仍然保留，但刷新后状态已经重建，新一轮故障的 60 秒窗口也早已过期。
 */
export function canHardRecover(store = safeSessionStorage(), timestamp = Date.now(), windowMs = HARD_RECOVERY_WINDOW_MS) {
  if (!store) return true
  let last = 0
  try {
    last = Number(store.getItem(HARD_RECOVERY_GUARD_KEY) || 0)
  } catch {
    return true
  }
  if (!Number.isFinite(last) || last <= 0) return true
  return timestamp - last >= windowMs
}

export function markHardRecovered(store = safeSessionStorage(), timestamp = Date.now()) {
  try {
    store?.setItem(HARD_RECOVERY_GUARD_KEY, String(timestamp))
  } catch { /* 写不进去（隐私模式）时宁可多刷一次，也不要卡死 */ }
}

export function resetHardRecoveryGuard(store = safeSessionStorage()) {
  try {
    store?.removeItem(HARD_RECOVERY_GUARD_KEY)
  } catch { /* 同上 */ }
}

/** 该错误是否属于「重试过一次仍失败的鉴权坏状态」，需要一次性硬恢复。 */
export function shouldHardRecover(err) {
  const status = err?.response?.status
  const code = errorCodeOf(err)
  if (status !== 401 && status !== 403) return false
  // 只有真正走过自愈重试的请求才算：第一次失败由上面两条重试分支处理，不能在这里直接刷新页面。
  if (!(err?.config?._csrfRetried || err?.config?._contextRefreshed)) return false
  // 会话确实死了有明确的跳登录路径，不需要（也不该）靠刷新页面兜底。
  if (status === 401) return !SESSION_DEATH_CODES.has(code)
  return AUTH_STATE_ERROR_CODES.has(code)
}

function defaultHardReload() {
  if (typeof window === 'undefined' || !window.location || typeof window.location.reload !== 'function') return
  const schedule = typeof window.setTimeout === 'function'
    ? window.setTimeout.bind(window)
    : (typeof setTimeout === 'function' ? setTimeout : null)
  if (schedule) schedule(() => window.location.reload(), HARD_RECOVERY_RELOAD_DELAY_MS)
  else window.location.reload()
}

/**
 * 一次性硬恢复：清本地状态 → 明确中文提示 → 自动刷新。
 *
 * 这是「点了没反应」的最后一道兜底：即使用户真撞上未知坏状态（CSRF/上下文自愈重试都用完了），
 * 也会自动刷新恢复，而不是要求他手动 F5。返回 false 表示 60 秒窗口内已经刷过一次（调用方继续走常规提示）。
 */
export function hardRecover({
  reason = '',
  sessionGuard = safeSessionStorage(),
  localStore = safeLocalStorage(),
  timestamp = Date.now(),
  notify,
  reload = defaultHardReload,
} = {}) {
  if (!canHardRecover(sessionGuard, timestamp)) return false
  markHardRecovered(sessionGuard, timestamp)
  // 清掉所有「进程内的坏状态」：CSRF 缓存、跳登录闩锁、localStorage 里的登录展示态。
  // 刷新后的守卫会重新问一次 /admin/auth/session：会话仍然有效就静默恢复，真失效才回登录页。
  invalidateCsrfToken()
  isRedirectingToLogin = false
  removeLocalAuthState(localStore)
  if (reason) console.warn('[saas-admin] 页面状态失效，自动刷新恢复：', reason)
  try {
    if (typeof notify === 'function') notify(HARD_RECOVERY_MESSAGE)
    else ElMessage.error({ message: HARD_RECOVERY_MESSAGE, duration: 4000 })
  } catch { /* 提示失败不能挡住恢复 */ }
  try {
    reload()
  } catch { /* 刷新失败时至少已经清态 + 提示 */ }
  return true
}

function reportError(err) {
  const status = err.response?.status
  const code = errorCodeOf(err)
  // 鉴权状态已经坏了（自愈重试都用完仍失败）：清态 + 明确提示 + 自动刷新一次，不必等用户自己 F5。
  if (shouldHardRecover(err)) {
    if (hardRecover({ reason: `${status} ${code}` })) return
  }
  if (status === 403) {
    // 403 都是「当前账号/当前上下文不满足」，统一给出可执行的下一步：
    // 先重选门店上下文（权限快照随之刷新，CONTEXT_FORBIDDEN 也会被换掉），仍失败才是账号确实没这个权限。
    const base = resolveAdminErrorMessage(err, ERRORS.permissionDenied)
    ElMessage.error({ message: `${base}${ERRORS.forbiddenHint}`, duration: 6000 })
    return
  }
  if (status === 401) {
    // 401 有多种语义，不能一律当作“登录过期”：
    //  - SAAS_SESSION_REQUIRED / ADMIN_SESSION_MISSING / ADMIN_SESSION_INVALID：会话确实失效
    //    -> 清登录态并跳登录；
    //  - SAAS_CONTEXT_REQUIRED / SAAS_CONTEXT_INVALID：会话有效但尚未选定/已过期上下文
    //    -> 绝不能登出，否则进入租户后台时会被直接踢回登录页（2026-09-10 修复）；
    //  - 无 code / 未登记的 401：领域服务的 TenantContextFilter 对过期签名上下文直接 sendError(401)
    //    （英文 message、没有 code），会话其实还在 —— 既不登出也不静默，
    //    给中文提示 + 明确的下一步，自愈重试由上面的拦截分支负责。
    if (isPublicAuthPath(err.config)) {
      // 登录/SSO 接口自己的失败由登录页展示（服务端 message 已是中文），不能清登录态、不能跳登录。
      ElMessage.error(resolveAdminErrorMessage(err))
      return
    }
    const contextMissing = code === 'SAAS_CONTEXT_REQUIRED' || code === 'SAAS_CONTEXT_INVALID'
    if (contextMissing) {
      ElMessage.error(resolveAdminErrorMessage(err, ERRORS.contextMissing))
      return
    }
    if (!SESSION_DEATH_CODES.has(code)) {
      ElMessage.error({
        message: `${resolveAdminErrorMessage(err, ERRORS.sessionExpired)}${NON_SESSION_401_HINT}`,
        duration: 6000,
      })
      return
    }
    invalidateCsrfToken()
    removeLocalAuthState(safeLocalStorage())
    // 让导航守卫缓存的「已确认登录态」失效：否则用户回点后台路由会被放行，再撞一次 401。
    emitRuntimeEvent(SESSION_EXPIRED_EVENT)
    if (!isRedirectingToLogin && window.location.hash !== '#/login') {
      isRedirectingToLogin = true
      window.location.hash = '#/login'
    }
    ElMessage.error(ERRORS.sessionExpired)
    return
  }
  // 网络类失败（无 response）：resolveAdminErrorMessage 会给出「请求超时，请检查网络后重试。」
  // 或「网络连接异常，请检查网络后重试。」，运营拿到的是可重试的中文提示，绝不是 axios 英文原文。
  ElMessage.error(resolveAdminErrorMessage(err))
}

export default request
