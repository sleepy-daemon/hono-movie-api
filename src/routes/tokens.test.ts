import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../client', () => ({ BASE_URL: 'https://upstream.test', getJson: vi.fn(), postJson: vi.fn() }))
vi.mock('../stream', async () => {
  const actual = await vi.importActual<typeof import('../stream')>('../stream')
  return {
    ...actual,
    getMovieStream: vi.fn(),
    getEpisodeStream: vi.fn(),
  }
})

import tokens from './tokens.js'
import movies from './movies.js'
import { pool, _resetPool } from '../tokenPool.js'
import { getMovieStream, VerificationRequiredError } from '../stream.js'
import * as cache from '../cache.js'

const app = new Hono().route('/tokens', tokens).route('/movies', movies)

// A Turnstile-shaped token that passes isVerificationToken's regex.
const SAMPLE_TOKEN = '0.ABCdef' + 'x'.repeat(40)

beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  process.env.TOKEN_POOL_SECRET = 'test-secret'
  _resetPool()
  cache.clear()
  vi.mocked(getMovieStream).mockReset()
})

afterEach(() => { delete process.env.TOKEN_POOL_SECRET })

describe('POST /tokens', () => {
  it('rejects without the shared secret', async () => {
    const res = await app.request('/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: SAMPLE_TOKEN }),
    })
    expect(res.status).toBe(401)
    expect(await pool().size()).toBe(0)
  })

  it('returns 404 when the pool is disabled (no secret configured)', async () => {
    delete process.env.TOKEN_POOL_SECRET
    const res = await app.request('/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pool-secret': 'anything' },
      body: JSON.stringify({ token: SAMPLE_TOKEN }),
    })
    expect(res.status).toBe(404)
  })

  it('rejects malformed tokens', async () => {
    const res = await app.request('/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pool-secret': 'test-secret' },
      body: JSON.stringify({ token: 'has space' }),
    })
    expect(res.status).toBe(400)
  })

  it('accepts a valid token and queues it', async () => {
    const res = await app.request('/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pool-secret': 'test-secret' },
      body: JSON.stringify({ token: SAMPLE_TOKEN }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { pooled: true, size: 1 } })
    expect(await pool().size()).toBe(1)
  })
})

describe('GET /tokens', () => {
  it('reports pool depth without the secret', async () => {
    await pool().push(SAMPLE_TOKEN)
    await pool().push(SAMPLE_TOKEN + '2')
    const res = await app.request('/tokens')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { size: 2 } })
  })
})

describe('stream chain auto-pulls from the pool', () => {
  const ok = { streamUrl: 'u', subtitles: [], title: null, durationSec: null }
  const gate = (tokenRejected = false) =>
    new VerificationRequiredError({ siteKey: '0x4AAA', action: 'play', tokenRejected })

  it('silently uses a pooled token when the caller sends none', async () => {
    await pool().push(SAMPLE_TOKEN)
    vi.mocked(getMovieStream).mockResolvedValueOnce(ok)

    const res = await app.request('/movies/the-movie/stream')
    expect(res.status).toBe(200)
    expect(getMovieStream).toHaveBeenCalledWith('the-movie', { verificationToken: SAMPLE_TOKEN })
  })

  it('retries with another pooled token when the first is rejected', async () => {
    await pool().push(SAMPLE_TOKEN)
    await pool().push(SAMPLE_TOKEN + '2')
    vi.mocked(getMovieStream)
      .mockRejectedValueOnce(gate(true))
      .mockResolvedValueOnce(ok)

    const res = await app.request('/movies/the-movie/stream')
    expect(res.status).toBe(200)
    expect(getMovieStream).toHaveBeenCalledTimes(2)
  })

  it('falls back to 503 when the pool empties out', async () => {
    vi.mocked(getMovieStream).mockRejectedValue(gate(false))

    const res = await app.request('/movies/the-movie/stream')
    expect(res.status).toBe(503)
    expect((await res.json()).verification.siteKey).toBe('0x4AAA')
  })
})
