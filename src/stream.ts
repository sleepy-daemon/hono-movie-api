import { getJson, postJson, postJsonResult, forkCookieJar, requestUrl, BASE_URL } from './client.js'
import type { StreamResult } from './types.js'

const UA = 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36'

const REDEEM_TIMEOUT_MS = 30_000

const empty = (): StreamResult => ({ streamUrl: null, subtitles: [], title: null, durationSec: null })

export type StreamOptions = {
  /** Turnstile token a person solved for the upstream site key; sent with the claim. */
  verificationToken?: string
}

export type VerificationDetails = { siteKey: string; action: string; tokenRejected?: boolean }

// Action the upstream player renders its Turnstile widget with.
const TURNSTILE_ACTION = 'play'

/**
 * Upstream gates playback behind a human check (Cloudflare Turnstile). This API
 * never solves it: it hands the site key to the caller, who can have a person
 * complete the widget and retry with the token (see StreamOptions).
 */
export class VerificationRequiredError extends Error {
  readonly siteKey: string
  readonly action: string
  /** True when a token was supplied but upstream refused it (expired, reused or invalid). */
  readonly tokenRejected: boolean

  constructor({ siteKey, action, tokenRejected = false }: VerificationDetails) {
    super(
      tokenRejected
        ? 'Upstream rejected the verification token'
        : 'Upstream requires human verification (Turnstile) before playback'
    )
    this.name = 'VerificationRequiredError'
    this.siteKey = siteKey
    this.action = action
    this.tokenRejected = tokenRejected
  }
}

function errorCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const b = body as { code?: unknown; error?: { code?: unknown } }
  const code = b.code ?? b.error?.code
  return typeof code === 'string' ? code : undefined
}

function fail(step: string, detail: string): StreamResult {
  console.warn(`[stream] ${step}: ${detail}`)
  return empty()
}

export async function getMovieStream(slug: string, opts: StreamOptions = {}): Promise<StreamResult> {
  const movie = await getJson<{ id: string }>(`/api/movies/${encodeURIComponent(slug)}`)
  if (!movie?.id) return fail('movie lookup', `no id for slug "${slug}"`)

  postJson('/api/views/track', { contentType: 'movie', contentId: movie.id })
    .catch(err => console.error('[stream] view tracking failed:', err))

  return runChain('movie', movie.id, opts)
}

export async function getEpisodeStream(
  slug: string,
  season: number,
  episode: number,
  opts: StreamOptions = {}
): Promise<StreamResult> {
  const data = await getJson<{
    series: { id: string }
    season?: { episodes?: { episodeNumber: number; id: string }[] }
  }>(`/api/series/${encodeURIComponent(slug)}/season/${season}`)

  if (!data?.series?.id) return fail('series lookup', `no series id for "${slug}" season ${season}`)

  const ep = data.season?.episodes?.find(e => e.episodeNumber === episode)
  if (!ep?.id) return fail('episode lookup', `episode ${episode} not found in season ${season}`)

  postJson('/api/views/track', { contentType: 'tv_series', contentId: data.series.id, episodeId: ep.id })
    .catch(err => console.error('[stream] view tracking failed:', err))

  return runChain('episode', ep.id, opts)
}

async function runChain(type: 'movie' | 'episode', uuid: string, opts: StreamOptions): Promise<StreamResult> {
  // Playback session cookies must survive play-info -> claim -> redeem, isolated per request.
  const cookieJar = await forkCookieJar()

  const playInfo = await getJson<{
    gateToken: string
    unlockAt: number
    serverNow: number
    verification?: { siteKey?: string }
  }>(`/api/watch/play-info/${type}/${encodeURIComponent(uuid)}`, { cookieJar })
  if (!playInfo?.gateToken) return fail('play-info', `no gate token for ${type} ${uuid}`)

  // The claim is rejected (403 VERIFICATION_REQUIRED) without a solved Turnstile
  // token, so bail now instead of waiting out the countdown for nothing. The
  // route layer handles the pool fallback and 503 response.
  const siteKey = playInfo.verification?.siteKey
  const token = siteKey ? opts.verificationToken : undefined
  if (siteKey && !token) throw new VerificationRequiredError({ siteKey, action: TURNSTILE_ACTION })

  const wait = Math.min(Math.max(0, (playInfo.unlockAt - playInfo.serverNow) + 500), 20_000)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))

  const claim = await postJsonResult<{ claim: string; redeemUrl: string; title?: string; durationSec?: number }>(
    '/api/watch/session/claim',
    { gateToken: playInfo.gateToken, ...(token ? { verificationToken: token } : {}) },
    { cookieJar }
  )
  if (!claim.ok) {
    if (siteKey && errorCode(claim.data) === 'VERIFICATION_REQUIRED') {
      throw new VerificationRequiredError({ siteKey, action: TURNSTILE_ACTION, tokenRejected: true })
    }
    return fail('claim', `HTTP ${claim.status}${errorCode(claim.data) ? ` ${errorCode(claim.data)}` : ''}`)
  }
  const claimed = claim.data
  if (!claimed?.claim || !claimed?.redeemUrl) return fail('claim', 'no claim or redeem URL returned')

  // Upstream now returns redeemUrl as a relative path on the same host
  // (e.g. "/watch/session/redeem"), where plain fetch gets a 403 because
  // Cloudflare is in front; route through got-scraping (same TLS spoofing
  // we use for play-info and claim). Their frontend rewrites the path to
  // add the /api/ prefix the real endpoint lives under, so we do the same.
  // Older upstream versions handed back an absolute majorplay.net URL with
  // no CF — that path still works below for backwards compatibility.
  const normalizedRedeem = (() => {
    if (/^https?:\/\//i.test(claimed.redeemUrl)) return claimed.redeemUrl
    const path = claimed.redeemUrl.startsWith('/api/')
      ? claimed.redeemUrl
      : `/api${claimed.redeemUrl.startsWith('/') ? '' : '/'}${claimed.redeemUrl}`
    return new URL(path, BASE_URL).toString()
  })()
  const redeemUrl = normalizedRedeem
  const sameHost = (() => {
    try { return new URL(redeemUrl).host === new URL(BASE_URL).host }
    catch { return false }
  })()

  let playData: { url?: string; subtitles?: { lang: string; label: string; path: string }[] } | null = null
  const baseHeaders = {
    accept: 'application/json, */*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    origin: BASE_URL,
    referer: `${BASE_URL}/`,
    'user-agent': UA,
  }
  if (sameHost) {
    // Same-host IDLIX redeem speaks JSON like the rest of their API, and
    // requires a `mode` field — "browser" matches what their own player
    // sends and routes to a majorplay.net config URL in the response.
    const res = await requestUrl(redeemUrl, {
      method: 'POST',
      body: JSON.stringify({ claim: claimed.claim, mode: 'browser' }),
      headers: { ...baseHeaders, 'content-type': 'application/json' },
      cookieJar,
    })
    if (res.ok) {
      try { playData = JSON.parse(res.text) }
      catch (err) { console.error('[stream] redeem: invalid JSON', err) }
    }
  } else {
    // Legacy path: redeemUrl on a third-party host (e.g. majorplay.net) with
    // no CF in front — plain fetch is correct, and content-type text/plain is
    // a known majorplay.net quirk. Avoids pulling in unrelated cookies from
    // the shared jar.
    try {
      const cookie = await cookieJar.getCookieString(redeemUrl)
      const res = await fetch(redeemUrl, {
        method: 'POST',
        headers: { ...baseHeaders, 'content-type': 'text/plain', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ claim: claimed.claim }),
        signal: AbortSignal.timeout(REDEEM_TIMEOUT_MS),
      })
      if (res.ok) playData = await res.json()
      else console.error(`[stream] redeem returned HTTP ${res.status}`)
    } catch (err) {
      console.error('[stream] redeem failed:', err)
    }
  }

  if (!playData?.url) return fail('redeem', 'no stream URL returned')

  return {
    streamUrl: playData.url,
    subtitles: (playData.subtitles ?? []).map(s => ({ lang: s.lang, label: s.label, url: s.path })),
    title: claimed.title ?? null,
    durationSec: claimed.durationSec ?? null,
  }
}
