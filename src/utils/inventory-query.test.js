import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

const readView = (relative) => readFile(new URL(`../views/tenant/${relative}`, import.meta.url), 'utf8')

/**
 * 仓库管理 / 出入库记录 / 库存成本三块的**查询 + 服务端分页**接线（源码守卫）。
 *
 * 后端（order 域 InventoryController）三个只读端点都返回 MyBatis-Plus 分页信封
 * （`records` / `total` / `current` / `size`）：
 *  - GET /admin/inventory/materials?page&pageSize&storeId&status&category&keyword
 *  - GET /admin/inventory/transactions?page&pageSize&materialId&transactionType&sourceType&from&to&keyword
 *  - GET /admin/inventory/costs?page&pageSize&storeId&keyword
 *    （total = 命中物料条数；currencyCode/mixedCurrency 按**全部命中行**计算，翻页不漂移）
 *
 * 因此页面必须：按 `records`/`total` 解析（不再当数组用）、查询条件变化时把页码复位到 1、
 * 切页/改每页条数重新拉取、空结果区分「无数据」与「无匹配」。
 */

describe('仓库管理 / 出入库记录 / 库存成本：查询条件与分页', () => {
  it('仓库管理：关键字（名称/编码）+ 分类 + 状态 + 查询/重置 + 分页，页码随查询复位', async () => {
    const source = await readView('inventory.vue')

    expect(source).toContain('v-model="materialQuery.keyword"')
    expect(source).toContain('placeholder="物料名称 / 编码"')
    expect(source).toContain('v-model="materialQuery.category"')
    expect(source).toContain('v-model="materialQuery.status"')
    expect(source).toContain('@click="searchMaterials"')
    expect(source).toContain('@click="resetMaterials"')

    expect(source).toContain('v-model:current-page="materialQuery.page"')
    expect(source).toContain('v-model:page-size="materialQuery.pageSize"')
    expect(source).toContain(':total="materialTotal"')
    expect(source).toContain('@current-change="loadMaterials"')
    expect(source).toContain('@size-change="searchMaterials"')
    // 查询/重置必须把页码复位到第 1 页，否则会停在高页码看到空列表
    // （查询入口先做时间区间守卫，再复位页码；两行都在同一个函数体内）
    expect(source).toMatch(/function searchMaterials\(\) \{[\s\S]*?materialQuery\.page = 1[\s\S]*?return loadMaterials\(\)/)
    expect(source).toMatch(/function resetMaterials\(\) \{[\s\S]*?return searchMaterials\(\)/)
  })

  it('出入库记录：物料 + 类型 + 来源 + 日期区间 + 查询/重置 + 分页', async () => {
    const source = await readView('inventory.vue')

    expect(source).toContain('v-model="transactionQuery.materialId"')
    expect(source).toContain('v-model="transactionQuery.transactionType"')
    expect(source).toContain('v-model="transactionQuery.sourceType"')
    expect(source).toContain('v-model="transactionQuery.dateRange"')
    // 日期区间统一走共享控件 DateRangeFilter（页面不再自建 el-date-picker，也不出现第二个区间控件）
    expect(source).toContain('<DateRangeFilter v-model="transactionQuery.dateRange" />')
    expect(source).not.toContain('<el-date-picker')

    expect(source).toContain('v-model:current-page="transactionQuery.page"')
    expect(source).toContain('v-model:page-size="transactionQuery.pageSize"')
    expect(source).toContain(':total="transactionTotal"')
    expect(source).toContain('@current-change="loadTransactions"')
    expect(source).toContain('@size-change="searchTransactions"')
    expect(source).toMatch(/function searchTransactions\(\) \{[\s\S]*?transactionQuery\.page = 1[\s\S]*?return loadTransactions\(\)/)
    expect(source).toMatch(/function resetTransactions\(\) \{[\s\S]*?return searchTransactions\(\)/)

    // 日期区间走 from/to 两个参数（闭区间由后端按当天最后一刻收口），参数统一由 dateRangeParams 产出
    expect(source).toContain('...dateRangeParams(transactionQuery.dateRange)')
    // 类型/来源筛选项来自 constants/terms 的词表，页面不自建英文枚举映射
    expect(source).toContain('Object.entries(INVENTORY_TRANSACTION_TYPE_TEXT)')
    expect(source).toContain('Object.entries(INVENTORY_SOURCE_TYPE_TEXT)')
  })

  it('库存成本：关键字 + 查询/重置 + 分页，合计/混币种口径按全部命中行', async () => {
    const source = await readView('inventory.vue')

    expect(source).toContain('v-model="costQuery.keyword"')
    expect(source).toContain('@click="searchCosts"')
    expect(source).toContain('@click="resetCosts"')
    expect(source).toContain('v-model:current-page="costQuery.page"')
    expect(source).toContain('v-model:page-size="costQuery.pageSize"')
    expect(source).toContain(':total="costTotal"')
    expect(source).toContain('@current-change="loadCosts"')
    expect(source).toContain('@size-change="searchCosts"')
    expect(source).toMatch(/function searchCosts\(\) \{\s*costQuery\.page = 1/)
    expect(source).toMatch(/function resetCosts\(\) \{[\s\S]*?return searchCosts\(\)/)
    // 币种信封来自服务端的全部命中行，页面不得按当前页自行判定混币种
    expect(source).toContain('data?.mixedCurrency === true')
    expect(source).not.toContain('costs.some(')
  })

  it('三块都按 Page 信封解析（records/total），不再把响应当数组用', async () => {
    const source = await readView('inventory.vue')

    expect(source).toContain('rows.value = data?.records || []')
    expect(source).toContain('transactions.value = data?.records || []')
    expect(source).toContain('costs.value = data?.records || []')
    expect(source).toContain('materialTotal.value = Number(data?.total || 0)')
    expect(source).toContain('transactionTotal.value = Number(data?.total || 0)')
    expect(source).toContain('costTotal.value = Number(data?.total || 0)')
    expect(source).not.toContain('Array.isArray(data)')
  })

  it('空结果有明确文案（区分「暂无数据」与「没有符合查询条件」）', async () => {
    const source = await readView('inventory.vue')

    expect(source).toContain("'没有符合查询条件的物料'")
    expect(source).toContain("'没有符合查询条件的出入库记录'")
    expect(source).toContain("'没有符合查询条件的库存成本数据'")
    expect(source).toContain(':description="materialEmptyText"')
    expect(source).toContain(':description="transactionEmptyText"')
    expect(source).toContain(':description="costEmptyText"')
  })

  it('流水下拉的物料快照显式声明 pageSize 上限（分页接口默认 20，必须显式拉 200）', async () => {
    const source = await readView('inventory.vue')

    expect(source).toMatch(/async function loadMaterialOptions\(\)/)
    expect(source).toContain('page: 1, pageSize: 200')
  })
})

describe('商品页物料下拉（products.vue）', () => {
  it('按 Page 信封取 records，并显式声明 pageSize 200 + 只要启用物料', async () => {
    const source = await readView('products.vue')

    expect(source).toContain("listInventoryMaterials({ storeId: context.storeId, status: 'ACTIVE', page: 1, pageSize: 200 })")
    expect(source).toContain('materials.value = data?.records || []')
    // 旧写法把分页信封当数组用，会让下拉静默变空
    expect(source).not.toContain('materials.value = (await listInventoryMaterials')
    // 200 上限必须写在注释里（超过时下拉只覆盖前 200 条）
    expect(source).toContain('pageSize 上限 200')
  })
})
