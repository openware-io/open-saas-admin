import { describe, expect, it } from 'vitest'
import {
  MATERIAL_AUTOFILL_FIELDS,
  buildMaterialAutofill,
  materialAutofillKeptHint,
  materialAutofillValues,
} from './product-material-autofill'

/**
 * 商品新增「关联仓库商品 → 自动带出」契约。
 *
 * 产品口径：
 *  - 新增：带出未被用户手动改过的字段，可覆盖表单默认值（如默认分类「其他」、默认单位「份」）；
 *  - 编辑：只在字段为空时带出，绝不覆盖既有数据；
 *  - 用户手动编辑过的字段：保留原值 + 一次轻提示（不静默覆盖）；
 *  - 物料接口没返回的字段（如未维护采购价）不带出。
 */

const material = {
  id: 7,
  name: '可乐 330ml',
  materialCode: 'DRINK-001',
  category: '酒水',
  unit: '罐',
  description: '冰镇更佳',
  purchasePrice: 350,
}

/** 带图的物料（入库/物料接口的 imageUrls / mainImageUrl）：新增商品时应把图一起带过来。 */
const materialWithImages = {
  ...material,
  imageUrls: ['/api/v1/media-public/m1.png', '/api/v1/media-public/m2.png'],
  mainImageUrl: '/api/v1/media-public/m2.png',
}

/** 商品弹窗的初始表单（与 products.vue 的 emptyForm 同形）。 */
const emptyForm = () => ({
  productCode: '',
  name: '',
  category: '其他',
  unit: '份',
  salePriceYuan: 1,
  description: '',
  stockControlled: true,
  materialId: null,
  imageUrls: [],
  mainImageUrl: '',
})

describe('materialAutofillValues', () => {
  it('名称 / 分类 / 单位 / 描述直接带出，采购价（最小货币单位 → 主单位）作为售价默认值', () => {
    expect(materialAutofillValues(material)).toEqual({
      name: '可乐 330ml',
      category: '酒水',
      unit: '罐',
      description: '冰镇更佳',
      salePriceYuan: 3.5,
    })
  })

  it('物料未维护采购价（null / 空串）时不带出售价；空字段不写进候选值', () => {
    const values = materialAutofillValues({ ...material, purchasePrice: null, description: '   ' })
    expect(values.salePriceYuan).toBeUndefined()
    expect(values.description).toBeUndefined()
    expect(values.name).toBe('可乐 330ml')
  })

  it('物料缺失返回空对象（调用方不做任何覆盖）', () => {
    expect(materialAutofillValues(null)).toEqual({})
  })

  it('物料带图时把图（列表 + 主图）一起带出；主图不在列表里就退回第一张', () => {
    expect(materialAutofillValues(materialWithImages).imageUrls)
      .toEqual(['/api/v1/media-public/m1.png', '/api/v1/media-public/m2.png'])
    expect(materialAutofillValues(materialWithImages).mainImageUrl).toBe('/api/v1/media-public/m2.png')
    expect(materialAutofillValues({ ...materialWithImages, mainImageUrl: '/other.png' }).mainImageUrl)
      .toBe('/api/v1/media-public/m1.png')
  })

  it('物料没有图片（缺字段 / 空数组 / 全空串）时不带出图片字段', () => {
    expect(materialAutofillValues(material).imageUrls).toBeUndefined()
    expect(materialAutofillValues({ ...material, imageUrls: [] }).imageUrls).toBeUndefined()
    expect(materialAutofillValues({ ...material, imageUrls: ['  ', ''] }).imageUrls).toBeUndefined()
  })

  it('物料图片去空白、保序去重（与上传组件/后端同口径）', () => {
    expect(materialAutofillValues({ ...material, imageUrls: [' /a.png ', '/a.png', '/b.png', ''] }).imageUrls)
      .toEqual(['/a.png', '/b.png'])
  })
})

describe('buildMaterialAutofill（新增态）', () => {
  it('未被用户编辑的字段全部带出，包括表单默认分类与单位', () => {
    const { patch, kept, filled } = buildMaterialAutofill({ material, form: emptyForm(), touched: [], editing: false })
    expect(patch).toEqual({
      name: '可乐 330ml',
      category: '酒水',
      unit: '罐',
      description: '冰镇更佳',
      salePriceYuan: 3.5,
    })
    expect(kept).toEqual([])
    expect(filled).toHaveLength(MATERIAL_AUTOFILL_FIELDS.filter((field) => field !== 'imageUrls').length)
  })

  it('物料带图：新增时图片与主图成对写入（物料没图则完全不动图片）', () => {
    const form = { ...emptyForm(), imageUrls: ['/old.png'], mainImageUrl: '/old.png' }
    const withImages = buildMaterialAutofill({ material: materialWithImages, form, touched: [], editing: false })
    expect(withImages.patch.imageUrls).toEqual(['/api/v1/media-public/m1.png', '/api/v1/media-public/m2.png'])
    expect(withImages.patch.mainImageUrl).toBe('/api/v1/media-public/m2.png')

    // 物料没有图：patch 里根本不出现 imageUrls / mainImageUrl，商品已有图片保持不动。
    const withoutImages = buildMaterialAutofill({ material, form, touched: [], editing: false })
    expect('imageUrls' in withoutImages.patch).toBe(false)
    expect('mainImageUrl' in withoutImages.patch).toBe(false)
  })

  it('用户手动编辑过图片（touched=imageUrls）时不覆盖，并按内容比较给出提示', () => {
    const form = { ...emptyForm(), imageUrls: ['/mine.png'], mainImageUrl: '/mine.png' }
    const { patch, kept } = buildMaterialAutofill({
      material: materialWithImages, form, touched: ['imageUrls'], editing: false,
    })
    expect('imageUrls' in patch).toBe(false)
    expect(kept).toEqual(['imageUrls'])
    expect(materialAutofillKeptHint(kept)).toBe('已带出仓库商品信息，保留你手动填写的：图片')
  })

  it('手动图片恰好与物料一致时不提示（数组按内容比较，不因引用不同误报）', () => {
    const form = {
      ...emptyForm(),
      imageUrls: ['/api/v1/media-public/m1.png', '/api/v1/media-public/m2.png'],
      mainImageUrl: '/api/v1/media-public/m2.png',
    }
    const { kept } = buildMaterialAutofill({
      material: materialWithImages, form, touched: ['imageUrls'], editing: false,
    })
    expect(kept).toEqual([])
  })

  it('用户手动改过的字段保留原值，并给出提示清单（不被覆盖）', () => {
    const form = { ...emptyForm(), name: '自定义名称', salePriceYuan: 9.9 }
    const { patch, kept } = buildMaterialAutofill({ material, form, touched: ['name', 'salePriceYuan'], editing: false })
    expect(patch).toEqual({ category: '酒水', unit: '罐', description: '冰镇更佳' })
    expect(kept).toEqual(['name', 'salePriceYuan'])
    expect(materialAutofillKeptHint(kept)).toBe('已带出仓库商品信息，保留你手动填写的：名称、售价')
  })

  it('手动值恰好与物料一致时不提示（避免无意义打扰）', () => {
    const form = { ...emptyForm(), name: '可乐 330ml' }
    const { kept } = buildMaterialAutofill({ material, form, touched: ['name'], editing: false })
    expect(kept).toEqual([])
    expect(materialAutofillKeptHint(kept)).toBe('')
  })

  it('描述为空时带出（产品口径：描述仅在为空时填入）', () => {
    const form = { ...emptyForm(), description: '' }
    const { patch } = buildMaterialAutofill({ material, form, touched: [], editing: false })
    expect(patch.description).toBe('冰镇更佳')
  })
})

describe('buildMaterialAutofill（编辑态）', () => {
  it('已有值的字段一律不动（避免破坏既有商品数据）', () => {
    const form = {
      ...emptyForm(),
      name: '门店自定义名称',
      category: '套餐',
      unit: '套',
      salePriceYuan: 88,
      description: '老描述',
    }
    const { patch, kept } = buildMaterialAutofill({ material, form, touched: [], editing: true })
    expect(patch).toEqual({})
    expect(kept).toEqual([])
  })

  it('只有为空的字段才补带（如历史商品描述为空）', () => {
    const form = { ...emptyForm(), name: '已有名称', category: '套餐', unit: '套', salePriceYuan: 88, description: '' }
    const { patch } = buildMaterialAutofill({ material, form, touched: [], editing: true })
    expect(patch).toEqual({ description: '冰镇更佳' })
  })

  it('编辑态即使字段被标记为 touched，也只在为空时带出', () => {
    const form = { ...emptyForm(), name: '', category: '酒水' }
    const { patch, kept } = buildMaterialAutofill({ material, form, touched: ['name', 'category'], editing: true })
    // 空字段（名称/描述）补带；已有值的分类/单位/售价保持原样。
    expect(patch).toEqual({ name: '可乐 330ml', description: '冰镇更佳' })
    expect(kept).toEqual([])
  })

  it('编辑态图片为空才带出；已有图片（历史商品）一块都不动', () => {
    const emptyImages = { ...emptyForm(), name: '已有名称', category: '套餐', unit: '套', salePriceYuan: 88, description: '老描述' }
    const filled = buildMaterialAutofill({ material: materialWithImages, form: emptyImages, touched: [], editing: true })
    expect(filled.patch).toEqual({
      imageUrls: ['/api/v1/media-public/m1.png', '/api/v1/media-public/m2.png'],
      mainImageUrl: '/api/v1/media-public/m2.png',
    })

    const ownImages = { ...emptyImages, imageUrls: ['/mine.png'], mainImageUrl: '/mine.png' }
    expect(buildMaterialAutofill({ material: materialWithImages, form: ownImages, touched: [], editing: true }).patch)
      .toEqual({})
  })
})
