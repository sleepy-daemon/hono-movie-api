import { getJson } from './client.js'
import { mapItem } from './mapper.js'
import type { MediaItem } from './types.js'
import * as cache from './cache.js'

export interface HomeSection {
  title?: string
  data?: unknown[]
}

export interface Homepage {
  above?: HomeSection[]
  below?: HomeSection[]
}

const KEY = 'homepage.raw'

/** Upstream /api/homepage, cached for an hour; null on upstream failure (not cached). */
export async function loadHomepage(): Promise<Homepage | null> {
  const cached = cache.get<Homepage>(KEY)
  if (cached) return cached

  const data = await getJson<Homepage>('/api/homepage')
  if (!data) return null
  cache.set(KEY, data, 1)
  return data
}

export const allSections = (home: Homepage): HomeSection[] => [...(home.above ?? []), ...(home.below ?? [])]

/** First section whose title contains `needle` (case-insensitive). */
export function findSection(home: Homepage, needle: string): HomeSection | undefined {
  const n = needle.toLowerCase()
  return allSections(home).find(s => s.title?.toLowerCase().includes(n))
}

export const mapSection = (section: HomeSection | undefined): MediaItem[] =>
  (section?.data ?? []).map(r => mapItem(r as Record<string, unknown>)).filter((i): i is MediaItem => i !== null)
