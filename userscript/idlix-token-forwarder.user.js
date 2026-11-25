// ==UserScript==
// @name         IDLIX Turnstile Token Forwarder (hono-movie-api)
// @namespace    hono-movie-api
// @version      3.1.0
// @description  Signal-driven Turnstile token forwarder. Renders ONE invisible widget in execute-on-demand mode and solves only when the API's long-poll endpoint asks for a token. Uses GM_xmlhttpRequest to bypass IDLIX's strict CSP.
// @match        https://z3.idlixku.com/*
// @match        https://*.idlixku.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// ==/UserScript==

(function () {
  'use strict'

  // ─── CONFIG — edit these three lines ────────────────────────────────────
  const API_BASE = 'https://hono-movie-api.fly.dev'
  const POOL_SECRET = 'CHANGE_ME_LOCALLY' // paste your TOKEN_POOL_SECRET here
  const SITE_KEY = '0x4AAAAAAB4OxS-c9fV6wteq' // IDLIX's current Turnstile site key
  // ────────────────────────────────────────────────────────────────────────

  const ACTION = 'play'
  // Number of warm tokens to keep in the pool at steady state. The userscript
  // tops up to this on startup and after the fallback poll finds a deficit.
  const BUFFER_TARGET = 2
  // Belt-and-braces: even with SSE, poll pool size occasionally in case the
  // connection is silently dead. One extra HTTP request per minute.
  const FALLBACK_POLL_MS = 60_000
  // How long to keep the execute()-in-flight mutex closed before giving up and
  // allowing a retry. Turnstile usually resolves in 1-3s; 30s is generous.
  const EXECUTE_TIMEOUT_MS = 30_000
  const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

  // unsafeWindow is Tampermonkey's handle to the real page `window`. The
  // userscript itself runs in an isolated JS world where `window.turnstile`
  // never resolves and page-context networking (EventSource) is sandboxed.
  const pageWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

  if (pageWin.__idlix_forwarder_installed) return
  pageWin.__idlix_forwarder_installed = true

  const log = (...args) => console.log('[idlix-forwarder]', ...args)
  const TOKENS_URL = API_BASE.replace(/\/$/, '') + '/tokens'
  const WAIT_URL = TOKENS_URL + '/wait?timeout=25'

  // ─── POST a captured token to the API's pool ────────────────────────────
  const send = (token) => {
    const body = JSON.stringify({ token })
    const headers = { 'content-type': 'application/json', 'x-pool-secret': POOL_SECRET }
    if (typeof GM_xmlhttpRequest === 'function') {
      GM_xmlhttpRequest({
        method: 'POST', url: TOKENS_URL, headers, data: body,
        onload: (r) => log('pushed:', r.status, String(r.responseText || '').slice(0, 120)),
        onerror: (e) => log('push failed:', e),
      })
    } else {
      fetch(TOKENS_URL, { method: 'POST', headers, body })
        .then((r) => r.text().then((t) => log('pushed:', r.status, t.slice(0, 120))))
        .catch((e) => log('push failed:', e))
    }
  }

  // ─── GET current pool size (public, no secret) ──────────────────────────
  const fetchPoolSize = () => new Promise((resolve) => {
    const done = (txt) => {
      try { resolve(Number(JSON.parse(txt)?.data?.size ?? 0)) }
      catch { resolve(0) }
    }
    if (typeof GM_xmlhttpRequest === 'function') {
      GM_xmlhttpRequest({
        method: 'GET', url: TOKENS_URL,
        onload: (r) => done(r.responseText || ''),
        onerror: () => resolve(0),
      })
    } else {
      fetch(TOKENS_URL).then((r) => r.text()).then(done).catch(() => resolve(0))
    }
  })

  // ─── load Cloudflare's Turnstile API if the page hasn't already ─────────
  const loadTurnstile = () => new Promise((resolve, reject) => {
    if (pageWin.turnstile) return resolve(pageWin.turnstile)
    const existing = document.querySelector(`script[src^="${TURNSTILE_SCRIPT_URL.split('?')[0]}"]`)
    if (!existing) {
      const s = document.createElement('script')
      s.src = TURNSTILE_SCRIPT_URL
      s.async = true
      s.defer = true
      s.onerror = () => reject(new Error('failed to load Turnstile script'))
      ;(document.head || document.documentElement).appendChild(s)
    }
    const deadline = Date.now() + 20_000
    const tick = () => {
      if (pageWin.turnstile) return resolve(pageWin.turnstile)
      if (Date.now() > deadline) return reject(new Error('turnstile load timeout'))
      setTimeout(tick, 100)
    }
    tick()
  })

  // ─── mount a hidden widget in execute-on-demand mode ────────────────────
  const mount = (turnstile) => {
    const host = document.createElement('div')
    host.id = 'idlix-forwarder-widget'
    // Visible-but-invisible: Turnstile refuses to render in display:none containers.
    host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:300px;height:65px;pointer-events:none;'
    document.body.appendChild(host)

    let widgetId = null
    let executing = false
    let executeDeadline = 0
    let pendingSolves = 0

    const releaseLock = () => {
      executing = false
      executeDeadline = 0
      // If more solves queued while we were busy, kick off the next one now.
      if (pendingSolves > 0) {
        pendingSolves -= 1
        setTimeout(() => solveOne(), 50)
      }
    }

    const solveOne = () => {
      // Clear a stuck lock from a widget that never fired its callback.
      if (executing && Date.now() > executeDeadline) {
        log('execute deadline exceeded, forcing reset')
        try { turnstile.reset(widgetId) } catch {}
        executing = false
      }
      if (executing) {
        pendingSolves = Math.min(pendingSolves + 1, 8)
        return
      }
      if (widgetId === null) return
      executing = true
      executeDeadline = Date.now() + EXECUTE_TIMEOUT_MS
      try {
        turnstile.execute(widgetId)
      } catch (e) {
        executing = false
        log('execute failed:', e)
      }
    }

    const onToken = (token) => {
      if (typeof token === 'string' && token.length >= 20) send(token)
      try { turnstile.reset(widgetId) } catch {}
      releaseLock()
    }

    try {
      widgetId = turnstile.render(host, {
        sitekey: SITE_KEY,
        action: ACTION,
        theme: 'light',
        size: 'invisible',
        execution: 'execute', // key difference vs. v2.x — wait for execute() instead of auto-solving
        callback: onToken,
        'error-callback': (code) => {
          log('turnstile error:', code)
          try { turnstile.reset(widgetId) } catch {}
          releaseLock()
        },
        'expired-callback': () => {
          try { turnstile.reset(widgetId) } catch {}
          releaseLock()
        },
      })
      log('widget mounted (execute mode), siteKey=', SITE_KEY)
    } catch (e) {
      log('render failed:', e)
      return
    }

    // ─── top-up logic ─────────────────────────────────────────────────────
    const topUp = async () => {
      const size = await fetchPoolSize()
      const deficit = Math.max(0, BUFFER_TARGET - size)
      if (deficit > 0) log(`pool size=${size}, want=${BUFFER_TARGET}, scheduling ${deficit} solve(s)`)
      for (let i = 0; i < deficit; i++) solveOne()
    }

    // Startup warm.
    topUp()

    // ─── long-poll loop: solve on demand when API signals a drain ─────────
    // IDLIX serves a strict CSP that blocks cross-origin EventSource/fetch
    // from page context. GM_xmlhttpRequest bypasses CSP entirely (uses the
    // userscript's own @connect directive, NOT the page's connect-src), so
    // we long-poll /wait instead of subscribing to /needs.
    let waitBackoff = 1_000
    let connectedOnce = false

    const waitLoop = () => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        // No GM API — fall back to a chatty poll of pool size.
        log('GM_xmlhttpRequest unavailable; falling back to pool-size polling')
        setInterval(topUp, 5_000)
        return
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url: WAIT_URL,
        timeout: 60_000, // > server's 25s so we don't abort the long-poll
        onload: (r) => {
          if (r.status === 200) {
            solveOne()
          } else if (r.status !== 204) {
            log('wait unexpected status:', r.status)
          }
          if (!connectedOnce) { log('long-poll connected'); connectedOnce = true }
          waitBackoff = 1_000
          // Reconnect immediately (no delay) — server already waited up to 25s.
          waitLoop()
        },
        onerror: (e) => {
          log('wait error, reconnecting in', waitBackoff, 'ms', e)
          setTimeout(waitLoop, waitBackoff)
          waitBackoff = Math.min(waitBackoff * 2, 30_000)
        },
        ontimeout: () => {
          // Rare — server replies within 25s. If this fires, network stalled.
          setTimeout(waitLoop, 1_000)
        },
      })
    }
    waitLoop()

    // ─── fallback poll in case the long-poll goes silent ──────────────────
    setInterval(topUp, FALLBACK_POLL_MS)
  }

  // ─── go ────────────────────────────────────────────────────────────────
  loadTurnstile()
    .then((turnstile) => {
      // Give the page a beat to finish setting up — avoids racing IDLIX's own
      // Turnstile init on first load.
      setTimeout(() => mount(turnstile), 2_000)
    })
    .catch((e) => log('bootstrap failed:', e))
})()
