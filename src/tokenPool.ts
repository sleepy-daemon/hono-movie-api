/**
 * Turnstile token pool. Userscripts running on upstream pages push captured
 * tokens here; the stream chain pops one when a caller didn't supply one.
 *
 * Backend is pluggable:
 *   - In-memory (default): a FIFO queue in this process. Fine for local dev
 *     and single-instance deployments. Lost on cold start — Vercel lambdas
 *     will not share tokens across instances.
 *   - Upstash Redis (when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *     are set): a Redis list via Upstash's HTTP REST API. Vercel-friendly,
 *     free tier, shared across every lambda instance.
 */

const MAX_IN_MEMORY = 50
const TOKEN_TTL_SECONDS = 270 // Turnstile tokens live ~5 min; drop earlier as safety margin
const LIST_KEY = 'turnstile:pool'

interface PooledToken {
  token: string
  capturedAt: number
}

export interface TokenPool {
  push(token: string): Promise<void>
  pop(): Promise<string | null>
  size(): Promise<number>
}

// ─── in-memory backend ─────────────────────────────────────────────────────

class MemoryPool implements TokenPool {
  private q: PooledToken[] = []

  async push(token: string): Promise<void> {
    this.q.push({ token, capturedAt: Date.now() })
    while (this.q.length > MAX_IN_MEMORY) this.q.shift()
  }

  async pop(): Promise<string | null> {
    this.prune()
    const entry = this.q.shift()
    return entry?.token ?? null
  }

  async size(): Promise<number> {
    this.prune()
    return this.q.length
  }

  private prune(): void {
    const cutoff = Date.now() - TOKEN_TTL_SECONDS * 1000
    while (this.q.length > 0 && this.q[0].capturedAt < cutoff) this.q.shift()
  }
}

// ─── Upstash Redis REST backend ────────────────────────────────────────────

class UpstashPool implements TokenPool {
  constructor(private readonly url: string, private readonly token: string) {}

  private async cmd<T>(command: (string | number)[]): Promise<T | null> {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) {
        console.error(`[pool] Upstash ${command[0]}: HTTP ${res.status}`)
        return null
      }
      const body = (await res.json()) as { result: T }
      return body.result
    } catch (err) {
      console.error('[pool] Upstash command failed:', err instanceof Error ? err.message : err)
      return null
    }
  }

  async push(token: string): Promise<void> {
    const entry = JSON.stringify({ token, capturedAt: Date.now() })
    await this.cmd(['RPUSH', LIST_KEY, entry])
    // Set TTL on the list so stale pools from quiet weeks don't hang around.
    await this.cmd(['EXPIRE', LIST_KEY, TOKEN_TTL_SECONDS * 2])
    await this.cmd(['LTRIM', LIST_KEY, -MAX_IN_MEMORY, -1])
  }

  async pop(): Promise<string | null> {
    // Pop oldest-first until we find one still within TTL.
    const cutoff = Date.now() - TOKEN_TTL_SECONDS * 1000
    for (let attempts = 0; attempts < MAX_IN_MEMORY; attempts++) {
      const raw = await this.cmd<string | null>(['LPOP', LIST_KEY])
      if (!raw) return null
      try {
        const entry = JSON.parse(raw) as PooledToken
        if (entry.capturedAt >= cutoff) return entry.token
        // else expired, keep popping
      } catch {
        // Malformed entry, skip.
      }
    }
    return null
  }

  async size(): Promise<number> {
    const n = await this.cmd<number>(['LLEN', LIST_KEY])
    return n ?? 0
  }
}

// ─── chosen pool (singleton) ───────────────────────────────────────────────

let _pool: TokenPool | null = null

export function pool(): TokenPool {
  if (_pool) return _pool
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  _pool = url && token ? new UpstashPool(url, token) : new MemoryPool()
  return _pool
}

/** Testing hook — resets the singleton so each test picks a fresh backend. */
export function _resetPool(): void { _pool = null }
