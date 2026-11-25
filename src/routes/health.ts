import { Hono } from 'hono'
import { pool } from '../tokenPool.js'
import { pendingWaiters } from '../tokenEvents.js'

const app = new Hono()

/**
 * Lightweight health + runtime snapshot. No auth — surfaces only values that
 * are already observable (process uptime, pool depth, waiter queue length,
 * pool backend name). Useful for a monitoring dashboard, Fly healthchecks,
 * or a status badge in a client app.
 *
 * Returns 200 as long as the Node process is alive and the pool backend
 * responds. Returns 503 if the pool backend errors — typically a dropped
 * Upstash connection.
 */
app.get('/', async c => {
  const startedAt = process.uptime()
  const mem = process.memoryUsage()
  const backend = process.env.UPSTASH_REDIS_REST_URL ? 'upstash' : 'memory'

  try {
    const poolSize = await pool().size()
    return c.json({
      success: true,
      data: {
        ok: true,
        uptimeSec: Math.round(startedAt),
        pool: {
          backend,
          size: poolSize,
          waiters: pendingWaiters(),
        },
        memory: {
          rssMB: Math.round(mem.rss / 1024 / 1024),
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        },
        timestamp: Date.now(),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json(
      {
        success: false,
        message: `Pool backend unreachable: ${msg}`,
        data: { ok: false, backend, uptimeSec: Math.round(startedAt) },
      },
      503,
    )
  }
})

export default app
