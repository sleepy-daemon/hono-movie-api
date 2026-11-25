import { Terminal, Zap, Shield, Film, Tv, Search, Code } from 'lucide-react'
import type { OpenAPIDoc, Endpoint } from '../api'
import { tagOf } from '../api'
import { CodeBlock } from './ui'

export function Overview({
  doc,
  endpoints,
  onSelect,
  baseUrl,
}: {
  doc: OpenAPIDoc
  endpoints: Endpoint[]
  onSelect: (id: string) => void
  baseUrl: string
}) {
  const groups = new Map<string, Endpoint[]>()
  for (const e of endpoints) {
    const t = tagOf(e)
    if (!groups.has(t)) groups.set(t, [])
    groups.get(t)!.push(e)
  }

  const quickstartCurl = `curl "${baseUrl}/movies?page=1" | jq`
  const quickstartFetch = `const r = await fetch("${baseUrl}/movies/avengers-endgame")
const { data } = await r.json()
console.log(data.title, data.year)`

  return (
    <article className="max-w-content mx-auto px-6 lg:px-10 py-12 space-y-16 enter-up">
      {/* Hero */}
      <header className="space-y-5 pb-10 border-b border-border/40">
        <div className="flex items-center gap-2 text-2xs mono uppercase tracking-widest text-subtle">
          <span className="w-1 h-1 bg-accent rounded-full pulse-dot" aria-hidden />
          Reference · v{doc.info.version}
        </div>
        <h1 className="text-5xl lg:text-6xl font-semibold tracking-tight leading-tight">
          {doc.info.title}
          <span className="block text-accent/90 text-xl lg:text-2xl mono font-normal mt-3 tracking-normal">
            Hono-powered IDLIX port
          </span>
        </h1>
        {doc.info.description ? (
          <p className="text-lg text-subtle leading-relaxed max-w-2xl">{doc.info.description}</p>
        ) : (
          <p className="text-lg text-subtle leading-relaxed max-w-2xl">
            REST API for movies, series, and video streaming resolution. All endpoints return JSON, no authentication required, CORS open.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSelect(endpoints[0]?.id ?? '')}
          >
            <Terminal size={14} aria-hidden /> Browse endpoints
          </button>
          <a
            href="https://github.com/sleepy-daemon/hono-movie-api"
            target="_blank"
            rel="noreferrer"
            className="btn"
          >
            <Code size={14} aria-hidden /> Source on GitHub
          </a>
          <kbd className="kbd">⌘K</kbd>
          <span className="text-2xs text-subtle">to search</span>
        </div>
      </header>

      {/* Base URL + stats */}
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={<Zap size={14} className="text-accent" aria-hidden />}
          label="Endpoints"
          value={String(endpoints.length)}
          sub="public GET routes"
        />
        <StatCard
          icon={<Film size={14} className="text-info" aria-hidden />}
          label="Resources"
          value={String(groups.size)}
          sub="tag groups"
        />
        <StatCard
          icon={<Shield size={14} className="text-warn" aria-hidden />}
          label="Auth"
          value="none"
          sub="public; CORS open"
        />
      </section>

      {/* Quick start */}
      <Block title="Quick start" subtitle="Hit an endpoint. No signup, no keys. All responses are JSON.">
        <div className="grid gap-4 lg:grid-cols-2">
          <CodeBlock code={quickstartCurl} lang="bash" filename="curl" />
          <CodeBlock code={quickstartFetch} lang="javascript" filename="fetch.ts" />
        </div>
      </Block>

      {/* Base URL */}
      <Block title="Base URL" subtitle="Every endpoint hangs off this origin.">
        <CodeBlock code={baseUrl} lang="http" filename="origin" />
      </Block>

      {/* Response envelope */}
      <Block
        title="Response envelope"
        subtitle="Every response is wrapped in a consistent envelope — check success first, then data (or message on error)."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <CodeBlock
            lang="json"
            filename="200 OK"
            code={`{
  "success": true,
  "data": { ... }
}`}
          />
          <CodeBlock
            lang="json"
            filename="4xx / 5xx"
            code={`{
  "success": false,
  "message": "Reason for failure"
}`}
          />
        </div>
      </Block>

      {/* Conventions */}
      <Block title="Conventions" subtitle="Rules every route follows.">
        <ul className="grid gap-3 md:grid-cols-2">
          <Convention
            icon={<Search size={14} aria-hidden />}
            title="Pagination"
            body={`Pass ?page=1..500. 36 items per page. Older pages return the same shape as the first.`}
          />
          <Convention
            icon={<Tv size={14} aria-hidden />}
            title="Slugs"
            body={`Movie and series slugs look like avengers-endgame — URL-safe, lowercase, hyphenated.`}
          />
          <Convention
            icon={<Shield size={14} aria-hidden />}
            title="Verification"
            body={`Stream endpoints may 503 asking for a Turnstile token. Solve it in a browser and retry with X-Verification-Token.`}
          />
          <Convention
            icon={<Zap size={14} aria-hidden />}
            title="Caching"
            body={`Stream resolutions cache for ~15 minutes server-side. Browse endpoints respond in <200ms.`}
          />
        </ul>
      </Block>

      {/* Groups preview */}
      <Block title="Resources" subtitle="Jump to a group or hit ⌘K to search.">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from(groups.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([tag, items]) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelect(items[0].id)}
                className="card p-4 text-left space-y-2 hover:border-accent/40 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="mono text-xs uppercase tracking-wider text-subtle font-semibold">{tag}</div>
                  <div className="mono text-2xs text-subtle group-hover:text-accent transition-colors">
                    {items.length} {items.length === 1 ? 'route' : 'routes'} →
                  </div>
                </div>
                <div className="mono text-xs text-fg truncate">{items[0].path}</div>
                {items.length > 1 ? (
                  <div className="mono text-2xs text-subtle truncate">+ {items.length - 1} more</div>
                ) : null}
              </button>
            ))}
        </div>
      </Block>
    </article>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="card p-4 space-y-1">
      <div className="flex items-center gap-2 mono text-2xs uppercase tracking-wider text-subtle">
        {icon}
        {label}
      </div>
      <div className="mono text-3xl font-semibold text-fg">{value}</div>
      <div className="text-2xs text-subtle">{sub}</div>
    </div>
  )
}

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-subtle max-w-2xl leading-relaxed">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Convention({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="card p-4 space-y-1.5">
      <div className="flex items-center gap-2 text-fg">
        <span className="text-accent">{icon}</span>
        <span className="mono text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-subtle leading-relaxed">{body}</p>
    </li>
  )
}
