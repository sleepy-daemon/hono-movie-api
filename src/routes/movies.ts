import { Hono } from 'hono'
import { getJson } from '../client'
import { mapItem, mapDetail } from '../mapper'
import { getMovieStream } from '../stream'
import { isSlug, parsePage } from '../validate'
import * as cache from '../cache'
import { streamResponse } from '../streamResponse'

const app = new Hono()

async function listMovies(sort: 'createdAt' | 'popularityScore', keyPrefix: string, pageParam: string | undefined) {
  const page = parsePage(pageParam)
  if (page === null) return { status: 400 as const, body: { success: false, message: 'Invalid page' } }

  const key = `${keyPrefix}.${page}`
  const cached = cache.get(key)
  if (cached) return { status: 200 as const, body: { success: true, data: cached } }

  const data = await getJson<{ data: unknown[] }>(`/api/movies?page=${page}&limit=36&sort=${sort}`)
  if (!data) return { status: 502 as const, body: { success: false, message: 'Upstream error' } }

  const items = (data.data ?? []).map(r => mapItem(r as Record<string, unknown>)).filter(Boolean)
  cache.set(key, items, 1)
  return { status: 200 as const, body: { success: true, data: items } }
}

app.get('/', async c => {
  const { status, body } = await listMovies('createdAt', 'movies.page', c.req.query('page'))
  return c.json(body, status)
})

app.get('/trending', async c => {
  const { status, body } = await listMovies('popularityScore', 'movies.trending', c.req.query('page'))
  return c.json(body, status)
})

app.get('/:slug', async c => {
  const slug = c.req.param('slug')
  if (!isSlug(slug)) return c.json({ success: false, message: 'Invalid slug' }, 400)

  const key = `movie.detail.${slug}`
  const cached = cache.get(key)
  if (cached) return c.json({ success: true, data: cached })

  const raw = await getJson<Record<string, unknown>>(`/api/movies/${encodeURIComponent(slug)}`)
  if (!raw?.title) return c.json({ success: false, message: 'Movie not found' }, 404)

  const detail = mapDetail(raw)
  cache.set(key, detail, 2)
  return c.json({ success: true, data: detail })
})

app.get('/:slug/stream', c => {
  const slug = c.req.param('slug')
  if (!isSlug(slug)) return c.json({ success: false, message: 'Invalid slug' }, 400)
  return streamResponse(c, `movie.stream.${slug}`, opts => getMovieStream(slug, opts))
})

export default app
