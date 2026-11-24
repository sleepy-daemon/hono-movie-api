import { Hono } from 'hono'
import { getJson } from '../client.js'
import { mapItem } from '../mapper.js'
import * as cache from '../cache.js'

const app = new Hono()

app.get('/', async c => {
  const q = c.req.query('q')?.trim()
  if (!q) return c.json({ success: false, message: 'Missing query param: q' }, 400)
  if (q.length > 100) return c.json({ success: false, message: 'Query too long (max 100 chars)' }, 400)

  const key = `search.${q.toLowerCase()}`
  const cached = cache.get(key)
  if (cached) return c.json({ success: true, data: cached, meta: { query: q, count: (cached as unknown[]).length } })

  const data = await getJson<{ results: unknown[] }>(`/api/search?q=${encodeURIComponent(q)}`)
  if (!data) return c.json({ success: false, message: 'Upstream error' }, 502)

  const items = (data.results ?? []).map(r => mapItem(r as Record<string, unknown>)).filter(Boolean)
  cache.set(key, items, 0.5)
  return c.json({ success: true, data: items, meta: { query: q, count: items.length } })
})

export default app
