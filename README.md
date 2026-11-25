# Movie API

A REST API for browsing movies and TV series, with full end-to-end stream resolution — built with **Hono** + **TypeScript**, deployed on **Fly.io**. Uses TLS fingerprint spoofing (`got-scraping`) to pass Cloudflare, a signal-driven Turnstile token pool for CAPTCHA-gated endpoints, and an HLS proxy that rewrites the playlist chain so clients can actually play back the stream.

The project ships with its own documentation SPA at `/docs` (not Swagger), a standalone player at `/player`, and a userscript that keeps the token pool alive without polling.

---

## Highlights

- **24 endpoints** covering home, movies, series, search, browse (genre/country/year/network), leaderboard, stream resolution
- **End-to-end streaming** — resolve → proxy → play, with HLS segment URLs rewritten to carry the signed `t=` token across rotating CDN hostnames
- **Signal-driven Turnstile pool** — one small widget solves on demand via `/tokens/wait` long-polling; zero wasted solves
- **Custom docs SPA** — hand-built Vite + React reference with three-column layout, `⌘K` fuzzy search, live Try-It panel, syntax-highlighted responses. Swagger UI kept at `/swagger` as a fallback
- **Zero-config Fly deploy** — multi-stage Dockerfile, GitHub Actions workflow, scale-to-zero
- **Browser-ready** — CORS open, the proxy serves the whole m3u8 chain back to hls.js or any native HLS player
- **133 tests**, strict TypeScript across both the API and the docs SPA

---

## Quick start

```bash
# install
npm install

# copy env template, then edit .env for your upstream + pool secret
cp .env.example .env

# API (hot reload)
npm run dev

# docs SPA (separate dev server with hot reload at :5173, proxies /openapi.json to :4000)
npm run docs:dev

# production build of docs + run API serving them
npm run docs:build
npm start
```

**API:** `http://localhost:4000`
**Docs:** `http://localhost:4000/docs` (after `docs:build`)
**Player:** `http://localhost:4000/player?src=<streamUrl>`
**OpenAPI spec:** `http://localhost:4000/openapi.json`
**Swagger UI (fallback):** `http://localhost:4000/swagger`

---

## Architecture

```
┌──────────────────┐        ┌──────────────────────────────────────────────┐
│ Clients          │        │ hono-movie-api (Fly.io, shared-cpu 256MB)    │
│  (web, mobile,   │ HTTPS  │                                              │
│   RN, cURL)      │─────▶ │  Hono router                                  │
└──────────────────┘        │   ├─ /openapi.json, /docs (SPA), /swagger    │
                            │   ├─ /home, /movies, /series, /search,       │
                            │   │   /browse, /leaderboard  (public lists)  │
                            │   ├─ /movies/:slug/stream  (6-step chain +   │
                            │   │   Turnstile token consumption)           │
                            │   ├─ /stream/proxy  (rewrites m3u8, forwards │
                            │   │   `t=` token onto every variant/segment) │
                            │   └─ /tokens, /tokens/wait, /tokens/needs    │
                            │       (pool + signal channel)                │
                            │                                              │
                            │  got-scraping ──▶ Cloudflare-fronted         │
                            │  (TLS fingerprint       upstream (IDLIX /    │
                            │   spoofed)              majorplay / rotating │
                            │                         CDN hostnames)       │
                            └──────────────────────────────────────────────┘
                                     ▲                       ▲
                                     │ POST tokens           │ GET /tokens/wait
                                     │ (via GM_xhr)          │ (long-poll)
                                     │                       │
                            ┌──────────────────┐   ┌─────────────────┐
                            │  Upstash Redis   │   │  Userscript     │
                            │  (token pool,    │   │  (Tampermonkey  │
                            │   shared across  │   │   on an IDLIX   │
                            │   machines)      │   │   tab)          │
                            └──────────────────┘   └─────────────────┘
```

**Why each piece exists:**

- **`got-scraping`** — upstream is behind Cloudflare with TLS fingerprinting. Plain `fetch`/`node:https` gets `403 Attention Required`. `got-scraping` sends a real Chrome TLS ClientHello, so Cloudflare lets it through.
- **Turnstile token pool** — upstream added a Cloudflare Turnstile gate to the stream claim step. The API can't solve CAPTCHAs, so it maintains a small pool of fresh tokens generated client-side by a userscript on an actual IDLIX tab.
- **Signal-driven refill** — the pool used to be topped up on a 15-second timer, which produced 5,760 solves/day and burned Cloudflare reputation. Now the server emits a `need` event each time it pops a token, and the userscript (long-polling via `GM_xmlhttpRequest`) solves exactly one replacement. Solves-per-day now ≈ streams-per-day.
- **`/stream/proxy`** — three walls stop a client playing the resolved stream URL directly: (1) majorplay's CDN demands `Referer: https://majorplay.net/`, (2) the signed `?t=TOKEN` doesn't propagate from the master manifest to variants/segments, (3) browsers can't set `Referer` on their own XHR. The proxy fetches each hop server-side with `got-scraping`, rewrites every URL in the m3u8 chain, and returns a playable manifest.
- **Upstash Redis** — the token pool and cache survive restarts and work across multiple Fly machines. Falls back to in-memory if `UPSTASH_*` env vars are unset.

---

## API reference

Every response envelopes the payload:

```json
{ "success": true, "data": ... }
```

Errors return `success: false` with a `message` field and the right HTTP status.

**The interactive reference at [`/docs`](src/routes/docs.ts)** has request builder, response examples in cURL/JavaScript/Node/Python, and a live Try-It panel. The condensed endpoint list:

| Route | Returns |
|---|---|
| `GET /` | API health + version |
| `GET /home`, `/home/sections`, `/home/featured`, `/home/recent` | Homepage items, grouped or flat |
| `GET /movies`, `/movies/trending` | Paginated movie lists (36/page) |
| `GET /movies/:slug` | Full movie metadata (cast, overview, trailer, keywords) |
| `GET /movies/:slug/stream` | `{streamUrl, subtitles, title, durationSec}` — see [Stream chain](#the-stream-chain) |
| `GET /series`, `/series/trending` | Paginated series lists |
| `GET /series/:slug` | Full series metadata including seasons + episodes |
| `GET /series/:slug/stream` | Stream for S01E01 of the first regular season |
| `GET /series/:slug/season/:s/episode/:e/stream` | Stream for a specific episode |
| `GET /search?q=` | Full-text search across movies + series |
| `GET /browse/genres`, `/browse/countries`, `/browse/years`, `/browse/networks` | Filter facets |
| `GET /browse/genre/:slug`, `/browse/country/:code`, `/browse/year/:year`, `/browse/network/:slug` | Paginated browse |
| `GET /leaderboard` | This month's top movies, series, reviews, comments |
| `GET /tokens` | Pool size (public, no secret) |
| `POST /tokens` | Push a token (gated by `x-pool-secret` header) |
| `GET /tokens/wait?timeout=25` | Long-poll — resolves 200 on `need`, 204 on timeout |
| `GET /tokens/needs` | SSE channel — same semantics, for clients that can use EventSource |
| `GET /stream/proxy?url=` | Fetch-and-rewrite any upstream m3u8/segment |
| `GET /player?src=` | Standalone hls.js player for testing |

---

## The stream chain

Resolving a playable URL takes six upstream hops:

1. **Resolve UUID** — `GET /api/movies/:slug` on upstream
2. **Track view** — `POST /api/views/track` (best-effort analytics)
3. **Get gate token** — `GET /api/watch/play-info/:type/:uuid` (returns the Turnstile `siteKey` + `action`)
4. **Wait** — upstream enforces a ~15-second countdown
5. **Claim session** — `POST /api/watch/session/claim` with the `verificationToken` from the pool (or the caller's header)
6. **Redeem** — `POST /api/watch/session/redeem` with `mode: "browser"` → returns the final `config-xxx.json` (an HLS master manifest)

The first call to an uncached slug takes 15–30 seconds. Subsequent calls within 15 minutes hit the cache and return in milliseconds.

### Turnstile verification

If the pool is empty and the caller doesn't supply a token, the endpoint returns `503`:

```json
{
  "success": false,
  "message": "Stream unavailable: upstream now requires human verification (Turnstile) for playback",
  "verification": { "siteKey": "0x4AAAA...", "action": "play", "tokenRejected": false }
}
```

To supply your own token: render the Turnstile widget with the returned `siteKey`+`action`, let a person solve it, and retry with the token in `X-Verification-Token` header (preferred — query strings end up in access logs) or `verificationToken` query. Each token is single-use and lasts ~5 minutes.

Tokens from the pool get up to 3 retries if one is rejected mid-request. A caller-supplied token gets exactly one shot — reject → `403` with `tokenRejected: true`.

---

## Token pool (signal-driven)

The pool holds up to 50 Turnstile tokens with a ~4.5-minute TTL. The userscript pushes fresh tokens; the stream handler pops one per request.

**Supply follows demand, not a timer:**

```
/stream request lands
  ↓
pool.pop() → tokenEvents.emit('need')
  ↓                    ↓
/stream continues    /tokens/wait handler resolves 200
  ↓                    ↓
upstream chain      userscript's GM_xhr onload fires
  ↓                    ↓
response returned   turnstile.execute() → fresh token
                       ↓
                    POST /tokens → pool.push(token)
                       ↓
                    userscript reconnects /tokens/wait
```

**Two transports available for the signal:**

- `/tokens/wait?timeout=25` — HTTP long-poll. Holds connection open up to 25s, returns `200 {event:"need"}` when fired or `204` on timeout. **This is what the userscript uses** because IDLIX's `connect-src` CSP blocks cross-origin `EventSource` but `GM_xmlhttpRequest` bypasses CSP entirely.
- `/tokens/needs` — Server-Sent Events. Sends `hello` on connect, `need` on event, `ping` every 25s. Use for anything that can speak SSE without CSP trouble (curl, server-to-server, a VPS Playwright runner).

### Userscript setup

The forwarder lives at [`userscript/idlix-token-forwarder.user.js`](userscript/idlix-token-forwarder.user.js) (v3.1.0).

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser (Firefox or Chrome)
2. Open the userscript file, edit three constants at the top:
   - `API_BASE` — your API URL (e.g. `https://hono-movie-api.fly.dev`)
   - `POOL_SECRET` — must match `TOKEN_POOL_SECRET` on your server
   - `SITE_KEY` — IDLIX's current Turnstile site key (only change if upstream rotates it)
3. Paste the full file into Tampermonkey → new script → save
4. Open any page on the upstream site (e.g. `https://z3.idlixku.com/`) and leave the tab open. Console should log:
   ```
   [idlix-forwarder] widget mounted (execute mode), siteKey= 0x...
   [idlix-forwarder] long-poll connected
   ```
5. Hit `GET https://your-api.fly.dev/tokens` → should see `size >= 1` within a few seconds

**Steady-state behavior:** the userscript keeps 1 long-poll open to `/tokens/wait`. On startup it tops up to `BUFFER_TARGET` (default 2). Every `/stream` request that pops a token triggers one solve to replace it. **~95% reduction in solves vs. the old 15-second timer.**

### Pool backend

- **In-memory (default)** — one Node process, lost on restart. Fine for solo testing.
- **Upstash Redis** — set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` and the pool survives restarts and shares across multiple Fly machines. Free tier (10K commands/day) covers this workload with huge headroom.

---

## Playing streams

The resolved `streamUrl` (an HLS master manifest at `e2e.majorplay.net`) **cannot be played directly** by any client. Three stacking walls:

1. **Referer gate** — majorplay's CDN rejects requests without `Referer: https://majorplay.net/`
2. **Token propagation** — the master's `?t=TOKEN` doesn't appear in the variant/segment URLs the player will fetch next
3. **Rotating segment hosts** — segments live on random throwaway domains (`g6.akademivo.website`, `g6.edubambu.store`, …)

`/stream/proxy` solves all three. It fetches each hop server-side (passing Cloudflare via `got-scraping`), rewrites every URL in the m3u8 to proxy back through itself with the token inherited, and returns a playable manifest.

### Web — hls.js

Full proxy (every byte through your Fly machine). Open the included player page:

```
https://your-api.fly.dev/player?src=<encoded-streamUrl>
```

Or in your own HTML:

```html
<video id="v" controls></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script>
  const hls = new Hls()
  hls.loadSource('https://your-api.fly.dev/stream/proxy?url=' + encodeURIComponent(streamUrl))
  hls.attachMedia(document.getElementById('v'))
</script>
```

### Mobile — react-native-video / expo-video

Same shape, but native players can set `Referer` directly:

```jsx
import Video from 'react-native-video'

<Video
  source={{
    uri: `https://your-api.fly.dev/stream/proxy?url=${encodeURIComponent(streamUrl)}`,
    headers: { Referer: 'https://majorplay.net/' },
  }}
  controls
  resizeMode="contain"
  style={{ width: '100%', aspectRatio: 16/9 }}
  textTracks={subtitles.map((s, i) => ({
    title: s.label,
    language: s.lang,
    type: 'text/vtt',
    uri: `https://your-api.fly.dev/stream/proxy?url=${encodeURIComponent(s.url)}`,
  }))}
/>
```

Native players have no CORS and no TLS fingerprint fight to lose — the proxy still handles the token rewriting work.

---

## Deployment

### Fly.io (primary)

The repo ships a [multi-stage Dockerfile](Dockerfile), a [`fly.toml`](fly.toml), and a [GitHub Actions workflow](.github/workflows/fly-deploy.yml) that auto-deploys on push to `main`.

**One-time setup:**

```powershell
# install flyctl
# https://fly.io/docs/flyctl/install/

fly auth signup   # or `fly auth login`
fly launch --copy-config --no-deploy   # picks up fly.toml
```

**Set secrets** (encrypted, only visible to the running app):

```powershell
fly secrets set BASE_URL=https://z3.idlixku.com
fly secrets set TOKEN_POOL_SECRET=<generate a long random string>
fly secrets set UPSTASH_REDIS_REST_URL=<from upstash.com>
fly secrets set UPSTASH_REDIS_REST_TOKEN=<from upstash.com>
```

**Deploy** (manual, one-shot):

```powershell
fly deploy
```

**Deploy via GitHub Actions** (preferred — auto-fires on push to `main`):

```powershell
fly tokens create deploy -x 999999h
# copy the output, then: GitHub → repo → Settings → Secrets → Actions
# → New repository secret → name: FLY_API_TOKEN, value: <token>
```

Subsequent pushes to `main` trigger the workflow at [`.github/workflows/fly-deploy.yml`](.github/workflows/fly-deploy.yml), which runs `flyctl deploy --remote-only`. Build takes ~3 min (stage 1 builds the Vite docs SPA, stage 2 assembles the runtime image with `tsx` + `src/` + `docs-dist/`).

Scale-to-zero is on by default (`min_machines_running = 0`). First request after idle adds ~3–6 seconds of cold start. Bump to `1` in `fly.toml` if you want always-warm (~$3/mo at 24/7 runtime).

### Vercel (not supported)

Don't. Vercel's Node runtime applies a datacenter TLS fingerprint on top of outbound sockets that Cloudflare detects and blocks with `403 Attention Required` — defeating `got-scraping`'s entire reason to exist. An earlier commit had a working Vercel bridge (`api/index.ts` + `vercel.json`) that deployed cleanly but every upstream request 403'd. The files have been removed after confirming the wall is architectural, not configurable; see git history if you need the setup for a non-Cloudflare-fronted source.

### Other hosts

Any plain Node 20+ host (Railway, Render, DigitalOcean App Platform, bare VPS, Docker anywhere) works. The Dockerfile is portable. Set the four env vars, map port 8080, and go.

---

## Environment variables

| Variable | Default | Required for | Notes |
|---|---|---|---|
| `PORT` | `4000` | always | HTTP port the API listens on. Fly sets it to `8080`. |
| `BASE_URL` | `https://z3.idlixku.com` | always | Upstream site root. Change if IDLIX rotates domains. |
| `TOKEN_POOL_SECRET` | _(unset)_ | token pool | Shared secret the userscript sends in `x-pool-secret`. Without it, `POST /tokens` returns `404` and the pool is disabled. |
| `UPSTASH_REDIS_REST_URL` | _(unset)_ | multi-instance pool | Upstash REST URL. Without it, pool is in-memory per-process. |
| `UPSTASH_REDIS_REST_TOKEN` | _(unset)_ | multi-instance pool | Upstash REST auth token. |

---

## Development

### Scripts

```bash
npm run dev           # API, hot reload (tsx watch)
npm start             # API, no watch
npm run docs:dev      # Vite dev server for docs SPA at :5173
npm run docs:build    # Build docs into docs-dist/ (consumed by the API's static server)
npm run docs:preview  # Preview the built docs bundle
npm run typecheck     # tsc on src/ AND docs/
npm test              # vitest run (133 tests)
npm run test:watch    # vitest watch mode
npm run build         # tsup bundle for the API (optional; Fly uses tsx directly)
```

### Project structure

```
src/                         # API source (Hono + got-scraping)
├── app.ts                   # Hono app composition
├── index.ts                 # Node server entry
├── client.ts                # got-scraping wrapper (request, requestUrl, requestRaw, getJson, postJson)
├── cache.ts                 # In-memory TTL cache
├── homepage.ts              # Homepage fetch + section helpers
├── mapper.ts                # Upstream → clean shape
├── openapi.ts               # OpenAPI 3.1 spec
├── stream.ts                # The 6-step chain
├── streamResponse.ts        # Shared cache + error handling, token signal emission
├── tokenPool.ts             # In-memory + Upstash backends behind a common interface
├── tokenEvents.ts           # EventEmitter bus — emits 'need' on token pop
├── types.ts                 # Shared TypeScript types
├── validate.ts              # Param validation
└── routes/
    ├── docs.ts              # /docs (SPA static), /swagger, /openapi.json
    ├── home.ts              # Homepage sections
    ├── movies.ts            # Movies + streams
    ├── series.ts            # Series + episodes + streams
    ├── search.ts            # Search
    ├── browse.ts            # Facets + filtered lists
    ├── leaderboard.ts       # Monthly rankings
    ├── tokens.ts            # Pool POST/GET + /wait long-poll + /needs SSE
    ├── proxy.ts             # HLS manifest/segment proxy
    └── player.ts            # Standalone hls.js test page

docs/                        # Vite + React SPA (reference site at /docs)
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx              # Three-column layout, route by hash
    ├── api.ts               # OpenAPI loader + endpoint model
    ├── styles.css           # Tailwind + design tokens
    ├── components/
    │   ├── Overview.tsx     # Landing page
    │   ├── Sidebar.tsx      # Collapsible endpoint nav, Cmd+K trigger
    │   ├── TopBar.tsx       # Sticky breadcrumb header
    │   ├── EndpointView.tsx # Doc column
    │   ├── RequestPanel.tsx # Right column — code samples + Try It
    │   ├── CommandPalette.tsx
    │   ├── MobileDrawer.tsx
    │   ├── SchemaView.tsx   # Recursive schema explorer
    │   ├── CodeBlock.tsx    # Syntax-highlighted code + copy
    │   ├── Highlight.tsx    # Hand-rolled tokenizer
    │   └── ui.tsx           # Shared primitives (MethodBadge, Pill, Section)
    └── lib/
        ├── codegen.ts       # cURL/JavaScript/Node/Python sample generation
        └── highlight.ts     # Per-language token logic (JSON, bash, JS, Python, HTTP)

userscript/
└── idlix-token-forwarder.user.js  # Tampermonkey v3.1.0 — hidden widget + long-poll

.github/workflows/
└── fly-deploy.yml           # Auto-deploy on push to main

Dockerfile                   # Multi-stage: build docs → runtime image
fly.toml                     # Fly config (region, memory, scale-to-zero)
vite.config.ts               # Vite root = docs/, outDir = docs-dist/
tailwind.config.js
postcss.config.js
tsconfig.json                # API typecheck
tsconfig.docs.json           # Docs SPA typecheck
vitest.config.ts             # Keeps test discovery rooted at repo root
```

### Testing

```bash
npm test
```

133 tests covering: route shapes, OpenAPI consistency (every documented path must match a registered GET route), schema references, stream chain error handling, token pool semantics (both in-memory and Upstash), param validation.

The OpenAPI test is strict — if you add a new GET route, you must either document it in [`src/openapi.ts`](src/openapi.ts) or add its path to the `DOC_ROUTES` exclusion set in [`src/openapi.test.ts`](src/openapi.test.ts).

---

## Caching

| Data | TTL |
|---|---|
| Homepage (`/home*`, `/series/trending`) | 1 hour |
| Movie/series/network lists | 1 hour |
| Leaderboard | 1 hour |
| Movie/series detail | 2 hours |
| Search results | 30 min |
| Genres / countries / networks | 24 hours |
| Resolved stream URLs | 15 min |
| Failed stream lookups | 5 min |

Cache is in-memory and resets on restart. Upstash is used only for the token pool, not application-level caching — that's a conscious choice to keep Redis cost near zero; the stream cache benefits from being per-machine anyway.

---

## FAQ / operational notes

**Q: What does the pool actually need? How many tokens?**
A: `BUFFER_TARGET = 2` is the default in the userscript. Pool caps at 50. Steady state with the signal-driven refill is 1-3 tokens hot; bursts of concurrent stream requests briefly drain it, the userscript solves replacements, pool returns to baseline within ~3-5 seconds per solve.

**Q: Can I run the userscript on a headless VPS instead of my browser?**
A: Yes. Playwright on a $5/mo Linux box, visit the upstream, inject the same widget-mount logic as the userscript, keep the process alive with systemd. ~40 lines. Use the SSE channel (`/tokens/needs`) in a headless env since you control the CSP.

**Q: Why is my `/stream` request returning 503?**
A: Token pool is empty AND you didn't send `X-Verification-Token`. Either keep the userscript running (so the pool stays warm) or render a Turnstile widget client-side with the `siteKey` from the 503 and retry with the solved token.

**Q: Why not use Playwright on the API server to solve Turnstile?**
A: Turnstile tokens are domain-bound. A widget rendered on your domain with IDLIX's site key fails with `110200 Domain not allowed`. The token has to be generated on IDLIX's own origin, which is why a userscript (or a Playwright runner visiting IDLIX directly) is the only path.

**Q: Does the `/stream/proxy` double my bandwidth?**
A: Yes, for web clients. Every video byte flows through your Fly machine. For native mobile clients that can set `Referer`, a hybrid mode where only the manifest is proxied and segments go direct from the phone to the CDN cuts your bandwidth by ~99.99%. Not implemented in the current code — straightforward to add (~20 lines) if you need it.

**Q: IDLIX changed their upstream. Everything broke. Now what?**
A: Check which step of [`src/stream.ts`](src/stream.ts) is failing in the logs. The chain is numbered, the error messages name the hop. Common changes: new Turnstile site key (update `SITE_KEY` in the userscript), new redeem endpoint path (update the normalizer in `stream.ts`), rotated base URL (change `BASE_URL`).

---

## License

MIT
