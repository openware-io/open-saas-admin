import { describe, expect, it } from 'vitest'
import { parseStoredJson } from './storage'

describe('parseStoredJson', () => {
  it('returns parsed JSON values', () => {
    expect(parseStoredJson('{"id":1}')).toEqual({ id: 1 })
  })

  it('returns the fallback for malformed storage values', () => {
    expect(parseStoredJson('{', { id: 0 })).toEqual({ id: 0 })
  })
})
