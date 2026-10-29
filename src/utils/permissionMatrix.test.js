import { describe, expect, it } from 'vitest'
import {
  CELL_STATES,
  buildGrantLookup,
  buildGrantableLookup,
  buildPermissionMatrixCsv,
  cellState,
  countCellStates,
  filterPermissionRows,
  hasGrant,
  roleMatrixColumns,
  rowHasCellState,
  sortPermissionRows,
} from './permissionMatrix'

const rows = [
  { code: 'order.view', description: '查看订单', module: 'order', domainCode: 'core', scopeLevel: 'TENANT', grantableLevels: 'TENANT,STORE' },
  { code: 'tenant.store.manage', description: '门店管理', module: 'tenant', domainCode: 'core', scopeLevel: 'TENANT', grantableLevels: 'TENANT' },
  { code: 'ktv.session.open', description: 'KTV 开台', module: 'ktv', domainCode: 'ktv', scopeLevel: 'STORE', grantableLevels: 'TENANT,STORE' },
]

const roles = [
  {
    id: 1,
    code: 'platform.operator',
    name: '平台运营',
    scopeLevel: 'PLATFORM',
    roleType: 'PRESET',
    permissionCodes: ['order.view', 'tenant.store.manage'],
    grantablePermissionCodes: ['order.view'],
  },
  {
    id: 2,
    code: 'tenant.owner',
    name: '租户老板',
    scopeLevel: 'TENANT',
    roleType: 'PRESET',
    permissionCodes: ['order.view'],
    grantablePermissionCodes: ['order.view', 'tenant.store.manage'],
  },
  {
    id: 3,
    code: 'store.manager',
    name: '店长',
    scopeLevel: 'STORE',
    roleType: 'PRESET',
    permissionCodes: [],
    grantablePermissionCodes: ['order.view', 'ktv.session.open'],
  },
]

const grants = buildGrantLookup(roles)
const grantables = buildGrantableLookup(roles)

describe('permissionMatrix', () => {
  it('按编码/名称/模块/业务域/可授予过滤', () => {
    expect(filterPermissionRows(rows, 'order').map((row) => row.code)).toEqual(['order.view'])
    expect(filterPermissionRows(rows, '门店').map((row) => row.code)).toEqual(['tenant.store.manage'])
    expect(filterPermissionRows(rows, 'ktv').map((row) => row.code)).toEqual(['ktv.session.open'])
    expect(filterPermissionRows(rows, 'TENANT,STORE').map((row) => row.code)).toEqual(['order.view', 'ktv.session.open'])
    expect(filterPermissionRows(rows, '   ')).toHaveLength(3)
  })

  it('按列排序，同值回落到权限编码', () => {
    expect(sortPermissionRows(rows, { prop: 'code', order: 'ascending' }).map((row) => row.code))
      .toEqual(['ktv.session.open', 'order.view', 'tenant.store.manage'])
    expect(sortPermissionRows(rows, { prop: 'code', order: 'descending' }).map((row) => row.code))
      .toEqual(['tenant.store.manage', 'order.view', 'ktv.session.open'])
  })

  it('未指定有效排序时保持服务端顺序', () => {
    expect(sortPermissionRows(rows, {})).toBe(rows)
    expect(sortPermissionRows(rows, { prop: 'unknown', order: 'ascending' })).toBe(rows)
  })

  it('矩阵列按平台/租户/组织/门店，再按预置 rank，最后按编码；不依赖 ID', () => {
    const shuffled = [
      { id: 99, code: 'store.finance', scopeLevel: 'STORE' },
      { id: 3, code: 'store.manager', scopeLevel: 'STORE' },
      { id: 4, code: 'store.cashier', scopeLevel: 'STORE' },
      { id: 2, code: 'tenant.owner', scopeLevel: 'TENANT' },
      { id: 1, code: 'platform.operator', scopeLevel: 'PLATFORM' },
      { id: 6, code: 'org.owner', scopeLevel: 'ORGANIZATION' },
    ]
    expect(roleMatrixColumns(shuffled).map((role) => role.code))
      .toEqual(['platform.operator', 'tenant.owner', 'org.owner', 'store.manager', 'store.cashier', 'store.finance'])
  })

  it('四态：已授予/可授予未授予/不可授予/越界授予', () => {
    expect(cellState('order.view', 'platform.operator', grants, grantables)).toBe(CELL_STATES.GRANTED)
    expect(cellState('tenant.store.manage', 'platform.operator', grants, grantables)).toBe(CELL_STATES.ANOMALY)
    expect(cellState('tenant.store.manage', 'tenant.owner', grants, grantables)).toBe(CELL_STATES.GRANTABLE)
    expect(cellState('ktv.session.open', 'platform.operator', grants, grantables)).toBe(CELL_STATES.FORBIDDEN)
  })

  it('按状态筛选与计数', () => {
    expect(rowHasCellState({ code: 'tenant.store.manage' }, roles, grants, grantables, CELL_STATES.ANOMALY)).toBe(true)
    expect(rowHasCellState({ code: 'ktv.session.open' }, roles, grants, grantables, CELL_STATES.ANOMALY)).toBe(false)
    const counts = countCellStates(rows, roles, grants, grantables)
    expect(counts[CELL_STATES.ANOMALY]).toBe(1)
    expect(counts[CELL_STATES.GRANTED]).toBe(2)
    expect(counts[CELL_STATES.GRANTABLE]).toBe(3)
    expect(counts[CELL_STATES.FORBIDDEN]).toBe(3)
  })

  it('授权查找为 O(1) 且缺省安全', () => {
    expect(hasGrant(grants, 'tenant.owner', 'order.view')).toBe(true)
    expect(hasGrant(grants, 'tenant.owner', 'ktv.session.open')).toBe(false)
    expect(hasGrant(grants, 'missing', 'order.view')).toBe(false)
    expect(hasGrant(null, 'tenant.owner', 'order.view')).toBe(false)
  })

  it('CSV 导出当前筛选行与角色列，状态可读且转义正确', () => {
    const csv = buildPermissionMatrixCsv(
      [{ ...rows[0], description: '查看,"订单"' }, rows[1]],
      roles,
      grants,
      grantables,
    )
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('权限编码,名称,模块,业务域,适用作用域,可授予,平台运营,租户老板,店长')
    expect(lines[1]).toContain('"查看,""订单"""')
    expect(lines[1]).toContain('已授予')
    expect(lines[2]).toContain('越界授权')
  })

  it('CSV 转义公式注入前缀', () => {
    const csv = buildPermissionMatrixCsv([{ ...rows[0], code: '=SUM(A1)' }], roles, grants, grantables)
    expect(csv).toContain("'=SUM(A1)")
  })
})
