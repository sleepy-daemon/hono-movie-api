import { Hono } from 'hono'
import { pool } from '../tokenPool.js'
import { isVerificationToken } from '../validate.js'

const app = new Hono()

/**
 * Receives Turnstile tokens captured by a userscript running on the upstream
 * site and queues them in the pool. Gated behind TOKEN_POOL_SECRET so random
 * traffic can't flood the pool; without a secret set, the endpoint is closed.
 */
app.post('/', async c => {
  const secret = process.env.TOKEN_POOL_SECRET
  if (!secret) return c.json({ success: false, message: 'Token pool is disabled' }, 404)

  const provided = c.req.header('x-pool-secret')
  if (provided !== secret) return c.json({ success: false, message: 'Unauthorized' }, 401)

  let body: { token?: unknown } = {}
  try { body = (await c.req.json()) as { token?: unknown } } catch { /* empty / invalid */ }

  if (typeof body.token !== 'string' || !isVerificationToken(body.token)) {
    return c.json({ success: false, message: 'Invalid token' }, 400)
  }

  await pool().push(body.token)
  return c.json({ success: true, data: { pooled: true, size: await pool().size() } })
})

app.get('/', async c => {
  // No secret needed to peek at the depth — it leaks nothing a flood couldn't
  // measure anyway, and the UI needs it for a health indicator.
  return c.json({ success: true, data: { size: await pool().size() } })
})

export default app
