import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { installChunkReloadGuard, isChunkLoadError, reloadOnceForNewVersion } from './chunk-reload'

/**
 * 「点菜单没反应」的根因守卫：发版后旧页面懒加载已删除的 chunk → 自动刷新一次拿新版本。
 *
 * 这条来自门店实测：控制台报 `Failed to fetch dynamically imported module`，
 * 界面上就是左侧菜单点了没反应（路由懒加载 404）。
 */
describe('陈旧 chunk 自救（发版后点菜单没反应）', () => {
  it('识别浏览器对动态 import 失败的几种措辞', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/assets/a-1.js'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError('error loading dynamically imported module')).toBe(true)
    expect(isChunkLoadError(new Error('Network Error'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })

  it('触发一次刷新；10 秒内重复触发只刷一次（防无限刷新）', () => {
    const store = new Map()
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
    const reload = vi.fn()

    expect(reloadOnceForNewVersion(storage, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    // 立刻再触发（同一标签页）不重复刷新
    expect(reloadOnceForNewVersion(storage, reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('sessionStorage 不可用（隐私模式）也要刷新，不能留死页面', () => {
    const reload = vi.fn()
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(reloadOnceForNewVersion(broken, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('router.onError 与 unhandledrejection 都接上守卫', () => {
    const handlers = {}
    const router = { onError: (fn) => { handlers.router = fn } }
    const listeners = {}
    const originalWindow = globalThis.window
    globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn } }
    try {
      installChunkReloadGuard(router)
    } finally {
      globalThis.window = originalWindow
    }
    expect(typeof handlers.router).toBe('function')
    expect(typeof listeners.unhandledrejection).toBe('function')
  })

  it('main.js 装上了守卫（不装就等于没修）', async () => {
    const source = await readFile(fileURLToPath(new URL('../main.js', import.meta.url)), 'utf8')
    expect(source).toContain('installChunkReloadGuard(router)')
  })
})
