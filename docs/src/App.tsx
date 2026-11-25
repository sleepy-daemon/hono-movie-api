import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { collectEndpoints, fetchOpenApi, type Endpoint, type OpenAPIDoc } from './api'
import { Sidebar } from './components/Sidebar'
import { EndpointView } from './components/EndpointView'
import { Overview } from './components/Overview'
import { RequestPanel } from './components/RequestPanel'
import { TopBar } from './components/TopBar'
import { CommandPalette } from './components/CommandPalette'
import { MobileDrawer } from './components/MobileDrawer'

type Route = { kind: 'overview' } | { kind: 'endpoint'; id: string }

function parseHash(hash: string, endpoints: Endpoint[]): Route {
  const h = hash.replace(/^#/, '')
  if (h === '' || h === 'overview') return { kind: 'overview' }
  const ep = endpoints.find((e) => e.id === h)
  return ep ? { kind: 'endpoint', id: ep.id } : { kind: 'overview' }
}

function useScrollProgress(target: Element | null) {
  const [p, setP] = useState(0)
  useEffect(() => {
    if (!target) return
    function onScroll() {
      const max = Math.max(1, target!.scrollHeight - target!.clientHeight)
      setP(Math.min(1, Math.max(0, target!.scrollTop / max)))
    }
    target.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => target.removeEventListener('scroll', onScroll)
  }, [target])
  return p
}

export default function App() {
  const [doc, setDoc] = useState<OpenAPIDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState<Route>({ kind: 'overview' })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null)
  const progress = useScrollProgress(mainEl)

  useEffect(() => {
    let cancelled = false
    fetchOpenApi()
      .then((d) => {
        if (!cancelled) setDoc(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const endpoints = useMemo<Endpoint[]>(() => (doc ? collectEndpoints(doc) : []), [doc])

  // Hash on first paint → route
  useEffect(() => {
    if (!endpoints.length) return
    setRoute(parseHash(window.location.hash, endpoints))
  }, [endpoints])

  // Route → hash + scroll reset
  useEffect(() => {
    const target = route.kind === 'overview' ? '' : `#${route.id}`
    if (window.location.hash !== target) {
      window.history.replaceState(null, '', target || window.location.pathname)
    }
    mainEl?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [route, mainEl])

  // Global shortcuts: Cmd/Ctrl+K opens palette, `/` focuses palette too.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      const isTyping =
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (!mod && !isTyping && e.key === '/') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeEndpoint = useMemo(
    () => (route.kind === 'endpoint' ? endpoints.find((e) => e.id === route.id) ?? null : null),
    [route, endpoints],
  )
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const selectEndpoint = (id: string) => {
    setRoute({ kind: 'endpoint', id })
    setDrawerOpen(false)
  }
  const selectOverview = () => {
    setRoute({ kind: 'overview' })
    setDrawerOpen(false)
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md space-y-3 enter-up">
          <h1 className="text-xl font-semibold">Failed to load API spec</h1>
          <p className="mono text-sm text-danger">{error}</p>
          <p className="text-sm text-subtle">
            The docs fetch <code className="mono">/openapi.json</code> from the current origin. Start the API server and reload.
          </p>
        </div>
      </main>
    )
  }

  if (!doc) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-subtle enter">
          <Loader2 className="animate-spin" size={16} aria-hidden />
          <span className="mono text-sm">Loading spec…</span>
        </div>
      </main>
    )
  }

  const sidebar = (
    <Sidebar
      endpoints={endpoints}
      activeId={route.kind === 'endpoint' ? route.id : null}
      isOverview={route.kind === 'overview'}
      onSelect={selectEndpoint}
      onOverview={selectOverview}
      onOpenPalette={() => setPaletteOpen(true)}
    />
  )

  return (
    <div className="min-h-screen">
      {/* Scroll progress bar at top */}
      <div
        className="fixed top-0 left-0 right-0 h-0.5 z-50 origin-left bg-accent/80 shadow-[0_0_8px_rgb(34_197_94/0.6)]"
        style={{ transform: `scaleX(${progress})`, transition: 'transform 60ms linear' }}
        aria-hidden
      />

      <div className="lg:flex">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">{sidebar}</div>

        {/* Main + right panel */}
        <div className="flex-1 min-w-0 lg:h-screen lg:overflow-hidden flex flex-col">
          <TopBar
            endpoint={activeEndpoint}
            isOverview={route.kind === 'overview'}
            onOpenMenu={() => setDrawerOpen(true)}
            onOpenPalette={() => setPaletteOpen(true)}
            onOverview={selectOverview}
          />
          <div
            ref={setMainEl}
            data-main-scroll
            className="flex-1 overflow-y-auto scrollarea"
          >
            {route.kind === 'overview' ? (
              <Overview doc={doc} endpoints={endpoints} baseUrl={baseUrl} onSelect={selectEndpoint} />
            ) : activeEndpoint ? (
              <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:gap-0">
                <div className="min-w-0">
                  <EndpointView doc={doc} endpoint={activeEndpoint} baseUrl={baseUrl} />
                </div>
                <aside className="xl:border-l xl:border-border/60 px-6 lg:px-10 xl:px-6 py-10 xl:sticky xl:top-0 xl:self-start xl:h-[calc(100vh-3rem)] xl:overflow-y-auto scrollarea">
                  <div className="space-y-3 mb-4">
                    <div className="mono text-2xs uppercase tracking-wider text-subtle font-semibold">Request</div>
                  </div>
                  <RequestPanel endpoint={activeEndpoint} baseUrl={baseUrl} />
                </aside>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {sidebar}
      </MobileDrawer>

      {/* Command palette */}
      <CommandPalette
        endpoints={endpoints}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={selectEndpoint}
        onOverview={selectOverview}
      />
    </div>
  )
}
