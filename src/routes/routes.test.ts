import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../client', () => ({ BASE_URL: 'https://upstream.test', getJson: vi.fn(), postJson: vi.fn() }))
vi.mock('../stream', () => ({ getMovieStream: vi.fn(), getEpisodeStream: vi.fn() }))

import { getJson } from '../client'
import { getEpisodeStream } from '../stream'
import movies from './movies'
import series from './series'
import search from './search'
import browse from './browse'

const getJsonMock = vi.mocked(getJson)
const app = new Hono().route('/movies', movies).route('/series', series).route('/search', search).route('/browse', browse)

beforeEach(() => vi.resetAllMocks())

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
    ['/search?q=' + 'a'.repeat(101), 'Query too long (max 100 chars)'],
  ])('%s -> 400', async (url, message) => {
    const res = await app.request(url)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ success: false, message })
    expect(getJsonMock).not.toHaveBeenCalled()
  })
})

describe('upstream failures are not cached', () => {
  it.each(['/movies?page=7', '/series?page=7', '/browse/genres', '/browse/genre/action?page=7', '/search?q=fail'])(
    '%s -> 502, then recovers',
    async url => {
      getJsonMock.mockResolvedValueOnce(null)
      expect((await app.request(url)).status).toBe(502)

      getJsonMock.mockResolvedValueOnce({ data: [{ name: 'Action', slug: 'action' }], results: [] })
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
})

describe('episode stream', () => {
  it('passes parsed integers to getEpisodeStream', async () => {
    vi.mocked(getEpisodeStream).mockResolvedValueOnce({ streamUrl: 'u', subtitles: [], title: null, durationSec: null })
    const res = await app.request('/series/foo/season/2/episode/3/stream')
    expect(res.status).toBe(200)
    expect(getEpisodeStream).toHaveBeenCalledWith('foo', 2, 3)
  })
})
