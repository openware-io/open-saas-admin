import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

/**
 * KTV 配置页（/business/ktv-config）与储值管理页（/business/wallet）的边界（2026-09-19 合并）：
 *
 * 储值账户信息跨店共享，但经营操作属于门店；只允许有一个经营入口 —— 「储值管理」页。
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

it('储值管理页承载真实储值流水与门店操作口径', async () => {
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
  // 共享账户与实际操作门店的边界要写在界面上
  expect(source).toContain('账户信息跨店共享')
  expect(source).toContain('实际操作门店')
  // 租户级代币配置已经拆到独立页面，门店储值页不得保留配置入口。
  expect(source).not.toContain('updateWalletTokenConfig')
  expect(source).not.toContain('代币配置')
})

it('代币配置独立为租户级页面', async () => {
  const source = await readFile(new URL('../views/tenant/wallet-token-config.vue', import.meta.url), 'utf8')
  expect(source).toContain('updateWalletTokenConfig')
  expect(source).toContain('租户级配置')
  expect(source).toContain('所有业务和门店统一生效')
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

it('KTV 配置作用域单选使用 Element Plus 的 value API', async () => {
  const source = await readFile(new URL('../views/tenant/ktv-config.vue', import.meta.url), 'utf8')
  // Element Plus 3 将移除 label 兼作值的兼容行为；四个三层作用域选择器必须显式传 value。
  expect(source.match(/<el-radio-button value="(?:TENANT|BUSINESS|STORE)">/g)).toHaveLength(12)
  expect(source).not.toMatch(/<el-radio-button label=/)
})
