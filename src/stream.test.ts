import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CookieJar } from 'tough-cookie'

vi.mock('./client', () => ({
  BASE_URL: 'https://upstream.test',
  getJson: vi.fn(),
  postJson: vi.fn(),
  postJsonResult: vi.fn(),
  forkCookieJar: vi.fn(),
}))

import { getJson, postJson, postJsonResult, forkCookieJar } from './client'
import { getEpisodeStream, getMovieStream, VerificationRequiredError } from './stream'

const getJsonMock = vi.mocked(getJson)
const postJsonMock = vi.mocked(postJson)
const postJsonResultMock = vi.mocked(postJsonResult)
const claimOk = (data: object) => ({ ok: true, status: 200, data })
const forkCookieJarMock = vi.mocked(forkCookieJar)

beforeEach(() => {
  vi.resetAllMocks()
  postJsonMock.mockResolvedValue(null)
  postJsonResultMock.mockResolvedValue({ ok: false, status: 0, data: null })
  forkCookieJarMock.mockImplementation(async () => new CookieJar())
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
    postJsonResultMock.mockResolvedValueOnce(claimOk({ claim: 'c', redeemUrl: 'https://redeem.test', title: 'T' }))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://cdn.test/v.m3u8', subtitles: [] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await getMovieStream('m')
    expect(result).toMatchObject({ streamUrl: 'https://cdn.test/v.m3u8', title: 'T' })
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    vi.unstubAllGlobals()
  })

  it('runs play-info, claim and redeem on one forked session jar', async () => {
    const jar = new CookieJar()
    await jar.setCookie('session=abc; Path=/', 'https://redeem.test/')
    forkCookieJarMock.mockResolvedValueOnce(jar)
    getJsonMock
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({ gateToken: 't', unlockAt: 0, serverNow: 1000 })
    postJsonResultMock.mockResolvedValueOnce(claimOk({ claim: 'c', redeemUrl: 'https://redeem.test/r' }))
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await getMovieStream('m')

    expect(getJsonMock).toHaveBeenNthCalledWith(1, '/api/movies/m') // lookup stays on the shared jar
    expect(getJsonMock).toHaveBeenNthCalledWith(2, '/api/watch/play-info/movie/m1', { cookieJar: jar })
    expect(postJsonResultMock).toHaveBeenCalledWith('/api/watch/session/claim', { gateToken: 't' }, { cookieJar: jar })
    expect(fetchMock.mock.calls[0][1].headers.cookie).toBe('session=abc')
    vi.unstubAllGlobals()
  })

  it('stops before claiming when play-info demands Turnstile verification', async () => {
    getJsonMock
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({
        gateToken: 't',
        unlockAt: Date.now() + 15_000, // would otherwise wait out the countdown
        serverNow: Date.now(),
        verification: { siteKey: '0x4AAA', action: 'play' },
      })

    const err = await getMovieStream('m').catch(e => e)
    expect(err).toBeInstanceOf(VerificationRequiredError)
    expect(err).toMatchObject({ siteKey: '0x4AAA', action: 'play', tokenRejected: false })
    expect(postJsonResultMock).not.toHaveBeenCalled()
  })

  it('sends a caller-supplied verification token with the claim', async () => {
    getJsonMock
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({ gateToken: 't', unlockAt: 0, serverNow: 1000, verification: { siteKey: '0x4AAA' } })
    postJsonResultMock.mockResolvedValueOnce(claimOk({ claim: 'c', redeemUrl: 'https://redeem.test' }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://cdn.test/v.m3u8' }), { status: 200 })
    ))

    await expect(getMovieStream('m', { verificationToken: 'tok' })).resolves.toMatchObject({
      streamUrl: 'https://cdn.test/v.m3u8',
    })
    expect(postJsonResultMock).toHaveBeenCalledWith(
      '/api/watch/session/claim',
      { gateToken: 't', verificationToken: 'tok' },
      expect.anything()
    )
    vi.unstubAllGlobals()
  })

  it('does not send a token when upstream does not ask for verification', async () => {
    getJsonMock
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({ gateToken: 't', unlockAt: 0, serverNow: 1000 })

    await getMovieStream('m', { verificationToken: 'tok' })
    expect(postJsonResultMock).toHaveBeenCalledWith('/api/watch/session/claim', { gateToken: 't' }, expect.anything())
  })

  it.each([
    ['top-level', { code: 'VERIFICATION_REQUIRED' }],
    ['nested', { error: { code: 'VERIFICATION_REQUIRED' } }],
  ])('reports a token upstream rejects (%s error code)', async (_label, body) => {
    getJsonMock
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({ gateToken: 't', unlockAt: 0, serverNow: 1000, verification: { siteKey: '0x4AAA' } })
    postJsonResultMock.mockResolvedValueOnce({ ok: false, status: 403, data: body })

    const err = await getMovieStream('m', { verificationToken: 'stale' }).catch(e => e)
    expect(err).toBeInstanceOf(VerificationRequiredError)
    expect(err).toMatchObject({ siteKey: '0x4AAA', action: 'play', tokenRejected: true })
  })

  it('treats other claim failures as an ordinary miss', async () => {
    getJsonMock
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({ gateToken: 't', unlockAt: 0, serverNow: 1000, verification: { siteKey: '0x4AAA' } })
    postJsonResultMock.mockResolvedValueOnce({ ok: false, status: 429, data: { code: 'PLAYBACK_TITLE_LIMIT' } })

    await expect(getMovieStream('m', { verificationToken: 'tok' })).resolves.toMatchObject({ streamUrl: null })
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
