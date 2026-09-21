import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { confirmItem, getPendingApprovalItems, rejectItem } from '@/api/order'

/**
 * 「客户待确认加项」提醒 store（后台唯一数据源）。
 *
 * 客户在 C 端自助加项后落 `PENDING_APPROVAL`（待服务人员确认，不计入应收），此前后台只有打开
 * 「点单/加项」弹窗才看得到。本 store 把服务端聚合视图（`GET /business/order-items/pending-approval`）
 * 拉到前端，供三处使用：
 *   1) 侧边菜单「收银台」角标；
 *   2) 收银台房态卡片标记；
 *   3) 集中处理抽屉（逐条确认/拒绝、本单全部确认）。
 *
 * **实时性/一致性口径**：
 * - 15s 轮询（`POLL_INTERVAL_MS`），页面不可见时暂停（`visibilitychange`），避免后台标签页空转；
 * - 服务端返回 `revision`（本门店命中行最大 id）：与上次相同则**不重渲染**（避免角标闪烁）；
 * - 确认/拒绝后立即 `refresh()`（服务端写路径已失效缓存，因此这次读到的是新状态），
 *   同时本端做**乐观移除**，交互零等待；服务端 409（并发已被别人处理）时静默丢弃并刷新。
 * - **写路径失败必须如实回给调用方**：`confirm/reject/confirmOrder` 返回
 *   `{ ok, error, alreadyProcessed }`，绝不再把异常吞掉当成功 —— 否则页面会弹「已确认」
 *   而服务端其实 500（2026-09-19 线上：后端写路径爆栈回 500，前端照样报成功，两边结果不一致）。
 * - 未来接入消息中心：把 `start()` 里的轮询替换为订阅推送即可，其余调用方不用改。
 */
export const PENDING_APPROVAL_POLL_MS = 15000

/**
 * 是否属于「已被处理」的并发结果：服务端确认/拒绝走原子条件更新，并发下输的一方回
 * 409（`ORDER_ITEM_STATUS_INVALID`），幂等（已是目标状态）回 200 回放该明细。
 *
 * 这类结果必须**静默收敛**（以服务端为准刷新 + 轻提示），不能当成红色失败：
 * 「别人已经处理完了」与「操作失败」对运营是两回事。
 * 口径与 B 端 H5（`gv_saas_mobile/src/shared/utils/pending-approval.js#isAlreadyProcessed`）保持一致。
 */
export function isAlreadyProcessed(error) {
  const status = Number(error?.response?.status ?? error?.status)
  if (status === 409) return true
  const payload = error?.response?.data
  const code = String((payload && payload.code) || error?.code || '').toUpperCase()
  // 旧版本服务端把该状态冲突放在 default 分支（400）：码相同，同样按「已被处理」收敛。
  if (code === 'ORDER_ITEM_STATUS_INVALID') return true
  return /ALREADY|CONFLICT|PROCESSED|DUPLICATE/.test(code)
}

export const usePendingApprovalStore = defineStore('pendingApproval', () => {
  /** 服务端聚合视图（未加载时为 null）。 */
  const view = ref(null)
  const loading = ref(false)
  const error = ref('')
  /** 集中处理抽屉的可见性：放在 store 里，页面（收银台卡片 / 订单管理）与布局（头部入口）都能打开它。 */
  const drawerVisible = ref(false)
  /** 最近一次成功刷新的服务端 revision（相同则跳过状态更新）。 */
  const revision = ref(-1)
  const lastUpdatedAt = ref(null)
  /**
   * 「订单数据已被本次确认/拒绝改动」的本地自增计数。
   *
   * 待确认加项被确认/拒绝后，订单的明细与金额在服务端已经变了，但收银台卡片、订单管理列表各自
   * 缓存着订单/会话数据；只刷新抽屉里的待确认列表是不够的——卡片金额会停在旧值，与结账抽屉、
   * 账单（以及 C 端看到的金额）对不上。页面只需 `watch` 这个计数并重拉自己的数据，
   * 不用让页面互相知道对方存在。
   */
  const orderDataRevision = ref(0)

  let timer = null
  let visibilityBound = false

  const pendingCount = computed(() => Number(view.value?.pendingCount || 0))
  const orders = computed(() => view.value?.orders || [])
  /** 按订单号的待确认条数：收银台卡片标记 / 订单管理列用。 */
  const countByOrder = computed(() => {
    const map = {}
    orders.value.forEach((group) => {
      if (group && group.orderId != null) map[String(group.orderId)] = Number(group.pendingCount) || 0
    })
    return map
  })
  const hasPending = computed(() => pendingCount.value > 0)
  const pendingAmount = computed(() => Number(view.value?.pendingAmount || 0))
  const currencyCode = computed(() => view.value?.currencyCode || null)
  const mixedCurrency = computed(() => view.value?.mixedCurrency === true)

  /** 指定订单的待确认条数（收银台卡片/订单管理列表用；未知订单返回 0）。 */
  function countOfOrder(orderId) {
    if (orderId === null || orderId === undefined) return 0
    return countByOrder.value[String(orderId)] || 0
  }

  /**
   * 拉取聚合视图；`force=false` 时 revision 未变则不重渲染（防角标闪烁）。
   *
   * **失败回滚必须 `force=true`**：revision 是「本门店命中行最大 id」，一条**没被服务端处理掉**的
   * 待确认项不会改变 revision，因此不带 force 的回滚刷新会被这里跳过 —— 乐观移除的条目将永远
   * 从界面上消失（角标少算），而服务端仍认为它待确认，这正是「前后端结果不一致」。
   */
  async function refresh({ silent = true, force = false } = {}) {
    if (!silent) loading.value = true
    try {
      const data = await getPendingApprovalItems()
      const next = data && data.data ? data.data : data
      error.value = ''
      if (!force && next && Number(next.revision) === Number(revision.value) && view.value) {
        lastUpdatedAt.value = new Date()
        return view.value
      }
      view.value = next || null
      revision.value = next ? Number(next.revision || 0) : -1
      lastUpdatedAt.value = new Date()
      return view.value
    } catch (e) {
      error.value = e?.message || '待确认加项加载失败'
      return view.value
    } finally {
      loading.value = false
    }
  }

  /**
   * 确认加项：先乐观移除该条（角标立刻减），再调服务端；失败按服务端为准回滚并如实返回结果。
   *
   * @returns {Promise<{ok: boolean, error?: unknown, alreadyProcessed?: boolean}>}
   *   `ok=false` 表示服务端没认这次确认（并发已被处理时 `alreadyProcessed=true`，调用方轻提示即可）。
   */
  async function confirm(orderId, itemId) {
    return mutate(orderId, itemId, () => confirmItem(orderId, itemId))
  }

  /** 拒绝加项：语义同 {@link confirm}。 */
  async function reject(orderId, itemId) {
    return mutate(orderId, itemId, () => rejectItem(orderId, itemId))
  }

  /**
   * 本单全部确认：逐条串行确认（服务端每条独立条件更新，失败不阻断其余条）。
   *
   * @returns {Promise<{ok: boolean, total: number, failed: number, alreadyProcessed: number, error?: unknown}>}
   *   `ok=false`（`failed>0`）时调用方**不得**提示「全部确认成功」。
   */
  async function confirmOrder(orderId) {
    const group = orders.value.find((entry) => String(entry.orderId) === String(orderId))
    if (!group) return { ok: true, total: 0, failed: 0, alreadyProcessed: 0 }
    const itemIds = (group.items || []).map((item) => item.id)
    let failed = 0
    let alreadyProcessed = 0
    let lastError = null
    for (const itemId of itemIds) {
      try {
        await confirmItem(orderId, itemId)
      } catch (e) {
        // 已被别人处理（409）不算失败；其余（参数/权限/服务端异常）如实计数并交给调用方提示。
        if (isAlreadyProcessed(e)) alreadyProcessed += 1
        else {
          failed += 1
          lastError = e
        }
      }
    }
    await refresh({ force: true })
    // 只要有一条被处理掉（自己confirm或别人已处理），该订单的金额/明细就已变化 → 通知页面重拉。
    if (itemIds.length - failed > 0) orderDataRevision.value += 1
    return { ok: failed === 0, total: itemIds.length, failed, alreadyProcessed, error: lastError }
  }

  /**
   * 确认/拒绝的公共写路径：乐观移除 → 调服务端 → 以服务端为准刷新。
   * 失败**不再吞掉**：返回 `{ ok:false, error, alreadyProcessed }`，让调用方决定提示什么，
   * 避免「前端弹已确认、后端其实 500」的不一致。
   */
  async function mutate(orderId, itemId, action) {
    removeLocally(orderId, itemId)
    try {
      await action()
      await refresh()
      // 服务端已改动该订单的明细/金额：通知页面重拉自己的订单数据（卡片金额不能停在旧值）。
      orderDataRevision.value += 1
      return { ok: true }
    } catch (error) {
      // 失败必须**强制**回源：revision 未变（服务端那条还在）时普通刷新会被去抖跳过，
      // 乐观移除的条目就再也回不到界面上（见 refresh 的说明）。
      await refresh({ force: true })
      return { ok: false, error, alreadyProcessed: isAlreadyProcessed(error) }
    }
  }

  /** 乐观移除：把该条从视图里摘掉（计数/金额同步减），让角标与列表零等待更新。 */
  function removeLocally(orderId, itemId) {
    if (!view.value) return
    const groups = (view.value.orders || []).map((group) => {
      if (String(group.orderId) !== String(orderId)) return group
      const items = (group.items || []).filter((item) => String(item.id) !== String(itemId))
      const removed = (group.items || []).find((item) => String(item.id) === String(itemId))
      const removedAmount = removed ? Number(removed.amount) || 0 : 0
      return {
        ...group,
        items,
        pendingCount: items.length,
        pendingAmount: Math.max(0, Number(group.pendingAmount || 0) - removedAmount),
      }
    }).filter((group) => (group.items || []).length > 0)
    const removedGroup = (view.value.orders || []).find((group) => String(group.orderId) === String(orderId))
    const removedItem = removedGroup
      ? (removedGroup.items || []).find((item) => String(item.id) === String(itemId))
      : null
    view.value = {
      ...view.value,
      orders: groups,
      pendingCount: Math.max(0, Number(view.value.pendingCount || 0) - (removedItem ? 1 : 0)),
      pendingAmount: Math.max(0, Number(view.value.pendingAmount || 0) - (removedItem ? Number(removedItem.amount) || 0 : 0)),
    }
  }

  /** 开始轮询（幂等；页面不可见时暂停）。 */
  function start() {
    if (timer) return
    refresh({ silent: false })
    timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      refresh()
    }, PENDING_APPROVAL_POLL_MS)
    if (!visibilityBound) {
      document.addEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = true
    }
  }

  function onVisibilityChange() {
    // 回到前台立即拉一次：角标必须是最新的（不能等下一个轮询周期）。
    if (document.visibilityState === 'visible') refresh()
  }

  /** 停止轮询（登出/布局卸载）。 */
  function stop() {
    if (timer) {
      window.clearInterval(timer)
      timer = null
    }
    if (visibilityBound) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = false
    }
  }

  function reset() {
    view.value = null
    revision.value = -1
    lastUpdatedAt.value = null
    orderDataRevision.value = 0
    error.value = ''
    drawerVisible.value = false
  }

  /** 打开集中处理抽屉（头部入口 / 收银台卡片标记 / 订单管理列都调它）。 */
  function openDrawer() {
    drawerVisible.value = true
    // 打开前先拉一次：保证列表是最新的（服务端写后失效 + 这里主动刷新）。
    refresh()
  }

  function closeDrawer() {
    drawerVisible.value = false
  }

  return {
    view, loading, error, revision, lastUpdatedAt, drawerVisible, orderDataRevision,
    pendingCount, pendingAmount, currencyCode, mixedCurrency, orders, countByOrder, hasPending,
    countOfOrder, refresh, confirm, reject, confirmOrder, start, stop, reset, openDrawer, closeDrawer,
  }
})
