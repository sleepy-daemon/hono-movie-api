import type { Endpoint, OpenAPIParameter } from '../api'

export type Lang = 'curl' | 'fetch' | 'node' | 'python'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JavaScript' },
  { id: 'node', label: 'Node' },
  { id: 'python', label: 'Python' },
]

function headerPairs(params: OpenAPIParameter[]): [string, string][] {
  return params
    .filter((p) => p.in === 'header')
    .map<[string, string]>((p) => [p.name, p.schema?.example ? String(p.schema.example) : `<${p.name.toLowerCase()}>`])
}

function substitutePath(path: string, values: Record<string, string>): string {
  return path.replaceAll(/\{(\w+)\}/g, (_m, name) => encodeURIComponent(values[name] ?? `{${name}}`))
}

function queryString(params: OpenAPIParameter[], values: Record<string, string>): string {
  const q = params
    .filter((p) => p.in === 'query')
    .map((p) => [p.name, values[p.name] ?? ''] as [string, string])
    .filter(([, v]) => v !== '')
  return q.length ? '?' + new URLSearchParams(q).toString() : ''
}

export function fullUrl(baseUrl: string, endpoint: Endpoint, values: Record<string, string>): string {
  const params = endpoint.op.parameters ?? []
  return `${baseUrl.replace(/\/$/, '')}${substitutePath(endpoint.path, values)}${queryString(params, values)}`
}

export function sample(lang: Lang, baseUrl: string, endpoint: Endpoint, values: Record<string, string>): string {
  const url = fullUrl(baseUrl, endpoint, values)
  const method = endpoint.method
  const headers = headerPairs(endpoint.op.parameters ?? [])

  switch (lang) {
    case 'curl': {
      const parts = [`curl -X ${method}`, `"${url}"`]
      for (const [k, v] of headers) parts.push(`-H "${k}: ${v}"`)
      return parts.join(' \\\n  ')
    }
    case 'fetch': {
      const headerLines = [`"accept": "application/json"`, ...headers.map(([k, v]) => `"${k}": "${v}"`)].join(',\n    ')
      return `const r = await fetch("${url}", {
  method: "${method}",
  headers: {
    ${headerLines}
  }
})
const data = await r.json()`
    }
    case 'node': {
      const headerLines = [`accept: "application/json"`, ...headers.map(([k, v]) => `"${k}": "${v}"`)].join(',\n    ')
      return `import { request } from "undici"

const { body, statusCode } = await request("${url}", {
  method: "${method}",
  headers: {
    ${headerLines}
  }
})
const data = await body.json()
console.log(statusCode, data)`
    }
    case 'python': {
      const headerDict = [`"accept": "application/json"`, ...headers.map(([k, v]) => `"${k}": "${v}"`)].join(',\n    ')
      return `import requests

r = requests.${method.toLowerCase()}(
  "${url}",
  headers={
    ${headerDict}
  },
)
r.raise_for_status()
data = r.json()`
    }
  }
}
