import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { swaggerUI } from '@hono/swagger-ui'
import { openapi } from '../openapi.js'

const app = new Hono()

// OpenAPI spec is always served from the API process (both the custom docs app
// and any external tool like Postman or Insomnia read it from here).
app.get('/openapi.json', c => c.json(openapi))

// Keep Swagger UI alive at /swagger as a fallback for anyone who prefers it.
app.get('/swagger', swaggerUI({ url: '/openapi.json', title: 'Movie API — Swagger' }))

// New docs UI is a Vite-built SPA. `npm run docs:build` emits docs-dist/.
// serveStatic streams the bundle; if the file is missing (someone forgot to
// build) we fall back to a helpful message rather than a 404.
app.use(
  '/docs/*',
  serveStatic({
    root: './docs-dist',
    rewriteRequestPath: (path) => path.replace(/^\/docs/, ''),
  }),
)

// SPA fallback: anything under /docs that didn't match a file returns index.html
// so deep links like /docs#get-movies work on direct reload.
app.get('/docs', serveStatic({ path: './docs-dist/index.html' }))
app.get('/docs/', serveStatic({ path: './docs-dist/index.html' }))

export default app
