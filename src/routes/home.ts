import { Hono } from 'hono'
import { getJson } from '../client'
import { mapItem } from '../mapper'
import * as cache from '../cache'

const app = new Hono()

app.get('/', c => c.json({ success: true, message: 'Movie API', version: '1.0.0' }))

app.get('/home', async c => {
  const cached = cache.get<ReturnType<typeof mapItem>[]>('home')
  if (cached) return c.json({ success: true, data: cached })

  const data = await getJson<{ above?: { data: unknown[] }[]; below?: { data: unknown[] }[] }>('/api/homepage')
  if (!data) return c.json({ success: false, message: 'Upstream error' }, 502)

  const all = [...(data.above ?? []), ...(data.below ?? [])]
  const items = all.flatMap(s => (s.data ?? []).map(r => mapItem(r as Record<string, unknown>))).filter(Boolean)
  cache.set('home', items, 1)
  return c.json({ success: true, data: items })
})

app.get('/home/sections', async c => {
  const cached = cache.get<Record<string, unknown[]>>('home.sections')
  if (cached) return c.json({ success: true, data: cached })

  const data = await getJson<{ above?: { title?: string; data: unknown[] }[]; below?: { title?: string; data: unknown[] }[] }>('/api/homepage')
  if (!data) return c.json({ success: false, message: 'Upstream error' }, 502)

  const sections: Record<string, unknown[]> = {}
  for (const s of [...(data.above ?? []), ...(data.below ?? [])]) {
    if (!s.title) continue
    const items = (s.data ?? []).map(r => mapItem(r as Record<string, unknown>)).filter(Boolean)
    if (items.length) sections[s.title] = items
  }
  cache.set('home.sections', sections, 1)
  return c.json({ success: true, data: sections })
})

export default app
