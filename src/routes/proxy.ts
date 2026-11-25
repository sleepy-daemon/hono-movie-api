import { Hono } from 'hono'
import { requestRaw } from '../client.js'

const proxy = new Hono()

// IDLIX's streams fan out across randomly generated hostnames (g6.edubambu.store,
// g6.aspireheightsacademy.digital, etc.) that change per segment. We can't
// allowlist by host, so we gate on the URL path shape that is specific to their
// pipeline: /v/<slug>/<slug>/{config|data|p/.../cdn|i18n}/...
// IDLIX's segments land under /cdn/ (public pieces) and /cache/ (session cache),
// with subtitles under /i18n/ and manifests at the top of the id folder.
const PATH_PATTERN = /^\/v\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/(config-|data-|p\/[A-Za-z0-9_-]+\/(data-|cdn\/|cache\/)|i18n\/)/

function pathAllowed(url: URL): boolean {
  return PATH_PATTERN.test(url.pathname)
}

/**
 * Preserve the manifest's own query string (carries the signed `t=` token and
 * `pm=browser` flag) onto each descendant URL that doesn't already have one.
 * Every hop in the IDLIX chain — master → variant → segment — gets rejected
 * with HTTP 401 if the token is missing.
 */
function inheritQuery(absolute: string, manifestUrl: URL): string {
  const u = new URL(absolute)
  if (!u.search && manifestUrl.search) u.search = manifestUrl.search
  return u.toString()
}

function rewriteManifest(text: string, manifestUrl: URL, proxyOrigin: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, u) => {
          const abs = inheritQuery(new URL(u, manifestUrl).toString(), manifestUrl)
          return `URI="${proxyOrigin}/stream/proxy?url=${encodeURIComponent(abs)}"`
        })
      }
      const abs = inheritQuery(new URL(trimmed, manifestUrl).toString(), manifestUrl)
      return `${proxyOrigin}/stream/proxy?url=${encodeURIComponent(abs)}`
    })
    .join('\n')
}

proxy.get('/proxy', async (c) => {
  const target = c.req.query('url')
  if (!target) return c.json({ success: false, message: 'missing url' }, 400)

  let url: URL
  try {
    url = new URL(target)
  } catch {
    return c.json({ success: false, message: 'invalid url' }, 400)
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return c.json({ success: false, message: 'protocol not allowed' }, 403)
  }

  if (!pathAllowed(url)) {
    return c.json({ success: false, message: `path ${url.pathname} not allowed` }, 403)
  }

  const upstream = await requestRaw(url.toString(), {
    method: 'GET',
    headers: {
      Referer: 'https://majorplay.net/',
      Origin: 'https://majorplay.net',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  })

  if (!upstream.ok) {
    return c.json(
      { success: false, message: `upstream ${upstream.status}` },
      (upstream.status || 502) as 502
    )
  }

  const rawType = upstream.headers['content-type']
  const contentType = Array.isArray(rawType) ? rawType[0] : rawType ?? 'application/octet-stream'

  const bodyText = upstream.body.toString('utf8')
  const looksLikeM3u8 = bodyText.startsWith('#EXTM3U')

  if (looksLikeM3u8) {
    const reqUrl = new URL(c.req.url)
    const proxyOrigin = `${reqUrl.protocol}//${reqUrl.host}`
    const rewritten = rewriteManifest(bodyText, url, proxyOrigin)
    return new Response(rewritten, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'access-control-allow-origin': '*',
        'cache-control': 'no-cache',
      },
    })
  }

  // Buffer<ArrayBufferLike> isn't accepted as BodyInit by newer DOM types;
  // copying into a fresh Uint8Array normalizes the underlying buffer type.
  const body = Uint8Array.from(upstream.body)
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    },
  })
})

export default proxy
