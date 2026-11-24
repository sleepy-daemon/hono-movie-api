import { Hono } from 'hono'
import type { Context } from 'hono'
import { getJson } from '../client.js'
import { mapItem } from '../mapper.js'
import { isSlug, isYear, parsePage } from '../validate.js'
import * as cache from '../cache.js'

const app = new Hono()

const upstreamError = (c: Context) => c.json({ success: false, message: 'Upstream error' }, 502)

app.get('/genres', async c => {
  const cached = cache.get('genres')
  if (cached) return c.json({ success: true, data: cached })

  const data = await getJson<{ data: { name: string; slug: string }[] }>('/api/genres')
  if (!data) return upstreamError(c)

  const items = (data.data ?? []).map(g => ({ name: g.name, slug: g.slug }))
  cache.set('genres', items, 24)
  return c.json({ success: true, data: items })
})

app.get('/countries', async c => {
  const cached = cache.get('countries')
  if (cached) return c.json({ success: true, data: cached })

  const data = await getJson<{ data: { name: string; code: string }[] }>('/api/browse/countries')
  if (!data) return upstreamError(c)

  const items = (data.data ?? []).map(c => ({ name: c.name, code: c.code }))
  cache.set('countries', items, 24)
  return c.json({ success: true, data: items })
})

app.get('/years', async c => {
  const cached = cache.get('years')
  if (cached) return c.json({ success: true, data: cached })

  const data = await getJson<{ data: string[] }>('/api/browse/years')
  if (!data) return upstreamError(c)

  const items = (data.data ?? []).map(y => parseInt(y, 10)).filter(Boolean)
  cache.set('years', items, 24)
  return c.json({ success: true, data: items })
})

app.get('/networks', async c => {
  const cached = cache.get('networks')
  if (cached) return c.json({ success: true, data: cached })

  const data = await getJson<{ data: { label: string; slug: string }[] }>('/api/browse/networks')
  if (!data) return upstreamError(c)

  const items = (data.data ?? []).map(n => ({ name: n.label, slug: n.slug }))
  cache.set('networks', items, 24)
  return c.json({ success: true, data: items })
})

// Upstream ignores `network` on /api/movies and /api/series; only /api/browse
// filters by it, and that endpoint returns movies and series mixed together.
app.get('/network/:slug', async c => {
  const slug = c.req.param('slug')
  if (!isSlug(slug)) return c.json({ success: false, message: 'Invalid network' }, 400)
  const page = parsePage(c.req.query('page'))
  if (page === null) return c.json({ success: false, message: 'Invalid page' }, 400)

  const key = `network.${slug}.${page}`
  const cached = cache.get(key)
  if (cached) return c.json({ success: true, data: cached })

  const qs = new URLSearchParams({ network: slug, page: String(page), limit: '36' })
  const data = await getJson<{ data: unknown[] }>(`/api/browse?${qs}`)
  if (!data) return upstreamError(c)

  const items = (data.data ?? []).map(r => mapItem(r as Record<string, unknown>)).filter(Boolean)
  cache.set(key, items, 1)
  return c.json({ success: true, data: items })
})

/** Shared handler for filtered listings: /genre/:slug, /country/:code, /year/:year. */
async function filtered(c: Context, filter: 'genre' | 'country' | 'year', value: string) {
  const type = c.req.query('type') === 'series' ? 'series' : 'movie'
  const page = parsePage(c.req.query('page'))
  if (page === null) return c.json({ success: false, message: 'Invalid page' }, 400)

  const key = `${filter}.${value}.${type}.${page}`
  const cached = cache.get(key)
  if (cached) return c.json({ success: true, data: cached })

  const api = type === 'series' ? '/api/series' : '/api/movies'
  const qs = new URLSearchParams({ [filter]: value, page: String(page), limit: '36', sort: 'createdAt' })
  const data = await getJson<{ data: unknown[] }>(`${api}?${qs}`)
  if (!data) return upstreamError(c)

  const items = (data.data ?? []).map(r => mapItem(r as Record<string, unknown>)).filter(Boolean)
  cache.set(key, items, 1)
  return c.json({ success: true, data: items })
}

app.get('/genre/:slug', c => {
  const slug = c.req.param('slug')
  if (!isSlug(slug)) return c.json({ success: false, message: 'Invalid genre' }, 400)
  return filtered(c, 'genre', slug)
})

app.get('/country/:code', c => {
  const code = c.req.param('code')
  if (!isSlug(code)) return c.json({ success: false, message: 'Invalid country code' }, 400)
  return filtered(c, 'country', code)
})

app.get('/year/:year', c => {
  const year = c.req.param('year')
  if (!isYear(year)) return c.json({ success: false, message: 'Invalid year' }, 400)
  return filtered(c, 'year', year)
})

export default app
