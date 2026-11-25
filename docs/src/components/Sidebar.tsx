import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Home, Search as SearchIcon } from 'lucide-react'
import type { Endpoint } from '../api'
import { tagOf } from '../api'
import { MethodBadge } from './ui'

export function Sidebar({
  endpoints,
  activeId,
  onSelect,
  onOverview,
  isOverview,
  onOpenPalette,
}: {
  endpoints: Endpoint[]
  activeId: string | null
  onSelect: (id: string) => void
  onOverview: () => void
  isOverview: boolean
  onOpenPalette: () => void
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Endpoint[]>()
    for (const e of endpoints) {
      const t = tagOf(e)
      if (!map.has(t)) map.set(t, [])
      map.get(t)!.push(e)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [endpoints])

  const activeGroup = useMemo(() => {
    const active = endpoints.find((e) => e.id === activeId)
    return active ? tagOf(active) : null
  }, [endpoints, activeId])

  // Remember which groups the user manually opened/closed; default them all
  // open on first mount, then only override the group that contains the
  // current endpoint when the user navigates to it.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(groups.map(([t]) => t)))
  useEffect(() => {
    if (activeGroup && !openGroups.has(activeGroup)) {
      setOpenGroups((s) => new Set(s).add(activeGroup))
    }
  }, [activeGroup, openGroups])

  function toggle(tag: string) {
    setOpenGroups((s) => {
      const next = new Set(s)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <aside className="w-full lg:w-72 xl:w-80 lg:flex-shrink-0 lg:h-screen lg:sticky lg:top-0 flex flex-col glass border-r border-border/60">
      <div className="p-4 border-b border-border/60 space-y-3 enter-right">
        <button
          type="button"
          onClick={onOverview}
          className="w-full flex items-baseline gap-2 group focus-visible:outline-none"
          aria-label="Overview"
        >
          <span className="relative inline-flex items-center justify-center w-6 h-6 rounded bg-accent/15 border border-accent/30 flex-shrink-0">
            <span className="absolute inset-0 rounded bg-accent/20 pulse-dot" aria-hidden />
            <span className="relative w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
          </span>
          <span className="mono text-sm font-semibold tracking-tight text-fg group-hover:text-accent transition-colors">
            Movie API
          </span>
          <span className="mono text-2xs text-subtle">v1</span>
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md border border-border bg-card/60 text-left group hover:border-subtle/40 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm text-subtle">
            <SearchIcon size={13} aria-hidden />
            Search anything
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto scrollarea p-2" aria-label="Endpoints">
        <button
          type="button"
          onClick={onOverview}
          data-active={isOverview}
          className="nav-item w-full flex items-center gap-2 px-2 py-2 rounded-md text-left text-fg/80 mb-2"
        >
          <Home size={13} className="text-subtle" aria-hidden />
          <span className="text-sm font-medium">Overview</span>
        </button>

        <ul className="space-y-1 stagger">
          {groups.map(([tag, items]) => {
            const open = openGroups.has(tag)
            return (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => toggle(tag)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-subtle hover:text-fg transition-colors"
                  aria-expanded={open}
                >
                  <span className="mono text-2xs uppercase tracking-wider font-semibold">{tag}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="mono text-2xs text-subtle/70">{items.length}</span>
                    <ChevronDown
                      size={12}
                      className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
                      aria-hidden
                    />
                  </span>
                </button>
                <div className="expand" data-open={open}>
                  <ul className="mt-0.5 space-y-0.5">
                    {items.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(e.id)}
                          data-active={activeId === e.id && !isOverview}
                          className="nav-item w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-fg/80"
                        >
                          <span className="badge-glow">
                            <MethodBadge method={e.method} />
                          </span>
                          <span className="mono text-xs truncate flex-1">{e.path}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="p-3 border-t border-border/60 text-2xs text-subtle flex items-center justify-between">
        <span className="mono flex items-center gap-1.5">
          <span className="relative inline-flex w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-accent/50 pulse-dot" aria-hidden />
            <span className="relative w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
          </span>
          {endpoints.length} endpoints
        </span>
        <a
          href="https://github.com/sleepy-daemon/hono-movie-api"
          target="_blank"
          rel="noreferrer"
          className="hover:text-fg transition-colors"
        >
          GitHub
        </a>
      </div>
    </aside>
  )
}
