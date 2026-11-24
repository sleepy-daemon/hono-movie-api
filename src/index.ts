import { serve } from '@hono/node-server'
import app from './app'

const PORT = Number(process.env.PORT) || 4000
serve({ fetch: app.fetch, port: PORT }, () =>
  console.log(`Movie API (Hono) running on http://localhost:${PORT}`)
)

export default app
