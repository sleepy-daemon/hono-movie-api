import 'dotenv/config'

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

export async function request(
  path: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<FetchResult> {
  const url = `${BASE_URL}${path}`
  try {
    const got = await getGot()
    const res = await got({
      url,
      method: (options.method ?? 'GET') as 'GET' | 'POST',
      body: options.body,
      headers: { ...BASE_HEADERS, ...options.headers },
      http2: true,
      followRedirect: true,
      timeout: { request: 60_000 },
      retry: { limit: 2 },
    })
    return { status: res.statusCode, ok: res.statusCode < 400, text: res.body }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[client] ${options.method ?? 'GET'} ${path}:`, msg)
    return { status: 0, ok: false, text: msg }
  }
}

export async function getJson<T = unknown>(path: string): Promise<T | null> {
  const res = await request(path, { headers: { accept: 'application/json' } })
  if (!res.ok) return null
  return parseJson<T>(res.text, `GET ${path}`)
}

export async function postJson<T = unknown>(path: string, body: unknown): Promise<T | null> {
  const res = await request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: BASE_URL, referer: `${BASE_URL}/` },
  })
  if (!res.ok) return null
  return parseJson<T>(res.text, `POST ${path}`)
}

function parseJson<T>(text: string, label: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch (err) {
    console.error(`[client] ${label}: invalid JSON response:`, err instanceof Error ? err.message : err)
    return null
  }
}

export { BASE_URL }
