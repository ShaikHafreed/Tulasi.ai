// Library search is client-side at current scale — fine for a personal/small
// library, but if scan counts grow large this should move to a server-side
// query (e.g. Supabase `.ilike()` + range/order) instead of filtering the
// full `scans` array in the browser.

export type LibrarySort = 'newest' | 'oldest' | 'name' | 'size'
export type MeasuredFilter = 'all' | 'measured' | 'estimated'
// Presets rather than raw from/to dates — persisting an absolute date range
// in localStorage would silently go stale (e.g. "last 7 days" frozen to a
// week that's no longer recent); a preset re-evaluates against "now" every
// time the Library is opened.
export type DateRangeFilter = 'all' | '7d' | '30d' | '90d'

export interface LibraryPrefs {
  sort: LibrarySort
  measuredFilter: MeasuredFilter
  dateRange: DateRangeFilter
}

const STORAGE_KEY = 'tulasi_library_prefs'

const DEFAULT_PREFS: LibraryPrefs = {
  sort: 'newest',
  measuredFilter: 'all',
  dateRange: 'all',
}

export function getLibraryPrefs(): LibraryPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return DEFAULT_PREFS
  }
}

export function setLibraryPrefs(prefs: LibraryPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function dateRangeToDays(range: DateRangeFilter): number | null {
  if (range === '7d') return 7
  if (range === '30d') return 30
  if (range === '90d') return 90
  return null
}
