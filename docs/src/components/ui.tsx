const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-info/15 text-info border-info/40 shadow-[0_0_8px_-2px_rgb(96_165_250/0.4)]',
  POST: 'bg-accent/15 text-accent border-accent/40 shadow-[0_0_8px_-2px_rgb(34_197_94/0.4)]',
  PUT: 'bg-warn/15 text-warn border-warn/40',
  PATCH: 'bg-warn/15 text-warn border-warn/40',
  DELETE: 'bg-danger/15 text-danger border-danger/40',
  HEAD: 'bg-subtle/15 text-subtle border-subtle/40',
  OPTIONS: 'bg-subtle/15 text-subtle border-subtle/40',
}

export function MethodBadge({ method, size = 'sm' }: { method: string; size?: 'xs' | 'sm' | 'md' }) {
  const cls = METHOD_STYLES[method] ?? 'bg-muted text-subtle border-border'
  const sizeCls =
    size === 'md' ? 'px-2 py-1 text-xs' : size === 'xs' ? 'px-1.5 py-0.5 text-2xs' : 'px-2 py-0.5 text-2xs'
  return (
    <span className={`mono inline-flex items-center rounded border font-semibold uppercase tracking-wider ${sizeCls} ${cls}`}>
      {method}
    </span>
  )
}

export function Pill({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'muted' | 'accent' | 'danger' | 'warn' | 'info'
}) {
  const tones: Record<string, string> = {
    muted: 'bg-muted text-subtle border-border',
    accent: 'bg-accent/15 text-accent border-accent/40',
    danger: 'bg-danger/15 text-danger border-danger/40',
    warn: 'bg-warn/15 text-warn border-warn/40',
    info: 'bg-info/15 text-info border-info/40',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-2xs mono font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Section({
  title,
  children,
  right,
  index,
  id,
}: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
  index?: number
  id?: string
}) {
  const style = index !== undefined ? { animationDelay: `${60 + index * 80}ms` } : undefined
  return (
    <section id={id} className="space-y-3 enter-up scroll-mt-24" style={style}>
      <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-accent" aria-hidden />
          <h2 className="text-xs mono uppercase tracking-wider text-subtle font-semibold">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Empty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center enter">
      <div className="mono text-sm text-subtle max-w-md">{message}</div>
    </div>
  )
}

// Re-export CodeBlock from its dedicated module so existing imports keep working.
export { CodeBlock } from './CodeBlock'
