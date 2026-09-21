import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

/**
 * 「服务型商品 ↔ 后台添加的服务人员」两侧联动守卫。
 *
 * 口径（与后端一致）：
 *  - 服务人员 = `res_resource(resource_type=KTV_SERVER)`，维护入口是「KTV 配置 → 服务人员」；
 *  - 服务型商品（`ord_product.item_type=SERVICE`）通过 `ord_product.server_resource_id` 指向该服务人员，
 *    服务端强校验「必填、同门店、启用中」（PRODUCT_SERVICE_SERVER_REQUIRED）；
 *  - 两侧各自都要能看到对方：商品管理选择服务人员、KTV 配置反查「关联服务型商品」。
 *    历史上 KTV 配置页留了一个永远为 null 的 `catalogItemId` 占位，容易让人以为关联走目录项，
 *    这里同时守住该占位已移除。
 */
const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

describe('服务人员与商品管理的联动口径', () => {
  it('商品管理：服务型商品的「关联服务人员」取自资源表 KTV_SERVER（后台添加的服务人员）', async () => {
    const source = await read('../views/tenant/products.vue')
    expect(source).toContain("resourceType: 'KTV_SERVER'")
    expect(source).toContain('serverResourceId')
    // 服务型商品必须选人；提示指向维护入口
    expect(source).toContain('服务商品必须关联服务人员')
  })

  it('KTV 配置：服务人员页反查并展示「关联服务型商品」', async () => {
    const source = await read('../views/tenant/ktv-config.vue')
    expect(source).toContain('关联服务型商品')
    expect(source).toContain('boundProductText')
    // 反查数据来自商品列表的 serverResourceId 索引
    expect(source).toContain('productByServerResource')
    expect(source).toContain('listProducts(')
    expect(source).toContain('serverResourceId')
  })

  it('KTV 配置：移除永远为 null 的 catalogItemId 占位（关联走 ord_product.server_resource_id）', async () => {
    const source = await read('../views/tenant/ktv-config.vue')
    expect(source).not.toContain('catalogItemId')
  })
})
