import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import home from './routes/home.js'
import movies from './routes/movies.js'
import series from './routes/series.js'
import search from './routes/search.js'
import browse from './routes/browse.js'
import leaderboard from './routes/leaderboard.js'
import docs from './routes/docs.js'
import tokens from './routes/tokens.js'
import proxy from './routes/proxy.js'
import player from './routes/player.js'

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
app.route('/stream', proxy)
app.route('/', player)

app.notFound(c => c.json({ success: false, message: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ success: false, message: 'Internal server error' }, 500)
})

export default app
