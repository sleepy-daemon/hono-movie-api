import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../client', () => ({ BASE_URL: 'https://upstream.test', getJson: vi.fn(), postJson: vi.fn() }))
vi.mock('../stream', async importOriginal => ({
  ...(await importOriginal<typeof import('../stream')>()),
  getMovieStream: vi.fn(),
  getEpisodeStream: vi.fn(),
}))

import { getJson } from '../client.js'
import { getEpisodeStream, getMovieStream, VerificationRequiredError } from '../stream.js'
import home from './home.js'
import leaderboard from './leaderboard.js'
import * as cache from '../cache.js'
import movies from './movies.js'
import series from './series.js'
import search from './search.js'
import browse from './browse.js'

const getJsonMock = vi.mocked(getJson)
const app = new Hono()
  .route('/', home)
  .route('/movies', movies)
  .route('/series', series)
  .route('/search', search)
  .route('/browse', browse)
  .route('/leaderboard', leaderboard)

beforeEach(() => {
  vi.resetAllMocks()
  cache.clear()
})

describe('input validation (no upstream call)', () => {
  it.each([
    ['/movies/..%2F..%2Fapi%2Fadmin', 'Invalid slug'],
    ['/movies?page=abc', 'Invalid page'],
    ['/movies/trending?page=999999', 'Invalid page'],
    ['/series/foo/season/abc/episode/1/stream', 'Season and episode must be positive integers'],
    ['/series/foo/season/0/episode/1/stream', 'Season and episode must be positive integers'],
    ['/browse/genre/action%26limit%3D100000', 'Invalid genre'],
    ['/browse/country/x%3Fy', 'Invalid country code'],
    ['/browse/year/20x1', 'Invalid year'],
    ['/browse/network/net%2Fflix', 'Invalid network'],
    ['/browse/network/netflix?page=0', 'Invalid page'],
    ['/home/recent?type=toString', 'Invalid type'],
    ['/series/..%2Fx/stream', 'Invalid slug'],
    ['/search?q=' + 'a'.repeat(101), 'Query too long (max 100 chars)'],
  ])('%s -> 400', async (url, message) => {
    const res = await app.request(url)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ success: false, message })
    expect(getJsonMock).not.toHaveBeenCalled()
  })
})

describe('upstream failures are not cached', () => {
  it.each([
    '/movies?page=7',
    '/series?page=7',
    '/browse/genres',
    '/browse/genre/action?page=7',
    '/search?q=fail',
    '/browse/networks',
    '/browse/network/hbo?page=7',
    '/leaderboard',
  ])(
    '%s -> 502, then recovers',
    async url => {
      getJsonMock.mockResolvedValueOnce(null)
      expect((await app.request(url)).status).toBe(502)

      getJsonMock.mockResolvedValueOnce({ data: [{ name: 'Action', slug: 'action', label: 'X' }], results: [] })
      const res = await app.request(url)
      expect(res.status).toBe(200)
      expect(getJsonMock).toHaveBeenCalledTimes(2)
    }
  )
})

describe('upstream query building', () => {
  it('builds filtered listing query strings safely', async () => {
    getJsonMock.mockResolvedValueOnce({ data: [] })
    await app.request('/browse/year/2021?type=series&page=2')
    expect(getJsonMock).toHaveBeenCalledWith('/api/series?year=2021&page=2&limit=36&sort=createdAt')
  })

  it('filters by network through /api/browse (the only upstream endpoint that honours it)', async () => {
    getJsonMock.mockResolvedValueOnce({ data: [{ slug: 'a', contentType: 'tv_series' }, { slug: 'b', contentType: 'movie' }] })
    const res = await app.request('/browse/network/netflix?page=2')
    expect(getJsonMock).toHaveBeenCalledWith('/api/browse?network=netflix&page=2&limit=36')
    expect((await res.json()).data.map((i: { type: string }) => i.type)).toEqual(['series', 'movie'])
  })
})

describe('browse networks', () => {
  it('maps upstream labels to names', async () => {
    getJsonMock.mockResolvedValueOnce({ data: [{ slug: 'netflix', label: 'Netflix', color: '#E50914' }] })
    const res = await app.request('/browse/networks')
    expect((await res.json()).data).toEqual([{ name: 'Netflix', slug: 'netflix' }])
  })
})

describe('series list', () => {
  it('labels items as series even though upstream omits contentType', async () => {
    getJsonMock.mockResolvedValueOnce({ data: [{ slug: 'show', title: 'Show' }] })
    const res = await app.request('/series?page=9')
    expect((await res.json()).data[0].type).toBe('series')
  })
})

describe('home sections', () => {
  const homepage = {
    above: [{ title: 'Featured', data: [{ slug: 'feat', contentType: 'movie' }] }],
    below: [
      { title: 'Recently Added Movies', data: [{ slug: 'new-movie', contentType: 'movie' }] },
      { title: 'Recently Added Series', data: [{ slug: 'new-show', contentType: 'tv_series' }] },
    ],
  }
  const slugs = async (url: string) => (await (await app.request(url)).json()).data.map((i: { slug: string }) => i.slug)

  it('serves featured, recent movies and recent series from one cached homepage fetch', async () => {
    getJsonMock.mockResolvedValue(homepage)
    expect(await slugs('/home/featured')).toEqual(['feat'])
    expect(await slugs('/home/recent')).toEqual(['new-movie'])
    expect(await slugs('/home/recent?type=series')).toEqual(['new-show'])
    expect(await slugs('/home/recent?type=episode')).toEqual([])
    expect(getJsonMock).toHaveBeenCalledTimes(1)
  })
})

describe('leaderboard', () => {
  it('maps titles and drops private user fields from posts', async () => {
    getJsonMock.mockResolvedValueOnce({
      month: '2026-11',
      topSeries: [{ slug: 's', contentType: 'tv_series' }],
      topComments: [
        {
          content: 'nice',
          monthlyUpvotes: 3,
          user: { username: 'u1', displayName: 'User', planType: 'free', bannedUntil: null },
          target: { type: 'movie', title: 'M', slug: 'm', posterPath: '/p.jpg' },
        },
      ],
    })
    const { data } = await (await app.request('/leaderboard')).json()
    expect(data.month).toBe('2026-11')
    expect(data.topSeries[0]).toMatchObject({ slug: 's', type: 'series' })
    expect(data.topMovies).toEqual([])
    expect(data.topComments).toEqual([
      { content: 'nice', rating: null, createdAt: null, upvotes: 3, author: 'User', target: { type: 'movie', title: 'M', slug: 'm' } },
    ])
  })
})

describe('stream misses fail fast', () => {
  const miss = { streamUrl: null, subtitles: [], title: null, durationSec: null }

  it('serves a cached 502 without re-running the movie chain', async () => {
    vi.mocked(getMovieStream).mockResolvedValue(miss)

    expect((await app.request('/movies/gated-film/stream')).status).toBe(502)
    expect((await app.request('/movies/gated-film/stream')).status).toBe(502)
    expect(getMovieStream).toHaveBeenCalledTimes(1)
  })

  it('serves a cached 502 without re-running the episode chain', async () => {
    vi.mocked(getEpisodeStream).mockResolvedValue(miss)

    expect((await app.request('/series/gated-show/season/1/episode/1/stream')).status).toBe(502)
    expect((await app.request('/series/gated-show/season/1/episode/1/stream')).status).toBe(502)
    expect(getEpisodeStream).toHaveBeenCalledTimes(1)
  })
})

describe('stream verification gate', () => {
  const ok = { streamUrl: 'u', subtitles: [], title: null, durationSec: null }
  const gate = () => new VerificationRequiredError({ siteKey: '0x4AAA', action: 'play' })

  it('returns 503 with the Turnstile site key on every attempt (no miss caching)', async () => {
    vi.mocked(getMovieStream).mockRejectedValue(gate())

    const res = await app.request('/movies/gated-by-turnstile/stream')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.message).toMatch(/human verification/)
    expect(body.verification).toEqual({ siteKey: '0x4AAA', action: 'play', tokenRejected: false })

    // No verification-miss caching: a later call retries so a pool refill or
    // new caller token immediately gets a shot at a stream URL.
    const again = await app.request('/movies/gated-by-turnstile/stream')
    expect(again.status).toBe(503)
    expect((await again.json()).verification.siteKey).toBe('0x4AAA')
    expect(getMovieStream).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['header', '/movies/gated/stream', { 'x-verification-token': 'tok' }],
    ['query', '/movies/gated/stream?verificationToken=tok', {}],
  ])('passes a caller-supplied token through the %s to the chain', async (_label, url, headers) => {
    vi.mocked(getMovieStream).mockRejectedValueOnce(gate()).mockResolvedValueOnce(ok)

    expect((await app.request('/movies/gated/stream')).status).toBe(503)
    const res = await app.request(url, { headers })
    expect(res.status).toBe(200)
    expect(getMovieStream).toHaveBeenLastCalledWith('gated', { verificationToken: 'tok' })
    // The resolved stream is cached for callers without a token too.
    expect((await app.request('/movies/gated/stream')).status).toBe(200)
  })

  it('passes the token to the episode chain', async () => {
    vi.mocked(getEpisodeStream).mockResolvedValueOnce(ok)
    const res = await app.request('/series/show/season/2/episode/3/stream', { headers: { 'x-verification-token': 'tok' } })
    expect(res.status).toBe(200)
    expect(getEpisodeStream).toHaveBeenCalledWith('show', 2, 3, { verificationToken: 'tok' })
  })

  it('returns 403 when upstream rejects the token, without caching it', async () => {
    vi.mocked(getMovieStream)
      .mockRejectedValueOnce(new VerificationRequiredError({ siteKey: '0x4AAA', action: 'play', tokenRejected: true }))
      .mockRejectedValueOnce(gate())

    const res = await app.request('/movies/gated/stream', { headers: { 'x-verification-token': 'stale' } })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.message).toMatch(/rejected/)
    expect(body.verification).toEqual({ siteKey: '0x4AAA', action: 'play', tokenRejected: true })
    expect((await app.request('/movies/gated/stream')).status).toBe(503)
    expect(getMovieStream).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['too long', '/movies/gated/stream?verificationToken=' + 'x'.repeat(2049), {}],
    ['whitespace', '/movies/gated/stream', { 'x-verification-token': 'has space' }],
  ])('rejects a malformed token with 400 (%s)', async (_label, url, headers) => {
    const res = await app.request(url, { headers })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ success: false, message: 'Invalid verification token' })
    expect(getMovieStream).not.toHaveBeenCalled()
  })

  it('lets other stream errors propagate', async () => {
    vi.mocked(getMovieStream).mockRejectedValue(new Error('boom'))
    const res = await app.request('/movies/exploding/stream')
    expect(res.status).toBe(500)
  })
})

describe('series first-episode stream', () => {
  const ok = { streamUrl: 'u', subtitles: [], title: null, durationSec: null }

  it('streams episode 1 of the first regular season, skipping specials', async () => {
    getJsonMock.mockResolvedValueOnce({
      title: 'Show',
      numberOfSeasons: 2,
      seasons: [
        { seasonNumber: 0, name: 'Specials', episodeCount: 3 },
        { seasonNumber: 2, name: 'S2', episodeCount: 8 },
        { seasonNumber: 1, name: 'S1', episodeCount: 10 },
      ],
    })
    vi.mocked(getEpisodeStream).mockResolvedValueOnce(ok)

    const res = await app.request('/series/show-with-specials/stream')
    expect(res.status).toBe(200)
    expect(getEpisodeStream).toHaveBeenCalledWith('show-with-specials', 1, 1, {})
  })

  it('returns 404 for unknown series or ones without episodes', async () => {
    getJsonMock.mockResolvedValueOnce(null)
    expect((await app.request('/series/missing-show/stream')).status).toBe(404)

    getJsonMock.mockResolvedValueOnce({ title: 'Empty', numberOfSeasons: 1, seasons: [{ seasonNumber: 1, episodeCount: 0 }] })
    const res = await app.request('/series/empty-show/stream')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ success: false, message: 'Series has no episodes' })
    expect(getEpisodeStream).not.toHaveBeenCalled()
  })
})

describe('episode stream', () => {
  it('passes parsed integers to getEpisodeStream', async () => {
    vi.mocked(getEpisodeStream).mockResolvedValueOnce({ streamUrl: 'u', subtitles: [], title: null, durationSec: null })
    const res = await app.request('/series/foo/season/2/episode/3/stream')
    expect(res.status).toBe(200)
    expect(getEpisodeStream).toHaveBeenCalledWith('foo', 2, 3, {})
  })
})
