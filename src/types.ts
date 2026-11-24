export interface MediaItem {
  title: string
  year: number | null
  type: 'movie' | 'series'
  quality: string | null
  rating: number | null
  poster: string | null
  slug: string | null
}

export interface MediaDetail extends MediaItem {
  runtime: string | null
  runtimeMinutes: number | null
  overview: string | null
  backdrop: string | null
  genres: string[]
  language: string | null
  country: string | null
  director: string | null
  cast: { name: string; character: string | null; image: string | null }[]
  trailer: string | null
  keywords: string[]
  seasons?: Season[]
}

export interface Season {
  season: number
  name: string
  episodeCount: number
  episodes: { episode: number; title: string; overview: string | null }[]
}

export interface StreamResult {
  streamUrl: string | null
  subtitles: { lang: string; label: string; url: string }[]
  title: string | null
  durationSec: number | null
}
