import { useEffect, useMemo, useState } from 'react'
import { Loader2, Play, RotateCcw } from 'lucide-react'
import type { Endpoint, OpenAPIParameter } from '../api'
import { fullUrl, LANGS, sample, type Lang } from '../lib/codegen'
import { CodeBlock } from './ui'

function headerName(p: OpenAPIParameter) {
  return p.in === 'header' ? p.name : ''
}

/**
 * Sticky right column: live code samples in 4 languages + an inline Try It
 * that runs the request and shows the response underneath. Everything scopes
 * to one endpoint — selecting a new endpoint upstream re-mounts the panel.
 */
export function RequestPanel({ endpoint, baseUrl }: { endpoint: Endpoint; baseUrl: string }) {
  const [lang, setLang] = useState<Lang>('curl')
  const [values, setValues] = useState<Record<string, string>>({})
  const [headers, setHeaders] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ status: number; durationMs: number; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset params whenever the user picks a different endpoint.
  useEffect(() => {
    setValues({})
    setHeaders({})
    setResult(null)
    setError(null)
  }, [endpoint.id])

  // Seed defaults so the generated code sample isn't full of empty placeholders.
  useEffect(() => {
    const seeds: Record<string, string> = {}
    for (const p of endpoint.op.parameters ?? []) {
      if (p.in === 'header') continue
      if (p.schema?.default !== undefined) seeds[p.name] = String(p.schema.default)
    }
    setValues(seeds)
  }, [endpoint.id, endpoint.op.parameters])

  const pathAndQueryParams = useMemo(
    () => (endpoint.op.parameters ?? []).filter((p) => p.in === 'path' || p.in === 'query'),
    [endpoint.op.parameters],
  )
  const headerParams = useMemo(
    () => (endpoint.op.parameters ?? []).filter((p) => p.in === 'header'),
    [endpoint.op.parameters],
  )

  const url = fullUrl(baseUrl, endpoint, values)
  const code = sample(lang, baseUrl, endpoint, values)

  async function run() {
    setLoading(true)
    setError(null)
    setResult(null)
    const t0 = performance.now()
    try {
      const h = new Headers()
      for (const [k, v] of Object.entries(headers)) if (v) h.set(k, v)
      const r = await fetch(url, { method: endpoint.method, headers: h })
      const text = await r.text()
      let body = text
      try {
        body = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        /* Not JSON — show as-is. */
      }
      setResult({ status: r.status, durationMs: Math.round(performance.now() - t0), body })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setValues({})
    setHeaders({})
    setResult(null)
    setError(null)
  }

  return (
    <div className="space-y-4 enter-up">
      {/* Language tabs */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-border/60 bg-surface/80 w-fit">
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLang(l.id)}
            className={`px-2.5 py-1 rounded mono text-2xs font-medium transition-all ${
              lang === l.id ? 'bg-muted text-fg shadow-[0_1px_0_0_rgb(255_255_255_/_0.06)_inset]' : 'text-subtle hover:text-fg'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Code sample */}
      <CodeBlock code={code} lang={lang === 'curl' ? 'bash' : lang === 'python' ? 'python' : 'javascript'} filename={lang} />

      {/* Inline Try It */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="mono text-2xs uppercase tracking-wider text-subtle font-semibold">Try it</h3>
          {pathAndQueryParams.length + headerParams.length > 0 ? (
            <button type="button" onClick={reset} className="text-2xs text-subtle hover:text-fg inline-flex items-center gap-1 transition-colors">
              <RotateCcw size={10} aria-hidden /> Reset
            </button>
          ) : null}
        </div>
        {pathAndQueryParams.length === 0 && headerParams.length === 0 ? (
          <div className="text-xs text-subtle">No parameters.</div>
        ) : (
          <div className="space-y-2.5">
            {pathAndQueryParams.map((p) => (
              <ParamInput
                key={`${p.in}-${p.name}`}
                param={p}
                value={values[p.name] ?? ''}
                onChange={(v) => setValues((s) => ({ ...s, [p.name]: v }))}
              />
            ))}
            {headerParams.map((p) => (
              <ParamInput
                key={`${p.in}-${p.name}`}
                param={p}
                value={headers[headerName(p)] ?? ''}
                onChange={(v) => setHeaders((s) => ({ ...s, [headerName(p)]: v }))}
              />
            ))}
          </div>
        )}
        <button type="button" className="btn btn-primary w-full" onClick={run} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
          {loading ? 'Sending request…' : 'Send request'}
        </button>
      </div>

      {error ? (
        <div className="rounded border border-danger/40 bg-danger/10 text-danger px-3 py-2 text-sm enter-up" role="alert">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-2 enter-up">
          <div className="flex items-center gap-3 text-xs mono">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${
                result.status < 400
                  ? 'bg-accent/10 border-accent/40 text-accent shadow-[0_0_10px_-2px_rgb(34_197_94/0.5)]'
                  : 'bg-danger/10 border-danger/40 text-danger shadow-[0_0_10px_-2px_rgb(239_68_68/0.5)]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${result.status < 400 ? 'bg-accent' : 'bg-danger'} pulse-dot`}
                aria-hidden
              />
              HTTP {result.status}
            </span>
            <span className="text-subtle">{result.durationMs}ms</span>
            <span className="text-subtle">{formatBytes(new Blob([result.body]).size)}</span>
          </div>
          <CodeBlock code={result.body} lang="json" filename="response.json" />
        </div>
      ) : null}
    </div>
  )
}

function ParamInput({ param, value, onChange }: { param: OpenAPIParameter; value: string; onChange: (v: string) => void }) {
  const id = `param-${param.in}-${param.name}`
  const placeholder =
    param.schema?.default !== undefined
      ? String(param.schema.default)
      : param.schema?.example !== undefined
        ? String(param.schema.example)
        : ''
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-xs mono">
        <span className="flex items-center gap-1.5">
          <span className="text-fg">{param.name}</span>
          <span className="text-subtle text-2xs">{param.in}</span>
        </span>
        {param.required ? <span className="text-accent text-2xs">required</span> : null}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || '—'}
        className="w-full px-2.5 py-1.5 rounded border border-border bg-surface text-fg mono text-xs focus:border-accent focus:bg-card transition-colors"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
