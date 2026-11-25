// Minimal OpenAPI 3.1 types — just the subset this docs app reads. Not a full
// typegen; a hand-written spec plus a docs UI doesn't need one.

export type OpenAPISchema = {
  type?: string | string[]
  format?: string
  description?: string
  enum?: unknown[]
  const?: unknown
  minimum?: number
  maximum?: number
  default?: unknown
  pattern?: string
  maxLength?: number
  items?: OpenAPISchema
  properties?: Record<string, OpenAPISchema>
  required?: string[]
  additionalProperties?: boolean | OpenAPISchema
  oneOf?: OpenAPISchema[]
  anyOf?: OpenAPISchema[]
  allOf?: OpenAPISchema[]
  example?: unknown
  $ref?: string
}

export type OpenAPIParameter = {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required?: boolean
  description?: string
  schema?: OpenAPISchema
}

export type OpenAPIResponse = {
  description?: string
  content?: Record<string, { schema?: OpenAPISchema; example?: unknown }>
}

export type OpenAPIOperation = {
  tags?: string[]
  summary?: string
  description?: string
  operationId?: string
  parameters?: OpenAPIParameter[]
  responses?: Record<string, OpenAPIResponse>
  requestBody?: {
    required?: boolean
    content?: Record<string, { schema?: OpenAPISchema }>
  }
  deprecated?: boolean
}

export type OpenAPIPathItem = Partial<Record<string, OpenAPIOperation>> & {
  parameters?: OpenAPIParameter[]
}

export type OpenAPIDoc = {
  openapi?: string
  info: { title: string; version: string; description?: string }
  servers?: { url: string; description?: string }[]
  tags?: { name: string; description?: string }[]
  paths: Record<string, OpenAPIPathItem>
  components?: { schemas?: Record<string, OpenAPISchema> }
}

export type Endpoint = {
  id: string
  method: string
  path: string
  op: OpenAPIOperation
}

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const

export function collectEndpoints(doc: OpenAPIDoc): Endpoint[] {
  const out: Endpoint[] = []
  for (const [p, item] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const op = (item as Record<string, OpenAPIOperation | undefined>)[method]
      if (!op) continue
      out.push({
        id: `${method}-${p}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
        method: method.toUpperCase(),
        path: p,
        op,
      })
    }
  }
  return out
}

/** Follow a single $ref in #/components/schemas/<Name>. */
export function resolveRef(doc: OpenAPIDoc, ref: string): OpenAPISchema | null {
  const m = /^#\/components\/schemas\/(.+)$/.exec(ref)
  if (!m) return null
  return doc.components?.schemas?.[m[1]] ?? null
}

/** Walk oneOf/anyOf/allOf and single $refs into a flat concrete schema. */
export function dereference(doc: OpenAPIDoc, schema: OpenAPISchema | undefined, depth = 0): OpenAPISchema | null {
  if (!schema || depth > 8) return schema ?? null
  if (schema.$ref) return dereference(doc, resolveRef(doc, schema.$ref) ?? undefined, depth + 1)
  return schema
}

export function tagOf(ep: Endpoint): string {
  const t = ep.op.tags?.[0]
  if (t) return t
  const seg = ep.path.split('/').filter(Boolean)[0] ?? 'root'
  return seg.charAt(0).toUpperCase() + seg.slice(1)
}

export async function fetchOpenApi(): Promise<OpenAPIDoc> {
  const url = new URL('/openapi.json', window.location.origin).toString()
  const r = await fetch(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`Failed to load openapi.json (${r.status})`)
  return r.json()
}

/** Build a plain-English or curl-friendly URL preview for an endpoint. */
export function buildUrl(baseUrl: string, path: string, values: Record<string, string>): string {
  let url = path
  const query: [string, string][] = []
  for (const [name, val] of Object.entries(values)) {
    if (!val) continue
    const placeholder = `{${name}}`
    if (url.includes(placeholder)) {
      url = url.replaceAll(placeholder, encodeURIComponent(val))
    } else {
      query.push([name, val])
    }
  }
  const qs = query.length ? '?' + new URLSearchParams(query).toString() : ''
  return `${baseUrl.replace(/\/$/, '')}${url}${qs}`
}
