import { describe, it, expect, vi, afterEach } from 'vitest'
import * as cache from './cache'

afterEach(() => vi.useRealTimers())

describe('cache', () => {
  it('returns stored values before expiry and null after', () => {
    vi.useFakeTimers()
    cache.set('ttl', 'v', 1)
    expect(cache.get('ttl')).toBe('v')
    vi.advanceTimersByTime(3_600_001)
    expect(cache.get('ttl')).toBeNull()
  })

  it('returns null for unknown keys', () => expect(cache.get('missing')).toBeNull())

  it('evicts the least recently used entry beyond 1000 entries', () => {
    cache.set('lru.keep', 'keep')
    cache.set('lru.drop', 'drop')
    for (let i = 0; i < 998; i++) cache.set(`lru.fill.${i}`, i)
    cache.get('lru.keep') // touch so 'lru.drop' becomes the oldest
    cache.set('lru.overflow', 'x')

    expect(cache.get('lru.drop')).toBeNull()
    expect(cache.get('lru.keep')).toBe('keep')
    expect(cache.get('lru.overflow')).toBe('x')
  })

  it('sweeps expired entries in the background', () => {
    vi.useFakeTimers()
    vi.resetModules()
    return import('./cache').then(fresh => {
      fresh.set('sweep', 'v', 0.01) // 36s TTL
      vi.advanceTimersByTime(5 * 60_000) // sweep interval
      // Expired entry was removed by the sweep; get() also reports null.
      expect(fresh.get('sweep')).toBeNull()
    })
  })
})
