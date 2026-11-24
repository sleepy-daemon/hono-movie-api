import type { MediaItem, MediaDetail, MediaType, Season } from './types.js'

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

const CONTENT_TYPES: Record<string, MediaType> = {
  movie: 'movie',
  series: 'series',
  tv_series: 'series',
  episode: 'episode',
}

/**
 * @param fallbackType - used when upstream omits `contentType` (e.g. /api/series
 *   list items), so callers that know what they fetched can say so.
 */
export function mapItem(raw: Record<string, unknown>, fallbackType: MediaType = 'movie'): MediaItem | null {
  if (!raw) return null

  // Homepage "Featured" entries wrap the title: { contentType, content: {...} }.
  const content = raw.content as Record<string, unknown> | undefined
  if (content && typeof content === 'object') {
    return mapItem({ ...content, contentType: raw.contentType ?? content.contentType }, fallbackType)
  }

  const type = CONTENT_TYPES[raw.contentType as string] ?? fallbackType

  // Episode entries describe the episode and nest their series; expose the series
  // slug plus season/episode so clients can hit the episode stream route.
  if (type === 'episode') {
    const series = (raw.series ?? {}) as Record<string, unknown>
    const season = (raw.season ?? {}) as Record<string, unknown>
    return {
      title: (series.title as string) || (raw.name as string) || '',
      year: extractYear(series),
      type,
      quality: (raw.quality as string) ?? null,
      rating: parseRating(raw.voteAverage),
      poster: tmdb(series.posterPath as string, 'w300'),
      slug: (series.slug as string) ?? null,
      season: typeof season.seasonNumber === 'number' ? season.seasonNumber : null,
      episode: typeof raw.episodeNumber === 'number' ? raw.episodeNumber : null,
    }
  }

  return {
    title: (raw.title as string) || '',
    year: extractYear(raw),
    type,
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
