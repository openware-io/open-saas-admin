import { describe, expect, it } from 'vitest'
import { resolveIcon } from './icon'

describe('菜单图标唯一性', () => {
  it('同一组运营菜单的重复 icon 码会解析成不同图标', () => {
    const codes = [
      'store.resource',
      'store.stock',
      'store.crm',
      'store.settings',
      'tenant.finance',
      'tenant.iam',
      'tenant.wallet-token-config',
      'tenant.settings',
      'ktv',
      'pricing',
    ]
    const names = codes.map((code) => resolveIcon('setting', code).name)
    expect(new Set(names).size).toBe(codes.length)
  })

  it('前端自有菜单的 Element Plus 组件名不会被回落到菜单默认图标', () => {
    const hotelIcons = ['OfficeBuilding', 'Setting', 'Tickets', 'User', 'Box', 'DataAnalysis']
    const names = hotelIcons.map((name) => resolveIcon(name).name)
    expect(new Set(names).size).toBe(hotelIcons.length)
    expect(names).not.toContain('Menu')
  })
})
