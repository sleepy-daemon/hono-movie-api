// ==UserScript==
// @name         IDLIX Turnstile Token Forwarder (hono-movie-api)
// @namespace    hono-movie-api
// @version      2.1.0
// @description  Renders a hidden Turnstile widget on IDLIX pages and ships each fresh, unconsumed token to the hono-movie-api token pool.
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
  const API_URL = 'http://localhost:4000/tokens'
  const POOL_SECRET = 'localtest-secret-abc123'
  const SITE_KEY = '0x4AAAAAAB4OxS-c9fV6wteq' // IDLIX's current Turnstile site key
  // ────────────────────────────────────────────────────────────────────────

  const ACTION = 'play'
  // Wait between successive token generations. Short enough to top the pool
  // up during normal browsing, long enough that Cloudflare doesn't flag us
  // for rate abuse. Turnstile tokens live ~5 min so a token every 15s keeps
  // a healthy jar of ~20 fresh tokens.
  const INTERVAL_MS = 15_000
  const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

  // unsafeWindow is Tampermonkey's handle to the real page `window`. The
  // userscript itself runs in an isolated JS world where `window.turnstile`
  // never resolves even after Cloudflare's script injects it, because the
  // script runs in page context. Use the page window for Turnstile ops.
  const pageWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

  if (pageWin.__idlix_forwarder_installed) return
  pageWin.__idlix_forwarder_installed = true

  const log = (...args) => console.log('[idlix-forwarder]', ...args)

  // ─── ship a captured token to our API ───────────────────────────────────
  const send = (token) => {
    const body = JSON.stringify({ token })
    const headers = { 'content-type': 'application/json', 'x-pool-secret': POOL_SECRET }
    if (typeof GM_xmlhttpRequest === 'function') {
      GM_xmlhttpRequest({
        method: 'POST', url: API_URL, headers, data: body,
        onload: (r) => log('pushed:', r.status, String(r.responseText || '').slice(0, 120)),
        onerror: (e) => log('push failed:', e),
      })
    } else {
      fetch(API_URL, { method: 'POST', headers, body })
        .then((r) => r.text().then((t) => log('pushed:', r.status, t.slice(0, 120))))
        .catch((e) => log('push failed:', e))
    }
  }

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

  // ─── mount a hidden widget that lives alongside IDLIX's own ─────────────
  const mount = (turnstile) => {
    const host = document.createElement('div')
    host.id = 'idlix-forwarder-widget'
    // Visible-but-invisible: Turnstile refuses to render in display:none containers.
    host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:300px;height:65px;pointer-events:none;'
    document.body.appendChild(host)

    let widgetId = null
    let lastSentAt = 0

    const onToken = (token) => {
      if (typeof token !== 'string' || token.length < 20) return
      send(token)
      lastSentAt = Date.now()
      // Rotate: generate the next token after INTERVAL_MS.
      setTimeout(() => {
        try { turnstile.reset(widgetId) } catch (e) { log('reset failed:', e) }
      }, INTERVAL_MS)
    }

    try {
      widgetId = turnstile.render(host, {
        sitekey: SITE_KEY,
        action: ACTION,
        theme: 'light',
        size: 'invisible',
        callback: onToken,
        'error-callback': (code) => {
          log('turnstile error:', code)
          // Back off on errors, then try again.
          setTimeout(() => { try { turnstile.reset(widgetId) } catch {} }, 30_000)
        },
        'expired-callback': () => { try { turnstile.reset(widgetId) } catch {} },
      })
      log('widget mounted, siteKey=', SITE_KEY)

      // Safety net: if the invisible widget never fires its callback for 60s,
      // nudge it. Happens occasionally when the page loads over a flaky net.
      setInterval(() => {
        if (Date.now() - lastSentAt > 60_000 + INTERVAL_MS) {
          try { turnstile.reset(widgetId) } catch {}
        }
      }, 30_000)
    } catch (e) {
      log('render failed:', e)
    }
  }

  // ─── go ────────────────────────────────────────────────────────────────
  loadTurnstile()
    .then((turnstile) => {
      // Give the page a beat to finish setting up — avoids racing their own
      // Turnstile init on first load.
      setTimeout(() => mount(turnstile), 2_000)
    })
    .catch((e) => log('bootstrap failed:', e))
})()
