import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fenToYuan, formatMoney, yuanToFen } from './format'

/**
 * 储值充值金额契约（主单位 ↔ 最小货币单位）固化。
 *
 * 后端唯一口径（只读 gv_im_server 取证）：
 *  - `cst_wallet_account.available_amount` 迁移注释「可用储值余额(最小货币单位整数)」；
 *    `cst_wallet_ledger.amount` 迁移注释「变动金额(最小货币单位整数，正数)」；
 *  - `WalletApplicationService` 类注释「金额单位为最小货币单位整数」，
 *    `validateAmount` 报错「金额必须为正整数(最小货币单位)」；
 *  - `WalletRechargeRequest.amount` 字段注释「最小货币单位整数」。
 *
 * 因此后台表单（按当前币种主单位输入）提交前一律 `yuanToFen`，列表展示一律 `formatMoney`
 * （符号取自记录的 currencyCode 快照或当前币种），两个页面不得再出现「主单位值直传」
 * 或「按代币比例放大后直传」；
 * 同类限额字段（支付开关 minAmount/maxAmount，`PaymentSwitchConfig.PaymentChannelSwitch`）
 * 同样是「最小货币单位整数」，一并按同一口径守住。
 */
const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

describe('储值充值金额契约：主单位 ↔ 最小货币单位', () => {
  it('主单位输入换算成最小货币单位整数，展示再换算回主单位，互为逆运算', () => {
    expect(yuanToFen(100)).toBe(10000)
    expect(yuanToFen(123.45)).toBe(12345)
    expect(fenToYuan(10000)).toBe(100)
    expect(formatMoney(yuanToFen(123.45), 'CNY')).toBe('¥123.45')
    expect(formatMoney(10000, 'USD')).toBe('$100.00')
  })

  it('储值充值只在储值管理页按最小货币单位提交（主单位值直传即 100 倍偏差）', async () => {
    const ktvConfig = await read('../views/tenant/ktv-config.vue')
    const wallet = await read('../views/tenant/wallet.vue')
    expect(wallet).toContain('amount: yuanToFen(')
    expect(wallet).not.toContain('amount: tokens')
    // 写路径币种取全局 store，不再写死币种码
    expect(wallet).toContain('currency: currencyStore.code')
    // 储值唯一入口是储值管理页：KTV 配置页不得再有储值表单/金额提交（否则同一功能两套金额口径）
    expect(ktvConfig).not.toContain('walletForm')
    expect(ktvConfig).not.toContain('walletRecharge')
  })

  it('同页支付开关限额也按最小货币单位提交（后端 PaymentSwitchConfig 同为最小货币单位整数）', async () => {
    const ktvConfig = await read('../views/tenant/ktv-config.vue')
    // 读回来以主单位展示，提交前换算成最小货币单位；缺任一侧都会再次出现 100 倍偏差。
    expect(ktvConfig).toContain('minAmount: fenToYuan(')
    expect(ktvConfig).toContain('maxAmount: fenToYuan(')
    expect(ktvConfig).toContain('minAmount: yuanToFen(')
    expect(ktvConfig).toContain('maxAmount: yuanToFen(')
  })
})
