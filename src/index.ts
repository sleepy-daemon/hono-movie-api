import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'

import home from './routes/home'
import movies from './routes/movies'
import series from './routes/series'
import search from './routes/search'
import browse from './routes/browse'
import leaderboard from './routes/leaderboard'
import docs from './routes/docs'
import tokens from './routes/tokens'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.route('/', docs)
app.route('/', home)
app.route('/movies', movies)
app.route('/series', series)
app.route('/search', search)
app.route('/browse', browse)
app.route('/leaderboard', leaderboard)
app.route('/tokens', tokens)

app.notFound(c => c.json({ success: false, message: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ success: false, message: 'Internal server error' }, 500)
})

const PORT = Number(process.env.PORT) || 4000
serve({ fetch: app.fetch, port: PORT }, () =>
  console.log(`Movie API (Hono) running on http://localhost:${PORT}`)
)

export default app
