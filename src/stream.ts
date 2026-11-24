import { getJson, postJson, BASE_URL } from './client'
import type { StreamResult } from './types'

const UA = 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36'

const REDEEM_TIMEOUT_MS = 30_000

const empty = (): StreamResult => ({ streamUrl: null, subtitles: [], title: null, durationSec: null })

export async function getMovieStream(slug: string): Promise<StreamResult> {
  const movie = await getJson<{ id: string }>(`/api/movies/${encodeURIComponent(slug)}`)
  if (!movie?.id) return empty()

  postJson('/api/views/track', { contentType: 'movie', contentId: movie.id })
    .catch(err => console.error('[stream] view tracking failed:', err))

  return runChain('movie', movie.id, `${BASE_URL}/movie/${encodeURIComponent(slug)}`)
}

export async function getEpisodeStream(slug: string, season: number, episode: number): Promise<StreamResult> {
  const data = await getJson<{
    series: { id: string }
    season?: { episodes?: { episodeNumber: number; id: string }[] }
  }>(`/api/series/${encodeURIComponent(slug)}/season/${season}`)

  if (!data?.series?.id) return empty()

  const ep = data.season?.episodes?.find(e => e.episodeNumber === episode)
  if (!ep?.id) return empty()

  const referer = `${BASE_URL}/series/${encodeURIComponent(slug)}/season/${season}/episode/${episode}`
  postJson('/api/views/track', { contentType: 'tv_series', contentId: data.series.id, episodeId: ep.id })
    .catch(err => console.error('[stream] view tracking failed:', err))

  return runChain('episode', ep.id, referer)
}

async function runChain(type: 'movie' | 'episode', uuid: string, referer: string): Promise<StreamResult> {
  const playInfo = await getJson<{ gateToken: string; unlockAt: number; serverNow: number }>(
    `/api/watch/play-info/${type}/${encodeURIComponent(uuid)}`
  )
  if (!playInfo?.gateToken) return empty()

  const wait = Math.min(Math.max(0, (playInfo.unlockAt - playInfo.serverNow) + 500), 20_000)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))

  const claimed = await postJson<{ claim: string; redeemUrl: string; title?: string; durationSec?: number }>(
    '/api/watch/session/claim',
    { gateToken: playInfo.gateToken }
  )
  if (!claimed?.claim || !claimed?.redeemUrl) return empty()

  let playData: { url?: string; subtitles?: { lang: string; label: string; path: string }[] } | null = null
  try {
    const res = await fetch(claimed.redeemUrl, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'text/plain',
        origin: BASE_URL,
        referer: `${BASE_URL}/`,
        'user-agent': UA,
      },
      body: JSON.stringify({ claim: claimed.claim }),
      signal: AbortSignal.timeout(REDEEM_TIMEOUT_MS),
    })
    if (res.ok) playData = await res.json()
    else console.error(`[stream] redeem returned HTTP ${res.status}`)
  } catch (err) {
    console.error('[stream] redeem failed:', err)
  }

  if (!playData?.url) return empty()

  return {
    streamUrl: playData.url,
    subtitles: (playData.subtitles ?? []).map(s => ({ lang: s.lang, label: s.label, url: s.path })),
    title: claimed.title ?? null,
    durationSec: claimed.durationSec ?? null,
  }
}
