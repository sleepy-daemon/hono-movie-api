import { useMemo, useState } from 'react'
import { Link as LinkIcon, Copy, Check } from 'lucide-react'
import type { Endpoint, OpenAPIDoc } from '../api'
import { MethodBadge, Pill, Section } from './ui'
import { SchemaView } from './SchemaView'

export function EndpointView({ doc, endpoint, baseUrl }: { doc: OpenAPIDoc; endpoint: Endpoint; baseUrl: string }) {
  const { op } = endpoint
  const params = op.parameters ?? []
  const pathParams = params.filter((p) => p.in === 'path')
  const queryParams = params.filter((p) => p.in === 'query')
  const headerParams = params.filter((p) => p.in === 'header')

  const responses = useMemo(() => Object.entries(op.responses ?? {}).sort(([a], [b]) => a.localeCompare(b)), [op.responses])
  const [activeStatus, setActiveStatus] = useState<string | null>(responses[0]?.[0] ?? null)

  const titleId = `ep-${endpoint.id}`
  const fullPath = `${baseUrl.replace(/\/$/, '')}${endpoint.path}`
  const [copied, setCopied] = useState(false)
  async function copyPath() {
    try {
      await navigator.clipboard.writeText(fullPath)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* noop */
    }
  }

  return (
    <article key={endpoint.id} className="px-6 lg:px-10 py-10 space-y-10 enter-up">
      {/* Endpoint header */}
      <header className="space-y-4">
        <div className="flex items-center gap-2 text-2xs mono uppercase tracking-widest text-subtle">
          <span className="w-1 h-1 bg-accent rounded-full" aria-hidden />
          {op.tags?.[0] ?? 'Endpoint'}
        </div>
        <h1 id={titleId} className="text-3xl lg:text-4xl font-semibold tracking-tight">
          {op.summary ?? endpoint.path}
        </h1>
        {op.description ? <p className="text-subtle leading-relaxed max-w-2xl">{op.description}</p> : null}
        <div className="flex items-center gap-2 flex-wrap pt-2">
          <span className="pop">
            <MethodBadge method={endpoint.method} size="md" />
          </span>
          <button
            type="button"
            onClick={copyPath}
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded border border-border bg-surface hover:border-subtle/40 transition-colors group min-w-0"
            title="Copy full URL"
          >
            <code className="mono text-sm text-fg truncate">{endpoint.path}</code>
            <span className="text-subtle group-hover:text-fg transition-colors flex-shrink-0">
              {copied ? <Check size={12} className="text-accent" aria-hidden /> : <Copy size={12} aria-hidden />}
            </span>
          </button>
          <a href={`#${titleId}`} className="text-subtle hover:text-accent transition-colors" aria-label="Link to this endpoint">
            <LinkIcon size={14} aria-hidden />
          </a>
          {op.deprecated ? <Pill tone="danger">deprecated</Pill> : null}
        </div>
      </header>

      {/* Parameters */}
      {params.length > 0 ? (
        <Section title="Parameters" index={0} id={`ep-${endpoint.id}-params`}>
          <div className="space-y-6">
            {pathParams.length > 0 ? <ParamGroup title="Path" params={pathParams} /> : null}
            {queryParams.length > 0 ? <ParamGroup title="Query" params={queryParams} /> : null}
            {headerParams.length > 0 ? <ParamGroup title="Headers" params={headerParams} /> : null}
          </div>
        </Section>
      ) : null}

      {/* Responses */}
      <Section
        title="Responses"
        index={1}
        id={`ep-${endpoint.id}-responses`}
        right={
          <div className="flex items-center gap-1 flex-wrap">
            {responses.map(([status]) => (
              <button
                type="button"
                key={status}
                onClick={() => setActiveStatus(status)}
                className={`mono text-2xs px-2 py-1 rounded border transition-all duration-200 ${
                  activeStatus === status
                    ? statusColor(status, true)
                    : 'border-border text-subtle hover:text-fg hover:border-subtle/50'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        }
      >
        {responses.map(([status, resp]) =>
          activeStatus === status ? (
            <div key={status} className="space-y-3 enter">
              {resp.description ? <p className="text-sm text-subtle">{resp.description}</p> : null}
              {resp.content
                ? Object.entries(resp.content).map(([mt, c]) => (
                    <div key={mt} className="space-y-2">
                      <div className="mono text-2xs text-subtle">{mt}</div>
                      <div className="card p-4">
                        <SchemaView doc={doc} schema={c.schema} />
                      </div>
                    </div>
                  ))
                : null}
            </div>
          ) : null,
        )}
      </Section>
    </article>
  )
}

function statusColor(status: string, active: boolean): string {
  const base = Number(status.charAt(0))
  if (!active) return 'border-border text-subtle'
  if (base === 2) return 'border-accent text-accent bg-accent/10 shadow-[0_0_10px_-2px_rgb(34_197_94/0.5)]'
  if (base === 4) return 'border-warn text-warn bg-warn/10 shadow-[0_0_10px_-2px_rgb(234_179_8/0.5)]'
  if (base === 5) return 'border-danger text-danger bg-danger/10 shadow-[0_0_10px_-2px_rgb(239_68_68/0.5)]'
  return 'border-subtle text-subtle bg-subtle/10'
}

function ParamGroup({ title, params }: { title: string; params: NonNullable<Endpoint['op']['parameters']> }) {
  return (
    <div>
      <h3 className="mono text-2xs uppercase tracking-wider text-subtle font-semibold mb-2">{title}</h3>
      <div className="card overflow-hidden">
        <ul className="divide-y divide-border/60">
          {params.map((p) => (
            <li key={p.name} className="p-3 space-y-1 hover:bg-muted/30 transition-colors">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="mono text-sm text-fg">{p.name}</span>
                <span className="mono text-xs text-subtle">
                  {Array.isArray(p.schema?.type) ? p.schema!.type!.join(' | ') : p.schema?.type ?? 'string'}
                </span>
                {p.required ? <Pill tone="accent">required</Pill> : <Pill>optional</Pill>}
              </div>
              {p.description ? <p className="text-xs text-subtle leading-relaxed">{p.description}</p> : null}
              {p.schema?.default !== undefined ? (
                <div className="mono text-2xs text-subtle">
                  default: <span className="text-fg">{JSON.stringify(p.schema.default)}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
