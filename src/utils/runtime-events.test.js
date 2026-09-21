import { describe, expect, it, vi } from 'vitest'
import { SESSION_EXPIRED_EVENT, emitRuntimeEvent } from './runtime-events'

describe('运行时事件（让 api 层不依赖 stores）', () => {
  it('非浏览器环境（单测/SSR）空转不抛错', () => {
    expect(() => emitRuntimeEvent(SESSION_EXPIRED_EVENT)).not.toThrow()
  })

  it('有 window 时按同名事件派发', () => {
    const target = { dispatchEvent: vi.fn() }
    vi.stubGlobal('window', target)
    try {
      emitRuntimeEvent(SESSION_EXPIRED_EVENT)
      expect(target.dispatchEvent).toHaveBeenCalledTimes(1)
      expect(target.dispatchEvent.mock.calls[0][0].type).toBe(SESSION_EXPIRED_EVENT)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
