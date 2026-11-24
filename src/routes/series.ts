import { Hono } from 'hono'
import { getJson } from '../client'
import { mapItem, mapDetail } from '../mapper'
import { getEpisodeStream } from '../stream'
import { isSlug, parsePage, parsePositiveInt } from '../validate'
import * as cache from '../cache'

const app = new Hono()

app.get('/', async c => {
  const page = parsePage(c.req.query('page'))
  if (page === null) return c.json({ success: false, message: 'Invalid page' }, 400)

  const key = `series.page.${page}`
  const cached = cache.get(key)
  if (cached) return c.json({ success: true, data: cached })

  const data = await getJson<{ data: unknown[] }>(`/api/series?page=${page}&limit=36&sort=createdAt`)
  if (!data) return c.json({ success: false, message: 'Upstream error' }, 502)

  const items = (data.data ?? []).map(r => mapItem(r as Record<string, unknown>)).filter(Boolean)
  cache.set(key, items, 1)
  return c.json({ success: true, data: items })
})

app.get('/trending', async c => {
  const cached = cache.get('series.trending')
  if (cached) return c.json({ success: true, data: cached })

  const data = await getJson<{ above?: { title?: string; data: unknown[] }[] }>('/api/homepage')
  if (!data) return c.json({ success: false, message: 'Upstream error' }, 502)

  const section = (data.above ?? []).find(s => s.title?.toLowerCase().includes('trending'))
  const items = ((section ?? data.above?.[0])?.data ?? [])
    .map(r => mapItem(r as Record<string, unknown>))
    .filter(i => i?.type === 'series')
  cache.set('series.trending', items, 1)
  return c.json({ success: true, data: items })
})

app.get('/:slug', async c => {
  const slug = c.req.param('slug')
  if (!isSlug(slug)) return c.json({ success: false, message: 'Invalid slug' }, 400)

  const key = `series.detail.${slug}`
  const cached = cache.get(key)
  if (cached) return c.json({ success: true, data: cached })

  const raw = await getJson<Record<string, unknown>>(`/api/series/${encodeURIComponent(slug)}`)
  if (!raw?.title) return c.json({ success: false, message: 'Series not found' }, 404)

  const detail = mapDetail(raw)
  cache.set(key, detail, 2)
  return c.json({ success: true, data: detail })
})

app.get('/:slug/season/:season/episode/:episode/stream', async c => {
  const slug = c.req.param('slug')
  if (!isSlug(slug)) return c.json({ success: false, message: 'Invalid slug' }, 400)

  const season = parsePositiveInt(c.req.param('season'), 1000)
  const episode = parsePositiveInt(c.req.param('episode'), 10_000)
  if (season === null || episode === null) {
    return c.json({ success: false, message: 'Season and episode must be positive integers' }, 400)
  }

  const key = `series.stream.${slug}.s${season}e${episode}`
  const cached = cache.get(key)
  if (cached) return c.json({ success: true, data: cached })

  const result = await getEpisodeStream(slug, season, episode)
  if (!result.streamUrl) return c.json({ success: false, message: 'Stream unavailable' }, 502)

  cache.set(key, result, 0.25)
  return c.json({ success: true, data: result })
})

export default app
