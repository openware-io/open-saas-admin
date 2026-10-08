import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

describe('后台侧栏完整展示守卫', () => {
  it('菜单使用剩余高度滚动，不再按视口减固定头部后被上下文面板裁切', async () => {
    const source = await readFile(new URL('../layout/AdminLayout.vue', import.meta.url), 'utf8')
    expect(source).toContain('flex-direction: column')
    expect(source).toContain('flex: 1 1 auto')
    expect(source).toContain('min-height: 0')
    expect(source).not.toContain('height: calc(100vh - var(--header-height))')
  })

  it('菜单保留可见的细滚动条反馈', async () => {
    const source = await readFile(new URL('../layout/AdminLayout.vue', import.meta.url), 'utf8')
    expect(source).toContain('scrollbar-width: thin')
    expect(source).toContain('width: 6px')
    expect(source).not.toContain('.sidebar-menu::-webkit-scrollbar {\n  width: 0;')
  })
})
