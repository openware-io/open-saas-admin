import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

describe('作废订单库存处理入口', () => {
  it('订单管理为已释放房态的作废订单保留库存处理入口', async () => {
    const source = await read('../views/tenant/order-management.vue')

    expect(source).toContain("row.status === 'VOIDED'")
    expect(source).toContain('@click="openRecovery(row)"')
    expect(source).toContain('listInventoryRecovery(row.id)')
    expect(source).toContain('decideInventoryRecovery(recoveryOrder.value.id, item.id')
  })
})
