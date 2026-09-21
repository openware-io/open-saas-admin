import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getContexts, selectContext } from '@/api/context'
import { getSession } from '@/api/admin'
import { chooseSingleContext, contextIdOf } from '@/utils/context'
import { setCurrency } from '@/utils/currency-runtime'
import { LOCK_TIMEOUT_MESSAGE, LOCK_WATCHDOG_MS, withTimeout } from '@/utils/sessionWatchdog'
import { useAuthStore } from '@/stores/auth'

/**
 * 运营上下文的缓存与一致性策略（2026-09 交互修复）
 * ---------------------------------------------------------------------------
 * 症状：点任何一个菜单，先闪出「请选择有权限的租户或门店后继续」空态，再加载页面。
 * 原因：路由守卫每次导航都 await 一次完整鉴权（会话 + 候选 + 重选上下文），而
 *       `ensureContext` 第一句就把 `current` 置空，布局里的 `router-view v-else`
 *       随之被卸载 —— 鉴权过程直接变成了前端交互的一部分。
 *
 * 现在的分工：
 *  1. 导航不再等鉴权。本 SPA 会话里解析过一次（`settled`）之后，守卫立即放行，
 *     校验丢进后台（`revalidateInBackground`）。
 *  2. 后台校验默认只读一次服务端会话（Redis 单读，`/admin/auth/session`）。
 *     只有「服务端记录的上下文与内存不一致」或「权限快照过期」才真正重选。
 *  3. 解析过程不再清空 `current`：成功前一直沿用旧上下文，界面不出现空态闪动。
 *
 * 一致性 / 实时性靠三层兜底，缓存永远不会放宽授权：
 *  1. 服务端是唯一权威：签名 token 由网关按会话下发，越权/越上下文一律下游 403/401；
 *  2. 接口层自愈：`api/request.js` 遇到 PERMISSION_DENIED / CONTEXT_FORBIDDEN /
 *     SAAS_CONTEXT_REQUIRED 会用会话里的 contextId 重选一次再重试（权限变更老会话无需重登）；
 *  3. 本文件的节流校准：导航或窗口重新聚焦时比对服务端 `selectedContextId`，
 *     发现「别的标签页切了租户/门店」立即整页重载，绝不把两个上下文的数据混在一屏。
 *
 * 取整链路与调参说明见 docs/context-session-caching.md。
 */

/** 后台校准节流：导航 / 窗口聚焦触发的校准最多 30s 一次（只读会话，成本一次 Redis GET）。 */
const REVALIDATE_INTERVAL_MS = 30_000

/**
 * 权限快照新鲜度：签名 token 寿命 30 分钟，但角色权限可能被平台随时调整。
 * 超过该时长就借后台校准重新 select 一次换新快照，把「不刷新页面也能生效」的窗口
 * 收敛到 5 分钟内；5 分钟内的权限收紧仍由接口层 403 自愈路径立即兜住。
 */
const SNAPSHOT_FRESH_MS = 5 * 60_000

// 租户上下文只保留在内存中；选择结果由服务端会话保存并用于后续授权。
export const useContextStore = defineStore('context', () => {
  const items = ref([])
  const loading = ref(false)
  const error = ref('')
  const current = ref(null)
  /**
   * 本 SPA 会话里是否已经完整解析过一次上下文（成功或已明确失败）。
   * 路由守卫据此决定「冷启动阻塞一次」还是「直接放行 + 后台校准」：
   * 失败也置 true，避免没有可用上下文的账号每次导航都卡在鉴权上。
   */
  const settled = ref(false)

  // 解析代数：clear()（退出登录等）后，在途请求的回写全部作废，避免旧账号的结果盖回新状态。
  let generation = 0
  let resolving = null
  let revalidating = null
  let revalidateSeq = 0
  // 当前权限快照的取得时间（select 成功即刷新），用于判断快照是否过期。
  let snapshotAt = 0
  let lastRevalidatedAt = 0

  const tenantId = computed(() => current.value?.tenantId ?? null)
  const organizationId = computed(() => current.value?.organizationId ?? null)
  const storeId = computed(() => current.value?.storeId ?? null)

  async function fetchContexts() {
    loading.value = true
    error.value = ''
    try {
      const data = await getContexts()
      items.value = Array.isArray(data) ? data : (data && data.items) || []
    } catch (e) {
      items.value = []
      error.value = e?.message || '获取租户上下文失败'
    } finally {
      loading.value = false
    }
  }

  // 进入后台前确保有一个「真的能用」的运营上下文。
  //
  // 背景（2026-09-16 修复）：会话里记录的 contextId 可能已经被平台回收角色/停用，
  // 这时 /admin/context/select 会返回 403 CONTEXT_FORBIDDEN（此运营上下文已无有效权限），
  // 表现就是「登录后一进租户后台就报没有权限」。现在：
  //  - 会话记录仍在候选里：优先用它（不擅自切租户，避免运营在对错门店上操作）；
  //  - 但它已经没有权限（选不上）时：按优先级退到其它候选，能进去总比整页报错好；
  //  - 会话记录已被回收（不在候选里）：保持原策略不自动切，交给页面提示运营显式重选。
  //
  // 这是「权威解析」，只在冷启动、显式进入某个后台、用户点重试时调用；
  // 日常导航走 `revalidateInBackground`，不要再每次导航都跑一遍。
  async function ensureContext(preferredScope) {
    if (resolving) return resolving
    const myGeneration = ++generation
    const run = (async () => {
      loading.value = true
      error.value = ''
      try {
        const session = await getSession()
        if (myGeneration !== generation) return current.value
        if (!session?.authenticated) {
          clear()
          throw new Error('登录已过期，请重新登录')
        }
        await fetchContexts()
        if (myGeneration !== generation) return current.value
        if (error.value) {
          // 候选拿不到（IAM/网络抖动）：保留已有上下文继续用，别把运营挡在空态上；
          // 越权仍由下游强制，真失效会在接口层 403/401 自愈路径上暴露。
          throw new Error(error.value)
        }
        const remembered = session.selectedContextId
          ? items.value.find((item) => item.contextId === session.selectedContextId)
          : null
        if (remembered) {
          try {
            await select(remembered.contextId)
            return current.value
          } catch (e) {
            const fallback = chooseSingleContext(
              items.value.filter((item) => item.contextId !== remembered.contextId),
              preferredScope
            )
            if (!fallback) {
              // 把服务端的原因（如「此运营上下文已无有效权限」）带到页面上，别再让运营只看到一句“没有权限”。
              current.value = null
              error.value = e?.message || '当前运营上下文已失效'
              return current.value
            }
            try {
              await select(fallback.contextId)
            } catch (ignored) {
              current.value = null
              error.value = ignored?.message || e?.message || '没有可用的运营上下文'
            }
            return current.value
          }
        }
        const target = session.selectedContextId ? undefined : chooseSingleContext(items.value, preferredScope)
        if (!target) {
          // 服务端记的上下文已被回收（不在候选里）或账号本就没有候选：这里确实是「没有可用上下文」。
          current.value = null
          error.value = '当前账号没有可用的租户/门店上下文，请联系平台为该账号分配角色后重新登录'
          return current.value
        }
        try {
          await select(target.contextId)
        } catch (e) {
          current.value = null
          error.value = e?.message || '选择运营上下文失败'
        }
        return current.value
      } finally {
        // 只有仍是当前代数时才回收状态：clear() 之后的在途结果不许再写回。
        if (myGeneration === generation) {
          loading.value = false
          settled.value = true
          resolving = null
        }
      }
    })()
    // 「点了没反应」的最后一道防线：只要 await 的是网络，就必须有上界。
    // 页面休眠/连接被静默丢弃时这个 Promise 可能永远不落地，导航守卫与「重试」按钮就会跟着永久等待，
    // 用户看到的正是「点了没反应，只能 F5」。超时后释放单飞锁并复位 loading，让重试真的能重试
    // （在途结果仍受代数保护，不会把旧状态写回来）。
    const guarded = withTimeout(run, LOCK_WATCHDOG_MS, {
      timeoutError: new Error(LOCK_TIMEOUT_MESSAGE),
      onTimeout: () => {
        if (resolving !== guarded) return
        resolving = null
        if (myGeneration === generation) {
          loading.value = false
          error.value = LOCK_TIMEOUT_MESSAGE
        }
      },
    })
    resolving = guarded
    return guarded
  }

  /**
   * 后台校准运营上下文（不阻塞交互、不改变已渲染页面）。
   *
   * 先做一次廉价的会话读取，再决定要不要付重选的代价：
   *  - 服务端上下文 == 内存上下文 且快照新鲜 → 什么都不做（绝大多数导航走这条）；
   *  - 服务端上下文 == 内存上下文 但快照过期 → 重选一次换新权限快照；
   *  - 服务端上下文 != 内存上下文（典型：另一个标签页切了门店）→ 跟随服务端，返回 context-changed；
   *  - 会话已失效 → 清空登录态与上下文，返回 session-expired。
   *
   * @returns {Promise<'fresh'|'permissions-refreshed'|'context-changed'|'session-expired'|'unavailable'>}
   *          `context-changed` 表示换了租户/门店，调用方需要整页重载，避免新旧上下文数据混显。
   */
  async function revalidate(preferredScope, { force = false } = {}) {
    if (revalidating) return revalidating
    if (!force && Date.now() - lastRevalidatedAt < REVALIDATE_INTERVAL_MS) return 'fresh'
    const myGeneration = generation
    const seq = ++revalidateSeq
    // 校准前先记下内存里的上下文：读会话期间运营可能在右上角自己切了上下文，
    // 那种情况下本次校准必须整体作废，绝不能拿刚读到的旧会话把他的选择覆盖回去。
    const observedContextId = contextIdOf(current.value)
    const run = (async () => {
      lastRevalidatedAt = Date.now()
      try {
        const session = await getSession()
        if (myGeneration !== generation) return 'fresh'
        if (!session?.authenticated) {
          clear()
          useAuthStore().clearLocalState()
          return 'session-expired'
        }
        if (contextIdOf(current.value) !== observedContextId) return 'fresh'
        if (!current.value) {
          // 还没有可用上下文（冷启动失败后重试）：补一次完整解析。
          await ensureContext(preferredScope)
          return current.value ? 'context-changed' : 'unavailable'
        }
        const serverContextId = session.selectedContextId || ''
        const localContextId = observedContextId
        const snapshotStale = Date.now() - snapshotAt > SNAPSHOT_FRESH_MS
        if (serverContextId === localContextId && !snapshotStale) return 'fresh'
        if (serverContextId === localContextId) {
          await select(localContextId)
          return 'permissions-refreshed'
        }
        // 服务端上下文变了：跟随它，但先确认它还在候选里（可能已被平台回收）。
        if (!items.value.length) await fetchContexts()
        if (myGeneration !== generation) return 'fresh'
        if (contextIdOf(current.value) !== localContextId) return 'fresh'
        if (!items.value.some((item) => item.contextId === serverContextId)) {
          await ensureContext(preferredScope)
          return current.value ? 'context-changed' : 'unavailable'
        }
        await select(serverContextId)
        return 'context-changed'
      } catch (e) {
        error.value = e?.message || '校验运营上下文失败'
        return 'unavailable'
      } finally {
        // 按序号回收：`clear()` 会推进序号并置空，避免退出登录后的在途结果把状态写回来。
        if (revalidateSeq === seq) revalidating = null
      }
    })()
    // 同 ensureContext：校准也可能永不落地，锁必须能超时释放，否则之后每次聚焦/导航的校准都被静默吞掉。
    const guarded = withTimeout(run, LOCK_WATCHDOG_MS, {
      timeoutError: new Error(LOCK_TIMEOUT_MESSAGE),
      onTimeout: () => {
        if (revalidating === guarded) revalidating = null
      },
    })
    revalidating = guarded
    return guarded
  }

  /**
   * 回到前台的自愈（由 `utils/sessionWatchdog` 在「隐藏/挂起超过阈值」时调用）。
   *
   * 目标：页面在后台放了几十分钟，回来第一次操作不能是「点了没反应」。
   *  1. 先作废权限快照与校准节流（`snapshotAt`/`lastRevalidatedAt` 归零），强制真的问一次服务端；
   *  2. 服务端上下文与本地不一致（别的标签页切了门店）→ 整页 reload，绝不把两套上下文混在一屏；
   *  3. 会话失效 → 回登录页；
   *  4. 网络不可用 / 拿不到结论 → 什么都不做（**不 reload**），把界面留给运营，由下一次操作或看护轮询重试。
   *
   * 刻意不为「确实没有可用上下文」整页 reload：那种账号每次回到前台都会被刷新一次，
   * 而 AdminLayout 的空态已经给了「重新选择上下文 / 重新登录」两个自助入口，不必靠刷新。
   *
   * @returns {Promise<'fresh'|'permissions-refreshed'|'context-changed'|'session-expired'|'unavailable'>}
   */
  async function recoverAfterIdle(preferredScope) {
    snapshotAt = 0
    lastRevalidatedAt = 0
    let status
    try {
      status = await revalidate(preferredScope, { force: true })
    } catch (e) {
      // 兜底超时（withTimeout）或网络异常：不 reload、不打扰，等下一次操作/轮询
      return 'unavailable'
    }
    if (status === 'context-changed') reloadForContextChange()
    else if (status === 'session-expired') redirectToLogin()
    return status
  }

  /**
   * 供路由守卫 / 窗口聚焦使用的「发射后不管」版本：调用方绝不 await 网络。
   *
   * 已经卡住的交互问题就出在「校验被 await 在导航链路上」，所以这里只负责把结果
   * 变成动作：换了上下文 → 整页重载（保证不混显）；会话失效 → 回登录页。
   */
  function revalidateInBackground(preferredScope) {
    return revalidate(preferredScope)
      .then((status) => {
        if (status === 'context-changed') reloadForContextChange()
        else if (status === 'session-expired') redirectToLogin()
        return status
      })
      .catch(() => 'unavailable')
  }

  // 选择上下文即拿到该租户的币种（§3：context select 响应体带 currencyCode；缺省 USD）。
  // 全站币种由此写入 utils/currency-runtime 的唯一来源，页面不再各请求一套。
  async function select(contextId) {
    const data = await selectContext(contextId)
    current.value = data
    snapshotAt = Date.now()
    setCurrency(data?.currencyCode ?? data?.currency)
    return true
  }

  function clear() {
    generation += 1
    revalidateSeq += 1
    resolving = null
    revalidating = null
    // 复位 loading：clear() 会推进代数，导致在途 ensureContext 的 finally（`myGeneration === generation`）
    // 被跳过；不复位的话 loading 会永久为 true，把界面上的「重新选择上下文」按钮锁死。
    loading.value = false
    current.value = null
    items.value = []
    error.value = ''
    settled.value = false
    snapshotAt = 0
    lastRevalidatedAt = 0
  }

  function reloadForContextChange() {
    if (typeof window === 'undefined' || !window.location) return
    window.location.reload()
  }

  function redirectToLogin() {
    if (typeof window === 'undefined' || !window.location) return
    if (window.location.hash !== '#/login') window.location.hash = '#/login'
  }

  return {
    items, loading, error, current, settled,
    tenantId, organizationId, storeId,
    fetchContexts, ensureContext, revalidate, revalidateInBackground, recoverAfterIdle, select, clear,
  }
})
