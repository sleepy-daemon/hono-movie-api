import 'dotenv/config'
import { CookieJar } from 'tough-cookie'

const BASE_URL = process.env.BASE_URL ?? 'https://z3.idlixku.com'

type FetchResult = { status: number; ok: boolean; text: string }

let _got: Awaited<typeof import('got-scraping')>['gotScraping'] | null = null
async function getGot() {
  if (!_got) {
    const mod = await import('got-scraping')
    _got = mod.gotScraping
  }
  return _got
}

const BASE_HEADERS = { 'accept-language': 'en-US,en;q=0.9' }

// Process-wide jar so cookies set by upstream (anti-bot clearance, etc.) are
// replayed on later requests instead of being dropped after each response.
const sharedJar = new CookieJar()

/**
 * Copy of the shared jar for a multi-step flow (e.g. a playback session) so
 * cookies it receives don't leak into, or get clobbered by, concurrent flows.
 */
export function forkCookieJar(): Promise<CookieJar> {
  return sharedJar.clone()
}

export type RequestOptions = { cookieJar?: CookieJar }

export async function request(
  path: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } & RequestOptions = {}
): Promise<FetchResult> {
  return requestUrl(`${BASE_URL}${path}`, options, path)
}

/**
 * Like request(), but accepts an absolute URL. Needed for redirects to
 * a redeem endpoint upstream can now hand back as same-host, which still
 * goes through Cloudflare and needs got-scraping's TLS spoofing.
 */
export async function requestUrl(
  url: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } & RequestOptions = {},
  logLabel: string = url
): Promise<FetchResult> {
  try {
    const got = await getGot()
    const res = await got({
      url,
      method: (options.method ?? 'GET') as 'GET' | 'POST',
      body: options.body,
      headers: { ...BASE_HEADERS, ...options.headers },
      cookieJar: options.cookieJar ?? sharedJar,
      http2: true,
      followRedirect: true,
      timeout: { request: 60_000 },
      retry: { limit: 2 },
    })
    const ok = res.statusCode < 400
    if (!ok) {
      console.error(`[client] ${options.method ?? 'GET'} ${logLabel}: HTTP ${res.statusCode}`, res.body.slice(0, 200))
    }
    return { status: res.statusCode, ok, text: res.body }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[client] ${options.method ?? 'GET'} ${logLabel}:`, msg)
    return { status: 0, ok: false, text: msg }
  }
}

export async function getJson<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T | null> {
  const res = await request(path, { ...opts, headers: { accept: 'application/json' } })
  if (!res.ok) return null
  return parseJson<T>(res.text, `GET ${path}`)
}

export async function postJson<T = unknown>(path: string, body: unknown, opts: RequestOptions = {}): Promise<T | null> {
  const res = await postJsonResult<T>(path, body, opts)
  return res.ok ? res.data : null
}

export type JsonResult<T> =
  | { ok: true; status: number; data: T | null }
  | { ok: false; status: number; data: unknown }

/**
 * Like postJson, but keeps the status and parsed body of error responses so
 * callers can act on upstream error codes.
 */
export async function postJsonResult<T = unknown>(path: string, body: unknown, opts: RequestOptions = {}): Promise<JsonResult<T>> {
  const res = await request(path, {
    ...opts,
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: BASE_URL, referer: `${BASE_URL}/` },
  })
  if (res.ok) return { ok: true, status: res.status, data: parseJson<T>(res.text, `POST ${path}`) }
  return { ok: false, status: res.status, data: parseErrorBody(res.text) }
}

function parseJson<T>(text: string, label: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch (err) {
    console.error(`[client] ${label}: invalid JSON response:`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Error bodies may be HTML or a network error message rather than JSON.
 * request() has already logged them, so a non-JSON body just yields null.
 */
function parseErrorBody(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export { BASE_URL }
