import { EventEmitter } from 'node:events'

/**
 * Intra-process signal bus for the token pool. The stream handler emits
 * `'need'` whenever it pops a token (so a userscript subscribed to
 * `GET /tokens/needs` can mint a replacement on demand). Events emitted while
 * no one is listening are lost — that's correct: the caller has already been
 * served or will retry, and the next drain fires another signal.
 */
export const tokenEvents = new EventEmitter()

// Default listener cap is 10, which warns at the eleventh. One listener per
// connected SSE client, typically 1-2. 32 leaves headroom for a few browser
// tabs without noise.
tokenEvents.setMaxListeners(32)

export type TokenEvent = 'need'
