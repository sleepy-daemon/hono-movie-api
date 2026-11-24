import { Hono } from 'hono'
import type { Context } from 'hono'
import { allSections, findSection, loadHomepage, mapSection } from '../homepage.js'

const app = new Hono()

const upstreamError = (c: Context) => c.json({ success: false, message: 'Upstream error' }, 502)

// Section titles on the upstream homepage, matched case-insensitively.
const RECENT_SECTIONS = {
  movie: 'recently added movies',
  series: 'recently added series',
  episode: 'recently added episodes',
} as const

app.get('/', c => c.json({ success: true, message: 'Movie API', version: '1.0.0' }))

app.get('/home', async c => {
  const home = await loadHomepage()
  if (!home) return upstreamError(c)
  return c.json({ success: true, data: allSections(home).flatMap(mapSection) })
})

app.get('/home/sections', async c => {
  const home = await loadHomepage()
  if (!home) return upstreamError(c)

  const sections: Record<string, unknown[]> = {}
  for (const s of allSections(home)) {
    if (!s.title) continue
    const items = mapSection(s)
    if (items.length) sections[s.title] = items
  }
  return c.json({ success: true, data: sections })
})

app.get('/home/featured', async c => {
  const home = await loadHomepage()
  if (!home) return upstreamError(c)
  return c.json({ success: true, data: mapSection(findSection(home, 'featured')) })
})

app.get('/home/recent', async c => {
  const type = c.req.query('type') ?? 'movie'
  if (!Object.hasOwn(RECENT_SECTIONS, type)) return c.json({ success: false, message: 'Invalid type' }, 400)

  const home = await loadHomepage()
  if (!home) return upstreamError(c)
  const title = RECENT_SECTIONS[type as keyof typeof RECENT_SECTIONS]
  return c.json({ success: true, data: mapSection(findSection(home, title)) })
})

export default app
