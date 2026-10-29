/**
 * 权限目录矩阵的纯函数：筛选、排序、角色列顺序、四态单元格与授权查找。
 *
 * 页面只维护一份 `filteredRows`，列表与矩阵列共用同一行数组；排序/筛选都在这里完成，
 * 从结构上保证“列表排序与矩阵一致”，不依赖两个表格各自同步。
 *
 * 四态语义（授权规则由服务端 `Permission.grantableTo` 计算，前端不重复判定）：
 *  - granted   已授予且可授予（正常）
 *  - grantable 可授予但未授予（可补授）
 *  - forbidden 不可授予（角色作用域不在权限 grantableLevels 内）
 *  - anomaly   已授予但不可授予（越界/历史遗留，需要治理）
 */

const SCOPE_ORDER = { PLATFORM: 0, TENANT: 1, ORGANIZATION: 2, STORE: 3 }

/** 预置角色的业务顺序；自定义角色在同一作用域内排在预置之后并按编码。 */
const ROLE_RANK = {
  'platform.operator': 0,
  'tenant.owner': 0,
  'store.manager': 0,
  'store.cashier': 10,
  'store.finance': 20,
}

export const CELL_STATES = Object.freeze({
  GRANTED: 'granted',
  GRANTABLE: 'grantable',
  FORBIDDEN: 'forbidden',
  ANOMALY: 'anomaly',
})

const FILTER_FIELDS = ['code', 'description', 'module', 'domainCode', 'grantableLevels', 'scopeLevel']
const SORT_FIELDS = new Set(FILTER_FIELDS)

/** 按编码/名称/模块/业务域/可授予作用域做大小写不敏感筛选。 */
export function filterPermissionRows(rows, keyword) {
  const list = Array.isArray(rows) ? rows : []
  const value = String(keyword || '').trim().toLowerCase()
  if (!value) return list
  return list.filter((row) => FILTER_FIELDS.some((field) => String(row?.[field] ?? '').toLowerCase().includes(value)))
}

/**
 * 按 Element Plus sort-change 结果排序；同值时回落到权限编码，保证矩阵行序稳定。
 * 未指定排序时保持服务端顺序（服务端按模块 + 权限编码返回）。
 */
export function sortPermissionRows(rows, sort) {
  const list = Array.isArray(rows) ? rows : []
  const prop = sort?.prop
  const order = sort?.order
  if (!SORT_FIELDS.has(prop) || !order) return list
  const direction = order === 'descending' ? -1 : 1
  return [...list].sort((left, right) => {
    const primary = String(left?.[prop] ?? '').localeCompare(String(right?.[prop] ?? ''), 'zh-CN')
    if (primary !== 0) return primary * direction
    return String(left?.code ?? '').localeCompare(String(right?.code ?? ''), 'zh-CN')
  })
}

/** 矩阵列顺序：先按作用域层级，再按预置角色 rank，最后按编码；避免依赖数据库自增 ID。 */
export function roleMatrixColumns(roles) {
  return [...(Array.isArray(roles) ? roles : [])].sort((left, right) => {
    const scope = (SCOPE_ORDER[left?.scopeLevel] ?? 4) - (SCOPE_ORDER[right?.scopeLevel] ?? 4)
    if (scope !== 0) return scope
    const rank = (ROLE_RANK[left?.code] ?? 100) - (ROLE_RANK[right?.code] ?? 100)
    if (rank !== 0) return rank
    return String(left?.code ?? '').localeCompare(String(right?.code ?? ''), 'zh-CN')
  })
}

/** 角色 → 已授予权限编码集合；用于 O(1) 单元格判定。 */
export function buildGrantLookup(roles) {
  const lookup = new Map()
  for (const role of Array.isArray(roles) ? roles : []) {
    lookup.set(role.code, new Set(Array.isArray(role.permissionCodes) ? role.permissionCodes : []))
  }
  return lookup
}

/** 角色 → 可授予权限编码集合（服务端按角色作用域计算）。 */
export function buildGrantableLookup(roles) {
  const lookup = new Map()
  for (const role of Array.isArray(roles) ? roles : []) {
    lookup.set(role.code, new Set(Array.isArray(role.grantablePermissionCodes) ? role.grantablePermissionCodes : []))
  }
  return lookup
}

/** 某角色是否已授予某权限编码。 */
export function hasGrant(lookup, roleCode, permissionCode) {
  return Boolean(lookup?.get(roleCode)?.has(permissionCode))
}

/** 某角色是否可授予某权限编码。 */
export function hasGrantable(lookup, roleCode, permissionCode) {
  return Boolean(lookup?.get(roleCode)?.has(permissionCode))
}

/** 计算一个单元格的四态。 */
export function cellState(permissionCode, roleCode, grants, grantables) {
  const granted = hasGrant(grants, roleCode, permissionCode)
  const grantable = hasGrantable(grantables, roleCode, permissionCode)
  if (granted) return grantable ? CELL_STATES.GRANTED : CELL_STATES.ANOMALY
  return grantable ? CELL_STATES.GRANTABLE : CELL_STATES.FORBIDDEN
}

/** 判断某行是否至少有一个角色的单元格处于指定状态。 */
export function rowHasCellState(row, roles, grants, grantables, state) {
  return (Array.isArray(roles) ? roles : []).some(
    (role) => cellState(row?.code, role.code, grants, grantables) === state,
  )
}

/** 统计矩阵中的四态数量，用于图例/异常计数。 */
export function countCellStates(rows, roles, grants, grantables) {
  const counts = {
    [CELL_STATES.GRANTED]: 0,
    [CELL_STATES.GRANTABLE]: 0,
    [CELL_STATES.FORBIDDEN]: 0,
    [CELL_STATES.ANOMALY]: 0,
  }
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const role of Array.isArray(roles) ? roles : []) {
      counts[cellState(row?.code, role.code, grants, grantables)] += 1
    }
  }
  return counts
}

const CSV_STATE_LABELS = {
  [CELL_STATES.GRANTED]: '已授予',
  [CELL_STATES.GRANTABLE]: '可授予未授予',
  [CELL_STATES.FORBIDDEN]: '不可授予',
  [CELL_STATES.ANOMALY]: '越界授权',
}

function csvCell(value) {
  const raw = String(value ?? '')
  // 防 CSV 公式注入：Excel 会把以 = + - @ 开头的单元格当公式执行。
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * 导出当前视图为 CSV：左侧权限字段 + 当前显示的角色列，单元格用中文状态而不是符号，
 * 便于运营在 Excel 中筛选/复核。返回字符串；调用方负责加 BOM 与下载。
 */
export function buildPermissionMatrixCsv(rows, roles, grants, grantables) {
  const roleList = Array.isArray(roles) ? roles : []
  const header = ['权限编码', '名称', '模块', '业务域', '适用作用域', '可授予', ...roleList.map((role) => role.name)]
  const lines = [header]
  for (const row of Array.isArray(rows) ? rows : []) {
    lines.push([
      row.code,
      row.description || row.code,
      row.module,
      row.domainCode,
      row.scopeLevel,
      row.grantableLevels,
      ...roleList.map((role) => CSV_STATE_LABELS[cellState(row.code, role.code, grants, grantables)]),
    ])
  }
  return `${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`
}
