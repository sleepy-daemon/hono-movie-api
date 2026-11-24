import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  BASE_URL: 'https://upstream.test',
  getJson: vi.fn(),
  postJson: vi.fn(),
}))

import { getJson, postJson } from './client'
import { getEpisodeStream, getMovieStream } from './stream'

const getJsonMock = vi.mocked(getJson)
const postJsonMock = vi.mocked(postJson)

beforeEach(() => {
  vi.resetAllMocks()
  postJsonMock.mockResolvedValue(null)
})

describe('getEpisodeStream', () => {
  it('returns an empty result when the season object is missing', async () => {
    getJsonMock.mockResolvedValueOnce({ series: { id: 's1' } })
    await expect(getEpisodeStream('foo', 99, 1)).resolves.toMatchObject({ streamUrl: null })
  })

  it('encodes the slug in the upstream path', async () => {
    getJsonMock.mockResolvedValueOnce(null)
    await getEpisodeStream('a/b', 1, 1)
    expect(getJsonMock).toHaveBeenCalledWith('/api/series/a%2Fb/season/1')
  })
})

describe('getMovieStream', () => {
  it('returns the stream and passes a timeout signal to the redeem request', async () => {
    getJsonMock
      .mockResolvedValueOnce({ id: 'm1' }) // movie lookup
      .mockResolvedValueOnce({ gateToken: 't', unlockAt: 0, serverNow: 1000 }) // play-info, no wait
    postJsonMock
      .mockResolvedValueOnce(null) // view tracking
      .mockResolvedValueOnce({ claim: 'c', redeemUrl: 'https://redeem.test', title: 'T' })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://cdn.test/v.m3u8', subtitles: [] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await getMovieStream('m')
    expect(result).toMatchObject({ streamUrl: 'https://cdn.test/v.m3u8', title: 'T' })
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    vi.unstubAllGlobals()
  })

  it('logs instead of swallowing view-tracking failures', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    getJsonMock.mockResolvedValueOnce({ id: 'm1' }).mockResolvedValueOnce(null)
    postJsonMock.mockRejectedValueOnce(new Error('boom'))

    await getMovieStream('m')
    await new Promise(r => setImmediate(r))
    expect(err).toHaveBeenCalledWith('[stream] view tracking failed:', expect.any(Error))
    err.mockRestore()
  })
})
