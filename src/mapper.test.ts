import { describe, it, expect } from 'vitest'
import { mapItem, mapDetail } from './mapper'

describe('mapItem', () => {
  it('falls back to firstAirDate when releaseDate is empty', () => {
    expect(mapItem({ releaseDate: '', firstAirDate: '2021-05-01' })?.year).toBe(2021)
  })

  it('keeps a rating of 0', () => expect(mapItem({ voteAverage: 0 })?.rating).toBe(0))

  it('maps missing or invalid ratings to null', () => {
    expect(mapItem({})?.rating).toBeNull()
    expect(mapItem({ voteAverage: 'n/a' })?.rating).toBeNull()
  })

  it('builds poster URLs and series type', () => {
    const item = mapItem({ posterPath: '/p.jpg', contentType: 'series' })
    expect(item?.poster).toBe('https://image.tmdb.org/t/p/w300/p.jpg')
    expect(item?.type).toBe('series')
  })
})

describe('mapDetail', () => {
  it('includes the MediaItem fields quality, rating and slug', () => {
    const d = mapDetail({ title: 'X', slug: 'x', quality: 'HD', voteAverage: '7.5' })
    expect(d).toMatchObject({ slug: 'x', quality: 'HD', rating: 7.5 })
  })

  it('maps series seasons and runtime', () => {
    const d = mapDetail({
      title: 'S',
      numberOfSeasons: 1,
      runtime: '45',
      seasons: [{ seasonNumber: 1, name: 'S1', episodeCount: 1, episodes: [{ episodeNumber: 1, title: 'Pilot' }] }],
    })
    expect(d?.type).toBe('series')
    expect(d?.runtime).toBe('PT45M')
    expect(d?.seasons?.[0].episodes[0]).toEqual({ episode: 1, title: 'Pilot', overview: null })
  })
})
