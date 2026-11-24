import type { MediaItem, MediaDetail, Season } from './types'

function extractYear(raw: Record<string, unknown>): number | null {
  const str = (raw.releaseDate || raw.firstAirDate || '') as string
  const y = parseInt(String(str).substring(0, 4), 10)
  return isNaN(y) ? null : y
}

function parseRating(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

function tmdb(path: string | null | undefined, size: string): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}

export function mapItem(raw: Record<string, unknown>): MediaItem | null {
  if (!raw) return null
  return {
    title: (raw.title as string) || '',
    year: extractYear(raw),
    type: raw.contentType === 'series' ? 'series' : 'movie',
    quality: (raw.quality as string) ?? null,
    rating: parseRating(raw.voteAverage),
    poster: tmdb(raw.posterPath as string, 'w300'),
    slug: (raw.slug as string) ?? null,
  }
}

export function mapDetail(raw: Record<string, unknown>): MediaDetail | null {
  if (!raw) return null
  const isSeries = !!(raw.numberOfSeasons)
  const runtime = raw.runtime ? parseInt(raw.runtime as string, 10) : null

  const seasons: Season[] | undefined = isSeries
    ? ((raw.seasons as Record<string, unknown>[]) ?? []).map(s => ({
        season: s.seasonNumber as number,
        name: s.name as string,
        episodeCount: s.episodeCount as number,
        episodes: ((s.episodes as Record<string, unknown>[]) ?? []).map(e => ({
          episode: e.episodeNumber as number,
          title: e.title as string,
          overview: (e.overview as string) ?? null,
        })),
      }))
    : undefined

  return {
    title: (raw.title as string) || '',
    year: extractYear(raw),
    type: isSeries ? 'series' : 'movie',
    quality: (raw.quality as string) ?? null,
    rating: parseRating(raw.voteAverage),
    slug: (raw.slug as string) ?? null,
    runtime: runtime ? `PT${runtime}M` : null,
    runtimeMinutes: runtime,
    overview: (raw.overview as string) ?? null,
    poster: tmdb(raw.posterPath as string, 'w300'),
    backdrop: tmdb(raw.backdropPath as string, 'w1280'),
    genres: ((raw.genres as { name: string }[]) ?? []).map(g => g.name).filter(Boolean),
    language: (raw.originalLanguage as string) ?? null,
    country: (raw.country as string) ?? null,
    director: (raw.director as string) ?? null,
    cast: ((raw.cast as Record<string, unknown>[]) ?? []).map(c => ({
      name: c.name as string,
      character: (c.character as string) ?? null,
      image: tmdb(c.profilePath as string, 'w185'),
    })),
    trailer: (raw.trailerUrl as string) ?? null,
    keywords: ((raw.keywords as { name: string }[]) ?? []).map(k => k.name).filter(Boolean),
    seasons,
  }
}
