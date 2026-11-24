import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('./client', () => ({ BASE_URL: 'https://upstream.test', getJson: vi.fn(), postJson: vi.fn() }))

import { openapi } from './openapi'
import docs from './routes/docs'
import home from './routes/home'
import movies from './routes/movies'
import series from './routes/series'
import search from './routes/search'
import browse from './routes/browse'
import leaderboard from './routes/leaderboard'

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
const DOC_ROUTES = new Set(['/openapi.json', '/docs', '/tokens/'])
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

  it('serves the Swagger UI page pointing at the spec', async () => {
    const res = await app.request('/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('/openapi.json')
  })
})
