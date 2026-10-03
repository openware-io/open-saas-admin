import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

/**
 * KTV 配置页（/business/ktv-config）与储值管理页（/business/wallet）的边界（2026-09-19 合并）：
 *
 * 储值是**租户级、跨门店共用**的资产，只允许有一个入口 —— 「储值管理」页。
 * KTV 配置页此前自带的「A380币充值」页签要求先选门店 + 手填客户 ID，
 * 且它展示的「储值流水」是后端拿余额拼出来的一行（不是真账本），与储值管理页重复。
 * 因此 KTV 配置页不得再出现充值/退还调用，只保留跳转入口。
 */
it('KTV 配置页不再自带储值充值，只保留去「储值管理」的入口', async () => {
  const source = await readFile(new URL('../views/tenant/ktv-config.vue', import.meta.url), 'utf8')
  // 唯一入口在储值管理页：KTV 配置页不得再出现充值/退还调用与充值表单
  expect(source).not.toContain('walletRecharge')
  expect(source).not.toContain('walletRefund')
  expect(source).not.toContain('getWalletRecharges')
  expect(source).not.toContain('wallet-recharge')
  expect(source).not.toContain('submitRecharge')
  // 但必须留明确的跳转入口，用户不会「找不到充值」
  expect(source).toContain('goWallet')
  expect(source).toContain("router.push('/business/wallet')")
  // 历史演示数据不得回流（原先即有的守卫，继续保留）
  expect(source).not.toContain('customerId: 1001')
  expect(source).not.toContain('storeId: 1')
  expect(source).not.toContain('BFF 骨架回显')
})

it('储值管理页承载真实储值流水与租户级口径', async () => {
  const source = await readFile(new URL('../views/tenant/wallet.vue', import.meta.url), 'utf8')
  // 真实账本分页（cst_wallet_ledger），不是「用余额拼出来的流水」
  expect(source).toContain('getMemberWalletLedger')
  expect(source).toContain('entryType')
  // 会员列表一次批量查询（服务端 /business/members/wallets），不逐会员查钱包
  expect(source).toContain('listMemberWallets')
  expect(source).not.toContain('getMemberWallet(')
  // 账户懒初始化：没有账户的会员显示「未开立」，而不是报「储值账户不存在」
  expect(source).toContain('未开立')
  expect(source).toContain('accountOpened')
  // 租户级、跨门店共用的口径要写在界面上
  expect(source).toContain('跨门店共用')
})

it('退款与日结配置页同步维护 Order 作废审批规则', async () => {
  const source = await readFile(new URL('../views/tenant/ktv-config.vue', import.meta.url), 'utf8')
  const api = await readFile(new URL('../api/ktv.js', import.meta.url), 'utf8')
  expect(api).toContain("'/api/v1/admin/ktv/void-rules'")
  expect(source).toContain('getVoidRule')
  expect(source).toContain('saveVoidRule')
  expect(source).toContain('requireVoidApproval')
  expect(source).toContain('开启后直接作废会被拒绝')
  expect(source).toContain('Promise.all([getPaymentRule(paymentRuleParams()), getVoidRule(paymentRuleParams())])')
})
