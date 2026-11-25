import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { pool } from '../tokenPool.js'
import { tokenEvents } from '../tokenEvents.js'
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

/**
 * Server-Sent Events channel the userscript subscribes to. The stream handler
 * emits a `need` event each time it pops a token; the userscript responds by
 * solving one fresh token and POSTing it back. Supply follows demand instead
 * of running on a fixed timer.
 *
 * - `hello` on connect so the client knows the pipe is live.
 * - `ping` every 25s so proxies (Cloudflare, nginx) don't close the stream.
 * - Listener is detached on disconnect to avoid memory leaks.
 */
app.get('/needs', c => {
  return streamSSE(c, async stream => {
    const onNeed = async () => {
      try { await stream.writeSSE({ event: 'need', data: String(Date.now()) }) } catch { /* client gone */ }
    }
    tokenEvents.on('need', onNeed)
    stream.onAbort(() => { tokenEvents.off('need', onNeed) })

    await stream.writeSSE({ event: 'hello', data: '1', retry: 5_000 })

    try {
      while (!stream.closed) {
        await stream.sleep(25_000)
        if (stream.closed) break
        await stream.writeSSE({ event: 'ping', data: String(Date.now()) })
      }
    } finally {
      tokenEvents.off('need', onNeed)
    }
  })
})

export default app
