import { fenToYuan } from './format'

/**
 * 「商品 ← 关联仓库商品（物料）」自动带出的唯一实现（纯函数，便于单测）。
 *
 * 产品口径（2026-09-28 / 2026-10 补图）：
 *  - 新增商品时，选择关联仓库商品后自动带出：名称、分类、单位、售价、描述、**图片**；
 *  - 编辑商品时**只在字段为空时**带出，避免覆盖既有数据（历史商品可能故意与物料不同）；
 *  - 用户手动改过的字段一律不覆盖，改为一次性轻提示（由调用方弹 ElMessage）；
 *  - 带出的值全部可继续手工修改，只是「省一次输入」；
 *  - 物料没有图片时**完全不动**表单里的图片（不清空商品已有图片）。
 *
 * 说明：商品表单没有「采购价」字段（采购价维护在仓库商品上），因此物料的
 * `purchasePrice`（最小货币单位）按同一口径换算成主单位后作为**售价**的默认值带出，
 * 是否合理由运营在保存前确认；物料未维护采购价时不动售价。
 *
 * 图片是**成对**字段：`imageUrls`（列表）+ `mainImageUrl`（主图，必须属于列表）。
 * 因此带出时两者一起写，编辑态也按「列表为空才带出」整体判断，绝不出现
 * 「有列表但主图指向别人」的半截状态；「手动改过」的判定同样按列表整体比较。
 */

/** 参与自动带出的表单字段（也是「已手动编辑」跟踪的范围）。 */
export const MATERIAL_AUTOFILL_FIELDS = ['name', 'category', 'unit', 'salePriceYuan', 'description', 'imageUrls']

/** 表单字段 → 界面文案，用于「已保留你手动填写的 …」提示。 */
export const MATERIAL_AUTOFILL_FIELD_TEXT = {
  name: '名称',
  category: '分类',
  unit: '单位',
  salePriceYuan: '售价',
  description: '描述',
  imageUrls: '图片',
}

/** 图片字段的伴随字段：写入 `imageUrls` 时必须同时写入主图，保持「主图属于列表」。 */
const IMAGE_COMPANION_FIELD = 'mainImageUrl'

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true
  // 空数组 = 没图（编辑态「只在为空时带出」必须把 [] 当空，否则永远带不出物料图）。
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** 数组按内容比较（否则「手动改过」判定会因为引用不同而永远误报冲突）。 */
function sameValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left : []
    const b = Array.isArray(right) ? right : []
    return a.length === b.length && a.every((value, index) => value === b[index])
  }
  return left === right
}

/** 物料图片：去空白、丢空串、保序去重（与 ItemImageUploader / 后端 ItemImages 同口径）。 */
function materialImageUrls(material) {
  const raw = Array.isArray(material?.imageUrls) ? material.imageUrls : []
  return [...new Set(raw.map((url) => text(url)).filter(Boolean))]
}

/**
 * 物料字段 → 表单字段候选值。物料接口没返回的字段不会出现在结果里（不写 undefined/空串）。
 * @param {object} material 仓库商品（ord_inventory_material）
 */
export function materialAutofillValues(material) {
  if (!material) return {}
  const values = {}
  const name = text(material.name)
  const category = text(material.category)
  const unit = text(material.unit)
  const description = text(material.description)
  if (name) values.name = name
  if (category) values.category = category
  if (unit) values.unit = unit
  if (description) values.description = description
  // 采购价是最小货币单位整数；未维护（null/undefined/空串）时不带出，保留表单原值。
  if (!isEmpty(material.purchasePrice)) {
    const major = fenToYuan(material.purchasePrice)
    if (Number.isFinite(major) && major > 0) values.salePriceYuan = major
  }
  // 图片：物料没图时整个字段不出现（调用方因此不会动表单里已有的图片）。
  const urls = materialImageUrls(material)
  if (urls.length) {
    const main = text(material.mainImageUrl)
    values.imageUrls = urls
    values[IMAGE_COMPANION_FIELD] = urls.includes(main) ? main : urls[0]
  }
  return values
}

/**
 * 计算本次选择物料要写入表单的字段。
 *
 * @param {object} params
 * @param {object} params.material 选中的仓库商品
 * @param {object} params.form 当前商品表单（`form.value`）
 * @param {string[]} [params.touched] 用户已手动编辑过的字段
 * @param {boolean} [params.editing] 是否编辑态（编辑态只在字段为空时带出）
 * @returns {{ values: object, patch: object, filled: string[], kept: string[] }}
 *   values  = 物料能提供的候选值；patch = 实际写入的字段；filled = 带出的字段；kept = 因用户已编辑而保留原值的字段
 */
export function buildMaterialAutofill({ material, form, touched = [], editing = false } = {}) {
  const values = materialAutofillValues(material)
  const patch = {}
  const filled = []
  const kept = []
  for (const field of MATERIAL_AUTOFILL_FIELDS) {
    if (!(field in values)) continue
    const next = values[field]
    if (editing) {
      // 编辑态：字段已有值就绝不动它，避免破坏既有商品数据。
      if (!isEmpty(form?.[field])) continue
      patch[field] = next
      if (field === 'imageUrls') {
        patch[IMAGE_COMPANION_FIELD] = values[IMAGE_COMPANION_FIELD]
      }
      filled.push(field)
      continue
    }
    if (touched.includes(field)) {
      // 用户手动填过：保留原值，只在两者不同时提示（相同则无需提示）。
      if (!sameValue(form?.[field], next)) kept.push(field)
      continue
    }
    patch[field] = next
    // 图片成对写入：列表与主图必须来自同一次带出（主图必须属于列表）。
    if (field === 'imageUrls') {
      patch[IMAGE_COMPANION_FIELD] = values[IMAGE_COMPANION_FIELD]
    }
    filled.push(field)
  }
  return { values, patch, filled, kept }
}

/** 「已保留你手动填写的字段」提示文案；无冲突时返回空串。 */
export function materialAutofillKeptHint(kept) {
  if (!kept || !kept.length) return ''
  const labels = kept.map((field) => MATERIAL_AUTOFILL_FIELD_TEXT[field] || field)
  return `已带出仓库商品信息，保留你手动填写的：${labels.join('、')}`
}
