/**
 * 会话 / CSRF 看护（前台可见时轮询）与「点了没反应」的兜底工具箱。
 *
 * 背景（2026-09 线上问题）：
 *   后台页面放着不动十几分钟到几小时后回来点按钮/翻页/查询「什么反馈都没有」，
 *   手动 F5 刷新后一切恢复。会话在服务端仍然有效，坏掉的是**前端进程内的状态**：
 *     - `api/request.js` 的 `csrfToken` 缓存与 `stores/*` 的单飞锁（resolving/revalidating）、
 *       页面级 loading 都是模块级/实例级内存；页面闲置期间它们可能过期、或因为一次
 *       永不落地的请求而永久占位；
 *     - 之前的实现只在「用户下一次操作」时才去发现这些坏状态，而坏状态的表现恰好是
 *       「操作被静默吞掉」（按钮 disabled、`if (loading) return`、空态重试按钮自身被锁）。
 *   本模块负责两件事：
 *     1) 主动看护（AdminLayout 挂载时启动、卸载时停止）：前台可见时每 `SESSION_WATCH_INTERVAL_MS`
 *        调一次 `GET /api/v1/admin/auth/session`；会话有效就顺手刷新一次 CSRF，
 *        会话失效立刻回调让调用方清态 + 提示 + 跳登录（不等用户下一次操作）。
 *        标签页隐藏时暂停轮询；回到前台若隐藏/挂起了 `HIDDEN_RESUME_THRESHOLD_MS` 以上，
 *        先做一次会话校验，再回调让调用方把上下文/权限快照失效重拉（自愈）。
 *     2) `withTimeout`：任何「单飞锁 + await」的组合都必须有上界，否则一次永不落地的请求
 *        就能把整个后台变成「点了没反应」。超时后由调用方释放锁并给出可重试的明确失败。
 *
 * 这里的时钟、定时器、可见性都能注入，方便单测直接推演时间。
 */

/** 正数毫秒的环境变量覆盖出口：不配就用默认值（构建期注入，改参数不必改代码）。 */
function envMs(name, fallback) {
  try {
    const raw = Number(import.meta.env?.[name])
    return Number.isFinite(raw) && raw > 0 ? raw : fallback
  } catch {
    return fallback
  }
}

/** 前台可见时的会话轮询间隔（默认 4 分钟，可用 VITE_SESSION_WATCH_INTERVAL_MS 覆盖）。 */
export const SESSION_WATCH_INTERVAL_MS = envMs('VITE_SESSION_WATCH_INTERVAL_MS', 4 * 60_000)
/** 隐藏/挂起超过该时长后回到前台必须做会话校验 + 上下文自愈（默认 10 分钟，可用 VITE_SESSION_HIDDEN_RESUME_MS 覆盖）。 */
export const HIDDEN_RESUME_THRESHOLD_MS = envMs('VITE_SESSION_HIDDEN_RESUME_MS', 10 * 60_000)
/**
 * 单飞锁兜底：一次鉴权类请求（会话/候选上下文/选择上下文，axios 自身 15s 超时）超过该时长
 * 仍未落地，就释放锁并给出可重试的失败，绝不让调用方（导航守卫、重试按钮）永久等待。
 * 默认 20 秒，可用 VITE_SESSION_LOCK_WATCHDOG_MS 覆盖。
 */
export const LOCK_WATCHDOG_MS = envMs('VITE_SESSION_LOCK_WATCHDOG_MS', 20_000)
/** 单飞锁超时时的中文提示（不新增到 constants/terms.js，避免和并行改动冲突）。 */
export const LOCK_TIMEOUT_MESSAGE = '鉴权请求长时间无响应，已取消本次等待，请重试'

export const WATCHDOG_STATUS = Object.freeze({
  /** 会话有效，已回调 onSessionAlive（刷新 CSRF）。 */
  ALIVE: 'alive',
  /** 会话失效，已回调 onSessionExpired（清态 + 提示 + 跳登录）。 */
  EXPIRED: 'expired',
  /** 探测没拿到可用结论（网络抖动 / 非预期响应体）：不登出、不打扰，等下一轮。 */
  UNAVAILABLE: 'unavailable',
  /** 本轮不需要探测（隐藏中 / 刚刚见过前台 / 已失效 / 未启动）。 */
  SKIPPED: 'skipped',
})

/**
 * 把 `promise` 包一层上界：`ms` 内没落地就调用 `onTimeout()` 并以 `timeoutError` 拒绝。
 *
 * - 原始 promise 的两种结局都被接管（不会再产生 unhandled rejection）；
 * - 定时器在原始 promise 落地后一定被清掉，不会在测试/长会话里堆积；
 * - `onTimeout` 只在真正超时且未落地时调用一次。
 */
export function withTimeout(promise, ms = LOCK_WATCHDOG_MS, { onTimeout, timeoutError } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = typeof setTimeout === 'function'
      ? setTimeout(() => {
        if (settled) return
        settled = true
        try {
          if (typeof onTimeout === 'function') onTimeout()
        } catch (ignored) {
          // 兜底回调自身出错不能吞掉「已经超时」这个事实
        }
        reject(timeoutError instanceof Error ? timeoutError : new Error(timeoutError || LOCK_TIMEOUT_MESSAGE))
      }, ms)
      : null
    // node（含 vitest）里让兜底定时器不挂住事件循环；浏览器返回值是 number，没有 unref。
    if (timer && typeof timer.unref === 'function') timer.unref()
    const finish = (done) => (value) => {
      if (settled) return
      settled = true
      if (timer != null && typeof clearTimeout === 'function') clearTimeout(timer)
      done(value)
    }
    Promise.resolve(promise).then(finish(resolve), finish(reject))
  })
}

function defaultIsHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/**
 * 创建会话看护。
 *
 * @param {object} options
 * @param {() => Promise<{authenticated?: boolean}|null|undefined>} options.probeSession
 *        会话探测（生产接线是 `GET /api/v1/admin/auth/session`）。
 * @param {() => void} [options.onSessionAlive] 会话有效：调用方在这里预取/刷新 CSRF。
 * @param {() => void} [options.onSessionExpired] 会话失效：调用方清本地态 + 明确提示 + 跳登录。
 * @param {(idleMs: number) => void|Promise<void>} [options.onResumeAfterIdle]
 *        隐藏/挂起超过阈值回到前台（会话仍有效）时调用：让调用方把上下文/权限快照失效重拉。
 * @param {(error: unknown) => void} [options.onError] 探测失败（网络抖动）时的日志出口，默认忽略。
 * @param {number} [options.intervalMs] 前台轮询间隔。
 * @param {number} [options.hiddenThresholdMs] 回到前台触发自愈的隐藏时长阈值。
 * @param {number} [options.timerGapThresholdMs] 定时器相邻两次触发的间隔超过该值时视为「页面被冻结过」。
 * @param {() => number} [options.now] 时钟（单测注入）。
 * @param {{setInterval?: Function, clearInterval?: Function}} [options.timers] 定时器（单测注入）。
 * @param {() => boolean} [options.isHidden] 可见性判定（单测注入）。
 */
export function createSessionWatchdog(options = {}) {
  const {
    probeSession,
    onSessionAlive,
    onSessionExpired,
    onResumeAfterIdle,
    onError,
    intervalMs = SESSION_WATCH_INTERVAL_MS,
    hiddenThresholdMs = HIDDEN_RESUME_THRESHOLD_MS,
    timerGapThresholdMs = hiddenThresholdMs,
    now = () => Date.now(),
    timers = {},
    isHidden = defaultIsHidden,
  } = options

  if (typeof probeSession !== 'function') throw new Error('sessionWatchdog: probeSession 必填')

  const scheduleInterval = timers.setInterval || ((fn, ms) => globalThis.setInterval(fn, ms))
  const cancelInterval = timers.clearInterval || ((id) => globalThis.clearInterval(id))

  let running = false
  let expired = false
  let timerId = null
  let hiddenSince = null
  let lastSeenVisibleAt = 0
  let lastTickAt = 0
  let inFlight = null
  let lastCheckAt = 0
  let lastStatus = null

  function clearTimer() {
    if (timerId != null) {
      cancelInterval(timerId)
      timerId = null
    }
  }

  function schedule() {
    clearTimer()
    if (!running || expired) return
    timerId = scheduleInterval(() => { void tick() }, intervalMs)
  }

  function start() {
    if (running) return false
    running = true
    expired = false
    const at = now()
    lastSeenVisibleAt = at
    lastTickAt = at
    hiddenSince = isHidden() ? at : null
    if (hiddenSince == null) schedule()
    return true
  }

  function stop() {
    const wasRunning = running
    running = false
    clearTimer()
    hiddenSince = null
    // 在途探测的结果会被 running 判定丢弃：停止后不再回调调用方。
    inFlight = null
    return wasRunning
  }

  function expire() {
    expired = true
    clearTimer()
    if (typeof onSessionExpired === 'function') onSessionExpired()
  }

  /** 单飞探测：并发的轮询/聚焦/回前台不会重复打会话接口。 */
  function probe() {
    if (inFlight) return inFlight
    if (expired) return Promise.resolve(WATCHDOG_STATUS.SKIPPED)
    const run = (async () => {
      try {
        const session = await probeSession()
        lastCheckAt = now()
        if (!session || typeof session.authenticated !== 'boolean') {
          // 非预期响应体（网关错误页等）：不下结论，等下一轮。
          lastStatus = WATCHDOG_STATUS.UNAVAILABLE
          return WATCHDOG_STATUS.UNAVAILABLE
        }
        if (!session.authenticated) {
          lastStatus = WATCHDOG_STATUS.EXPIRED
          if (running) expire()
          return WATCHDOG_STATUS.EXPIRED
        }
        lastStatus = WATCHDOG_STATUS.ALIVE
        if (running && typeof onSessionAlive === 'function') onSessionAlive()
        return WATCHDOG_STATUS.ALIVE
      } catch (error) {
        // 网络抖动/超时（axios 15s）绝不能把用户登出：只记录，等下一轮。
        lastCheckAt = now()
        lastStatus = WATCHDOG_STATUS.UNAVAILABLE
        if (typeof onError === 'function') {
          try {
            onError(error)
          } catch (ignored) { /* 日志出口出错不影响看护 */ }
        }
        return WATCHDOG_STATUS.UNAVAILABLE
      } finally {
        if (inFlight === run) inFlight = null
      }
    })()
    inFlight = run
    return run
  }

  async function resumeAfterIdle(idleMs) {
    const status = await probe()
    if (status === WATCHDOG_STATUS.ALIVE && typeof onResumeAfterIdle === 'function') {
      await onResumeAfterIdle(idleMs)
    }
    return status
  }

  async function tick() {
    if (!running || expired) return WATCHDOG_STATUS.SKIPPED
    if (isHidden()) {
      handleHidden()
      return WATCHDOG_STATUS.SKIPPED
    }
    const at = now()
    const gap = at - lastTickAt
    lastTickAt = at
    lastSeenVisibleAt = at
    if (gap >= timerGapThresholdMs) {
      // 相邻两次触发被拉长了（浏览器冻结标签页、系统休眠、网络栈挂起）：
      // 与「隐藏很久后回到前台」等价，走同一条自愈路径。
      return resumeAfterIdle(gap)
    }
    return probe()
  }

  /** 标签页隐藏：暂停轮询（不 clear 状态，回到前台才知道隐藏了多久）。 */
  function handleHidden() {
    if (!running) return false
    const at = now()
    if (hiddenSince == null) hiddenSince = at
    lastSeenVisibleAt = at
    clearTimer()
    return true
  }

  /** 回到前台：只在隐藏超过阈值时先做会话校验 + 自愈，否则只是恢复轮询。 */
  function handleVisible() {
    if (!running) return Promise.resolve(WATCHDOG_STATUS.SKIPPED)
    const at = now()
    const idleMs = hiddenSince != null
      ? Math.max(0, at - hiddenSince)
      : Math.max(0, at - lastSeenVisibleAt)
    hiddenSince = null
    lastSeenVisibleAt = at
    lastTickAt = at
    if (expired) return Promise.resolve(WATCHDOG_STATUS.SKIPPED)
    schedule()
    if (idleMs < hiddenThresholdMs) return Promise.resolve(WATCHDOG_STATUS.SKIPPED)
    return resumeAfterIdle(idleMs)
  }

  /**
   * 窗口重新聚焦：覆盖「标签页一直可见但机器休眠/网络切换」的情况
   * （这时不会有 visibilitychange，只能靠 focus 时的时间差判断）。
   */
  function handleFocus() {
    if (!running || expired) return Promise.resolve(WATCHDOG_STATUS.SKIPPED)
    if (isHidden()) return Promise.resolve(WATCHDOG_STATUS.SKIPPED)
    const at = now()
    const idleMs = Math.max(0, at - lastSeenVisibleAt)
    if (idleMs < hiddenThresholdMs) return Promise.resolve(WATCHDOG_STATUS.SKIPPED)
    lastSeenVisibleAt = at
    lastTickAt = at
    return resumeAfterIdle(idleMs)
  }

  return {
    start,
    stop,
    tick,
    probe,
    handleHidden,
    handleVisible,
    handleFocus,
    getState: () => ({
      running,
      expired,
      hidden: hiddenSince != null,
      lastCheckAt,
      lastStatus,
      intervalMs,
      hiddenThresholdMs,
    }),
  }
}
