import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Highlight } from './Highlight'

export function CodeBlock({
  code,
  lang,
  filename,
  tight,
}: {
  code: string
  lang?: string
  filename?: string
  tight?: boolean
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      /* Clipboard denied — swallow; the Copy button stays available. */
    }
  }

  return (
    <div className="card overflow-hidden group">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/70 bg-surface/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono text-2xs text-subtle truncate">{filename ?? lang ?? ''}</span>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-2xs text-subtle hover:text-fg transition-colors"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          <span key={copied ? 'y' : 'n'} className="inline-flex items-center gap-1.5 pop">
            {copied ? <Check size={12} className="text-accent" aria-hidden /> : <Copy size={12} aria-hidden />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </span>
        </button>
      </div>
      <pre
        className={`scrollarea overflow-x-auto mono text-[0.8125rem] leading-relaxed text-fg ${tight ? 'p-2.5' : 'p-3'}`}
      >
        <code>
          <Highlight code={code} lang={lang} />
        </code>
      </pre>
    </div>
  )
}
