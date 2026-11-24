const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/i
const YEAR_RE = /^\d{4}$/
export const MAX_PAGE = 500

export const isSlug = (v: string | undefined): v is string => !!v && SLUG_RE.test(v)
export const isYear = (v: string | undefined): v is string => !!v && YEAR_RE.test(v)

/** Positive integer in [1, max], or null if invalid. */
export function parsePositiveInt(v: string | undefined, max = Number.MAX_SAFE_INTEGER): number | null {
  if (!v || !/^\d+$/.test(v)) return null
  const n = Number(v)
  return n >= 1 && n <= max ? n : null
}

/** Page query param: defaults to 1 when absent, null when invalid. */
export function parsePage(v: string | undefined): number | null {
  return v === undefined || v === '' ? 1 : parsePositiveInt(v, MAX_PAGE)
}
