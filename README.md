# Movie API

A REST API for browsing movies and TV series, built with **Hono** + **TypeScript**. Uses TLS fingerprint spoofing via `got-scraping` to fetch data without needing a headless browser.

## Stack

- [Hono](https://hono.dev/) — lightweight TypeScript web framework
- [got-scraping](https://github.com/apify/got-scraping) — HTTP client with Cloudflare bypass
- [tsx](https://github.com/privatenumber/tsx) — run TypeScript directly
- Node.js 20+

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

| Variable                     | Default                    | Description                                                                 |
|------------------------------|----------------------------|-----------------------------------------------------------------------------|
| `PORT`                       | `4000`                     | Port to listen on                                                           |
| `BASE_URL`                   | `https://z3.idlixku.com`   | Upstream site base URL                                                      |
| `TOKEN_POOL_SECRET`          | _(unset — pool disabled)_  | Shared secret the Turnstile token forwarder sends in `x-pool-secret`        |
| `UPSTASH_REDIS_REST_URL`     | _(unset — in-memory pool)_ | Upstash REST URL for a shared pool across lambdas (Vercel-ready)            |
| `UPSTASH_REDIS_REST_TOKEN`   | _(unset — in-memory pool)_ | Upstash REST token to pair with the URL above                               |

### 3. Run

```bash
# Development (auto-restart on change)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:4000`.

Interactive API docs (Swagger UI) are at `http://localhost:4000/docs`, and the raw OpenAPI 3.1 spec is at `/openapi.json`.

### 4. Test

```bash
npm test           # run the test suite once
npm run typecheck  # type-check without emitting
```

---

## Project Structure

```
src/
├── index.ts          # Entry point — Hono app + server
├── client.ts         # got-scraping HTTP wrapper (Cloudflare bypass)
├── cache.ts          # In-memory TTL cache (LRU, max 1000 entries)
├── homepage.ts       # Cached upstream homepage + section helpers
├── mapper.ts         # Normalize raw upstream data into clean shapes
├── openapi.ts        # OpenAPI 3.1 spec served at /openapi.json
├── stream.ts         # 6-step stream chain (get .m3u8 + subtitles)
├── streamResponse.ts # Shared caching and error responses for stream routes
├── types.ts          # Shared TypeScript types
├── validate.ts       # Param validation (slug, year, page, integers)
└── routes/
    ├── docs.ts       # Swagger UI (/docs) and spec (/openapi.json)
    ├── home.ts       # Home, sections, featured, recently added
    ├── movies.ts     # Movie browse, detail, stream
    ├── series.ts     # Series browse, detail, episode stream
    ├── search.ts     # Search
    ├── browse.ts     # Filter by genre, country, year, network
    └── leaderboard.ts # Monthly top titles, reviews and comments
```

---

## API Reference

All responses follow this envelope:

```json
{
  "success": true,
  "data": ...
}
```

Errors return `success: false` with a `message` field and the appropriate HTTP status code.

For an interactive version of this reference with "Try it out", open `/docs` on a running server.

---

### General

#### `GET /`

Health check.

```json
{
  "success": true,
  "message": "Movie API",
  "version": "1.0.0"
}
```

---

### Home

#### `GET /home`

Returns a flat list of all items from the homepage (trending + recently added + network originals).

**Response**

```json
{
  "success": true,
  "data": [
    {
      "title": "The Dark Knight",
      "year": 2008,
      "type": "movie",
      "quality": "HD",
      "rating": 9.0,
      "poster": "https://image.tmdb.org/t/p/w300/...",
      "slug": "the-dark-knight-2008"
    }
  ]
}
```

#### `GET /home/sections`

Same data grouped by section name.

```json
{
  "success": true,
  "data": {
    "Trending Now": [...],
    "Recently Added Movies": [...],
    "Netflix Originals": [...]
  }
}
```

#### `GET /home/featured`

Titles from the homepage's "Featured" section.

#### `GET /home/recent`

Recently added titles from the homepage.

| Query Param | Type                        | Default | Description  |
|-------------|-----------------------------|---------|--------------|
| `type`      | `movie\|series\|episode`    | `movie` | Which list   |

Items in lists have a `type` of `movie`, `series` or `episode`.

---

### Movies

#### `GET /movies`

Browse all movies, sorted by newest.

| Query Param | Type   | Default | Description  |
|-------------|--------|---------|--------------|
| `page`      | number | `1`     | Page number  |

#### `GET /movies/trending`

Browse trending movies by popularity score.

| Query Param | Type   | Default | Description  |
|-------------|--------|---------|--------------|
| `page`      | number | `1`     | Page number  |

#### `GET /movies/:slug`

Full metadata for a single movie.

**Example:** `GET /movies/the-dark-knight-2008`

```json
{
  "success": true,
  "data": {
    "title": "The Dark Knight",
    "year": 2008,
    "type": "movie",
    "runtime": "PT152M",
    "runtimeMinutes": 152,
    "overview": "Batman raises the stakes in his war on crime...",
    "poster": "https://image.tmdb.org/t/p/w300/...",
    "backdrop": "https://image.tmdb.org/t/p/w1280/...",
    "genres": ["Action", "Crime", "Thriller"],
    "language": "en",
    "country": "US",
    "director": "Christopher Nolan",
    "cast": [
      {
        "name": "Christian Bale",
        "character": "Bruce Wayne / Batman",
        "image": "https://image.tmdb.org/t/p/w185/..."
      }
    ],
    "trailer": "https://youtube.com/watch?v=...",
    "keywords": ["superhero", "dc comics", "gotham city"]
  }
}
```

#### `GET /movies/:slug/stream`

Fetch the stream URL and subtitles for a movie.

> ⚠️ This endpoint runs a multi-step chain against the upstream site. First call may take 15–30 seconds due to an upstream timer. Result is cached for 15 minutes.
>
> ⚠️ **Returns `503` unless you send a verification token.** Upstream requires a Cloudflare Turnstile check (a human verification CAPTCHA) before it hands out a stream, and this API does not solve CAPTCHAs. Without a token, the endpoint returns `503` with the Turnstile site key right away; it does not wait out the timer first. A person can complete the check and you retry with the token. See [Stream verification](#stream-verification).
>
> | Header / Query Param | Description |
> |---|---|
> | `X-Verification-Token` header (or `verificationToken` query) | Turnstile token a person solved for the site key from the `503`. Optional. |

**Example:** `GET /movies/the-dark-knight-2008/stream`

```json
{
  "success": true,
  "data": {
    "streamUrl": "https://cdn.majorplay.net/hls/....m3u8",
    "subtitles": [
      {
        "lang": "en",
        "label": "English",
        "url": "https://cdn.majorplay.net/subs/....vtt"
      }
    ],
    "title": "The Dark Knight",
    "durationSec": 9120
  }
}
```

---

### Series

#### `GET /series`

Browse all TV series, sorted by newest.

| Query Param | Type   | Default | Description  |
|-------------|--------|---------|--------------|
| `page`      | number | `1`     | Page number  |

#### `GET /series/trending`

Returns trending series from the homepage.

#### `GET /series/:slug`

Full metadata for a series, including all seasons and episodes.

**Example:** `GET /series/breaking-bad-2008`

```json
{
  "success": true,
  "data": {
    "title": "Breaking Bad",
    "year": 2008,
    "type": "series",
    "overview": "A high school chemistry teacher...",
    "genres": ["Drama", "Crime", "Thriller"],
    "seasons": [
      {
        "season": 1,
        "name": "Season 1",
        "episodeCount": 7,
        "episodes": [
          {
            "episode": 1,
            "title": "Pilot",
            "overview": "Walter White, a high school chemistry teacher..."
          }
        ]
      }
    ]
  }
}
```

#### `GET /series/:slug/stream`

Stream for episode 1 of the series' first regular season (season 0, specials, is skipped). Returns `404` if the series doesn't exist or has no episodes. Otherwise behaves like the episode stream below.

#### `GET /series/:slug/season/:season/episode/:episode/stream`

Fetch the stream URL and subtitles for a specific episode.

> ⚠️ Same caveats as the movie stream endpoint: first call may be slow, and it returns `503` unless you send a verification token (see [Stream verification](#stream-verification)).

**Example:** `GET /series/breaking-bad-2008/season/1/episode/1/stream`

```json
{
  "success": true,
  "data": {
    "streamUrl": "https://cdn.majorplay.net/hls/....m3u8",
    "subtitles": [
      {
        "lang": "en",
        "label": "English",
        "url": "https://cdn.majorplay.net/subs/....vtt"
      }
    ],
    "title": "Pilot",
    "durationSec": 3600
  }
}
```

---

### Search

#### `GET /search`

Search movies and series by title.

| Query Param | Type   | Required | Description   |
|-------------|--------|----------|---------------|
| `q`         | string | ✅        | Search term   |

**Example:** `GET /search?q=batman`

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "query": "batman",
    "count": 20
  }
}
```

---

### Browse

#### `GET /browse/genres`

List all available genres.

```json
{
  "success": true,
  "data": [
    { "name": "Action", "slug": "action" },
    { "name": "Comedy", "slug": "comedy" }
  ]
}
```

#### `GET /browse/countries`

List all available countries.

```json
{
  "success": true,
  "data": [
    { "name": "United States", "code": "us" }
  ]
}
```

#### `GET /browse/years`

List all available release years.

```json
{
  "success": true,
  "data": [2025, 2024, 2023, ...]
}
```

#### `GET /browse/genre/:slug`

Browse by genre.

**Example:** `GET /browse/genre/action?type=movie&page=1`

| Query Param | Type             | Default  | Description          |
|-------------|------------------|----------|----------------------|
| `type`      | `movie\|series`  | `movie`  | Content type filter  |
| `page`      | number           | `1`      | Page number          |

#### `GET /browse/country/:code`

Browse by country code.

**Example:** `GET /browse/country/us?type=series`

| Query Param | Type             | Default  | Description          |
|-------------|------------------|----------|----------------------|
| `type`      | `movie\|series`  | `movie`  | Content type filter  |
| `page`      | number           | `1`      | Page number          |

#### `GET /browse/year/:year`

Browse by release year.

**Example:** `GET /browse/year/2024?type=movie`

| Query Param | Type             | Default  | Description          |
|-------------|------------------|----------|----------------------|
| `type`      | `movie\|series`  | `movie`  | Content type filter  |
| `page`      | number           | `1`      | Page number          |

#### `GET /browse/networks`

List networks (Netflix, HBO, Disney+, …) with their slugs.

#### `GET /browse/network/:slug`

Titles from one network, newest first. Movies and series are mixed in one list, because upstream doesn't support filtering networks by type. Check each item's `type`.

**Example:** `GET /browse/network/netflix?page=2`

| Query Param | Type   | Default | Description |
|-------------|--------|---------|-------------|
| `page`      | number | `1`     | Page number |

---

### Leaderboard

#### `GET /leaderboard`

This month's rankings.

```json
{
  "success": true,
  "data": {
    "month": "2026-11",
    "updatedAt": "2026-11-24T17:39:12.839Z",
    "topMovies": [...],
    "topSeries": [...],
    "topWatchlisted": [...],
    "topFavourited": [...],
    "topReviews": [
      { "content": "...", "rating": 10, "createdAt": "...", "upvotes": 88, "author": "Reen", "target": { "type": "episode", "title": "...", "slug": "..." } }
    ],
    "topComments": [...]
  }
}
```

---

## Caching

Responses are cached in-memory to reduce upstream requests.

| Data               | TTL      |
|--------------------|----------|
| Homepage (all `/home*` routes, `/series/trending`) | 1 hour |
| Movie/series/network lists | 1 hour |
| Leaderboard        | 1 hour   |
| Movie/series detail| 2 hours  |
| Search results     | 30 min   |
| Genres/countries/networks | 24 hours |
| Stream URLs        | 15 min   |
| Failed stream lookups | 5 min |

Cache is in-memory and resets on server restart.

---

## How the Stream Chain Works

Getting a playable stream URL requires 6 steps against the upstream site:

1. **Resolve UUID** — `GET /api/movies/:slug` or `/api/series/:slug/season/:n`
2. **Track view** — `POST /api/views/track` (analytics, best-effort)
3. **Get gate token** — `GET /api/watch/play-info/:type/:uuid`
4. **Wait** — the upstream site enforces a ~15 second countdown timer
5. **Claim session** — `POST /api/watch/session/claim` with the gate token
6. **Redeem** — `POST` to `majorplay.net` to get the final `.m3u8` URL and `.vtt` subtitles

Stream URLs expire and are cached for only 15 minutes.

### Stream verification

Upstream now adds a `verification` block (a Cloudflare Turnstile site key) to the step 3 response, and step 5 rejects the claim with `403 VERIFICATION_REQUIRED` unless its body includes a solved Turnstile token as `verificationToken`. Turnstile is a CAPTCHA meant to confirm a human is present, and this API does not try to solve or bypass it. Instead, it passes through a token that a person solved.

**Without a token**, when step 3 includes a `verification` block and the pool is empty, the stream endpoints stop and return `503`:

```json
{
  "success": false,
  "message": "Stream unavailable: upstream now requires human verification (Turnstile) for playback",
  "verification": { "siteKey": "0x4AAAA...", "action": "play", "tokenRejected": false }
}
```

**With a token:**

1. Render the [Turnstile widget](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/) with the `siteKey` and `action` from the `503`, and let the person complete it.
2. Call the same stream endpoint again with the token in the `X-Verification-Token` header (or the `verificationToken` query param). Prefer the header, because query strings end up in access logs.
3. The API runs the full chain and sends the token with the claim in step 5. The resolved stream is cached for 15 minutes and served to everyone, with or without a token.

Each token is single use and expires after about 5 minutes. If upstream refuses it, the endpoint returns `403` with `"tokenRejected": true`. Get a new token and retry. A malformed token (whitespace, or longer than 2048 characters) returns `400`.

> **Limitation:** Cloudflare only issues tokens for a site key on the hostnames its owner allows. A widget rendered on your own domain with upstream's site key will most likely fail with a domain error, so in practice tokens can only come from a page on the upstream site.

If upstream drops the check, the chain runs as before and any token is ignored.

### Token pool (auto-fill the verification step)

For portfolio / personal use, the API can maintain a small pool of fresh tokens so that *callers never see a `503`*. A [Tampermonkey](https://www.tampermonkey.net/) userscript sits on the upstream site in your own browser and **renders its own hidden Turnstile widget** on every page you load. That widget produces tokens Cloudflare accepts (because they're generated on the upstream's own domain, same as a real player) but that nothing on the page actually uses — so each token lands in the pool fresh and unconsumed. The script rotates its widget every 15 seconds to keep a steady supply flowing. The stream endpoints silently pop one from the pool whenever a caller doesn't supply their own.

> **Why not just intercept the player's own tokens?** Turnstile tokens are single-use at Cloudflare's `siteverify` endpoint. The player's own tokens get consumed within milliseconds of generation by the player's claim call, so a token "stolen" from that flow is already dead. Rendering a parallel widget sidesteps that — those tokens are never fed to `siteverify` by anyone else.

**Setup:**

1. Set `TOKEN_POOL_SECRET=<any-string>` in your environment. Without it, `/tokens` returns `404` and the pool stays disabled.
2. For Vercel / multi-instance deployments, also set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (free tier at [upstash.com](https://upstash.com/)). Without them the pool is per-process in-memory, which is fine for a single server but lost across lambda cold starts.
3. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
4. Install [`userscript/idlix-token-forwarder.user.js`](userscript/idlix-token-forwarder.user.js), edit the `API_URL`, `POOL_SECRET`, and (if upstream rotates it) `SITE_KEY` constants at the top to match your deployment.
5. Open any page on the upstream site and leave the tab open. The script's hidden widget solves itself invisibly on page load and generates a fresh token every 15 seconds while the tab is alive. You don't have to click anything or play a movie — just have an upstream tab open.

**Endpoints:**

- `GET /tokens` — returns the current pool size. Useful for a status indicator.
- `POST /tokens` — expects `x-pool-secret` header and JSON body `{ "token": "<turnstile-token>" }`. Returns `{ success: true, data: { pooled: true, size: N } }`.

Tokens age out of the pool automatically after ~4.5 minutes (Turnstile tokens live ~5 min). When the stream chain pulls a stale one, it transparently pops the next one and retries up to 3 times before falling back to the `503` response.

**Rough capacity:** with one upstream tab open, the script generates ~4 tokens/minute = ~240/hour. The pool caps at 50, so leave any upstream page open for ~15 minutes and the pool stays saturated. Close the tab and the pool drains over the next ~5 minutes as tokens expire.

---

## Deployment

### Vercel

Add a `vercel.json` to the project root:

```json
{
  "builds": [{ "src": "src/index.ts", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "src/index.ts" }]
}
```

Set the `BASE_URL` environment variable in your Vercel project settings.

> **Note:** Vercel's free tier has a 10-second function timeout. Stream endpoints take 15–30 seconds on first call. Upgrade to Pro (60s timeout) or use a persistent host (Railway, Fly.io) for stream endpoints.

### Railway / Fly.io / Render

Any host that supports Node.js works. Set `PORT` and `BASE_URL` as environment variables and run:

```bash
npm start
```

---

## License

MIT
