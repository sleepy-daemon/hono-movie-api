/**
 * FIFO wake queue for the token pool. The stream handler calls signalNeed()
 * each time it pops a token; the first waiter in the queue (a /wait long-poll
 * or a /needs SSE connection) fires and is removed. One signal wakes one
 * waiter, so N connected userscripts with K stream requests produce K solves,
 * not N*K.
 *
 * Previous design used an EventEmitter which broadcasts to every listener on
 * each emit. That caused over-production when multiple tabs ran the userscript
 * at once: every tab solved a token for every stream request.
 *
 * Signals emitted while the queue is empty are lost by design — the stream
 * endpoint has already returned 503 (or served from pool), and the next drain
 * will signal again.
 */

type Waiter = () => void

// Set preserves insertion order under iteration, so the first entry is the
// oldest-registered waiter → natural FIFO.
const waiters = new Set<Waiter>()

/**
 * Register a resolver to be woken by the next signalNeed() call. Returns an
 * unregister function callers MUST invoke on their own exit paths (timeout,
 * client disconnect, error) to avoid leaving dead entries in the queue.
 */
export function waitForNeed(resolver: Waiter): () => void {
  waiters.add(resolver)
  return () => { waiters.delete(resolver) }
}

/**
 * Wake exactly one waiter. Returns true if someone was woken, false if the
 * queue was empty.
 */
export function signalNeed(): boolean {
  const first = waiters.values().next()
  if (first.done) return false
  waiters.delete(first.value)
  try {
    first.value()
  } catch (err) {
    console.error('[tokenEvents] waiter threw:', err)
  }
  return true
}

/** Number of waiters currently parked in the queue. Used by /health. */
export function pendingWaiters(): number {
  return waiters.size
}

/** Testing hook — drops every registered waiter without waking them. */
export function _resetWaiters(): void {
  waiters.clear()
}
