import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * 商品管理三点改动的源码守卫（界面约定，避免后续重构把口径改回去）：
 *
 *  1. 分类快捷筛选：tab 来源 = 门店分类字典（分类管理里维护的「已有分类项」）+ 历史引用分类，
 *     且分类为空时有明确原因提示、空态文案能区分「筛选后为空」；
 *  2. 关联仓库商品自动带出：图片字段（列表 + 主图）确实接到了 ItemImageUploader 的绑定上，
 *     自动带出的那批图与用户自己上传的图区分（否则换物料就不再覆盖图片）；
 *  3. 商品类型（实物 / 服务）：表单有商品类型与服务人员字段、下拉数据源是 KTV_SERVER 资源，
 *     保存时服务不带库存/物料、实物不带服务人员；列表与详情展示类型与服务人员。
 *  4. 加项：点单弹窗对服务类目录项有明确标识与「服务加项 vs 服务人员点单」的口径说明。
 */

const srcRoot = fileURLToPath(new URL('..', import.meta.url))

async function readSource(...segments) {
  return readFile(path.join(srcRoot, ...segments), 'utf8')
}

/** 去掉注释后再断言：说明「为什么这么写」的注释不算实现（与 terms.test.js 同口径）。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('商品页分类快捷筛选（第 1 点）', () => {
  it('分类 tab 以分类字典为主、合并历史引用分类，并保留当前选中项', async () => {
    const source = stripComments(await readSource('views', 'tenant', 'products.vue'))

    // 来源必须同时包含分类字典（categories）与商品上的历史分类（rows），缺一就会出现「字典里有分类却筛不到」。
    expect(source).toMatch(/const productCategoryTabs = computed\(/)
    expect(source).toContain('categories.value')
    expect(source).toMatch(/rows\.value\.map\(\(product\) => product\.category\)/)
    expect(source).toContain("const active = categoryFilter.value !== 'all' ? [categoryFilter.value] : []")
    // 仍然走 OperationsBoard 的 tabs 呈现（点一下就筛）。
    expect(source).toContain(':tabs="productCategoryTabs"')
    expect(source).toContain('v-model:active-tab="categoryFilter"')
    // 关键字搜索保留。
    expect(source).toContain(':filters="PRODUCT_STATUS_FILTERS"')
    expect(source).toContain('search-placeholder=')
  })

  it('分类为空 / 筛选后为空时都有可读原因', async () => {
    const source = stripComments(await readSource('views', 'tenant', 'products.vue'))

    expect(source).toContain('const categoryFilterHint = computed(')
    expect(source).toContain('尚未维护商品分类')
    expect(source).toContain('{{ categoryFilterHint }}')
    expect(source).toContain('const productEmptyText = computed(')
    expect(source).toContain('分类「${categoryFilter.value}」下暂无商品')
    expect(source).toContain(':description="productEmptyText"')
  })
})

describe('关联仓库商品带出图片（第 2 点）', () => {
  it('商品图片表单确实接到了 ItemImageUploader 的 images / mainImage 绑定上', async () => {
    const source = stripComments(await readSource('views', 'tenant', 'products.vue'))

    expect(source).toContain('<ItemImageUploader')
    expect(source).toContain(':images="form.imageUrls"')
    expect(source).toContain(':main-image="form.mainImageUrl"')
    expect(source).toContain('@update:images="onFormImagesUpdate"')
  })

  it('自动带出的图片不算「用户手动编辑」，但用户自己上传的算', async () => {
    const source = stripComments(await readSource('views', 'tenant', 'products.vue'))

    expect(source).toContain('const lastAutofilledImages = ref([])')
    expect(source).toContain('function onFormImagesUpdate(urls)')
    expect(source).toContain('markTouched(\'imageUrls\')')
    expect(source).toContain('lastAutofilledImages.value = patch.imageUrls')
    // 带出说明里明确写了图片会被带出、且物料没图时不动图片。
    expect(source).toContain('描述、图片')
  })

  it('纯函数口径：图片随字段一起带出，物料没图时没有该字段', async () => {
    const util = await readSource('utils', 'product-material-autofill.js')
    expect(util).toContain("export const MATERIAL_AUTOFILL_FIELDS = ['name', 'category', 'unit', 'salePriceYuan', 'description', 'imageUrls']")
    expect(util).toContain('IMAGE_COMPANION_FIELD')
  })
})

describe('商品分实物 / 服务并关联服务人员（第 3 点）', () => {
  it('表单有商品类型与服务人员字段，数据源是本门店 KTV_SERVER 资源', async () => {
    const source = stripComments(await readSource('views', 'tenant', 'products.vue'))

    expect(source).toContain('v-model="form.itemType"')
    expect(source).toContain('PRODUCT_ITEM_TYPE_OPTIONS')
    expect(source).toContain('v-if="isServiceForm" label="关联服务人员" prop="serverResourceId"')
    expect(source).toContain('v-model="form.serverResourceId"')
    expect(source).toContain("listResources({ resourceType: 'KTV_SERVER', storeId: context.storeId })")
    // 服务不需要库存/物料：库存开关与仓库商品只在实物分支渲染。
    expect(source).toContain('<template v-else>')
    expect(source).toContain('label="实物商品（占用库存）"')
  })

  it('保存时服务不带库存/物料，实物不带服务人员；上架前做同一口径的前置提示', async () => {
    const source = stripComments(await readSource('views', 'tenant', 'products.vue'))

    expect(source).toContain('materialId: service || !form.value.stockControlled ? null : form.value.materialId')
    expect(source).toContain('stockControlled: service ? false : form.value.stockControlled')
    expect(source).toContain('serverResourceId: service ? form.value.serverResourceId : null')
    expect(source).toContain("ElMessage.warning('服务商品必须关联服务人员')")
    expect(source).toContain("ElMessage.warning('实物商品必须关联仓库商品')")
  })

  it('列表 / 详情展示商品类型与服务人员（服务人员名缺失时退回 ID）', async () => {
    const source = stripComments(await readSource('views', 'tenant', 'products.vue'))

    expect(source).toContain('{{ stockTypeText(product) }}')
    expect(source).toContain('{{ productItemTypeText(detailProduct.itemType) }}')
    expect(source).toContain('{{ serverText(detailProduct) }}')
    expect(source).toContain('服务人员 #${product.serverResourceId}')
  })

  it('词表集中在 constants/terms（页面不得自建枚举 → 中文映射）', async () => {
    const terms = await readSource('constants', 'terms.js')
    expect(terms).toContain("export const PRODUCT_ITEM_TYPE_TEXT = { PRODUCT: '实物商品', SERVICE: '服务' }")
    expect(terms).toContain('export function productItemTypeText(itemType)')
    expect(terms).toContain('export const PRODUCT_ITEM_TYPE_OPTIONS')
  })
})

describe('加项能对服务加项（第 4 点）', () => {
  it('点单弹窗标识服务目录项，并写明与「服务人员点单」的口径关系', async () => {
    const source = stripComments(await readSource('views', 'tenant', 'orders.vue'))

    expect(source).toContain("c.itemType && c.itemType !== 'PRODUCT'")
    expect(source).toContain('{{ catalogItemTypeText(c.itemType) }}')
    expect(source).toContain('const catalogHasService = computed(')
    expect(source).toContain('catalog-service-hint')
    expect(source).toContain('共用同一份服务目录项')
    expect(source).toContain('不占库存')
  })
})
