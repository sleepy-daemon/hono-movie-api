// Hand-written OpenAPI 3.1 spec. Keep in sync with src/routes/* — openapi.test.ts
// fails if a documented path is missing from the app or a route is undocumented.

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const nullable = (type: string) => ({ type: [type, 'null'] })

const ok = (data: object, description = 'Success') => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: { success: { const: true }, data },
      },
    },
  },
})

const err = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('Error') } },
})

const list = ok({ type: 'array', items: ref('MediaItem') })

const slugParam = (name = 'slug', description = 'URL slug, e.g. `avengers-endgame`') => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9-]{0,199}$' },
})

const pageParam = {
  name: 'page',
  in: 'query',
  required: false,
  description: 'Page number (36 items per page)',
  schema: { type: 'integer', minimum: 1, maximum: 500, default: 1 },
}

const streamDescription =
  'May take up to ~20 seconds while the upstream unlock delay elapses. Cached for 15 minutes. ' +
  'When upstream requires human verification (Cloudflare Turnstile), returns 503 with the site key. ' +
  'This API never solves the check: have a person complete the widget for that site key and action, ' +
  'then retry with the token in `X-Verification-Token` (or `verificationToken`).'

const verificationTokenDescription =
  'Turnstile token a person solved for the site key from a previous 503. Single use, valid ~5 minutes.'

const streamParams = [
  {
    name: 'X-Verification-Token',
    in: 'header',
    required: false,
    description: verificationTokenDescription,
    schema: { type: 'string', maxLength: 2048 },
  },
  {
    name: 'verificationToken',
    in: 'query',
    required: false,
    description: `${verificationTokenDescription} The header is preferred: query strings end up in access logs.`,
    schema: { type: 'string', maxLength: 2048 },
  },
]

const verificationErr = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('VerificationError') } },
})

const streamErrors = {
  403: verificationErr('Upstream rejected the verification token (expired, already used, or invalid)'),
  502: err('Stream unavailable'),
  503: verificationErr('Upstream requires human verification for playback'),
}

const typeParam = {
  name: 'type',
  in: 'query',
  required: false,
  description: 'Content type to list',
  schema: { type: 'string', enum: ['movie', 'series'], default: 'movie' },
}

const paged = (tag: string, summary: string, extra: object[] = []) => ({
  get: {
    tags: [tag],
    summary,
    parameters: [...extra, pageParam],
    responses: { 200: list, 400: err('Invalid page'), 502: err('Upstream error') },
  },
})

const filtered = (summary: string, param: object, invalid: string) => ({
  get: {
    tags: ['Browse'],
    summary,
    parameters: [param, typeParam, pageParam],
    responses: { 200: list, 400: err(invalid), 502: err('Upstream error') },
  },
})

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Movie API',
    version: '1.0.0',
    description:
      'REST API for browsing movies and TV series, plus a full stream resolution chain. ' +
      'Responses use the envelope `{ success, data }` on success and `{ success: false, message }` on error. ' +
      'Stream endpoints run a six-step upstream chain and may return 503 with a Turnstile challenge — ' +
      'see the token pool section in the project README.',
  },
  tags: [
    { name: 'Home' },
    { name: 'Movies' },
    { name: 'Series' },
    { name: 'Search' },
    { name: 'Browse' },
    { name: 'Leaderboard' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['Home'],
        summary: 'API info',
        responses: {
          200: {
            description: 'API name and version',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { const: true },
                    message: { type: 'string' },
                    version: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/home': {
      get: {
        tags: ['Home'],
        summary: 'All homepage items, flattened',
        responses: { 200: list, 502: err('Upstream error') },
      },
    },
    '/home/sections': {
      get: {
        tags: ['Home'],
        summary: 'Homepage items grouped by section title',
        responses: {
          200: ok({ type: 'object', additionalProperties: { type: 'array', items: ref('MediaItem') } }),
          502: err('Upstream error'),
        },
      },
    },
    '/home/featured': {
      get: {
        tags: ['Home'],
        summary: 'Featured titles (the homepage "Featured" section)',
        responses: { 200: list, 502: err('Upstream error') },
      },
    },
    '/home/recent': {
      get: {
        tags: ['Home'],
        summary: 'Recently added titles (the homepage "Recently Added …" sections)',
        parameters: [
          {
            name: 'type',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['movie', 'series', 'episode'], default: 'movie' },
          },
        ],
        responses: { 200: list, 400: err('Invalid type'), 502: err('Upstream error') },
      },
    },

    '/movies': paged('Movies', 'Latest movies'),
    '/movies/trending': paged('Movies', 'Trending movies'),
    '/movies/{slug}': {
      get: {
        tags: ['Movies'],
        summary: 'Movie detail',
        parameters: [slugParam()],
        responses: { 200: ok(ref('MediaDetail')), 400: err('Invalid slug'), 404: err('Movie not found') },
      },
    },
    '/movies/{slug}/stream': {
      get: {
        tags: ['Movies'],
        summary: 'Resolve movie stream URL and subtitles',
        description: streamDescription,
        parameters: [slugParam(), ...streamParams],
        responses: { 200: ok(ref('StreamResult')), 400: err('Invalid slug or verification token'), ...streamErrors },
      },
    },

    '/series': paged('Series', 'Latest series'),
    '/series/trending': {
      get: {
        tags: ['Series'],
        summary: 'Trending series (from the homepage)',
        responses: { 200: list, 502: err('Upstream error') },
      },
    },
    '/series/{slug}': {
      get: {
        tags: ['Series'],
        summary: 'Series detail, including seasons and episodes',
        parameters: [slugParam()],
        responses: { 200: ok(ref('MediaDetail')), 400: err('Invalid slug'), 404: err('Series not found') },
      },
    },
    '/series/{slug}/stream': {
      get: {
        tags: ['Series'],
        summary: 'Resolve the stream for the first episode of the first regular season',
        description: streamDescription,
        parameters: [slugParam(), ...streamParams],
        responses: {
          200: ok(ref('StreamResult')),
          400: err('Invalid slug or verification token'),
          404: err('Series not found, or it has no episodes'),
          ...streamErrors,
        },
      },
    },
    '/series/{slug}/season/{season}/episode/{episode}/stream': {
      get: {
        tags: ['Series'],
        summary: 'Resolve episode stream URL and subtitles',
        description: streamDescription,
        parameters: [
          slugParam(),
          { name: 'season', in: 'path', required: true, schema: { type: 'integer', minimum: 1, maximum: 1000 } },
          { name: 'episode', in: 'path', required: true, schema: { type: 'integer', minimum: 1, maximum: 10000 } },
          ...streamParams,
        ],
        responses: {
          200: ok(ref('StreamResult')),
          400: err('Invalid slug, season, episode or verification token'),
          ...streamErrors,
        },
      },
    },

    '/search': {
      get: {
        tags: ['Search'],
        summary: 'Search movies and series by title',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1, maxLength: 100 } },
        ],
        responses: {
          200: {
            description: 'Search results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { const: true },
                    data: { type: 'array', items: ref('MediaItem') },
                    meta: {
                      type: 'object',
                      properties: { query: { type: 'string' }, count: { type: 'integer' } },
                    },
                  },
                },
              },
            },
          },
          400: err('Missing or too long query'),
          502: err('Upstream error'),
        },
      },
    },

    '/browse/genres': {
      get: {
        tags: ['Browse'],
        summary: 'List genres',
        responses: {
          200: ok({
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' }, slug: { type: 'string' } } },
          }),
          502: err('Upstream error'),
        },
      },
    },
    '/browse/countries': {
      get: {
        tags: ['Browse'],
        summary: 'List countries',
        responses: {
          200: ok({
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' }, code: { type: 'string' } } },
          }),
          502: err('Upstream error'),
        },
      },
    },
    '/browse/years': {
      get: {
        tags: ['Browse'],
        summary: 'List release years',
        responses: { 200: ok({ type: 'array', items: { type: 'integer' } }), 502: err('Upstream error') },
      },
    },
    '/browse/networks': {
      get: {
        tags: ['Browse'],
        summary: 'List networks (streaming services and TV channels)',
        responses: {
          200: ok({
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' }, slug: { type: 'string' } } },
          }),
          502: err('Upstream error'),
        },
      },
    },
    '/browse/network/{slug}': {
      get: {
        tags: ['Browse'],
        summary: 'Titles by network (movies and series mixed, newest first)',
        parameters: [slugParam('slug', 'Network slug from /browse/networks'), pageParam],
        responses: { 200: list, 400: err('Invalid network or page'), 502: err('Upstream error') },
      },
    },
    '/browse/genre/{slug}': filtered('Titles by genre', slugParam('slug', 'Genre slug from /browse/genres'), 'Invalid genre or page'),
    '/browse/country/{code}': filtered(
      'Titles by country',
      slugParam('code', 'Country code from /browse/countries'),
      'Invalid country code or page'
    ),
    '/browse/year/{year}': filtered(
      'Titles by release year',
      { name: 'year', in: 'path', required: true, schema: { type: 'string', pattern: '^\\d{4}$' } },
      'Invalid year or page'
    ),

    '/leaderboard': {
      get: {
        tags: ['Leaderboard'],
        summary: "This month's most viewed, watchlisted and favourited titles, plus top reviews and comments",
        responses: { 200: ok(ref('Leaderboard')), 502: err('Upstream error') },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: 'object',
        required: ['success', 'message'],
        properties: { success: { const: false }, message: { type: 'string' } },
      },
      VerificationError: {
        type: 'object',
        required: ['success', 'message', 'verification'],
        properties: {
          success: { const: false },
          message: { type: 'string' },
          verification: {
            type: 'object',
            required: ['siteKey', 'action', 'tokenRejected'],
            properties: {
              siteKey: { type: 'string', description: 'Turnstile site key to render the widget with' },
              action: { type: 'string', description: 'Turnstile action to render the widget with', example: 'play' },
              tokenRejected: { type: 'boolean', description: 'True when the supplied token was refused' },
            },
          },
        },
      },
      MediaItem: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          year: nullable('integer'),
          type: { type: 'string', enum: ['movie', 'series', 'episode'] },
          quality: nullable('string'),
          rating: nullable('number'),
          poster: { ...nullable('string'), format: 'uri' },
          slug: { ...nullable('string'), description: 'For episodes, the slug of the series' },
          season: { ...nullable('integer'), description: 'Episodes only' },
          episode: { ...nullable('integer'), description: 'Episodes only' },
        },
      },
      MediaDetail: {
        allOf: [
          ref('MediaItem'),
          {
            type: 'object',
            properties: {
              runtime: { ...nullable('string'), description: 'ISO 8601 duration, e.g. PT120M' },
              runtimeMinutes: nullable('integer'),
              overview: nullable('string'),
              backdrop: { ...nullable('string'), format: 'uri' },
              genres: { type: 'array', items: { type: 'string' } },
              language: nullable('string'),
              country: nullable('string'),
              director: nullable('string'),
              cast: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    character: nullable('string'),
                    image: nullable('string'),
                  },
                },
              },
              trailer: nullable('string'),
              keywords: { type: 'array', items: { type: 'string' } },
              seasons: { type: 'array', items: ref('Season'), description: 'Series only' },
            },
          },
        ],
      },
      Season: {
        type: 'object',
        properties: {
          season: { type: 'integer' },
          name: { type: 'string' },
          episodeCount: { type: 'integer' },
          episodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: { episode: { type: 'integer' }, title: { type: 'string' }, overview: nullable('string') },
            },
          },
        },
      },
      Leaderboard: {
        type: 'object',
        properties: {
          month: { ...nullable('string'), description: 'YYYY-MM' },
          updatedAt: { ...nullable('string'), format: 'date-time' },
          topMovies: { type: 'array', items: ref('MediaItem') },
          topSeries: { type: 'array', items: ref('MediaItem') },
          topWatchlisted: { type: 'array', items: ref('MediaItem') },
          topFavourited: { type: 'array', items: ref('MediaItem') },
          topReviews: { type: 'array', items: ref('Post') },
          topComments: { type: 'array', items: ref('Post') },
        },
      },
      Post: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          rating: nullable('number'),
          createdAt: { ...nullable('string'), format: 'date-time' },
          upvotes: { type: 'integer', description: 'Upvotes this month' },
          author: nullable('string'),
          target: {
            type: ['object', 'null'],
            properties: { type: nullable('string'), title: nullable('string'), slug: nullable('string') },
          },
        },
      },
      StreamResult: {
        type: 'object',
        properties: {
          streamUrl: { type: 'string', description: 'HLS (.m3u8) URL' },
          subtitles: {
            type: 'array',
            items: {
              type: 'object',
              properties: { lang: { type: 'string' }, label: { type: 'string' }, url: { type: 'string' } },
            },
          },
          title: nullable('string'),
          durationSec: nullable('integer'),
        },
      },
    },
  },
}
