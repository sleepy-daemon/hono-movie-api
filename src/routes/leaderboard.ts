import { Hono } from 'hono'
import { getJson } from '../client.js'
import { mapItem } from '../mapper.js'
import type { MediaItem } from '../types.js'
import * as cache from '../cache.js'

const app = new Hono()

type Raw = Record<string, unknown>

interface RawPost {
  content?: string
  rating?: number | null
  createdAt?: string
  monthlyUpvotes?: number
  user?: { username?: string; displayName?: string }
  target?: { type?: string; title?: string; slug?: string }
}

const mapList = (list: unknown): MediaItem[] =>
  (Array.isArray(list) ? list : []).map(r => mapItem(r as Raw)).filter((i): i is MediaItem => i !== null)

// Upstream attaches the full user record (plan, ban state, badges...); keep only
// what's needed to show the post.
const mapPosts = (list: unknown) =>
  (Array.isArray(list) ? (list as RawPost[]) : []).map(p => ({
    content: p.content ?? '',
    rating: p.rating ?? null,
    createdAt: p.createdAt ?? null,
    upvotes: p.monthlyUpvotes ?? 0,
    author: p.user?.displayName || p.user?.username || null,
    target: p.target ? { type: p.target.type ?? null, title: p.target.title ?? null, slug: p.target.slug ?? null } : null,
  }))

app.get('/', async c => {
  const cached = cache.get('leaderboard')
  if (cached) return c.json({ success: true, data: cached })

  const raw = await getJson<Raw>('/api/leaderboard')
  if (!raw) return c.json({ success: false, message: 'Upstream error' }, 502)

  const data = {
    month: (raw.month as string) ?? null,
    updatedAt: (raw.updatedAt as string) ?? null,
    topMovies: mapList(raw.topMovies),
    topSeries: mapList(raw.topSeries),
    topWatchlisted: mapList(raw.topWatchlisted),
    topFavourited: mapList(raw.topFavourited),
    topReviews: mapPosts(raw.topReviews),
    topComments: mapPosts(raw.topComments),
  }
  cache.set('leaderboard', data, 1)
  return c.json({ success: true, data })
})

export default app
