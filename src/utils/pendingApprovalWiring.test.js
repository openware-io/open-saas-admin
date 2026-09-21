import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

/**
 * 「客户待确认加项」提醒链路的接线守卫（P0）。
 *
 * 口径：C 端客户自助加项落 PENDING_APPROVAL，需要门店确认/拒绝；提醒必须**主动可见且能直达处理**，
 * 而不是只躺在「点单/加项」弹窗里。三处提示 + 一个集中处理口：
 *   1) 侧边菜单「收银台」角标；
 *   2) 收银台房态卡片标记；
 *   3) 订单管理列表列 + 筛选 + 头部入口；
 *   4) 集中处理抽屉（逐条确认/拒绝 + 本单全部确认）。
 * 数据源只有一个：服务端聚合接口 `GET /business/orders/pending-approval`（禁止各页面各自轮询订单明细）；
 * 路径挂在 `/business/orders/**` 下——网关对 `/api/v1/business/**` 是**显式白名单**路由，新前缀不会自动放行。
 */
const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

/**
 * 「确认/拒绝加项后订单数据必须重拉」的接线守卫。
 *
 * 真实缺陷：确认加项后只刷新了抽屉里的待确认列表，收银台卡片与订单管理列表各自缓存的订单数据没重拉，
 * 卡片金额停在旧值（与结账抽屉、账单、C 端看到的金额不一致）。修法是 store 暴露 `orderDataRevision`
 * 作为「订单数据被改动过」的信号，两个页面 watch 它重拉自己的数据。
 */
describe('确认/拒绝加项后订单数据重拉接线', () => {
  it('store 暴露 orderDataRevision，并在写路径成功后自增、reset 归零', async () => {
    const store = await read('../stores/pendingApproval.js')
    expect(store).toContain('orderDataRevision')
    expect(store).toContain('orderDataRevision.value += 1')
    expect(store).toContain('orderDataRevision.value = 0')
  })

  it('收银台与订单管理都 watch 这个信号并重拉（不各自轮询订单明细）', async () => {
    for (const page of ['../views/tenant/orders.vue', '../views/tenant/order-management.vue']) {
      const source = await read(page)
      expect(source).toContain('pendingApprovalStore.orderDataRevision')
      expect(source).toMatch(/watch\(\(\) => pendingApprovalStore\.orderDataRevision/)
    }
  })

  it('收银台卡片金额取服务端口径，不得再叠加 roomEstimatedFee（会把包厢费算两遍）', async () => {
    const orders = await read('../views/tenant/orders.vue')
    expect(orders).not.toContain('+ numberValue(order?.roomEstimatedFee)')
    expect(orders).toContain('liveTotalAmount')
  })
})

describe('待确认加项提醒接线', () => {
  it('数据源：store 只调聚合接口，并做 revision 去抖 + 可见性暂停 + 写后立即刷新', async () => {
    const store = await read('../stores/pendingApproval.js')
    expect(store).toContain('getPendingApprovalItems')
    // 聚合接口一次拿全；不允许在提醒链路里再逐单查明细
    expect(store).not.toContain('listOrderItems')
    expect(store).toContain('revision')
    expect(store).toContain('visibilitychange')
    expect(store).toContain('removeLocally')
    const api = await read('../api/order.js')
    expect(api).toContain("'/api/v1/business/orders/pending-approval'")
  })

  it('写路径结果一致性：失败不得当成功，且失败回滚必须绕过 revision 去抖', async () => {
    const store = await read('../stores/pendingApproval.js')
    // 失败要如实回报给调用方（此前吞成 false，页面照样弹「已确认」，出现前后端结果不一致）
    expect(store).toContain('alreadyProcessed')
    expect(store).toContain('ok: false')
    // 服务端那条还在 → revision 不变；普通刷新会被去抖跳过，乐观移除的条目就再也回不来
    expect(store).toContain('refresh({ force: true })')
    // 具体的值语义（ok/alreadyProcessed/回滚角标）由 stores/pendingApproval.test.js 断言
    const test = await read('../stores/pendingApproval.test.js')
    expect(test).toContain('isAlreadyProcessed')
  })

  it('侧边菜单：收银台菜单项挂待确认角标', async () => {
    const source = await read('../layout/components/SidebarMenuItem.vue')
    expect(source).toContain("const CASHIER_PATH = '/business/orders'")
    expect(source).toContain('pendingStore.pendingCount')
    expect(source).toContain('el-badge')
  })

  it('布局：进入后台开始轮询、退出停止，并有全局处理入口与抽屉', async () => {
    const source = await read('../layout/AdminLayout.vue')
    expect(source).toContain('pendingApprovalStore.start()')
    expect(source).toContain('pendingApprovalStore.stop()')
    expect(source).toContain('待确认加项')
    expect(source).toContain('PendingApprovalDrawer')
  })

  it('收银台：卡片标记直达处理，且结台前提示未确认加项', async () => {
    const source = await read('../views/tenant/orders.vue')
    expect(source).toContain('pendingApprovalStore.countOfOrder(room.order.id)')
    expect(source).toContain('待确认加项 ×')
    expect(source).toContain('pendingApprovalStore.openDrawer()')
    expect(source).toContain('客户加项待确认')
  })

  it('订单管理：待确认列 + 只看待确认筛选 + 头部入口', async () => {
    const source = await read('../views/tenant/order-management.vue')
    expect(source).toContain('待确认加项')
    expect(source).toContain('onlyPending')
    expect(source).toContain('pendingApprovalStore.openDrawer()')
  })

  it('处理抽屉：逐条确认/拒绝 + 本单全部确认，并复用 store 的乐观更新', async () => {
    const source = await read('../components/PendingApprovalDrawer.vue')
    expect(source).toContain('store.confirm(')
    expect(source).toContain('store.reject(')
    expect(source).toContain('confirmWholeOrder')
    expect(source).toContain('本单全部确认')
  })

  it('处理抽屉：包厢是第一识别信息，缺失时明确「未关联包厢」（不留空白）', async () => {
    const source = await read('../components/PendingApprovalDrawer.vue')
    // 门店处理客户自助加项时必须先看到「哪间包厢」，订单号退成次要信息
    expect(source).toContain('包厢 {{ roomLabel(group) }}')
    expect(source).toContain('roomLabel(group)')
    expect(source).toContain('未关联包厢')
    expect(source).toContain('pending-order__room')
    // 包厢名由服务端给出（会话名称 → 编码 → 资源回源），前端不再只认 roomName 一个字段
    expect(source).toContain('group?.roomName || group?.roomCode')
  })

  it('处理抽屉：只有服务端确认成功才提示成功（失败/已被处理走各自文案）', async () => {
    const source = await read('../components/PendingApprovalDrawer.vue')
    // 结果提示统一收口，按 ok / alreadyProcessed / 其它失败三分支
    expect(source).toContain('reportDecision(')
    expect(source).toContain('result?.ok')
    expect(source).toContain('alreadyProcessed')
    // 不得再出现「await store.confirm(...) 紧跟着无条件弹成功」
    expect(source).not.toMatch(/await store\.confirm\([\s\S]{0,80}?\)\s*\n\s*ElMessage\.success/)
    // 批量确认也不得在失败时谎报「全部确认」
    expect(source).toContain('result.ok')
    expect(source).toContain('未确认成功')
  })

  it('收银台点单弹窗：确认/拒绝同样只在成功时提示，并按服务端状态刷新提醒', async () => {
    const source = await read('../views/tenant/orders.vue')
    expect(source).toContain('decideItemRow(')
    expect(source).toContain('isAlreadyProcessed(e)')
    expect(source).toContain('pendingApprovalStore.refresh()')
    // 用到了就必须真的 import（项目只自动导入 vue/vue-router/pinia，漏 import 构建不报错、点击才炸）
    expect(source).toMatch(/import \{[^}]*isAlreadyProcessed[^}]*\} from '@\/stores\/pendingApproval'/)
  })
})
