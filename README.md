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

| Variable   | Default                    | Description              |
|------------|----------------------------|--------------------------|
| `PORT`     | `4000`                     | Port to listen on        |
| `BASE_URL` | `https://z3.idlixku.com`   | Upstream site base URL   |

### 3. Run

```bash
# Development (auto-restart on change)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:4000`.

---

## Project Structure

```
src/
├── index.ts          # Entry point — Hono app + server
├── client.ts         # got-scraping HTTP wrapper (Cloudflare bypass)
├── cache.ts          # In-memory TTL cache
├── mapper.ts         # Normalize raw upstream data into clean shapes
├── stream.ts         # 6-step stream chain (get .m3u8 + subtitles)
├── types.ts          # Shared TypeScript types
└── routes/
    ├── home.ts       # Home & sections
    ├── movies.ts     # Movie browse, detail, stream
    ├── series.ts     # Series browse, detail, episode stream
    ├── search.ts     # Search
    └── browse.ts     # Filter by genre, country, year
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

#### `GET /series/:slug/season/:season/episode/:episode/stream`

Fetch the stream URL and subtitles for a specific episode.

> ⚠️ Same caveats as the movie stream endpoint — first call may be slow.

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

---

## Caching

Responses are cached in-memory to reduce upstream requests.

| Data               | TTL      |
|--------------------|----------|
| Home / sections    | 1 hour   |
| Movie/series list  | 1 hour   |
| Movie/series detail| 2 hours  |
| Search results     | 30 min   |
| Genres/countries   | 24 hours |
| Stream URLs        | 15 min   |

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
