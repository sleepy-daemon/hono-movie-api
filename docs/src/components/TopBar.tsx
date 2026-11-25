import { useEffect, useState } from 'react'
import { Menu, Search as SearchIcon, Github } from 'lucide-react'
import type { Endpoint } from '../api'
import { tagOf } from '../api'
import { MethodBadge } from './ui'

export function TopBar({
  endpoint,
  isOverview,
  onOpenMenu,
  onOpenPalette,
  onOverview,
}: {
  endpoint: Endpoint | null
  isOverview: boolean
  onOpenMenu: () => void
  onOpenPalette: () => void
  onOverview: () => void
}) {
  const [elevated, setElevated] = useState(false)
  useEffect(() => {
    const el = document.querySelector('[data-main-scroll]') as HTMLElement | null
    const target: Element | Window = el ?? window
    function onScroll() {
      const top = el ? el.scrollTop : window.scrollY
      setElevated(top > 8)
    }
    target.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => target.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 glass border-b transition-colors ${
        elevated ? 'border-border/70' : 'border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 px-4 lg:px-6 h-12">
        <button
          type="button"
          onClick={onOpenMenu}
          className="lg:hidden p-1.5 rounded hover:bg-muted transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={16} aria-hidden />
        </button>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 min-w-0 flex-1 text-xs">
          <button
            type="button"
            onClick={onOverview}
            className="mono text-subtle hover:text-fg transition-colors"
          >
            Movie API
          </button>
          {endpoint && !isOverview ? (
            <>
              <span className="text-subtle">/</span>
              <span className="mono text-subtle">{tagOf(endpoint)}</span>
              <span className="text-subtle">/</span>
              <div className="flex items-center gap-2 min-w-0">
                <MethodBadge method={endpoint.method} />
                <code className="mono text-fg truncate">{endpoint.path}</code>
              </div>
            </>
          ) : (
            <>
              <span className="text-subtle">/</span>
              <span className="mono text-fg">Overview</span>
            </>
          )}
        </nav>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onOpenPalette}
            className="p-1.5 rounded hover:bg-muted transition-colors text-subtle hover:text-fg"
            aria-label="Open command palette"
          >
            <SearchIcon size={15} aria-hidden />
          </button>
          <a
            href="https://github.com/sleepy-daemon/hono-movie-api"
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded hover:bg-muted transition-colors text-subtle hover:text-fg"
            aria-label="GitHub repository"
          >
            <Github size={15} aria-hidden />
          </a>
        </div>
      </div>
    </header>
  )
}
