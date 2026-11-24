import { describe, it, expect, beforeEach } from 'vitest'
import { pool, _resetPool } from './tokenPool.js'

describe('token pool (in-memory backend)', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    _resetPool()
  })

  it('returns tokens in FIFO order', async () => {
    const p = pool()
    await p.push('a'); await p.push('b'); await p.push('c')
    expect(await p.pop()).toBe('a')
    expect(await p.pop()).toBe('b')
    expect(await p.pop()).toBe('c')
    expect(await p.pop()).toBeNull()
  })

  it('reports size', async () => {
    const p = pool()
    expect(await p.size()).toBe(0)
    await p.push('x')
    expect(await p.size()).toBe(1)
    await p.pop()
    expect(await p.size()).toBe(0)
  })

  it('caps the backlog so a flood does not grow forever', async () => {
    const p = pool()
    for (let i = 0; i < 80; i++) await p.push(`t${i}`)
    // Default MAX is 50 (tokenPool.ts); oldest entries get dropped to stay under.
    expect(await p.size()).toBeLessThanOrEqual(50)
    const first = await p.pop()
    // t30 is the oldest that would survive a trim from 80 down to 50.
    expect(first).toMatch(/^t3\d$/)
  })
})
