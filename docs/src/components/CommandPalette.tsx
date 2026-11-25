import { useEffect, useMemo, useRef, useState } from 'react'
import { Search as SearchIcon, Home } from 'lucide-react'
import type { Endpoint } from '../api'
import { tagOf } from '../api'
import { MethodBadge } from './ui'

type Item = { id: string; title: string; subtitle: string; method?: string; kind: 'overview' | 'endpoint' }

export function CommandPalette({
  endpoints,
  open,
  onClose,
  onSelect,
  onOverview,
}: {
  endpoints: Endpoint[]
  open: boolean
  onClose: () => void
  onSelect: (id: string) => void
  onOverview: () => void
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      { id: '__overview__', title: 'Overview', subtitle: 'Getting started, auth, conventions', kind: 'overview' },
      ...endpoints.map<Item>((e) => ({
        id: e.id,
        title: e.op.summary ?? e.path,
        subtitle: `${tagOf(e)} · ${e.path}`,
        method: e.method,
        kind: 'endpoint',
      })),
    ]
    const q = query.trim().toLowerCase()
    if (!q) return base.slice(0, 50)
    return base
      .map((it) => {
        const hay = `${it.title} ${it.subtitle} ${it.method ?? ''}`.toLowerCase()
        const score = scoreFuzzy(hay, q)
        return { it, score }
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(({ it }) => it)
  }, [endpoints, query])

  // Reset + focus whenever palette opens.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [open])

  // Clamp cursor when filtered results shrink.
  useEffect(() => {
    if (cursor >= items.length) setCursor(Math.max(0, items.length - 1))
  }, [cursor, items.length])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => Math.min(items.length - 1, c + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => Math.max(0, c - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const it = items[cursor]
        if (!it) return
        if (it.kind === 'overview') onOverview()
        else onSelect(it.id)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, cursor, onClose, onSelect, onOverview])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 enter"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-xl card shadow-2xl overflow-hidden enter-up">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
          <SearchIcon size={15} className="text-subtle flex-shrink-0" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            placeholder="Search endpoints, tags, summaries…"
            className="flex-1 bg-transparent text-fg text-sm placeholder:text-subtle focus:outline-none mono"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="kbd">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto scrollarea py-1" role="listbox">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-subtle">No matches.</li>
          ) : (
            items.map((it, i) => (
              <li key={it.id} role="option" aria-selected={cursor === i}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => {
                    if (it.kind === 'overview') onOverview()
                    else onSelect(it.id)
                    onClose()
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                    cursor === i ? 'bg-accent/10' : 'hover:bg-muted/40'
                  }`}
                >
                  {it.kind === 'overview' ? (
                    <Home size={13} className="text-subtle flex-shrink-0" aria-hidden />
                  ) : (
                    <MethodBadge method={it.method!} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-fg truncate">{it.title}</div>
                    <div className="mono text-2xs text-subtle truncate">{it.subtitle}</div>
                  </div>
                  {cursor === i ? <span className="mono text-2xs text-accent">↵</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="px-3 py-2 border-t border-border/60 flex items-center justify-between text-2xs text-subtle">
          <div className="flex items-center gap-2">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>
            <span>navigate</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="kbd">↵</kbd>
            <span>go to</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="kbd">esc</kbd>
            <span>close</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Lightweight fuzzy score: substring hits win, each matched token adds. */
function scoreFuzzy(haystack: string, needle: string): number {
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle)
  const tokens = needle.split(/\s+/).filter(Boolean)
  let score = 0
  for (const t of tokens) {
    if (haystack.includes(t)) score += 10
  }
  return score
}
