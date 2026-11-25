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
 * Long-poll version of /needs for clients that can't open a native EventSource.
 * The main consumer is the Tampermonkey userscript — IDLIX serves a strict
 * Content-Security-Policy that blocks cross-origin EventSource, but
 * GM_xmlhttpRequest bypasses CSP entirely. Semantically identical to the SSE
 * channel: holds the request open until either a `need` event fires (returns
 * 200 with { event: 'need' }) or the timeout elapses (returns 204 empty).
 * Client reconnects immediately and loops.
 *
 * Query: ?timeout=<seconds> (1-55, default 25). Keep under Fly's 60s idle
 * limit and your platform's proxy timeout.
 */
app.get('/wait', c => {
  const requested = Number(c.req.query('timeout') ?? '25')
  const timeout = Math.min(Math.max(1, Number.isFinite(requested) ? requested : 25), 55) * 1000

  return new Promise<Response>(resolve => {
    let done = false
    const finish = (res: Response) => {
      if (done) return
      done = true
      clearTimeout(timer)
      tokenEvents.off('need', onNeed)
      c.req.raw.signal.removeEventListener('abort', onAbort)
      resolve(res)
    }
    const onNeed = () => finish(c.json({ event: 'need', ts: Date.now() }))
    // Client disconnect — response is thrown away, just unregister listeners.
    const onAbort = () => finish(c.body(null, 204))
    const timer = setTimeout(() => finish(c.body(null, 204)), timeout)
    tokenEvents.on('need', onNeed)
    c.req.raw.signal.addEventListener('abort', onAbort)
  })
})

/**
 * Server-Sent Events channel. Semantically identical to /wait but as a
 * streaming connection — preferred when the client can open one (direct
 * curl, server-to-server, any origin without a CSP wall). The userscript
 * uses /wait instead because IDLIX's CSP blocks EventSource.
 *
 * - `hello` on connect so the client knows the pipe is live.
 * - `ping` every 25s so proxies (Cloudflare, nginx) don't close the stream.
 * - Listener detached on disconnect to avoid memory leaks.
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
