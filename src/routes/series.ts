import { Hono } from 'hono'
import { getJson } from '../client.js'
import { mapItem, mapDetail } from '../mapper.js'
import { getEpisodeStream } from '../stream.js'
import { isSlug, parsePage, parsePositiveInt } from '../validate.js'
import { findSection, loadHomepage, mapSection } from '../homepage.js'
import { streamResponse } from '../streamResponse.js'
import type { MediaDetail } from '../types.js'
import * as cache from '../cache.js'

const app = new Hono()

/** Series detail, cached for 2 hours; null when upstream has no such series. */
async function loadDetail(slug: string): Promise<MediaDetail | null> {
  const key = `series.detail.${slug}`
  const cached = cache.get<MediaDetail>(key)
  if (cached) return cached

  const raw = await getJson<Record<string, unknown>>(`/api/series/${encodeURIComponent(slug)}`)
  if (!raw?.title) return null

  const detail = mapDetail(raw)
  if (detail) cache.set(key, detail, 2)
  return detail
}

/** Lowest regular season (skipping specials, season 0) that has episodes. */
function firstSeason(detail: MediaDetail): number | null {
  const seasons = (detail.seasons ?? [])
    .filter(s => s.season >= 1 && s.episodeCount > 0)
    .map(s => s.season)
  return seasons.length ? Math.min(...seasons) : null
}

app.get('/', async c => {
  const page = parsePage(c.req.query('page'))
  if (page === null) return c.json({ success: false, message: 'Invalid page' }, 400)

  const key = `series.page.${page}`
  const cached = cache.get(key)
  if (cached) return c.json({ success: true, data: cached })

  const data = await getJson<{ data: unknown[] }>(`/api/series?page=${page}&limit=36&sort=createdAt`)
  if (!data) return c.json({ success: false, message: 'Upstream error' }, 502)

  // /api/series items carry no contentType, so tell the mapper what they are.
  const items = (data.data ?? []).map(r => mapItem(r as Record<string, unknown>, 'series')).filter(Boolean)
  cache.set(key, items, 1)
  return c.json({ success: true, data: items })
})

app.get('/trending', async c => {
  const home = await loadHomepage()
  if (!home) return c.json({ success: false, message: 'Upstream error' }, 502)

  const section = findSection(home, 'trending') ?? home.above?.[0]
  return c.json({ success: true, data: mapSection(section).filter(i => i.type === 'series') })
})

app.get('/:slug', async c => {
  const slug = c.req.param('slug')
  if (!isSlug(slug)) return c.json({ success: false, message: 'Invalid slug' }, 400)

  const detail = await loadDetail(slug)
  if (!detail) return c.json({ success: false, message: 'Series not found' }, 404)
  return c.json({ success: true, data: detail })
})

app.get('/:slug/stream', async c => {
  const slug = c.req.param('slug')
  if (!isSlug(slug)) return c.json({ success: false, message: 'Invalid slug' }, 400)

  const detail = await loadDetail(slug)
  if (!detail) return c.json({ success: false, message: 'Series not found' }, 404)

  const season = firstSeason(detail)
  if (season === null) return c.json({ success: false, message: 'Series has no episodes' }, 404)

  return streamResponse(c, `series.stream.${slug}.s${season}e1`, opts => getEpisodeStream(slug, season, 1, opts))
})

app.get('/:slug/season/:season/episode/:episode/stream', c => {
  const slug = c.req.param('slug')
  if (!isSlug(slug)) return c.json({ success: false, message: 'Invalid slug' }, 400)

  const season = parsePositiveInt(c.req.param('season'), 1000)
  const episode = parsePositiveInt(c.req.param('episode'), 10_000)
  if (season === null || episode === null) {
    return c.json({ success: false, message: 'Season and episode must be positive integers' }, 400)
  }

  return streamResponse(c, `series.stream.${slug}.s${season}e${episode}`, opts => getEpisodeStream(slug, season, episode, opts))
})

export default app
