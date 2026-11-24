interface Entry<T> { value: T; expiresAt: number }

const MAX_ENTRIES = 1000
const SWEEP_INTERVAL_MS = 5 * 60_000

// Map preserves insertion order; re-inserting on read makes it an LRU.
const store = new Map<string, Entry<unknown>>()

export function set<T>(key: string, value: T, ttlHours = 1): void {
  store.delete(key)
  store.set(key, { value, expiresAt: Date.now() + ttlHours * 3_600_000 })
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

export function get<T>(key: string): T | null {
  const entry = store.get(key) as Entry<T> | undefined
  if (!entry) return null
  store.delete(key)
  if (Date.now() > entry.expiresAt) return null
  store.set(key, entry)
  return entry.value
}

/** Drop every entry. Used by tests to isolate cases that share fixed keys. */
export function clear(): void {
  store.clear()
}

function sweep(): void {
  const now = Date.now()
  for (const [key, entry] of store) if (now > entry.expiresAt) store.delete(key)
}

setInterval(sweep, SWEEP_INTERVAL_MS).unref()
