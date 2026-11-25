import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('./client', () => ({ BASE_URL: 'https://upstream.test', getJson: vi.fn(), postJson: vi.fn() }))

import { openapi } from './openapi.js'
import docs from './routes/docs.js'
import home from './routes/home.js'
import movies from './routes/movies.js'
import series from './routes/series.js'
import search from './routes/search.js'
import browse from './routes/browse.js'
import leaderboard from './routes/leaderboard.js'

// Mirrors the mounting in index.ts (which can't be imported: it starts the server).
const app = new Hono()
  .route('/', docs)
  .route('/', home)
  .route('/movies', movies)
  .route('/series', series)
  .route('/search', search)
  .route('/browse', browse)
  .route('/leaderboard', leaderboard)

// Utility/infra endpoints kept out of the public OpenAPI surface.
const DOC_ROUTES = new Set(['/openapi.json', '/docs', '/docs/', '/docs/*', '/swagger', '/tokens/'])
const toOpenApiPath = (p: string) => p.replace(/:(\w+)/g, '{$1}')

describe('OpenAPI spec', () => {
  it('documents exactly the GET routes the app serves', () => {
    const appPaths = app.routes
      .filter(r => r.method === 'GET' && !DOC_ROUTES.has(r.path))
      .map(r => toOpenApiPath(r.path))
    expect([...new Set(appPaths)].sort()).toEqual(Object.keys(openapi.paths).sort())
  })

  it('declares every path parameter used in the URL template', () => {
    for (const [path, item] of Object.entries(openapi.paths)) {
      const inPath = [...path.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
      const params = ((item.get as { parameters?: { name: string; in: string }[] }).parameters ?? [])
        .filter(p => p.in === 'path')
        .map(p => p.name)
        .sort()
      expect(params, path).toEqual(inPath)
    }
  })

  it('only references schemas that exist', () => {
    const refs = [...JSON.stringify(openapi).matchAll(/#\/components\/schemas\/(\w+)/g)].map(m => m[1])
    for (const name of refs) expect(openapi.components.schemas, name).toHaveProperty(name)
  })
})

describe('docs routes', () => {
  it('serves the spec as JSON', async () => {
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    expect((await res.json()).openapi).toBe('3.1.0')
  })

  it('serves the custom docs SPA at /docs', async () => {
    const res = await app.request('/docs')
    // Built bundle lives in ../docs-dist/; in CI without a build it may 404.
    // Either outcome is acceptable — just not a server error.
    expect([200, 404]).toContain(res.status)
    if (res.status === 200) {
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(await res.text()).toContain('id="root"')
    }
  })

  it('serves Swagger UI at /swagger as a fallback', async () => {
    const res = await app.request('/swagger')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('/openapi.json')
  })
})
