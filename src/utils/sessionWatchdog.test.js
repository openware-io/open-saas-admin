import { describe, expect, it, vi } from 'vitest'
import {
  HIDDEN_RESUME_THRESHOLD_MS,
  LOCK_TIMEOUT_MESSAGE,
  LOCK_WATCHDOG_MS,
  SESSION_WATCH_INTERVAL_MS,
  WATCHDOG_STATUS,
  createSessionWatchdog,
  withTimeout,
} from './sessionWatchdog'

/**
 * 会话看护的单测：时钟、定时器、可见性全部注入，测试直接推演时间，
 * 不依赖 jsdom / 真实定时器，也不产生任何网络请求。
 */
function createHarness(overrides = {}) {
  const clock = {
    t: 1_700_000_000_000,
    advance(ms) { clock.t += ms },
  }
  const intervals = new Map()
  let intervalSeq = 0
  const timers = {
    setInterval(fn, ms) {
      const id = `interval-${++intervalSeq}`
      intervals.set(id, { fn, ms })
      return id
    },
    clearInterval(id) { intervals.delete(id) },
  }
  const calls = { probe: 0, alive: 0, expired: 0, resume: [], errors: [] }
  let hidden = false
  let probeImpl = async () => ({ authenticated: true })

  const watchdog = createSessionWatchdog({
    probeSession: () => {
      calls.probe += 1
      return probeImpl()
    },
    onSessionAlive: () => { calls.alive += 1 },
    onSessionExpired: () => { calls.expired += 1 },
    onResumeAfterIdle: (idleMs) => { calls.resume.push(idleMs) },
    onError: (error) => { calls.errors.push(error) },
    now: () => clock.t,
    timers,
    isHidden: () => hidden,
    ...overrides,
  })

  return {
    watchdog,
    clock,
    calls,
    intervals,
    intervalCount: () => intervals.size,
    setHidden(value) { hidden = value },
    setProbe(fn) { probeImpl = fn },
    /** 模拟一次「轮询触发」：只跑当前已注册的 interval 回调。 */
    async runTick() {
      for (const { fn } of [...intervals.values()]) await fn()
    },
    scheduledIntervalMs: () => [...intervals.values()][0]?.ms,
  }
}

describe('会话看护：前台轮询', () => {
  it('按配置间隔轮询会话；会话有效时刷新 CSRF（onSessionAlive）', async () => {
    const h = createHarness()
    h.watchdog.start()
    expect(h.intervalCount()).toBe(1)
    expect(h.scheduledIntervalMs()).toBe(SESSION_WATCH_INTERVAL_MS)

    await h.runTick()
    expect(h.calls.probe).toBe(1)
    expect(h.calls.alive).toBe(1)
    expect(h.watchdog.getState().lastStatus).toBe(WATCHDOG_STATUS.ALIVE)
  })

  it('会话失效：立刻回调清态 + 跳登录，并停止轮询（不重复打扰）', async () => {
    const h = createHarness()
    h.setProbe(async () => ({ authenticated: false }))
    h.watchdog.start()

    await h.runTick()
    expect(h.calls.expired).toBe(1)
    expect(h.watchdog.getState().expired).toBe(true)
    expect(h.intervalCount()).toBe(0)

    await h.watchdog.probe()
    expect(h.calls.probe).toBe(1)
    expect(h.calls.expired).toBe(1)
  })

  it('会话探测网络异常绝不当成会话失效：只记录，下一轮继续', async () => {
    const h = createHarness()
    const boom = new Error('Network Error')
    h.setProbe(async () => { throw boom })
    h.watchdog.start()

    await h.runTick()
    expect(h.calls.expired).toBe(0)
    expect(h.calls.alive).toBe(0)
    expect(h.calls.errors).toEqual([boom])
    expect(h.watchdog.getState().lastStatus).toBe(WATCHDOG_STATUS.UNAVAILABLE)

    h.setProbe(async () => ({ authenticated: true }))
    await h.runTick()
    expect(h.calls.alive).toBe(1)
  })

  it('非预期响应体（网关错误页等）不下结论，也不刷新 CSRF', async () => {
    const h = createHarness()
    h.setProbe(async () => ({ status: 500 }))
    h.watchdog.start()

    await h.runTick()
    expect(h.calls.expired).toBe(0)
    expect(h.calls.alive).toBe(0)
    expect(h.watchdog.getState().lastStatus).toBe(WATCHDOG_STATUS.UNAVAILABLE)
  })

  it('并发探测单飞：同一时刻只打一次会话接口', async () => {
    const h = createHarness()
    let release
    h.setProbe(() => new Promise((resolve) => { release = resolve }))
    h.watchdog.start()

    const first = h.watchdog.probe()
    const second = h.watchdog.probe()
    expect(h.calls.probe).toBe(1)
    release({ authenticated: true })
    await Promise.all([first, second])
    expect(h.calls.alive).toBe(1)
  })

  it('stop 之后不再轮询、不再触发任何回调', async () => {
    const h = createHarness()
    h.watchdog.start()
    h.watchdog.stop()
    expect(h.intervalCount()).toBe(0)

    let release
    h.setProbe(() => new Promise((resolve) => { release = resolve }))
    // 在途探测的结果在 stop 之后必须被丢弃
    h.watchdog.start()
    const pending = h.watchdog.probe()
    h.watchdog.stop()
    release({ authenticated: true })
    await pending
    expect(h.calls.alive).toBe(0)
  })
})

describe('会话看护：隐藏与回到前台', () => {
  it('标签页隐藏时暂停轮询', async () => {
    const h = createHarness()
    h.watchdog.start()
    h.setHidden(true)
    h.watchdog.handleHidden()
    expect(h.intervalCount()).toBe(0)

    await h.watchdog.tick()
    expect(h.calls.probe).toBe(0)
  })

  it('隐藏不足阈值就回到前台：只恢复轮询，不做额外校验', async () => {
    const h = createHarness()
    h.watchdog.start()
    h.setHidden(true)
    h.watchdog.handleHidden()
    h.clock.advance(5 * 60_000)
    h.setHidden(false)

    expect(await h.watchdog.handleVisible()).toBe(WATCHDOG_STATUS.SKIPPED)
    expect(h.calls.probe).toBe(0)
    expect(h.calls.resume).toHaveLength(0)
    expect(h.intervalCount()).toBe(1)
  })

  it('隐藏超过阈值回到前台：先会话校验，再让调用方把上下文/权限快照重拉', async () => {
    const h = createHarness()
    h.watchdog.start()
    h.setHidden(true)
    h.watchdog.handleHidden()
    h.clock.advance(HIDDEN_RESUME_THRESHOLD_MS + 60_000)
    h.setHidden(false)

    expect(await h.watchdog.handleVisible()).toBe(WATCHDOG_STATUS.ALIVE)
    expect(h.calls.probe).toBe(1)
    expect(h.calls.alive).toBe(1)
    expect(h.calls.resume).toEqual([HIDDEN_RESUME_THRESHOLD_MS + 60_000])
    expect(h.intervalCount()).toBe(1)
  })

  it('回到前台发现会话已失效：只回登录页，不做上下文自愈', async () => {
    const h = createHarness()
    h.setProbe(async () => ({ authenticated: false }))
    h.watchdog.start()
    h.setHidden(true)
    h.watchdog.handleHidden()
    h.clock.advance(HIDDEN_RESUME_THRESHOLD_MS + 1)
    h.setHidden(false)

    expect(await h.watchdog.handleVisible()).toBe(WATCHDOG_STATUS.EXPIRED)
    expect(h.calls.expired).toBe(1)
    expect(h.calls.resume).toHaveLength(0)
  })

  it('恢复后按正常间隔继续轮询（不会因为一次回前台而叠加多个定时器）', async () => {
    const h = createHarness()
    h.watchdog.start()
    h.setHidden(true)
    h.watchdog.handleHidden()
    h.clock.advance(HIDDEN_RESUME_THRESHOLD_MS + 1)
    h.setHidden(false)
    await h.watchdog.handleVisible()
    expect(h.intervalCount()).toBe(1)
  })

  it('标签页一直可见但机器休眠（定时器间隔被拉长）时同样走自愈路径', async () => {
    const h = createHarness()
    h.watchdog.start()

    // 正常一次轮询：只校验会话，不做自愈
    h.clock.advance(SESSION_WATCH_INTERVAL_MS)
    await h.watchdog.tick()
    expect(h.calls.resume).toHaveLength(0)

    // 系统休眠 30 分钟后定时器才再次触发
    h.clock.advance(30 * 60_000)
    await h.watchdog.tick()
    expect(h.calls.probe).toBe(2)
    expect(h.calls.resume).toEqual([30 * 60_000])
  })

  it('窗口 focus：可见且空闲未超阈值不动，超阈值才校验（覆盖无 visibilitychange 的休眠）', async () => {
    const h = createHarness()
    h.watchdog.start()

    h.clock.advance(60_000)
    expect(await h.watchdog.handleFocus()).toBe(WATCHDOG_STATUS.SKIPPED)
    expect(h.calls.probe).toBe(0)

    h.clock.advance(HIDDEN_RESUME_THRESHOLD_MS + 1)
    expect(await h.watchdog.handleFocus()).toBe(WATCHDOG_STATUS.ALIVE)
    expect(h.calls.probe).toBe(1)
    expect(h.calls.resume).toHaveLength(1)
  })
})

describe('withTimeout：任何 await 都要有上界', () => {
  it('原 Promise 先落地时透传结果，并且不再触发超时回调', async () => {
    const onTimeout = vi.fn()
    await expect(withTimeout(Promise.resolve('ok'), LOCK_WATCHDOG_MS, { onTimeout })).resolves.toBe('ok')
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('原 Promise 失败时透传失败原因', async () => {
    const error = new Error('boom')
    await expect(withTimeout(Promise.reject(error), LOCK_WATCHDOG_MS)).rejects.toBe(error)
  })

  it('永不落地时按超时拒绝，并回调 onTimeout（锁的释放入口）', async () => {
    vi.useFakeTimers()
    try {
      const onTimeout = vi.fn()
      const never = new Promise(() => {})
      const guarded = withTimeout(never, 1_000, { onTimeout, timeoutError: new Error(LOCK_TIMEOUT_MESSAGE) })
      const assertion = expect(guarded).rejects.toThrow(LOCK_TIMEOUT_MESSAGE)
      await vi.advanceTimersByTimeAsync(1_000)
      await assertion
      expect(onTimeout).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('超时已经拒绝后原 Promise 才失败，不会产生未处理的拒绝', async () => {
    vi.useFakeTimers()
    try {
      let rejectLate
      const late = new Promise((_resolve, reject) => { rejectLate = reject })
      const guarded = withTimeout(late, 1_000, { timeoutError: new Error('timeout') })
      const assertion = expect(guarded).rejects.toThrow('timeout')
      await vi.advanceTimersByTimeAsync(1_000)
      await assertion
      rejectLate(new Error('late failure'))
      await Promise.resolve()
    } finally {
      vi.useRealTimers()
    }
  })
})
