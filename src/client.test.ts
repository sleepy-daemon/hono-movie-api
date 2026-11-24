import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const gotMock = vi.fn()
vi.mock('got-scraping', () => ({ gotScraping: gotMock }))

import { CookieJar } from 'tough-cookie'
import { request, getJson, postJson, postJsonResult, forkCookieJar } from './client'

let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  gotMock.mockReset()
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errSpy.mockRestore()
})

describe('request', () => {
  it('logs the status and body of a non-OK upstream response', async () => {
    gotMock.mockResolvedValue({ statusCode: 400, body: '{"error":"Invalid playback session"}' })

    const res = await request('/api/watch/session/claim', { method: 'POST' })

    expect(res).toMatchObject({ status: 400, ok: false })
    expect(errSpy).toHaveBeenCalledWith(
      '[client] POST /api/watch/session/claim: HTTP 400',
      '{"error":"Invalid playback session"}'
    )
  })

  it('truncates long error bodies', async () => {
    gotMock.mockResolvedValue({ statusCode: 503, body: 'x'.repeat(1000) })

    await request('/api/movies')

    const body = errSpy.mock.calls[0][1] as string
    expect(body.length).toBeLessThanOrEqual(201)
  })

  it('does not log successful responses', async () => {
    gotMock.mockResolvedValue({ statusCode: 200, body: '{}' })

    await expect(postJson('/api/x', {})).resolves.toEqual({})
    expect(errSpy).not.toHaveBeenCalled()
  })
})

describe('postJsonResult', () => {
  it('returns the status and parsed body of an error response', async () => {
    gotMock.mockResolvedValue({ statusCode: 403, body: '{"code":"VERIFICATION_REQUIRED"}' })

    await expect(postJsonResult('/api/watch/session/claim', {})).resolves.toEqual({
      ok: false,
      status: 403,
      data: { code: 'VERIFICATION_REQUIRED' },
    })
  })

  it('returns ok with the parsed body on success', async () => {
    gotMock.mockResolvedValue({ statusCode: 200, body: '{"claim":"c"}' })
    await expect(postJsonResult('/api/x', {})).resolves.toEqual({ ok: true, status: 200, data: { claim: 'c' } })
  })
})

describe('cookie jar', () => {
  const jarFromCall = (i: number) => gotMock.mock.calls[i][0].cookieJar as CookieJar

  it('sends every request through the same shared jar by default', async () => {
    gotMock.mockResolvedValue({ statusCode: 200, body: '{}' })

    await getJson('/api/a')
    await postJson('/api/b', {})

    expect(jarFromCall(0)).toBeInstanceOf(CookieJar)
    expect(jarFromCall(1)).toBe(jarFromCall(0))
  })

  it('uses the jar passed by the caller', async () => {
    gotMock.mockResolvedValue({ statusCode: 200, body: '{}' })
    const jar = new CookieJar()

    await getJson('/api/a', { cookieJar: jar })
    await postJson('/api/b', {}, { cookieJar: jar })

    expect(jarFromCall(0)).toBe(jar)
    expect(jarFromCall(1)).toBe(jar)
  })

  it('forks carry shared cookies but keep their own changes isolated', async () => {
    gotMock.mockResolvedValue({ statusCode: 200, body: '{}' })
    await request('/api/a')
    const shared = jarFromCall(0)
    await shared.setCookie('clearance=yes; Path=/', 'https://upstream.test/')

    const fork = await forkCookieJar()
    await fork.setCookie('session=abc; Path=/', 'https://upstream.test/')

    expect(await fork.getCookieString('https://upstream.test/')).toContain('clearance=yes')
    expect(await shared.getCookieString('https://upstream.test/')).toBe('clearance=yes')
  })
})
