import type { Context } from 'hono'
import { VerificationRequiredError, type StreamOptions, type VerificationDetails } from './stream.js'
import type { StreamResult } from './types.js'
import { isVerificationToken } from './validate.js'
import { pool } from './tokenPool.js'
import { signalNeed } from './tokenEvents.js'
import * as cache from './cache.js'

const STREAM_TTL_HOURS = 0.25 // stream URLs expire upstream
// Cache upstream failures for 5 minutes so a repeatedly broken source doesn't
// burn ~15s of the unlock gate every request.
const STREAM_MISS_TTL_HOURS = 1 / 12
// A stale token from the pool can be swapped out this many times before we
// give up and return a verification challenge to the caller.
const MAX_POOL_RETRIES = 3

export const VERIFICATION_TOKEN_HEADER = 'x-verification-token'
export const VERIFICATION_TOKEN_QUERY = 'verificationToken'

type Miss = { kind: 'failed' }

const UNAVAILABLE = { success: false, message: 'Stream unavailable' } as const

function verificationRequired(c: Context, { siteKey, action }: VerificationDetails) {
  return c.json(
    {
      success: false,
      message: 'Stream unavailable: upstream now requires human verification (Turnstile) for playback',
      verification: { siteKey, action, tokenRejected: false },
    },
    503
  )
}

/** Shared cache + error handling for the stream endpoints. */
export async function streamResponse(
  c: Context,
  key: string,
  resolve: (opts: StreamOptions) => Promise<StreamResult>
) {
  const rawToken = c.req.header(VERIFICATION_TOKEN_HEADER) ?? c.req.query(VERIFICATION_TOKEN_QUERY)
  if (rawToken !== undefined && !isVerificationToken(rawToken)) {
    return c.json({ success: false, message: 'Invalid verification token' }, 400)
  }

  const cached = cache.get<StreamResult>(key)
  if (cached) return c.json({ success: true, data: cached })

  const miss = cache.get<Miss>(`${key}.miss`)
  if (miss?.kind === 'failed') return c.json(UNAVAILABLE, 502)

  const fromCaller = rawToken !== undefined
  let token: string | undefined
  if (fromCaller) {
    token = rawToken
  } else {
    const popped = await pool().pop()
    if (popped) {
      token = popped
      // Wake one subscribed userscript to mint a replacement. See tokenEvents.
      signalNeed()
    }
  }
  let poolAttempts = 0

  // Retry loop: if a pool-sourced token is rejected, swap in another and try
  // again. A caller-supplied token is final — one shot, then 403 or success.
  while (true) {
    let result: StreamResult
    try {
      result = await resolve(token ? { verificationToken: token } : {})
    } catch (err) {
      if (!(err instanceof VerificationRequiredError)) throw err
      const details: VerificationDetails = { siteKey: err.siteKey, action: err.action }

      if (err.tokenRejected && fromCaller) {
        return c.json(
          {
            success: false,
            message: 'Verification token was rejected by upstream (expired, already used, or invalid)',
            verification: { ...details, tokenRejected: true },
          },
          403
        )
      }

      if (err.tokenRejected && !fromCaller && poolAttempts < MAX_POOL_RETRIES) {
        const next = await pool().pop()
        if (next) {
          token = next
          signalNeed()
          poolAttempts++
          continue
        }
      }

      // Pool was empty when we needed a token — nudge subscribers to mint one
      // so the next caller (likely retrying this same slug) finds it warm.
      if (!fromCaller && !token) signalNeed()

      // Preemptive bail (no token to offer) or exhausted pool retries.
      console.warn(`[stream] ${key}: ${err.message}`)
      return verificationRequired(c, details)
    }

    if (!result.streamUrl) {
      cache.set<Miss>(`${key}.miss`, { kind: 'failed' }, STREAM_MISS_TTL_HOURS)
      return c.json(UNAVAILABLE, 502)
    }

    cache.set(key, result, STREAM_TTL_HOURS)
    return c.json({ success: true, data: result })
  }
}
